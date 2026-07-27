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
 *   {dK}      → render the full screen
 *   {dK<n>}   → pick DwgLibrary.listNames()[n] as the item's dwgName,
 *               then return '{<}' — a real back-navigation request
 *               (same as the toolbar's own back-arrow button; see
 *               responseHandlers.js's own '{<' handling), landing on
 *               whatever screen genuinely led here.
 *   {dKL}     → open the OS file picker; a successfully loaded dwg
 *               becomes the item's dwgName, then '{<}' as above.
 *               Cancel/error/invalid-file re-render this same screen in
 *               place (with an alert on error) instead of navigating.
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

  /// Render the full {,...} screen: Load Dwg from File button, then one
  /// button per available DwgLibrary entry (see _listNames) showing its
  /// name + description.
  function _renderScreen(state) {
    const names = _listNames(state);
    let out = '{,' + DESIGNER_PROMPT_FMT + '~' + designerTargetHeader(state);
    out += '<+2><b>Choose a Drawing</b></+2>\n';
    out += '<-1>Pick which dwg this menu item should open, or load one from a file.';
    out += '|dK' + SDI_LOAD_FILE_CMD + DESIGNER_MENU_FMT + '~Load Dwg from File';
    out += '|!I~<y><i>Use the Load button above to load saved <b>.pfodDwg_json</b> dwg files';
    if (names.length === 0) {
      // Distinguish "genuinely nothing loaded" from "some are loaded but
      // every one is already linked elsewhere in this design" — the
      // latter would be a misleading message otherwise.
      out += (DwgLibrary.listNames().length === 0)
        ? '|!Zempty<bg 050518>~<i>No dwgs loaded yet</i>'
        : '|!Zempty<bg 050518>~<i>All loaded dwgs are already used elsewhere in this menu</i>';
    } else {
      out += '|!Zlabel~<y><i>Or choose one already loaded:';
      names.forEach((name, idx) => {
        const dwg  = DwgLibrary.get(name);
        const desc = (dwg && dwg.description) ? _sanitize(dwg.description) : '';
        out += '|dK' + idx + DESIGNER_MENU_FMT + '~' + _sanitize(name) +
               (desc ? '\n<-2>' + desc : '');
      });
    }
    out += '}';
    return out;
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
      activeItem.dwgName = dwgName;
    } else if (state._pendingDrawingItem) {
      const item = state._pendingDrawingItem;
      item.dwgName = dwgName;
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
        if (!file) { settle({ pfod: _renderScreen(state), skipSave: true }); return; }
        const reader = new FileReader();
        reader.onload = () => {
          let parsed;
          try {
            parsed = JSON.parse(reader.result);
          } catch (err) {
            pfodAlert('"' + file.name + '" is not valid JSON and was not loaded.', () => {});
            settle({ pfod: _renderScreen(state), skipSave: true });
            return;
          }
          if (!looksLikeDwgFile(parsed)) {
            pfodAlert('"' + file.name + '" does not look like a valid dwg file (missing "format": "pfodDwgDesigner") and was not loaded.', () => {});
            settle({ pfod: _renderScreen(state), skipSave: true });
            return;
          }
          const { dwg, errors } = validateAndRepairDwg(parsed, DwgLibrary.nextFreeName(parsed.name));
          if (errors && errors.length > 0) {
            pfodAlert('"' + file.name + '" had problems that were auto-fixed:\n' +
              errors.map((e) => e.message).join('\n'), () => {});
          }
          DwgLibrary.save(dwg);
          settle({ pfod: _linkAndReturn(state, dwg.name), skipSave: false });
        };
        reader.onerror = () => {
          pfodAlert('"' + file.name + '" could not be read.', () => {});
          settle({ pfod: _renderScreen(state), skipSave: true });
        };
        reader.readAsText(file);
      });

      // Cancel detection: picker close restores window focus. 300 ms
      // delay lets the 'change' event (which fires first on a real pick)
      // win the race — matches loadFromFile.js's own identical guard.
      const onFocus = () => {
        window.removeEventListener('focus', onFocus);
        setTimeout(() => settle({ pfod: _renderScreen(state), skipSave: true }), 300);
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
    const idx = _parseIdx(rawCmd, depth + 2);
    if (idx !== null) {
      const names = _listNames(state);
      if (idx < 0 || idx >= names.length) return { pfod: _renderScreen(state), skipSave: true };
      return _linkAndReturn(state, names[idx]);
    }
    return { pfod: _renderScreen(state), skipSave: true };
  }

  return Object.freeze({ send });
})();
