/*
 * dwgDesigner/dwgControlsPanelUI.js
 *
 * Client-side UI controller for the Dwg Controls Panel — opened by the
 * Designer main menu's "Create/Edit Dwg" button (see
 * dwgDesigner/dwgControlsPanel.js for the dispatch-side handler, and
 * responseHandlers.js's onItemClick callback for the click-triggered call
 * into show() below).
 *
 * Unlike the panel's earlier bespoke-canvas design, the preview (right
 * side) is driven by a genuinely wire-protocol-faithful virtual
 * connection: selecting a dwg fires a real `{.}` request, the swapped-in
 * DwgDesignerVirtualDevice (dwgDesigner/dwgDesignerAdapter.js,
 * dwgDesigner/dwgWireEncoder.js) answers with a real one-item pfod main
 * menu, and the existing, UNMODIFIED responseHandlers.js:_navigateToMenu
 * pipeline takes it from there exactly as it would for any real device
 * menu-with-a-dwg screen — auto-fetching the dwg's data (and any nested
 * insertDwg children) with a real `{<loadCmd>}` request/response cycle.
 * See _renderPreview()'s own comment. The dwg list/action buttons live
 * in a fixed-width
 * static sidebar, #dcp-left-panel (pfodCommon.html, styled in
 * pfodCommon.css) — a new sibling placed BEFORE #canvas-pane in
 * #layout-container, analogous to #side-panel (the message/chart-config
 * viewer's own sidebar) but on the left and fixed-width, not resizable.
 * Both #dcp-left-panel and #canvas-pane are pinned to 500px each (1000px
 * total) by show()/hide() below, matching every other screen's own
 * ~500px natural minimum width — see #dcp-left-panel's CSS comment for
 * why that can't just be body.<mode> CSS.
 *
 * Load Dwg is wired to the real DwgLibrary/validateAndRepairDwg pipeline
 * (dwgDesigner/dwgLibrary.js, dwgDesigner/dwgValidate.js) — a clean file
 * loads straight in; a file with problems shows the "Load Dwg —
 * Validation Errors" view (matching alt-a-mockup.html) before anything
 * is saved. Every other action-row button (Create Dwg, Edit, Copy,
 * Export Dwg, Generate Code, Unload Dwg, Load All Dwgs in Dir) is still
 * a later step — see _notImplemented().
 *
 * Lives under dwgDesigner/ — the dedicated home for all dwg-designer
 * code going forward (see dwgControlsPanel.js's header comment).
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DesignerDwgPanel = (() => {

  // Name of the currently-selected list row (mockup's "selected" row —
  // alt-a-mockup.html's Screen 0b). Drives both the row highlight and
  // which dwg _renderPreview() paints into the preview canvas.
  let _selectedDwgName = null;

  // Single-character wire-protocol identifier used for every preview
  // touchZone command (the {<identifier>~<cmd>...} slot pfodWebMouse.js
  // builds — see setupMenuCanvasListeners's own doc comment) AND as the
  // matching dwg menu item's own cmd in the synthetic menuData
  // _renderPreview() feeds to the real pfodMenuDisplay.show() (which sets
  // window.pfodMenuDisplay._currentMenu to that exact object) — the two
  // must agree so responseHandlers.js's unmodified
  // _resolveLoadCmdFromRequest() can find the entry. Any single value
  // works; it doesn't need to dodge any real dispatch route.
  const PREVIEW_TOUCH_IDENTIFIER = '_';

  // Fixed DwgLibrary name for the Create Dwg screen's in-progress draft —
  // saved/updated on every meaningful field change so the real preview
  // pipeline (_renderPreview) has a genuine dwg to fetch, then either
  // renamed to the user's chosen name (Create) or removed (any other way
  // off the screen). The __dcp__ prefix keeps it out of the way of any
  // real user-chosen name and out of the visible dwg list rendering.
  const CREATE_DWG_DRAFT_NAME = '__dcpCreateDraft__';

  // Same idea as CREATE_DWG_DRAFT_NAME, for the Edit Dwg screen's
  // properties editor: a temporary DwgLibrary entry (this dwg's actual
  // current items + the in-progress x/y/color/refresh/name/description
  // edits) that drives the real preview live, then is either committed
  // (renamed onto the real target name) or discarded, never left behind.
  const EDIT_DWG_DRAFT_NAME = '__dcpEditDraft__';

  // Same idea again, for the Add Item screen: this dwg's REAL current
  // items plus the one new item being configured, appended at the end —
  // drives the real preview live so the new item is shown drawn in place
  // among the dwg's actual content, then is either committed (the new
  // item appended for real onto the target dwg) or discarded.
  const ADD_ITEM_DRAFT_NAME = '__dcpAddItemDraft__';

  // The Edit Dwg item list's press-and-hold "Show" button (_pressShowItem/
  // _releaseShowItem below) needs no draft dwg at all: it targets the
  // ALREADY-displayed real dwg's own loadCmd directly, forcing the device's
  // next fetch of it to answer with a genuine pfod "update" ({+|h`N} or
  // {+|uh`N}/{+|h~cN} etc — see DwgDesignerVirtualDevice.forceNextUpdate)
  // instead of a full "start" — exactly how a real device would answer a
  // transient visibility toggle. drawingDataProcessor.js's 'update' branch
  // patches the existing item in place, so every other item's own DOM/
  // canvas state is left untouched (no flash).

  // Saved real-Designer connectionManager.adapter/protocol +
  // drawingViewer.protocol, set by _switchToDwgDesignerAdapter() while
  // the panel is open and restored by _restoreDesignerAdapter(). null
  // when not currently swapped (panel closed / not yet opened).
  let _savedAdapter = null;
  let _savedConnectionProtocol = null;
  let _savedViewerProtocol = null;

  // Reused across show() calls once constructed — no per-dwg state, so
  // one instance is enough for the whole session.
  let _dwgDesignerAdapter = null;

  /// Get the persistent left-panel root — a static element in
  /// pfodCommon.html (#dcp-left-panel), analogous to #side-panel. Its
  /// *contents* are rebuilt on every show()/_refresh() call (see
  /// _renderMainView) so the dwg list stays current.
  function _getRoot() {
    return document.getElementById('dcp-left-panel');
  }

  /// Render the normal Dwg Controls Panel list/actions view into root
  /// (#dcp-left-panel), replacing whatever was there (e.g. a previous
  /// Validation Errors view), and repaint the preview on the real
  /// #canvas-pane via _renderPreview(). Rebuilt from
  /// DesignerState.listDwgNames() every call so a just-completed Load
  /// Dwg is reflected immediately.
  function _renderMainView(root) {
    const dwgNames = (typeof DesignerState !== 'undefined' && DesignerState.listDwgNames)
      ? DesignerState.listDwgNames() : [];
    const hasDwgs = dwgNames.length > 0;

    // Default to the first dwg selected once there's at least one —
    // matches the mockup showing a row pre-selected — and clear the
    // selection if it no longer exists (e.g. after Unload, once that's
    // wired up).
    if (hasDwgs && dwgNames.indexOf(_selectedDwgName) === -1) {
      _selectedDwgName = dwgNames[0];
    } else if (!hasDwgs) {
      _selectedDwgName = null;
    }

    const listHtml = _buildListHtml(dwgNames);

    // Selection-row buttons (Edit/Copy/Export Dwg/Generate Code/Unload Dwg)
    // act on an existing dwg, so they're disabled whenever none are loaded
    // yet — enabled once DesignerState.listDwgNames() reports at least one.
    // Create Dwg/Load Dwg/Load All Dwgs need no existing dwg, so they're
    // always enabled.
    const disabledAttr = hasDwgs ? '' : ' disabled';

    root.innerHTML =
      '<div class="dcp-back-row">' +
        '<button type="button" class="dcp-back-link" id="dcp-back-to-menu">&larr; Back to Menu</button>' +
        '<button type="button" class="dcp-back-link dcp-exit" id="dcp-exit-designer">Exit Designer</button>' +
      '</div>' +
      '<h1 class="dcp-title">Dwg Controls Panel</h1>' +
      '<div class="dcp-action-row">' +
        '<button type="button" class="dcp-btn dcp-btn-primary" id="dcp-create-dwg">Create Dwg</button>' +
        '<button type="button" class="dcp-btn" id="dcp-load-dwg">Load Dwg</button>' +
        '<button type="button" class="dcp-btn" id="dcp-export-dwg"' + disabledAttr + '>Export Dwg</button>' +
        '<button type="button" class="dcp-btn" id="dcp-load-all-dwgs">Load All Dwgs in Dir and sub-Dirs</button>' +
        '<button type="button" class="dcp-btn" id="dcp-generate-code"' + disabledAttr + '>Generate Code - Serial</button>' +
      '</div>' +
      listHtml;

    root.querySelector('#dcp-back-to-menu').addEventListener('click', _backToMenu);
    root.querySelector('#dcp-exit-designer').addEventListener('click', _exitDesigner);
    root.querySelector('#dcp-create-dwg').addEventListener('click', () => _renderCreateDwgScreen(root));
    root.querySelector('#dcp-load-dwg').addEventListener('click', () => _startLoadDwg(root));
    root.querySelector('#dcp-load-all-dwgs').addEventListener('click', () => _startLoadAllDwgs(root));
    root.querySelector('#dcp-export-dwg').addEventListener('click', () => _exportDwg());
    root.querySelector('#dcp-generate-code').addEventListener('click', () => _generateCode(_selectedDwgName));
    root.querySelectorAll('.dcp-item-row').forEach((row) => {
      row.addEventListener('click', () => {
        _selectedDwgName = row.getAttribute('data-name');
        _renderMainView(root);
      });
    });
    // Per-row Edit/Copy/Unload icons — replace the old selection-based
    // action-row buttons of the same name. stopPropagation() keeps a
    // click on one of these from also bubbling into the row's own
    // click-to-select handler above.
    root.querySelectorAll('.dcp-item-actions .dcp-mini-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const name = btn.getAttribute('data-name');
        const action = btn.getAttribute('data-action');
        _selectedDwgName = name;
        if (action === 'edit') {
          _renderEditDwgScreen(root, name);
        } else if (action === 'copy') {
          _copyDwg(root);
        } else if (action === 'delete') {
          _unloadDwg(root);
        }
      });
    });

    // The main panel's own row-selection preview is the one place that
    // deliberately stays non-debug — see _renderPreview()'s own doc.
    _renderPreview(_selectedDwgName, false);
  }

  /// Actively render a genuinely empty menu (no items, no prompt) via the
  /// real pfodMenuDisplay.show() — used whenever there's no dwg to
  /// preview (none selected, none in the library, or a selected name
  /// that failed to load), so the right side goes blank instead of
  /// leaving whatever was rendered previously (e.g. a dwg item stuck on
  /// its "Loading drawing…" placeholder from a dwg that's since been
  /// unloaded).
  function _showBlankPreview() {
    window.pfodMenuDisplay.show({
      header: {
        isUpdate: false, bgColor: null,
        promptFormat: { textColor: null, bold: false, italic: false, underline: false,
                        fontSize: 0, flash: false, sound: false },
        title: '', reRequestMs: null, version: ''
      },
      items: [], hasDrawing: false, drawingItems: []
    }, () => {});
    window.drawingViewer.handleResize();
  }

  /// Paint the selected dwg the way a real device menu-with-a-dwg screen
  /// would: tell the swapped-in DwgDesignerVirtualDevice which dwg is now
  /// selected, then fire a genuine `{.}` request through the normal
  /// addToRequestQueue -> processRequestQueue -> connectionManager.send
  /// pipeline — exactly the same call _backToMenu() uses to reach a real
  /// main menu, just targeting the dwgDesigner connection instead of the
  /// real Designer one. The device (dwgDesigner/dwgDesignerAdapter.js)
  /// answers with a real one-item pfod main menu embedding this dwg's
  /// loadCmd; the existing, UNMODIFIED responseHandlers.js:_navigateToMenu
  /// takes it from there — calls pfodMenuDisplay.show(), auto-queues the
  /// `{<loadCmd>}` fetch for the dwg's actual content (which the device
  /// also answers, via dwgWireEncoder.js's encodeDwgStart), and wires up
  /// setupMenuCanvasListeners for the resulting canvas. Nothing here
  /// touches DrawingManager/pfodMenuDisplay directly any more — it's all
  /// real request/response, so insertDwg children auto-fetch and the
  /// touch-backup-restore mechanism's response-driven cleanup applies
  /// uniformly, with zero special-casing needed for this preview.
  ///
  /// @param {string} dwgName
  /// @param {boolean} [debugMode=true] — per dwg-dataflow.md: every
  ///        EDITING screen (Create Dwg, Edit Dwg/Control Panel, Add Item
  ///        once built...) forces DEBUG on so touchZone dashed outlines
  ///        + cmd labels are visible while placing/sizing them — this is
  ///        the default. The ONE exception is the main Dwg Controls
  ///        Panel screen's own row-selection preview, which is meant to
  ///        show exactly what a real device would ("View", not an
  ///        editor) — its own call site passes debugMode=false.
  function _renderPreview(dwgName, debugMode) {
    if (debugMode === undefined) debugMode = true;
    if (!dwgName) {
      _showBlankPreview();
      return;
    }
    const dwg = DwgLibrary.get(dwgName);
    if (!dwg) {
      _showBlankPreview();
      return;
    }

    // See this function's own @param debugMode doc above — every
    // editing screen wants touchZone dashed outlines + cmd labels
    // visible (redraw.js's drawTouchZone gates on this bare global);
    // only the main panel's own "View" preview leaves it off.
    window.DEBUG = debugMode;

    // TEMP DEBUG: confirm this fires with a real dwg, the adapter is
    // swapped in, and the {.} request actually gets queued/sent.
    console.log('[DWG_PREVIEW_DEBUG] _renderPreview dwgName=' + JSON.stringify(dwgName) +
      ' _dwgDesignerAdapter=' + (_dwgDesignerAdapter ? 'set' : 'null') +
      ' connectionManager.protocol=' + JSON.stringify(window.drawingViewer.connectionManager.protocol));

    // Wipe the client's own state for the preview namespace before the device
    // resets its cmd/idx assignment on the next line.  setPreviewDwg() remints
    // every idx from 1 for this cycle, so anything the client still holds under
    // a __dcpPreview__ name — in the live DrawingManager or in the three
    // localStorage caches — describes a DIFFERENT idx space and must not be
    // hydrated back into this one.  See clearPreviewDrawings' own doc
    // (drawingProcessing.js) for what goes wrong when it is.
    window.drawingViewer.clearPreviewDrawings(window.DWG_PREVIEW_KEY_PREFIX);
    _dwgDesignerAdapter.device.setPreviewDwg(dwgName, PREVIEW_TOUCH_IDENTIFIER);
    window.drawingViewer.addToRequestQueue('{.}', null, null, 'mainMenu');
  }

  /// Icon-button group for a dwg-list row — Edit/Copy/Unload, replacing
  /// the old selection-based action-row buttons of the same name (a
  /// click acts on THIS row's dwg directly, not whatever was previously
  /// selected). Reuses the same .dcp-mini-btn styling as the Edit Dwg
  /// screen's per-item row actions.
  function _buildRowActionsHtml(name) {
    const n = _esc(name);
    return '<div class="dcp-item-actions">' +
      '<button type="button" class="dcp-mini-btn dcp-mini-btn-edit" data-name="' + n + '" data-action="edit" title="Edit">&#9998;</button>' +
      '<button type="button" class="dcp-mini-btn dcp-mini-btn-copy" data-name="' + n + '" data-action="copy" title="Copy">&#10697;</button>' +
      '<button type="button" class="dcp-mini-btn dcp-mini-btn-remove" data-name="' + n + '" data-action="delete" title="Unload">&#10005;</button>' +
    '</div>';
  }

  /// Compute the actual wire-message byte size a real device would send
  /// for this dwg's "start" response — a dummy encode-and-measure, not a
  /// stored/cached value, so it always reflects the dwg's CURRENT
  /// content. Reuses the exact same two-phase encoder
  /// (DwgWireEncoder.encodeDwgStart, per the index-placeholder-then-real
  /// send sequence) and cmd/idx resolution
  /// (DwgDesignerVirtualDevice._resolveAutoCmdAndIdx) the real preview
  /// pipeline uses — via a throwaway device instance, so this never
  /// touches the actual preview device's own version cache/auto-cmd
  /// dictionary. Since pfod messages are capped at 1023 bytes, this is
  /// what actually matters to the user, not just a cosmetic stat.
  /// Measured as UTF-8 BYTES (TextEncoder), not .length (UTF-16 code
  /// units) — a label/value's own text could contain non-ASCII
  /// characters that take more than one byte each on the wire.
  /// @param {string} name — DwgLibrary dwg name
  /// @returns {number} byte size, or 0 if the dwg failed to load
  function _computeDwgResponseByteSize(name) {
    const dwg = DwgLibrary.get(name);
    if (!dwg) return 0;
    const tempDevice = new DwgDesignerVirtualDevice();
    const resolved = tempDevice._resolveAutoCmdAndIdx(name, dwg);
    const wire = DwgWireEncoder.encodeDwgStart(resolved, 'v1');
    return new TextEncoder().encode(wire).length;
  }

  /// Build the dwg list markup — matches alt-a-mockup.html's Screen 0b row
  /// format ("<name> — <n> bytes, <x>×<y>, <swatch> · refresh: <refresh>s
  /// · items: <count>"). Reads each entry via DwgLibrary.get() to show
  /// its real dimensions/colour/refresh/item-count/byte-size, not just
  /// its name.
  function _buildListHtml(dwgNames) {
    if (dwgNames.length === 0) {
      return '<div class="dcp-empty">No dwgs yet.</div>';
    }
    const rows = dwgNames.map((name) => {
      const dwg = DwgLibrary.get(name);
      const selectedClass = (name === _selectedDwgName) ? ' dcp-item-selected' : '';
      if (!dwg) {
        // Index lists the name but the entry itself failed to load
        // (corrupt/missing localStorage record) — show it, but plainly.
        return '<div class="dcp-item-row' + selectedClass + '" data-name="' + _esc(name) + '">' +
          '<div class="dcp-item-info"><div class="dcp-item-type"><b>' + _esc(name) + '</b>' +
          ' &mdash; (failed to load)</div><div class="dcp-item-desc"></div></div>' +
          _buildRowActionsHtml(name) + '</div>';
      }
      const swatchHex = _swatchHex(dwg.color);
      // Two lines, matching alt-a-mockup.html's Screen 0b row exactly:
      // .item-type ("<name> — <x>×<y>, <swatch> · refresh: <n>s · items:
      // <count>") then .dwg-desc, a description line. The real dwg
      // schema has no description field yet (dwg-dataflow.md lists it as
      // "worth adding", not built) — the line is still rendered, just
      // blank, so the row's shape/spacing matches Screen 0b now and
      // needs no layout change once a real description exists.
      const description = (typeof dwg.description === 'string') ? dwg.description : '';
      return '<div class="dcp-item-row' + selectedClass + '" data-name="' + _esc(name) + '">' +
        '<div class="dcp-item-info">' +
          '<div class="dcp-item-type">' +
            '<b>' + _esc(name) + '</b>' +
            '<span class="dcp-item-type-suffix"> &mdash; ' + _computeDwgResponseByteSize(name) + ' bytes, ' +
              dwg.x + '&times;' + dwg.y + ', ' +
              '<span class="dcp-swatch" style="background:' + swatchHex + '"></span>' +
              ' &middot; items: ' + (Array.isArray(dwg.items) ? dwg.items.length : 0) +
            '</span>' +
          '</div>' +
          '<div class="dcp-item-desc">' + _esc(description) + '</div>' +
        '</div>' +
        _buildRowActionsHtml(name) +
      '</div>';
    }).join('');
    return '<div class="dcp-list">' + rows + '</div>';
  }

  /// Resolve a colour value to a CSS hex colour for a swatch, reusing
  /// this project's own real colour resolution (redraw.js's
  /// convertColorToHex — the same function the actual canvas renderer
  /// uses, so the swatch always matches what the dwg would really
  /// display as). -1 (BLACK_WHITE mode) has no fixed colour of its own —
  /// it resolves to whichever of black/white contrasts with
  /// `backgroundColorNumber` (redraw.js's own getBlackWhite() luminance
  /// check, the same logic the real renderer uses for BLACK_WHITE items).
  /// Callers describing a dwg's own background swatch (which is never -1
  /// — dwgValidate.js defaults it to 0/Black) can omit the second arg;
  /// callers describing an ITEM's colour (which defaults to -1 when
  /// unset) should pass the enclosing dwg's own background colour so a
  /// BLACK_WHITE item's swatch reflects what it'd actually render as
  /// against that background. Falls back to black on any unexpected
  /// value rather than throwing (convertColorToHex throws on
  /// out-of-range input).
  function _swatchHex(color, backgroundColorNumber) {
    try {
      if (color === -1) {
        // Background may be a numeric palette index OR a 6-digit hex
        // string (this project's own extended colour handling) — both
        // are valid input to convertColorToHex/getBlackWhite, so any
        // non-nullish value passed through is used as-is.
        const bg = (backgroundColorNumber !== undefined && backgroundColorNumber !== null) ? backgroundColorNumber : 0;
        return convertColorToHex(-1, bg);
      }
      return convertColorToHex(color);
    } catch (_) {
      return '#000000';
    }
  }

  /// Placeholder click handler for action-row buttons with no real
  /// screen/implementation yet (Edit, Generate Code — later steps of the
  /// Alt-A Dwg Designer build-out, see dwg-dataflow.md). Logged rather
  /// than silently dead so it's obvious in devtools which action was
  /// attempted.
  function _notImplemented(label) {
    console.log('[DwgControlsPanel] "' + label + '" is not implemented yet.');
  }

  // ── Create Dwg ────────────────────────────────────────────────────

  /// Render alt-a-mockup.html's Screen 1 ("Create Dwg") into root: name/
  /// description/width/height/refresh fields, a background-colour picker
  /// (mirrors clean-edit-screen.html's own color-field/color-popup exactly
  /// — the validated template for this kind of control), and a LIVE
  /// preview in the real right-side preview panel — not a small box on
  /// this form. Per direction ("the updating preview should be the right
  /// preview panel... so need to make a temp dwg to preview and update
  /// and only 'commit' it if Create is clicked, else discard"): every
  /// meaningful field change saves a draft dwg to DwgLibrary under the
  /// fixed CREATE_DWG_DRAFT_NAME, invalidates its cached preview version
  /// (so the device sends a fresh "start" instead of a stale `{+}`), and
  /// re-fires _renderPreview() — the exact same real wire-protocol path
  /// the main screen's row-selection uses. The draft is only made
  /// permanent (renamed to the user's chosen name) if Create is clicked;
  /// every other way off this screen (Cancel, Exit Designer, Load Dwg
  /// from file) removes the draft from the library first.
  function _renderCreateDwgScreen(root) {
    const suggestedName = DwgLibrary.nextFreeName('NewDwg');
    const state = { name: suggestedName, x: 50, y: 85, refresh: 0, color: 0 };

    root.innerHTML =
      '<div class="dcp-back-row">' +
        '<button type="button" class="dcp-back-link" id="dcp-create-cancel">&larr; Back to Dwg Controls Panel</button>' +
        '<button type="button" class="dcp-back-link dcp-exit" id="dcp-exit-designer">Exit Designer</button>' +
      '</div>' +
      '<h1 class="dcp-title">Create Dwg</h1>' +
      '<div class="dcp-field">' +
        '<label>Name</label>' +
        '<input type="text" id="dcp-create-name" value="' + _esc(state.name) + '">' +
      '</div>' +
      '<div class="dcp-field">' +
        '<label>Description <span style="text-transform:none; font-weight:400">(optional)</span></label>' +
        '<textarea id="dcp-create-desc" style="min-height:52px"></textarea>' +
        '<div class="dcp-helper">Shown wherever this dwg is listed, so it\'s findable/reusable later without opening it</div>' +
      '</div>' +
      '<div class="dcp-field-row dcp-num-row">' +
        '<div class="dcp-field"><label>Width (1&ndash;255)</label>' +
          '<input type="number" id="dcp-create-width" value="' + state.x + '" min="1" max="255"></div>' +
        '<div class="dcp-field"><label>Height (1&ndash;255)</label>' +
          '<input type="number" id="dcp-create-height" value="' + state.y + '" min="1" max="255"></div>' +
      '</div>' +
      '<div class="dcp-field">' +
        '<label>Refresh rate (seconds, 0 = no refresh)</label>' +
        '<input type="number" id="dcp-create-refresh" value="0" min="0" max="3600" style="width:70px">' +
      '</div>' +
      '<div class="dcp-field">' +
        '<label>Background colour</label>' +
        '<div class="dcp-color-field" id="dcp-create-color-field">' +
          '<div class="dcp-color-header">' +
            '<span class="dcp-swatch-num">' +
              '<span class="dcp-swatch-lg" id="dcp-create-color-swatch"></span>' +
              '<span class="dcp-num" id="dcp-create-color-num"></span>' +
            '</span>' +
            '<button type="button" class="dcp-color-mode-btn" id="dcp-create-color-toggle">Choose Color</button>' +
          '</div>' +
          '<div class="dcp-color-popup" id="dcp-create-color-popup" style="display:none"></div>' +
        '</div>' +
      '</div>' +
      '<div class="dcp-action-row" style="justify-content:space-between; margin-top:16px">' +
        '<button type="button" class="dcp-btn dcp-btn-ghost" id="dcp-create-load-file">Load Dwg from file&hellip;</button>' +
        '<div style="display:flex; gap:8px">' +
          '<button type="button" class="dcp-btn dcp-btn-ghost" id="dcp-create-cancel-2">Cancel</button>' +
          '<button type="button" class="dcp-btn dcp-btn-primary" id="dcp-create-submit">Create</button>' +
        '</div>' +
      '</div>';

    const nameInput = root.querySelector('#dcp-create-name');
    const widthInput = root.querySelector('#dcp-create-width');
    const heightInput = root.querySelector('#dcp-create-height');

    /// Save the current form state as the draft dwg (fixed name, so
    /// re-saving updates the same library entry rather than accumulating
    /// stray drafts), invalidate its cached preview version, and re-fire
    /// the real preview render — the device (dwgDesignerAdapter.js) sees
    /// the version cache cleared and sends a fresh "start" instead of a
    /// stale `{+}` no-change sentinel.
    function updatePreview() {
      const w = Math.min(255, Math.max(1, parseInt(widthInput.value, 10) || 1));
      const h = Math.min(255, Math.max(1, parseInt(heightInput.value, 10) || 1));
      const raw = {
        name: CREATE_DWG_DRAFT_NAME,
        x: w, y: h,
        refresh: parseInt(root.querySelector('#dcp-create-refresh').value, 10) || 0,
        color: state.color,
      };
      const { dwg } = validateAndRepairDwg(raw, CREATE_DWG_DRAFT_NAME);
      DwgLibrary.saveHidden(dwg);
      _dwgDesignerAdapter.device.invalidatePreviewVersion(CREATE_DWG_DRAFT_NAME);
      _renderPreview(CREATE_DWG_DRAFT_NAME);
    }

    // Width/height inputs update the preview on blur, Enter, or after a
    // 0.5s pause in typing — not on every keystroke (typing "255" digit
    // by digit would otherwise re-fetch the preview through 2, 25, 255).
    let previewDebounce = null;
    function schedulePreviewUpdate() {
      if (previewDebounce) clearTimeout(previewDebounce);
      previewDebounce = setTimeout(updatePreview, 500);
    }
    [widthInput, heightInput].forEach((input) => {
      input.addEventListener('input', schedulePreviewUpdate);
      input.addEventListener('blur', () => {
        if (previewDebounce) { clearTimeout(previewDebounce); previewDebounce = null; }
        updatePreview();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (previewDebounce) { clearTimeout(previewDebounce); previewDebounce = null; }
          updatePreview();
        }
      });
    });

    /// Build the 256-cell colour picker popup once (16 standard + 216-cube
    /// + grayscale, matching clean-edit-screen.html's own color-popup
    /// layout), using the real convertColorToHex (redraw.js) for every
    /// swatch — no BLACK_WHITE option here, same as the mockup's own note
    /// (that's an item-colour-only wrapper, not part of the picker).
    function buildColorPopup() {
      const popup = root.querySelector('#dcp-create-color-popup');
      const sections = [
        { title: 'Standard Colors (0-15)', from: 0, to: 15 },
        { title: '216 Colors (16-231)', from: 16, to: 231 },
        { title: 'Grayscale (232-255)', from: 232, to: 255 },
      ];
      let html = '';
      sections.forEach((section) => {
        html += '<div class="dcp-color-section-title">' + section.title + '</div><div class="dcp-color-row">';
        for (let i = section.from; i <= section.to; i++) {
          html += '<span class="dcp-color-cell" data-color="' + i + '" style="background:' + _swatchHex(i) + '"></span>';
        }
        html += '</div>';
      });
      popup.innerHTML = html;
      popup.querySelectorAll('.dcp-color-cell').forEach((cell) => {
        cell.addEventListener('click', () => {
          state.color = parseInt(cell.getAttribute('data-color'), 10);
          updateColorHeader();
          updatePreview();
          popup.style.display = 'none';
        });
      });
    }

    function updateColorHeader() {
      root.querySelector('#dcp-create-color-swatch').style.background = _swatchHex(state.color);
      root.querySelector('#dcp-create-color-num').textContent = 'Color ' + state.color;
      root.querySelectorAll('#dcp-create-color-popup .dcp-color-cell').forEach((cell) => {
        cell.classList.toggle('dcp-selected', parseInt(cell.getAttribute('data-color'), 10) === state.color);
      });
    }

    buildColorPopup();
    updateColorHeader();
    updatePreview();

    function toggleColorPopup() {
      const popup = root.querySelector('#dcp-create-color-popup');
      popup.style.display = (popup.style.display === 'none') ? 'block' : 'none';
    }
    root.querySelector('#dcp-create-color-toggle').addEventListener('click', toggleColorPopup);
    root.querySelector('#dcp-create-color-swatch').addEventListener('click', toggleColorPopup);

    /// Leaving this screen without clicking Create — discard the draft so
    /// it never lingers in the library or list.
    function discardDraftAndReturn() {
      DwgLibrary.remove(CREATE_DWG_DRAFT_NAME);
      _renderMainView(root);
    }
    root.querySelector('#dcp-create-cancel').addEventListener('click', discardDraftAndReturn);
    root.querySelector('#dcp-create-cancel-2').addEventListener('click', discardDraftAndReturn);
    root.querySelector('#dcp-exit-designer').addEventListener('click', () => {
      DwgLibrary.remove(CREATE_DWG_DRAFT_NAME);
      _exitDesigner();
    });
    root.querySelector('#dcp-create-load-file').addEventListener('click', () => {
      DwgLibrary.remove(CREATE_DWG_DRAFT_NAME);
      _startLoadDwg(root);
    });

    root.querySelector('#dcp-create-submit').addEventListener('click', () => {
      const typedName = (nameInput.value || '').trim();
      if (!typedName) return;
      const name = DwgLibrary.nextFreeName(typedName);
      const raw = {
        name: name,
        description: (root.querySelector('#dcp-create-desc').value || '').trim(),
        x: parseInt(widthInput.value, 10),
        y: parseInt(heightInput.value, 10),
        refresh: parseInt(root.querySelector('#dcp-create-refresh').value, 10),
        color: state.color,
      };
      // validateAndRepairDwg's own defaulting/clamping (matches Load Dwg's
      // own pipeline) — its errors are never shown here: a brand-new
      // dwg's out-of-range/missing fields aren't a real "problem", the
      // form's own min/max already keeps them sane, this just clamps the
      // rare edge case (e.g. a cleared field) to something valid.
      const { dwg } = validateAndRepairDwg(raw, name);
      DwgLibrary.save(dwg);
      DwgLibrary.remove(CREATE_DWG_DRAFT_NAME);
      _selectedDwgName = name;
      _renderMainView(root);
    });
  }

  // ── Edit Dwg ──────────────────────────────────────────────────────

  /// One-line, human-readable type label for an item row — matches
  /// alt-a-mockup.html's Screen 2 item list ("Rectangle", "Text — "Led is
  /// Off""). label/value/insertDwg show a quoted/named detail after the
  /// type name; every other type is bare. This is the BOLD portion of
  /// the row's type line — any touchZone cmd / idxName suffix is built
  /// separately by _itemTypeSuffix() and rendered non-bold, since only
  /// the item type itself should be bold, not its identifying suffix.
  /// The drawingName an insertDwg (or a hide/unhide/erase targeting one)
  /// references that is NOT currently loaded in DwgLibrary — null if this
  /// item doesn't reference a missing dwg at all (including: a hide/
  /// unhide/erase targeting a touchZone instead of an insertDwg, which
  /// shares the same bare `cmdName` field in storage and needs a lookup
  /// against this dwg's OTHER items to disambiguate — see
  /// DwgDesignerVirtualDevice._resolveItemAutoCmdAndIdx's own doc for the
  /// identical disambiguation this mirrors at wire-resolve time). Used to
  /// annotate the Edit Dwg item list row (never to change the item's own
  /// stored data or what gets sent to the live preview — see
  /// dwgDesignerAdapter.js's own _resolveAutoCmdAndIdx for where a
  /// missing reference is kept out of the actual preview).
  /// @param {object} item
  /// @param {object} dwg — the enclosing dwg, for hide/unhide/erase's own
  ///        cmdName -> insertDwg lookup
  /// @returns {string|null}
  function _missingDwgTargetName(item, dwg) {
    if (item.type === 'insertDwg') {
      return (item.drawingName && !DwgLibrary.get(item.drawingName)) ? item.drawingName : null;
    }
    if (item.type === 'hide' || item.type === 'unhide' || item.type === 'erase') {
      if (!item.cmdName) return null;
      const insertItem = (dwg.items || []).find((it) => it.type === 'insertDwg' && it.cmdName === item.cmdName);
      if (!insertItem) return null; // targets a touchZone instead, not a missing-dwg case
      return (insertItem.drawingName && !DwgLibrary.get(insertItem.drawingName)) ? insertItem.drawingName : null;
    }
    return null;
  }

  function _itemTypeLabel(item) {
    switch (item.type) {
      case 'label':     return 'Label — "' + (item.text || '') + '"';
      case 'value':     return 'Value — "' + (item.text || '') + '"';
      case 'insertDwg': return 'insertDwg — ' + (item.drawingName || '');
      // Shown verbatim, NOT capitalized — these are the camelCase wire/type
      // names the Item Type dropdown (ITEM_TYPE_OPTIONS) already lists as-is,
      // so capitalizing them here would make the list and the dropdown
      // disagree about what the same item is called.
      case 'touchZone':
      case 'pushZero':
      case 'popZero':   return item.type;
      default:
        // Capitalize the bare type name (rectangle -> Rectangle).
        return item.type.charAt(0).toUpperCase() + item.type.slice(1);
    }
  }

  /// Non-bold suffix for an item row's type line, rendered right after
  /// _itemTypeLabel()'s bold type name: a touchZone's bare cmdName (no
  /// "cmd:" prefix — "touchZone A", not "touchZone cmd:A"), then the
  /// idxName (again bare, no "idx:" label — "Line idx_1"), whichever
  /// apply, space-separated. Applies uniformly whether the item is
  /// declaring its own index (a Line/Rectangle/etc marked indexed) or
  /// targeting one (a Hide/Unhide/Erase item's `.idxName` names which
  /// OTHER item it acts on).
  ///
  /// Displays ONLY cmdName/idxName — never the raw cmd/idx, not even as
  /// a fallback. cmd/idx are wire-encode-time-only values, regenerated
  /// fresh on every send (DwgDesignerVirtualDevice._resolveAutoCmdAndIdx)
  /// and stripped from storage whenever a name exists to regenerate them
  /// from (dwgLibrary.js's _stripRegenerableWireFields) — they carry no
  /// meaning worth showing the user; cmdName/idxName are the only stable,
  /// user-facing identity.
  function _itemTypeSuffix(item) {
    const parts = [];
    if (item.type === 'touchZone' && item.cmdName) parts.push(item.cmdName);
    if (item.idxName) parts.push(item.idxName);
    return parts.join(' ');
  }

  /// One-line technical detail string for an item row (colour swatch +
  /// number + key numeric fields), matching alt-a-mockup.html Screen 2's
  /// monospace .item-detail line style exactly (swatch, then the colour
  /// NUMBER itself, e.g. "[swatch]7 · size(50,85) · offset(0,0)" — not
  /// just a bare swatch). Field names are DwgLibrary's real, already-
  /// validated ones (dwgValidate.js's DWG_ITEM_FIELD_SCHEMA) — not the
  /// aspirational dwg-dataflow.md names. idx/idxName are shown on the
  /// TYPE label instead (_itemTypeLabel), not here.
  ///
  /// insertDwg's own cmd-target, and hide/unhide/erase's cmd-target, show
  /// ONLY cmdName — never the raw cmd, not even as a fallback (see
  /// _itemTypeSuffix's own doc for why: cmd is wire-encode-time-only,
  /// regenerated fresh on every send and stripped from storage whenever
  /// a cmdName exists).
  ///
  /// @param {object} item
  /// @param {number} bgColor — the enclosing dwg's own background colour
  ///        (dwg.color), needed to resolve an item colour of -1
  ///        (BLACK_WHITE mode) to the actual black-or-white it'd render
  ///        as against that background (see _swatchHex's own doc).
  function _describeItem(item, bgColor) {
    const segments = [];
    if (typeof item.color !== 'undefined') {
      segments.push('<span class="dcp-swatch" style="background:' + _swatchHex(item.color, bgColor) + '"></span>' + (item.color === -1 ? 'BW' : item.color));
    }
    switch (item.type) {
      case 'rectangle':
      case 'line':
        segments.push('size(' + item.xSize + ',' + item.ySize + ')', 'offset(' + item.xOffset + ',' + item.yOffset + ')');
        break;
      case 'circle':
        segments.push('radius ' + item.radius, 'offset(' + item.xOffset + ',' + item.yOffset + ')');
        break;
      case 'arc':
        segments.push('radius ' + item.radius, 'start ' + item.start, 'angle ' + item.angle,
          'offset(' + item.xOffset + ',' + item.yOffset + ')');
        break;
      case 'label':
      case 'value':
        segments.push('size:' + item.fontSize, 'offset(' + item.xOffset + ',' + item.yOffset + ')', 'align:' + item.align);
        break;
      case 'touchZone':
        // cmd now shown on the type line via _itemTypeSuffix() instead.
        segments.push('size(' + item.xSize + ',' + item.ySize + ')', 'offset(' + item.xOffset + ',' + item.yOffset + ')');
        break;
      case 'insertDwg':
        segments.push('cmd:' + (item.cmdName || ''), 'offset(' + item.xOffset + ',' + item.yOffset + ')');
        break;
      case 'hide':
      case 'unhide':
      case 'erase':
        // Targeted by EITHER idxName or cmdName (drawingDataProcessor.js:551,
        // in terms of the resolved idx/cmd this ultimately becomes) —
        // idxName (if present) is shown on the type label instead, so
        // only add cmd here when there's no idxName to target by instead.
        if (!item.idxName) segments.push('cmd:' + (item.cmdName || ''));
        break;
      case 'pushZero':
        segments.push('x:' + item.x, 'y:' + item.y, 'scale:' + item.scale);
        break;
      // 'index'/'popZero'/'touchAction'/'touchActionInput': no extra fields here.
    }
    return segments.join(' · ');
  }

  /// One-line detail string for a touchActionInput row — prompt text,
  /// plus which indexed label/value it updates (if any).
  /// @param {object} item — a touchActionInput-shaped object (prompt,
  ///        idxName, color)
  /// @returns {string}
  function _describeTouchActionInput(item) {
    const parts = ['"' + (item.prompt || '') + '"'];
    if (item.idxName) parts.push('updates ' + item.idxName);
    return parts.join(' · ');
  }

  /// Build the embedded touchActionInput/touchActions list HTML for a
  /// Touch Zone Add/Edit Item screen — alt-a-mockup.html Screen 3m's own
  /// list (the "old standalone Touch Actions Manager screen" it
  /// replaces): a single touchActionInput row (either its own summary +
  /// edit/remove, or "No touchActionInput" + "+ Add"), one row per
  /// touchAction (summary of its own action[0] — the item that draws
  /// instead of the target idx while the zone is being touched — + edit/
  /// remove), then a trailing "+ Add another touchAction" row. Shared by
  /// both Add and Edit Item screens; `idPrefix` keeps the two screens'
  /// element ids distinct ("dcp-additem"/"dcp-edititem"), matching every
  /// other id in this file. Edit/remove buttons on touchAction rows carry
  /// their array index as a data attribute (a variable-length list, wired
  /// via one delegated listener per action, not one id per row).
  /// @param {string} idPrefix
  /// @param {object} touchZoneState — { touchActionInput, touchActions }
  /// @param {object} dwg — for _describeItem's own background-colour param
  /// @param {boolean} [disableAdds] — grey out BOTH add affordances (the
  ///        touchActionInput "+ Add" button and the trailing "+ Add another
  ///        touchAction" row).  Set by the ADD Item screen: a touchAction /
  ///        touchActionInput attaches to a touchZone that does not exist in
  ///        the dwg yet, so neither can be created until the zone itself has
  ///        been added.  The EDIT Item screen leaves both enabled — there the
  ///        touchZone is already a real item.  Existing rows keep their own
  ///        edit/remove buttons either way, so a resumed draft can still be
  ///        cleaned up.
  /// @returns {string}
  function _buildTouchZoneItemsListHtml(idPrefix, touchZoneState, dwg, disableAdds) {
    // Same wording on both, so the greyed control explains itself on hover.
    const addsDisabledTitle = 'Add the touchZone first, then Edit it to add this';
    const inputRow = touchZoneState.touchActionInput
      ? '<div class="dcp-edit-item-row">' +
          '<div class="dcp-edit-item-info">' +
            '<div class="dcp-edit-item-type"><b>touchActionInput</b></div>' +
            '<div class="dcp-edit-item-detail">' + _esc(_describeTouchActionInput(touchZoneState.touchActionInput)) + '</div>' +
          '</div>' +
          '<div class="dcp-edit-item-actions">' +
            '<button type="button" class="dcp-mini-btn dcp-mini-btn-edit" id="' + idPrefix + '-touchactioninput-edit" title="Edit">&#9998;</button>' +
            '<button type="button" class="dcp-mini-btn dcp-mini-btn-remove" id="' + idPrefix + '-touchactioninput-remove" title="Remove">&#10005;</button>' +
          '</div>' +
        '</div>'
      : '<div class="dcp-edit-item-row">' +
          '<div class="dcp-edit-item-info"><div class="dcp-empty">No touchActionInput</div></div>' +
          '<div class="dcp-edit-item-actions">' +
            '<button type="button" class="dcp-btn dcp-btn-ghost" id="' + idPrefix + '-touchactioninput-add"' +
              (disableAdds ? ' disabled title="' + addsDisabledTitle + '"' : '') +
              ' style="padding:4px 10px; font-size:11px">+ Add</button>' +
          '</div>' +
        '</div>';

    const actionRows = touchZoneState.touchActions.map((action, i) => {
      const target = (action && Array.isArray(action.action) && action.action[0]) || { type: '?' };
      // "idx_2 replaces Value" — the ORIGINAL item idxName currently
      // names, so it's clear at a glance what disappears while this
      // touchAction is active, not just what appears.
      const originalItem = (dwg.items || []).find((it) => it.idxName === target.idxName);
      const replacesSuffix = (originalItem && originalItem.type)
        ? ' replaces ' + originalItem.type.charAt(0).toUpperCase() + originalItem.type.slice(1)
        : '';
      return '<div class="dcp-edit-item-row">' +
        '<div class="dcp-edit-item-info">' +
          '<div class="dcp-edit-item-type"><b>' + _esc(_itemTypeLabel(target)) + '</b> ' +
            '<span class="dcp-edit-item-type-suffix">' + _esc((target.idxName || '') + replacesSuffix) + '</span></div>' +
          '<div class="dcp-edit-item-detail">' + _describeItem(target, dwg.color) + '</div>' +
        '</div>' +
        '<div class="dcp-edit-item-actions">' +
          '<button type="button" class="dcp-mini-btn dcp-mini-btn-edit dcp-touchaction-edit-btn" data-index="' + i + '" title="Edit">&#9998;</button>' +
          '<button type="button" class="dcp-mini-btn dcp-mini-btn-remove dcp-touchaction-remove-btn" data-index="' + i + '" title="Remove">&#10005;</button>' +
        '</div>' +
      '</div>';
    }).join('');

    // This one is a row, not a <button>, so `disabled` does nothing for it —
    // it gets .dcp-btn:disabled's own look (opacity 0.4, not-allowed) inline,
    // plus a data-disabled the click wiring checks, since a plain div would
    // otherwise still fire its listener.
    return inputRow + actionRows +
      '<div class="dcp-edit-item-row" id="' + idPrefix + '-touchaction-add"' +
        (disableAdds ? ' data-disabled="true" title="' + addsDisabledTitle + '"' : '') +
        ' style="cursor:' + (disableAdds ? 'not-allowed; opacity:0.4' : 'pointer') + '">' +
        '<div class="dcp-edit-item-info"><div class="dcp-edit-item-type" style="font-weight:400">+ Add another touchAction</div></div>' +
      '</div>';
  }

  /// Renumber every indexed item's idx (and touchActionInput's textIdx)
  /// so numeric idx values track array/draw order — mirrors
  /// pfodWebDesigner's own updateNumericIndices() (server.js:1090-1188),
  /// run there after every reorder/edit, simplified for this project's
  /// schema (no separate cmdName->cmd indirection layer to resolve —
  /// cmd/idxName are already the real, stable values here, only the
  /// numeric idx itself needs recomputing). Operates on a FLAT items
  /// array (touchZone's nested touchActionInput/touchActions already
  /// expanded back to siblings) — the true draw/wire order.
  ///
  /// First occurrence of each distinct idxName (in array order) mints a
  /// fresh sequential idx (1, 2, 3, ...); every later item referencing
  /// the SAME idxName — another declaring item, a hide/unhide/erase
  /// target, or a touchActionInput's textIdx (test_text.json's own real
  /// saved shape: idxName + textIdx together) — reuses that same number,
  /// exactly like updateNumericIndices()'s idxMap. touchAction/
  /// touchActionInput never MINT a new idx themselves (pfodWebDesigner's
  /// own comment: "they only reference existing indexed items"), only
  /// resolve against whatever's already in idxMap.
  ///
  /// Sequential-by-position means an item lower in the list always ends
  /// up with a higher idx than one above it, so after a reorder the
  /// numbering still matches draw order (later-drawn items paint over
  /// earlier ones on the same canvas) instead of staying stale from
  /// before the move.
  ///
  /// @param {Array<object>} items — flat items array, mutated in place
  function _renumberIndices(items) {
    const idxMap = new Map();
    let nextIdx = 1;
    items.forEach((item) => {
      if (item.type === 'touchAction' || item.type === 'touchActionInput') return;
      if (!item.idxName) return;
      if (!idxMap.has(item.idxName)) {
        idxMap.set(item.idxName, nextIdx);
        nextIdx++;
      }
      item.idx = idxMap.get(item.idxName);
    });
    items.forEach((item) => {
      if (item.type === 'touchActionInput' && item.idxName && idxMap.has(item.idxName)) {
        item.textIdx = idxMap.get(item.idxName);
      }
    });
  }

  /// Render alt-a-mockup.html's Screen 2 ("Control Panel") into root, for
  /// an EXISTING dwg opened via the main list's Edit button — scoped, per
  /// direction, to properties editing only (name/description/width/
  /// height/refresh/colour) plus a read-only item list; the per-item add/
  /// edit/reorder screens (Add Item, Edit Item) aren't built yet.
  ///
  /// Properties editing reuses the exact same temp-draft-then-commit-or-
  /// discard mechanism the Create Dwg screen uses, EXCEPT the draft here
  /// carries the dwg's real current items (not an empty array) — per
  /// dwg-dataflow.md's own note, editing previews against real content,
  /// not a blank placeholder. Opening "Edit Drawing Properties" saves the
  /// draft and switches the real preview to it; Cancel discards the draft
  /// and switches the preview back to the real, unmodified dwg; Save
  /// Changes commits the edited fields onto the real entry (renaming it
  /// if the name changed) and discards the draft.
  function _renderEditDwgScreen(root, name) {
    const originalName = name;
    const dwg = DwgLibrary.get(originalName);
    if (!dwg) { _renderMainView(root); return; }

    let propsOpen = false;
    const colorState = { color: dwg.color };

    // dwg.items (from DwgLibrary.get()) is already the NESTED internal
    // form (a touchZone carries its touchActionInput/touchActions as
    // children, not top-level siblings). validateAndRepairDwg() ->
    // nestAndValidateTouchActions() expects FLAT sibling input (the
    // wire/file shape) and would otherwise silently wipe every
    // touchZone's actions when asked to re-nest an already-nested array
    // (it unconditionally resets touchActionInput/touchActions on each
    // touchZone before re-collecting from following siblings). Flatten
    // once up front — items themselves never change on this screen, only
    // x/y/color/refresh/name/description do.
    const flatItems = flattenTouchActions(dwg.items || []);

    /// Leaving this screen (Back/Exit) while the properties editor is
    /// open must discard its draft first, same as Create Dwg's own
    /// leave-without-committing paths.
    function discardDraftIfOpen() {
      if (propsOpen) DwgLibrary.remove(EDIT_DWG_DRAFT_NAME);
    }

    function renderScreen() {
      const itemCount = Array.isArray(dwg.items) ? dwg.items.length : 0;
      const swatchHex = _swatchHex(dwg.color);
      const description = (typeof dwg.description === 'string') ? dwg.description : '';
      const byteSize = _computeDwgResponseByteSize(originalName);

      const itemsHtml = (itemCount === 0)
        ? '<div class="dcp-empty">No items yet.</div>'
        : dwg.items.map((item, i) => {
            const missingDwgName = _missingDwgTargetName(item, dwg);
            return (
            '<div class="dcp-edit-item-row">' +
              '<div class="dcp-edit-item-info">' +
                '<div class="dcp-edit-item-type"><b>' + _esc(_itemTypeLabel(item)) + '</b>' +
                  (_itemTypeSuffix(item) ? ' <span class="dcp-edit-item-type-suffix">' + _esc(_itemTypeSuffix(item)) + '</span>' : '') +
                  (missingDwgName ? ' <span class="dcp-missing-dwg-note">&mdash; dwg not loaded</span>' : '') +
                '</div>' +
                '<div class="dcp-edit-item-detail">' + _describeItem(item, dwg.color) + '</div>' +
              '</div>' +
              '<div class="dcp-edit-item-actions">' +
                '<button type="button" class="dcp-mini-btn dcp-mini-btn-show" data-idx="' + i + '" data-action="show" title="Hold to toggle this item&#39;s visibility and identify it in the preview">&#128065;</button>' +
                '<button type="button" class="dcp-mini-btn dcp-mini-btn-up" data-idx="' + i + '" data-action="up" title="Move up"' +
                  (i === 0 ? ' disabled' : '') +
                  '>&#9650;</button>' +
                '<button type="button" class="dcp-mini-btn dcp-mini-btn-down" data-idx="' + i + '" data-action="down" title="Move down"' +
                  (i === itemCount - 1 ? ' disabled' : '') + '>&#9660;</button>' +
                '<button type="button" class="dcp-mini-btn dcp-mini-btn-edit" data-idx="' + i + '" data-action="edit" title="Edit item">&#9998;</button>' +
                '<button type="button" class="dcp-mini-btn dcp-mini-btn-remove" data-idx="' + i + '" data-action="remove" title="Remove item">&#10005;</button>' +
              '</div>' +
            '</div>'
            );
          }).join('');

      root.innerHTML =
        '<div class="dcp-back-row">' +
          '<button type="button" class="dcp-back-link" id="dcp-edit-back">&larr; Back to Dwg Controls Panel</button>' +
          '<button type="button" class="dcp-back-link dcp-exit" id="dcp-exit-designer">Exit Designer</button>' +
        '</div>' +
        '<div class="dcp-drawing-info">' +
          '<div class="dcp-drawing-info-head">' +
            '<h3>' + _esc(dwg.name) + '</h3>' +
            // Disabled while the properties editor is open, so the only
            // ways out of it are its own Cancel / Save Changes buttons.
            '<button type="button" class="dcp-btn dcp-btn-ghost" id="dcp-edit-toggle-props"' +
              (propsOpen ? ' disabled' : '') + '>Edit Drawing Properties</button>' +
          '</div>' +
          '<div class="dcp-drawing-meta-line">' +
            '<b>' + byteSize + ' bytes, ' + dwg.x + '&times;' + dwg.y + '</b>' +
            '<span class="dcp-sep">&middot;</span><span class="dcp-meta-label">Colour:</span> ' +
            '<span class="dcp-swatch" style="background:' + swatchHex + '"></span>' +
            '<span class="dcp-sep">&middot;</span><span class="dcp-meta-label">Refresh:</span> ' + dwg.refresh + 's' +
            '<span class="dcp-sep">&middot;</span><span class="dcp-meta-label">Items:</span> ' + itemCount +
          '</div>' +
          '<div class="dcp-drawing-desc-line">' + _esc(description) + '</div>' +
        '</div>' +
        '<div class="dcp-edit-props-panel" id="dcp-edit-props-panel" style="display:' + (propsOpen ? 'block' : 'none') + '">' +
          '<div class="dcp-field">' +
            '<label>Name</label>' +
            '<input type="text" id="dcp-edit-name" value="' + _esc(dwg.name) + '">' +
          '</div>' +
          '<div class="dcp-field">' +
            '<label>Description <span style="text-transform:none; font-weight:400">(optional)</span></label>' +
            '<textarea id="dcp-edit-desc" style="min-height:52px">' + _esc(description) + '</textarea>' +
          '</div>' +
          '<div class="dcp-field-row dcp-num-row">' +
            '<div class="dcp-field"><label>Width (1&ndash;255)</label>' +
              '<input type="number" id="dcp-edit-width" value="' + dwg.x + '" min="1" max="255"></div>' +
            '<div class="dcp-field"><label>Height (1&ndash;255)</label>' +
              '<input type="number" id="dcp-edit-height" value="' + dwg.y + '" min="1" max="255"></div>' +
          '</div>' +
          '<div class="dcp-field">' +
            '<label>Refresh rate (seconds, 0 = no refresh)</label>' +
            '<input type="number" id="dcp-edit-refresh" value="' + dwg.refresh + '" min="0" max="3600" style="width:70px">' +
          '</div>' +
          '<div class="dcp-field">' +
            '<label>Background colour</label>' +
            '<div class="dcp-color-field" id="dcp-edit-color-field">' +
              '<div class="dcp-color-header">' +
                '<span class="dcp-swatch-num">' +
                  '<span class="dcp-swatch-lg" id="dcp-edit-color-swatch"></span>' +
                  '<span class="dcp-num" id="dcp-edit-color-num"></span>' +
                '</span>' +
                '<button type="button" class="dcp-color-mode-btn" id="dcp-edit-color-toggle">Choose Color</button>' +
              '</div>' +
              '<div class="dcp-color-popup" id="dcp-edit-color-popup" style="display:none"></div>' +
            '</div>' +
          '</div>' +
          '<div class="dcp-action-row" style="justify-content:flex-end; margin-top:8px">' +
            '<button type="button" class="dcp-btn dcp-btn-ghost" id="dcp-edit-props-cancel">Cancel</button>' +
            '<button type="button" class="dcp-btn dcp-btn-primary" id="dcp-edit-props-save">Save Changes</button>' +
          '</div>' +
        '</div>' +
        '<div class="dcp-action-row" style="display:' + (propsOpen ? 'none' : 'flex') + '">' +
          '<button type="button" class="dcp-btn dcp-btn-primary" id="dcp-edit-add-item">+ Add Item</button>' +
          '<button type="button" class="dcp-btn" id="dcp-edit-undo-delete"' +
            // exists()/listNames() only ever reflect the VISIBLE index —
            // the undo snapshot is deliberately hidden from it
            // (saveHidden(), see _removeItem's own doc), so its presence
            // has to be checked with get() instead.
            (DwgLibrary.get(originalName + '_undo') ? '' : ' disabled') + '>Undo Delete</button>' +
          '<button type="button" class="dcp-btn" id="dcp-edit-export-dwg">Export</button>' +
          '<button type="button" class="dcp-btn" id="dcp-edit-generate-code">Generate Code</button>' +
        '</div>' +
        '<div class="dcp-list" style="display:' + (propsOpen ? 'none' : 'flex') + '">' + itemsHtml + '</div>';

      root.querySelector('#dcp-edit-back').addEventListener('click', () => {
        discardDraftIfOpen();
        _renderPreview(originalName);
        _renderMainView(root);
      });
      root.querySelector('#dcp-exit-designer').addEventListener('click', () => {
        discardDraftIfOpen();
        _exitDesigner();
      });
      root.querySelector('#dcp-edit-add-item').addEventListener('click', () => _renderAddItemScreen(root, originalName));
      root.querySelector('#dcp-edit-undo-delete').addEventListener('click', () => _undoDelete());
      // Export Dwg downloads THIS dwg (the one this screen is open on),
      // independent of whatever's currently selected back on the main
      // list — reuses the same file-download helper Export Dwg/Unload Dwg
      // already use, just against the freshly-loaded `dwg` object here
      // rather than _selectedDwgName.
      root.querySelector('#dcp-edit-export-dwg').addEventListener('click', () => _downloadDwgAsJson(dwg));
      // Generate Code for THIS dwg (the one this screen is open on),
      // independent of _selectedDwgName — same reasoning as Export Dwg's
      // own doc just above.
      root.querySelector('#dcp-edit-generate-code').addEventListener('click', () => _generateCode(originalName));

      // Per-item up/down/edit/remove buttons (matches alt-a-mockup.html's
      // Screen 2 .item-actions row) — all four are real now.
      root.querySelectorAll('.dcp-mini-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (btn.disabled) return;
          const action = btn.getAttribute('data-action');
          const idx = parseInt(btn.getAttribute('data-idx'), 10);
          if (action === 'up')     { _moveItem(idx, -1); return; }
          if (action === 'down')   { _moveItem(idx, 1); return; }
          if (action === 'remove') { _removeItem(idx); return; }
          if (action === 'edit')   { _renderEditItemScreen(root, originalName, idx); return; }
        });
      });

      // "Show" (👁) is a press-and-HOLD action, not a click: mousedown
      // previews this dwg with THIS ONE item removed from a throwaway
      // draft (so whatever visually disappears identifies this row's
      // item), mouseup restores the real dwg's own preview. Applies the
      // same way to every item type — there's no per-item "just hide
      // this visually" shortcut in this wire-protocol-faithful preview,
      // so remove-from-a-draft-and-re-render is the one mechanism, for
      // indexed items, un-indexed items, and touchZones alike.
      root.querySelectorAll('.dcp-mini-btn-show').forEach((btn) => {
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        btn.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          _pressShowItem(idx);
        });
        btn.addEventListener('mouseup', (e) => {
          e.stopPropagation();
          _releaseShowItem();
        });
        // Safety net: if the mouse is dragged off the button while still
        // pressed (no mouseup ever fires on it), don't leave the item
        // stuck hidden — restore as soon as it leaves.
        btn.addEventListener('mouseleave', () => {
          if (btn.matches(':active')) _releaseShowItem();
        });
      });

      /// Whether dwg.items[idx]'s target identity (cmdName/cmd or
      /// idxName) is CURRENTLY hidden — i.e. the real dwg already
      /// contains its own hide/unhide directive(s) targeting the same
      /// name. Walks `items` in their own stored order and keeps the LAST
      /// matching hide/unhide's own hidden-ness, matching how a real
      /// device applies these as a sequence of state changes, not
      /// independent one-shot flags.
      /// @param {Array<object>} items
      /// @param {string} key — 'cmdName' | 'cmd' | 'idxName'
      /// @param {string} value — the identity value to match against
      /// @returns {boolean}
      function _isCurrentlyHidden(items, key, value) {
        let hidden = false;
        items.forEach((other) => {
          if ((other.type === 'hide' || other.type === 'unhide') && other[key] === value) {
            hidden = (other.type === 'hide');
          }
        });
        return hidden;
      }

      // Set by _pressShowItem, consumed/cleared by _releaseShowItem — the
      // one in-flight toggle's loadCmd/kind/value/originalHidden, so
      // release can send the exact inverse directive of whatever press
      // sent, without re-deriving anything from (unchanged) dwg.items.
      let _showToggleState = null;

      /// Press: send a real pfod "update" ({+|h`N} / {+|uh`N} / {+|h~cN} /
      /// {+|uh~cN}) toggling dwg.items[idx]'s visibility, targeting the
      /// ALREADY-displayed real dwg directly — no draft dwg, no re-render
      /// cycle. Any item identifiable by cmdName/cmd (touchZone/insertDwg)
      /// or idxName (any indexed rectangle/line/circle/arc/label/value)
      /// resolves to its already-minted numeric idx/cmd (device.resolveIdx/
      /// resolveCmd — set during this dwg's last full "start" encode) and
      /// forces the device's next fetch of this dwg's loadCmd to answer
      /// with that one-item update instead of a full "start". Real hide/
      /// unhide-by-idx/cmd (drawingDataProcessor.js's hideByCmd/hide-by-
      /// idx) just flips the EXISTING item's visible flag in place, so
      /// every other item's own DOM/canvas state is left completely
      /// untouched — no flash. Checking the CURRENT hidden state first
      /// (_isCurrentlyHidden) matters because the real dwg may already
      /// hide this item itself (its own earlier hide directive) —
      /// pressing Show on an already-hidden item must UNHIDE it (to
      /// reveal what it looks like), not hide it again, which would be a
      /// no-op that reveals nothing. An item with NEITHER cmdName/cmd nor
      /// idxName has nothing a real hide/unhide directive could target —
      /// a real device could never have been asked to index/name it, so
      /// there's no lighter-weight way to toggle just that one item.
      /// That case falls back to forcing a full "start" re-encode of the
      /// dwg with the item spliced out (device.forceNextStart) — the same
      /// outcome (and same full-drawing flash) the old SHOW_HIDE_DRAFT_NAME
      /// draft-dwg mechanism produced for this case, just built in memory
      /// instead of round-tripped through DwgLibrary.
      ///
      /// ensureAutoAssignments() runs first: the device's idx/cmd
      /// dictionary is normally populated by the async {.}/{loadCmd}
      /// round-trip _renderPreview fired when this screen opened, but
      /// that round-trip (a simulated network delay) may not have
      /// resolved yet if the user presses Show right away — without this,
      /// resolveIdx/resolveCmd below would throw on a dictionary that's
      /// still empty.
      function _pressShowItem(idx) {
        const item = dwg.items[idx];
        const loadCmd = window.DWG_PREVIEW_KEY_PREFIX + originalName;
        _dwgDesignerAdapter.device.ensureAutoAssignments(originalName, dwg);
        let kind, value, originalHidden;
        if (item.type === 'touchZone') {
          const key = item.cmdName ? 'cmdName' : 'cmd';
          originalHidden = _isCurrentlyHidden(dwg.items, key, item[key]);
          kind = 'cmd';
          value = _dwgDesignerAdapter.device.resolveCmd(originalName, item[key]);
        } else if (item.type === 'insertDwg') {
          // insertDwg is identified on the wire by its own loadCmd
          // (|hd/|uhd), never an auto-minted cmd — its own |d... wire
          // fragment never transmits a cmd at all (see
          // dwgWireEncoder.js's encodeInsertDwg/encodeHideUnhideErase).
          const key = item.cmdName ? 'cmdName' : 'cmd';
          originalHidden = _isCurrentlyHidden(dwg.items, key, item[key]);
          kind = 'drawingName';
          value = item.drawingName;
        } else if (item.idxName) {
          originalHidden = _isCurrentlyHidden(dwg.items, 'idxName', item.idxName);
          kind = 'idx';
          value = _dwgDesignerAdapter.device.resolveIdx(originalName, item.idxName);
        } else {
          _showToggleState = { loadCmd, kind: 'remove' };
          const withoutItem = dwg.items.slice();
          withoutItem.splice(idx, 1);
          _dwgDesignerAdapter.device.forceNextStart(loadCmd,
            { x: dwg.x, y: dwg.y, refresh: dwg.refresh, color: dwg.color, items: withoutItem });
          window.drawingViewer.queueDrawingUpdate(loadCmd);
          return;
        }
        _showToggleState = { loadCmd, kind, value, originalHidden };
        const directive = { type: originalHidden ? 'unhide' : 'hide' };
        directive[kind] = value;
        _dwgDesignerAdapter.device.forceNextUpdate(loadCmd, [directive]);
        window.drawingViewer.queueDrawingUpdate(loadCmd);
      }

      /// Release: restore whatever _pressShowItem just toggled away —
      /// the exact opposite hide/unhide-by-idx/cmd update, or (kind
      /// 'remove') a fresh full "start" re-encode of the dwg's own,
      /// complete, unmodified item list.
      function _releaseShowItem() {
        if (!_showToggleState) return;
        const { loadCmd, kind, value, originalHidden } = _showToggleState;
        _showToggleState = null;
        if (kind === 'remove') {
          _dwgDesignerAdapter.device.forceNextStart(loadCmd,
            { x: dwg.x, y: dwg.y, refresh: dwg.refresh, color: dwg.color, items: dwg.items });
          window.drawingViewer.queueDrawingUpdate(loadCmd);
          return;
        }
        const directive = { type: originalHidden ? 'hide' : 'unhide' };
        directive[kind] = value;
        _dwgDesignerAdapter.device.forceNextUpdate(loadCmd, [directive]);
        window.drawingViewer.queueDrawingUpdate(loadCmd);
      }

      /// Delete dwg.items[idx] with no confirmation prompt, but only
      /// after saving the dwg's CURRENT (pre-removal) state under
      /// "<name>_undo" — overwriting any earlier undo snapshot, so only
      /// the MOST RECENT removal can be undone. Enables "Undo Delete"
      /// (disabled until there's actually something to undo). Uses
      /// saveHidden(), NOT save() — this snapshot must never appear in
      /// the visible dwg list (it isn't a real, standalone dwg): saving
      /// it with plain save() was the actual bug behind "_undo"/
      /// "_undo_undo" names — it sat in the visible index long enough
      /// (by design, until Undo Delete or the next Remove) that a user
      /// could open IT via Edit and remove an item from IT, saving its
      /// own "<name>_undo_undo" snapshot the same way.
      function _removeItem(idx) {
        DwgLibrary.saveHidden(Object.assign({}, dwg, { name: originalName + '_undo' }));

        const items = dwg.items.slice();
        items.splice(idx, 1);
        const flatItems = flattenTouchActions(items);
        _renumberIndices(flatItems);
        const raw = {
          name: originalName,
          description: (typeof dwg.description === 'string') ? dwg.description : '',
          x: dwg.x, y: dwg.y, refresh: dwg.refresh, color: dwg.color,
          items: flatItems,
        };
        const { dwg: savedDwg } = validateAndRepairDwg(raw, originalName);
        DwgLibrary.save(savedDwg);
        _dwgDesignerAdapter.device.invalidatePreviewVersion(originalName);
        _renderEditDwgScreen(root, originalName);
      }

      /// Restore the dwg from its "<name>_undo" snapshot (the state just
      /// before the most recent Remove), then discard that snapshot —
      /// "Undo Delete" is a single-step undo, not a stack; it goes back
      /// to disabled once there's nothing left to revert to. No-op if
      /// there's no snapshot (button is disabled at that point anyway).
      function _undoDelete() {
        const undoDwg = DwgLibrary.get(originalName + '_undo');
        if (!undoDwg) return;
        DwgLibrary.save(Object.assign({}, undoDwg, { name: originalName }));
        DwgLibrary.remove(originalName + '_undo');
        _dwgDesignerAdapter.device.invalidatePreviewVersion(originalName);
        _renderEditDwgScreen(root, originalName);
      }

      /// Swap dwg.items[idx] with dwg.items[idx + direction] (direction
      /// -1 = up, +1 = down), save the reordered dwg back onto the SAME
      /// name, and refresh both the item list and the real preview so a
      /// stacking-order change (later items draw over earlier ones) is
      /// immediately visible. No-op if the swap would go out of bounds
      /// (shouldn't happen — the button is disabled at that edge — but
      /// harmless either way).
      function _moveItem(idx, direction) {
        const otherIdx = idx + direction;
        if (otherIdx < 0 || otherIdx >= dwg.items.length) return;
        const items = dwg.items.slice();
        const tmp = items[idx];
        items[idx] = items[otherIdx];
        items[otherIdx] = tmp;
        const flatItems = flattenTouchActions(items);
        _renumberIndices(flatItems);
        const raw = {
          name: originalName,
          description: (typeof dwg.description === 'string') ? dwg.description : '',
          x: dwg.x, y: dwg.y, refresh: dwg.refresh, color: dwg.color,
          items: flatItems,
        };
        const { dwg: savedDwg } = validateAndRepairDwg(raw, originalName);
        DwgLibrary.save(savedDwg);
        _dwgDesignerAdapter.device.invalidatePreviewVersion(originalName);
        _renderEditDwgScreen(root, originalName);
      }

      // Whole-screen re-render on toggle (rather than just flipping
      // .dcp-edit-props-panel's display) means every field/button inside
      // the panel is fresh DOM each time it opens — no risk of
      // openPropsEditor's listeners piling up from a previous open/close
      // cycle on stale nodes.
      root.querySelector('#dcp-edit-toggle-props').addEventListener('click', () => {
        colorState.color = dwg.color;
        propsOpen = true;
        renderScreen();
      });

      if (propsOpen) {
        openPropsEditor(root);
      } else {
        // Properties editor collapsed — the real, committed dwg is what
        // should be showing in the preview panel (matches the main
        // screen's own view of this dwg).
        _renderPreview(originalName);
      }
    }

    /// Wire up the properties editor's fields once it's shown: same
    /// debounced-width/height + immediate-colour-click live preview
    /// pattern as _renderCreateDwgScreen, but writing to
    /// EDIT_DWG_DRAFT_NAME with this dwg's REAL items carried over
    /// unchanged (only x/y/color/refresh are being previewed).
    function openPropsEditor(root) {
      const widthInput = root.querySelector('#dcp-edit-width');
      const heightInput = root.querySelector('#dcp-edit-height');

      function updateDraftPreview() {
        const w = Math.min(255, Math.max(1, parseInt(widthInput.value, 10) || 1));
        const h = Math.min(255, Math.max(1, parseInt(heightInput.value, 10) || 1));
        const raw = {
          name: EDIT_DWG_DRAFT_NAME,
          x: w, y: h,
          refresh: parseInt(root.querySelector('#dcp-edit-refresh').value, 10) || 0,
          color: colorState.color,
          items: flatItems,
        };
        const { dwg: draftDwg } = validateAndRepairDwg(raw, EDIT_DWG_DRAFT_NAME);
        DwgLibrary.saveHidden(draftDwg);
        _dwgDesignerAdapter.device.invalidatePreviewVersion(EDIT_DWG_DRAFT_NAME);
        _renderPreview(EDIT_DWG_DRAFT_NAME);
      }

      let previewDebounce = null;
      function scheduleDraftPreviewUpdate() {
        if (previewDebounce) clearTimeout(previewDebounce);
        previewDebounce = setTimeout(updateDraftPreview, 500);
      }
      [widthInput, heightInput].forEach((input) => {
        input.addEventListener('input', scheduleDraftPreviewUpdate);
        input.addEventListener('blur', () => {
          if (previewDebounce) { clearTimeout(previewDebounce); previewDebounce = null; }
          updateDraftPreview();
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            if (previewDebounce) { clearTimeout(previewDebounce); previewDebounce = null; }
            updateDraftPreview();
          }
        });
      });

      function buildColorPopup() {
        const popup = root.querySelector('#dcp-edit-color-popup');
        const sections = [
          { title: 'Standard Colors (0-15)', from: 0, to: 15 },
          { title: '216 Colors (16-231)', from: 16, to: 231 },
          { title: 'Grayscale (232-255)', from: 232, to: 255 },
        ];
        let html = '';
        sections.forEach((section) => {
          html += '<div class="dcp-color-section-title">' + section.title + '</div><div class="dcp-color-row">';
          for (let i = section.from; i <= section.to; i++) {
            html += '<span class="dcp-color-cell" data-color="' + i + '" style="background:' + _swatchHex(i) + '"></span>';
          }
          html += '</div>';
        });
        popup.innerHTML = html;
        popup.querySelectorAll('.dcp-color-cell').forEach((cell) => {
          cell.addEventListener('click', () => {
            colorState.color = parseInt(cell.getAttribute('data-color'), 10);
            updateColorHeader();
            updateDraftPreview();
            popup.style.display = 'none';
          });
        });
      }

      function updateColorHeader() {
        root.querySelector('#dcp-edit-color-swatch').style.background = _swatchHex(colorState.color);
        root.querySelector('#dcp-edit-color-num').textContent = 'Color ' + colorState.color;
        root.querySelectorAll('#dcp-edit-color-popup .dcp-color-cell').forEach((cell) => {
          cell.classList.toggle('dcp-selected', parseInt(cell.getAttribute('data-color'), 10) === colorState.color);
        });
      }

      buildColorPopup();
      updateColorHeader();
      updateDraftPreview();

      function toggleColorPopup() {
        const popup = root.querySelector('#dcp-edit-color-popup');
        popup.style.display = (popup.style.display === 'none') ? 'block' : 'none';
      }
      root.querySelector('#dcp-edit-color-toggle').addEventListener('click', toggleColorPopup);
      root.querySelector('#dcp-edit-color-swatch').addEventListener('click', toggleColorPopup);

      root.querySelector('#dcp-edit-props-cancel').addEventListener('click', () => {
        DwgLibrary.remove(EDIT_DWG_DRAFT_NAME);
        propsOpen = false;
        renderScreen();
      });

      root.querySelector('#dcp-edit-props-save').addEventListener('click', () => {
        const typedName = (root.querySelector('#dcp-edit-name').value || '').trim();
        if (!typedName) return;
        const finalName = (typedName === originalName) ? originalName : DwgLibrary.nextFreeName(typedName);
        const raw = {
          name: finalName,
          description: (root.querySelector('#dcp-edit-desc').value || '').trim(),
          x: parseInt(widthInput.value, 10),
          y: parseInt(root.querySelector('#dcp-edit-height').value, 10),
          refresh: parseInt(root.querySelector('#dcp-edit-refresh').value, 10),
          color: colorState.color,
          items: flatItems,
        };
        const { dwg: savedDwg } = validateAndRepairDwg(raw, finalName);
        DwgLibrary.save(savedDwg);
        if (finalName !== originalName) DwgLibrary.remove(originalName);
        DwgLibrary.remove(EDIT_DWG_DRAFT_NAME);
        // When the name is unchanged, finalName's loadCmd is the SAME one
        // the device already answered for the pre-edit content — without
        // this, the device's cached version still matches what the
        // client has, so it answers a stale bare {+} (no change) instead
        // of a fresh "start" reflecting the just-saved properties. A
        // renamed dwg's loadCmd is brand new to the device so this is a
        // no-op in that case, but calling it unconditionally is simplest
        // and harmless either way.
        _dwgDesignerAdapter.device.invalidatePreviewVersion(finalName);
        _selectedDwgName = finalName;
        _renderEditDwgScreen(root, finalName);
      });
    }

    renderScreen();
  }

  // ── Add Item ──────────────────────────────────────────────────────

  /// Item types whose own idxName field is a REFERENCE to some other
  /// item's declaration, never a declaration of their own — matches
  /// dwgValidate.js's own REFERENCE_ONLY_TYPES (_dedupDeclaredIdxNames)
  /// exactly, kept here as its own module-level constant since this is a
  /// separate file/IIFE.
  const REFERENCE_ONLY_TYPES = ['hide', 'unhide', 'erase', 'touchAction', 'touchActionInput'];

  /// Every idxName currently DECLARED by a top-level item, as a single
  /// combined Set — the shared basis for _nextFreeIdxName()'s suggestion
  /// and the Add/Edit Item screens' own live duplicate check/dedup.
  ///
  /// One flat namespace, no index/non-index split: once a dwg has been
  /// loaded, NO two declaring items — an Index Placeholder included —
  /// may share an idxName; creating or editing ANY item (Index
  /// Placeholder or otherwise) always dedupes against every other
  /// declaring item, full stop. An Index Placeholder legitimately sharing
  /// a name with a real item is a real, tolerated state (dwgValidate.js's
  /// own load-time cleanup, _dedupDeclaredIdxNames, produces it by
  /// converting an earlier duplicate's first occurrence into a
  /// placeholder rather than deleting it) — but that's a LOAD-time-only
  /// outcome, never something this screen should let a user deliberately
  /// create. So this function doesn't need, and no longer has, any
  /// kind-partitioning of its own — that distinction only ever mattered
  /// for the load-time repair, not here.
  ///
  /// hide/unhide/erase's own idxName is a REFERENCE, not a declaration —
  /// same as a touchActionInput/touchAction target — so it's excluded
  /// here, same as dwgValidate.js's own REFERENCE_ONLY_TYPES exclusion
  /// (_dedupDeclaredIdxNames). Nested touchActionInput/touchAction
  /// targets are never scanned at all (not even unconditionally): a
  /// reference can only exist post-load if a real top-level item already
  /// declares that name (dwgValidate.js's own orphan-drop guarantees
  /// this), so counting it again here would only ever repeat a name the
  /// top-level scan already added via the item it targets — and, when
  /// that top-level item is the one being excludeIndex-excluded, would
  /// wrongly reintroduce its own name as "still used" via its own
  /// reference.
  /// @param {object} dwg
  /// @param {number} [excludeIndex] — skip dwg.items[excludeIndex] when
  ///        collecting — the Edit Item screen's own use: an item being
  ///        edited shouldn't collide against its OWN pre-existing
  ///        idxName just because the user left it unchanged.
  /// @returns {Set<string>}
  function _collectUsedIdxNames(dwg, excludeIndex) {
    const used = new Set();
    (dwg.items || []).forEach((item, i) => {
      if (i === excludeIndex) return;
      if (REFERENCE_ONLY_TYPES.indexOf(item.type) !== -1) return;
      if (item.idxName) used.add(item.idxName);
    });
    return used;
  }

  /// Propagate an Assign Index RENAME (Edit Item's own Save Changes,
  /// when the item being edited's idxName actually changed) to every
  /// OTHER reference to the OLD name — a touchZone's touchActionInput,
  /// a touchAction's nested action[0], or (in principle) another
  /// top-level item that happened to share the same name — so they keep
  /// pointing at the SAME slot instead of becoming orphaned references
  /// that validateAndRepairDwg's own _dropOrphanedTouchActionTargets
  /// would otherwise silently delete on the very next validate/save
  /// pass (dwgValidate.js has no way to know a reference was RENAMED
  /// vs. genuinely abandoned — from its point of view both look
  /// identical: an idxName that no top-level item declares). Must run
  /// BEFORE validateAndRepairDwg, so every reference already matches a
  /// real idxName by the time that orphan-check sees it. Mutates `items`
  /// in place — same recursive touchZone/touchActions/touchActionInput
  /// walk as _collectUsedIdxNames.
  /// @param {Array<object>} items — dwg.items, NESTED form
  /// @param {number} skipIndex — the item just edited; its own idxName
  ///        was already set directly by buildUpdatedItem, so it's
  ///        excluded from this rename pass (renaming it again would be
  ///        a no-op anyway, since it already IS newIdxName)
  /// @param {string} oldIdxName
  /// @param {string} newIdxName
  function _renameIdxNameReferences(items, skipIndex, oldIdxName, newIdxName) {
    const rename = (item) => {
      if (item.idxName === oldIdxName) item.idxName = newIdxName;
      if (Array.isArray(item.touchActions)) item.touchActions.forEach(rename);
      if (item.touchActionInput) rename(item.touchActionInput);
      if (item.type === 'touchAction' && Array.isArray(item.action) && item.action[0]) rename(item.action[0]);
    };
    items.forEach((item, i) => {
      if (i === skipIndex) return;
      rename(item);
    });
  }

  /// Suggest the next unused "idx_<N>" name across dwg's items — a
  /// STARTING POINT for "Use Index"'s revealed name field, not an auto-
  /// assigned final value: the user can freely edit it. idxName is
  /// always user-assigned, never silently auto-generated
  /// (dwgValidate.js's own "no idxName fallback, these are assigned by
  /// user" rule) — this just avoids suggesting a name that's already in
  /// use in this dwg.
  /// @param {object} dwg
  /// @returns {string}
  function _nextFreeIdxName(dwg) {
    const used = _collectUsedIdxNames(dwg);
    let n = 1;
    while (used.has('idx_' + n)) n++;
    return 'idx_' + n;
  }

  /// First unused "<base>", "<base>_1", "<base>_2", ... against `used` —
  /// same suffix convention as DwgLibrary.nextFreeName. Used to silently
  /// dedup a user-typed idxName that collides with one already in the
  /// dwg at Add Item commit time (the live warning tells the user this
  /// will happen; it isn't a surprise).
  /// @param {string} base
  /// @param {Set<string>} used
  /// @returns {string}
  function _dedupeName(base, used) {
    if (!used.has(base)) return base;
    for (let n = 1; ; n++) {
      const candidate = base + '_' + n;
      if (!used.has(candidate)) return candidate;
    }
  }

  // ── Hide Item ─────────────────────────────────────────────────────

  /// Whether `items`' target identity named `value` (matched under
  /// `key`, 'idxName' or 'cmdName') is CURRENTLY hidden — i.e. `items`
  /// already contains its own hide/unhide directive(s) targeting that
  /// same name. Walks `items` in stored order and keeps the LAST
  /// matching hide/unhide's own hidden-ness, matching how a real device
  /// applies these as a sequence of state changes, not independent
  /// one-shot flags. Same algorithm as _renderEditDwgScreen's own nested
  /// _isCurrentlyHidden (that one's local to the Edit Dwg item list's
  /// "Show" button and isn't reachable from here) — duplicated at module
  /// scope, with an added excludeIndex, for the Hide Item screen's own
  /// candidate list: Edit Item's own hide item shouldn't count itself
  /// when deciding whether its CURRENT target already reads as "hidden".
  /// @param {Array<object>} items
  /// @param {string} key — 'idxName' | 'cmdName'
  /// @param {string} value
  /// @param {number} [excludeIndex]
  /// @returns {boolean}
  function _isCurrentlyHidden(items, key, value, excludeIndex) {
    let hidden = false;
    items.forEach((other, i) => {
      if (i === excludeIndex) return;
      if ((other.type === 'hide' || other.type === 'unhide') && other[key] === value) {
        hidden = (other.type === 'hide');
      }
    });
    return hidden;
  }

  /// Human label for a Hide Type category — matches alt-a-mockup.html
  /// Screen 3k's own dropdown wording exactly.
  /// @param {string} hideKind — 'index' | 'touchZone' | 'insertDwg'
  /// @returns {string}
  function _hideKindLabel(hideKind) {
    return hideKind === 'index' ? 'Indexed Items' : (hideKind === 'touchZone' ? 'touchZones' : 'Inserted Dwgs');
  }

  /// Every top-level dwg.items entry a Hide item could target under Hide
  /// Type `hideKind`: 'index' — any item carrying its own idxName,
  /// targeted by idxName; 'touchZone'/'insertDwg' — items of that exact
  /// type carrying a cmdName, targeted by cmdName. Hide/Unhide/Erase
  /// items themselves, and touchAction/touchActionInput (which carry
  /// idxName only as a REFERENCE, never a declaration), are never
  /// 'index' candidates — same declaring-vs-referencing distinction as
  /// _collectUsedIdxNames.
  /// @param {object} dwg
  /// @param {string} hideKind — 'index' | 'touchZone' | 'insertDwg'
  /// @returns {Array<{i:number, item:object, field:string, value:string}>}
  function _hideCandidates(dwg, hideKind) {
    const field = hideKind === 'index' ? 'idxName' : 'cmdName';
    return (dwg.items || []).reduce((out, item, i) => {
      const isCandidateType = (hideKind === 'index')
        ? !['hide', 'unhide', 'erase', 'touchAction', 'touchActionInput'].includes(item.type)
        : item.type === hideKind;
      if (isCandidateType && item[field]) out.push({ i, item, field, value: item[field] });
      return out;
    }, []);
  }

  /// Starting Hide Type for a brand new Hide item — the first category
  /// (Indexed Items, then touchZones, then Inserted Dwgs) that actually
  /// has a candidate to target, so the Add Item screen doesn't default
  /// to an empty list when a non-empty one exists. Falls back to 'index'
  /// when the dwg has no candidates in ANY category yet (Add Item just
  /// stays disabled until one exists).
  /// @param {object} dwg
  /// @returns {string}
  function _defaultHideKind(dwg) {
    const kinds = ['index', 'touchZone', 'insertDwg'];
    return kinds.find((k) => _hideCandidates(dwg, k).length > 0) || 'index';
  }

  // ── Insert Drawing ───────────────────────────────────────────────

  /// Every dwg in the library available to insert via a NEW insertDwg
  /// item — matches pfodWebDesigner's own server.js GET
  /// /api/drawings/available-for-insert exactly: the current dwg itself
  /// is never a candidate at all (no self-insertion), and any dwg already
  /// referenced by ANOTHER insertDwg item elsewhere in this same dwg is
  /// included but flagged `blocked` (matching alt-a-mockup.html Screen
  /// 3's own disabled "already used elsewhere in this group" option,
  /// rather than the real app's server-side omission — showing WHY it's
  /// unavailable is the better UX, and this project has its own local
  /// DwgLibrary to check against instead of a server round-trip).
  /// @param {object} dwg — the dwg items are being added/edited into
  /// @param {string} dwgName — that dwg's own name (excluded from the
  ///        candidate list)
  /// @param {number} [excludeIndex] — skip dwg.items[excludeIndex] when
  ///        checking what's "already inserted" — Edit Item's own use, so
  ///        an insertDwg item being edited doesn't block its own current
  ///        selection.
  /// @returns {Array<{name:string, blocked:boolean}>}
  function _insertDwgCandidates(dwg, dwgName, excludeIndex) {
    const alreadyInserted = new Set();
    (dwg.items || []).forEach((item, i) => {
      if (i === excludeIndex) return;
      if (item.type === 'insertDwg' && item.drawingName) alreadyInserted.add(item.drawingName);
    });
    return DwgLibrary.listNames()
      .filter((name) => name !== dwgName)
      .map((name) => ({ name, blocked: alreadyInserted.has(name) }));
  }

  /// One-line label for a candidate dwg in the "Drawing to insert"
  /// dropdown — matches alt-a-mockup.html Screen 3's own format
  /// ("TempMonitor — "Live temperature..." · 220×180 · 9 items"). The
  /// quoted description segment is omitted entirely when the candidate
  /// has none (most dwgs don't).
  /// @param {object} candidateDwg — DwgLibrary.get(candidate.name)
  /// @returns {string}
  function _describeDwgForInsert(candidateDwg) {
    const desc = (typeof candidateDwg.description === 'string') ? candidateDwg.description.trim() : '';
    const itemCount = Array.isArray(candidateDwg.items) ? candidateDwg.items.length : 0;
    return candidateDwg.name +
      (desc ? ' — "' + desc + '"' : '') +
      ' · ' + candidateDwg.x + '×' + candidateDwg.y +
      ' · ' + itemCount + ' item' + (itemCount === 1 ? '' : 's');
  }

  // ── Touch Zone ───────────────────────────────────────────────────

  /// Real, wire-level Touch Filter enum — matches add-item.html's own
  /// Touch Filter <select> options exactly (value = the real filter bit
  /// pfodWebMouse.js sends; TOUCH is the default/no-filter value).
  const TOUCH_FILTER_OPTIONS = Object.freeze([
    { value: 0,   label: 'TOUCH (0) - Default' },
    { value: 1,   label: 'DOWN (1)' },
    { value: 2,   label: 'DRAG (2)' },
    { value: 4,   label: 'UP (4)' },
    { value: 8,   label: 'CLICK (8)' },
    { value: 16,  label: 'PRESS (16) - Long Press' },
    { value: 256, label: 'DOWN_DRAG_UP (256) - only UP msg sent on UP' },
    { value: 512, label: 'TOUCH_DISABLED (512)' },
  ]);

  /// Every cmdName currently in use by a touchZone or insertDwg item —
  /// the two real types that own a cmdName (dwgValidate.js's own
  /// "touchZone/insertDwg are the DECLARING items for a cmd" rule) — as
  /// a single flat Set. Matches pfodWebDesigner's own
  /// buildExistingNameLists() exactly: one shared namespace between the
  /// two types, no per-type split (unlike idxName, cmdName was never
  /// given a "two kinds that may share" exception).
  /// @param {object} dwg
  /// @param {number} [excludeIndex] — see _collectUsedIdxNames's own doc
  /// @returns {Set<string>}
  function _collectUsedCmdNames(dwg, excludeIndex) {
    const used = new Set();
    (dwg.items || []).forEach((item, i) => {
      if (i === excludeIndex) return;
      if ((item.type === 'touchZone' || item.type === 'insertDwg') && item.cmdName) used.add(item.cmdName);
    });
    return used;
  }

  /// Suggest the next unused "cmd_c<N>" name — matches add-item.js's own
  /// generateUniqueTouchZoneCommandName() exactly. Same "starting point,
  /// freely editable" convention as _nextFreeIdxName — Command Name
  /// stays a real, required, user-editable field (matches add-item.html's
  /// own "Auto-generated unique command name - can be edited" wording),
  /// unlike Insert Drawing's own auto-generated + locked cmdName.
  /// @param {object} dwg
  /// @returns {string}
  function _nextFreeCmdName(dwg) {
    const used = _collectUsedCmdNames(dwg);
    let n = 1;
    while (used.has('cmd_c' + n)) n++;
    return 'cmd_c' + n;
  }

  /// Read one dwg-ITEM geometry value back as a REAL number.  pfod item
  /// geometry is float/double the whole way down — pfodParser's own
  /// rectangle/line/touchZone .size(float,float)/.offset(float,float),
  /// circle/arc .radius(float), arc .start(float)/.angle(float),
  /// insertDwg .offset(float,float), label .displayMin/.displayMax(float),
  /// pfodDwgs::pushZero(double,double,double) — dwgValidate.js only asks
  /// these fields for a finite number, and dwgWireEncoder.js /
  /// dwgArduinoExport.js concatenate the raw value, so 12.5 is a legal Y
  /// Position and must survive.  Replaces the parseInt(x.value, 10) that
  /// used to truncate it.
  ///
  /// Deliberately NOT the `parseFloat(x) || fallback` idiom: `||` also
  /// swallows a legitimately-entered 0, which is a real value here — a
  /// line's ySize IS its Y delta, so ySize 0 is an exactly-horizontal
  /// line and `|| 1` makes that undrawable.  Only a NON-FINITE parse
  /// (empty field, garbage, a missing prefill property) takes the
  /// fallback; a NaN escaping to dwgArduinoExport would emit
  /// ".size(NaN,...)", which does not compile.
  ///
  /// Takes an input's .value string OR a raw stored number — parseFloat
  /// stringifies its argument first, so parseFloat(0) is 0 and
  /// parseFloat(12.5) is 12.5, while undefined/null/'COL' give NaN.
  ///
  /// Integer-by-contract fields keep their own parseInt and their own
  /// default step=1 markup: label/value minValue/maxValue/intValue
  /// (int32_t on the wire), decimals/fontSize (int), touchZone filter,
  /// colour, and the Create/Edit Dwg canvas x/y/refresh (the wire start
  /// header captures (\d+) and pfodDwgs::start takes (int cols,int rows)).
  /// @param {string|number} value — input .value, or a stored field value
  /// @param {number} fallback — used ONLY when value isn't a finite number
  /// @returns {number}
  function _readNum(value, fallback) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  }

  /// Every label/value item in `dwg` carrying its own idxName — the
  /// candidate list for a touchActionInput's "Indexed label or value"
  /// dropdown (touch-action-inputs.js's own getDisplayTextForItem() only
  /// ever handles these two types).
  /// @param {object} dwg
  /// @param {Set<string>} [excludeIdxNames] — idxNames already claimed by
  ///        one of this SAME touchZone's own touchActions (an item can be
  ///        a touchAction target or the touchActionInput's own target,
  ///        never both).
  /// @returns {Array<object>}
  function _labelValueCandidates(dwg, excludeIdxNames) {
    return (dwg.items || []).filter((item) =>
      (item.type === 'label' || item.type === 'value') && item.idxName &&
      !(excludeIdxNames && excludeIdxNames.has(item.idxName))
    );
  }

  /// Render alt-a-mockup.html's Screen 3 family ("Add Item") into root.
  /// The Item Type dropdown offers the FULL ITEM_TYPE_OPTIONS list (same
  /// as Edit Item's own dropdown) — Line, Rectangle, Circle, Arc, Label,
  /// Value, pushZero, popZero, and Index Placeholder have real,
  /// functional forms; every other type shows a "not implemented"
  /// placeholder and disables Add Item, matching Edit
  /// Item's own not-yet-implemented handling. Rectangle fields match
  /// add-item.html's real "Rectangle Properties" (X/Y Position, Width/
  /// Height — our xOffset/yOffset/xSize/ySize — plus Filled/Centered/
  /// Rounded checkboxes); Circle fields match its own "Circle
  /// Properties" (X/Y Center, Radius, and just a Filled checkbox — no
  /// Centered/Rounded, since a circle is already centred on its own
  /// offset); Arc fields are Circle's own fields (X/Y Center, Radius,
  /// Filled — relabeled "Filled (creates pie slice)") plus Start Angle
  /// (°)/Sweep Angle (°) — our start/angle fields; Label fields are X/Y
  /// Position, a multi-line Text box, Font Size (-24..24)/Alignment,
  /// Bold/Italic/Underline, and an optional Value/Decimals/Units row —
  /// matches add-item.html's real Label Properties exactly. Value/
  /// Decimals/Units are NOT part of dwgValidate.js's `label` schema
  /// (DWG_ITEM_FIELD_SCHEMA deliberately excludes them — a schema
  /// 'number' field always gets defaulted in, which would force every
  /// label to carry a phantom value) nor the real |t wire grammar itself
  /// — matches the real embedded dwgs library's label().value()/
  /// .decimals()/.units() builder, which bakes a formatted suffix into
  /// the SAME text the device transmits rather than sending them as
  /// separate wire fields (see dwgWireEncoder.js's encodeLabel/
  /// _appendFormattedValue, ported from pfodWebDesigner/src/
  /// displayTextUtils.js's addFormattedValueToText/printFloatDecimals).
  /// Only included on the built item when the user actually types a
  /// Value (Units/Decimals are independently optional too — see
  /// buildDraftItem below). Value fields (the ITEM TYPE, distinct from
  /// Label's own optional value/decimals/units suffix above) are Label's
  /// own fields (X/Y Position, Prefix Text, Font Size/Alignment, Bold/
  /// Italic/Underline) plus a required "Value Scaling Parameters" block
  /// (Integer Value/Decimals, Min/Max Value, Display Min/Max, Units) —
  /// matches add-item.html's real Value Properties and dwgValidate.js's
  /// `value` schema exactly (these ARE real, always-present wire fields,
  /// unlike label's optional suffix — dwgWireEncoder.js's encodeValue
  /// reads them directly, no _appendFormattedValue baking involved). Line
  /// fields (X Offset/Y Offset/X/Y, same underlying field names) unchanged
  /// from before. pushZero and popZero are both "control items" (add-
  /// item.js's handleControlItem()) that SKIP the shared Color/Assign
  /// Index block entirely (see hasCommonBlock below) — neither draws
  /// anything itself, so neither can be indexed/named. pushZero has
  /// X Translation/Y Translation/Scale Factor (dwgValidate.js's own
  /// `pushZero` schema: {x,y,scale}, no color field at all) and shifts
  /// the origin/scale for whatever items follow it; popZero has NO
  /// fields at all (dwgValidate.js's `popZero` schema: {}) — matches
  /// add-item.html's own wording verbatim ("Pop will restore the
  /// previous offset and scale. No additional properties are needed.")
  /// — it just restores whatever pushZero it's paired with pushed. Index
  /// Placeholder is a THIRD, different case again — no Color either
  /// (add-item.js's setupIndexItem() hides the colour picker), but
  /// unlike a control item it DOES need the Assign Index UI, just forced
  /// checked and disabled (setupIndexItem() never calls
  /// hideIndexCheckbox() — an Index Placeholder IS an index, there's
  /// nothing to toggle); its idx-name field is always visible (no
  /// unchecked state to hide it for). The other six share the same
  /// "Common Properties" block (Color: BLACK_WHITE or a palette picker;
  /// Assign Index). Live-previews via
  /// the same temp-draft pattern as Create Dwg/Edit Dwg's properties
  /// editor, except the draft here carries the dwg's REAL current items
  /// PLUS this one new item appended, so it's shown drawn in place among
  /// the dwg's actual content — not a draft dwg on its own. Cancel/Back/
  /// Exit discard the draft; Add Item commits the new item onto the REAL
  /// dwg and discards the draft.
  /// @param {HTMLElement} root
  /// @param {string} dwgName — the dwg this item is being added to
  /// @param {string} [typeOverride] — set only when the user has changed
  ///        the dropdown away from the default ('line') — drives a full
  ///        re-render of this same screen, same pattern as Edit Item's
  ///        own typeOverride.
  /// @param {object} [resumeState] — Touch Zone only: carries every field
  ///        value (including in-progress touchActions/touchActionInput)
  ///        from the SAME touchZone draft this screen was on before
  ///        navigating to the touchAction/touchActionInput sub-editor —
  ///        see _renderTouchActionEditorScreen/
  ///        _renderTouchActionInputEditorScreen's own "return to" calls.
  ///        Ignored for every other type.
  function _renderAddItemScreen(root, dwgName, typeOverride, resumeState) {
    const dwg = DwgLibrary.get(dwgName);
    if (!dwg) { _renderMainView(root); return; }

    const selectedType = typeOverride || 'line';
    const isLine = selectedType === 'line';
    const isRectangle = selectedType === 'rectangle';
    const isCircle = selectedType === 'circle';
    const isArc = selectedType === 'arc';
    const isLabel = selectedType === 'label';
    const isValue = selectedType === 'value';
    const isPushZero = selectedType === 'pushZero';
    const isPopZero = selectedType === 'popZero';
    const isIndex = selectedType === 'index';
    const isHide = selectedType === 'hide';
    const isUnhide = selectedType === 'unhide';
    const isInsertDwg = selectedType === 'insertDwg';
    const isTouchZone = selectedType === 'touchZone';
    const hasForm = isLine || isRectangle || isCircle || isArc || isLabel || isValue || isPushZero || isPopZero || isIndex || isHide || isUnhide || isInsertDwg || isTouchZone;
    // pushZero/popZero are "control items" (add-item.js's
    // handleControlItem()) — they draw nothing themselves, so neither has
    // a Color and neither can be indexed/named at all (dwgValidate.js's
    // pushZero schema is {x,y,scale}, popZero's is {} — no color
    // field). The shared Color/Assign Index block below is skipped
    // entirely for both. Index Placeholder is a DIFFERENT case again — no
    // Color either (add-item.js's setupIndexItem() hides the colour
    // picker), but it DOES need the Assign Index UI, just forced on and
    // locked (setupIndexItem() never calls hideIndexCheckbox() — an
    // Index Placeholder IS an index, there's nothing to toggle) — see its
    // own dedicated branch below rather than hasCommonBlock. Hide/Unhide
    // Item are ALSO control items (target an existing item by idxName/
    // cmdName, draw nothing themselves) — no Color, no Assign Index,
    // same as pushZero/popZero. Insert Drawing is indexed/addressed by
    // cmdName (auto-generated from the drawing name, like touchZone's own
    // cmdName), never idxName — no Color, no Assign Index either, but
    // (unlike the control items above) it DOES draw something and DOES
    // get a normal live preview. Touch Zone is the same shape again —
    // addressed by cmdName (a real, required, user-editable field, not
    // auto-generated/locked like Insert Drawing's own), no Color, no
    // Assign Index, but it DOES draw/highlight something real so it gets
    // a normal live preview too.
    const hasCommonBlock = hasForm && !isPushZero && !isPopZero && !isIndex && !isHide && !isUnhide && !isInsertDwg && !isTouchZone;

    // Both add affordances in the embedded touchActionInput/touchActions
    // list are greyed out on THIS screen — a touchActionInput/touchAction
    // attaches to a touchZone that isn't in the dwg yet.  One flag drives
    // both the greying (_buildTouchZoneItemsListHtml's disableAdds) and the
    // instruction line above the action row, so the two can't drift apart.
    // Declared out here rather than inside the touchZone fieldsHtml branch
    // because the action row is built further down, outside that branch.
    const touchZoneAddsDisabled = isTouchZone;

    // Offset defaults to the canvas centre (half the dwg's size) for
    // every type EXCEPT Insert Drawing: xOffset/yOffset there aren't "where
    // to draw at" like every other type, they SHIFT the inserted drawing's
    // own (0,0) origin — add-item.html's own real default is 0,0, "usually
    // left at (0,0) and pushZero used instead" (matches alt-a-mockup.html
    // Screen 3's own wording exactly), not the canvas centre.
    // Line/Rectangle's size defaults to a quarter of the dwg's size;
    // Circle/Arc's radius defaults to 25% of the smaller canvas dimension.
    // Sized/placed so a freshly-added item is comfortably visible on the
    // canvas rather than a tiny (10x10) shape sitting at the corner (0,0).
    const state = {
      // Not floored — item geometry is float, so on a 50x50 dwg the
      // quarter-size default is a true 12.5, not 12, and an odd canvas
      // centres on x.5 instead of snapping half a unit off centre.
      xOffset: isInsertDwg ? 0 : dwg.x / 2, yOffset: isInsertDwg ? 0 : dwg.y / 2,
      xSize: dwg.x / 4, ySize: dwg.y / 4,
      radius: Math.min(dwg.x, dwg.y) * 0.25, start: 0, angle: 90,
      text: isLabel ? 'TEXT' : (isValue ? 'Value: ' : ''), fontSize: 0, align: 'left', bold: false, italic: false, underline: false,
      // value/decimals/units: optional label-only suffix (see
      // dwgWireEncoder.js's _appendFormattedValue) — Value/Units left
      // blank by default, unlike add-item.html's own "Value: 50" default
      // for a brand new label, which would bake an unwanted "50" suffix
      // onto every new label's text. Decimals defaults to 2, matching
      // _appendFormattedValue's own default-when-blank and add-item.js's
      // own default for a new label.
      value: '', decimals: '2', units: '',
      // Value item type's own real, required wire fields (schema's
      // intValue/min/max/displayMin/displayMax/decimals/units) — distinct
      // state keys from Label's optional value/decimals/units suffix
      // above, matching add-item.html's own defaults for a new item.
      intValue: 50, min: 0, max: 100, displayMin: 0, displayMax: 1, valueDecimals: 2, valueUnits: '',
      // pushZero's own X/Y Translation + Scale Factor — distinct state
      // keys from xOffset/yOffset (which default to the canvas centre
      // for drawn items) since a translation legitimately defaults to
      // 0,0/scale 1 instead, matching add-item.html's own defaults.
      pushX: 0, pushY: 0, pushScale: 1,
      // Touch Zone's own Touch Filter — defaults to TOUCH (0, "no
      // filter"), matching add-item.html's own default selection.
      filter: 0,
      colorMode: 'blackwhite', // 'blackwhite' | 'color' — BLACK_WHITE is
                               // the real default for new items (auto-
                               // contrasts against the canvas background —
                               // dwgValidate.js's own DWG_COLOUR_BLACKWHITE
                               // default for every item type).
      color: 15,
    };
    // Resuming from the touchAction/touchActionInput sub-editor — restore
    // every field this same draft had before navigating away (see this
    // function's own @param resumeState doc). Only touchZone's own fields
    // are ever carried this way.
    if (isTouchZone && resumeState) {
      state.xOffset = resumeState.xOffset;
      state.yOffset = resumeState.yOffset;
      state.xSize = resumeState.xSize;
      state.ySize = resumeState.ySize;
      state.filter = resumeState.filter;
    }
    // Index Placeholder forces Assign Index on from the start — it IS an
    // index, there's nothing to opt into.
    const idxState = { use: isIndex, name: _nextFreeIdxName(dwg) };
    // One flat namespace across every declaring item — see
    // _collectUsedIdxNames's own doc.
    const usedIdxNames = _collectUsedIdxNames(dwg);
    // No target picked yet — Add Item stays disabled until the user
    // selects a row from the Hide/Unhide Type list below. actuallyHiddenTarget
    // stays null throughout — a brand new item hasn't been saved yet, so
    // nothing is "actually" hidden by it (see Edit Item's own doc).
    const hideState = (isHide || isUnhide) ? { hideKind: _defaultHideKind(dwg), target: null, actuallyHiddenTarget: null } : null;
    // Default to the first non-blocked candidate, if any — matches every
    // other type's own "sensible default, freely changeable" convention.
    // null when there's nothing insertable at all (Add Item stays
    // disabled — see the fieldsHtml/tail-ternary branch below).
    const insertDwgState = isInsertDwg ? {
      drawingName: (_insertDwgCandidates(dwg, dwgName).find((c) => !c.blocked) || {}).name || null,
    } : null;
    // Suggested next-free cmdName, freely editable — see
    // _nextFreeCmdName's own doc. usedCmdNames is the live-collision
    // basis for the warning below, same shape as usedIdxNames. touchActions/
    // touchActionInput default empty/null for a brand-new zone, or are
    // restored from resumeState when returning from a sub-editor.
    const touchZoneState = isTouchZone ? {
      cmdName: (resumeState && resumeState.cmdName) || _nextFreeCmdName(dwg),
      touchActions: resumeState ? resumeState.touchActions : [],
      touchActionInput: resumeState ? resumeState.touchActionInput : null,
    } : null;
    const touchZoneCenteredChecked = !!(isTouchZone && resumeState && resumeState.centered);
    const usedCmdNames = _collectUsedCmdNames(dwg);

    const typeOptionsHtml = ITEM_TYPE_OPTIONS.map((opt) =>
      '<option value="' + opt.value + '"' + (opt.value === selectedType ? ' selected' : '') + '>' + opt.label + '</option>'
    ).join('');
    const xLabel = (isRectangle || isLabel || isValue) ? 'X Position' : ((isCircle || isArc) ? 'X Center' : 'X Offset');
    const yLabel = (isRectangle || isLabel || isValue) ? 'Y Position' : ((isCircle || isArc) ? 'Y Center' : 'Y Offset');
    const wLabel = isRectangle ? 'Width' : 'X Delta';
    const hLabel = isRectangle ? 'Height' : 'Y Delta';
    const filledLabel = isArc ? 'Filled (creates pie slice)' : 'Filled';
    const alignOptionsHtml = DWG_ALIGN_VALUES.map((v) =>
      '<option value="' + v + '"' + (v === state.align ? ' selected' : '') + '>' + v[0].toUpperCase() + v.slice(1) + '</option>'
    ).join('');
    const touchFilterOptionsHtml = TOUCH_FILTER_OPTIONS.map((o) =>
      '<option value="' + o.value + '"' + (o.value === state.filter ? ' selected' : '') + '>' + _esc(o.label) + '</option>'
    ).join('');

    let fieldsHtml;
    if (isCircle || isArc) {
      fieldsHtml =
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>' + xLabel + '</label>' +
            '<input type="number" id="dcp-additem-xoffset" value="' + state.xOffset + '" step="any"></div>' +
          '<div class="dcp-field"><label>' + yLabel + '</label>' +
            '<input type="number" id="dcp-additem-yoffset" value="' + state.yOffset + '" step="any"></div>' +
        '</div>' +
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>Radius</label>' +
            '<input type="number" id="dcp-additem-radius" value="' + state.radius + '" min="0.1" step="any"></div>' +
          '<div class="dcp-field" style="flex:1; justify-content:flex-end"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
            '<input type="checkbox" id="dcp-additem-filled" style="width:auto"> ' + filledLabel + '</label></div>' +
        '</div>' +
        (isArc ?
          '<div class="dcp-field-row dcp-num-row">' +
            '<div class="dcp-field"><label>Start Angle (&deg;)</label>' +
              '<input type="number" id="dcp-additem-start" value="' + state.start + '" step="any" placeholder="0-360, +ve anti-clockwise"></div>' +
            '<div class="dcp-field"><label>Sweep Angle (&deg;)</label>' +
              '<input type="number" id="dcp-additem-angle" value="' + state.angle + '" step="any" placeholder="+ve anti-clockwise, -ve clockwise"></div>' +
          '</div>'
        : '');
    } else if (isLabel) {
      fieldsHtml =
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>' + xLabel + '</label>' +
            '<input type="number" id="dcp-additem-xoffset" value="' + state.xOffset + '" step="any"></div>' +
          '<div class="dcp-field"><label>' + yLabel + '</label>' +
            '<input type="number" id="dcp-additem-yoffset" value="' + state.yOffset + '" step="any"></div>' +
        '</div>' +
        '<div class="dcp-field">' +
          '<label>Text</label>' +
          '<textarea id="dcp-additem-text" rows="1" style="resize:vertical">' + _esc(state.text) + '</textarea>' +
        '</div>' +
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>Font Size</label>' +
            '<input type="number" id="dcp-additem-fontsize" value="' + state.fontSize + '" min="-24" max="24" step="1"></div>' +
          '<div class="dcp-field"><label>Alignment</label>' +
            '<select id="dcp-additem-align" style="width:50%">' + alignOptionsHtml + '</select></div>' +
        '</div>' +
        '<div class="dcp-field-row">' +
          '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
            '<input type="checkbox" id="dcp-additem-bold" style="width:auto"> Bold</label></div>' +
          '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
            '<input type="checkbox" id="dcp-additem-italic" style="width:auto"> Italic</label></div>' +
          '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
            '<input type="checkbox" id="dcp-additem-underline" style="width:auto"> Underline</label></div>' +
        '</div>' +
        '<div class="dcp-field-row">' +
          '<div class="dcp-field" style="flex:0 0 50%"><label>Value <span style="text-transform:none; font-weight:400">(optional)</span></label>' +
            '<input type="text" id="dcp-additem-value" value="' + _esc(state.value) + '" placeholder="Optional"></div>' +
          '<div class="dcp-field" style="flex:0 0 25%"><label>Decimals</label>' +
            '<input type="number" id="dcp-additem-decimals" value="' + _esc(state.decimals) + '" min="-6" max="6"></div>' +
        '</div>' +
        '<div class="dcp-field" style="width:25%">' +
          '<label>Units <span style="text-transform:none; font-weight:400">(optional)</span></label>' +
          '<input type="text" id="dcp-additem-units" value="' + _esc(state.units) + '" placeholder="Optional (e.g., mm, V, %)"></div>';
    } else if (isValue) {
      fieldsHtml =
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>' + xLabel + '</label>' +
            '<input type="number" id="dcp-additem-xoffset" value="' + state.xOffset + '" step="any"></div>' +
          '<div class="dcp-field"><label>' + yLabel + '</label>' +
            '<input type="number" id="dcp-additem-yoffset" value="' + state.yOffset + '" step="any"></div>' +
        '</div>' +
        '<div class="dcp-field">' +
          '<label>Prefix Text</label>' +
          '<textarea id="dcp-additem-text" rows="1" style="resize:vertical">' + _esc(state.text) + '</textarea>' +
        '</div>' +
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>Font Size</label>' +
            '<input type="number" id="dcp-additem-fontsize" value="' + state.fontSize + '" min="-24" max="24" step="1"></div>' +
          '<div class="dcp-field"><label>Alignment</label>' +
            '<select id="dcp-additem-align" style="width:50%">' + alignOptionsHtml + '</select></div>' +
        '</div>' +
        '<div class="dcp-field-row">' +
          '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
            '<input type="checkbox" id="dcp-additem-bold" style="width:auto"> Bold</label></div>' +
          '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
            '<input type="checkbox" id="dcp-additem-italic" style="width:auto"> Italic</label></div>' +
          '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
            '<input type="checkbox" id="dcp-additem-underline" style="width:auto"> Underline</label></div>' +
        '</div>' +
        '<div class="dcp-helper" style="font-weight:600; margin:12px 0 6px">Value Scaling Parameters</div>' +
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>Integer Value</label>' +
            '<input type="number" id="dcp-additem-intvalue" value="' + state.intValue + '"></div>' +
          '<div class="dcp-field"><label>Decimals</label>' +
            '<input type="number" id="dcp-additem-valuedecimals" value="' + state.valueDecimals + '" min="-6" max="6"></div>' +
        '</div>' +
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>Min Value</label>' +
            '<input type="number" id="dcp-additem-min" value="' + state.min + '"></div>' +
          '<div class="dcp-field"><label>Max Value</label>' +
            '<input type="number" id="dcp-additem-max" value="' + state.max + '" style="width:87.5px"></div>' +
          '<div class="dcp-field"><label>Display Min</label>' +
            '<input type="number" id="dcp-additem-displaymin" value="' + state.displayMin + '" step="any"></div>' +
          '<div class="dcp-field"><label>Display Max</label>' +
            '<input type="number" id="dcp-additem-displaymax" value="' + state.displayMax + '" step="any" style="width:87.5px"></div>' +
        '</div>' +
        '<div class="dcp-field" style="width:25%">' +
          '<label>Units</label>' +
          '<input type="text" id="dcp-additem-valueunits" value="' + _esc(state.valueUnits) + '" placeholder="e.g., V, C, %"></div>';
    } else if (isPushZero) {
      fieldsHtml =
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>X Translation</label>' +
            '<input type="number" id="dcp-additem-push-x" value="' + state.pushX + '" step="any"></div>' +
          '<div class="dcp-field"><label>Y Translation</label>' +
            '<input type="number" id="dcp-additem-push-y" value="' + state.pushY + '" step="any"></div>' +
        '</div>' +
        '<div class="dcp-field">' +
          '<label>Scale Factor</label>' +
          '<input type="number" id="dcp-additem-push-scale" value="' + state.pushScale + '" step="any" style="width:70px"></div>' +
        '<div class="dcp-helper" style="margin:4px 0 16px">No Color or Assign Index here — pushZero doesn\'t draw anything itself, it just shifts the origin/scale for whatever items follow it in the list, until a matching popZero restores the previous one.</div>';
    } else if (isPopZero) {
      // No fields at all — matches add-item.html's own wording verbatim
      // ("Pop will restore the previous offset and scale. No additional
      // properties are needed."). Also a control item — no Color/Assign
      // Index (hasCommonBlock excludes it too).
      fieldsHtml =
        '<div class="dcp-helper" style="margin:4px 0 16px">Pop will restore the previous offset and scale. No additional properties are needed. No Color or Assign Index either — popZero draws nothing itself.</div>';
    } else if (isIndex) {
      // No other fields — the Assign Index row itself (forced on,
      // locked) is built separately, below, since it's NOT paired with a
      // Color block the way every other indexable type is.
      fieldsHtml =
        '<div class="dcp-helper" style="margin:4px 0 16px">Index placeholder reserves an index without drawing anything. Only an index number is needed.</div>';
    } else if (isHide || isUnhide) {
      // Control item — targets an EXISTING item/touchZone/insertDwg by
      // idxName or cmdName, no Color/Assign Index (hasCommonBlock
      // excludes both too). Hide/Unhide Type picks which category
      // populates the scrollable candidate list below it; the list
      // itself and its Show/Hide-or-Unhide row actions are built/wired
      // by wireHideScreen() after root.innerHTML is assigned (matches
      // buildColorPopup()'s own build-into-a-container-after-assignment
      // pattern) — see its own doc for how it distinguishes Hide from
      // Unhide (the two only ever differ in wording and which candidates
      // are selectable, never in structure).
      fieldsHtml =
        '<div class="dcp-helper" style="margin:4px 0 12px">' + (isUnhide
          ? 'Unhide makes a previously hidden item visible again.'
          : 'Hide makes the item with the specified index or command invisible.') + '</div>' +
        '<div class="dcp-field">' +
          '<label>' + (isUnhide ? 'Unhide Type' : 'Hide Type') + '</label>' +
          '<select id="dcp-additem-hidetype" style="width:60%">' +
            ['index', 'touchZone', 'insertDwg'].map((k) =>
              '<option value="' + k + '"' + (k === hideState.hideKind ? ' selected' : '') + '>' + _hideKindLabel(k) + '</option>'
            ).join('') +
          '</select>' +
        '</div>' +
        '<div class="dcp-field">' +
          '<label id="dcp-additem-hide-label">Available ' + _hideKindLabel(hideState.hideKind) + ' (select item to ' + (isUnhide ? 'unhide' : 'hide') + ')</label>' +
          '<div id="dcp-additem-hide-list"></div>' +
        '</div>';
    } else if (isInsertDwg) {
      // Control item, same as pushZero/popZero/Hide/Unhide (no Color, no
      // Assign Index — hasCommonBlock excludes it too) — but UNLIKE those,
      // it draws something real (the nested dwg), so it gets a normal
      // live preview like any drawable type, wired the ordinary way
      // below rather than through wireHideScreen()'s own no-live-preview
      // path. Candidate list built by _insertDwgCandidates (own doc) —
      // the currently selected drawing's cmdName is auto-derived and
      // shown read-only, matching add-item.html's own
      // generateInsertDwgCommandName()/readonly field exactly.
      const candidates = _insertDwgCandidates(dwg, dwgName);
      fieldsHtml =
        '<div class="dcp-field">' +
          '<label>Drawing to insert</label>' +
          (candidates.length === 0
            ? '<div class="dcp-helper" style="margin:4px 0">No other drawings in the library to insert — Load Dwg from file below, or create another dwg first.</div>'
            : '<select id="dcp-additem-insertdwg-name">' +
                candidates.map((c) => {
                  const candidateDwg = DwgLibrary.get(c.name);
                  const label = candidateDwg ? _describeDwgForInsert(candidateDwg) : c.name;
                  return '<option value="' + _esc(c.name) + '"' +
                    (c.blocked ? ' disabled' : '') +
                    (c.name === insertDwgState.drawingName ? ' selected' : '') + '>' +
                    _esc(label) + (c.blocked ? ' — already used elsewhere in this drawing' : '') +
                    '</option>';
                }).join('') +
              '</select>') +
        '</div>' +
        '<div class="dcp-field">' +
          '<label>Command name</label>' +
          '<input type="text" id="dcp-additem-insertdwg-cmdname" value="' +
            _esc(insertDwgState.drawingName ? 'dwg_' + insertDwgState.drawingName : '') + '" readonly>' +
          '<div class="dcp-helper">Auto-generated from the drawing name (dwg_DrawingName)</div>' +
        '</div>' +
        '<div class="dcp-field">' +
          '<label>Insert position</label>' +
          '<div class="dcp-helper" style="margin-bottom:8px">Set the (0,0) position in the inserted drawing. Positive X/Y moves the inserted dwg up and to the left. Usually left at (0,0) and pushZero used instead.</div>' +
          '<div class="dcp-field-row dcp-num-row">' +
            '<div class="dcp-field"><label>X zero</label>' +
              '<input type="number" id="dcp-additem-xoffset" value="' + state.xOffset + '" step="any"></div>' +
            '<div class="dcp-field"><label>Y zero</label>' +
              '<input type="number" id="dcp-additem-yoffset" value="' + state.yOffset + '" step="any"></div>' +
          '</div>' +
        '</div>';
    } else if (isTouchZone) {
      // No Color, no Assign Index — a touchZone is addressed by its
      // Command Name, not an index (matches Insert Drawing's own no-idx
      // addressing, and add-item.html's own setupTouchZoneItem(), which
      // hides the colour picker). UNLIKE Insert Drawing's cmdName,
      // Command Name here is real, required, and freely user-editable —
      // live-deduped against every other touchZone/insertDwg cmdName the
      // same way idxName is (usedCmdNames/_dedupeName), rather than
      // auto-generated and locked read-only. The embedded touchActionInput/
      // touchActions list (alt-a-mockup.html Screen 3m's own — replaces
      // the old standalone Touch Actions Manager screen) is built by
      // _buildTouchZoneItemsListHtml; its own "+Add"/edit/remove buttons
      // are wired below, after root.innerHTML is assigned.
      fieldsHtml =
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>X Position</label>' +
            '<input type="number" id="dcp-additem-xoffset" value="' + state.xOffset + '" step="any"></div>' +
          '<div class="dcp-field"><label>Y Position</label>' +
            '<input type="number" id="dcp-additem-yoffset" value="' + state.yOffset + '" step="any"></div>' +
          '<div class="dcp-field"><label>Width</label>' +
            '<input type="number" id="dcp-additem-xsize" value="' + state.xSize + '" step="any"></div>' +
          '<div class="dcp-field"><label>Height</label>' +
            '<input type="number" id="dcp-additem-ysize" value="' + state.ySize + '" step="any"></div>' +
        '</div>' +
        '<div class="dcp-field-row" style="align-items:flex-end">' +
          '<div class="dcp-field" style="flex:1"><label>Command Name <span style="text-transform:none; font-weight:400">(required — can be edited)</span></label>' +
            '<input type="text" id="dcp-additem-touchzone-cmdname" value="' + _esc(touchZoneState.cmdName) + '" maxlength="50"></div>' +
          '<div class="dcp-field" style="flex:1">' +
            '<label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px; margin-bottom:2px">' +
              '<input type="checkbox" id="dcp-additem-centered"' + (touchZoneCenteredChecked ? ' checked' : '') + ' style="width:auto"> Centered</label>' +
            '<label>Touch Filter</label>' +
            '<select id="dcp-additem-touchzone-filter" style="width:100%">' + touchFilterOptionsHtml + '</select></div>' +
        '</div>' +
        '<div class="dcp-helper" id="dcp-additem-touchzone-cmdname-warning" style="display:none; color:#8f2a1f">Command name already used, will be dedupped on Add Item</div>' +
        '<div class="dcp-helper" style="margin:4px 0 16px">No Color or Assign Index — a touchZone is addressed by its Command Name, not an index.</div>' +
        '<div id="dcp-additem-touchzone-items">' + _buildTouchZoneItemsListHtml('dcp-additem', touchZoneState, dwg, touchZoneAddsDisabled) + '</div>';
    } else {
      fieldsHtml =
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>' + xLabel + '</label>' +
            '<input type="number" id="dcp-additem-xoffset" value="' + state.xOffset + '" step="any"></div>' +
          '<div class="dcp-field"><label>' + yLabel + '</label>' +
            '<input type="number" id="dcp-additem-yoffset" value="' + state.yOffset + '" step="any"></div>' +
        '</div>' +
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>' + wLabel + '</label>' +
            '<input type="number" id="dcp-additem-xsize" value="' + state.xSize + '" step="any"></div>' +
          '<div class="dcp-field"><label>' + hLabel + '</label>' +
            '<input type="number" id="dcp-additem-ysize" value="' + state.ySize + '" step="any"></div>' +
        '</div>' +
        (isRectangle ?
          '<div class="dcp-field-row">' +
            '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
              '<input type="checkbox" id="dcp-additem-filled" style="width:auto"> Filled</label></div>' +
            '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
              '<input type="checkbox" id="dcp-additem-centered" style="width:auto"> Centered</label></div>' +
            '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
              '<input type="checkbox" id="dcp-additem-rounded" style="width:auto"> Rounded</label></div>' +
          '</div>'
        : '');
    }

    root.innerHTML =
      '<div class="dcp-back-row">' +
        '<button type="button" class="dcp-back-link" id="dcp-additem-cancel">&larr; Cancel, back to ' + _esc(dwgName) + '</button>' +
        '<button type="button" class="dcp-back-link dcp-exit" id="dcp-exit-designer">Exit Designer</button>' +
      '</div>' +
      '<h1 class="dcp-title">Add Item to ' + _esc(dwgName) + '</h1>' +
      '<div class="dcp-field">' +
        '<label>Item type</label>' +
        '<select id="dcp-additem-type" style="width:50%">' + typeOptionsHtml + '</select>' +
      '</div>' +
      (hasCommonBlock ?
        fieldsHtml +
        '<div class="dcp-field">' +
          '<label>Color</label>' +
          '<div class="dcp-color-field" id="dcp-additem-color-field">' +
            '<div class="dcp-color-header">' +
              '<button type="button" class="dcp-color-toggle-btn" id="dcp-additem-bw-btn">BLACK_WHITE</button>' +
              '<button type="button" class="dcp-color-toggle-btn" id="dcp-additem-color-btn">Color</button>' +
              '<span class="dcp-swatch-num">' +
                '<span class="dcp-swatch-lg" id="dcp-additem-color-swatch"></span>' +
                '<span class="dcp-num" id="dcp-additem-color-num"></span>' +
              '</span>' +
            '</div>' +
            '<div class="dcp-color-popup" id="dcp-additem-color-popup" style="display:none"></div>' +
          '</div>' +
        '</div>' +
        '<div class="dcp-action-row" style="justify-content:space-between; align-items:center; margin-top:4px">' +
          '<label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
            '<input type="checkbox" id="dcp-additem-use-index" style="width:auto"> Assign Index' +
          '</label>' +
          '<div style="display:flex; gap:8px">' +
            '<button type="button" class="dcp-btn dcp-btn-ghost" id="dcp-additem-cancel-2">Cancel</button>' +
            '<button type="button" class="dcp-btn dcp-btn-primary" id="dcp-additem-submit">Add Item</button>' +
          '</div>' +
        '</div>' +
        '<input type="text" id="dcp-additem-idx-name" value="' + _esc(idxState.name) + '" style="display:none; margin-top:6px; width:25%">' +
        '<div class="dcp-helper" id="dcp-additem-idx-name-warning" style="display:none; color:#8f2a1f">Index name already used, will be dedupped on Add Item</div>'
      : isIndex ?
        // Index Placeholder — Assign Index forced on and locked (checked
        // disabled, opacity dimmed to show it's non-interactive), no
        // Color block at all, idx-name field always visible (never
        // hidden — there's no unchecked state to hide it for).
        fieldsHtml +
        '<div class="dcp-action-row" style="justify-content:space-between; align-items:center; margin-top:4px">' +
          '<label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px; opacity:.7">' +
            '<input type="checkbox" checked disabled style="width:auto"> Assign Index' +
          '</label>' +
          '<div style="display:flex; gap:8px">' +
            '<button type="button" class="dcp-btn dcp-btn-ghost" id="dcp-additem-cancel-2">Cancel</button>' +
            '<button type="button" class="dcp-btn dcp-btn-primary" id="dcp-additem-submit">Add Item</button>' +
          '</div>' +
        '</div>' +
        '<div class="dcp-helper" style="margin:2px 0 6px">Forced on — an Index Placeholder <i>is</i> an index, there\'s nothing to toggle</div>' +
        '<input type="text" id="dcp-additem-idx-name" value="' + _esc(idxState.name) + '" style="width:25%">' +
        '<div class="dcp-helper" id="dcp-additem-idx-name-warning" style="display:none; color:#8f2a1f">Index name already used, will be dedupped on Add Item</div>'
      : hasForm ?
        // pushZero/popZero (and any future control item) — real fields,
        // no Color/Assign Index block, so the action row stands alone.
        // Insert Drawing gets an extra ghost button on the left (Load Dwg
        // from file…, matching Create Dwg's own identical action-row
        // layout) — space-between instead of flex-end to make room.
        fieldsHtml +
        (isInsertDwg
          ? '<div class="dcp-action-row" style="justify-content:space-between; margin-top:16px">' +
              '<button type="button" class="dcp-btn dcp-btn-ghost" id="dcp-additem-load-dwg-file">Load Dwg from file&hellip;</button>' +
              '<div style="display:flex; gap:8px">' +
                '<button type="button" class="dcp-btn dcp-btn-ghost" id="dcp-additem-cancel-2">Cancel</button>' +
                '<button type="button" class="dcp-btn dcp-btn-primary" id="dcp-additem-submit"' +
                  (insertDwgState.drawingName ? '' : ' disabled') + '>Add Item</button>' +
              '</div>' +
            '</div>'
          // touchZone only: the instruction explaining why both add
          // affordances in the list above are greyed out. Sits immediately
          // above the Cancel/Add Item row so it reads as the next step.
          // Bold 13px and near-black, vs .dcp-helper's own 11px regular
          // #5b6675 — an instruction to act on, not background detail.
          : (touchZoneAddsDisabled
              ? '<div class="dcp-helper" style="margin:16px 0 4px; font-weight:700; font-size:13px; color:#1b2430">Add touchZone first and then edit it to add touchActionInput or touchActions</div>'
              : '') +
            '<div class="dcp-action-row" style="justify-content:flex-end; margin-top:' + (touchZoneAddsDisabled ? '4px' : '16px') + '">' +
              '<button type="button" class="dcp-btn dcp-btn-ghost" id="dcp-additem-cancel-2">Cancel</button>' +
              '<button type="button" class="dcp-btn dcp-btn-primary" id="dcp-additem-submit">Add Item</button>' +
            '</div>')
      :
        '<div class="dcp-helper" style="margin:8px 0 16px">Adding "' + _esc(selectedType) + '" items is not implemented yet — only Line, Rectangle, Circle, Arc, Label, Value, touchZone, insertDwg, pushZero, popZero, Index Placeholder, Hide Item, and Unhide Item are supported so far.</div>' +
        '<div class="dcp-action-row" style="justify-content:flex-end; margin-top:16px">' +
          '<button type="button" class="dcp-btn dcp-btn-ghost" id="dcp-additem-cancel-2">Cancel</button>' +
          '<button type="button" class="dcp-btn dcp-btn-primary" id="dcp-additem-submit" disabled>Add Item</button>' +
        '</div>'
      );

    root.querySelector('#dcp-additem-type').addEventListener('change', (e) => {
      // Discard whatever draft the PREVIOUS type selection may have
      // written before switching — same reasoning as Edit Item's own
      // type-change handler.
      DwgLibrary.remove(ADD_ITEM_DRAFT_NAME);
      _renderAddItemScreen(root, dwgName, e.target.value);
    });

    function discardDraftAndReturn() {
      DwgLibrary.remove(ADD_ITEM_DRAFT_NAME);
      _renderEditDwgScreen(root, dwgName);
    }
    root.querySelector('#dcp-additem-cancel').addEventListener('click', discardDraftAndReturn);
    root.querySelector('#dcp-additem-cancel-2').addEventListener('click', discardDraftAndReturn);
    root.querySelector('#dcp-exit-designer').addEventListener('click', () => {
      DwgLibrary.remove(ADD_ITEM_DRAFT_NAME);
      _exitDesigner();
    });

    if (!hasForm) {
      // No fields, no draft, Add Item is disabled — show the real,
      // unmodified dwg (the draft was already discarded above, either by
      // the type-change handler or never existed on first render).
      _renderPreview(dwgName);
      return;
    }

    const xOffsetInput = root.querySelector('#dcp-additem-xoffset');
    const yOffsetInput = root.querySelector('#dcp-additem-yoffset');
    const xSizeInput = root.querySelector('#dcp-additem-xsize');
    const ySizeInput = root.querySelector('#dcp-additem-ysize');
    const radiusInput = (isCircle || isArc) ? root.querySelector('#dcp-additem-radius') : null;
    const startInput = isArc ? root.querySelector('#dcp-additem-start') : null;
    const angleInput = isArc ? root.querySelector('#dcp-additem-angle') : null;
    const filledCheckbox = (isRectangle || isCircle || isArc) ? root.querySelector('#dcp-additem-filled') : null;
    const centeredCheckbox = (isRectangle || isTouchZone) ? root.querySelector('#dcp-additem-centered') : null;
    const roundedCheckbox = isRectangle ? root.querySelector('#dcp-additem-rounded') : null;
    const touchZoneCmdNameInput = isTouchZone ? root.querySelector('#dcp-additem-touchzone-cmdname') : null;
    const touchZoneFilterSelect = isTouchZone ? root.querySelector('#dcp-additem-touchzone-filter') : null;
    const textInput = (isLabel || isValue) ? root.querySelector('#dcp-additem-text') : null;
    const fontSizeInput = (isLabel || isValue) ? root.querySelector('#dcp-additem-fontsize') : null;
    const alignSelect = (isLabel || isValue) ? root.querySelector('#dcp-additem-align') : null;
    const boldCheckbox = (isLabel || isValue) ? root.querySelector('#dcp-additem-bold') : null;
    const italicCheckbox = (isLabel || isValue) ? root.querySelector('#dcp-additem-italic') : null;
    const underlineCheckbox = (isLabel || isValue) ? root.querySelector('#dcp-additem-underline') : null;
    const valueInput = isLabel ? root.querySelector('#dcp-additem-value') : null;
    const decimalsInput = isLabel ? root.querySelector('#dcp-additem-decimals') : null;
    const unitsInput = isLabel ? root.querySelector('#dcp-additem-units') : null;
    const intValueInput = isValue ? root.querySelector('#dcp-additem-intvalue') : null;
    const valueDecimalsInput = isValue ? root.querySelector('#dcp-additem-valuedecimals') : null;
    const minInput = isValue ? root.querySelector('#dcp-additem-min') : null;
    const maxInput = isValue ? root.querySelector('#dcp-additem-max') : null;
    const displayMinInput = isValue ? root.querySelector('#dcp-additem-displaymin') : null;
    const displayMaxInput = isValue ? root.querySelector('#dcp-additem-displaymax') : null;
    const valueUnitsInput = isValue ? root.querySelector('#dcp-additem-valueunits') : null;
    const pushXInput = isPushZero ? root.querySelector('#dcp-additem-push-x') : null;
    const pushYInput = isPushZero ? root.querySelector('#dcp-additem-push-y') : null;
    const pushScaleInput = isPushZero ? root.querySelector('#dcp-additem-push-scale') : null;
    const useIndexCheckbox = root.querySelector('#dcp-additem-use-index');
    const idxNameInput = root.querySelector('#dcp-additem-idx-name');

    /// Build the (not-yet-committed) item — Line, Rectangle, Circle, Arc,
    /// Label, or Value depending on selectedType — from current form state.
    /// @param {boolean} [dedupe] — false (default, used by the live
    ///        preview) keeps whatever idxName the user actually typed,
    ///        collision and all, so the preview honestly reflects the
    ///        current form state and the on-screen warning. true (used
    ///        only at Add Item commit time) silently renames a colliding
    ///        name to the next free "<name>_1", "<name>_2", ... variant —
    ///        the warning already told the user this would happen.
    function buildDraftItem(dedupe) {
      let item;
      if (isPushZero) {
        // No color/indexed/idxName — pushZero is a control item, not a
        // drawable/addressable one (see hasCommonBlock's own doc).
        return { type: 'pushZero', x: parseFloat(pushXInput.value) || 0, y: parseFloat(pushYInput.value) || 0, scale: parseFloat(pushScaleInput.value) || 1 };
      } else if (isPopZero) {
        // No fields, no color, no idxName — matches pushZero's own doc.
        return { type: 'popZero' };
      } else if (isHide || isUnhide) {
        // No color/indexed/idxName block either — targets an EXISTING
        // item/touchZone/insertDwg directly by idxName or cmdName,
        // picked via the candidate list (Add Item stays disabled until
        // hideState.target is set, so this is always populated here).
        return { type: (isHide ? 'hide' : 'unhide'), [hideState.target.field]: hideState.target.value };
      } else if (isInsertDwg) {
        // No color/idxName — addressed by cmdName instead (Add Item stays
        // disabled until insertDwgState.drawingName is set, so this is
        // always populated here). cmdName is always the auto-generated
        // "dwg_<drawingName>" — never independently user-editable, so
        // there's nothing to dedupe/collide-check beyond what
        // _insertDwgCandidates already excluded from being selectable.
        return {
          type: 'insertDwg',
          drawingName: insertDwgState.drawingName,
          cmdName: 'dwg_' + insertDwgState.drawingName,
          xOffset: _readNum(xOffsetInput.value, 0),
          yOffset: _readNum(yOffsetInput.value, 0),
        };
      } else if (isTouchZone) {
        // No color/idxName — addressed by cmdName instead, same as
        // Insert Drawing, but here it's a real user-editable field
        // (dedupe=true, at commit time only, silently renames a
        // colliding name — the live warning already told the user this
        // would happen, same convention as idxName's own dedupe).
        // touchActions/touchActionInput come from touchZoneState — built
        // up via the embedded list's own +Add/edit/remove wiring (see
        // _renderTouchActionEditorScreen/_renderTouchActionInputEditorScreen),
        // not from this form's own fields.
        {
          const zoneItem = {
            type: 'touchZone',
            xOffset: _readNum(xOffsetInput.value, 0),
            yOffset: _readNum(yOffsetInput.value, 0),
            xSize: _readNum(xSizeInput.value, 1),
            ySize: _readNum(ySizeInput.value, 1),
            filter: parseInt(touchZoneFilterSelect.value, 10) || 0,
            centered: centeredCheckbox.checked,
            cmdName: dedupe ? _dedupeName(touchZoneState.cmdName.trim() || 'cmd_c1', usedCmdNames) : (touchZoneState.cmdName.trim() || 'cmd_c1'),
          };
          if (touchZoneState.touchActions.length > 0) zoneItem.touchActions = touchZoneState.touchActions.slice();
          if (touchZoneState.touchActionInput) zoneItem.touchActionInput = touchZoneState.touchActionInput;
          return zoneItem;
        }
      } else if (isIndex) {
        // No color — idxName gets attached below by the same shared
        // idxState logic every other indexable type uses (idxState.use
        // is forced true for Index Placeholder, so this always fires).
        item = { type: 'index' };
      } else if (isRectangle) {
        item = {
          type: 'rectangle',
          xOffset: _readNum(xOffsetInput.value, 0),
          yOffset: _readNum(yOffsetInput.value, 0),
          xSize: _readNum(xSizeInput.value, 1),
          ySize: _readNum(ySizeInput.value, 1),
          filled: filledCheckbox.checked,
          centered: centeredCheckbox.checked,
          rounded: roundedCheckbox.checked,
          color: (state.colorMode === 'blackwhite') ? -1 : state.color,
        };
      } else if (isCircle) {
        item = {
          type: 'circle',
          xOffset: _readNum(xOffsetInput.value, 0),
          yOffset: _readNum(yOffsetInput.value, 0),
          radius: parseFloat(radiusInput.value) || 1,
          filled: filledCheckbox.checked,
          color: (state.colorMode === 'blackwhite') ? -1 : state.color,
        };
      } else if (isArc) {
        item = {
          type: 'arc',
          xOffset: _readNum(xOffsetInput.value, 0),
          yOffset: _readNum(yOffsetInput.value, 0),
          radius: parseFloat(radiusInput.value) || 1,
          start: parseFloat(startInput.value) || 0,
          angle: parseFloat(angleInput.value) || 0,
          filled: filledCheckbox.checked,
          color: (state.colorMode === 'blackwhite') ? -1 : state.color,
        };
      } else if (isLabel) {
        item = {
          type: 'label',
          xOffset: _readNum(xOffsetInput.value, 0),
          yOffset: _readNum(yOffsetInput.value, 0),
          text: textInput.value,
          fontSize: parseInt(fontSizeInput.value, 10) || 0,
          align: alignSelect.value,
          bold: boldCheckbox.checked,
          italic: italicCheckbox.checked,
          underline: underlineCheckbox.checked,
          color: (state.colorMode === 'blackwhite') ? -1 : state.color,
        };
        // value/decimals/units: optional, independently-included suffix
        // fields — matches pfodWebDesigner/src/add-item.js's own three
        // separate "if not empty" checks exactly (Units/Decimals CAN be
        // set without Value, even though they only take visible effect
        // once Value is also set — see dwgWireEncoder.js's
        // _appendFormattedValue).
        if (valueInput.value !== '') item.value = parseFloat(valueInput.value);
        if (decimalsInput.value !== '') item.decimals = parseInt(decimalsInput.value, 10);
        if (unitsInput.value !== '') item.units = unitsInput.value;
      } else if (isValue) {
        item = {
          type: 'value',
          xOffset: _readNum(xOffsetInput.value, 0),
          yOffset: _readNum(yOffsetInput.value, 0),
          text: textInput.value,
          fontSize: parseInt(fontSizeInput.value, 10) || 0,
          align: alignSelect.value,
          bold: boldCheckbox.checked,
          italic: italicCheckbox.checked,
          underline: underlineCheckbox.checked,
          intValue: parseInt(intValueInput.value, 10) || 0,
          min: parseFloat(minInput.value) || 0,
          max: parseFloat(maxInput.value) || 1,
          displayMin: parseFloat(displayMinInput.value) || 0,
          displayMax: parseFloat(displayMaxInput.value) || 1,
          decimals: parseInt(valueDecimalsInput.value, 10) || 0,
          units: valueUnitsInput.value,
          color: (state.colorMode === 'blackwhite') ? -1 : state.color,
        };
      } else {
        item = {
          type: 'line',
          xOffset: _readNum(xOffsetInput.value, 0),
          yOffset: _readNum(yOffsetInput.value, 0),
          xSize: _readNum(xSizeInput.value, 1),
          ySize: _readNum(ySizeInput.value, 1),
          color: (state.colorMode === 'blackwhite') ? -1 : state.color,
        };
      }
      if (idxState.use && idxState.name.trim()) {
        item.indexed = true;
        item.idxName = dedupe ? _dedupeName(idxState.name.trim(), usedIdxNames) : idxState.name.trim();
      }
      return item;
    }

    /// Show/hide the "Index name already used" warning based on whatever
    /// is CURRENTLY typed — live, not just on submit, so the user knows
    /// before clicking Add Item that this name will be renamed.
    function updateIdxNameWarning() {
      const collides = idxState.use && idxState.name.trim() && usedIdxNames.has(idxState.name.trim());
      root.querySelector('#dcp-additem-idx-name-warning').style.display = collides ? 'block' : 'none';
    }

    /// Same live "will be dedupped" warning as updateIdxNameWarning, for
    /// Touch Zone's own Command Name field.
    function updateCmdNameWarning() {
      const collides = touchZoneState.cmdName.trim() && usedCmdNames.has(touchZoneState.cmdName.trim());
      root.querySelector('#dcp-additem-touchzone-cmdname-warning').style.display = collides ? 'block' : 'none';
    }

    /// Save this dwg's REAL items plus the draft line item appended,
    /// under the fixed draft name, and re-fire the real preview — same
    /// pattern as Create Dwg/Edit Dwg's own live-preview.
    function updatePreview() {
      const raw = {
        name: ADD_ITEM_DRAFT_NAME,
        x: dwg.x, y: dwg.y, refresh: dwg.refresh, color: dwg.color,
        items: flattenTouchActions(dwg.items).concat([buildDraftItem()]),
      };
      const { dwg: draftDwg } = validateAndRepairDwg(raw, ADD_ITEM_DRAFT_NAME);
      DwgLibrary.saveHidden(draftDwg);
      _dwgDesignerAdapter.device.invalidatePreviewVersion(ADD_ITEM_DRAFT_NAME);
      _renderPreview(ADD_ITEM_DRAFT_NAME);
    }

    // Numeric fields update the preview on blur, Enter, or after a 0.5s
    // pause in typing — matches Create Dwg/Edit Dwg's own debounce.
    let previewDebounce = null;
    function scheduleUpdatePreview() {
      if (previewDebounce) clearTimeout(previewDebounce);
      previewDebounce = setTimeout(updatePreview, 500);
    }
    [xOffsetInput, yOffsetInput, xSizeInput, ySizeInput, radiusInput, startInput, angleInput, textInput, fontSizeInput, valueInput, decimalsInput, unitsInput, intValueInput, valueDecimalsInput, minInput, maxInput, displayMinInput, displayMaxInput, valueUnitsInput, pushXInput, pushYInput, pushScaleInput].filter(Boolean).forEach((input) => {
      input.addEventListener('input', scheduleUpdatePreview);
      input.addEventListener('blur', () => {
        if (previewDebounce) { clearTimeout(previewDebounce); previewDebounce = null; }
        updatePreview();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (previewDebounce) { clearTimeout(previewDebounce); previewDebounce = null; }
          updatePreview();
        }
      });
    });
    if (alignSelect) alignSelect.addEventListener('change', updatePreview);

    function buildColorPopup() {
      const popup = root.querySelector('#dcp-additem-color-popup');

      const sections = [
        { title: 'Standard Colors (0-15)', from: 0, to: 15 },
        { title: '216 Colors (16-231)', from: 16, to: 231 },
        { title: 'Grayscale (232-255)', from: 232, to: 255 },
      ];
      let html = '';
      sections.forEach((section) => {
        html += '<div class="dcp-color-section-title">' + section.title + '</div><div class="dcp-color-row">';
        for (let i = section.from; i <= section.to; i++) {
          html += '<span class="dcp-color-cell" data-color="' + i + '" style="background:' + _swatchHex(i) + '"></span>';
        }
        html += '</div>';
      });
      popup.innerHTML = html;
      popup.querySelectorAll('.dcp-color-cell').forEach((cell) => {
        cell.addEventListener('click', () => {
          state.color = parseInt(cell.getAttribute('data-color'), 10);
          state.colorMode = 'color';
          updateColorHeader();
          updatePreview();
          popup.style.display = 'none';
        });
      });
    }

    /// Reflect state.colorMode/state.color in the BLACK_WHITE/Color
    /// toggle buttons' active highlighting and the swatch/number readout
    /// — BLACK_WHITE shows the dwg's own background swatch (this item
    /// will auto-contrast against it, same as _swatchHex's -1 handling
    /// elsewhere) with an "(auto)" label, not a selectable colour number.
    function updateColorHeader() {
      const isBW = state.colorMode === 'blackwhite';
      root.querySelector('#dcp-additem-bw-btn').classList.toggle('dcp-mode-active', isBW);
      root.querySelector('#dcp-additem-color-btn').classList.toggle('dcp-mode-active', !isBW);
      root.querySelector('#dcp-additem-color-swatch').style.background =
        isBW ? _swatchHex(-1, dwg.color) : _swatchHex(state.color);
      root.querySelector('#dcp-additem-color-num').textContent = isBW ? 'BLACK_WHITE (auto)' : ('Color ' + state.color);
      root.querySelectorAll('#dcp-additem-color-popup .dcp-color-cell').forEach((cell) => {
        cell.classList.toggle('dcp-selected', !isBW && parseInt(cell.getAttribute('data-color'), 10) === state.color);
      });
    }

    /// Populate/rewire #dcp-additem-hide-list (the scrollable candidate
    /// list) and the Hide/Unhide Type dropdown, and keep
    /// #dcp-additem-submit's disabled state in sync with
    /// hideState.target. Shared by both isHide and isUnhide — they only
    /// ever differ in wording (Hide/Unhide Type, "select item to
    /// hide/unhide") and which candidates are selectable: a Hide row is
    /// selectable when NOT already hidden (an already-hidden one shows
    /// disabled "Hidden" text instead — a second Hide item for it would
    /// be redundant); an Unhide row is the mirror image, selectable only
    /// when CURRENTLY hidden (an already-visible one shows disabled
    /// "Visible" text). Rebuilt from scratch on every Hide/Unhide Type
    /// change or row selection — simplest way to keep this per-row state
    /// consistent, same tradeoff Edit Dwg's own item list makes (full
    /// list re-render on any change) rather than patching individual
    /// rows.
    ///
    /// No live draft/updatePreview() here at all — unlike every other
    /// item type, a Hide/Unhide item has no visible effect on the drawn
    /// canvas until it actually runs on a real device (matches
    /// alt-a-mockup.html Screen 3k/3l's own caption: "No visible change
    /// in the designer preview"), so the preview panel just shows the
    /// real, unmodified dwg throughout (already rendered below, once, via
    /// _renderPreview). The one exception is the row-level "Show" button:
    /// press-and-hold re-fetches THAT SAME loadCmd with the target item
    /// spliced out (forceNextStart), then restores the real full item
    /// list on release — a simpler, unoptimized version of
    /// _renderEditDwgScreen's own _pressShowItem/_releaseShowItem (that
    /// one also reuses an already-minted idx/cmd via resolveIdx/
    /// resolveCmd for a lighter-weight {+|h...} update; duplicating that
    /// optimization here isn't needed since this screen's candidate list
    /// already fully re-renders on every interaction).
    function wireHideScreen() {
      const hideTypeSelect = root.querySelector('#dcp-additem-hidetype');
      const listContainer = root.querySelector('#dcp-additem-hide-list');
      const labelEl = root.querySelector('#dcp-additem-hide-label');
      const submitBtn = root.querySelector('#dcp-additem-submit');
      let pressedState = null;

      function renderList() {
        labelEl.textContent = 'Available ' + _hideKindLabel(hideState.hideKind) + ' (select item to ' + (isUnhide ? 'unhide' : 'hide') + ')';
        // Add Item is creating a BRAND NEW Hide/Unhide item — there's no
        // existing reference worth preserving, so a target whose own
        // insertDwg isn't currently loaded is simply not offered at all
        // (unlike Edit Item's own copy of this list, which shows it
        // annotated instead — see that renderList's own doc).
        const candidates = _hideCandidates(dwg, hideState.hideKind)
          .filter(({ item }) => item.type !== 'insertDwg' || DwgLibrary.get(item.drawingName));
        listContainer.innerHTML = (candidates.length === 0)
          ? '<div class="dcp-empty">No ' + _hideKindLabel(hideState.hideKind) + ' available in this dwg yet.</div>'
          : candidates.map(({ i, item, field, value }) => {
              const isSelected = hideState.target && hideState.target.field === field && hideState.target.value === value;
              const isActuallyHidden = hideState.actuallyHiddenTarget &&
                hideState.actuallyHiddenTarget.field === field && hideState.actuallyHiddenTarget.value === value;
              const alreadyHidden = _isCurrentlyHidden(dwg.items, field, value);
              // Hide: selectable when NOT hidden yet. Unhide: selectable
              // only when it IS currently hidden. `blocked` means "show
              // disabled status text instead of an action button".
              const blocked = isUnhide ? !alreadyHidden : alreadyHidden;
              const blockedLabel = isUnhide ? 'Visible' : 'Hidden';
              const actionLabel = isUnhide ? 'Unhide' : 'Hide';
              // The item this exact saved Hide/Unhide item ACTUALLY
              // targets right now always reads as a fixed status label —
              // clicking a different row only changes the PENDING
              // selection (which row shows "Selected"), never the real,
              // on-device state, which only changes on Save Changes.
              const statusOrAction = isActuallyHidden
                ? '<span class="dcp-helper" style="margin:0; font-style:italic">' + (isUnhide ? 'Unhidden Item' : 'Hidden Item') + '</span>'
                : (blocked && !isSelected
                    ? '<span class="dcp-helper" style="margin:0; font-style:italic">' + blockedLabel + '</span>'
                    : '<button type="button" class="dcp-btn ' + (isSelected ? 'dcp-btn-primary' : 'dcp-btn-danger') + ' dcp-hide-select-btn" data-field="' + field + '" data-value="' + _esc(value) + '" style="padding:4px 10px; font-size:11px">' + (isSelected ? 'Selected' : actionLabel) + '</button>');
              return '<div class="dcp-edit-item-row">' +
                '<div class="dcp-edit-item-info">' +
                  '<div class="dcp-edit-item-type"><b>' + _esc(_itemTypeLabel(item)) + '</b> ' +
                    '<span class="dcp-edit-item-type-suffix">' + _esc(value) + '</span></div>' +
                  '<div class="dcp-edit-item-detail">' + _describeItem(item, dwg.color) + '</div>' +
                '</div>' +
                '<div class="dcp-edit-item-actions">' +
                  '<button type="button" class="dcp-mini-btn dcp-mini-btn-show" data-field="' + field + '" data-value="' + _esc(value) + '" title="Hold to identify this item in the preview">&#128065;</button>' +
                  statusOrAction +
                '</div>' +
              '</div>';
            }).join('');

        submitBtn.disabled = !hideState.target;

        listContainer.querySelectorAll('.dcp-hide-select-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            hideState.target = { field: btn.getAttribute('data-field'), value: btn.getAttribute('data-value') };
            renderList();
          });
        });
        listContainer.querySelectorAll('.dcp-mini-btn-show').forEach((btn) => {
          const field = btn.getAttribute('data-field');
          const value = btn.getAttribute('data-value');
          btn.addEventListener('mousedown', (e) => { e.stopPropagation(); pressShow(field, value); });
          btn.addEventListener('mouseup', (e) => { e.stopPropagation(); releaseShow(); });
          btn.addEventListener('mouseleave', () => { if (btn.matches(':active')) releaseShow(); });
        });
      }

      /// Press: toggle the target to the OPPOSITE of its current
      /// visibility (a currently-visible candidate briefly disappears; a
      /// currently-hidden one — every selectable row on the Unhide
      /// screen — briefly appears), via a real {+|h...}/{+|uh...} update
      /// targeting its already-minted idx/cmd, matching
      /// _renderEditDwgScreen's own _pressShowItem. A naive
      /// splice-the-item-out-of-a-draft approach (this screen's earlier
      /// implementation) only ever shows something for a currently-
      /// VISIBLE target — splicing out an already-hidden one changes
      /// nothing, since it was already invisible, which is exactly why
      /// Show silently did nothing on the Unhide screen (every
      /// selectable Unhide row IS currently hidden).
      function pressShow(field, value) {
        const loadCmd = window.DWG_PREVIEW_KEY_PREFIX + dwgName;
        _dwgDesignerAdapter.device.ensureAutoAssignments(dwgName, dwg);
        // An insertDwg target is identified on the wire by its own
        // loadCmd (|hd/|uhd), never an auto-minted cmd — insertDwg's own
        // |d... wire fragment never transmits a cmd at all (see
        // dwgWireEncoder.js's encodeInsertDwg/encodeHideUnhideErase), so
        // resolveCmd's return value would target nothing.
        const kind = (hideState.hideKind === 'insertDwg') ? 'drawingName' : ((field === 'idxName') ? 'idx' : 'cmd');
        const resolvedValue = kind === 'idx'
          ? _dwgDesignerAdapter.device.resolveIdx(dwgName, value)
          : kind === 'cmd'
            ? _dwgDesignerAdapter.device.resolveCmd(dwgName, value)
            : (dwg.items.find((it) => it.type === 'insertDwg' && it.cmdName === value) || {}).drawingName;
        const originalHidden = _isCurrentlyHidden(dwg.items, field, value);
        pressedState = { loadCmd, kind, resolvedValue, originalHidden };
        const directive = { type: originalHidden ? 'unhide' : 'hide' };
        directive[kind] = resolvedValue;
        _dwgDesignerAdapter.device.forceNextUpdate(loadCmd, [directive]);
        window.drawingViewer.queueDrawingUpdate(loadCmd);
      }
      /// Release: restore whatever pressShow just toggled away — the
      /// exact opposite hide/unhide directive.
      function releaseShow() {
        if (!pressedState) return;
        const { loadCmd, kind, resolvedValue, originalHidden } = pressedState;
        pressedState = null;
        const directive = { type: originalHidden ? 'hide' : 'unhide' };
        directive[kind] = resolvedValue;
        _dwgDesignerAdapter.device.forceNextUpdate(loadCmd, [directive]);
        window.drawingViewer.queueDrawingUpdate(loadCmd);
      }

      hideTypeSelect.addEventListener('change', () => {
        // Clear the pending selection on every Hide/Unhide Type switch —
        // per direction, only a candidate actually VISIBLE in the
        // NEWLY-chosen kind's own list should ever be selectable/
        // selected; a remembered selection from a different kind isn't
        // shown here at all, so keeping it around would leave
        // hideState.target pointing at something this screen no longer
        // displays. actuallyHiddenTarget (the fixed "Hidden Item"/
        // "Unhidden Item" status label) is untouched — it isn't a
        // selection, it doesn't change here.
        hideState.hideKind = hideTypeSelect.value;
        hideState.target = null;
        renderList();
      });

      renderList();
    }

    /// Wire the "Drawing to insert" dropdown: keep insertDwgState in
    /// sync, refresh the read-only Command name field to match (same
    /// "dwg_<name>" auto-generation buildDraftItem itself uses),
    /// re-enable Add Item once something's selected, and refresh the
    /// normal live preview (unlike Hide/Unhide, Insert Drawing draws
    /// something real, so it uses the ordinary updatePreview() path,
    /// already called once, unconditionally, below).
    function wireInsertDwgScreen() {
      const select = root.querySelector('#dcp-additem-insertdwg-name');
      if (!select) return; // no candidates at all — nothing to wire
      select.addEventListener('change', () => {
        insertDwgState.drawingName = select.value || null;
        root.querySelector('#dcp-additem-insertdwg-cmdname').value =
          insertDwgState.drawingName ? 'dwg_' + insertDwgState.drawingName : '';
        root.querySelector('#dcp-additem-submit').disabled = !insertDwgState.drawingName;
        updatePreview();
      });
    }

    if (isHide || isUnhide) {
      _renderPreview(dwgName);
    } else {
      updatePreview();
    }

    // pushZero (hasCommonBlock false) has no Color/Assign Index block at
    // all in the DOM — none of this wiring applies to it.
    if (hasCommonBlock) {
      buildColorPopup();
      updateColorHeader();

      root.querySelector('#dcp-additem-bw-btn').addEventListener('click', () => {
        state.colorMode = 'blackwhite';
        updateColorHeader();
        updatePreview();
        root.querySelector('#dcp-additem-color-popup').style.display = 'none';
      });
      function openColorPicker() {
        state.colorMode = 'color';
        updateColorHeader();
        updatePreview();
        root.querySelector('#dcp-additem-color-popup').style.display = 'block';
      }
      root.querySelector('#dcp-additem-color-btn').addEventListener('click', openColorPicker);
      root.querySelector('#dcp-additem-color-swatch').addEventListener('click', openColorPicker);

      useIndexCheckbox.addEventListener('change', () => {
        idxState.use = useIndexCheckbox.checked;
        idxNameInput.style.display = idxState.use ? 'block' : 'none';
        updateIdxNameWarning();
        updatePreview();
      });
      idxNameInput.addEventListener('input', () => {
        idxState.name = idxNameInput.value;
        updateIdxNameWarning();
      });
      idxNameInput.addEventListener('blur', updatePreview);
    } else if (isIndex) {
      // Assign Index is forced on and locked (no checkbox to wire) —
      // only the idx-name field itself needs live wiring.
      updateIdxNameWarning();
      idxNameInput.addEventListener('input', () => {
        idxState.name = idxNameInput.value;
        updateIdxNameWarning();
      });
      idxNameInput.addEventListener('blur', updatePreview);
    } else if (isHide || isUnhide) {
      wireHideScreen();
    } else if (isInsertDwg) {
      wireInsertDwgScreen();
    } else if (isTouchZone) {
      updateCmdNameWarning();
      touchZoneCmdNameInput.addEventListener('input', () => {
        touchZoneState.cmdName = touchZoneCmdNameInput.value;
        updateCmdNameWarning();
      });
      touchZoneCmdNameInput.addEventListener('blur', updatePreview);
      touchZoneFilterSelect.addEventListener('change', updatePreview);

      /// Snapshot every current touchZone field, including touchZoneState's
      /// own touchActions/touchActionInput, into a resumeState object —
      /// passed to the touchAction/touchActionInput sub-editor so nothing
      /// already typed here is lost while it's open, and threaded back
      /// into a fresh _renderAddItemScreen call to redraw this screen
      /// after a local (no-sub-editor-needed) change like Remove.
      function snapshotTouchZoneResumeState() {
        return {
          xOffset: _readNum(xOffsetInput.value, 0),
          yOffset: _readNum(yOffsetInput.value, 0),
          xSize: _readNum(xSizeInput.value, 1),
          ySize: _readNum(ySizeInput.value, 1),
          filter: parseInt(touchZoneFilterSelect.value, 10) || 0,
          centered: centeredCheckbox.checked,
          cmdName: touchZoneCmdNameInput.value,
          touchActions: touchZoneState.touchActions,
          touchActionInput: touchZoneState.touchActionInput,
        };
      }
      const touchActionInputAddBtn = root.querySelector('#dcp-additem-touchactioninput-add');
      const touchActionInputEditBtn = root.querySelector('#dcp-additem-touchactioninput-edit');
      const touchActionInputRemoveBtn = root.querySelector('#dcp-additem-touchactioninput-remove');
      if (touchActionInputAddBtn || touchActionInputEditBtn) {
        (touchActionInputAddBtn || touchActionInputEditBtn).addEventListener('click', () => {
          _renderTouchActionInputEditorScreen(root, dwgName, null, snapshotTouchZoneResumeState());
        });
      }
      if (touchActionInputRemoveBtn) {
        touchActionInputRemoveBtn.addEventListener('click', () => {
          const resume = snapshotTouchZoneResumeState();
          resume.touchActionInput = null;
          _renderAddItemScreen(root, dwgName, 'touchZone', resume);
        });
      }
      // Greyed out on this screen (_buildTouchZoneItemsListHtml's disableAdds)
      // — a row is not a <button>, so without this guard the click would still
      // fire.  The touchActionInput "+ Add" button above needs no equivalent:
      // a disabled <button> emits no click event.
      const touchActionAddRow = root.querySelector('#dcp-additem-touchaction-add');
      if (touchActionAddRow && touchActionAddRow.getAttribute('data-disabled') !== 'true') {
        touchActionAddRow.addEventListener('click', () => {
          _renderTouchActionEditorScreen(root, dwgName, null, snapshotTouchZoneResumeState(), null);
        });
      }
      root.querySelectorAll('.dcp-touchaction-edit-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const actionIndex = parseInt(btn.getAttribute('data-index'), 10);
          _renderTouchActionEditorScreen(root, dwgName, null, snapshotTouchZoneResumeState(), actionIndex);
        });
      });
      root.querySelectorAll('.dcp-touchaction-remove-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const actionIndex = parseInt(btn.getAttribute('data-index'), 10);
          const resume = snapshotTouchZoneResumeState();
          resume.touchActions = resume.touchActions.slice();
          resume.touchActions.splice(actionIndex, 1);
          _renderAddItemScreen(root, dwgName, 'touchZone', resume);
        });
      });
    }

    if (isInsertDwg) {
      // Matches Create Dwg's own "Load Dwg from file…" precedent exactly
      // (dcp-create-load-file): discard this draft and hand off entirely
      // to the standalone Load Dwg flow — no attempt to return here with
      // the newly-loaded dwg pre-selected. Once loaded, it'll show up in
      // this dropdown the next time Add Item → Insert Drawing is opened.
      const loadFileBtn = root.querySelector('#dcp-additem-load-dwg-file');
      if (loadFileBtn) {
        loadFileBtn.addEventListener('click', () => {
          DwgLibrary.remove(ADD_ITEM_DRAFT_NAME);
          _startLoadDwg(root);
        });
      }
    }

    [filledCheckbox, centeredCheckbox, roundedCheckbox, boldCheckbox, italicCheckbox, underlineCheckbox].filter(Boolean).forEach((cb) => {
      cb.addEventListener('change', updatePreview);
    });

    root.querySelector('#dcp-additem-submit').addEventListener('click', () => {
      const raw = {
        name: dwgName,
        description: (typeof dwg.description === 'string') ? dwg.description : '',
        x: dwg.x, y: dwg.y, refresh: dwg.refresh, color: dwg.color,
        items: flattenTouchActions(dwg.items).concat([buildDraftItem(true)]),
      };
      const { dwg: savedDwg } = validateAndRepairDwg(raw, dwgName);
      DwgLibrary.save(savedDwg);
      DwgLibrary.remove(ADD_ITEM_DRAFT_NAME);
      _dwgDesignerAdapter.device.invalidatePreviewVersion(dwgName);
      _renderEditDwgScreen(root, dwgName);
    });
  }

  // Item Type dropdown options — matches alt-a-mockup.html's Screen 3
  // full list (add-item.js's own Item Type <select>), value = this
  // project's real internal type string. "erase" is deliberately absent
  // (confirmed: not a creatable/editable option, matches add-item.html's
  // own commented-out "Erase Item" entry — a real, already-supported
  // wire-level type, just never offered here).
  const ITEM_TYPE_OPTIONS = Object.freeze([
    { value: 'line', label: 'Line' },
    { value: 'rectangle', label: 'Rectangle' },
    { value: 'circle', label: 'Circle' },
    { value: 'arc', label: 'Arc' },
    { value: 'label', label: 'Label' },
    { value: 'value', label: 'Value' },
    { value: 'touchZone', label: 'touchZone' },
    { value: 'insertDwg', label: 'insertDwg' },
    { value: 'pushZero', label: 'pushZero' },
    { value: 'popZero', label: 'popZero' },
    { value: 'index', label: 'Index Placeholder' },
    { value: 'hide', label: 'Hide Item' },
    { value: 'unhide', label: 'Unhide Item' },
  ]);

  /// Render an Edit Item screen for dwg.items[itemIndex] — same shape as
  /// _renderAddItemScreen(), but (a) prefilled with that item's current
  /// values instead of defaults when the dropdown is still on the item's
  /// own original type, and (b) replaces that item IN PLACE on Save
  /// Changes rather than appending a new one. Line, Rectangle, Circle,
  /// Arc, Label, Value, pushZero, popZero, and Index Placeholder all
  /// have real, functional forms (see _renderAddItemScreen's own doc for
  /// the field details, shared verbatim — pushZero/popZero are "control
  /// items" with no Color/Assign Index block at all, Index Placeholder
  /// has Assign Index but no Color, see hasCommonBlock below); picking
  /// any other type shows a "not implemented" placeholder and disables
  /// Save Changes — this still lets the dropdown/pre-selection behave as
  /// specified without pretending to support editing a Touch Zone/Insert
  /// Drawing/etc that doesn't have a real form yet.
  /// @param {HTMLElement} root
  /// @param {string} dwgName
  /// @param {number} itemIndex — index into dwg.items (the NESTED,
  ///        top-level array — same indexing _moveItem()/_removeItem()
  ///        already use)
  /// @param {string} [typeOverride] — set only when the user has changed
  ///        the dropdown away from the item's own original type (drives
  ///        a full re-render of this same screen, rather than trying to
  ///        swap sections of the DOM in place)
  /// @param {object} [resumeState] — see _renderAddItemScreen's own doc.
  function _renderEditItemScreen(root, dwgName, itemIndex, typeOverride, resumeState) {
    const dwg = DwgLibrary.get(dwgName);
    const originalItem = dwg && dwg.items[itemIndex];
    if (!dwg || !originalItem) { _renderEditDwgScreen(root, dwgName); return; }

    const selectedType = typeOverride || originalItem.type;
    const isLine = selectedType === 'line';
    const isRectangle = selectedType === 'rectangle';
    const isCircle = selectedType === 'circle';
    const isArc = selectedType === 'arc';
    const isLabel = selectedType === 'label';
    const isValue = selectedType === 'value';
    const isPushZero = selectedType === 'pushZero';
    const isPopZero = selectedType === 'popZero';
    const isIndex = selectedType === 'index';
    const isHide = selectedType === 'hide';
    const isUnhide = selectedType === 'unhide';
    const isInsertDwg = selectedType === 'insertDwg';
    const isTouchZone = selectedType === 'touchZone';
    const hasForm = isLine || isRectangle || isCircle || isArc || isLabel || isValue || isPushZero || isPopZero || isIndex || isHide || isUnhide || isInsertDwg || isTouchZone;
    // pushZero/popZero/Index Placeholder/Hide/Unhide Item — see
    // _renderAddItemScreen's own hasCommonBlock doc (Index Placeholder is
    // its own dedicated branch, not hasCommonBlock — no Color, but
    // Assign Index forced on/locked; Hide/Unhide/Insert Drawing/Touch
    // Zone have neither — see _renderAddItemScreen's own hasCommonBlock
    // doc for Touch Zone's own reasoning).
    const hasCommonBlock = hasForm && !isPushZero && !isPopZero && !isIndex && !isHide && !isUnhide && !isInsertDwg && !isTouchZone;
    // Carry over every setting the item being edited ACTUALLY HAS, whether or
    // not the dropdown is still on its original type.  Switching Label ->
    // Value (say) keeps the position, size, colour, text, font size,
    // alignment, decimals, units and Assign Index; only fields the original
    // never had fall back to Add Item's own defaults.
    //
    // Matching on the field NAME is what makes this safe: dwgValidate.js's
    // DWG_ITEM_FIELD_SCHEMA uses one name per concept across every type, so
    // xOffset/xSize/text/fontSize/align/decimals/units/color mean the same
    // thing whichever type declares them, and a name the new type doesn't use
    // is simply never read.  Nothing is coerced between differently-named
    // fields (an item's xOffset does NOT become pushZero's x, for instance) —
    // those are different concepts that happen to be positions.
    /// @param {string} field — schema field name on originalItem
    /// @param {*} fallback — used only when the original has no such field
    const carry = (field, fallback) => {
      const v = originalItem[field];
      return (v === undefined || v === null) ? fallback : v;
    };
    /// carry() for the boolean flags, which are stored as true or 'true'.
    /// @param {string} field
    /// @returns {boolean}
    const carriedFlag = (field) => {
      const v = carry(field, false);
      return v === true || v === 'true';
    };
    // STRUCTURAL fields still require the same type, unlike the settings
    // above: a hide target, an insertDwg's drawingName, and a touchZone's
    // cmdName/touchActions/touchActionInput identify or attach to something,
    // rather than describing how the item looks, so there is nothing sensible
    // to carry across a type change (a rectangle has no touchActions to keep).
    const prefillFromOriginal = hasForm && originalItem.type === selectedType;
    // Colour is carried the same way, except that -1 (BLACK_WHITE) has to
    // reopen as the blackwhite mode rather than as palette entry -1.
    const carriedColor = carry('color', undefined);
    const hasCarriedColor = carriedColor !== undefined && carriedColor !== -1;

    // Defaults (used only where the original has no such field) match
    // _renderAddItemScreen's own state: offset defaults to the canvas centre
    // for every type except Insert Drawing (0,0 — see that state's own doc);
    // Line/Rectangle's size defaults to a quarter of the canvas; Circle/Arc's
    // radius to 25% of the smaller canvas dimension.  Not floored — see
    // _renderAddItemScreen's own state doc for why (item geometry is float).
    const state = {
      xOffset: carry('xOffset', isInsertDwg ? 0 : dwg.x / 2),
      yOffset: carry('yOffset', isInsertDwg ? 0 : dwg.y / 2),
      xSize: carry('xSize', dwg.x / 4),
      ySize: carry('ySize', dwg.y / 4),
      radius: carry('radius', Math.min(dwg.x, dwg.y) * 0.25),
      start: carry('start', 0),
      angle: carry('angle', 90),
      text: carry('text', isLabel ? 'TEXT' : (isValue ? 'Value: ' : '')),
      fontSize: carry('fontSize', 0),
      align: carry('align', 'left'),
      // Label's optional value/decimals/units suffix (Object.assign-preserved,
      // unschema'd — see dwgWireEncoder.js's _appendFormattedValue) is held as
      // STRINGS by this form, unlike the Value type's own numeric fields
      // below, so carry then stringify.  decimals/units are the same field on
      // both types, which is exactly why switching between them keeps them.
      value: (originalItem.value === undefined || originalItem.value === null) ? '' : String(originalItem.value),
      decimals: (originalItem.decimals === undefined || originalItem.decimals === null) ? '2' : String(originalItem.decimals),
      units: carry('units', ''),
      // Value item type's own real, required fields.
      intValue: carry('intValue', 50),
      min: carry('min', 0),
      max: carry('max', 100),
      displayMin: carry('displayMin', 0),
      displayMax: carry('displayMax', 1),
      valueDecimals: carry('decimals', 2),
      valueUnits: carry('units', ''),
      // pushZero's own X/Y Translation + Scale Factor are x/y/scale, distinct
      // field names from every other type's xOffset/yOffset, so these only
      // ever carry from another pushZero.
      pushX: carry('x', 0),
      pushY: carry('y', 0),
      pushScale: carry('scale', 1),
      filter: carry('filter', 0),
      colorMode: hasCarriedColor ? 'color' : 'blackwhite',
      color: hasCarriedColor ? carriedColor : 15,
    };
    // Resuming from the touchAction/touchActionInput sub-editor — see
    // _renderAddItemScreen's own resumeState doc; overrides both the
    // canvas-centre default AND any originalItem prefill above.
    if (isTouchZone && resumeState) {
      state.xOffset = resumeState.xOffset;
      state.yOffset = resumeState.yOffset;
      state.xSize = resumeState.xSize;
      state.ySize = resumeState.ySize;
      state.filter = resumeState.filter;
    }
    // Assign Index carries over across a type change too, so switching type
    // keeps the item's own index name (and everything already pointing at it
    // by that name keeps working).  The one exception is a REFERENCE_ONLY
    // original: hide/unhide/erase name ANOTHER item's index rather than
    // declaring their own, so carrying that name would turn a reference into
    // a second declaration of a name that already belongs to something else.
    // Index Placeholder still forces Assign Index on regardless — see
    // _renderAddItemScreen's own idxState doc.
    const originalDeclaresIdx = !!originalItem.idxName
      && REFERENCE_ONLY_TYPES.indexOf(originalItem.type) === -1;
    const idxState = {
      use: isIndex || originalDeclaresIdx,
      name: originalDeclaresIdx ? originalItem.idxName : _nextFreeIdxName(dwg),
    };
    // One flat namespace across every declaring item — see
    // _collectUsedIdxNames's own doc.
    const usedIdxNames = _collectUsedIdxNames(dwg, itemIndex);
    // Prefill from the original hide/unhide item's own idxName/cmdName
    // when editing it as itself; a cmdName alone doesn't say which Hide/
    // Unhide Type category it belongs to, so look up whether some OTHER
    // touchZone in this dwg currently owns that cmdName (else assume
    // insertDwg). Switching the dropdown away from 'hide'/'unhide' (or to
    // one from a different original type) starts fresh via
    // _defaultHideKind, same as Add Item.
    // actuallyHiddenTarget is a FIXED reference to whatever this exact
    // saved item already hides/unhides right now, in the real dwg —
    // completely separate from `target` (the user's PENDING selection,
    // freely changeable, only takes effect on Save Changes) and never
    // updated by clicking a different candidate. Only meaningful when
    // still genuinely editing this SAME saved item (prefillFromOriginal)
    // — a real device is unaffected by anything this screen does before
    // Save Changes, so whatever the ORIGINAL item targets stays the
    // actually-hidden one throughout, no matter what the user clicks.
    const hideState = !(isHide || isUnhide) ? null : (!prefillFromOriginal ? { hideKind: _defaultHideKind(dwg), target: null, actuallyHiddenTarget: null } : (() => {
      if (originalItem.idxName) {
        const target = { field: 'idxName', value: originalItem.idxName };
        return { hideKind: 'index', target, actuallyHiddenTarget: target };
      }
      if (originalItem.cmdName) {
        const isTouchZone = (dwg.items || []).some((it, i) => i !== itemIndex && it.type === 'touchZone' && it.cmdName === originalItem.cmdName);
        const target = { field: 'cmdName', value: originalItem.cmdName };
        return { hideKind: isTouchZone ? 'touchZone' : 'insertDwg', target, actuallyHiddenTarget: target };
      }
      return { hideKind: _defaultHideKind(dwg), target: null, actuallyHiddenTarget: null };
    })());
    // Prefill from the original insertDwg item's own drawingName when
    // editing it as itself (excludeIndex=itemIndex so its own current
    // selection never shows up "blocked" against itself); otherwise the
    // same first-non-blocked default Add Item uses. resumeState.drawingName
    // (set only when returning here right after "Load Dwg from file…"
    // successfully loaded a new dwg — see that button's own handler below)
    // overrides both, so the just-loaded dwg shows up pre-selected instead
    // of the user having to find it in the dropdown themselves.
    const insertDwgState = !isInsertDwg ? null : {
      drawingName: (resumeState && Object.prototype.hasOwnProperty.call(resumeState, 'drawingName'))
        ? resumeState.drawingName
        : ((prefillFromOriginal && originalItem.drawingName)
          ? originalItem.drawingName
          : (_insertDwgCandidates(dwg, dwgName, itemIndex).find((c) => !c.blocked) || {}).name || null),
    };
    // Prefill from the original touchZone's own cmdName/touchActions/
    // touchActionInput when editing it as itself; otherwise the same
    // next-free suggestion (and empty touchActions/touchActionInput) Add
    // Item uses. resumeState (returning from the touchAction/
    // touchActionInput sub-editor) always wins over both. usedCmdNames
    // excludes itemIndex so its own current cmdName doesn't collide
    // against itself.
    const touchZoneState = !isTouchZone ? null : {
      cmdName: (resumeState && resumeState.cmdName) ||
        ((prefillFromOriginal && originalItem.cmdName) ? originalItem.cmdName : _nextFreeCmdName(dwg)),
      touchActions: resumeState ? resumeState.touchActions
        : ((prefillFromOriginal && Array.isArray(originalItem.touchActions)) ? originalItem.touchActions.slice() : []),
      touchActionInput: resumeState ? resumeState.touchActionInput
        : ((prefillFromOriginal && originalItem.touchActionInput) ? originalItem.touchActionInput : null),
    };
    const usedCmdNames = _collectUsedCmdNames(dwg, itemIndex);

    const typeOptionsHtml = ITEM_TYPE_OPTIONS.map((opt) =>
      '<option value="' + opt.value + '"' + (opt.value === selectedType ? ' selected' : '') + '>' + opt.label + '</option>'
    ).join('');
    const xLabel = (isRectangle || isLabel || isValue) ? 'X Position' : ((isCircle || isArc) ? 'X Center' : 'X Offset');
    const yLabel = (isRectangle || isLabel || isValue) ? 'Y Position' : ((isCircle || isArc) ? 'Y Center' : 'Y Offset');
    const wLabel = isRectangle ? 'Width' : 'X Delta';
    const hLabel = isRectangle ? 'Height' : 'Y Delta';
    const filledLabel = isArc ? 'Filled (creates pie slice)' : 'Filled';
    // Carried across a type change like the rest of the settings — the
    // is<Type> guards say which flags the NEWLY-selected form shows, not
    // whether the original may be read from.
    const filledChecked = (isRectangle || isCircle || isArc) && carriedFlag('filled');
    const centeredChecked = (isTouchZone && resumeState) ? !!resumeState.centered
      : (isRectangle || isTouchZone) && carriedFlag('centered');
    const roundedChecked = isRectangle && carriedFlag('rounded');
    const boldChecked = (isLabel || isValue) && carriedFlag('bold');
    const italicChecked = (isLabel || isValue) && carriedFlag('italic');
    const underlineChecked = (isLabel || isValue) && carriedFlag('underline');
    const alignOptionsHtml = DWG_ALIGN_VALUES.map((v) =>
      '<option value="' + v + '"' + (v === state.align ? ' selected' : '') + '>' + v[0].toUpperCase() + v.slice(1) + '</option>'
    ).join('');
    const touchFilterOptionsHtml = TOUCH_FILTER_OPTIONS.map((o) =>
      '<option value="' + o.value + '"' + (o.value === state.filter ? ' selected' : '') + '>' + _esc(o.label) + '</option>'
    ).join('');

    let fieldsHtml;
    if (isCircle || isArc) {
      fieldsHtml =
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>' + xLabel + '</label>' +
            '<input type="number" id="dcp-edititem-xoffset" value="' + state.xOffset + '" step="any"></div>' +
          '<div class="dcp-field"><label>' + yLabel + '</label>' +
            '<input type="number" id="dcp-edititem-yoffset" value="' + state.yOffset + '" step="any"></div>' +
        '</div>' +
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>Radius</label>' +
            '<input type="number" id="dcp-edititem-radius" value="' + state.radius + '" min="0.1" step="any"></div>' +
          '<div class="dcp-field" style="flex:1; justify-content:flex-end"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
            '<input type="checkbox" id="dcp-edititem-filled"' + (filledChecked ? ' checked' : '') + ' style="width:auto"> ' + filledLabel + '</label></div>' +
        '</div>' +
        (isArc ?
          '<div class="dcp-field-row dcp-num-row">' +
            '<div class="dcp-field"><label>Start Angle (&deg;)</label>' +
              '<input type="number" id="dcp-edititem-start" value="' + state.start + '" step="any" placeholder="0-360, +ve anti-clockwise"></div>' +
            '<div class="dcp-field"><label>Sweep Angle (&deg;)</label>' +
              '<input type="number" id="dcp-edititem-angle" value="' + state.angle + '" step="any" placeholder="+ve anti-clockwise, -ve clockwise"></div>' +
          '</div>'
        : '');
    } else if (isLabel) {
      fieldsHtml =
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>' + xLabel + '</label>' +
            '<input type="number" id="dcp-edititem-xoffset" value="' + state.xOffset + '" step="any"></div>' +
          '<div class="dcp-field"><label>' + yLabel + '</label>' +
            '<input type="number" id="dcp-edititem-yoffset" value="' + state.yOffset + '" step="any"></div>' +
        '</div>' +
        '<div class="dcp-field">' +
          '<label>Text</label>' +
          '<textarea id="dcp-edititem-text" rows="1" style="resize:vertical">' + _esc(state.text) + '</textarea>' +
        '</div>' +
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>Font Size</label>' +
            '<input type="number" id="dcp-edititem-fontsize" value="' + state.fontSize + '" min="-24" max="24" step="1"></div>' +
          '<div class="dcp-field"><label>Alignment</label>' +
            '<select id="dcp-edititem-align" style="width:50%">' + alignOptionsHtml + '</select></div>' +
        '</div>' +
        '<div class="dcp-field-row">' +
          '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
            '<input type="checkbox" id="dcp-edititem-bold"' + (boldChecked ? ' checked' : '') + ' style="width:auto"> Bold</label></div>' +
          '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
            '<input type="checkbox" id="dcp-edititem-italic"' + (italicChecked ? ' checked' : '') + ' style="width:auto"> Italic</label></div>' +
          '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
            '<input type="checkbox" id="dcp-edititem-underline"' + (underlineChecked ? ' checked' : '') + ' style="width:auto"> Underline</label></div>' +
        '</div>' +
        '<div class="dcp-field-row">' +
          '<div class="dcp-field" style="flex:0 0 50%"><label>Value <span style="text-transform:none; font-weight:400">(optional)</span></label>' +
            '<input type="text" id="dcp-edititem-value" value="' + _esc(state.value) + '" placeholder="Optional"></div>' +
          '<div class="dcp-field" style="flex:0 0 25%"><label>Decimals</label>' +
            '<input type="number" id="dcp-edititem-decimals" value="' + _esc(state.decimals) + '" min="-6" max="6"></div>' +
        '</div>' +
        '<div class="dcp-field" style="width:25%">' +
          '<label>Units <span style="text-transform:none; font-weight:400">(optional)</span></label>' +
          '<input type="text" id="dcp-edititem-units" value="' + _esc(state.units) + '" placeholder="Optional (e.g., mm, V, %)"></div>';
    } else if (isValue) {
      fieldsHtml =
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>' + xLabel + '</label>' +
            '<input type="number" id="dcp-edititem-xoffset" value="' + state.xOffset + '" step="any"></div>' +
          '<div class="dcp-field"><label>' + yLabel + '</label>' +
            '<input type="number" id="dcp-edititem-yoffset" value="' + state.yOffset + '" step="any"></div>' +
        '</div>' +
        '<div class="dcp-field">' +
          '<label>Prefix Text</label>' +
          '<textarea id="dcp-edititem-text" rows="1" style="resize:vertical">' + _esc(state.text) + '</textarea>' +
        '</div>' +
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>Font Size</label>' +
            '<input type="number" id="dcp-edititem-fontsize" value="' + state.fontSize + '" min="-24" max="24" step="1"></div>' +
          '<div class="dcp-field"><label>Alignment</label>' +
            '<select id="dcp-edititem-align" style="width:50%">' + alignOptionsHtml + '</select></div>' +
        '</div>' +
        '<div class="dcp-field-row">' +
          '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
            '<input type="checkbox" id="dcp-edititem-bold"' + (boldChecked ? ' checked' : '') + ' style="width:auto"> Bold</label></div>' +
          '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
            '<input type="checkbox" id="dcp-edititem-italic"' + (italicChecked ? ' checked' : '') + ' style="width:auto"> Italic</label></div>' +
          '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
            '<input type="checkbox" id="dcp-edititem-underline"' + (underlineChecked ? ' checked' : '') + ' style="width:auto"> Underline</label></div>' +
        '</div>' +
        '<div class="dcp-helper" style="font-weight:600; margin:12px 0 6px">Value Scaling Parameters</div>' +
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>Integer Value</label>' +
            '<input type="number" id="dcp-edititem-intvalue" value="' + state.intValue + '"></div>' +
          '<div class="dcp-field"><label>Decimals</label>' +
            '<input type="number" id="dcp-edititem-valuedecimals" value="' + state.valueDecimals + '" min="-6" max="6"></div>' +
        '</div>' +
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>Min Value</label>' +
            '<input type="number" id="dcp-edititem-min" value="' + state.min + '"></div>' +
          '<div class="dcp-field"><label>Max Value</label>' +
            '<input type="number" id="dcp-edititem-max" value="' + state.max + '" style="width:87.5px"></div>' +
          '<div class="dcp-field"><label>Display Min</label>' +
            '<input type="number" id="dcp-edititem-displaymin" value="' + state.displayMin + '" step="any"></div>' +
          '<div class="dcp-field"><label>Display Max</label>' +
            '<input type="number" id="dcp-edititem-displaymax" value="' + state.displayMax + '" step="any" style="width:87.5px"></div>' +
        '</div>' +
        '<div class="dcp-field" style="width:25%">' +
          '<label>Units</label>' +
          '<input type="text" id="dcp-edititem-valueunits" value="' + _esc(state.valueUnits) + '" placeholder="e.g., V, C, %"></div>';
    } else if (isPushZero) {
      fieldsHtml =
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>X Translation</label>' +
            '<input type="number" id="dcp-edititem-push-x" value="' + state.pushX + '" step="any"></div>' +
          '<div class="dcp-field"><label>Y Translation</label>' +
            '<input type="number" id="dcp-edititem-push-y" value="' + state.pushY + '" step="any"></div>' +
        '</div>' +
        '<div class="dcp-field">' +
          '<label>Scale Factor</label>' +
          '<input type="number" id="dcp-edititem-push-scale" value="' + state.pushScale + '" step="any" style="width:70px"></div>' +
        '<div class="dcp-helper" style="margin:4px 0 16px">No Color or Assign Index here — pushZero doesn\'t draw anything itself, it just shifts the origin/scale for whatever items follow it in the list, until a matching popZero restores the previous one.</div>';
    } else if (isPopZero) {
      // No fields at all — see _renderAddItemScreen's own isPopZero doc.
      fieldsHtml =
        '<div class="dcp-helper" style="margin:4px 0 16px">Pop will restore the previous offset and scale. No additional properties are needed. No Color or Assign Index either — popZero draws nothing itself.</div>';
    } else if (isIndex) {
      // No other fields — see _renderAddItemScreen's own isIndex doc.
      fieldsHtml =
        '<div class="dcp-helper" style="margin:4px 0 16px">Index placeholder reserves an index without drawing anything. Only an index number is needed.</div>';
    } else if (isHide || isUnhide) {
      // See _renderAddItemScreen's own isHide/isUnhide doc — same Hide/
      // Unhide Type dropdown + candidate list, prefilled via hideState
      // above.
      fieldsHtml =
        '<div class="dcp-helper" style="margin:4px 0 12px">' + (isUnhide
          ? 'Unhide makes a previously hidden item visible again.'
          : 'Hide makes the item with the specified index or command invisible.') + '</div>' +
        '<div class="dcp-field">' +
          '<label>' + (isUnhide ? 'Unhide Type' : 'Hide Type') + '</label>' +
          '<select id="dcp-edititem-hidetype" style="width:60%">' +
            ['index', 'touchZone', 'insertDwg'].map((k) =>
              '<option value="' + k + '"' + (k === hideState.hideKind ? ' selected' : '') + '>' + _hideKindLabel(k) + '</option>'
            ).join('') +
          '</select>' +
        '</div>' +
        '<div class="dcp-field">' +
          '<label id="dcp-edititem-hide-label">Available ' + _hideKindLabel(hideState.hideKind) + ' (select item to ' + (isUnhide ? 'unhide' : 'hide') + ')</label>' +
          '<div id="dcp-edititem-hide-list"></div>' +
        '</div>';
    } else if (isInsertDwg) {
      // See _renderAddItemScreen's own isInsertDwg doc — same fields,
      // prefilled via insertDwgState above. EDIT-only (Add Item's own
      // copy of this dropdown is untouched): _insertDwgCandidates is
      // scoped to DwgLibrary.listNames(), so if this item's CURRENT
      // drawingName isn't currently loaded, it wouldn't appear as an
      // option at all — the browser would then silently default the
      // <select> to whatever candidate happens to be first, and an
      // unnoticed "Save Changes" would retarget this item at a
      // completely different, unrelated dwg. Inject it as its own
      // clearly-marked (red italic, "dwg not loaded") option instead, so
      // the current state is visibly preserved rather than silently lost.
      const candidates = _insertDwgCandidates(dwg, dwgName, itemIndex);
      const currentIsMissing = insertDwgState.drawingName && !DwgLibrary.get(insertDwgState.drawingName);
      fieldsHtml =
        '<div class="dcp-field">' +
          '<label>Drawing to insert</label>' +
          (candidates.length === 0 && !currentIsMissing
            ? '<div class="dcp-helper" style="margin:4px 0">No other drawings in the library to insert — Load Dwg from file below, or create another dwg first.</div>'
            : '<select id="dcp-edititem-insertdwg-name">' +
                // color/font-style on an <option> is native-OS-rendered
                // and unreliable across browsers — `disabled` is the one
                // styling hook browsers DO consistently grey out, so that
                // (plus the plain-text "dwg not loaded" suffix, which
                // always renders regardless of styling support) carries
                // the signal here instead. Still `selected` — disabled
                // does not prevent an option from being the one shown —
                // so opening Edit Item doesn't silently jump to a
                // different, unrelated candidate; Save Changes is
                // separately disabled below while this option is current
                // (see the isInsertDwg Save Changes button doc).
                (currentIsMissing
                  ? '<option value="' + _esc(insertDwgState.drawingName) + '" selected disabled>' +
                    _esc(insertDwgState.drawingName) + ' — dwg not loaded</option>'
                  : '') +
                candidates.map((c) => {
                  const candidateDwg = DwgLibrary.get(c.name);
                  const label = candidateDwg ? _describeDwgForInsert(candidateDwg) : c.name;
                  return '<option value="' + _esc(c.name) + '"' +
                    (c.blocked ? ' disabled' : '') +
                    (c.name === insertDwgState.drawingName ? ' selected' : '') + '>' +
                    _esc(label) + (c.blocked ? ' — already used elsewhere in this drawing' : '') +
                    '</option>';
                }).join('') +
              '</select>') +
        '</div>' +
        '<div class="dcp-field">' +
          '<label>Command name</label>' +
          '<input type="text" id="dcp-edititem-insertdwg-cmdname" value="' +
            _esc(insertDwgState.drawingName ? 'dwg_' + insertDwgState.drawingName : '') + '" readonly>' +
          '<div class="dcp-helper">Auto-generated from the drawing name (dwg_DrawingName)</div>' +
        '</div>' +
        '<div class="dcp-field">' +
          '<label>Insert position</label>' +
          '<div class="dcp-helper" style="margin-bottom:8px">Set the (0,0) position in the inserted drawing. Positive X/Y moves the inserted dwg up and to the left. Usually left at (0,0) and pushZero used instead.</div>' +
          '<div class="dcp-field-row dcp-num-row">' +
            '<div class="dcp-field"><label>X zero</label>' +
              '<input type="number" id="dcp-edititem-xoffset" value="' + state.xOffset + '" step="any"></div>' +
            '<div class="dcp-field"><label>Y zero</label>' +
              '<input type="number" id="dcp-edititem-yoffset" value="' + state.yOffset + '" step="any"></div>' +
          '</div>' +
        '</div>';
    } else if (isTouchZone) {
      // See _renderAddItemScreen's own isTouchZone doc — same fields,
      // prefilled via state/touchZoneState/centeredChecked above, plus
      // the same embedded touchActionInput/touchActions list.
      fieldsHtml =
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>X Position</label>' +
            '<input type="number" id="dcp-edititem-xoffset" value="' + state.xOffset + '" step="any"></div>' +
          '<div class="dcp-field"><label>Y Position</label>' +
            '<input type="number" id="dcp-edititem-yoffset" value="' + state.yOffset + '" step="any"></div>' +
          '<div class="dcp-field"><label>Width</label>' +
            '<input type="number" id="dcp-edititem-xsize" value="' + state.xSize + '" step="any"></div>' +
          '<div class="dcp-field"><label>Height</label>' +
            '<input type="number" id="dcp-edititem-ysize" value="' + state.ySize + '" step="any"></div>' +
        '</div>' +
        '<div class="dcp-field-row" style="align-items:flex-end">' +
          '<div class="dcp-field" style="flex:1"><label>Command Name <span style="text-transform:none; font-weight:400">(required — can be edited)</span></label>' +
            '<input type="text" id="dcp-edititem-touchzone-cmdname" value="' + _esc(touchZoneState.cmdName) + '" maxlength="50"></div>' +
          '<div class="dcp-field" style="flex:1">' +
            '<label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px; margin-bottom:2px">' +
              '<input type="checkbox" id="dcp-edititem-centered"' + (centeredChecked ? ' checked' : '') + ' style="width:auto"> Centered</label>' +
            '<label>Touch Filter</label>' +
            '<select id="dcp-edititem-touchzone-filter" style="width:100%">' + touchFilterOptionsHtml + '</select></div>' +
        '</div>' +
        '<div class="dcp-helper" id="dcp-edititem-touchzone-cmdname-warning" style="display:none; color:#8f2a1f">Command name already used, will be dedupped on Save Changes</div>' +
        '<div class="dcp-helper" style="margin:4px 0 16px">No Color or Assign Index — a touchZone is addressed by its Command Name, not an index.</div>' +
        '<div id="dcp-edititem-touchzone-items">' + _buildTouchZoneItemsListHtml('dcp-edititem', touchZoneState, dwg) + '</div>';
    } else {
      fieldsHtml =
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>' + xLabel + '</label>' +
            '<input type="number" id="dcp-edititem-xoffset" value="' + state.xOffset + '" step="any"></div>' +
          '<div class="dcp-field"><label>' + yLabel + '</label>' +
            '<input type="number" id="dcp-edititem-yoffset" value="' + state.yOffset + '" step="any"></div>' +
        '</div>' +
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>' + wLabel + '</label>' +
            '<input type="number" id="dcp-edititem-xsize" value="' + state.xSize + '" step="any"></div>' +
          '<div class="dcp-field"><label>' + hLabel + '</label>' +
            '<input type="number" id="dcp-edititem-ysize" value="' + state.ySize + '" step="any"></div>' +
        '</div>' +
        (isRectangle ?
          '<div class="dcp-field-row">' +
            '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
              '<input type="checkbox" id="dcp-edititem-filled"' + (filledChecked ? ' checked' : '') + ' style="width:auto"> Filled</label></div>' +
            '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
              '<input type="checkbox" id="dcp-edititem-centered"' + (centeredChecked ? ' checked' : '') + ' style="width:auto"> Centered</label></div>' +
            '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
              '<input type="checkbox" id="dcp-edititem-rounded"' + (roundedChecked ? ' checked' : '') + ' style="width:auto"> Rounded</label></div>' +
          '</div>'
        : '');
    }

    root.innerHTML =
      '<div class="dcp-back-row">' +
        '<button type="button" class="dcp-back-link" id="dcp-edititem-cancel">&larr; Cancel, back to ' + _esc(dwgName) + '</button>' +
        '<button type="button" class="dcp-back-link dcp-exit" id="dcp-exit-designer">Exit Designer</button>' +
      '</div>' +
      '<h1 class="dcp-title">Edit Item in ' + _esc(dwgName) + '</h1>' +
      '<div class="dcp-field">' +
        '<label>Item type</label>' +
        '<select id="dcp-edititem-type" style="width:50%">' + typeOptionsHtml + '</select>' +
      '</div>' +
      (hasCommonBlock ?
        fieldsHtml +
        '<div class="dcp-field">' +
          '<label>Color</label>' +
          '<div class="dcp-color-field" id="dcp-edititem-color-field">' +
            '<div class="dcp-color-header">' +
              '<button type="button" class="dcp-color-toggle-btn" id="dcp-edititem-bw-btn">BLACK_WHITE</button>' +
              '<button type="button" class="dcp-color-toggle-btn" id="dcp-edititem-color-btn">Color</button>' +
              '<span class="dcp-swatch-num">' +
                '<span class="dcp-swatch-lg" id="dcp-edititem-color-swatch"></span>' +
                '<span class="dcp-num" id="dcp-edititem-color-num"></span>' +
              '</span>' +
            '</div>' +
            '<div class="dcp-color-popup" id="dcp-edititem-color-popup" style="display:none"></div>' +
          '</div>' +
        '</div>' +
        '<div class="dcp-action-row" style="justify-content:space-between; align-items:center; margin-top:4px">' +
          '<label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
            '<input type="checkbox" id="dcp-edititem-use-index"' + (idxState.use ? ' checked' : '') + ' style="width:auto"> Assign Index' +
          '</label>' +
          '<div style="display:flex; gap:8px">' +
            '<button type="button" class="dcp-btn dcp-btn-ghost" id="dcp-edititem-cancel-2">Cancel</button>' +
            '<button type="button" class="dcp-btn dcp-btn-primary" id="dcp-edititem-submit">Save Changes</button>' +
          '</div>' +
        '</div>' +
        '<input type="text" id="dcp-edititem-idx-name" value="' + _esc(idxState.name) + '" style="display:' + (idxState.use ? 'block' : 'none') + '; margin-top:6px; width:25%">' +
        '<div class="dcp-helper" id="dcp-edititem-idx-name-warning" style="display:none; color:#8f2a1f">Index name already used, will be dedupped on Save Changes</div>'
      : isIndex ?
        // Index Placeholder — Assign Index forced on and locked, no
        // Color block — see _renderAddItemScreen's own isIndex doc.
        fieldsHtml +
        '<div class="dcp-action-row" style="justify-content:space-between; align-items:center; margin-top:4px">' +
          '<label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px; opacity:.7">' +
            '<input type="checkbox" checked disabled style="width:auto"> Assign Index' +
          '</label>' +
          '<div style="display:flex; gap:8px">' +
            '<button type="button" class="dcp-btn dcp-btn-ghost" id="dcp-edititem-cancel-2">Cancel</button>' +
            '<button type="button" class="dcp-btn dcp-btn-primary" id="dcp-edititem-submit">Save Changes</button>' +
          '</div>' +
        '</div>' +
        '<div class="dcp-helper" style="margin:2px 0 6px">Forced on — an Index Placeholder <i>is</i> an index, there\'s nothing to toggle</div>' +
        '<input type="text" id="dcp-edititem-idx-name" value="' + _esc(idxState.name) + '" style="width:25%">' +
        '<div class="dcp-helper" id="dcp-edititem-idx-name-warning" style="display:none; color:#8f2a1f">Index name already used, will be dedupped on Save Changes</div>'
      : hasForm ?
        // pushZero/popZero (and any future control item) — real fields,
        // no Color/Assign Index block, so the action row stands alone.
        // Insert Drawing gets an extra ghost button on the left (Load Dwg
        // from file…, matching Create Dwg's own identical action-row
        // layout) — space-between instead of flex-end to make room.
        fieldsHtml +
        (isInsertDwg
          ? '<div class="dcp-action-row" style="justify-content:space-between; margin-top:16px">' +
              '<button type="button" class="dcp-btn dcp-btn-ghost" id="dcp-edititem-load-dwg-file">Load Dwg from file&hellip;</button>' +
              '<div style="display:flex; gap:8px">' +
                '<button type="button" class="dcp-btn dcp-btn-ghost" id="dcp-edititem-cancel-2">Cancel</button>' +
                '<button type="button" class="dcp-btn dcp-btn-primary" id="dcp-edititem-submit"' +
                  // Disabled both when nothing is selected AND when the
                  // current selection is still the missing dwg from
                  // before (see the "Drawing to insert" dropdown's own
                  // doc just above) — a real dwg must be picked before
                  // this item can be saved.
                  ((insertDwgState.drawingName && DwgLibrary.get(insertDwgState.drawingName)) ? '' : ' disabled') + '>Save Changes</button>' +
              '</div>' +
            '</div>'
          : '<div class="dcp-action-row" style="justify-content:flex-end; margin-top:16px">' +
              '<button type="button" class="dcp-btn dcp-btn-ghost" id="dcp-edititem-cancel-2">Cancel</button>' +
              '<button type="button" class="dcp-btn dcp-btn-primary" id="dcp-edititem-submit">Save Changes</button>' +
            '</div>')
      :
        '<div class="dcp-helper" style="margin:8px 0 16px">Editing "' + _esc(selectedType) + '" items is not implemented yet — only Line, Rectangle, Circle, Arc, Label, Value, touchZone, insertDwg, pushZero, popZero, Index Placeholder, Hide Item, and Unhide Item are supported so far.</div>' +
        '<div class="dcp-action-row" style="justify-content:flex-end; margin-top:16px">' +
          '<button type="button" class="dcp-btn dcp-btn-ghost" id="dcp-edititem-cancel-2">Cancel</button>' +
          '<button type="button" class="dcp-btn dcp-btn-primary" id="dcp-edititem-submit" disabled>Save Changes</button>' +
        '</div>'
      );

    root.querySelector('#dcp-edititem-type').addEventListener('change', (e) => {
      // Discard whatever draft the PREVIOUS type selection may have
      // written before switching — otherwise a stale draft could be
      // left showing in the preview if the new type is one of the
      // not-yet-implemented ones (which never calls updatePreview()
      // itself to refresh/clear it).
      DwgLibrary.remove(ADD_ITEM_DRAFT_NAME);
      _renderEditItemScreen(root, dwgName, itemIndex, e.target.value);
    });

    // Discard the shared draft (harmless no-op if the non-Line branch
    // below never wrote one) before leaving this screen any way other
    // than Save Changes.
    function discardAndReturn() {
      DwgLibrary.remove(ADD_ITEM_DRAFT_NAME);
      _renderEditDwgScreen(root, dwgName);
    }
    root.querySelector('#dcp-edititem-cancel').addEventListener('click', discardAndReturn);
    root.querySelector('#dcp-edititem-cancel-2').addEventListener('click', discardAndReturn);
    root.querySelector('#dcp-exit-designer').addEventListener('click', () => {
      DwgLibrary.remove(ADD_ITEM_DRAFT_NAME);
      _exitDesigner();
    });

    if (!hasForm) {
      // No fields, no draft, Save Changes is disabled — show the real,
      // unmodified dwg (the draft was already discarded above, either
      // by the type-change handler or never existed on first render).
      _renderPreview(dwgName);
      return;
    }

    const xOffsetInput = root.querySelector('#dcp-edititem-xoffset');
    const yOffsetInput = root.querySelector('#dcp-edititem-yoffset');
    const xSizeInput = root.querySelector('#dcp-edititem-xsize');
    const ySizeInput = root.querySelector('#dcp-edititem-ysize');
    const radiusInput = (isCircle || isArc) ? root.querySelector('#dcp-edititem-radius') : null;
    const startInput = isArc ? root.querySelector('#dcp-edititem-start') : null;
    const angleInput = isArc ? root.querySelector('#dcp-edititem-angle') : null;
    const filledCheckbox = (isRectangle || isCircle || isArc) ? root.querySelector('#dcp-edititem-filled') : null;
    const centeredCheckbox = (isRectangle || isTouchZone) ? root.querySelector('#dcp-edititem-centered') : null;
    const roundedCheckbox = isRectangle ? root.querySelector('#dcp-edititem-rounded') : null;
    const touchZoneCmdNameInput = isTouchZone ? root.querySelector('#dcp-edititem-touchzone-cmdname') : null;
    const touchZoneFilterSelect = isTouchZone ? root.querySelector('#dcp-edititem-touchzone-filter') : null;
    const textInput = (isLabel || isValue) ? root.querySelector('#dcp-edititem-text') : null;
    const fontSizeInput = (isLabel || isValue) ? root.querySelector('#dcp-edititem-fontsize') : null;
    const alignSelect = (isLabel || isValue) ? root.querySelector('#dcp-edititem-align') : null;
    const boldCheckbox = (isLabel || isValue) ? root.querySelector('#dcp-edititem-bold') : null;
    const italicCheckbox = (isLabel || isValue) ? root.querySelector('#dcp-edititem-italic') : null;
    const underlineCheckbox = (isLabel || isValue) ? root.querySelector('#dcp-edititem-underline') : null;
    const valueInput = isLabel ? root.querySelector('#dcp-edititem-value') : null;
    const decimalsInput = isLabel ? root.querySelector('#dcp-edititem-decimals') : null;
    const unitsInput = isLabel ? root.querySelector('#dcp-edititem-units') : null;
    const intValueInput = isValue ? root.querySelector('#dcp-edititem-intvalue') : null;
    const valueDecimalsInput = isValue ? root.querySelector('#dcp-edititem-valuedecimals') : null;
    const minInput = isValue ? root.querySelector('#dcp-edititem-min') : null;
    const maxInput = isValue ? root.querySelector('#dcp-edititem-max') : null;
    const displayMinInput = isValue ? root.querySelector('#dcp-edititem-displaymin') : null;
    const displayMaxInput = isValue ? root.querySelector('#dcp-edititem-displaymax') : null;
    const valueUnitsInput = isValue ? root.querySelector('#dcp-edititem-valueunits') : null;
    const pushXInput = isPushZero ? root.querySelector('#dcp-edititem-push-x') : null;
    const pushYInput = isPushZero ? root.querySelector('#dcp-edititem-push-y') : null;
    const pushScaleInput = isPushZero ? root.querySelector('#dcp-edititem-push-scale') : null;
    const useIndexCheckbox = root.querySelector('#dcp-edititem-use-index');
    const idxNameInput = root.querySelector('#dcp-edititem-idx-name');

    /// Build the updated item — Line, Rectangle, Circle, Arc, Label,
    /// Value, pushZero, or popZero depending on selectedType — from
    /// current form state. See _renderAddItemScreen's buildDraftItem()
    /// for the dedupe param.
    function buildUpdatedItem(dedupe) {
      let item;
      if (isPushZero) {
        // No color/indexed/idxName — pushZero is a control item, not a
        // drawable/addressable one (see hasCommonBlock's own doc).
        return { type: 'pushZero', x: parseFloat(pushXInput.value) || 0, y: parseFloat(pushYInput.value) || 0, scale: parseFloat(pushScaleInput.value) || 1 };
      } else if (isPopZero) {
        // No fields, no color, no idxName — matches pushZero's own doc.
        return { type: 'popZero' };
      } else if (isHide || isUnhide) {
        // See _renderAddItemScreen's own buildDraftItem isHide/isUnhide
        // doc — Save Changes stays disabled until hideState.target is set.
        return { type: (isHide ? 'hide' : 'unhide'), [hideState.target.field]: hideState.target.value };
      } else if (isInsertDwg) {
        // See _renderAddItemScreen's own buildDraftItem isInsertDwg doc.
        return {
          type: 'insertDwg',
          drawingName: insertDwgState.drawingName,
          cmdName: 'dwg_' + insertDwgState.drawingName,
          xOffset: _readNum(xOffsetInput.value, 0),
          yOffset: _readNum(yOffsetInput.value, 0),
        };
      } else if (isTouchZone) {
        // See _renderAddItemScreen's own buildDraftItem isTouchZone doc —
        // touchActions/touchActionInput come from touchZoneState (already
        // seeded from originalItem when prefillFromOriginal, or resumeState
        // when returning from a sub-editor — see touchZoneState's own doc).
        const zoneItem = {
          type: 'touchZone',
          xOffset: _readNum(xOffsetInput.value, 0),
          yOffset: _readNum(yOffsetInput.value, 0),
          xSize: _readNum(xSizeInput.value, 1),
          ySize: _readNum(ySizeInput.value, 1),
          filter: parseInt(touchZoneFilterSelect.value, 10) || 0,
          centered: centeredCheckbox.checked,
          cmdName: dedupe ? _dedupeName(touchZoneState.cmdName.trim() || 'cmd_c1', usedCmdNames) : (touchZoneState.cmdName.trim() || 'cmd_c1'),
        };
        if (touchZoneState.touchActions.length > 0) zoneItem.touchActions = touchZoneState.touchActions.slice();
        if (touchZoneState.touchActionInput) zoneItem.touchActionInput = touchZoneState.touchActionInput;
        return zoneItem;
      } else if (isIndex) {
        // No color — idxName gets attached below by the same shared
        // idxState logic every other indexable type uses.
        item = { type: 'index' };
      } else if (isRectangle) {
        item = {
          type: 'rectangle',
          xOffset: _readNum(xOffsetInput.value, 0),
          yOffset: _readNum(yOffsetInput.value, 0),
          xSize: _readNum(xSizeInput.value, 1),
          ySize: _readNum(ySizeInput.value, 1),
          filled: filledCheckbox.checked,
          centered: centeredCheckbox.checked,
          rounded: roundedCheckbox.checked,
          color: (state.colorMode === 'blackwhite') ? -1 : state.color,
        };
      } else if (isCircle) {
        item = {
          type: 'circle',
          xOffset: _readNum(xOffsetInput.value, 0),
          yOffset: _readNum(yOffsetInput.value, 0),
          radius: parseFloat(radiusInput.value) || 1,
          filled: filledCheckbox.checked,
          color: (state.colorMode === 'blackwhite') ? -1 : state.color,
        };
      } else if (isArc) {
        item = {
          type: 'arc',
          xOffset: _readNum(xOffsetInput.value, 0),
          yOffset: _readNum(yOffsetInput.value, 0),
          radius: parseFloat(radiusInput.value) || 1,
          start: parseFloat(startInput.value) || 0,
          angle: parseFloat(angleInput.value) || 0,
          filled: filledCheckbox.checked,
          color: (state.colorMode === 'blackwhite') ? -1 : state.color,
        };
      } else if (isLabel) {
        item = {
          type: 'label',
          xOffset: _readNum(xOffsetInput.value, 0),
          yOffset: _readNum(yOffsetInput.value, 0),
          text: textInput.value,
          fontSize: parseInt(fontSizeInput.value, 10) || 0,
          align: alignSelect.value,
          bold: boldCheckbox.checked,
          italic: italicCheckbox.checked,
          underline: underlineCheckbox.checked,
          color: (state.colorMode === 'blackwhite') ? -1 : state.color,
        };
        // See _renderAddItemScreen's buildDraftItem for why these three
        // are independent "if not empty" checks, not gated on each other.
        if (valueInput.value !== '') item.value = parseFloat(valueInput.value);
        if (decimalsInput.value !== '') item.decimals = parseInt(decimalsInput.value, 10);
        if (unitsInput.value !== '') item.units = unitsInput.value;
      } else if (isValue) {
        item = {
          type: 'value',
          xOffset: _readNum(xOffsetInput.value, 0),
          yOffset: _readNum(yOffsetInput.value, 0),
          text: textInput.value,
          fontSize: parseInt(fontSizeInput.value, 10) || 0,
          align: alignSelect.value,
          bold: boldCheckbox.checked,
          italic: italicCheckbox.checked,
          underline: underlineCheckbox.checked,
          intValue: parseInt(intValueInput.value, 10) || 0,
          min: parseFloat(minInput.value) || 0,
          max: parseFloat(maxInput.value) || 1,
          displayMin: parseFloat(displayMinInput.value) || 0,
          displayMax: parseFloat(displayMaxInput.value) || 1,
          decimals: parseInt(valueDecimalsInput.value, 10) || 0,
          units: valueUnitsInput.value,
          color: (state.colorMode === 'blackwhite') ? -1 : state.color,
        };
      } else {
        item = {
          type: 'line',
          xOffset: _readNum(xOffsetInput.value, 0),
          yOffset: _readNum(yOffsetInput.value, 0),
          xSize: _readNum(xSizeInput.value, 1),
          ySize: _readNum(ySizeInput.value, 1),
          color: (state.colorMode === 'blackwhite') ? -1 : state.color,
        };
      }
      if (idxState.use && idxState.name.trim()) {
        item.indexed = true;
        item.idxName = dedupe ? _dedupeName(idxState.name.trim(), usedIdxNames) : idxState.name.trim();
      }
      return item;
    }

    function updateIdxNameWarning() {
      const collides = idxState.use && idxState.name.trim() && usedIdxNames.has(idxState.name.trim());
      root.querySelector('#dcp-edititem-idx-name-warning').style.display = collides ? 'block' : 'none';
    }

    /// See _renderAddItemScreen's own updateCmdNameWarning doc.
    function updateCmdNameWarning() {
      const collides = touchZoneState.cmdName.trim() && usedCmdNames.has(touchZoneState.cmdName.trim());
      root.querySelector('#dcp-edititem-touchzone-cmdname-warning').style.display = collides ? 'block' : 'none';
    }

    /// Live preview: this dwg's real items with itemIndex REPLACED by
    /// the in-progress edit (not appended, unlike Add Item), saved under
    /// the shared ADD_ITEM_DRAFT_NAME (Add Item and Edit Item are never
    /// open at the same time, so sharing one draft slot is safe and
    /// avoids yet another constant).
    function updatePreview() {
      const items = dwg.items.slice();
      items[itemIndex] = buildUpdatedItem(false);
      const raw = {
        name: ADD_ITEM_DRAFT_NAME,
        x: dwg.x, y: dwg.y, refresh: dwg.refresh, color: dwg.color,
        items: flattenTouchActions(items),
      };
      const { dwg: draftDwg } = validateAndRepairDwg(raw, ADD_ITEM_DRAFT_NAME);
      DwgLibrary.saveHidden(draftDwg);
      _dwgDesignerAdapter.device.invalidatePreviewVersion(ADD_ITEM_DRAFT_NAME);
      _renderPreview(ADD_ITEM_DRAFT_NAME);
    }

    let previewDebounce = null;
    function scheduleUpdatePreview() {
      if (previewDebounce) clearTimeout(previewDebounce);
      previewDebounce = setTimeout(updatePreview, 500);
    }
    [xOffsetInput, yOffsetInput, xSizeInput, ySizeInput, radiusInput, startInput, angleInput, textInput, fontSizeInput, valueInput, decimalsInput, unitsInput, intValueInput, valueDecimalsInput, minInput, maxInput, displayMinInput, displayMaxInput, valueUnitsInput, pushXInput, pushYInput, pushScaleInput].filter(Boolean).forEach((input) => {
      input.addEventListener('input', scheduleUpdatePreview);
      input.addEventListener('blur', () => {
        if (previewDebounce) { clearTimeout(previewDebounce); previewDebounce = null; }
        updatePreview();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (previewDebounce) { clearTimeout(previewDebounce); previewDebounce = null; }
          updatePreview();
        }
      });
    });
    if (alignSelect) alignSelect.addEventListener('change', updatePreview);

    function buildColorPopup() {
      const popup = root.querySelector('#dcp-edititem-color-popup');
      const sections = [
        { title: 'Standard Colors (0-15)', from: 0, to: 15 },
        { title: '216 Colors (16-231)', from: 16, to: 231 },
        { title: 'Grayscale (232-255)', from: 232, to: 255 },
      ];
      let html = '';
      sections.forEach((section) => {
        html += '<div class="dcp-color-section-title">' + section.title + '</div><div class="dcp-color-row">';
        for (let i = section.from; i <= section.to; i++) {
          html += '<span class="dcp-color-cell" data-color="' + i + '" style="background:' + _swatchHex(i) + '"></span>';
        }
        html += '</div>';
      });
      popup.innerHTML = html;
      popup.querySelectorAll('.dcp-color-cell').forEach((cell) => {
        cell.addEventListener('click', () => {
          state.color = parseInt(cell.getAttribute('data-color'), 10);
          state.colorMode = 'color';
          updateColorHeader();
          updatePreview();
          popup.style.display = 'none';
        });
      });
    }

    function updateColorHeader() {
      const isBW = state.colorMode === 'blackwhite';
      root.querySelector('#dcp-edititem-bw-btn').classList.toggle('dcp-mode-active', isBW);
      root.querySelector('#dcp-edititem-color-btn').classList.toggle('dcp-mode-active', !isBW);
      root.querySelector('#dcp-edititem-color-swatch').style.background =
        isBW ? _swatchHex(-1, dwg.color) : _swatchHex(state.color);
      root.querySelector('#dcp-edititem-color-num').textContent = isBW ? 'BLACK_WHITE (auto)' : ('Color ' + state.color);
      root.querySelectorAll('#dcp-edititem-color-popup .dcp-color-cell').forEach((cell) => {
        cell.classList.toggle('dcp-selected', !isBW && parseInt(cell.getAttribute('data-color'), 10) === state.color);
      });
    }

    /// See _renderAddItemScreen's own wireHideScreen doc — same
    /// candidate list/Show-press/Hide Type wiring, edititem ids, and the
    /// currently-edited hide item's own index excluded from
    /// _isCurrentlyHidden so its CURRENT target doesn't read as "Hidden"
    /// against itself.
    function wireHideScreen() {
      const hideTypeSelect = root.querySelector('#dcp-edititem-hidetype');
      const listContainer = root.querySelector('#dcp-edititem-hide-list');
      const labelEl = root.querySelector('#dcp-edititem-hide-label');
      const submitBtn = root.querySelector('#dcp-edititem-submit');
      let pressedState = null;

      function renderList() {
        labelEl.textContent = 'Available ' + _hideKindLabel(hideState.hideKind) + ' (select item to ' + (isUnhide ? 'unhide' : 'hide') + ')';
        // Edit Item shows EVERY insertDwg candidate, including one whose
        // own target isn't currently loaded — unlike Add Item's own copy
        // of this list, which leaves those out entirely (nothing worth
        // creating a brand new reference to). A missing one is still
        // shown here (never silently dropped from view) so a Hide/Unhide
        // item that already, genuinely targets it stays visible/
        // selectable, annotated in red italic instead.
        const candidates = _hideCandidates(dwg, hideState.hideKind);
        listContainer.innerHTML = (candidates.length === 0)
          ? '<div class="dcp-empty">No ' + _hideKindLabel(hideState.hideKind) + ' available in this dwg yet.</div>'
          : candidates.map(({ i, item, field, value }) => {
              const isSelected = hideState.target && hideState.target.field === field && hideState.target.value === value;
              const isActuallyHidden = hideState.actuallyHiddenTarget &&
                hideState.actuallyHiddenTarget.field === field && hideState.actuallyHiddenTarget.value === value;
              const alreadyHidden = _isCurrentlyHidden(dwg.items, field, value, itemIndex);
              const missingDwgName = (item.type === 'insertDwg' && item.drawingName && !DwgLibrary.get(item.drawingName))
                ? item.drawingName : null;
              // See _renderAddItemScreen's own wireHideScreen doc for the
              // Hide/Unhide `blocked` semantics, and the actually-hidden
              // target's own fixed status-label treatment.
              const blocked = isUnhide ? !alreadyHidden : alreadyHidden;
              const blockedLabel = isUnhide ? 'Visible' : 'Hidden';
              const actionLabel = isUnhide ? 'Unhide' : 'Hide';
              const statusOrAction = isActuallyHidden
                ? '<span class="dcp-helper" style="margin:0; font-style:italic">' + (isUnhide ? 'Unhidden Item' : 'Hidden Item') + '</span>'
                : (blocked && !isSelected
                    ? '<span class="dcp-helper" style="margin:0; font-style:italic">' + blockedLabel + '</span>'
                    : '<button type="button" class="dcp-btn ' + (isSelected ? 'dcp-btn-primary' : 'dcp-btn-danger') + ' dcp-hide-select-btn" data-field="' + field + '" data-value="' + _esc(value) + '" style="padding:4px 10px; font-size:11px">' + (isSelected ? 'Selected' : actionLabel) + '</button>');
              return '<div class="dcp-edit-item-row">' +
                '<div class="dcp-edit-item-info">' +
                  '<div class="dcp-edit-item-type"><b>' + _esc(_itemTypeLabel(item)) + '</b> ' +
                    '<span class="dcp-edit-item-type-suffix">' + _esc(value) + '</span>' +
                    (missingDwgName ? ' <span class="dcp-missing-dwg-note">&mdash; dwg not loaded</span>' : '') +
                  '</div>' +
                  '<div class="dcp-edit-item-detail">' + _describeItem(item, dwg.color) + '</div>' +
                '</div>' +
                '<div class="dcp-edit-item-actions">' +
                  '<button type="button" class="dcp-mini-btn dcp-mini-btn-show" data-field="' + field + '" data-value="' + _esc(value) + '" title="Hold to identify this item in the preview">&#128065;</button>' +
                  statusOrAction +
                '</div>' +
              '</div>';
            }).join('');

        // Disabled both when nothing is selected AND when the current
        // selection targets an insertDwg that isn't currently loaded
        // (see missingDwgName above) — matching the insertDwg item's own
        // Save Changes gate, a target must resolve to a real dwg before
        // this item can be saved.
        const targetIsMissing = !!hideState.target && candidates.some(({ field, value, item }) =>
          field === hideState.target.field && value === hideState.target.value &&
          item.type === 'insertDwg' && item.drawingName && !DwgLibrary.get(item.drawingName)
        );
        submitBtn.disabled = !hideState.target || targetIsMissing;

        listContainer.querySelectorAll('.dcp-hide-select-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            hideState.target = { field: btn.getAttribute('data-field'), value: btn.getAttribute('data-value') };
            renderList();
          });
        });
        listContainer.querySelectorAll('.dcp-mini-btn-show').forEach((btn) => {
          const field = btn.getAttribute('data-field');
          const value = btn.getAttribute('data-value');
          btn.addEventListener('mousedown', (e) => { e.stopPropagation(); pressShow(field, value); });
          btn.addEventListener('mouseup', (e) => { e.stopPropagation(); releaseShow(); });
          btn.addEventListener('mouseleave', () => { if (btn.matches(':active')) releaseShow(); });
        });
      }

      /// Press: toggle the target to the OPPOSITE of its current
      /// visibility (a currently-visible candidate briefly disappears; a
      /// currently-hidden one — every selectable row on the Unhide
      /// screen — briefly appears), via a real {+|h...}/{+|uh...} update
      /// targeting its already-minted idx/cmd, matching
      /// _renderEditDwgScreen's own _pressShowItem. A naive
      /// splice-the-item-out-of-a-draft approach (this screen's earlier
      /// implementation) only ever shows something for a currently-
      /// VISIBLE target — splicing out an already-hidden one changes
      /// nothing, since it was already invisible, which is exactly why
      /// Show silently did nothing on the Unhide screen (every
      /// selectable Unhide row IS currently hidden).
      function pressShow(field, value) {
        const loadCmd = window.DWG_PREVIEW_KEY_PREFIX + dwgName;
        _dwgDesignerAdapter.device.ensureAutoAssignments(dwgName, dwg);
        // An insertDwg target is identified on the wire by its own
        // loadCmd (|hd/|uhd), never an auto-minted cmd — insertDwg's own
        // |d... wire fragment never transmits a cmd at all (see
        // dwgWireEncoder.js's encodeInsertDwg/encodeHideUnhideErase), so
        // resolveCmd's return value would target nothing.
        const kind = (hideState.hideKind === 'insertDwg') ? 'drawingName' : ((field === 'idxName') ? 'idx' : 'cmd');
        const resolvedValue = kind === 'idx'
          ? _dwgDesignerAdapter.device.resolveIdx(dwgName, value)
          : kind === 'cmd'
            ? _dwgDesignerAdapter.device.resolveCmd(dwgName, value)
            : (dwg.items.find((it) => it.type === 'insertDwg' && it.cmdName === value) || {}).drawingName;
        const originalHidden = _isCurrentlyHidden(dwg.items, field, value);
        pressedState = { loadCmd, kind, resolvedValue, originalHidden };
        const directive = { type: originalHidden ? 'unhide' : 'hide' };
        directive[kind] = resolvedValue;
        _dwgDesignerAdapter.device.forceNextUpdate(loadCmd, [directive]);
        window.drawingViewer.queueDrawingUpdate(loadCmd);
      }
      /// Release: restore whatever pressShow just toggled away — the
      /// exact opposite hide/unhide directive.
      function releaseShow() {
        if (!pressedState) return;
        const { loadCmd, kind, resolvedValue, originalHidden } = pressedState;
        pressedState = null;
        const directive = { type: originalHidden ? 'hide' : 'unhide' };
        directive[kind] = resolvedValue;
        _dwgDesignerAdapter.device.forceNextUpdate(loadCmd, [directive]);
        window.drawingViewer.queueDrawingUpdate(loadCmd);
      }

      hideTypeSelect.addEventListener('change', () => {
        // Clear the pending selection on every Hide/Unhide Type switch —
        // per direction, only a candidate actually VISIBLE in the
        // NEWLY-chosen kind's own list should ever be selectable/
        // selected; a remembered selection from a different kind isn't
        // shown here at all, so keeping it around would leave
        // hideState.target pointing at something this screen no longer
        // displays. actuallyHiddenTarget (the fixed "Hidden Item"/
        // "Unhidden Item" status label) is untouched — it isn't a
        // selection, it doesn't change here.
        hideState.hideKind = hideTypeSelect.value;
        hideState.target = null;
        renderList();
      });

      renderList();
    }

    /// See _renderAddItemScreen's own wireInsertDwgScreen doc.
    function wireInsertDwgScreen() {
      const select = root.querySelector('#dcp-edititem-insertdwg-name');
      if (!select) return; // no candidates at all — nothing to wire
      select.addEventListener('change', () => {
        insertDwgState.drawingName = select.value || null;
        root.querySelector('#dcp-edititem-insertdwg-cmdname').value =
          insertDwgState.drawingName ? 'dwg_' + insertDwgState.drawingName : '';
        root.querySelector('#dcp-edititem-submit').disabled = !insertDwgState.drawingName;
        updatePreview();
      });
    }

    if (isHide || isUnhide) {
      _renderPreview(dwgName);
    } else {
      updatePreview();
    }

    // pushZero (hasCommonBlock false) has no Color/Assign Index block at
    // all in the DOM — none of this wiring applies to it.
    if (hasCommonBlock) {
      buildColorPopup();
      updateColorHeader();
      updateIdxNameWarning();

      root.querySelector('#dcp-edititem-bw-btn').addEventListener('click', () => {
        state.colorMode = 'blackwhite';
        updateColorHeader();
        updatePreview();
        root.querySelector('#dcp-edititem-color-popup').style.display = 'none';
      });
      function openColorPicker() {
        state.colorMode = 'color';
        updateColorHeader();
        updatePreview();
        root.querySelector('#dcp-edititem-color-popup').style.display = 'block';
      }
      root.querySelector('#dcp-edititem-color-btn').addEventListener('click', openColorPicker);
      root.querySelector('#dcp-edititem-color-swatch').addEventListener('click', openColorPicker);

      useIndexCheckbox.addEventListener('change', () => {
        idxState.use = useIndexCheckbox.checked;
        idxNameInput.style.display = idxState.use ? 'block' : 'none';
        updateIdxNameWarning();
        updatePreview();
      });
      idxNameInput.addEventListener('input', () => {
        idxState.name = idxNameInput.value;
        updateIdxNameWarning();
      });
      idxNameInput.addEventListener('blur', updatePreview);
    } else if (isIndex) {
      // Assign Index is forced on and locked (no checkbox to wire) —
      // only the idx-name field itself needs live wiring.
      updateIdxNameWarning();
      idxNameInput.addEventListener('input', () => {
        idxState.name = idxNameInput.value;
        updateIdxNameWarning();
      });
      idxNameInput.addEventListener('blur', updatePreview);
    } else if (isHide || isUnhide) {
      wireHideScreen();
    } else if (isInsertDwg) {
      wireInsertDwgScreen();
    } else if (isTouchZone) {
      updateCmdNameWarning();
      touchZoneCmdNameInput.addEventListener('input', () => {
        touchZoneState.cmdName = touchZoneCmdNameInput.value;
        updateCmdNameWarning();
      });
      touchZoneCmdNameInput.addEventListener('blur', updatePreview);
      touchZoneFilterSelect.addEventListener('change', updatePreview);

      /// See _renderAddItemScreen's own snapshotTouchZoneResumeState doc.
      function snapshotTouchZoneResumeState() {
        return {
          xOffset: _readNum(xOffsetInput.value, 0),
          yOffset: _readNum(yOffsetInput.value, 0),
          xSize: _readNum(xSizeInput.value, 1),
          ySize: _readNum(ySizeInput.value, 1),
          filter: parseInt(touchZoneFilterSelect.value, 10) || 0,
          centered: centeredCheckbox.checked,
          cmdName: touchZoneCmdNameInput.value,
          touchActions: touchZoneState.touchActions,
          touchActionInput: touchZoneState.touchActionInput,
        };
      }
      const touchActionInputAddBtn = root.querySelector('#dcp-edititem-touchactioninput-add');
      const touchActionInputEditBtn = root.querySelector('#dcp-edititem-touchactioninput-edit');
      const touchActionInputRemoveBtn = root.querySelector('#dcp-edititem-touchactioninput-remove');
      if (touchActionInputAddBtn || touchActionInputEditBtn) {
        (touchActionInputAddBtn || touchActionInputEditBtn).addEventListener('click', () => {
          _renderTouchActionInputEditorScreen(root, dwgName, itemIndex, snapshotTouchZoneResumeState());
        });
      }
      if (touchActionInputRemoveBtn) {
        touchActionInputRemoveBtn.addEventListener('click', () => {
          const resume = snapshotTouchZoneResumeState();
          resume.touchActionInput = null;
          _renderEditItemScreen(root, dwgName, itemIndex, 'touchZone', resume);
        });
      }
      const touchActionAddRow = root.querySelector('#dcp-edititem-touchaction-add');
      if (touchActionAddRow) {
        touchActionAddRow.addEventListener('click', () => {
          _renderTouchActionEditorScreen(root, dwgName, itemIndex, snapshotTouchZoneResumeState(), null);
        });
      }
      root.querySelectorAll('.dcp-touchaction-edit-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const actionIndex = parseInt(btn.getAttribute('data-index'), 10);
          _renderTouchActionEditorScreen(root, dwgName, itemIndex, snapshotTouchZoneResumeState(), actionIndex);
        });
      });
      root.querySelectorAll('.dcp-touchaction-remove-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const actionIndex = parseInt(btn.getAttribute('data-index'), 10);
          const resume = snapshotTouchZoneResumeState();
          resume.touchActions = resume.touchActions.slice();
          resume.touchActions.splice(actionIndex, 1);
          _renderEditItemScreen(root, dwgName, itemIndex, 'touchZone', resume);
        });
      });
    }

    if (isInsertDwg) {
      // Discard this draft and hand off to the standalone Load Dwg flow,
      // same file-picker/validation path Create Dwg/Add Item's own
      // "Load Dwg from file…" uses — but, unlike those, pass an onLoaded
      // callback so a successful load comes straight back to THIS Edit
      // Item screen with the freshly-loaded dwg pre-selected, instead of
      // bouncing to the top-level list view and leaving the user to hunt
      // for it in the dropdown themselves.
      const loadFileBtn = root.querySelector('#dcp-edititem-load-dwg-file');
      if (loadFileBtn) {
        loadFileBtn.addEventListener('click', () => {
          DwgLibrary.remove(ADD_ITEM_DRAFT_NAME);
          _startLoadDwg(root, (loadedName) => {
            _renderEditItemScreen(root, dwgName, itemIndex, 'insertDwg', { drawingName: loadedName });
          });
        });
      }
    }

    [filledCheckbox, centeredCheckbox, roundedCheckbox, boldCheckbox, italicCheckbox, underlineCheckbox].filter(Boolean).forEach((cb) => {
      cb.addEventListener('change', updatePreview);
    });

    root.querySelector('#dcp-edititem-submit').addEventListener('click', () => {
      const items = dwg.items.slice();
      const updatedItem = buildUpdatedItem(true);
      const oldIdxName = originalItem.idxName;
      const newIdxName = updatedItem.idxName;
      items[itemIndex] = updatedItem;
      // Renaming (not just adding or clearing) Assign Index: propagate
      // to every OTHER reference to the OLD name BEFORE validating, so
      // they follow the rename instead of being flagged/deleted as
      // orphaned by validateAndRepairDwg's own orphan-check below (see
      // _renameIdxNameReferences's own doc). Only a genuine rename
      // (both names present, actually different) triggers this —
      // clearing Assign Index entirely (newIdxName undefined) leaves any
      // other reference to the old name for that orphan-check to catch
      // and clean up normally, same as any other now-invalid reference.
      // newIdxName was already deduped against every OTHER declaring
      // item in this dwg — one flat namespace, no kind split — by
      // buildUpdatedItem's own _dedupeName call above (usedIdxNames), so
      // there's no separate "other kind" left to re-check here: a
      // cross-kind sharing partner being dragged along by the
      // propagation below can't collide with anything, because
      // usedIdxNames already covered its kind too.
      //
      // Only a DECLARING item can be renamed this way.  hide/unhide/erase
      // (REFERENCE_ONLY_TYPES) carry an idxName that NAMES SOMEONE ELSE'S
      // index, so changing it is retargeting, not renaming: propagating it
      // would rewrite the real declarer (and every other reference) to the
      // newly-picked name — e.g. editing a Hide item from "indicator" to
      // "idx_hidden" silently renamed the Index Placeholder that declared
      // "indicator".  Changing what an item hides must never touch the
      // assigned indexes.  Both ends are checked: if the ORIGINAL was
      // reference-only there is no declaration to rename, and if the UPDATED
      // item is reference-only the old declaration is being removed
      // altogether, so surviving references to it are orphans for
      // validateAndRepairDwg's own orphan-check to clean up — not things to
      // re-point at this item's new target.
      const wasDeclaring = REFERENCE_ONLY_TYPES.indexOf(originalItem.type) === -1;
      const nowDeclaring = REFERENCE_ONLY_TYPES.indexOf(updatedItem.type) === -1;
      if (wasDeclaring && nowDeclaring && oldIdxName && newIdxName && oldIdxName !== newIdxName) {
        _renameIdxNameReferences(items, itemIndex, oldIdxName, newIdxName);
      }
      const raw = {
        name: dwgName,
        description: (typeof dwg.description === 'string') ? dwg.description : '',
        x: dwg.x, y: dwg.y, refresh: dwg.refresh, color: dwg.color,
        items: flattenTouchActions(items),
      };
      const { dwg: savedDwg } = validateAndRepairDwg(raw, dwgName);
      DwgLibrary.save(savedDwg);
      DwgLibrary.remove(ADD_ITEM_DRAFT_NAME);
      _dwgDesignerAdapter.device.invalidatePreviewVersion(dwgName);
      _renderEditDwgScreen(root, dwgName);
    });
  }

  // ── Touch Zone: touchAction / touchActionInput sub-editors ────────

  /// Live-preview the touchZone draft while its touchAction/
  /// touchActionInput sub-editor is open — same draft-dwg-in-DwgLibrary
  /// mechanism _renderAddItemScreen/_renderEditItemScreen's own
  /// updatePreview() use (build a draft dwg with this item's CURRENT,
  /// not-yet-committed content, save it under ADD_ITEM_DRAFT_NAME,
  /// re-render), just building the touchZone item from resumeState's
  /// OTHER fields plus the CURRENTLY-EDITED touchActions/
  /// touchActionInput passed in directly — these haven't been written
  /// back into resumeState itself yet, that only happens on Save/commit,
  /// but the preview needs to reflect every keystroke well before that.
  /// @param {string} dwgName
  /// @param {object} dwg — DwgLibrary.get(dwgName), for x/y/color/refresh
  ///        and the rest of its own real items
  /// @param {number|null} itemIndex — the touchZone's own index in
  ///        dwg.items (Edit Item), or null/undefined (Add Item, not yet
  ///        committed — appended instead of replaced)
  /// @param {object} resumeState — the touchZone draft's other fields
  ///        (xOffset/yOffset/xSize/ySize/filter/centered/cmdName)
  /// @param {Array<object>} liveTouchActions
  /// @param {object|null} liveTouchActionInput
  /// @param {Array<object>} [extraItems] — appended LAST, after the touchZone
  ///        item. Used by the touchAction editor's press-and-hold Show button
  ///        to splice in a one-off hide/unhide directive targeting the
  ///        selected idxName; last-one-wins ordering (the same rule
  ///        _isCurrentlyHidden applies) is why they go on the end.
  function _updateTouchZoneSubEditorPreview(dwgName, dwg, itemIndex, resumeState, liveTouchActions, liveTouchActionInput, extraItems) {
    const zoneItem = {
      type: 'touchZone',
      xOffset: resumeState.xOffset, yOffset: resumeState.yOffset,
      xSize: resumeState.xSize, ySize: resumeState.ySize,
      filter: resumeState.filter, centered: resumeState.centered,
      cmdName: resumeState.cmdName,
    };
    if (liveTouchActions.length > 0) zoneItem.touchActions = liveTouchActions;
    if (liveTouchActionInput) zoneItem.touchActionInput = liveTouchActionInput;

    const items = (itemIndex === null || itemIndex === undefined)
      ? flattenTouchActions(dwg.items).concat([zoneItem])
      : (() => {
          const arr = dwg.items.slice();
          arr[itemIndex] = zoneItem;
          return flattenTouchActions(arr);
        })();
    if (extraItems && extraItems.length) items.push.apply(items, extraItems);
    const raw = { name: ADD_ITEM_DRAFT_NAME, x: dwg.x, y: dwg.y, refresh: dwg.refresh, color: dwg.color, items };
    const { dwg: draftDwg } = validateAndRepairDwg(raw, ADD_ITEM_DRAFT_NAME);
    DwgLibrary.saveHidden(draftDwg);
    _dwgDesignerAdapter.device.invalidatePreviewVersion(ADD_ITEM_DRAFT_NAME);
    _renderPreview(ADD_ITEM_DRAFT_NAME);
  }

  /// Render the touchActionInput editor — alt-a-mockup.html Screen 6,
  /// scoped to this project's own real wire-supported fields: prompt,
  /// target indexed label/value (idxName), background colour. Font size
  /// and text colour are deliberately left out — the real wire grammar
  /// (webTranslator.js's translateRawTouchActionInput: |XI~cmd~prompt
  /// [`textIdx]) has no separate slot for them; correctly sending them
  /// would mean baking inline formatting tags into the prompt text
  /// itself, a convention this project hasn't verified against its own
  /// parser/redraw.js yet — better left out than silently wrong.
  ///
  /// A touchZone has at most one touchActionInput (enforced simply by
  /// there being exactly one slot — touchZoneState.touchActionInput —
  /// not a list); this screen always edits THAT slot, reached via either
  /// the embedded list's "+ Add" (touchZoneState.touchActionInput null)
  /// or its edit (pencil) button (already set) — both wired identically
  /// by _renderAddItemScreen/_renderEditItemScreen.
  /// @param {HTMLElement} root
  /// @param {string} dwgName
  /// @param {number|null} itemIndex — the touchZone's own index in
  ///        dwg.items (Edit Item), or null/undefined (Add Item, not yet
  ///        committed) — decides which screen "Cancel"/"Save" return to.
  /// @param {object} resumeState — the touchZone draft's full field
  ///        snapshot (see _renderAddItemScreen's own resumeState doc);
  ///        resumeState.touchActionInput is the value being edited, or
  ///        null for a brand new one.
  function _renderTouchActionInputEditorScreen(root, dwgName, itemIndex, resumeState) {
    const dwg = DwgLibrary.get(dwgName);
    if (!dwg) { _renderMainView(root); return; }
    const existing = resumeState.touchActionInput;

    // An item already targeted by one of this SAME touchZone's own
    // touchActions can't also be the touchActionInput's own target —
    // excluded here, except the existing touchActionInput's OWN current
    // idxName (if any), so editing an already-conflicting saved state
    // doesn't make its own current selection disappear from the dropdown.
    const claimedByTouchActions = new Set(
      (resumeState.touchActions || [])
        .map((a) => a.action[0] && a.action[0].idxName)
        .filter(Boolean)
    );
    if (existing && existing.idxName) claimedByTouchActions.delete(existing.idxName);
    const labelValueCandidates = _labelValueCandidates(dwg, claimedByTouchActions);
    const promptValue = existing ? (existing.prompt || '') : 'Enter Value';
    // A brand new touchActionInput (no existing.idxName) defaults to the
    // FIRST candidate, not "(none)" — matches every other "sensible
    // default, freely changeable" convention in this file (e.g.
    // _insertDwgCandidates' own first-non-blocked default). Guarded for
    // zero candidates even though that case returns early, below, before
    // this value is ever actually used in the rendered form.
    const selectedIdxName = existing ? (existing.idxName || '') : (labelValueCandidates[0] ? labelValueCandidates[0].idxName : '');
    // Background colour sets the on-device prompt DIALOG's own
    // background (its own dedicated `<bg N>` wire tag); Text colour and
    // Font size style the PROMPT TEXT itself, inline (no dedicated wire
    // slot for either — see dwgWireEncoder.js's encodeTouchActionInput/
    // _inlineFormat). Two independent colour pickers, two independent
    // states.
    const bgColorState = {
      mode: (existing && existing.backgroundColor !== undefined && existing.backgroundColor !== -1) ? 'color' : 'blackwhite',
      color: (existing && existing.backgroundColor !== undefined && existing.backgroundColor !== -1) ? existing.backgroundColor : 15,
    };
    const textColorState = {
      mode: (existing && existing.color !== undefined && existing.color !== -1) ? 'color' : 'blackwhite',
      color: (existing && existing.color !== undefined && existing.color !== -1) ? existing.color : 15,
    };
    const fontSizeValue = existing ? (existing.fontSize || 0) : 0;

    function returnToTouchZoneScreen(newResumeState) {
      if (itemIndex === null || itemIndex === undefined) {
        _renderAddItemScreen(root, dwgName, 'touchZone', newResumeState);
      } else {
        _renderEditItemScreen(root, dwgName, itemIndex, 'touchZone', newResumeState);
      }
    }
    function discardAndReturn() { returnToTouchZoneScreen(resumeState); }

    if (labelValueCandidates.length === 0) {
      // Matches _renderTouchActionEditorScreen's own no-candidates
      // convention — Save still renders, disabled, rather than being
      // omitted entirely.
      root.innerHTML =
        '<div class="dcp-back-row">' +
          '<button type="button" class="dcp-back-link" id="dcp-tai-cancel">&larr; Cancel, back to touchZone</button>' +
          '<button type="button" class="dcp-back-link dcp-exit" id="dcp-exit-designer">Exit Designer</button>' +
        '</div>' +
        '<h1 class="dcp-title">touchActionInput Editor</h1>' +
        '<div class="dcp-helper" style="margin:8px 0 16px">' +
          (_labelValueCandidates(dwg).length === 0
            ? 'No indexed labels found in this drawing.'
            : 'All indexed labels already have a touchAction for this touchZone.') +
        '</div>' +
        '<div class="dcp-action-row" style="justify-content:flex-end; margin-top:16px">' +
          '<button type="button" class="dcp-btn dcp-btn-ghost" id="dcp-tai-cancel-2">Cancel</button>' +
          '<button type="button" class="dcp-btn dcp-btn-primary" id="dcp-tai-save" disabled>Save touchActionInput</button>' +
        '</div>';
      root.querySelector('#dcp-tai-cancel').addEventListener('click', discardAndReturn);
      root.querySelector('#dcp-tai-cancel-2').addEventListener('click', discardAndReturn);
      root.querySelector('#dcp-exit-designer').addEventListener('click', () => {
        DwgLibrary.remove(ADD_ITEM_DRAFT_NAME);
        _exitDesigner();
      });
      return;
    }

    root.innerHTML =
      '<div class="dcp-back-row">' +
        '<button type="button" class="dcp-back-link" id="dcp-tai-cancel">&larr; Cancel, back to touchZone</button>' +
        '<button type="button" class="dcp-back-link dcp-exit" id="dcp-exit-designer">Exit Designer</button>' +
      '</div>' +
      '<h1 class="dcp-title">touchActionInput Editor</h1>' +
      '<div class="dcp-field">' +
        '<label>Prompt text <span style="text-transform:none; font-weight:400">(required)</span></label>' +
        '<input type="text" id="dcp-tai-prompt" value="' + _esc(promptValue) + '">' +
        '<div class="dcp-helper">Text shown in the on-device prompt dialog</div>' +
      '</div>' +
      '<div class="dcp-field">' +
        '<label>Indexed label or value</label>' +
        '<select id="dcp-tai-textidx">' +
          labelValueCandidates.map((c) =>
            '<option value="' + _esc(c.idxName) + '"' + (c.idxName === selectedIdxName ? ' selected' : '') + '>' +
              _esc(c.idxName) + ' — ' + _esc(_itemTypeLabel(c)) + '</option>'
          ).join('') +
        '</select>' +
        '<div class="dcp-helper">Which label/value supplies the initial text</div>' +
      '</div>' +
      '<div class="dcp-field-row dcp-num-row">' +
        '<div class="dcp-field" style="flex:1">' +
          '<label>Font size</label>' +
          '<input type="number" id="dcp-tai-fontsize" value="' + fontSizeValue + '" min="-24" max="24" step="1">' +
        '</div>' +
        '<div class="dcp-field" style="flex:2">' +
          '<label>Text colour</label>' +
          '<div class="dcp-color-field" id="dcp-tai-textcolor-field">' +
            '<div class="dcp-color-header">' +
              '<button type="button" class="dcp-color-toggle-btn" id="dcp-tai-textcolor-bw-btn">BLACK_WHITE</button>' +
              '<button type="button" class="dcp-color-toggle-btn" id="dcp-tai-textcolor-btn">Color</button>' +
              '<span class="dcp-swatch-num">' +
                '<span class="dcp-swatch-lg" id="dcp-tai-textcolor-swatch"></span>' +
                '<span class="dcp-num" id="dcp-tai-textcolor-num"></span>' +
              '</span>' +
            '</div>' +
            '<div class="dcp-color-popup" id="dcp-tai-textcolor-popup" style="display:none"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="dcp-field">' +
        '<label>Background colour</label>' +
        '<div class="dcp-color-field" id="dcp-tai-bgcolor-field">' +
          '<div class="dcp-color-header">' +
            '<button type="button" class="dcp-color-toggle-btn" id="dcp-tai-bgcolor-bw-btn">BLACK_WHITE</button>' +
            '<button type="button" class="dcp-color-toggle-btn" id="dcp-tai-bgcolor-btn">Color</button>' +
            '<span class="dcp-swatch-num">' +
              '<span class="dcp-swatch-lg" id="dcp-tai-bgcolor-swatch"></span>' +
              '<span class="dcp-num" id="dcp-tai-bgcolor-num"></span>' +
            '</span>' +
          '</div>' +
          '<div class="dcp-color-popup" id="dcp-tai-bgcolor-popup" style="display:none"></div>' +
        '</div>' +
      '</div>' +
      '<div class="dcp-action-row" style="justify-content:flex-end; margin-top:16px">' +
        '<button type="button" class="dcp-btn dcp-btn-ghost" id="dcp-tai-cancel-2">Cancel</button>' +
        '<button type="button" class="dcp-btn dcp-btn-primary" id="dcp-tai-save">Save touchActionInput</button>' +
      '</div>';

    root.querySelector('#dcp-tai-cancel').addEventListener('click', discardAndReturn);
    root.querySelector('#dcp-tai-cancel-2').addEventListener('click', discardAndReturn);
    root.querySelector('#dcp-exit-designer').addEventListener('click', () => {
      DwgLibrary.remove(ADD_ITEM_DRAFT_NAME);
      _exitDesigner();
    });

    /// Live-preview this touchActionInput's CURRENT (not-yet-saved) form
    /// state — see _updateTouchZoneSubEditorPreview's own doc. An empty
    /// prompt is fine to preview (dwgValidate.js's own touchActionInput
    /// schema doesn't require it — only Save enforces "required").
    function updatePreview() {
      const liveInput = {
        type: 'touchActionInput',
        cmdName: resumeState.cmdName,
        prompt: root.querySelector('#dcp-tai-prompt').value,
        fontSize: parseInt(root.querySelector('#dcp-tai-fontsize').value, 10) || 0,
        color: textColorState.mode === 'blackwhite' ? -1 : textColorState.color,
        backgroundColor: bgColorState.mode === 'blackwhite' ? -1 : bgColorState.color,
      };
      const textIdxName = root.querySelector('#dcp-tai-textidx').value;
      if (textIdxName) liveInput.idxName = textIdxName;
      _updateTouchZoneSubEditorPreview(dwgName, dwg, itemIndex, resumeState, resumeState.touchActions, liveInput);
    }

    let previewDebounce = null;
    function scheduleUpdatePreview() {
      if (previewDebounce) clearTimeout(previewDebounce);
      previewDebounce = setTimeout(updatePreview, 500);
    }
    [root.querySelector('#dcp-tai-prompt'), root.querySelector('#dcp-tai-fontsize')].forEach((input) => {
      input.addEventListener('input', scheduleUpdatePreview);
      input.addEventListener('blur', () => {
        if (previewDebounce) { clearTimeout(previewDebounce); previewDebounce = null; }
        updatePreview();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (previewDebounce) { clearTimeout(previewDebounce); previewDebounce = null; }
          updatePreview();
        }
      });
    });
    root.querySelector('#dcp-tai-textidx').addEventListener('change', updatePreview);

    /// Wire one of the two independent colour pickers (Text/Background) —
    /// idPrefix distinguishes their DOM ids, colorState is the underlying
    /// state object (textColorState/bgColorState) it reads/writes.
    /// @param {string} idPrefix
    /// @param {object} colorState
    function wireColorPicker(idPrefix, colorState) {
      function buildColorPopup() {
        const popup = root.querySelector('#' + idPrefix + '-popup');
        const sections = [
          { title: 'Standard Colors (0-15)', from: 0, to: 15 },
          { title: '216 Colors (16-231)', from: 16, to: 231 },
          { title: 'Grayscale (232-255)', from: 232, to: 255 },
        ];
        let html = '';
        sections.forEach((section) => {
          html += '<div class="dcp-color-section-title">' + section.title + '</div><div class="dcp-color-row">';
          for (let i = section.from; i <= section.to; i++) {
            html += '<span class="dcp-color-cell" data-color="' + i + '" style="background:' + _swatchHex(i) + '"></span>';
          }
          html += '</div>';
        });
        popup.innerHTML = html;
        popup.querySelectorAll('.dcp-color-cell').forEach((cell) => {
          cell.addEventListener('click', () => {
            colorState.color = parseInt(cell.getAttribute('data-color'), 10);
            colorState.mode = 'color';
            updateColorHeader();
            updatePreview();
            popup.style.display = 'none';
          });
        });
      }
      function updateColorHeader() {
        const isBW = colorState.mode === 'blackwhite';
        root.querySelector('#' + idPrefix + '-bw-btn').classList.toggle('dcp-mode-active', isBW);
        root.querySelector('#' + idPrefix + '-btn').classList.toggle('dcp-mode-active', !isBW);
        root.querySelector('#' + idPrefix + '-swatch').style.background = isBW ? _swatchHex(-1, dwg.color) : _swatchHex(colorState.color);
        root.querySelector('#' + idPrefix + '-num').textContent = isBW ? 'BLACK_WHITE (auto)' : ('Color ' + colorState.color);
        root.querySelectorAll('#' + idPrefix + '-popup .dcp-color-cell').forEach((cell) => {
          cell.classList.toggle('dcp-selected', !isBW && parseInt(cell.getAttribute('data-color'), 10) === colorState.color);
        });
      }
      buildColorPopup();
      updateColorHeader();
      root.querySelector('#' + idPrefix + '-bw-btn').addEventListener('click', () => {
        colorState.mode = 'blackwhite';
        updateColorHeader();
        updatePreview();
        root.querySelector('#' + idPrefix + '-popup').style.display = 'none';
      });
      function openColorPicker() {
        colorState.mode = 'color';
        updateColorHeader();
        updatePreview();
        root.querySelector('#' + idPrefix + '-popup').style.display = 'block';
      }
      root.querySelector('#' + idPrefix + '-btn').addEventListener('click', openColorPicker);
      root.querySelector('#' + idPrefix + '-swatch').addEventListener('click', openColorPicker);
    }
    wireColorPicker('dcp-tai-textcolor', textColorState);
    wireColorPicker('dcp-tai-bgcolor', bgColorState);
    updatePreview();

    root.querySelector('#dcp-tai-save').addEventListener('click', () => {
      const promptText = root.querySelector('#dcp-tai-prompt').value.trim();
      if (!promptText) { alert('Prompt text is required.'); return; }
      const textIdxName = root.querySelector('#dcp-tai-textidx').value;
      const newInput = {
        type: 'touchActionInput',
        cmdName: resumeState.cmdName,
        prompt: promptText,
        fontSize: parseInt(root.querySelector('#dcp-tai-fontsize').value, 10) || 0,
        color: textColorState.mode === 'blackwhite' ? -1 : textColorState.color,
        backgroundColor: bgColorState.mode === 'blackwhite' ? -1 : bgColorState.color,
      };
      if (textIdxName) newInput.idxName = textIdxName;
      returnToTouchZoneScreen(Object.assign({}, resumeState, { touchActionInput: newInput }));
    });
  }

  /// Render the "Add/Edit touchAction Item" editor — alt-a-mockup.html
  /// Screens 4+5 (Select Idx + Add touchAction Item) combined into one
  /// screen: this project's own draft-state architecture doesn't need a
  /// separate page for picking the target, so the target-idx dropdown and
  /// the replacement item's own fields are shown together — changing
  /// either re-renders this same screen (own typeOverride/targetOverride
  /// params, same pattern as Add/Edit Item's own type dropdown).
  ///
  /// A touchAction targets an existing indexed item by idxName
  /// (action[0].idxName) — action[0] is a full item in its own right,
  /// whose type/fields describe what gets DRAWN INSTEAD while the zone is
  /// being touched (test.json's own real saved shape). Scoped to plain
  /// numeric X/Y (no COL/ROW touch-relative positioning — a deliberately
  /// separate follow-up) and Line/Rectangle/Circle/Arc/Label/Value/
  /// Hide-or-Unhide item types (no Touch Zone/Insert Drawing — a
  /// touchAction is drawn feedback, not a new interactive region or
  /// nested dwg, matching add-touchAction-item.js's own type list).
  /// @param {HTMLElement} root
  /// @param {string} dwgName
  /// @param {number|null} itemIndex — see
  ///        _renderTouchActionInputEditorScreen's own doc
  /// @param {object} resumeState — the touchZone draft's full field
  ///        snapshot
  /// @param {number|null} editActionIndex — index into
  ///        resumeState.touchActions being edited, or null to add a new one
  /// @param {string} [typeOverride] — set only when the user changed the
  ///        Item Type dropdown (own re-render)
  /// @param {string} [targetOverride] — set only when the user changed
  ///        the Target indexed item dropdown (own re-render)
  function _renderTouchActionEditorScreen(root, dwgName, itemIndex, resumeState, editActionIndex, typeOverride, targetOverride) {
    const dwg = DwgLibrary.get(dwgName);
    if (!dwg) { _renderMainView(root); return; }

    function returnToTouchZoneScreen(newResumeState) {
      if (itemIndex === null || itemIndex === undefined) {
        _renderAddItemScreen(root, dwgName, 'touchZone', newResumeState);
      } else {
        _renderEditItemScreen(root, dwgName, itemIndex, 'touchZone', newResumeState);
      }
    }

    const hasExisting = editActionIndex !== null && editActionIndex !== undefined;
    const existingAction = hasExisting ? resumeState.touchActions[editActionIndex] : null;
    const existingTarget = existingAction ? existingAction.action[0] : null;

    // Every OTHER touchAction in this SAME draft already claims its own
    // target idxName — excluded from the candidate list (matches
    // select-touchaction-index.js's own exclusion), except the one
    // currently being edited (it may keep its own current target). The
    // touchActionInput's own target (if any) is claimed the same way — an
    // item is either a touchAction target or the touchActionInput's own
    // target, never both — except when the touchAction CURRENTLY being
    // edited already targets that same idxName (an already-conflicting
    // saved state shouldn't make its own current selection disappear).
    const claimedIdxNames = new Set(
      resumeState.touchActions
        .filter((_, i) => i !== editActionIndex)
        .map((a) => a.action[0] && a.action[0].idxName)
        .filter(Boolean)
    );
    if (resumeState.touchActionInput && resumeState.touchActionInput.idxName &&
        !(existingTarget && existingTarget.idxName === resumeState.touchActionInput.idxName)) {
      claimedIdxNames.add(resumeState.touchActionInput.idxName);
    }
    const candidates = (dwg.items || []).filter((item) =>
      item.idxName && REFERENCE_ONLY_TYPES.indexOf(item.type) === -1 && !claimedIdxNames.has(item.idxName)
    );

    function discardAndReturn() { returnToTouchZoneScreen(resumeState); }
    function wireBackRow(cancelId) {
      root.querySelector('#' + cancelId).addEventListener('click', discardAndReturn);
      root.querySelector('#dcp-exit-designer').addEventListener('click', () => {
        DwgLibrary.remove(ADD_ITEM_DRAFT_NAME);
        _exitDesigner();
      });
    }

    if (candidates.length === 0) {
      // Matches add-touchAction-item.js's own "No indexed items found"/
      // "All indexed items already have touchAction items" messages. Add
      // Item/Save Changes still renders — disabled — rather than being
      // omitted entirely, matching the Hide/Unhide screen's own
      // established convention (submitBtn.disabled = !hideState.target)
      // for "nothing selectable yet".
      const anyIndexedAtAll = (dwg.items || []).some((item) => item.idxName && REFERENCE_ONLY_TYPES.indexOf(item.type) === -1);
      root.innerHTML =
        '<div class="dcp-back-row">' +
          '<button type="button" class="dcp-back-link" id="dcp-ta-cancel">&larr; Cancel, back to touchZone</button>' +
          '<button type="button" class="dcp-back-link dcp-exit" id="dcp-exit-designer">Exit Designer</button>' +
        '</div>' +
        '<h1 class="dcp-title">' + (hasExisting ? 'Edit' : 'Add') + ' touchAction Item</h1>' +
        '<div class="dcp-helper" style="margin:8px 0 16px">' +
          (anyIndexedAtAll
            ? 'All indexed items already have touchAction items for this touchZone.'
            : 'No indexed items found in this drawing.') +
        '</div>' +
        '<div class="dcp-action-row" style="justify-content:flex-end; margin-top:16px">' +
          '<button type="button" class="dcp-btn dcp-btn-ghost" id="dcp-ta-cancel-2">Cancel</button>' +
          '<button type="button" class="dcp-btn dcp-btn-primary" id="dcp-ta-save" disabled>' + (hasExisting ? 'Save Changes' : 'Add Item') + '</button>' +
        '</div>';
      wireBackRow('dcp-ta-cancel');
      root.querySelector('#dcp-ta-cancel-2').addEventListener('click', discardAndReturn);
      return;
    }

    const selectedIdxName = targetOverride || (existingTarget && existingTarget.idxName) || candidates[0].idxName;
    const targetItem = candidates.find((c) => c.idxName === selectedIdxName) || candidates[0];

    /// Build a paired "Number / COL (Touch Column) / ROW (Touch Row)"
    /// mode select + number input — see dwgWireEncoder.js's own
    /// _offsetField doc for the wire-level mechanism this drives (COL/ROW
    /// mean "wherever the touch landed", not a fixed value). The number
    /// input is disabled whenever a non-Number mode is picked — nothing
    /// to type, the real device supplies the touch coordinate instead.
    /// @param {string} fieldId — e.g. 'dcp-ta-xoffset'
    /// @param {string} mode — 'number' | 'COL' | 'ROW'
    /// @param {number} numericValue — shown/edited only in 'number' mode
    /// @returns {string}
    /// @param {boolean} [integerOnly] — Integer Value only.  This helper is
    ///        shared by dcp-ta-xoffset/-yoffset (float — .offset(float,float))
    ///        and dcp-ta-intvalue (int32_t on the wire), so the integer field
    ///        opts out of step="any" here and out of the fractional read-back
    ///        in readOffsetModeField.  The two must stay in lockstep.
    function offsetModeFieldHtml(fieldId, mode, numericValue, integerOnly) {
      const isSpecial = mode === 'COL' || mode === 'ROW';
      return '<div style="display:flex; gap:6px; align-items:center">' +
        '<select id="' + fieldId + '-mode" style="width:50%">' +
          '<option value="number"' + (!isSpecial ? ' selected' : '') + '>Number</option>' +
          '<option value="COL"' + (mode === 'COL' ? ' selected' : '') + '>COL (Touch Column)</option>' +
          '<option value="ROW"' + (mode === 'ROW' ? ' selected' : '') + '>ROW (Touch Row)</option>' +
        '</select>' +
        '<input type="number" id="' + fieldId + '" value="' + numericValue + '"' +
          (integerOnly ? '' : ' step="any"') + (isSpecial ? ' disabled' : '') + '>' +
      '</div>';
    }
    /// Read one offsetModeFieldHtml field back — the literal string
    /// "COL"/"ROW" in that mode, else the input's own parsed number.
    /// @param {string} fieldId
    /// @returns {number|string}
    /// @param {boolean} [integerOnly] — see offsetModeFieldHtml's own note;
    ///        Integer Value keeps parseInt, the offsets read as floats.
    function readOffsetModeField(fieldId, integerOnly) {
      const mode = root.querySelector('#' + fieldId + '-mode').value;
      if (mode === 'COL' || mode === 'ROW') return mode;
      const raw = root.querySelector('#' + fieldId).value;
      return integerOnly ? (parseInt(raw, 10) || 0) : _readNum(raw, 0);
    }
    /// Toggle the number input's disabled state to match its own mode
    /// select, and live-preview the change — called once per field, after
    /// root.innerHTML is assigned.
    /// @param {string} fieldId
    function wireOffsetModeField(fieldId) {
      const modeSelect = root.querySelector('#' + fieldId + '-mode');
      const input = root.querySelector('#' + fieldId);
      modeSelect.addEventListener('change', () => {
        input.disabled = modeSelect.value !== 'number';
        updatePreview();
      });
    }

    // Item Type dropdown: Line/Rectangle/Circle/Arc/Label/Value, always
    // present, plus EXACTLY ONE of Hide Item/Unhide invisible Item —
    // matches add-touchAction-item.js's own filterHideUnhideOptions(): the
    // target's CURRENT visibility decides which, an already-hidden target
    // offers Unhide, anything else offers Hide.
    const targetIsHidden = _isCurrentlyHidden(dwg.items, 'idxName', targetItem.idxName);
    const hideUnhideOption = targetIsHidden
      ? { value: 'unhide', label: 'Unhide invisible Item' }
      : { value: 'hide', label: 'Hide Item' };
    const typeOptions = [
      { value: 'line', label: 'Line' }, { value: 'rectangle', label: 'Rectangle' },
      { value: 'circle', label: 'Circle' }, { value: 'arc', label: 'Arc' },
      { value: 'label', label: 'Label' }, { value: 'value', label: 'Value' },
      hideUnhideOption,
    ];
    const defaultType = existingTarget
      ? ((existingTarget.type === 'hide' || existingTarget.type === 'unhide') ? hideUnhideOption.value : existingTarget.type)
      : targetItem.type;
    const selectedType = typeOverride || defaultType;
    const isRectangle = selectedType === 'rectangle', isCircle = selectedType === 'circle',
      isArc = selectedType === 'arc', isLabel = selectedType === 'label', isValue = selectedType === 'value',
      isHideUnhide = selectedType === 'hide' || selectedType === 'unhide';

    // Prefill from the EXISTING touchAction's own action[0] when editing
    // it as itself (same original type); otherwise copy the TARGET item's
    // own current values ("Replace on Touch" pre-loads with the target's
    // actual type/values — add-touchAction-item.js's own
    // loadIndexedItemForReplacement()).
    const prefillSource = (existingTarget && existingTarget.type === selectedType) ? existingTarget
      : ((!existingTarget && targetItem.type === selectedType) ? targetItem : null);

    // X/Y position (and Value's own Integer Value) can each independently
    // be a real number, or the literal string "COL"/"ROW" — "wherever the
    // touch landed" instead of a fixed value (dwgWireEncoder.js's own
    // _offsetField doc has the full wire-level explanation; matches
    // add-touchAction-item.js's own getOffsetValue()). Tracked as a
    // separate *Mode ('number'/'COL'/'ROW') alongside state's own ALWAYS-
    // numeric fallback value, so the number input never has to hold a
    // non-numeric value itself — only the mode select does.
    const xOffsetMode = (prefillSource && (prefillSource.xOffset === 'COL' || prefillSource.xOffset === 'ROW')) ? prefillSource.xOffset : 'number';
    const yOffsetMode = (prefillSource && (prefillSource.yOffset === 'COL' || prefillSource.yOffset === 'ROW')) ? prefillSource.yOffset : 'number';
    const intValueMode = (prefillSource && (prefillSource.intValue === 'COL' || prefillSource.intValue === 'ROW')) ? prefillSource.intValue : 'number';

    const state = {
      xOffset: (prefillSource && typeof prefillSource.xOffset === 'number') ? prefillSource.xOffset : (targetItem.xOffset || 0),
      yOffset: (prefillSource && typeof prefillSource.yOffset === 'number') ? prefillSource.yOffset : (targetItem.yOffset || 0),
      // _readNum, not `|| default`, on BOTH arms: `||` replaces a stored 0
      // with the default, so a saved 0-delta line came back as 1 every time
      // this editor was reopened.  The seeded defaults are unfloored for the
      // same reason as _renderAddItemScreen's own state.
      xSize: prefillSource ? _readNum(prefillSource.xSize, 1) : _readNum(targetItem.xSize, dwg.x / 4),
      ySize: prefillSource ? _readNum(prefillSource.ySize, 1) : _readNum(targetItem.ySize, dwg.y / 4),
      radius: prefillSource ? _readNum(prefillSource.radius, 1) : _readNum(targetItem.radius, Math.min(dwg.x, dwg.y) * 0.25),
      start: prefillSource ? (prefillSource.start || 0) : 0,
      angle: prefillSource ? (prefillSource.angle || 0) : 90,
      text: (prefillSource && typeof prefillSource.text === 'string') ? prefillSource.text : (isLabel ? 'TEXT' : (isValue ? 'Value: ' : '')),
      fontSize: prefillSource ? (prefillSource.fontSize || 0) : 0,
      align: prefillSource ? (prefillSource.align || 'left') : 'left',
      intValue: (prefillSource && typeof prefillSource.intValue === 'number') ? prefillSource.intValue : 50,
      min: prefillSource ? (prefillSource.min || 0) : 0,
      // max/displayMax: _readNum only to stop `||` rewriting a stored 0 to 1.
      // max itself stays an INTEGER field — its input keeps the default
      // step=1 and its own parseInt read-back (minValue/maxValue are int32_t).
      max: prefillSource ? _readNum(prefillSource.max, 1) : 100,
      displayMin: prefillSource ? (prefillSource.displayMin || 0) : 0,
      displayMax: prefillSource ? _readNum(prefillSource.displayMax, 1) : 1,
      valueDecimals: prefillSource ? (prefillSource.decimals || 0) : 2,
      valueUnits: (prefillSource && typeof prefillSource.units === 'string') ? prefillSource.units : '',
    };
    const sourceColor = prefillSource ? prefillSource.color : targetItem.color;
    const colorState = { mode: (sourceColor !== -1 && sourceColor !== undefined) ? 'color' : 'blackwhite', color: (sourceColor !== -1 && sourceColor !== undefined) ? sourceColor : 15 };
    const filledChecked = !!(prefillSource && (prefillSource.filled === true || prefillSource.filled === 'true'));
    const centeredChecked = !!(prefillSource && (prefillSource.centered === true || prefillSource.centered === 'true'));
    const roundedChecked = !!(prefillSource && (prefillSource.rounded === true || prefillSource.rounded === 'true'));
    const boldChecked = !!(prefillSource && (prefillSource.bold === true || prefillSource.bold === 'true'));
    const italicChecked = !!(prefillSource && (prefillSource.italic === true || prefillSource.italic === 'true'));
    const underlineChecked = !!(prefillSource && (prefillSource.underline === true || prefillSource.underline === 'true'));

    const targetOptionsHtml = candidates.map((c) =>
      '<option value="' + _esc(c.idxName) + '"' + (c.idxName === targetItem.idxName ? ' selected' : '') + '>' +
        _esc(c.idxName) + ' — ' + _esc(_itemTypeLabel(c)) + '</option>'
    ).join('');
    const typeOptionsHtml = typeOptions.map((o) =>
      '<option value="' + o.value + '"' + (o.value === selectedType ? ' selected' : '') + '>' + _esc(o.label) + '</option>'
    ).join('');
    const alignOptionsHtml = DWG_ALIGN_VALUES.map((v) =>
      '<option value="' + v + '"' + (v === state.align ? ' selected' : '') + '>' + v[0].toUpperCase() + v.slice(1) + '</option>'
    ).join('');

    let fieldsHtml;
    if (isHideUnhide) {
      fieldsHtml = '<div class="dcp-helper" style="margin:4px 0 16px">' +
        (selectedType === 'hide' ? 'Hides' : 'Unhides') + ' "' + _esc(targetItem.idxName) + '" while this touchZone is touched.</div>';
    } else if (isCircle || isArc) {
      fieldsHtml =
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>X Center</label>' + offsetModeFieldHtml('dcp-ta-xoffset', xOffsetMode, state.xOffset) + '</div>' +
          '<div class="dcp-field"><label>Y Center</label>' + offsetModeFieldHtml('dcp-ta-yoffset', yOffsetMode, state.yOffset) + '</div>' +
        '</div>' +
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>Radius</label><input type="number" id="dcp-ta-radius" value="' + state.radius + '" min="0.1" step="any"></div>' +
          '<div class="dcp-field" style="flex:1; justify-content:flex-end"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px">' +
            '<input type="checkbox" id="dcp-ta-filled"' + (filledChecked ? ' checked' : '') + ' style="width:auto"> ' + (isArc ? 'Filled (creates pie slice)' : 'Filled') + '</label></div>' +
        '</div>' +
        (isArc ?
          '<div class="dcp-field-row dcp-num-row">' +
            '<div class="dcp-field"><label>Start Angle (&deg;)</label><input type="number" id="dcp-ta-start" value="' + state.start + '" step="any"></div>' +
            '<div class="dcp-field"><label>Sweep Angle (&deg;)</label><input type="number" id="dcp-ta-angle" value="' + state.angle + '" step="any"></div>' +
          '</div>'
        : '');
    } else if (isLabel || isValue) {
      fieldsHtml =
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>X Position</label>' + offsetModeFieldHtml('dcp-ta-xoffset', xOffsetMode, state.xOffset) + '</div>' +
          '<div class="dcp-field"><label>Y Position</label>' + offsetModeFieldHtml('dcp-ta-yoffset', yOffsetMode, state.yOffset) + '</div>' +
        '</div>' +
        '<div class="dcp-field"><label>' + (isValue ? 'Prefix Text' : 'Text') + '</label>' +
          '<textarea id="dcp-ta-text" rows="1" style="resize:vertical">' + _esc(state.text) + '</textarea></div>' +
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>Font Size</label><input type="number" id="dcp-ta-fontsize" value="' + state.fontSize + '" min="-24" max="24"></div>' +
          '<div class="dcp-field"><label>Alignment</label><select id="dcp-ta-align" style="width:50%">' + alignOptionsHtml + '</select></div>' +
        '</div>' +
        '<div class="dcp-field-row">' +
          '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px"><input type="checkbox" id="dcp-ta-bold"' + (boldChecked ? ' checked' : '') + ' style="width:auto"> Bold</label></div>' +
          '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px"><input type="checkbox" id="dcp-ta-italic"' + (italicChecked ? ' checked' : '') + ' style="width:auto"> Italic</label></div>' +
          '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px"><input type="checkbox" id="dcp-ta-underline"' + (underlineChecked ? ' checked' : '') + ' style="width:auto"> Underline</label></div>' +
        '</div>' +
        (isValue ?
          '<div class="dcp-helper" style="font-weight:600; margin:12px 0 6px">Value Scaling Parameters</div>' +
          '<div class="dcp-field-row dcp-num-row">' +
            '<div class="dcp-field"><label>Integer Value</label>' + offsetModeFieldHtml('dcp-ta-intvalue', intValueMode, state.intValue, true) + '</div>' +
            '<div class="dcp-field"><label>Decimals</label><input type="number" id="dcp-ta-valuedecimals" value="' + state.valueDecimals + '" min="-6" max="6"></div>' +
          '</div>' +
          '<div class="dcp-field-row dcp-num-row">' +
            '<div class="dcp-field"><label>Min Value</label><input type="number" id="dcp-ta-min" value="' + state.min + '"></div>' +
            '<div class="dcp-field"><label>Max Value</label><input type="number" id="dcp-ta-max" value="' + state.max + '" style="width:87.5px"></div>' +
            '<div class="dcp-field"><label>Display Min</label><input type="number" id="dcp-ta-displaymin" value="' + state.displayMin + '" step="any"></div>' +
            '<div class="dcp-field"><label>Display Max</label><input type="number" id="dcp-ta-displaymax" value="' + state.displayMax + '" step="any" style="width:87.5px"></div>' +
          '</div>' +
          '<div class="dcp-field" style="width:25%"><label>Units</label><input type="text" id="dcp-ta-valueunits" value="' + _esc(state.valueUnits) + '"></div>'
        : '');
    } else {
      // Line / Rectangle
      fieldsHtml =
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>' + (isRectangle ? 'X Position' : 'X Offset') + '</label>' + offsetModeFieldHtml('dcp-ta-xoffset', xOffsetMode, state.xOffset) + '</div>' +
          '<div class="dcp-field"><label>' + (isRectangle ? 'Y Position' : 'Y Offset') + '</label>' + offsetModeFieldHtml('dcp-ta-yoffset', yOffsetMode, state.yOffset) + '</div>' +
        '</div>' +
        '<div class="dcp-field-row dcp-num-row">' +
          '<div class="dcp-field"><label>' + (isRectangle ? 'Width' : 'X Delta') + '</label><input type="number" id="dcp-ta-xsize" value="' + state.xSize + '" step="any"></div>' +
          '<div class="dcp-field"><label>' + (isRectangle ? 'Height' : 'Y Delta') + '</label><input type="number" id="dcp-ta-ysize" value="' + state.ySize + '" step="any"></div>' +
        '</div>' +
        (isRectangle ?
          '<div class="dcp-field-row">' +
            '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px"><input type="checkbox" id="dcp-ta-filled"' + (filledChecked ? ' checked' : '') + ' style="width:auto"> Filled</label></div>' +
            '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px"><input type="checkbox" id="dcp-ta-centered"' + (centeredChecked ? ' checked' : '') + ' style="width:auto"> Centered</label></div>' +
            '<div class="dcp-field" style="flex:1"><label style="text-transform:none; font-weight:400; display:flex; align-items:center; gap:6px"><input type="checkbox" id="dcp-ta-rounded"' + (roundedChecked ? ' checked' : '') + ' style="width:auto"> Rounded</label></div>' +
          '</div>'
        : '');
    }

    root.innerHTML =
      '<div class="dcp-back-row">' +
        '<button type="button" class="dcp-back-link" id="dcp-ta-cancel">&larr; Cancel, back to touchZone</button>' +
        '<button type="button" class="dcp-back-link dcp-exit" id="dcp-exit-designer">Exit Designer</button>' +
      '</div>' +
      '<h1 class="dcp-title">' + (hasExisting ? 'Edit' : 'Add') + ' touchAction Item</h1>' +
      // Select narrowed to 50% (matching the Item type select below it)
      // to leave room for the Show button on the same line — same
      // press-and-hold eye control as the Edit Dwg item list's own rows.
      '<div class="dcp-field"><label>Target indexed item</label>' +
        '<div style="display:flex; gap:8px; align-items:center">' +
          '<select id="dcp-ta-target" style="width:50%">' + targetOptionsHtml + '</select>' +
          '<button type="button" class="dcp-mini-btn dcp-mini-btn-show" id="dcp-ta-target-show" ' +
            'title="Hold to toggle the selected item&#39;s visibility and identify it in the preview">&#128065;</button>' +
        '</div>' +
        '<div class="dcp-helper">Which existing item gets replaced by this touchAction while the zone is touched</div>' +
      '</div>' +
      '<div class="dcp-field"><label>Item type</label>' +
        '<select id="dcp-ta-type" style="width:50%">' + typeOptionsHtml + '</select>' +
      '</div>' +
      fieldsHtml +
      (isHideUnhide ? '' :
        '<div class="dcp-field">' +
          '<label>Color</label>' +
          '<div class="dcp-color-field" id="dcp-ta-color-field">' +
            '<div class="dcp-color-header">' +
              '<button type="button" class="dcp-color-toggle-btn" id="dcp-ta-bw-btn">BLACK_WHITE</button>' +
              '<button type="button" class="dcp-color-toggle-btn" id="dcp-ta-color-btn">Color</button>' +
              '<span class="dcp-swatch-num"><span class="dcp-swatch-lg" id="dcp-ta-color-swatch"></span><span class="dcp-num" id="dcp-ta-color-num"></span></span>' +
            '</div>' +
            '<div class="dcp-color-popup" id="dcp-ta-color-popup" style="display:none"></div>' +
          '</div>' +
        '</div>') +
      '<div class="dcp-action-row" style="justify-content:flex-end; margin-top:16px">' +
        '<button type="button" class="dcp-btn dcp-btn-ghost" id="dcp-ta-cancel-2">Cancel</button>' +
        '<button type="button" class="dcp-btn dcp-btn-primary" id="dcp-ta-save">' + (hasExisting ? 'Save Changes' : 'Add Item') + '</button>' +
      '</div>';

    wireBackRow('dcp-ta-cancel');
    root.querySelector('#dcp-ta-cancel-2').addEventListener('click', discardAndReturn);

    root.querySelector('#dcp-ta-target').addEventListener('change', (e) => {
      _renderTouchActionEditorScreen(root, dwgName, itemIndex, resumeState, editActionIndex, null, e.target.value);
    });
    root.querySelector('#dcp-ta-type').addEventListener('change', (e) => {
      _renderTouchActionEditorScreen(root, dwgName, itemIndex, resumeState, editActionIndex, e.target.value, targetItem.idxName);
    });

    // Press-and-hold Show — briefly flips the SELECTED target item's
    // visibility in the preview so it's obvious which item this touchAction
    // will replace, then restores on release. Same press/release/mouseleave
    // shape as the Edit Dwg item list's own eye buttons.
    //
    // Implemented by appending a one-off hide/unhide directive to the draft
    // this screen already previews, rather than the forceNextUpdate +
    // resolveIdx route the item list uses: that draft is rebuilt from
    // scratch on every keystroke here anyway, so there's no idx to resolve
    // and release is just the normal live preview again.
    //
    // Toggling AWAY FROM the current state matters — the dwg may already
    // hide this item (targetIsHidden, computed above for the same reason the
    // Item type dropdown offers Hide vs Unhide), and hiding an already-
    // hidden item would reveal nothing. Changing the dropdown re-renders the
    // whole screen, so targetItem is always the current selection.
    const targetShowBtn = root.querySelector('#dcp-ta-target-show');
    let targetShowPressed = false;
    function pressTargetShow() {
      if (targetShowPressed) return;
      targetShowPressed = true;
      renderLivePreview([{ type: targetIsHidden ? 'unhide' : 'hide', idxName: targetItem.idxName }]);
    }
    function releaseTargetShow() {
      if (!targetShowPressed) return;
      targetShowPressed = false;
      renderLivePreview(null);
    }
    targetShowBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); pressTargetShow(); });
    targetShowBtn.addEventListener('mouseup', (e) => { e.stopPropagation(); releaseTargetShow(); });
    // Safety net: dragging off the button while still pressed fires no
    // mouseup on it, so don't leave the preview stuck toggled.
    targetShowBtn.addEventListener('mouseleave', releaseTargetShow);

    function buildTargetItem() {
      const color = colorState.mode === 'blackwhite' ? -1 : colorState.color;
      let target;
      if (isRectangle) {
        target = {
          type: 'rectangle',
          xOffset: readOffsetModeField('dcp-ta-xoffset'),
          yOffset: readOffsetModeField('dcp-ta-yoffset'),
          xSize: _readNum(root.querySelector('#dcp-ta-xsize').value, 1),
          ySize: _readNum(root.querySelector('#dcp-ta-ysize').value, 1),
          filled: root.querySelector('#dcp-ta-filled').checked,
          centered: root.querySelector('#dcp-ta-centered').checked,
          rounded: root.querySelector('#dcp-ta-rounded').checked,
          color: color,
        };
      } else if (isCircle) {
        target = {
          type: 'circle',
          xOffset: readOffsetModeField('dcp-ta-xoffset'),
          yOffset: readOffsetModeField('dcp-ta-yoffset'),
          radius: parseFloat(root.querySelector('#dcp-ta-radius').value) || 1,
          filled: root.querySelector('#dcp-ta-filled').checked,
          color: color,
        };
      } else if (isArc) {
        target = {
          type: 'arc',
          xOffset: readOffsetModeField('dcp-ta-xoffset'),
          yOffset: readOffsetModeField('dcp-ta-yoffset'),
          radius: parseFloat(root.querySelector('#dcp-ta-radius').value) || 1,
          start: parseFloat(root.querySelector('#dcp-ta-start').value) || 0,
          angle: parseFloat(root.querySelector('#dcp-ta-angle').value) || 0,
          filled: root.querySelector('#dcp-ta-filled').checked,
          color: color,
        };
      } else if (isLabel) {
        target = {
          type: 'label',
          xOffset: readOffsetModeField('dcp-ta-xoffset'),
          yOffset: readOffsetModeField('dcp-ta-yoffset'),
          text: root.querySelector('#dcp-ta-text').value,
          fontSize: parseInt(root.querySelector('#dcp-ta-fontsize').value, 10) || 0,
          align: root.querySelector('#dcp-ta-align').value,
          bold: root.querySelector('#dcp-ta-bold').checked,
          italic: root.querySelector('#dcp-ta-italic').checked,
          underline: root.querySelector('#dcp-ta-underline').checked,
          color: color,
        };
      } else if (isValue) {
        target = {
          type: 'value',
          xOffset: readOffsetModeField('dcp-ta-xoffset'),
          yOffset: readOffsetModeField('dcp-ta-yoffset'),
          text: root.querySelector('#dcp-ta-text').value,
          fontSize: parseInt(root.querySelector('#dcp-ta-fontsize').value, 10) || 0,
          align: root.querySelector('#dcp-ta-align').value,
          bold: root.querySelector('#dcp-ta-bold').checked,
          italic: root.querySelector('#dcp-ta-italic').checked,
          underline: root.querySelector('#dcp-ta-underline').checked,
          intValue: readOffsetModeField('dcp-ta-intvalue', true),
          min: parseFloat(root.querySelector('#dcp-ta-min').value) || 0,
          max: parseFloat(root.querySelector('#dcp-ta-max').value) || 1,
          displayMin: parseFloat(root.querySelector('#dcp-ta-displaymin').value) || 0,
          displayMax: parseFloat(root.querySelector('#dcp-ta-displaymax').value) || 1,
          decimals: parseInt(root.querySelector('#dcp-ta-valuedecimals').value, 10) || 0,
          units: root.querySelector('#dcp-ta-valueunits').value,
          color: color,
        };
      } else {
        target = {
          type: 'line',
          xOffset: readOffsetModeField('dcp-ta-xoffset'),
          yOffset: readOffsetModeField('dcp-ta-yoffset'),
          xSize: _readNum(root.querySelector('#dcp-ta-xsize').value, 1),
          ySize: _readNum(root.querySelector('#dcp-ta-ysize').value, 1),
          color: color,
        };
      }
      target.idxName = targetItem.idxName;
      return target;
    }

    function commit(target) {
      const wrapper = { type: 'touchAction', cmdName: resumeState.cmdName, action: [target] };
      const newTouchActions = resumeState.touchActions.slice();
      if (hasExisting) {
        newTouchActions[editActionIndex] = wrapper;
      } else {
        newTouchActions.push(wrapper);
      }
      returnToTouchZoneScreen(Object.assign({}, resumeState, { touchActions: newTouchActions }));
    }

    /// Live-preview this touchAction's CURRENT (not-yet-saved) form state
    /// — see _updateTouchZoneSubEditorPreview's own doc. Reuses
    /// buildTargetItem() (the same builder Save itself uses) so the
    /// preview and the eventual commit can never disagree.
    /// @param {Array<object>} [extraItems] — passed straight through, so the
    ///        Show button can splice a hide/unhide directive onto the very
    ///        same live preview rather than building a second one.
    function renderLivePreview(extraItems) {
      const target = isHideUnhide ? { type: selectedType, idxName: targetItem.idxName } : buildTargetItem();
      const wrapper = { type: 'touchAction', cmdName: resumeState.cmdName, action: [target] };
      const liveTouchActions = resumeState.touchActions.slice();
      if (hasExisting) {
        liveTouchActions[editActionIndex] = wrapper;
      } else {
        liveTouchActions.push(wrapper);
      }
      _updateTouchZoneSubEditorPreview(dwgName, dwg, itemIndex, resumeState, liveTouchActions, resumeState.touchActionInput, extraItems);
    }
    function updatePreview() { renderLivePreview(null); }

    if (isHideUnhide) {
      root.querySelector('#dcp-ta-save').addEventListener('click', () => {
        commit({ type: selectedType, idxName: targetItem.idxName });
      });
    } else {
      let previewDebounce = null;
      function scheduleUpdatePreview() {
        if (previewDebounce) clearTimeout(previewDebounce);
        previewDebounce = setTimeout(updatePreview, 500);
      }
      [
        '#dcp-ta-xoffset', '#dcp-ta-yoffset', '#dcp-ta-xsize', '#dcp-ta-ysize',
        '#dcp-ta-radius', '#dcp-ta-start', '#dcp-ta-angle', '#dcp-ta-text', '#dcp-ta-fontsize',
        '#dcp-ta-intvalue', '#dcp-ta-valuedecimals', '#dcp-ta-min', '#dcp-ta-max',
        '#dcp-ta-displaymin', '#dcp-ta-displaymax', '#dcp-ta-valueunits',
      ].map((sel) => root.querySelector(sel)).filter(Boolean).forEach((input) => {
        input.addEventListener('input', scheduleUpdatePreview);
        input.addEventListener('blur', () => {
          if (previewDebounce) { clearTimeout(previewDebounce); previewDebounce = null; }
          updatePreview();
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            if (previewDebounce) { clearTimeout(previewDebounce); previewDebounce = null; }
            updatePreview();
          }
        });
      });
      [
        '#dcp-ta-align', '#dcp-ta-filled', '#dcp-ta-centered', '#dcp-ta-rounded',
        '#dcp-ta-bold', '#dcp-ta-italic', '#dcp-ta-underline',
      ].map((sel) => root.querySelector(sel)).filter(Boolean).forEach((el) => {
        el.addEventListener('change', updatePreview);
      });
      ['dcp-ta-xoffset', 'dcp-ta-yoffset', 'dcp-ta-intvalue'].forEach((fieldId) => {
        if (root.querySelector('#' + fieldId + '-mode')) wireOffsetModeField(fieldId);
      });

      function buildColorPopup() {
        const popup = root.querySelector('#dcp-ta-color-popup');
        const sections = [
          { title: 'Standard Colors (0-15)', from: 0, to: 15 },
          { title: '216 Colors (16-231)', from: 16, to: 231 },
          { title: 'Grayscale (232-255)', from: 232, to: 255 },
        ];
        let html = '';
        sections.forEach((section) => {
          html += '<div class="dcp-color-section-title">' + section.title + '</div><div class="dcp-color-row">';
          for (let i = section.from; i <= section.to; i++) {
            html += '<span class="dcp-color-cell" data-color="' + i + '" style="background:' + _swatchHex(i) + '"></span>';
          }
          html += '</div>';
        });
        popup.innerHTML = html;
        popup.querySelectorAll('.dcp-color-cell').forEach((cell) => {
          cell.addEventListener('click', () => {
            colorState.color = parseInt(cell.getAttribute('data-color'), 10);
            colorState.mode = 'color';
            updateColorHeader();
            updatePreview();
            popup.style.display = 'none';
          });
        });
      }
      function updateColorHeader() {
        const isBW = colorState.mode === 'blackwhite';
        root.querySelector('#dcp-ta-bw-btn').classList.toggle('dcp-mode-active', isBW);
        root.querySelector('#dcp-ta-color-btn').classList.toggle('dcp-mode-active', !isBW);
        root.querySelector('#dcp-ta-color-swatch').style.background = isBW ? _swatchHex(-1, dwg.color) : _swatchHex(colorState.color);
        root.querySelector('#dcp-ta-color-num').textContent = isBW ? 'BLACK_WHITE (auto)' : ('Color ' + colorState.color);
        root.querySelectorAll('#dcp-ta-color-popup .dcp-color-cell').forEach((cell) => {
          cell.classList.toggle('dcp-selected', !isBW && parseInt(cell.getAttribute('data-color'), 10) === colorState.color);
        });
      }
      buildColorPopup();
      updateColorHeader();
      root.querySelector('#dcp-ta-bw-btn').addEventListener('click', () => {
        colorState.mode = 'blackwhite';
        updateColorHeader();
        updatePreview();
        root.querySelector('#dcp-ta-color-popup').style.display = 'none';
      });
      function openColorPicker() {
        colorState.mode = 'color';
        updateColorHeader();
        updatePreview();
        root.querySelector('#dcp-ta-color-popup').style.display = 'block';
      }
      root.querySelector('#dcp-ta-color-btn').addEventListener('click', openColorPicker);
      root.querySelector('#dcp-ta-color-swatch').addEventListener('click', openColorPicker);

      root.querySelector('#dcp-ta-save').addEventListener('click', () => {
        commit(buildTargetItem());
      });
    }

    updatePreview();
  }

  // ── Load Dwg ──────────────────────────────────────────────────────

  /// Distinct insertDwg drawingNames a dwg references that are NOT
  /// currently in DwgLibrary — matches pfodWebDesigner's own control.js
  /// scan (`item.type.toLowerCase() === 'insertdwg' && item.drawingName`),
  /// adapted to a synchronous DwgLibrary.get() lookup instead of that
  /// project's own server-side existing-drawings fetch.
  /// @param {object} dwg — a dwg object with a flat items array
  /// @returns {Array<string>} distinct missing drawingNames, in
  ///          first-encountered order
  function _findMissingInsertDwgNames(dwg) {
    const missing = [];
    const seen = new Set();
    (dwg.items || []).forEach((item) => {
      if (item && item.type === 'insertDwg' && item.drawingName && !seen.has(item.drawingName)) {
        seen.add(item.drawingName);
        if (!DwgLibrary.get(item.drawingName)) missing.push(item.drawingName);
      }
    });
    return missing;
  }

  /// After a dwg has just been saved into DwgLibrary, scan it for
  /// insertDwg references that aren't currently loaded and, if any, walk
  /// the user through resolving them one at a time (Load File…/Skip)
  /// before continuing on to `proceed()` — matches pfodWebDesigner's own
  /// control.js checkForMissingInsertedDrawings, adapted to this
  /// project's own screen-per-view convention (a dedicated screen per
  /// missing reference, not a floating modal) and synchronous
  /// localStorage-backed DwgLibrary (no server fetch needed). Scoped to
  /// the just-loaded dwg's own references (and, recursively, whatever
  /// gets loaded to fill them) — unlike the reference implementation,
  /// this does not also rescan every OTHER already-loaded dwg in the
  /// library for its own unresolved references.
  /// @param {Element} root
  /// @param {object} dwg — the just-saved dwg (its own name already set)
  /// @param {function():void} proceed — called once every missing
  ///        reference has been resolved or skipped
  function _checkForMissingInsertDwgs(root, dwg, proceed) {
    const initialMissing = _findMissingInsertDwgNames(dwg);
    if (initialMissing.length === 0) { proceed(); return; }
    const queue = initialMissing.map((name) => ({ name, referencedBy: dwg.name }));
    const handled = new Set(); // cycle guard — pfodWebDesigner's own
    // scanForMissingInsertedDrawingsRecursive lacks this for circular
    // insertDwg references; this project's port adds it.
    const stillMissing = [];
    _promptNextMissingInsertDwg(root, queue, handled, stillMissing, (finalStillMissing) => {
      if (finalStillMissing.length > 0) {
        alert('"' + dwg.name + '" still references ' + finalStillMissing.length +
          ' drawing(s) that were not loaded:\n' + finalStillMissing.join(', ') +
          '\n\nThese insertDwg items may not display correctly until the referenced drawings are loaded.');
      }
      proceed();
    });
  }

  /// Show one missing insertDwg reference at a time (Load File…/Skip),
  /// recursing into whatever gets loaded for ITS OWN missing insertDwg
  /// refs too (queued onto this same sequence) — matches
  /// pfodWebDesigner's own control.js
  /// promptUserToLoadMissingDrawingsRecursive, same one-at-a-time UX.
  /// @param {Element} root
  /// @param {Array<{name:string, referencedBy:string}>} queue — mutable,
  ///        consumed via shift()
  /// @param {Set<string>} handled — names already prompted for (the
  ///        cycle guard)
  /// @param {Array<string>} stillMissing — accumulates names the user
  ///        skipped or failed to resolve
  /// @param {function(Array<string>):void} onDone
  function _promptNextMissingInsertDwg(root, queue, handled, stillMissing, onDone) {
    // Drop anything already handled, or that's since become available
    // (e.g. the same name queued twice via two different referencing dwgs).
    while (queue.length > 0 && (handled.has(queue[0].name) || DwgLibrary.get(queue[0].name))) {
      queue.shift();
    }
    if (queue.length === 0) { onDone(stillMissing); return; }

    const next = queue.shift();
    const name = next.name;
    const referencedBy = next.referencedBy;
    handled.add(name);

    root.innerHTML =
      '<div class="dcp-back-row">' +
        '<button type="button" class="dcp-back-link dcp-exit" id="dcp-exit-designer">Exit Designer</button>' +
      '</div>' +
      '<h1 class="dcp-title">Missing Drawing Reference</h1>' +
      '<div class="dcp-errbox">' +
        '<div class="dcp-errbox-head">The drawing <b>' + _esc(referencedBy) + '</b> references <b>' +
          _esc(name) + '</b>, which is not currently loaded.</div>' +
        '<div style="margin-top:8px">Would you like to select and load &ldquo;' + _esc(name) + '.pfodDwg_json&rdquo; now?</div>' +
      '</div>' +
      '<div class="dcp-action-row" style="justify-content:flex-end; margin-top:16px">' +
        '<button type="button" class="dcp-btn dcp-btn-ghost" id="dcp-missing-skip">Skip</button>' +
        '<button type="button" class="dcp-btn dcp-btn-primary" id="dcp-missing-load">Load File&hellip;</button>' +
      '</div>';

    root.querySelector('#dcp-exit-designer').addEventListener('click', _exitDesigner);
    root.querySelector('#dcp-missing-skip').addEventListener('click', () => {
      stillMissing.push(name);
      _promptNextMissingInsertDwg(root, queue, handled, stillMissing, onDone);
    });
    root.querySelector('#dcp-missing-load').addEventListener('click', () => {
      _loadFileForMissingInsertDwg(name, (ok) => {
        if (!ok) stillMissing.push(name);
        _promptNextMissingInsertDwg(root, queue, handled, stillMissing, onDone);
      }, queue, handled);
    });
  }

  /// Open a file picker to resolve ONE missing insertDwg reference by
  /// forcing the picked file's own dwg name to `expectedName` (trusting
  /// "this file is for that slot", not the file's own internal name
  /// field) — matches pfodWebDesigner's own
  /// loadDrawingFromFileForMissingRecursive. On success, also scans the
  /// newly-loaded dwg's own items for further missing insertDwg refs and
  /// queues them onto the SAME sequence (skipping anything already
  /// `handled`, the cycle guard for a circular insertDwg reference).
  /// @param {string} expectedName
  /// @param {function(boolean):void} onDone — true if a file was picked
  ///        and successfully loaded, false if the user cancelled or the
  ///        file was rejected
  /// @param {Array<{name:string, referencedBy:string}>} queue
  /// @param {Set<string>} handled
  function _loadFileForMissingInsertDwg(expectedName, onDone, queue, handled) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pfodDwg_json';
    input.style.display = 'none';
    document.body.appendChild(input);

    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      document.body.removeChild(input);
      window.removeEventListener('focus', onFocusFallback);
      onDone(ok);
    };
    // No native "cancel" event on <input type=file> — detect the OS file
    // dialog closing via the window regaining focus with no 'change'
    // having fired, matching pfodWebDesigner's own fallback.
    const onFocusFallback = () => {
      setTimeout(() => { if (!settled) finish(false); }, 300);
    };
    window.addEventListener('focus', onFocusFallback);

    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) { finish(false); return; }
      const reader = new FileReader();
      reader.onerror = () => {
        alert('Failed to read file "' + file.name + '". See console for details.');
        console.error('[DwgControlsPanel] FileReader error for', file.name, reader.error);
        finish(false);
      };
      reader.onload = () => {
        let raw;
        try {
          raw = JSON.parse(reader.result);
        } catch (parseError) {
          alert('Invalid JSON file. See console for details.');
          console.error('[DwgControlsPanel] JSON.parse failed for', file.name, parseError);
          finish(false);
          return;
        }
        if (!looksLikeDwgFile(raw)) {
          alert('"' + file.name + '" does not look like a valid dwg file (missing "format": "pfodDwgDesigner") and was not loaded.');
          finish(false);
          return;
        }
        const { dwg } = validateAndRepairDwg(raw, file.name, true);
        dwg.name = expectedName; // this file is FOR this exact missing slot
        DwgLibrary.save(dwg);
        _findMissingInsertDwgNames(dwg).forEach((childName) => {
          if (!handled.has(childName)) queue.push({ name: childName, referencedBy: expectedName });
        });
        finish(true);
      };
      reader.readAsText(file);
    };
    input.click();
  }

  /// Open the file picker for Load Dwg. Reuses one hidden <input> across
  /// calls rather than creating a fresh one per click.
  /// @param {Element} root
  /// @param {function(string):void} [onLoaded] — called with the newly
  ///        saved dwg's own (deduped) name once a file is successfully
  ///        loaded, INSTEAD of the default _renderMainView(root) bounce.
  ///        Lets a caller deep in some other screen (e.g. Edit Item's own
  ///        "Load Dwg from file…" for an insertDwg target) come straight
  ///        back to itself with the freshly-loaded dwg selected, rather
  ///        than losing its place at the top-level list view.
  function _startLoadDwg(root, onLoaded) {
    let input = document.getElementById('dcp-load-dwg-input');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pfodDwg_json';
      input.id = 'dcp-load-dwg-input';
      input.style.display = 'none';
      document.body.appendChild(input);
    }
    // Reset so picking the same file twice in a row still fires 'change'.
    input.value = '';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (file) _readAndLoadFile(root, file, onLoaded);
    };
    input.click();
  }

  /// Read the picked file, parse it, validate + repair it against the
  /// dwg schema, dedup its name against the library, then either save it
  /// straight in (no problems found) or show the Validation Errors view.
  /// A genuine JSON parse failure just alerts — matches
  /// pfodWebDesigner/src/control.js:1150-1153 (unparseable JSON can't be
  /// meaningfully auto-fixed, unlike a structurally-wrong-but-parseable
  /// dwg). A file that doesn't even look like a dwg (see looksLikeDwgFile
  /// — strict: requires "format": "pfodDwgDesigner" — the directory a
  /// user picks may well contain other, unrelated .pfodDwg_json/.json files)
  /// is rejected with a visible alert too — previously this was a silent
  /// console.log-only skip, which looked indistinguishable from "nothing
  /// happened" when a user picked a file expecting it to load.
  /// @param {Element} root
  /// @param {File} file
  /// @param {function(string):void} [onLoaded] — see _startLoadDwg's own doc
  function _readAndLoadFile(root, file, onLoaded) {
    const reader = new FileReader();
    reader.onerror = () => {
      alert('Failed to read file "' + file.name + '". See console for details.');
      console.error('[DwgControlsPanel] FileReader error for', file.name, reader.error);
    };
    reader.onload = () => {
      let raw;
      try {
        raw = JSON.parse(reader.result);
      } catch (parseError) {
        alert('Invalid JSON file. See console for details.');
        console.error('[DwgControlsPanel] JSON.parse failed for', file.name, parseError);
        return;
      }

      if (!looksLikeDwgFile(raw)) {
        alert('"' + file.name + '" does not look like a valid dwg file (missing "format": "pfodDwgDesigner") and was not loaded.');
        console.log('[DwgControlsPanel] "' + file.name + '" does not look like a dwg file — skipped');
        return;
      }

      const { dwg, errors } = validateAndRepairDwg(raw, file.name, true);

      // Dedup against the library — never silently overwrite an existing
      // entry (unlike pfodWebDesigner's server.js:3332-3345). Runs
      // regardless of whether validation found problems.
      dwg.name = DwgLibrary.nextFreeName(dwg.name);

      if (errors.length === 0) {
        DwgLibrary.save(dwg);
        _checkForMissingInsertDwgs(root, dwg, () => {
          if (onLoaded) { onLoaded(dwg.name); } else { _renderMainView(root); }
        });
      } else {
        _renderValidationErrors(root, dwg, errors, file.name, onLoaded);
      }
    };
    reader.readAsText(file);
  }

  /// Open a directory picker for "Load All Dwgs in Dir and sub-Dirs" —
  /// `webkitdirectory` gives every file under the chosen folder tree
  /// (recursively) in one FileList, matching how _startLoadDwg already
  /// picks a single file with a plain hidden <input>. Reuses one hidden
  /// input across calls.
  function _startLoadAllDwgs(root) {
    let input = document.getElementById('dcp-load-all-dwgs-input');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.webkitdirectory = true;
      input.multiple = true;
      input.id = 'dcp-load-all-dwgs-input';
      input.style.display = 'none';
      document.body.appendChild(input);
    }
    input.value = '';
    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : [];
      const jsonFiles = files.filter((f) => /\.pfodDwg_json$/i.test(f.name));
      if (jsonFiles.length > 0) _readAndLoadAllFiles(root, jsonFiles);
    };
    input.click();
  }

  /// Load every dwg-shaped .pfodDwg_json file found under a picked directory
  /// tree. Non-dwg .pfodDwg_json files — whether well-formed-but-wrong-shape
  /// (looksLikeDwgFile fails) OR not even valid JSON (a directory scan
  /// will routinely turn up unrelated files — board configs, menu
  /// designs, etc. — that don't parse as JSON at all) — are BOTH
  /// silently skipped, no error logged: a directory is expected to
  /// contain other files, unlike a deliberately-picked single file
  /// in Load Dwg (which still alerts on a genuine parse failure — the
  /// user explicitly chose that one file). Unlike single Load Dwg, a
  /// file WITH validation errors isn't routed to the interactive
  /// Validation Errors screen — there's no reasonable way to show that
  /// per-file across a whole directory's worth of files — repairs are
  /// applied automatically (validateAndRepairDwg already does this) and
  /// every file is saved; a final summary alert reports counts so the
  /// user isn't left guessing what happened. A genuine FileReader I/O
  /// error (couldn't even read the file's bytes, unrelated to its
  /// content) is the only case still logged/counted as a real failure.
  /// @param {Array<File>} files
  function _readAndLoadAllFiles(root, files) {
    let remaining = files.length;
    let loaded = 0, repaired = 0, skipped = 0, failed = 0;
    const loadedNames = [];

    const done = () => {
      if (--remaining > 0) return;
      // Loading a whole directory tree normally resolves insertDwg
      // references to sibling files within the SAME batch automatically
      // (every file is saved before this runs) — this only reports
      // references that are STILL unresolved even after the whole
      // directory was loaded, same "still missing" idea as the single
      // Load Dwg flow's own _checkForMissingInsertDwgs, but scoped to
      // just the dwgs loaded in this batch (not a full-library rescan)
      // and folded into the one summary alert rather than an interactive
      // per-file prompt sequence, which doesn't fit a bulk operation.
      const missingAcrossBatch = new Set();
      loadedNames.forEach((name) => {
        const dwg = DwgLibrary.get(name);
        if (dwg) _findMissingInsertDwgNames(dwg).forEach((m) => missingAcrossBatch.add(m));
      });
      console.log('[DwgControlsPanel] Load All Dwgs: loaded=' + loaded +
        ' (repaired=' + repaired + '), skipped=' + skipped + ', failed=' + failed +
        ', stillMissingInsertDwgs=' + missingAcrossBatch.size);
      alert('Load All Dwgs in Dir and sub-Dirs:\n' +
        loaded + ' dwg(s) loaded' + (repaired > 0 ? ' (' + repaired + ' with automatic repairs)' : '') + '\n' +
        skipped + ' non-dwg .pfodDwg_json file(s) skipped\n' +
        failed + ' file(s) failed to read' +
        (missingAcrossBatch.size > 0
          ? '\n\nWarning: still missing ' + missingAcrossBatch.size + ' referenced drawing(s) (not found under this folder):\n' +
            Array.from(missingAcrossBatch).join(', ')
          : ''));
      _renderMainView(root);
    };

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onerror = () => {
        failed++;
        console.error('[DwgControlsPanel] FileReader error for', file.name, reader.error);
        done();
      };
      reader.onload = () => {
        let raw;
        try {
          raw = JSON.parse(reader.result);
        } catch (parseError) {
          skipped++;
          console.log('[DwgControlsPanel] "' + file.name + '" is not valid JSON — skipped');
          done();
          return;
        }
        if (!looksLikeDwgFile(raw)) {
          skipped++;
          console.log('[DwgControlsPanel] "' + file.name + '" does not look like a dwg file — skipped');
          done();
          return;
        }
        const { dwg, errors } = validateAndRepairDwg(raw, file.name, true);
        dwg.name = DwgLibrary.nextFreeName(dwg.name);
        DwgLibrary.save(dwg);
        loadedNames.push(dwg.name);
        loaded++;
        if (errors.length > 0) repaired++;
        done();
      };
      reader.readAsText(file);
    });
  }

  // ── Unload Dwg ────────────────────────────────────────────────────

  /// Trigger a browser download of `dwg` as a `.pfodDwg_json` file — same
  /// Blob + object-URL + synthetic-click pattern messageViewer.js's own
  /// exportJSON()/exportCSV() already use. buildSaveableDwg() (dwgLibrary.js)
  /// produces the exact same self-describing wrapper + flat item form
  /// DwgLibrary.save() writes to localStorage, stamped fresh for this
  /// save (not carried over from whatever was loaded) — so the file is
  /// byte-for-byte what Load Dwg expects to read back in. Extension is
  /// .pfodDwg_json (not .json), matching the menu designer's own
  /// distinctive-extension convention (.pfodMenu_json — loadFromFile.js/
  /// saveToFile.js) — a single, distinctive extension rather than a
  /// generic .json a directory scan could confuse with unrelated files.
  function _downloadDwgAsJson(dwg) {
    const json = JSON.stringify(buildSaveableDwg(dwg), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = dwg.name + '.pfodDwg_json';
    link.click();
    URL.revokeObjectURL(url);
  }

  /// Unload the selected dwg: save it out to a local file first (so the
  /// removal is never a silent data loss), then delete it from the
  /// library and refresh the view.
  function _unloadDwg(root) {
    if (!_selectedDwgName) return;
    const name = _selectedDwgName;
    const dwg = DwgLibrary.get(name);
    if (!dwg) return;
    _downloadDwgAsJson(dwg);
    DwgLibrary.remove(name);
    _selectedDwgName = null;
    _renderMainView(root);
  }

  // ── Copy / Export Dwg ────────────────────────────────────────────

  /// Export the selected dwg — same file download _unloadDwg() uses,
  /// minus the removal: the library entry is left untouched.
  function _exportDwg() {
    if (!_selectedDwgName) return;
    const dwg = DwgLibrary.get(_selectedDwgName);
    if (!dwg) return;
    _downloadDwgAsJson(dwg);
  }

  /// "Generate Code - Serial" — downloads Dwg_<name>.h/.cpp (this dwg and
  /// every dwg it reaches via insertDwg) as a zip — see
  /// dwgArduinoExport.js's own exportDwgAsZip doc for exactly what is and
  /// isn't included, and why.
  /// @param {string} dwgName
  function _generateCode(dwgName) {
    if (!dwgName || !DwgLibrary.get(dwgName)) return;
    const { missingDrawings } = DwgArduinoExport.exportDwgAsZip(dwgName);
    if (missingDrawings.length > 0) {
      alert('Generate Code completed.\n\nWarning: the following inserted drawing(s) are not loaded and so could not be included:\n' +
        missingDrawings.join(', ') + '\n\nThe generated files will not include these drawings.');
    }
  }

  /// Duplicate the selected dwg under the next free "<name>_<n>" name
  /// (DwgLibrary.nextFreeName — same dedup convention Load Dwg already
  /// uses against an existing name), select the new copy, and refresh
  /// the view.
  function _copyDwg(root) {
    if (!_selectedDwgName) return;
    const dwg = DwgLibrary.get(_selectedDwgName);
    if (!dwg) return;
    const copyName = DwgLibrary.nextFreeName(dwg.name);
    DwgLibrary.save(Object.assign({}, dwg, { name: copyName }));
    _selectedDwgName = copyName;
    _renderMainView(root);
  }

  /// Render the "Load Dwg — Validation Errors" view (single-column, no
  /// preview split — matches alt-a-mockup.html's "Load Dwg — Validation
  /// Errors" screen exactly: file chip, one row per problem showing the
  /// field/message and the fix that was already applied, then
  /// Cancel / Choose a different file / Accept Fixes and continue.
  /// @param {Element} root
  /// @param {object} dwg
  /// @param {Array} errors
  /// @param {string} fileName
  /// @param {function(string):void} [onLoaded] — see _startLoadDwg's own doc
  function _renderValidationErrors(root, dwg, errors, fileName, onLoaded) {
    const rowsHtml = errors.map(e =>
      '<div class="dcp-err-row">' +
        '<span class="dcp-err-mark">&#10007;</span>' +
        '<div class="dcp-err-body">' +
          '<div class="dcp-err-msg"><span class="dcp-err-field">' + _esc(e.field) + '</span>' +
            ' &mdash; ' + _esc(e.message) + '</div>' +
          '<div class="dcp-fix-row"><span class="dcp-fix-tick">&#10003;</span> Fix applied: <b>' +
            _esc(e.fix) + '</b></div>' +
        '</div>' +
      '</div>'
    ).join('');

    root.innerHTML =
      '<div class="dcp-back-row">' +
        '<button type="button" class="dcp-back-link" id="dcp-err-cancel">&larr; Cancel</button>' +
        '<button type="button" class="dcp-back-link dcp-exit" id="dcp-exit-designer">Exit Designer</button>' +
      '</div>' +
      '<h1 class="dcp-title">Load Dwg from file &mdash; ' + errors.length +
        ' problem' + (errors.length === 1 ? '' : 's') + ' found and fixed</h1>' +
      '<div class="dcp-file-chip">&#128196; ' + _esc(fileName) + '</div>' +
      '<div class="dcp-errbox">' +
        '<div class="dcp-errbox-head">Every problem below was fixed automatically &mdash; ' +
          'review, then accept or start over with a different file.</div>' +
        rowsHtml +
      '</div>' +
      '<div class="dcp-action-row" style="justify-content:space-between; margin-top:16px">' +
        '<button type="button" class="dcp-btn dcp-btn-danger" id="dcp-err-cancel-2">Cancel</button>' +
        '<button type="button" class="dcp-btn dcp-btn-ghost" id="dcp-err-choose-different">Choose a different file</button>' +
        '<button type="button" class="dcp-btn dcp-btn-primary" id="dcp-err-accept">Accept Fixes and continue</button>' +
      '</div>';

    const cancel = () => _renderMainView(root);
    root.querySelector('#dcp-err-cancel').addEventListener('click', cancel);
    root.querySelector('#dcp-err-cancel-2').addEventListener('click', cancel);
    root.querySelector('#dcp-exit-designer').addEventListener('click', _exitDesigner);
    root.querySelector('#dcp-err-choose-different').addEventListener('click', () => {
      _renderMainView(root);
      _startLoadDwg(root, onLoaded);
    });
    root.querySelector('#dcp-err-accept').addEventListener('click', () => {
      DwgLibrary.save(dwg);
      _checkForMissingInsertDwgs(root, dwg, () => {
        if (onLoaded) { onLoaded(dwg.name); } else { _renderMainView(root); }
      });
    });
  }

  /// Minimal HTML-escape for values interpolated into innerHTML (error
  /// messages/field paths/file names — all attacker-uncontrolled in
  /// practice, but the file's own name and any string field values flow
  /// through here unmodified from the picked JSON).
  function _esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Navigation ────────────────────────────────────────────────────

  /// Hide the panel and request the Designer main menu — the same {.}
  /// request every other Designer screen already uses to reach it (see
  /// mainMenu.js's own doc comment). The response is a normal pfod menu
  /// string, handled by the existing generic menu-rendering path.
  function _backToMenu() {
    _restoreDesignerAdapter();
    hide();
    document.body.className = 'menu-mode';
    window.drawingViewer.addToRequestQueue('{.}', null, null, 'mainMenu');
  }

  /// Disconnect and return to the connection-setup screen — the exact
  /// same call the toolbar's own "Exit" item uses (toolbarAndMenu.js),
  /// which already handles queue drainage, sending {!}, and navigating
  /// away via _exitToConnectionScreen().
  function _exitDesigner() {
    _restoreDesignerAdapter();
    window.drawingViewer.addToRequestQueue('{!}', null, null, 'exitAbort');
  }

  /// Swap connectionManager's active adapter to a dedicated
  /// DwgDesignerVirtualAdapter (dwgDesigner/dwgDesignerAdapter.js) for the
  /// duration this panel is open, saving the real Designer adapter/
  /// protocol so _restoreDesignerAdapter() can put it back. No-ops if
  /// already swapped (e.g. show() called again while already showing).
  /// window.drawingViewer.protocol is kept in sync too — it's a one-time
  /// copy of connectionManager.protocol made at connect time
  /// (pfodWeb.js:206), not a live getter, so it would otherwise go stale.
  function _switchToDwgDesignerAdapter() {
    if (_savedAdapter) return; // already swapped
    const cm = window.drawingViewer.connectionManager;
    _savedAdapter = cm.adapter;
    _savedConnectionProtocol = cm.protocol;
    _savedViewerProtocol = window.drawingViewer.protocol;
    if (!_dwgDesignerAdapter) {
      _dwgDesignerAdapter = new DwgDesignerVirtualAdapter(cm.config, cm);
    }
    cm.adapter = _dwgDesignerAdapter;
    cm.protocol = 'dwgDesigner';
    window.drawingViewer.protocol = 'dwgDesigner';
  }

  /// Reverse _switchToDwgDesignerAdapter() — restores the real Designer
  /// adapter/protocol. Called before Back to Menu / Exit Designer send
  /// their own real cmds ({.} / {!}), which must reach the actual
  /// Designer connection, not the trivial dwgDesigner device. No-op if
  /// not currently swapped.
  function _restoreDesignerAdapter() {
    if (!_savedAdapter) return;
    const cm = window.drawingViewer.connectionManager;
    cm.adapter = _savedAdapter;
    cm.protocol = _savedConnectionProtocol;
    window.drawingViewer.protocol = _savedViewerProtocol;
    _savedAdapter = null;
    _savedConnectionProtocol = null;
    _savedViewerProtocol = null;
  }

  // The real #button-bar's own buttons — disabled (not hidden) while
  // this panel is showing, per direction: navigation is handled entirely
  // by the panel's own "Back to Menu"/"Exit Designer" buttons, but the
  // bar itself stays visible/laid-out (so #canvas-wrapper's real height
  // budget — flex:1 alongside #button-bar's own flex-shrink:0 40px —
  // stays exactly as every other real menu screen computes it). Native
  // `disabled` gets the existing .toolbar-button:disabled styling
  // (pfodCommon.css:149-155 — dimmed icon, not-allowed cursor) and blocks
  // clicks for free, same mechanism the freeze-row buttons already use.
  const _NAV_BUTTON_IDS = ['btn-left-arrow', 'btn-reload', 'btn-menu'];

  /// Show the Dwg Controls Panel: pin #dcp-left-panel and #canvas-pane to
  /// a fixed 500px each (see #dcp-left-panel's CSS comment for why this
  /// is inline-JS-driven rather than a body.<mode> CSS rule — #canvas-pane
  /// is shared by every real menu screen), disable the real #button-bar's
  /// nav buttons, reveal the left panel, and render the list + preview.
  /// body.className itself is left untouched here — _renderPreview() ->
  /// pfodMenuDisplay.show() sets it to real 'menu-mode' once a dwg is
  /// actually painted.
  /// Called directly from the main-menu button's click handler
  /// (responseHandlers.js), not from any response parsing.
  function show() {
    if (document.body.className === 'menu-mode' && window.pfodMenuDisplay) {
      window.pfodMenuDisplay.hide();
      window.drawingViewer.redraw.clearMenuCanvases();
    }
    // A stray Create/Edit Dwg draft can only mean the panel was left (tab
    // closed/refreshed) mid-form without hitting Cancel/Create/Save —
    // discard it here too so a fresh open of the panel never shows it.
    DwgLibrary.remove(CREATE_DWG_DRAFT_NAME);
    DwgLibrary.remove(EDIT_DWG_DRAFT_NAME);
    DwgLibrary.remove(ADD_ITEM_DRAFT_NAME);
    _switchToDwgDesignerAdapter();
    // Halt auto-refresh while this panel is showing — ONLY here, per
    // direction, regardless of the previewed dwg's own refresh interval
    // or the originating menu's reRequestMs. scheduleNextUpdate()
    // (navigationAndQueue.js:212) already only ever re-arms while
    // body.className === 'menu-mode', so it won't re-arm itself in this
    // mode — but that gate doesn't retroactively cancel a timer that was
    // already armed from menu-mode before this button was clicked.
    // Mirrors the existing chart-mode entry precedent (toolbarAndMenu.js:449:
    // "Cancel any armed auto-refresh timer — chart-mode has nothing to
    // refresh").
    if (window.drawingViewer.updateTimer) {
      clearTimeout(window.drawingViewer.updateTimer);
      window.drawingViewer.updateTimer = null;
    }

    // Must happen BEFORE _renderMainView()/_renderPreview() run —
    // handleMenuResize (called via handleResize() inside _renderPreview)
    // sizes the preview canvas from #canvas-pane's real, already-laid-out
    // width, so the 500px pin has to be in place first.
    const layoutContainer = document.getElementById('layout-container');
    const canvasPane = document.getElementById('canvas-pane');
    layoutContainer.style.overflowX = 'auto';
    canvasPane.style.flex = '0 0 500px';
    _NAV_BUTTON_IDS.forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = true;
    });

    const root = _getRoot();
    root.style.display = 'flex';
    _renderMainView(root);
  }

  /// Hide the panel: restore #canvas-pane/#layout-container to their
  /// normal (shared, body.<mode>-driven) sizing, re-enable the real
  /// #button-bar's nav buttons, and hide #dcp-left-panel. Does not touch
  /// body.className — callers that navigate elsewhere (Back to Menu,
  /// Exit Designer) set the next mode themselves once their own request/
  /// response resolves.
  function hide() {
    const el = document.getElementById('dcp-left-panel');
    if (el) el.style.display = 'none';
    const layoutContainer = document.getElementById('layout-container');
    const canvasPane = document.getElementById('canvas-pane');
    if (layoutContainer) layoutContainer.style.overflowX = '';
    if (canvasPane) canvasPane.style.flex = '';
    _NAV_BUTTON_IDS.forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) btn.disabled = false;
    });
  }

  return Object.freeze({ show, hide });
})();

// Exposed the same way chartDisplay / pfodMenuDisplay are — a plain
// global singleton, no module system in this bundle.
window.designerDwgPanel = DesignerDwgPanel;
