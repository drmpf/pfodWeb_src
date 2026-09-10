/*
 * designer/menus/selectDwgForItem.js
 *
 * "Choose a Drawing" screen for a Drawing-type menu item — reached via
 * the 'K' sub-byte of the 'd' (editMenuItem) handler (EMI_LINK_DWG_CMD,
 * editMenuItem.js). Mirrors selectFromMenuList.js's own "Edit existing
 * Menu" screen shape: a Load-from-file button, a label, then one button
 * per dwg currently held in DwgLibrary (name + description).
 *
 * Reached both:
 *   - immediately after a fresh Drawing item is created (addMenuItem.js's
 *     IDX_DRAWING branch dispatches {dK} directly instead of {d}, so the
 *     user picks a dwg before ever seeing the otherwise dwg-less item
 *     editor), and
 *   - later, via the item editor's own "Change Drawing" button.
 *
 * Command flow (depth = index of 'd' in rawCmd — this module receives
 * the SAME depth editMenuItem.js's switch was itself called with, not a
 * re-based one; matches editMenuItemPin.js's own send(rawCmd,state,depth)
 * convention exactly, including hardcoding its own full cmd prefix in
 * every rendered button rather than deriving it from depth):
 *   {dK}      → render the full screen (page 0)
 *   {dK<n>}   → pick the dwg in row SLOT n of the page currently showing
 *               as the item's dwgName, then return '{<}' — a real
 *               back-navigation request (same as the toolbar's own
 *               back-arrow button; see responseHandlers.js's own '{<'
 *               handling), landing on whatever screen genuinely led here.
 *   {dKL}     → open the OS file picker; a successfully loaded dwg
 *               becomes the item's dwgName, then '{<}' as above.
 *               Cancel/error/invalid-file answer PFOD_EMPTY (with an
 *               alert on error) — nothing was loaded, so nothing on the
 *               screen changes, and a {} is not a menu response so it
 *               never reaches menuNavStack.
 *   {dKM}     → "More Dwgs": next page, as a {;} update of this screen.
 *   {dKP}     → "Back": previous page, likewise a {;} update.
 *   {dKA}     → "Back to Add/Edit Menu Item": leave the list, rebuilding
 *               whichever screen opened this one.
 *
 * Paging: a pfod command is capped at 1024 wire BYTES, and the designer's
 * virtual device is subject to it like any other transport (adapter.js
 * reuses connectionManager's own processReadBuffer, which auto-closes at
 * the cap). A library of thirty drawings therefore does not make a long
 * screen — it makes a truncated one. So the list is split into pages that
 * each fit, with More/Back moving between them.
 *
 * Every page after the first is a {;} UPDATE of the screen already
 * showing, never a screen of its own. Two things follow, and both matter:
 * the row buttons are fixed SLOTS re-labelled per page (an update matches
 * items by cmd, and cannot add an item or change one's cmd), and paging
 * puts nothing on menuNavStack — so backing out of a five-page list is
 * still one press, not five. The page number is a module variable for the
 * same reason the slots are fixed: it cannot live in the cmd.
 *
 * Nav-stack contract: the client records every cmd that answers with a
 * {,} and Back RE-SENDS the top of that stack (responseHandlers.js's
 * _navigateToMenu / toolbarAndMenu.js's back handler). A file picker
 * therefore must never answer with a {,}, or backing into this screen
 * re-runs it and the OS dialog opens by itself. {dK} is the only cmd
 * here that answers with one, because it is the only one that is a
 * navigation; {dK<n>} pops with '{<}' and {dKL} either pops or says
 * nothing changed. Matches loadFromFile.js's own documented contract.
 *
 * No version tag / no trailing `~` — DwgLibrary's contents can change
 * between renders (a file load here, or a dwg created/edited via the Dwg
 * Controls Panel elsewhere), so pfodWeb must always re-fetch. Matches
 * feedback-designer-menus-no-cache.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DesignerSelectDwgForItem = (() => {

  // Sub-byte after 'K' for the Load Dwg from File button — matches
  // loadFromFile.js's own 'L' convention for the analogous action on
  // selectFromMenuList.js's screen.
  const SDI_LOAD_FILE_CMD = 'L';

  // ── Paging ────────────────────────────────────────────────────────
  // A pfod command is capped at 1024 wire BYTES: connectionManager's own
  // processReadBuffer auto-closes with an implicit '}' at the cap and files
  // the rest as 'excess >1024'. That cap applies here — the designer's
  // virtual device delivers through the same inherited pipeline (see
  // designer/adapter.js) — so a library of thirty drawings does not produce
  // a long screen, it produces a TRUNCATED one, with the last row cut
  // mid-name and every row after it simply gone.
  //
  // So the list is paged. The three cmds below drive it; the rows
  // themselves are fixed SLOTS (dK0…dK<n-1>) that are re-labelled per page,
  // because a {;} update matches items by cmd and can only change what the
  // screen already declared — it can neither add an item nor change one's
  // cmd. That is also why the page number lives in a module variable rather
  // than in the cmd: the cmd of a row cannot vary.

  // "More Dwgs" — next page, as a {;} update of THIS screen. Hidden when
  // everything already fits, and on the last page.
  const SDI_MORE_CMD = 'M';

  // "Back" — previous page, also a {;} update. Hidden on page 0.
  const SDI_PREV_CMD = 'P';

  // "Back to Add/Edit Menu Item" — the way OUT of a paged list, since the
  // toolbar's own back arrow is about screens and by now the user is
  // several pages into one. Hidden on page 0, where the toolbar arrow
  // already does the same job.
  const SDI_PARENT_CMD = 'A';

  // Byte budget for one rendered message. The cap is 1024; this leaves
  // room for the closing brace and for a multi-byte character landing
  // across the boundary.
  const SDI_MSG_BUDGET = 1000;

  // Which page is on screen. Reset to 0 by _renderScreen — every route in
  // (a fresh {dK}, or a back-navigation re-sending it) rebuilds the screen,
  // and a screen that came back showing page 4 would be a screen the user
  // never asked for.
  let _page = 0;

  /// Wire length of `s` in BYTES, which is what the 1024 cap counts — a
  /// name with a degree sign or an accent is longer on the wire than in
  /// JS characters, and budgeting in characters would under-count it.
  /// @param {string} s
  /// @returns {number}
  function _bytes(s) {
    return new TextEncoder().encode(s).length;
  }

  /// Read a non-negative decimal integer starting at rawCmd[startIdx];
  /// stops at the first non-digit. Returns int or null when no digits.
  function _parseIdx(rawCmd, startIdx) {
    let s = '';
    for (let i = startIdx; i < rawCmd.length; i++) {
      const c = rawCmd[i];
      if (c >= '0' && c <= '9') s += c;
      else break;
    }
    return s.length > 0 ? parseInt(s, 10) : null;
  }

  /// Strip pfod delimiter characters so a dwg's own name/description
  /// text can never corrupt the wire message it's embedded in — matches
  /// loadFromFile.js's own _successUpdate/_errorUpdate sanitization.
  function _sanitize(s) {
    return String(s || '').replace(/[|~`{}]/g, '_');
  }

  /// Every dwg already used anywhere in the whole design — directly
  /// linked to some OTHER Drawing menu item (any menu/sub-menu/sub-sub-
  /// menu, via state.getAllItems()'s own unlimited-depth walk), plus
  /// every dwg any of those reach via their own insertDwg chain
  /// (DwgArduinoExport.collectAllDwgs, the same reachability helper
  /// generateCode.js's own dwg bundling uses) — excluded from the
  /// picker list below so the same dwg can't accidentally be linked to
  /// two different menu items.
  /// @param {DesignerState} state
  /// @returns {Set<string>}
  function _usedDwgNames(state) {
    const used = new Set();
    for (const item of state.getAllItems()) {
      if (item.type === 'drawing' && item.dwgName) {
        DwgArduinoExport.collectAllDwgs(item.dwgName, used, []);
      }
    }
    return used;
  }

  /// DwgLibrary names actually offered on this screen — every loaded
  /// dwg EXCEPT those already used elsewhere in the design (see
  /// _usedDwgNames). Shared by _renderScreen (the rows shown) and
  /// send() (resolving a row's cmd index back to a name) so the two
  /// never disagree about what index N refers to.
  /// @param {DesignerState} state
  /// @returns {string[]}
  function _listNames(state) {
    const used = _usedDwgNames(state);
    return DwgLibrary.listNames().filter((name) => !used.has(name));
  }

  /// _usedDwgNames's own deep walk (dwgs reachable via insertDwg from
  /// any Drawing item, but only for names it could actually open — see
  /// DwgArduinoExport.collectAllDwgs's own doc: a missing/unloaded
  /// target is recorded as "missing", not added to the returned set)
  /// PLUS every Drawing item's own dwgName directly, even when that dwg
  /// isn't currently loaded. Loading a file from _loadFromFile checks
  /// against THIS, not _usedDwgNames alone — a menu can reference a dwg
  /// by name before it's ever been loaded (missingDwgPrompt.js's own
  /// "Missing Drawings" flow, or a design shared without its dwg files),
  /// and picking a same-named file here must be treated the same as
  /// picking an already-loaded one: reject, don't silently create a
  /// second, disconnected entry via DwgLibrary's own overwrite-on-save.
  /// @param {DesignerState} state
  /// @returns {Set<string>}
  function _usedOrReferencedDwgNames(state) {
    const names = _usedDwgNames(state);
    for (const item of state.getAllItems()) {
      if (item.type === 'drawing' && item.dwgName) names.add(item.dwgName);
    }
    return names;
  }

  /// One row of the list: the button for the dwg shown in slot `slot` of
  /// the CURRENT page. The slot number is the cmd, not the dwg's index in
  /// the library — a {;} cannot change an item's cmd, so the same
  /// dK<slot> means a different drawing on each page and send() resolves
  /// it against the page that is showing.
  /// @param {number} slot
  /// @param {string} name
  /// @returns {string}
  function _rowItem(slot, name) {
    const dwg  = DwgLibrary.get(name);
    const desc = (dwg && dwg.description) ? _sanitize(dwg.description) : '';
    return '|dK' + slot + DESIGNER_MENU_FMT + '~' + _sanitize(name) +
           (desc ? '\n<-2>' + desc : '');
  }

  /// A paging button, shown with `label`.
  const _navItem = (cmd, label) => '|dK' + cmd + DESIGNER_MENU_FMT + '~' + label;

  /// The same item, hidden ('-' where the format goes).
  const _hidden = (cmd) => '|dK' + cmd + '-~';

  /// What the way-out button says, which depends on which screen opened
  /// this one. A fresh Drawing item has no active item yet — it is held on
  /// state._pendingDrawingItem by addMenuItem.js and committed only once a
  /// dwg is actually picked — whereas "Change Drawing" arrives from an
  /// existing item's own editor. Sending the user to the wrong one of
  /// those, or labelling it wrongly, is worse than not offering it.
  /// @param {DesignerState} state
  /// @returns {string}
  function _parentLabel(state) {
    return state.getActiveItem() ? 'Back to Edit Menu Item' : 'Back to Add Menu Item';
  }

  /// Everything on the screen except the rows and the More button: the
  /// opening '{,', the prompt, the two (initially hidden) back buttons at
  /// the top, the Load button, and the labels.
  ///
  /// The back buttons are declared FIRST so they appear above everything
  /// else once revealed — a "Back" that has to be scrolled past a page of
  /// drawings to reach is not a back button. They are declared here, and
  /// hidden, for the same reason every other revealed item in this designer
  /// is: a {;} update can only change items the screen already carries.
  /// @param {DesignerState} state
  /// @param {number} nameCount — how many dwgs are on offer in total
  /// @returns {string}
  function _screenFixedPart(state, nameCount) {
    let out = '{,' + DESIGNER_PROMPT_FMT + '~' + designerTargetHeader(state);
    out += '<+2><b>Choose a Drawing</b></+2>\n';
    out += '<-1>Pick which dwg this menu item should open, or load one from a file.';
    out += _hidden(SDI_PARENT_CMD);
    out += _hidden(SDI_PREV_CMD);
    out += '|dK' + SDI_LOAD_FILE_CMD + DESIGNER_MENU_FMT + '~Load Dwg from File';
    out += '|!I~<y><i>Use the Load button above to load saved <b>.pfodDwg_json</b> dwg files</y>\nor use main menu\nCreate/Edit Drawings';
    if (nameCount === 0) {
      // Distinguish "genuinely nothing loaded" from "some are loaded but
      // every one is already linked elsewhere in this design" — the
      // latter would be a misleading message otherwise.
      out += (DwgLibrary.listNames().length === 0)
        ? '|!Zempty<bg 050518>~<i>No dwgs loaded yet</i>'
        : '|!Zempty<bg 050518>~<i>All loaded dwgs are already used elsewhere in this menu</i>';
    } else {
      out += '|!Zlabel~<y><i>Or choose one already loaded:';
    }
    return out;
  }

  /// Split the available dwgs into pages that each fit the byte cap.
  ///
  /// Pure function of the current library + design, deliberately: it is
  /// recomputed on every press rather than cached, because DwgLibrary can
  /// change between renders (feedback-designer-menus-no-cache) and a stale
  /// page boundary would map a row to the wrong drawing. `_page` is the
  /// only thing carried between presses.
  ///
  /// Page 0 is sized against the FULL screen — prompt, labels, buttons and
  /// all — so it is the smallest page, and its row count becomes the number
  /// of slots the screen declares. Later pages are {;} updates with far
  /// less fixed text around them, so they would fit more, but they cannot
  /// use more slots than were declared; they are capped at page 0's count.
  ///
  /// A later page that does not fill every slot has to HIDE the rest, and
  /// those hides cost bytes too — so a row is only added while the row plus
  /// the hides still owed will still fit.
  /// @param {DesignerState} state
  /// @returns {Array<{start: number, count: number}>} always at least one
  function _computePages(state) {
    const names = _listNames(state);
    if (names.length === 0) return [{ start: 0, count: 0 }];

    const hideBytes = _bytes(_hidden('99'));
    const moreBytes = _bytes(_navItem(SDI_MORE_CMD, 'More Dwgs'));
    const pages = [];
    let maxRows = 0;   // slots the screen declares; set by page 0
    let start = 0;

    while (start < names.length) {
      const first = pages.length === 0;
      // What the message costs before a single row goes in. Page 0 carries
      // the whole screen; a later page carries only the {;} and the three
      // paging buttons in their widest form.
      let used = first
        ? _bytes(_screenFixedPart(state, names.length)) + moreBytes + 1
        : _bytes('{;') + moreBytes + 1 +
          _bytes(_navItem(SDI_PARENT_CMD, _parentLabel(state))) +
          _bytes(_navItem(SDI_PREV_CMD, 'Back'));

      let count = 0;
      while (start + count < names.length) {
        if (!first && count >= maxRows) break;   // no slot left to put it in
        const rowBytes = _bytes(_rowItem(count, names[start + count]));
        // Adding this row also removes one slot from the hides still owed,
        // so its true marginal cost is rowBytes - hideBytes.
        const owed = first ? 0 : (maxRows - count - 1) * hideBytes;
        if (used + rowBytes + owed > SDI_MSG_BUDGET) break;
        used += rowBytes;
        count++;
      }
      // One name long enough to blow the whole budget on its own would
      // otherwise loop forever producing empty pages. Show it; the cap
      // truncates its description, which beats not listing it at all.
      if (count === 0) count = 1;
      if (first) maxRows = count;
      pages.push({ start, count });
      start += count;
    }
    return pages;
  }

  /// Render the full {,…} screen — page 0, with every row slot, both back
  /// buttons and (when it is not needed) the More button declared hidden.
  ///
  /// Resets to page 0: this is the only entry point that builds the screen,
  /// so it is also the only place the page number can honestly be reset.
  function _renderScreen(state) {
    _page = 0;
    const names = _listNames(state);
    const pages = _computePages(state);
    let out = _screenFixedPart(state, names.length);
    for (let j = 0; j < pages[0].count; j++) out += _rowItem(j, names[j]);
    out += (pages.length > 1) ? _navItem(SDI_MORE_CMD, 'More Dwgs') : _hidden(SDI_MORE_CMD);
    return out + '}';
  }

  /// Render the {;} update that moves to whatever `_page` now is.
  ///
  /// An update, never a screen: the client records every cmd that answers
  /// with a {,} and Back RE-SENDS the top of that stack, so a page that
  /// answered with a menu would put one nav-stack entry on the pile per
  /// press — and backing out of a five-page list would take five presses to
  /// leave a screen the user only entered once. Paging is a change to the
  /// screen already showing, and says so on the wire.
  ///
  /// Every declared item is either given its page's content or explicitly
  /// hidden. Leaving one out would leave the previous page's row sitting
  /// there, since an update only changes what it carries.
  /// @param {DesignerState} state
  /// @returns {string}
  function _pageUpdate(state) {
    const names = _listNames(state);
    const pages = _computePages(state);
    if (_page >= pages.length) _page = pages.length - 1;
    if (_page < 0) _page = 0;
    const { start, count } = pages[_page];
    const maxRows = pages[0].count;

    let out = '{;';
    // Top of the screen, and only on a page the user paged INTO — on page 0
    // the toolbar's own back arrow already leaves, and a second way out
    // sitting above the list would just be noise.
    out += (_page > 0) ? _navItem(SDI_PARENT_CMD, _parentLabel(state))
                       : _hidden(SDI_PARENT_CMD);
    out += (_page > 0) ? _navItem(SDI_PREV_CMD, 'Back') : _hidden(SDI_PREV_CMD);
    for (let j = 0; j < maxRows; j++) {
      out += (j < count) ? _rowItem(j, names[start + j]) : _hidden(String(j));
    }
    out += (_page < pages.length - 1) ? _navItem(SDI_MORE_CMD, 'More Dwgs')
                                      : _hidden(SDI_MORE_CMD);
    return out + '}';
  }

  /// The way out of a paged list: back to whichever screen opened this one,
  /// rebuilt for real rather than popped. A real navigation, so it does
  /// land on the nav stack — and it is idempotent, since re-sending it just
  /// renders that screen again.
  /// @param {DesignerState} state
  /// @returns {string}
  function _backToParent(state) {
    return state.getActiveItem()
      ? DesignerDispatch.dispatch('{d}', state, DISPATCH_ROOT_DEPTH)
      : DesignerDispatch.dispatch('{k}', state, DISPATCH_ROOT_DEPTH);
  }

  /// Point a Drawing item at `dwgName`, and carry the name across to the
  /// item's own text.
  ///
  /// A Drawing menu item's text is NOT user-editable: the item editor's
  /// drawing branch (editMenuItem.js) returns before the text-edit rows,
  /// so the only thing the text can sensibly be is the name of the dwg
  /// the item shows — and this is the one place a dwg gets linked, both
  /// on first creation and on every later "Change Drawing", so setting
  /// it here keeps the two permanently in step.
  ///
  /// The autoCmd is re-minted from the new text for exactly the reason
  /// editMenuItem.js's _applyTextField re-mints it after a text edit —
  /// the generated C++ handler is named after the item's text, so a
  /// drawing that shows TomorrowChart generates
  /// drawing_TomorrowChart_Cmd rather than the placeholder minted from
  /// the "Drawing" default before any dwg was chosen. The item itself is
  /// excluded from the uniqueness scan so re-linking the SAME dwg is a
  /// no-op instead of appending a `_2`.
  /// @param {DesignerState} state
  /// @param {Object} item     the Drawing item (already in the menu, or pending)
  /// @param {string} dwgName  DwgLibrary name of the dwg just picked/loaded
  function _setLinkedDwg(state, item, dwgName) {
    item.dwgName = dwgName;
    item.text    = dwgName;
    item.autoCmd = _makeAutoCmd(item.type, item.text,
                                state.getAllItems().filter((it) => it !== item));
  }

  /// Link `dwgName` to the right item and request a real back-navigation
  /// — '{<}' is handled specially by responseHandlers.js exactly like a
  /// press of the toolbar's own back-arrow button (pops menuNavStack and
  /// re-sends whatever's now on top), so this always lands on whichever
  /// screen genuinely led here.
  ///
  /// Two cases, distinguished by whether an item is currently active:
  ///   - state.getActiveItem() returns a real item: reached via "Change
  ///     Drawing" on an already-linked item's own editor — update it in
  ///     place.
  ///   - No active item, but state._pendingDrawingItem is set: fresh
  ///     Drawing-item creation (addMenuItem.js's IDX_DRAWING branch),
  ///     which deliberately did NOT add the item to the menu yet — commit
  ///     it for real now, for the first time, since a dwg was actually
  ///     chosen. (If the user instead presses back without reaching
  ///     here, the pending item is simply never committed — see
  ///     addMenuItem.js's own comment on _pendingDrawingItem.)
  function _linkAndReturn(state, dwgName) {
    // A Drawing item must never be created/updated with no dwg linked —
    // both call sites (an existing-dwg pick, a successful file load)
    // always pass a real, non-empty name, so this should be unreachable;
    // throw rather than silently commit a null-linked item if it ever
    // isn't.
    if (!dwgName) {
      throw new Error('[DesignerSelectDwgForItem] _linkAndReturn: dwgName must be a non-empty string, got: ' + JSON.stringify(dwgName));
    }
    const activeItem = state.getActiveItem();
    if (activeItem) {
      _setLinkedDwg(state, activeItem, dwgName);
    } else if (state._pendingDrawingItem) {
      const item = state._pendingDrawingItem;
      _setLinkedDwg(state, item, dwgName);
      const menu = state.getActiveMenu();
      menu.items.push(item);
      state.activeItemIdx = menu.items.length - 1;
    }
    state._pendingDrawingItem = null;
    state.save();
    return '{<}';
  }

  /// Open the OS file picker, validate + repair the picked dwg (same
  /// pipeline dwgDesigner/dwgControlsPanelUI.js's own Load Dwg uses),
  /// then either link it + '{<}' on success, or re-render this screen
  /// (with an alert on a genuine error) on cancel/failure. Returns a
  /// Promise — designer/index.js's processCmd already handles an async
  /// handler result transparently (mirrors loadFromFile.js's own 'L'
  /// handler exactly).
  /// @param {DesignerState} state
  /// @returns {Promise<string|{pfod, skipSave}>}
  function _loadFromFile(state) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type   = 'file';
      input.accept = '.pfodDwg_json';
      input.style.display = 'none';

      const settle = (result) => { input.remove(); resolve(result); };

      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) { settle({ pfod: PFOD_EMPTY, skipSave: true }); return; }
        const reader = new FileReader();
        reader.onload = () => {
          let parsed;
          try {
            parsed = JSON.parse(reader.result);
          } catch (err) {
            pfodAlert('"' + file.name + '" is not valid JSON and was not loaded.', () => {});
            settle({ pfod: PFOD_EMPTY, skipSave: true });
            return;
          }
          const rejectReason = dwgFileRejectReason(parsed);
          if (rejectReason) {
            pfodAlert('"' + file.name + '" ' + rejectReason + ' and was not loaded.', () => {});
            settle({ pfod: PFOD_EMPTY, skipSave: true });
            return;
          }
          // isLoad=true — this is a genuine untrusted-file load, so a duplicate
          // idxName is repaired and reported (shown below) rather than thrown.
          // Without it the throw would skip settle() and hang the queue.
          const { dwg, errors } = validateAndRepairDwg(parsed, DwgLibrary.nextFreeName(parsed.name), true);
          if (_usedOrReferencedDwgNames(state).has(dwg.name)) {
            pfodAlert('"' + _sanitize(dwg.name) + '" is already used in this menu (either loaded and ' +
              'linked to another item, or referenced but not yet loaded) and was not loaded. ' +
              'Choose a different file, or open Create/Edit Drawings and make a copy of the dwg.', () => {});
            settle({ pfod: PFOD_EMPTY, skipSave: true });
            return;
          }
          if (errors && errors.length > 0) {
            pfodAlert('"' + file.name + '" had problems that were auto-fixed:\n' +
              errors.map((e) => e.message).join('\n'), () => {});
          }
          DwgLibrary.save(dwg);
          settle({ pfod: _linkAndReturn(state, dwg.name), skipSave: false });
        };
        reader.onerror = () => {
          pfodAlert('"' + file.name + '" could not be read.', () => {});
          settle({ pfod: PFOD_EMPTY, skipSave: true });
        };
        reader.readAsText(file);
      });

      // Cancel detection: picker close restores window focus. 300 ms
      // delay lets the 'change' event (which fires first on a real pick)
      // win the race — matches loadFromFile.js's own identical guard.
      const onFocus = () => {
        window.removeEventListener('focus', onFocus);
        setTimeout(() => settle({ pfod: PFOD_EMPTY, skipSave: true }), 300);
      };
      window.addEventListener('focus', onFocus);

      document.body.appendChild(input);
      input.click();
    });
  }

  /// Dispatch handler. depth = index of 'd' in rawCmd (the SAME depth
  /// editMenuItem.js's own send() received) — 'K' sits at rawCmd[depth+1]
  /// (that's how editMenuItem.js's switch routed here), so this module's
  /// own sub-content starts at depth+2.
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth
  /// @returns {string|Promise|{pfod, skipSave}}
  function send(rawCmd, state, depth) {
    const next = rawCmd[depth + 2];
    if (next === SDI_LOAD_FILE_CMD) {
      return _loadFromFile(state);
    }
    // Both paging cmds answer with a {;}, so neither reaches menuNavStack.
    if (next === SDI_MORE_CMD) {
      _page++;
      return { pfod: _pageUpdate(state), skipSave: true };
    }
    if (next === SDI_PREV_CMD) {
      _page--;
      return { pfod: _pageUpdate(state), skipSave: true };
    }
    if (next === SDI_PARENT_CMD) {
      return _backToParent(state);
    }
    const slot = _parseIdx(rawCmd, depth + 2);
    if (slot !== null) {
      // A row's cmd is its SLOT on the page showing, not the drawing's own
      // index — the same dK3 means a different drawing on every page.
      const names = _listNames(state);
      const pages = _computePages(state);
      const page = pages[Math.min(Math.max(_page, 0), pages.length - 1)];
      const idx = page.start + slot;
      if (slot < 0 || slot >= page.count || idx >= names.length) {
        return { pfod: _renderScreen(state), skipSave: true };
      }
      return _linkAndReturn(state, names[idx]);
    }
    return { pfod: _renderScreen(state), skipSave: true };
  }

  return Object.freeze({ send });
})();
