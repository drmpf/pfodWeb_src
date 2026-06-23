/*
 * designer/menus/loadFromFile.js
 *
 * Handler for 'L' (Load Design from File) on the Edit existing Menu list.
 *
 * The list screen (selectFromMenuList.js) always renders three fixed items
 * at the top on every fresh {b} visit:
 *
 *   L  — Load Design from File button
 *   I  — instruction / status label
 *   X  — hidden nav button (initially |X-~, '-' after cmd = not visible)
 *
 * The {L} handler opens the OS file picker and, on completion, sends a
 * {;} partial update to change those three items in-place:
 *
 *   Success  → L hidden (empty label), I = "name loaded", F = clickable
 *              button with design name.  L can only be used once per
 *              visit; navigating away and back resets to the initial state.
 *   Cancel   → PFOD_EMPTY (no screen change).
 *   Error    → only I updated with the error message; L and F unchanged.
 *
 * The {F} handler (registered here, closes over _lastLoadedName): loads
 * the imported design into state and returns the editMenu screen.
 *
 * Nav-stack contract: {L} returns {;} (partial update, never pushed to
 * nav stack).  {F} returns a full menu and IS pushed; back-nav re-sends
 * {b} (the list screen), not {L} — so the file picker never reopens.
 *
 * Cancel detection: the OS picker restores window focus on dismiss;
 * a 300 ms delayed one-shot focus listener settles the Promise so the
 * queue does not hang.  The 'change' event fires first when a file is
 * picked, so the settle() guard ensures only one path wins.
 *
 * Name-collision handling: imported design with a name already in use
 * gets an auto-suffix (_2, _3, …) so it lands without overwriting.
 *
 * Origin: JS-port-only feature — not in pfodDesignerV2.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DesignerLoadFromFile = (() => {

  // Name of the most recently loaded design — used by the F handler to
  // navigate to it when the user presses the F button.
  let _lastLoadedName = '';

  /// Return `candidate`, or `candidate_2` / `candidate_3` / … if some
  /// saved design already uses that name, so the import never overwrites
  /// a live design.
  function _ensureUniqueName(candidate) {
    const taken = new Set(DesignerState.listNames());
    if (!taken.has(candidate)) return candidate;
    for (let n = 2; ; n++) {
      const tryName = candidate + '_' + n;
      if (!taken.has(tryName)) return tryName;
    }
  }

  /// Build the {;} success string: hides L, updates I with green bold
  /// name + italic "loaded" + yellow hint, and makes F a visible clickable button.
  function _successUpdate(name) {
    const safe = name.replace(/[|~{}]/g, '_');
    return '{;|L-~|!I~<g><b>' + safe + '</b> <i>loaded\n<y><-1>Refresh this screen to load another menu|X' + DESIGNER_MENU_FMT + '~' + safe + '|!Zempty-~}';
  }

  /// Build the {;} error string: updates I with red bold name, newline,
  /// then italic "failed to load" and reasserts |F-~ to keep F hidden.
  function _errorUpdate(name) {
    const safe = (name || 'File').replace(/[|~{}]/g, '_');
    return '{;|!I~<r><b>' + safe + '</b>\n<i>failed to load|X-~}';
  }

  /// Parse + validate + import the file text.  Returns a {pfod, skipSave}
  /// object ready to pass to settle().  MUST always return a value.
  /// fileName is the OS filename (e.g. "Menu_1.pfodDesigner_json") used in
  /// early-failure messages before the JSON name can be read.
  function _ingestText(state, text, fileName) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      return { pfod: _errorUpdate(fileName || 'File'), skipSave: true };
    }

    const incomingName = (parsed && typeof parsed.name === 'string')
                       ? parsed.name : 'Imported';
    const finalName    = _ensureUniqueName(incomingName);

    // importFromObject error contracts:
    //   HARD    — err.partial unset; state NOT modified.  Update I with error.
    //   PARTIAL — err.partial === true; state IS applied with defaults.
    //             Show pfodAlert about the data quality, then treat as success.
    let partialErr = null;
    try {
      state.importFromObject(parsed, finalName);
    } catch (err) {
      if (!err.partial) {
        return { pfod: _errorUpdate(incomingName), skipSave: true };
      }
      partialErr = err;
    }

    if (partialErr) {
      pfodAlert('Design loaded, but some fields had errors:\n' + partialErr.message, () => {});
    }

    // Record for the F handler, then signal success.
    // skipSave: false — auto-save persists the imported design.
    _lastLoadedName = finalName;
    return { pfod: _successUpdate(finalName), skipSave: false };
  }

  /// Create a hidden <input type="file">, click it, and call settle()
  /// exactly once with a {pfod, skipSave} object when done.
  function _openPicker(state, settle) {
    const input  = document.createElement('input');
    input.type   = 'file';
    input.accept = '.pfodDesigner_json';
    input.style.display = 'none';

    input.addEventListener('change', (evt) => {
      input.remove();
      const file = evt.target.files && evt.target.files[0];
      if (!file) { settle({ pfod: PFOD_EMPTY, skipSave: true }); return; }

      const reader = new FileReader();
      reader.onload  = () => settle(_ingestText(state, reader.result, file.name));
      reader.onerror = () => settle({ pfod: _errorUpdate(file.name), skipSave: true });
      reader.readAsText(file);
    });

    // Cancel detection: picker close restores window focus.  300 ms delay
    // lets the 'change' event (which fires first) win the race on success.
    const onFocus = () => {
      window.removeEventListener('focus', onFocus);
      setTimeout(() => settle({ pfod: PFOD_EMPTY, skipSave: true }), 300);
    };
    window.addEventListener('focus', onFocus);

    document.body.appendChild(input);
    input.click();
  }

  /// Dispatch handler for 'L'.  Returns a Promise that resolves when
  /// the file picker completes (success, error, or cancel).
  ///
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth
  /// @returns {Promise<{pfod, skipSave}>}
  function send(rawCmd, state, depth) {
    let settled = false;
    return new Promise(resolve => {
      const settle = (obj) => { if (!settled) { settled = true; resolve(obj); } };
      _openPicker(state, settle);
    });
  }

  // Register 'X' inside the IIFE to close over _lastLoadedName.
  // When the user presses the X button (made clickable by the {;} success
  // update), load the named design and return the editMenu screen.
  DesignerDispatch.add('X', (rawCmd, state, depth) => {
    if (!_lastLoadedName) return PFOD_EMPTY;
    const names = DesignerState.listNames();
    if (!names.includes(_lastLoadedName)) return PFOD_EMPTY;
    state.loadNamed(_lastLoadedName);
    return DesignerEditMenu.send(state);
  });

  return Object.freeze({ send });
})();

// Self-register 'L' into the top-level designer dispatcher.
DesignerDispatch.add('L', DesignerLoadFromFile.send);
