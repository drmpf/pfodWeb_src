/*
 * designer/menus/selectFromMenuList.js
 *
 * Handler for the 'b' (selectFromMenuListCmd) item on the designer's
 * main menu: opens a screen listing every saved design (including the
 * currently-active one, rendered bold), then on the second cmd switches
 * the active design to the picked entry.
 *
 *   {b}      → list screen  (one item per saved design, indexed)
 *   {b<n>}   → switch active design to listed[n], then re-emit main menu
 *
 * No version tag and no trailing `~` — the list changes every time
 * the user creates or deletes a design, so pfodWeb must always re-
 * fetch the full form.  See feedback-designer-menus-no-cache.
 *
 * Dynamic numeric sub-cmds (0, 1, 2, …) rather than a sub-Dispatcher
 * because the list contents change between renders.  The 'b' terminal
 * handler parses the trailing digits itself.
 *
 * Origin: pfodDesignerV2/DesignerMsgProcessor.java selectFromMenuList()
 *         around line 3971 — same two-state design.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

// ── Helpers ─────────────────────────────────────────────────────────

/// Read a non-negative decimal integer starting at rawCmd[startIdx];
/// stops at the first non-digit (typically `}`, `` ` `` or `|`).
/// Returns the integer or null when no digits were found.
function _parseTrailingIndex(rawCmd, startIdx) {
  let s = '';
  for (let i = startIdx; i < rawCmd.length; i++) {
    const c = rawCmd[i];
    if (c >= '0' && c <= '9') s += c;
    else break;
  }
  if (s.length === 0) return null;
  return parseInt(s, 10);
}

// ── Handler ─────────────────────────────────────────────────────────

const DesignerSelectFromMenuList = (() => {

  /// Render the list screen — one menu item per saved design, with the
  /// currently-active one bolded.  No trailing `~` / version: pfodWeb
  /// must re-fetch on every request.  The current design is selectable
  /// (picking it is a harmless no-op — state.loadNamed reloads the
  /// same data) but visually distinguished so the user can see which
  /// one they're on.
  function _renderListScreen(state) {
    const names = DesignerState.listNames();
    let out = '{,' + DESIGNER_PROMPT_FMT + '~' + designerTargetHeader(state);
    out += '<+2><b>Edit existing Menu</+2>\n';
    out += '<-1>Pick a menu to edit.';
    // Load from File: L button at top; I is instruction/status label;
    // X is the initially-hidden nav button (shown after a successful load).
    // All three are reset on every fresh {b} render — only {;} partial
    // updates change them during a single visit to this screen.
    out += '|L' + DESIGNER_MENU_FMT + '~Load Design from File';
    out += '|!I~<y><i>Use the Load button above to load saved <b>.pfodDesigner_json</b> menu files';
    out += '|X-~';
    if (names.length === 0) {
      // Practically unreachable — auto-save inserts the active design
      // into the list on every dispatch — but covered for safety.
      out += '|!Zempty<bg 050518>~<i>No menus loaded yet</i>';
    } else {
      // Each item's cmd is `b<idx>` so the click round-trips through
      // this same 'b' handler (the dispatcher routes on the first
      // byte 'b'; the trailing digits are parsed by _parseTrailingIndex
      // inside send()).  Bare digit cmds like `|0` get rejected by
      // pfodMenuParser's parsePfodCmd — the first byte must be a
      // letter — and render as blank buttons.
      names.forEach((name, idx) => {
        const fmt = (name === state.name)
          ? DESIGNER_MENU_FMT + '<b>'
          : DESIGNER_MENU_FMT;
        out += '|b' + idx + fmt + '~' + name;
      });
    }
    out += '}';
    return out;
  }

  /// Switch active design to names[idx] and open the editMenu screen.
  /// Only loads by index when no design is currently active (state.name
  /// is empty).  Once a design is loaded its identity is state.name —
  /// independent of list position or order — and back-nav cmds like
  /// {b0} re-enter the same editMenu without reloading from the list.
  /// The only ways to change the active design are: (a) the user picks
  /// from the list after send() clears state.name on the bare {b} path,
  /// or (b) load-from-file sets state.name to the loaded design.
  function _switchAndReturnMain(state, idx) {
    if (!state.name) {
      const names = DesignerState.listNames();
      if (idx < 0 || idx >= names.length) {
        return _renderListScreen(state);
      }
      state.loadNamed(names[idx]);
    }
    return DesignerEditMenu.send(state);
  }

  /// Dispatch handler.  depth points to the matched 'b' byte; sub-
  /// content starts at depth+1.
  ///
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth — index of 'b' in rawCmd
  /// @returns {string|{pfod, skipSave}}
  function send(rawCmd, state, depth) {
    const idx = _parseTrailingIndex(rawCmd, depth + 1);
    if (idx === null) {
      // Bare {b} — show the list.  Clear state.name so the next {b<n>}
      // pick loads by index rather than keeping the previously-active design.
      state.name = '';
      return { pfod: _renderListScreen(state), skipSave: true };
    }
    return _switchAndReturnMain(state, idx);
  }

  return Object.freeze({ send });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('b', DesignerSelectFromMenuList.send);
