/*
 * designer/menus/editPromptHelp.js
 *
 * Handler for the 'nw' sub-cmd on the Edit Prompt screen ("Help"):
 * shows a static help screen describing what each button on the Edit
 * Prompt screen does.  Routed through editPrompt.js — there is no
 * top-level dispatch entry here; editPrompt's send() recognises 'w'
 * after 'n' and delegates to DesignerEditPromptHelp.send().
 *
 * Static content, so this screen DOES carry a version tag (per the
 * feedback-designer-menus-no-cache exception for static screens).
 * Bump the version constant when the help text changes.
 *
 * Origin: pfodDesignerV2/DesignerMsgProcessor.java editMenuPromptHelp()
 *         around line 4348.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

// ── File-level constants ────────────────────────────────────────────

const EP_HELP_VERSION       = 'PH1';
const EP_HELP_REFRESH_REPLY = '{;}';

// ── Handler ─────────────────────────────────────────────────────────

const DesignerEditPromptHelp = (() => {

  /// Render the Edit Prompt help screen.  Always returns
  /// {pfod, skipSave} so the dispatcher doesn't persist for this
  /// read-only screen.
  ///
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth
  /// @returns {{pfod: string, skipSave: boolean}}
  function send(rawCmd, state, depth) {
    const parsed = parseVersion(rawCmd);
    if (isVersionRefresh(parsed.version, EP_HELP_VERSION)) {
      return { pfod: EP_HELP_REFRESH_REPLY, skipSave: true };
    }

    // Tag balance: every <+N>/<-N> opening tag closed with </+N>/</-N>
    // so the body text doesn't keep shrinking down the screen.  See
    // mainMenuHelp.js for the same rule.
    let out = '{,' + DESIGNER_PROMPT_FMT + '~<b><+2>Edit Prompt Help</+2></b>\n\n\n';
    out += '<-1>Lets you change the menu\'s prompt and shows a live preview at';
    out += ' the bottom of the screen as you toggle formats.</-1>\n\n\n';
    out += '<-1><i><y>Edit prompt text</i> lets you set your own text.';
    out += '  You can clear the prompt entirely if you don\'t want one.</-1>\n\n\n';
    out += '<-1><i><y>Font Size</i> shifts the prompt\'s font size relative';
    out += ' to the device default (-6 to +12).</-1>\n\n\n';
    out += '<-1><i><y>Set Font colour</i> / <i><y>Set Background colour</i>';
    out += ' pick the prompt\'s text + background colours.  The prompt';
    out += ' background colour is used as the default for the whole menu.</-1>\n\n\n';
    out += '<-1><i><y>Set Bold</i> / <i><y>Set Italic</i> / <i><y>Set Underline</i>';
    out += ' toggle the matching format flag on the prompt text.</-1>\n\n\n';
    out += '<-1><i><y>Set to Flash</i> / <i><y>Set to play sound</i> mark the';
    out += ' prompt for flashing display / a notification chime in pfodApp.</-1>';
    out += '~' + EP_HELP_VERSION + '}';
    return { pfod: out, skipSave: true };
  }

  return Object.freeze({ send });
})();

// Not registered top-level — editPrompt.js's 'n' handler delegates here
// when it sees the 'w' sub-byte after 'n' (cmd `{nw}`).
