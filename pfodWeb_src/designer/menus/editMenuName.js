/*
 * designer/menus/editMenuName.js
 *
 * Handler for the 'j' (editMenuNameCmd) item on the editMenu screen:
 * lets the user rename the active design.  Two-state flow, same shape
 * as the Java pfodDesignerV2 implementation:
 *
 *   {j}        → text-input screen, prompt + initial value = current name
 *   {jT~<s>}   → user accepted; trim, ensure uniqueness, rename, then
 *                re-open editMenu
 *
 * pfod text-input message format (request):
 *   {'<cmd>T`<maxLen>~<prompt>|<initial>}
 * The leading `'` marks a text-input screen.  pfodWeb's accept-response
 * uses `~` (NOT backtick) as the separator between the cmd and the
 * user's typed text — see pfodInputDisplay.js line 14:  "Submission
 * sends: {<cmd>~<newText>}".  Standard pfod uses backtick; the designer
 * targets pfodWeb specifically so we follow pfodWeb's wire format here.
 *
 * NO version tag — text-input screens are single-shot and never
 * cached.  See feedback-designer-textinput-no-version (and the
 * parent feedback-designer-menus-no-cache rule it specialises).
 *
 * Origin: pfodDesignerV2/DesignerMsgProcessor.java editMenuName()
 *         around line 2946.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

// ── File-level constants ────────────────────────────────────────────

// Minimum max-length offered to the user in the text-input field.
// Bumped to match the current name's byte length if longer, so renames
// of a long name never have to truncate to fit.
const EM_NAME_MIN_MAX_LEN = 32;

// Filler newlines inserted before the input field to push the prompt
// header clear of the on-screen keyboard.  Matches Java's filler.
const EM_NAME_PROMPT_FILLER = '\n\n\n\n\n\n\n\n\n';

// ── Handler ─────────────────────────────────────────────────────────
//
// Helpers ( _ensureUniqueName / _renderInputScreen / _renderInfoScreen )
// live INSIDE the IIFE so their generic names ("_renderInputScreen")
// don't collide with same-named helpers in sibling text-input files
// after the bundler concatenates everything into one global scope —
// top-level `function` declarations would otherwise be hoisted into the
// same namespace and the later one would silently shadow the earlier.

const DesignerEditMenuName = (() => {

  /// Return `candidate`, or `candidate_2` / `candidate_3` / … if some
  /// OTHER saved design already uses that name.  Renaming the active
  /// design to its own current name is allowed (returns as-is).
  function _ensureUniqueName(state, candidate) {
    const taken = new Set(
      DesignerState.listNames().filter((n) => n !== state.name)
    );
    if (!taken.has(candidate)) return candidate;
    for (let n = 2; ; n++) {
      const tryName = candidate + '_' + n;
      if (!taken.has(tryName)) return tryName;
    }
  }

  /// Render the text-input screen used to collect the new name.  No
  /// version tag (text-input screens are never cached).
  function _renderInputScreen(state) {
    const initial = state.name;
    const maxLen  = Math.max(EM_NAME_MIN_MAX_LEN, initial.length);
    let out = "{'jT`" + maxLen + '~' + DESIGNER_PROMPT_FMT;
    out += '\n<+2>Edit the Menu Name\n';
    out += 'This name is for your use only and is never seen by users.\n';
    out += 'Max ' + maxLen + ' bytes';
    out += EM_NAME_PROMPT_FILLER;
    out += '|' + initial;
    out += '}';
    return out;
  }

  /// Render an info screen explaining why the rename was rejected.
  /// Used when the user submits an empty name.
  function _renderInfoScreen(message) {
    return '{,' + DESIGNER_PROMPT_FMT + '~' + message + '}';
  }

  /// Apply the user's submitted new name to state.name.  Validates +
  /// de-duplicates first.  Returns the next screen.
  function _applyNewName(state, rawCmd, argStart) {
    // argStart points to the byte after 'T' — expect '~<text>}'.
    if (rawCmd[argStart] !== '~') {
      // Malformed accept (no '~' separator before payload).  Fall back
      // to the input screen so the user can retry.
      return { pfod: _renderInputScreen(state), skipSave: true };
    }
    // Trailing `}` is at rawCmd.length - 1.  Everything between is
    // the user-supplied text.
    const typed = rawCmd.substring(argStart + 1, rawCmd.length - 1).trim();
    if (typed.length === 0) {
      return { pfod: _renderInfoScreen('New name was empty.'), skipSave: true };
    }
    const finalName = _ensureUniqueName(state, typed);
    if (finalName !== state.name) {
      state.rename(finalName);
    }
    // Return PFOD_EMPTY — pfodWeb's queued back-nav fetches the editMenu
    // screen separately.  Returning the menu here would push a phantom
    // entry on menuNavStack, forcing the user to press back twice.
    // Matches Java/Arduino convention for input-cmd responses.
    return PFOD_EMPTY;
  }

  /// Dispatch handler.  depth = index of 'j' in rawCmd.
  ///   rawCmd[depth+1] === 'T' → user accepted, parse payload
  ///   otherwise               → show the text-input screen
  ///
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth
  /// @returns {string|{pfod, skipSave}}
  function send(rawCmd, state, depth) {
    if (rawCmd[depth + 1] === 'T') {
      return _applyNewName(state, rawCmd, depth + 2);
    }
    // Bare {j} — show the input screen.  No mutation, no need to save.
    return { pfod: _renderInputScreen(state), skipSave: true };
  }

  return Object.freeze({ send });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('j', DesignerEditMenuName.send);
