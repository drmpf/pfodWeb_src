/*
 * designer/menus/deleteEmptyMenuList.js
 *
 * Handler for the 'N' (deleteMenuListCmd) item on the designer's main
 * menu: opens a screen listing every saved design, then on the second
 * cmd saves the picked design to file and deletes it.
 *
 *   {N}      → list of all saved designs (indexed)
 *   {N<n>}   → download designs[n] then delete it, then re-emit main menu
 *
 * Save-before-delete: the design is exported as a .pfodDesigner_json
 * download (same format as editMenu's Save Design to File) before the
 * localStorage entry is removed.  This lets the user recover a deleted
 * design by re-importing it via Load Design from File.
 *
 * Currently-active design IS deletable — afterwards state.name becomes
 * empty and the main menu shows "Design: (none)" so the user can pick
 * Start new / Edit existing / Exit.  No silent auto-recreation.
 *
 * No version tag and no trailing `~` — the list changes whenever
 * designs are created / deleted, so pfodWeb must always re-fetch.
 * See feedback-designer-menus-no-cache.
 *
 * Origin: pfodDesignerV2/DesignerMsgProcessor.java case
 *         deleteEmptyMenuListCmd ('N') — extended to all designs and
 *         with save-before-delete.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

// ── Helpers ─────────────────────────────────────────────────────────

/// Read a non-negative decimal integer starting at rawCmd[startIdx];
/// stops at the first non-digit (typically `}`, `` ` `` or `|`).
/// Returns the integer or null when no digits were found.
function _parseDeleteIndex(rawCmd, startIdx) {
  let s = '';
  for (let i = startIdx; i < rawCmd.length; i++) {
    const c = rawCmd[i];
    if (c >= '0' && c <= '9') s += c;
    else break;
  }
  if (s.length === 0) return null;
  return parseInt(s, 10);
}

/// Remove a saved design's localStorage entry + index-list entry.
/// Safe to call for a name that no longer exists (no-op).
function _deleteDesign(name) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + name);
    DesignerState._removeFromList(name);
  } catch (_) {
    // localStorage unavailable (private browsing etc.).  In-memory
    // list regenerates from listNames() on next read; nothing to do.
  }
}

/// Trigger a browser download of the named design as a .pfodDesigner_json
/// file before it is deleted, so the user can recover it via Load.
/// For the active design uses state.exportToBlob() (captures unsaved
/// in-memory edits).  For other designs reads the localStorage payload
/// and re-serialises into the canonical export format.
function _downloadBeforeDelete(state, name) {
  let blob;
  if (name === state.name) {
    blob = state.exportToBlob();
  } else {
    let raw;
    try { raw = localStorage.getItem(STORAGE_PREFIX + name); } catch (_) { raw = null; }
    if (raw) {
      let stored;
      try { stored = JSON.parse(raw); } catch (_) { stored = null; }
      if (stored && stored.rootMenu) {
        const exportObj = {
          format:  EXPORT_FORMAT_TAG,
          schema:  DESIGNER_STATE_SCHEMA_VERSION,
          name:    name,
          savedAt: new Date().toISOString(),
          data:    { rootMenu: stored.rootMenu },
        };
        blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
      }
    }
  }
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = name + '.pfodDesigner_json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Handler ─────────────────────────────────────────────────────────

const DesignerDeleteEmptyMenuList = (() => {

  /// List every saved design.  Active design is shown bold.
  /// No trailing `~` / version: pfodWeb must re-fetch on every request.
  function _renderListScreen(state) {
    const designs = DesignerState.listNames();
    let out = '{,' + DESIGNER_PROMPT_FMT + '~<+2><b>Delete Menu</+2>\n';
    out += '<-1>Pick a saved design to delete. The design is saved to file before deleting.';
    if (designs.length === 0) {
      out += '|!Zempty<bg 050518>~<i>No saved designs to delete</i>';
    } else {
      // Each item's cmd is `N<idx>` so the click round-trips through
      // this same 'N' handler (the dispatcher routes on the first
      // byte 'N'; the trailing digits are parsed by _parseDeleteIndex
      // inside send()).  Bare digit cmds like `|0` get rejected by
      // pfodMenuParser's parsePfodCmd — the first byte must be a
      // letter — and render as blank buttons.
      designs.forEach((name, idx) => {
        const fmt = (name === state.name)
          ? DESIGNER_MENU_FMT + '<b>'
          : DESIGNER_MENU_FMT;
        out += '|N' + idx + fmt + '~' + name;
      });
    }
    out += '}';
    return out;
  }

  /// Download designs[idx] to file, delete it, then return main menu.
  /// When the deleted design is the active one, drop the active-design
  /// name (state.name = '') so the main menu shows "Design: (none)".
  /// Out-of-range idx re-renders the list screen.
  function _deleteAndReturnMain(state, idx) {
    const designs = DesignerState.listNames();
    if (idx < 0 || idx >= designs.length) {
      return DesignerDispatch.dispatch('{N}', state, DISPATCH_ROOT_DEPTH);
    }
    const victim = designs[idx];
    _downloadBeforeDelete(state, victim);
    _deleteDesign(victim);
    if (victim === state.name) {
      // Detach the active design entirely — no replacement assigned.
      // state.save() short-circuits on empty name so this stays
      // transient until the user picks something else.  mainMenu.send
      // also clears state.name + activeMenuPath on entry, so this
      // matches that reset shape.
      state.name           = '';
      state.activeMenuPath = [];
    }
    return '{<}';
  }

  /// Dispatch handler.  depth points to the matched 'N' byte; sub-
  /// content starts at depth+1.
  ///
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth — index of 'N' in rawCmd
  /// @returns {{pfod: string, skipSave: boolean}}
  function send(rawCmd, state, depth) {
    const idx = _parseDeleteIndex(rawCmd, depth + 1);
    if (idx === null) {
      // Bare {N} — just the list, no mutation.
      return { pfod: _renderListScreen(state), skipSave: true };
    }
    return _deleteAndReturnMain(state, idx);
  }

  return Object.freeze({ send });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('N', DesignerDeleteEmptyMenuList.send);
