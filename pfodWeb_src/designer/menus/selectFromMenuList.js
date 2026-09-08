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
    //
    // ONE Load button, taking both shapes Save Design produces. Which one a
    // design was saved as depends on whether it links a drawing — a
    // property of the design, not a choice the user made — so a button per
    // shape asked them to answer a question they had no reason to be able
    // to answer, and greyed out their file when they guessed wrong. The
    // chooser offers either; the extension picked decides how it is read.
    out += '|L' + DESIGNER_MENU_FMT + '~Load Design from File\n<-1>.pfodMenu_json or .zip';
    out += '|!I~<y><i>Load a saved <b>.pfodMenu_json</b> menu file, or a <b>.zip</b> bundle holding a menu and its drawings';
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
    // Missing-drawings block, declared hidden. A {;} can only change items
    // the screen already carries, so these have to exist here even though
    // nothing is missing yet — no design has been picked. {b<n>} reveals
    // whichever it needs. See missingDwgPrompt.js.
    out += DesignerMissingDwgPrompt.renderHiddenItems();
    out += '}';
    return out;
  }

  /// Every item this screen owns, hidden — the Load button, the
  /// instruction label, the hidden X nav button, the empty-list note, and
  /// one row per saved design.
  ///
  /// Once a design is picked and it needs dwgs, this screen stops being a
  /// list and becomes the loading screen for that design: picking a second
  /// design, or loading another file, midway through would be answering a
  /// question nobody asked. Only the missing-dwg block is left visible.
  /// A fresh {b} re-renders everything, so nothing is lost — Back from the
  /// editMenu does exactly that.
  /// @param {DesignerState} state
  /// @returns {string} '|…-~' hides, ready to splice into a {;}
  function hideOwnItems(state) {
    let out = '|L-~|!I-~|X-~|!Zempty-~';
    DesignerState.listNames().forEach((name, idx) => { out += '|b' + idx + '-~'; });
    return out;
  }

  /// Switch active design to names[idx] and open the editMenu screen — or,
  /// when the freshly-loaded design references dwgs DwgLibrary does not hold
  /// (directly or via insertDwg), stay on THIS list screen and reveal the
  /// missing-drawings block on it instead, so they can be loaded before
  /// editing. Only loads by index when no design is currently
  /// active (state.name is empty).  Once a design is loaded its identity
  /// is state.name — independent of list position or order — and
  /// back-nav cmds like {b0} re-enter the same editMenu without
  /// reloading from the list (so the missing-dwg prompt only fires once,
  /// right after the real load). The only ways to change the active
  /// design are: (a) the user picks from the list after send() clears
  /// state.name on the bare {b} path, or (b) load-from-file sets
  /// state.name to the loaded design.
  function _switchAndReturnMain(state, idx) {
    if (!state.name) {
      const names = DesignerState.listNames();
      if (idx < 0 || idx >= names.length) {
        return _renderListScreen(state);
      }
      state.loadNamed(names[idx]);
    }
    // Dwgs missing? Stay on THIS screen and reveal the loading block on it,
    // as a {;} update. Opening a screen of its own is what put two entries
    // on the nav stack for one screen and made the first Back press a
    // no-op — see missingDwgPrompt.js. Once nothing is missing, the block's
    // own exit button opens the editMenu, one entry above this list.
    const reveal = DesignerMissingDwgPrompt.revealUpdate(state, hideOwnItems(state));
    if (reveal) return { pfod: reveal, skipSave: false };
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

  return Object.freeze({ send, hideOwnItems });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('b', DesignerSelectFromMenuList.send);
