/*
 * designer/menus/saveToFile.js
 *
 * Handler for the 'S' (saveToFileCmd) item on the editMenu screen:
 * downloads the currently-active design.  Two shapes, picked by whether
 * there is any dwg content to carry alongside the design itself:
 *
 *   - No linked dwgs → a bare `<name>.pfodMenu_json`
 *     (DesignerState.exportToJSON()).  A design that references no
 *     drawings is entirely self-contained, so there is nothing for a zip
 *     to add — it would just be an extra unzip step before the user can
 *     see or pass on the json.  Matches the dwg designer's own
 *     single-file export (dwgControlsPanelUI.js's _downloadDwgAsJson).
 *
 *   - One or more linked dwgs → a `<name>_menuJson.zip` holding the
 *     design's own `.pfodMenu_json` plus every dwg any Drawing menu item
 *     links to (recursively including whatever each reaches via
 *     insertDwg), each as its own `.pfodDwg_json` (dwgLibrary.js's
 *     buildSaveableDwg()) — so the design is portable on its own without
 *     depending on the browser's local DwgLibrary storage still having
 *     those dwgs loaded.  Everything sits under one top-level
 *     `<name>_menuJson/` directory in the zip (dwgs in a `dwgs/`
 *     subdirectory), matching Generate Code's own "one dir so the zip
 *     extracts to something self-contained" convention
 *     (dwgArduinoExport.js's own `<name>_serial/`).
 *
 * The menu json is byte-identical either way, so the two shapes are
 * interchangeable on load — loadFromFile.js accepts both.
 *
 * Why on the editMenu (not main menu): Save operates on the active
 * design.  Main menu always clears state.name on entry so there's no
 * "active design" there.  Load lives on the main menu instead — it
 * brings a design INTO the list rather than acting on an existing one.
 *
 * Return shape: PFOD_EMPTY ({}).  Two consequences:
 *   - pfodWeb does NOT push `{S}` onto menuNavStack, so back-nav from
 *     editMenu still pops directly to whatever opened editMenu in the
 *     first place (matches the Save side-effect being "fire and stay
 *     here").  See feedback-designer-textinput-accept-empty.md.
 *   - State isn't mutated, so the dispatcher's auto-save would no-op
 *     anyway; skipSave:true is set explicitly to make intent obvious
 *     and to short-circuit even the unconditional save path.
 *
 * Re-fire safety: a back-nav can't reach this cmd (no push on the
 * nav stack) and a repeat user click downloads identical bytes —
 * harmless even if it happens.
 *
 * Origin: NOT in pfodDesignerV2 (Android pfodDesigner didn't need a
 * file-export path — Android storage is per-app).  JS-port-only.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DesignerSaveToFile = (() => {

  /// Walk `menu` (rootMenu or any subMenu, recursing into every nested
  /// sub-menu's own items) collecting every Drawing item's dwgName, each
  /// expanded via DwgArduinoExport.collectAllDwgs (dwgArduinoExport.js)
  /// into the full set of dwgs it reaches via insertDwg too — accumulates
  /// into the SAME `collected` Set / `missing` array across every call so
  /// dwgs linked from different menu items (or different sub-menus) that
  /// happen to share an insertDwg dependency are only collected once.
  /// @param {object} menu
  /// @param {Set<string>} collected
  /// @param {Array<string>} missing
  function _collectMenuDwgs(menu, collected, missing) {
    menu.items.forEach((item) => {
      if (item.type === 'drawing' && item.dwgName) {
        DwgArduinoExport.collectAllDwgs(item.dwgName, collected, missing);
      } else if (item.type === 'submenu' && item.subMenu) {
        _collectMenuDwgs(item.subMenu, collected, missing);
      }
    });
  }

  /// Build the zip (design .pfodMenu_json + every linked dwg's own
  /// .pfodDwg_json) and trigger the download via DesignerZipBuilder
  /// (designer/menus/zipBuilder.js) — same STORE-only writer + Windows
  /// zone-block overlay Generate Code already uses.  Warns (but still
  /// proceeds — the menu itself is always fully valid) when a linked
  /// dwg isn't currently loaded in DwgLibrary, so its content can't be
  /// included this time.
  ///
  /// URL.revokeObjectURL (inside triggerDownload) is deferred via
  /// setTimeout so the browser has finished the download initiation
  /// before the URL is released — revoking synchronously after .click()
  /// races with some browsers and produces an empty file.
  /// Filesystem-safe form of the design name for the zip's own top
  /// directory / file names below — state.name is free text and stays
  /// as-is everywhere else (e.g. inside the JSON `name` field itself).
  /// Matches generateCode.js's own _cppId.
  function _fileNameId(s) {
    let id = (s || '').replace(/[^A-Za-z0-9]/g, '_');
    if (id && /^[0-9]/.test(id)) id = '_' + id;
    return id || 'Menu';
  }

  /// Trigger a browser download of `json` as a bare `<fileName>.pfodMenu_json`
  /// — the no-linked-dwgs case.  Same Blob + object-URL + synthetic-anchor
  /// pattern deleteEmptyMenuList.js's _downloadBeforeDelete and
  /// dwgControlsPanelUI.js's _downloadDwgAsJson already use for this file
  /// type.  Deliberately NOT DesignerZipBuilder.triggerDownload: that one
  /// hardcodes application/zip and, on Windows, pops the "right-click →
  /// Unblock" overlay, which is meaningless for a plain json.
  /// revokeObjectURL is deferred for the same reason as the zip path — see
  /// the note above.
  /// @param {string} fileName — filesystem-safe name, no extension
  /// @param {string} json
  function _triggerJsonDownload(fileName, json) {
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = fileName + '.pfodMenu_json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /// Collect the design's linked dwgs, then download it in whichever of
  /// the two shapes fits — bare .pfodMenu_json when there is no dwg
  /// content to carry, otherwise the .zip bundle described above.
  /// @param {DesignerState} state
  function _triggerDownload(state) {
    const collected = new Set();
    const missing = [];
    _collectMenuDwgs(state.rootMenu, collected, missing);

    if (missing.length > 0) {
      alert('Warning: ' + missing.length + ' referenced dwg(s) are not currently loaded ' +
        'and will be missing from the saved file:\n' + missing.join(', '));
    }

    const fileName = _fileNameId(state.name);

    // Nothing to bundle — save the design on its own.  Note this also
    // covers "the design DOES link dwgs but none of them are currently
    // loaded" (collected empty, missing non-empty): the warning above has
    // already fired and there is no dwg content available to carry, so a
    // zip would hold exactly the same single json entry.
    if (collected.size === 0) {
      _triggerJsonDownload(fileName, state.exportToJSON());
      return;
    }

    const topDir = fileName + '_menuJson/';
    const enc = new TextEncoder();
    const entries = [
      { path: topDir + fileName + '.pfodMenu_json', data: enc.encode(state.exportToJSON()) },
    ];
    Array.from(collected).forEach((name) => {
      const dwg = DwgLibrary.get(name);
      entries.push({
        path: topDir + 'dwgs/' + name + '.pfodDwg_json',
        data: enc.encode(JSON.stringify(buildSaveableDwg(dwg), null, 2)),
      });
    });

    const zipBytes = DesignerZipBuilder.buildZip(entries);
    DesignerZipBuilder.triggerDownload(fileName + '_menuJson.zip', zipBytes);
  }

  /// Dispatch handler.  Save only ever fires from the editMenu screen
  /// where state.name is guaranteed set; the empty-name check is
  /// defensive against future call paths that might reach `{S}` from
  /// outside that flow.
  ///
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth
  /// @returns {{pfod: string, skipSave: boolean}}
  function send(rawCmd, state, depth) {
    if (!state.name) {
      return { pfod: PFOD_EMPTY, skipSave: true };
    }
    _triggerDownload(state);
    return { pfod: PFOD_EMPTY, skipSave: true };
  }

  return Object.freeze({ send });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('S', DesignerSaveToFile.send);
