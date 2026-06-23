/*
 * designer/menus/refreshInterval.js
 *
 * Handler for the 'M' (refreshSettingCmd) toggle item on the editMenu
 * screen: stores the user's pick from the 6-entry refresh-interval
 * list (None / 1 sec / 5 sec / 30 sec / 5 min / 15 min) onto the
 * active menu's refresh_ms field.  Matches Java pfodDesignerV2's
 * DesignerMsgProcessor.setRefreshInterval (line 625) +
 * editMenuResfreshIntervalUpdate (line 2576).
 *
 * Cmd shape: pfodWeb emits `{M`<idx>}` when the user releases the
 * toggle (selection-style backtick payload).  This handler parses the
 * index, translates to ms via DESIGNER_REFRESH_INTERVALS, mutates
 * state, saves, and returns a MINIMAL `{;|M`<idx>}` update so pfodWeb
 * confirms the toggle position without re-rendering the whole
 * editMenu screen.  Java returns the same minimal update.
 *
 * Re-fire safety: pfodWeb's applyUpdate merges the `M` item's
 * intFields[0] into the displayed toggle; no nav-stack push happens
 * for a `{;…}` update, so back-arrow behaviour stays untouched.  A
 * stale {M`<idx>} re-fire just re-applies the same ms.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DesignerRefreshInterval = (() => {

  /// Parse the index from the picker submit and write its ms to the
  /// active menu.  Out-of-range / non-numeric input clamps to NONE
  /// (idx 0) via designerRefreshFromIndex's range-check.
  function _applyIndex(state, rawCmd, argStart) {
    if (rawCmd[argStart] !== '`') return PFOD_EMPTY;
    const idxStr = rawCmd.substring(argStart + 1, rawCmd.length - 1);
    const idx    = parseInt(idxStr, 10);
    const entry  = designerRefreshFromIndex(idx);
    state.getActiveMenu().refresh_ms = entry.ms;
    state.save();
    // Minimal `{;}` update — matches Java's editMenuResfreshIntervalUpdate.
    // pfodWeb's applyUpdate matches by cmd 'M' on the editMenu's
    // toggle item and updates intFields[0] in place.
    return '{;|M`' + idx + '}';
  }

  /// Dispatch handler.  depth = index of 'M' in rawCmd.  The only
  /// reach path is `{M`<idx>}` from the toggle's submit; a bare `{M}`
  /// (no backtick) shouldn't happen in normal flow but is silently
  /// no-opped (returns PFOD_EMPTY).
  ///
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth
  /// @returns {string|{pfod, skipSave}}
  function send(rawCmd, state, depth) {
    return _applyIndex(state, rawCmd, depth + 1);
  }

  return Object.freeze({ send });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('M', DesignerRefreshInterval.send);
