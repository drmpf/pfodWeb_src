/*
 * designer/menus/editPromptText.js
 *
 * Handler for the 'h' (editMenuPromptCmd) item reached from the Edit
 * Prompt screen's "Edit prompt text" button.  Two-state flow, same
 * shape as editMenuName:
 *
 *   {h}        → text-input screen, initial value = state.promptText
 *   {hT~<s>}   → user accepted; store text in state.promptText and
 *                return PFOD_EMPTY ('{}').  pfodWeb's input-submit
 *                path sends a separate back-nav cmd right after the
 *                text-cmd (responseHandlers.js ~line 838) and uses
 *                that response to refresh the previous screen.
 *                Returning a `{,...}` menu here causes pfodWeb to
 *                push it onto menuNavStack — user then needs TWO
 *                back presses to escape the phantom entry.  Matches
 *                Java's editMenuPrompt which also returns "{}".
 *
 * pfod text-input message format (request):
 *   {'<cmd>T`<maxLen>~<prompt>|<initial>}
 * pfodWeb's accept-response uses `~` (NOT backtick) as the separator
 * between the cmd and the user's typed text — see pfodInputDisplay.js
 * line 14:  "Submission sends: {<cmd>~<newText>}".  Standard pfod uses
 * backtick; the designer targets pfodWeb specifically so we follow
 * pfodWeb's wire format here.
 *
 * NO version tag — text-input screens are single-shot and never
 * cached.  See feedback-designer-textinput-no-version.
 *
 * Origin: pfodDesignerV2/DesignerMsgProcessor.java editMenuPrompt()
 *         around line 2919.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

// ── File-level constants ────────────────────────────────────────────

// Max prompt length offered to the user — matches the Java's 256-char
// cap exposed in the text-input field.
const EP_TEXT_MAX_LEN = 256;

// Filler newlines between the explanation and the input field.  Two,
// matching Java's editMenuPrompt (the editMenuName 9-newline filler is
// not used here — long prompts already push the keyboard far enough).
const EP_TEXT_PROMPT_FILLER = '\n\n';

// ── Handler ─────────────────────────────────────────────────────────
//
// _renderInputScreen lives INSIDE the IIFE so its generic name doesn't
// collide with the same-named helper in editMenuName.js after the
// bundler concatenates everything into one global scope — top-level
// `function` declarations would otherwise be hoisted into the same
// namespace and the later one would silently shadow the earlier
// (which is exactly the bug this fixes — see tasklog 2026-05-22).

const DesignerEditPromptText = (() => {

  /// Render the text-input screen used to collect a new prompt text.
  /// No version tag (text-input screens are never cached).  Initial
  /// value is the active menu's current promptText so the user can
  /// incrementally edit rather than retype from scratch.
  function _renderInputScreen(state) {
    const initial = state.getActiveMenu().promptText;
    let out = "{'hT`" + EP_TEXT_MAX_LEN + '~' + DESIGNER_PROMPT_FMT;
    out += '\n<+1>Edit Prompt\n';
    out += '(Max ' + EP_TEXT_MAX_LEN + ' characters)';
    out += EP_TEXT_PROMPT_FILLER;
    out += '|' + initial;
    out += '}';
    return out;
  }

  /// Apply the user's submitted prompt text to the active menu's
  /// promptText.  No trim — preserve leading / trailing whitespace
  /// exactly as typed (matches Java behaviour for prompt text; only
  /// menu names get trimmed).  Empty submissions are stored as-is;
  /// the user retains the ability to clear the prompt area entirely.
  function _applyNewText(state, rawCmd, argStart) {
    if (rawCmd[argStart] !== '~') {
      // Malformed accept (no '~' separator before payload).  Fall back
      // to the input screen so the user can retry.
      return { pfod: _renderInputScreen(state), skipSave: true };
    }
    state.getActiveMenu().promptText = rawCmd.substring(argStart + 1, rawCmd.length - 1);
    // Persist the new prompt explicitly — the dispatch wrapper skips
    // its auto-save() for PFOD_EMPTY responses (index.js line 73), so a
    // bare return would leave the change in memory only and lose it on
    // reload.  Save here, then return PFOD_EMPTY; pfodWeb's queued
    // back-nav fetches the parent screen separately.
    state.save();
    return PFOD_EMPTY;
  }

  /// Dispatch handler.  depth = index of 'h' in rawCmd.
  ///   rawCmd[depth+1] === 'T' → user accepted, parse payload
  ///   otherwise               → show the text-input screen
  ///
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth
  /// @returns {string|{pfod, skipSave}}
  function send(rawCmd, state, depth) {
    if (rawCmd[depth + 1] === 'T') {
      return _applyNewText(state, rawCmd, depth + 2);
    }
    // Bare {h} — show the input screen.  No mutation, no need to save.
    return { pfod: _renderInputScreen(state), skipSave: true };
  }

  return Object.freeze({ send });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('h', DesignerEditPromptText.send);
