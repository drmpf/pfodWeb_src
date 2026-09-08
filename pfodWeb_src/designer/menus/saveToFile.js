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
 *   - One or more linked dwgs → a `<name>_menuJson.zip`:
 *
 *         <name>.pfodMenu_json
 *         dwgs/<dwg>.pfodDwg_json      one per linked drawing
 *
 *     covering every dwg any Drawing menu item links to, recursively
 *     including whatever each reaches via insertDwg, each written by
 *     dwgLibrary.js's buildSaveableDwg() — so the design is portable on
 *     its own without depending on the browser's local DwgLibrary storage
 *     still having those dwgs loaded.
 *
 * The menu json is byte-identical either way, so the two shapes are
 * interchangeable on load — loadFromFile.js has a button for each.
 *
 * Generate Code puts whichever of the two applies into its sketch's own
 * `menujson/` directory (see generateCode.js), so the design that produced
 * a sketch travels with it as the same one file the user could have saved.
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

  /// Build the design's portable bundle, in whichever of the two shapes
  /// fits — WITHOUT downloading it.
  ///
  /// This is the one place either shape is decided, because it now has two
  /// callers: Save Design downloads what comes back, and Generate Code
  /// drops it into the sketch's own `json/` directory. That is the point of
  /// having it here — a design's bundle is the same artifact whichever
  /// command produced it, so "Load Design from .zip" can read a zip pulled
  /// out of a generated sketch exactly as if it had been saved directly.
  ///
  /// @param {DesignerState} state
  /// @param {string} fileName — filesystem-safe base name, no extension
  /// @returns {{name: string, bytes: Uint8Array, isZip: boolean,
  ///            dwgNames: string[], missing: string[]}}
  ///          `name` carries the right extension for the shape chosen;
  ///          `missing` lists dwgs the design references that are not
  ///          currently loaded, so their content could not be carried.
  function buildBundle(state, fileName) {
    const collected = new Set();
    const missing = [];
    _collectMenuDwgs(state.rootMenu, collected, missing);
    const bundle = buildBundleFrom(fileName, state.exportToJSON(), Array.from(collected));
    bundle.missing = missing;
    return bundle;
  }

  /// The same two shapes, built from the PARTS rather than from a
  /// DesignerState — for a caller that has a design and a drawing list but
  /// no live state to hand.
  ///
  /// The Dwg Designer's own "Generate Code - Serial" is that caller: it
  /// synthesises a one-item wrapper design around the drawing being
  /// exported (dwgArduinoExport.js's _generateWrapperMenuJSON) and has no
  /// DesignerState of its own. It used to lay its json out flat and by
  /// hand, which is how it ended up writing a shape no loader would take.
  /// There is one definition of the layout, and this is it.
  ///
  /// @param {string} fileName — filesystem-safe base name, no extension
  /// @param {string} menuJson — the design, already serialised
  /// @param {string[]} dwgNames — every drawing to carry, already resolved
  ///        (each must be in DwgLibrary; a name that is not is skipped)
  /// @returns {{name, bytes, isZip, dwgNames, missing}}
  function buildBundleFrom(fileName, menuJson, dwgNames) {
    const enc = new TextEncoder();
    const present = (dwgNames || []).filter((n) => DwgLibrary.get(n));

    // Nothing to carry — the design on its own. A lone .pfodMenu_json holds
    // exactly the same bytes and costs the reader no unzip. This also
    // covers "links drawings, but none are loaded": there is no content
    // available either way.
    if (present.length === 0) {
      return { name: fileName + '.pfodMenu_json', bytes: enc.encode(menuJson),
               isZip: false, dwgNames: [], missing: [] };
    }

    // The layout itself, and the only place it is written down:
    //
    //   <fileName>.pfodMenu_json     the design, at the root
    //   dwgs/<dwg>.pfodDwg_json      one per drawing it carries
    //
    // Two levels of wrapper directory used to sit above that
    // (`Menu_1_menuJson/json/`), which meant three clicks to reach the one
    // file a person opening the zip is looking for. The zip's own name
    // already says what it is, and every extractor offers to make a folder
    // from it, so the outer directory did nothing the file name did not.
    //
    // Nothing PARSES these paths — the reader matches on position — so the
    // layout exists to be legible to a person who unzips it.
    const entries = [{ path: fileName + '.pfodMenu_json', data: enc.encode(menuJson) }];
    present.forEach((name) => {
      entries.push({
        path: 'dwgs/' + name + '.pfodDwg_json',
        data: enc.encode(JSON.stringify(buildSaveableDwg(DwgLibrary.get(name)), null, 2)),
      });
    });

    return {
      name: fileName + '_menuJson.zip',
      bytes: DesignerZipBuilder.buildZip(entries),
      isZip: true, dwgNames: present, missing: [],
    };
  }

  /// A DRAWING and everything it inserts — the Dwg Controls Panel's
  /// "Save Dwg".
  ///
  /// A drawing that inserts nothing is one self-contained `.pfodDwg_json`,
  /// exactly as Export Dwg always wrote. One that inserts others cannot
  /// be: handing it over alone means handing over a lead file plus a hunt
  /// for its parts, and nothing says the parts are missing until it is
  /// loaded somewhere and comes up short.
  ///
  /// So the multi-drawing case is a `<name>_menuJson.zip` — an ORDINARY
  /// design bundle, not a shape of its own. The drawing and everything it
  /// reaches go under `dwgs/`, and at the root is a trivial one-item
  /// design that displays the drawing, built by the same
  /// DwgArduinoExport.buildWrapperMenuJSON that Generate Code - Serial
  /// wraps a drawing in.
  ///
  /// That wrapper is what makes it load. A zip whose root held a drawing
  /// instead would have been a third bundle shape, needing its own branch
  /// in the reader and its own handling in every loader — for a file that
  /// already has a perfectly good representation. With the wrapper it goes
  /// through the ordinary path: the drawings land in DwgLibrary, and the
  /// design lands in the menu list where opening it shows the drawing.
  ///
  /// An inserted drawing that is not currently loaded cannot be carried
  /// and is reported in `missing` for the caller to say so.
  ///
  /// @param {string} fileName — filesystem-safe base name, no extension
  /// @param {string} dwgName — the drawing being saved, as named in DwgLibrary
  /// @returns {{name, bytes, isZip, dwgNames, missing}}
  function buildDwgBundle(fileName, dwgName) {
    const collected = new Set();
    const missing = [];
    DwgArduinoExport.collectAllDwgs(dwgName, collected, missing);

    // Inserts nothing (itself is all collectAllDwgs found): the drawing on
    // its own, with no zip and no wrapper design to explain.
    if (collected.size <= 1) {
      const only = DwgLibrary.get(dwgName);
      return {
        name: fileName + '.pfodDwg_json',
        bytes: new TextEncoder().encode(JSON.stringify(buildSaveableDwg(only), null, 2)),
        isZip: false, dwgNames: [], missing,
      };
    }

    // The drawing itself is carried under dwgs/ like any other — the root
    // is the wrapper design, so this is a design bundle in every respect.
    const wrapper = DwgArduinoExport.buildWrapperMenuJSON(dwgName, fileName);
    const bundle = buildBundleFrom(fileName, wrapper, Array.from(collected));
    bundle.missing = missing;
    return bundle;
  }

  /// Trigger a browser download of a bare `.pfodMenu_json` — the
  /// no-linked-dwgs case.  Same Blob + object-URL + synthetic-anchor
  /// pattern deleteEmptyMenuList.js's _downloadBeforeDelete and
  /// dwgControlsPanelUI.js's _downloadDwgAsJson already use for this file
  /// type.  Deliberately NOT DesignerZipBuilder.triggerDownload: that one
  /// hardcodes application/zip and, on Windows, pops the "right-click →
  /// Unblock" overlay, which is meaningless for a plain json.
  /// revokeObjectURL is deferred for the same reason as the zip path — see
  /// the note above.
  /// @param {string} name — full file name, extension included
  /// @param {Uint8Array} bytes
  function _triggerJsonDownload(name, bytes) {
    const blob = new Blob([bytes], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /// Download the design in whichever of the two shapes buildBundle chose.
  ///
  /// Returns what to say about it rather than saying it: a missing dwg used
  /// to raise a native alert(), which browser automation cannot dismiss —
  /// it would stop a scripted run dead over a warning, after the file had
  /// already been written.  The caller puts this on the editMenu status
  /// label instead (see editMenu.js's statusUpdate).
  ///
  /// @param {DesignerState} state
  /// @returns {{text: string, level: string}}
  function _triggerDownload(state) {
    const bundle = buildBundle(state, _fileNameId(state.name));

    if (bundle.isZip) {
      DesignerZipBuilder.triggerDownload(bundle.name, bundle.bytes);
    } else {
      _triggerJsonDownload(bundle.name, bundle.bytes);
    }

    if (bundle.missing.length > 0) {
      return {
        text: 'Saved ' + bundle.name + '\n' + bundle.missing.length +
              ' referenced dwg(s) are not loaded and are missing from it:\n' +
              bundle.missing.join(', '),
        level: 'warn'
      };
    }
    return { text: 'Saved ' + bundle.name, level: 'ok' };
  }

  /// Dispatch handler.  Save only ever fires from the editMenu screen
  /// where state.name is guaranteed set; the empty-name check is
  /// defensive against future call paths that might reach `{S}` from
  /// outside that flow.
  ///
  /// Answers with a {;} carrying the outcome, not {} — a {;} updates the
  /// screen already showing without pushing anything onto menuNavStack, so
  /// "fire and stay here" still holds.
  ///
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth
  /// @returns {{pfod: string, skipSave: boolean}}
  function send(rawCmd, state, depth) {
    if (!state.name) {
      return { pfod: PFOD_EMPTY, skipSave: true };
    }
    const status = _triggerDownload(state);
    return {
      pfod: DesignerEditMenu.statusUpdate(status.text, status.level),
      skipSave: true
    };
  }

  // buildBundle is exported for generateCode.js and buildBundleFrom for
  // dwgArduinoExport.js — both put the same artifact under their sketch's
  // own menujson/ directory, so there is one definition of the layout.
  // collectMenuDwgs goes out for designer/targetPrompt.js, which bundles a
  // design it holds as stored bytes rather than as a live state, so it
  // cannot use buildBundle and needs the drawing list separately.
  return Object.freeze({ send, buildBundle, buildBundleFrom, buildDwgBundle,
                         collectMenuDwgs: _collectMenuDwgs });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('S', DesignerSaveToFile.send);
