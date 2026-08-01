/*
 * designer/menus/missingDwgPrompt.js
 *
 * "Missing Drawings" screen — shown right after a menu design is loaded
 * (Edit existing Menu list pick, or Load Design from File) when any
 * Drawing-type menu item's own dwgName (or any insertDwg it reaches) isn't
 * currently loaded in DwgLibrary. Prompts to load each missing dwg from
 * its own `.pfodDwg_json` file, or skip and continue into the menu editor
 * — an unresolved Drawing item then just shows the "not loaded" preview
 * placeholder (previewMenu.js's own _renderNotLoadedDrawing) until it's
 * linked.
 *
 * Entry point: DesignerMissingDwgPrompt.maybeShow(state) — returns the
 * prompt screen (a raw pfod string) when anything is missing, or null
 * when the design is already fully satisfied, so callers compose it as:
 *   return DesignerMissingDwgPrompt.maybeShow(state) || DesignerEditMenu.send(state);
 * (selectFromMenuList.js's _switchAndReturnMain, loadFromFile.js's 'X'
 * handler — both right after state.loadNamed()).
 *
 * Missing list is recomputed FRESH on every render (never cached) — same
 * "DwgLibrary can change between renders" rationale as selectDwgForItem.js
 * (see feedback-designer-menus-no-cache): loading one missing dwg here can
 * itself reveal further missing dwgs (its own insertDwg children), which
 * only become visible once that parent dwg is actually in DwgLibrary —
 * DwgArduinoExport.collectAllDwgs can't see inside a dwg it hasn't loaded.
 * Re-rendering this same screen after each successful load naturally
 * surfaces those, satisfying "inserted dwgs as well if any" without any
 * extra bookkeeping.
 *
 * Command flow ({m} owns this screen):
 *   {m}       → render (or, if nothing is missing any more, the caller's
 *               next {m} render naturally returns an empty list — see
 *               _renderScreen's own doc for why that still renders a
 *               screen rather than silently falling through)
 *   {m<n>}    → open the OS file picker for missing[n]; success forces
 *               the loaded dwg's name to match that exact missing name
 *               (the menu's own Drawing item already references it by
 *               that name — matches loadFromFile.js's own zip-dwg-load
 *               convention of keeping names exactly as referenced),
 *               then re-renders this screen. Cancel/error re-renders
 *               unchanged (with an alert on a genuine error).
 *   {mC}      → Continue without loading — returns the editMenu screen
 *               directly, leaving whatever's still missing unresolved.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DesignerMissingDwgPrompt = (() => {

  // Sub-byte for the "Continue without loading" button — non-digit so
  // _parseIdx (which only reads decimal digits) never confuses it with a
  // row index. Matches selectDwgForItem.js's own SDI_LOAD_FILE_CMD pattern.
  const MDP_CONTINUE_CMD = 'C';

  /// Read a non-negative decimal integer starting at rawCmd[startIdx];
  /// stops at the first non-digit. Returns int or null when no digits.
  /// Matches selectDwgForItem.js's own _parseIdx exactly.
  function _parseIdx(rawCmd, startIdx) {
    let s = '';
    for (let i = startIdx; i < rawCmd.length; i++) {
      const c = rawCmd[i];
      if (c >= '0' && c <= '9') s += c;
      else break;
    }
    return s.length > 0 ? parseInt(s, 10) : null;
  }

  /// Strip pfod delimiter characters so a dwg's own name can never
  /// corrupt the wire message it's embedded in — matches
  /// selectDwgForItem.js's own _sanitize.
  function _sanitize(s) {
    return String(s || '').replace(/[|~`{}]/g, '_');
  }

  /// Every dwg name directly referenced by some Drawing menu item
  /// anywhere in the design (any menu/sub-menu, unlimited depth — same
  /// state.getAllItems() walk selectDwgForItem.js's own _usedDwgNames
  /// uses) that ISN'T currently loaded in DwgLibrary, expanded through
  /// DwgArduinoExport.collectAllDwgs so a missing dwg's own missing
  /// insertDwg children (once IT is loaded) are found too. De-duplicated,
  /// original-encounter order.
  /// @param {DesignerState} state
  /// @returns {string[]}
  function _missingNames(state) {
    const collected = new Set();
    const missing = [];
    for (const item of state.getAllItems()) {
      if (item.type === 'drawing' && item.dwgName) {
        DwgArduinoExport.collectAllDwgs(item.dwgName, collected, missing);
      }
    }
    return Array.from(new Set(missing));
  }

  /// Render the full {,...} screen, or null if nothing is currently
  /// missing (caller falls through to the editMenu screen in that case
  /// — see maybeShow).
  /// @param {DesignerState} state
  /// @returns {string|null}
  function _renderScreen(state) {
    const missing = _missingNames(state);
    if (missing.length === 0) return null;
    let out = '{,' + DESIGNER_PROMPT_FMT + '~' + designerTargetHeader(state);
    out += '<+2><b>Missing Drawings</b></+2>\n';
    out += '<-1>This menu links to the following dwg(s), which aren\'t currently loaded. ' +
           'Load each from its own <b>.pfodDwg_json</b> file, or skip — an unresolved ' +
           'drawing just shows a placeholder until you link it from its own item editor.';
    missing.forEach((name, idx) => {
      out += '|m' + idx + DESIGNER_MENU_FMT + '~Load\n<r>' + _sanitize(name) + '</r>\ndwg';
    });
    out += '|m' + MDP_CONTINUE_CMD + DESIGNER_MENU_FMT + '~Continue without loading';
    out += '}';
    return out;
  }

  /// Open the OS file picker for the missing[idx] slot, validate + repair
  /// the picked dwg (same pipeline selectDwgForItem.js's own Load Dwg
  /// uses), force its name to match the expected missing name (the
  /// menu's own Drawing item(s) already reference it by that exact
  /// name — whatever name is inside the picked file is irrelevant to
  /// which reference it's filling), save it, then re-render this screen
  /// so any newly-surfaced missing insertDwg children (or remaining
  /// rows) show up. Cancel/error re-renders unchanged (with an alert on
  /// a genuine error) instead of navigating. skipSave:true throughout —
  /// this module never mutates `state` itself, only DwgLibrary (which
  /// persists independently to its own localStorage key — see
  /// dwgLibrary.js's own save()), so there's nothing on `state` for
  /// DesignerVirtualDevice's auto-save to usefully persist here.
  /// @param {DesignerState} state
  /// @param {string} expectedName
  /// @returns {Promise<{pfod: string, skipSave: boolean}>}
  function _loadMissingDwg(state, expectedName) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type   = 'file';
      input.accept = '.pfodDwg_json';
      input.style.display = 'none';

      const settle = (result) => { input.remove(); resolve(result); };
      const stay   = () => ({
        pfod: _renderScreen(state) || DesignerEditMenu.send(state),
        skipSave: true,
      });

      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        if (!file) { settle(stay()); return; }
        const reader = new FileReader();
        reader.onload = () => {
          let parsed;
          try {
            parsed = JSON.parse(reader.result);
          } catch (err) {
            pfodAlert('"' + file.name + '" is not valid JSON and was not loaded.', () => {});
            settle(stay());
            return;
          }
          if (!looksLikeDwgFile(parsed)) {
            pfodAlert('"' + file.name + '" does not look like a valid dwg file (missing "format": "pfodDwgDesigner") and was not loaded.', () => {});
            settle(stay());
            return;
          }
          const { dwg, errors } = validateAndRepairDwg(parsed, expectedName);
          dwg.name = expectedName; // fill this exact reference, regardless of the file's own name
          if (errors && errors.length > 0) {
            pfodAlert('"' + file.name + '" had problems that were auto-fixed:\n' +
              errors.map((e) => e.message).join('\n'), () => {});
          }
          DwgLibrary.save(dwg);
          settle(stay());
        };
        reader.onerror = () => {
          pfodAlert('"' + file.name + '" could not be read.', () => {});
          settle(stay());
        };
        reader.readAsText(file);
      });

      // Cancel detection: picker close restores window focus. 300 ms
      // delay lets the 'change' event (which fires first on a real pick)
      // win the race — matches selectDwgForItem.js's own identical guard.
      const onFocus = () => {
        window.removeEventListener('focus', onFocus);
        setTimeout(() => settle(stay()), 300);
      };
      window.addEventListener('focus', onFocus);

      document.body.appendChild(input);
      input.click();
    });
  }

  /// Entry point for callers right after loading a design. Returns a raw
  /// pfod string (the prompt screen) when anything is missing, or null
  /// when the design is already fully satisfied — compose as
  /// `maybeShow(state) || DesignerEditMenu.send(state)`.
  /// @param {DesignerState} state
  /// @returns {string|null}
  function maybeShow(state) {
    return _renderScreen(state);
  }

  /// Dispatch handler. depth = index of 'm' in rawCmd. Render-only paths
  /// return skipSave:true (see _loadMissingDwg's own doc on why); the
  /// Continue button returns a bare string, matching how editMenu is
  /// reached normally elsewhere (selectFromMenuList.js, loadFromFile.js),
  /// so auto-save still runs on that real navigation.
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth
  /// @returns {string|{pfod,skipSave}|Promise<{pfod,skipSave}>}
  function send(rawCmd, state, depth) {
    const next = rawCmd[depth + 1];
    if (next === MDP_CONTINUE_CMD) {
      return DesignerEditMenu.send(state);
    }
    const idx = _parseIdx(rawCmd, depth + 1);
    if (idx !== null) {
      const missing = _missingNames(state);
      if (idx < 0 || idx >= missing.length) {
        return { pfod: _renderScreen(state) || DesignerEditMenu.send(state), skipSave: true };
      }
      return _loadMissingDwg(state, missing[idx]);
    }
    return { pfod: _renderScreen(state) || DesignerEditMenu.send(state), skipSave: true };
  }

  return Object.freeze({ send, maybeShow });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('m', DesignerMissingDwgPrompt.send);
