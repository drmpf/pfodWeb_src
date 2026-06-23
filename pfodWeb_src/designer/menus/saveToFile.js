/*
 * designer/menus/saveToFile.js
 *
 * Handler for the 'S' (saveToFileCmd) item on the editMenu screen:
 * downloads the currently-active design as a JSON file using the
 * pre-built DesignerState.exportToBlob() serialiser.  Triggers a
 * browser download via a transient `<a download>` element — no DOM
 * residue and no server round-trip.
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

  /// Build a Blob URL from state.exportToBlob(), trigger a download
  /// via a hidden anchor click, then clean up.  Filename is the
  /// design's name with the canonical `.pfodDesigner_json` extension so
  /// the matching Load button's accept-filter recognises it.
  ///
  /// URL.revokeObjectURL is deferred via setTimeout so the browser has
  /// finished the download initiation before the URL is released —
  /// revoking synchronously after .click() races with some browsers
  /// and produces an empty file.
  function _triggerDownload(state) {
    const blob = state.exportToBlob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = state.name + '.pfodDesigner_json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
