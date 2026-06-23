/*
 * designer/menus/editMenuHelp.js
 *
 * Handler for the 'w' (editMenuHelpCmd) item on the editMenu screen:
 * shows a static help page describing what each editMenu button does.
 * Read-only — opts out of state.save() via the {pfod, skipSave} return.
 *
 * Static content, so this screen DOES carry a version tag (per the
 * feedback-designer-menus-no-cache exception for static screens).
 * pfodWeb can cache it across visits — bump the version constant when
 * the help text changes so older cached copies invalidate.
 *
 * Origin: pfodDesignerV2/DesignerMsgProcessor.java editMenuHelp()
 *         (line ~4307 in the Java).
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

// ── File-level constants ────────────────────────────────────────────

// Bump the trailing digit when the help text changes so pfodWeb
// invalidates its cached copy.
const EM_HELP_VERSION = 'MH4';
const EM_HELP_REFRESH_REPLY = '{;}';

// ── Handler ─────────────────────────────────────────────────────────

const DesignerEditMenuHelp = (() => {

  /// Render the editMenu help screen.  Always returns {pfod, skipSave}
  /// so the dispatcher doesn't persist for this read-only screen.
  ///
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth
  /// @returns {{pfod: string, skipSave: boolean}}
  function send(rawCmd, state, depth) {
    const parsed = parseVersion(rawCmd);
    if (isVersionRefresh(parsed.version, EM_HELP_VERSION)) {
      return { pfod: EM_HELP_REFRESH_REPLY, skipSave: true };
    }

    // pfod font-size tags accumulate if not closed.  Each <-1> paired
    // with </-1> here so the body text doesn't keep shrinking down the
    // screen.  Title's <+2> closed by </+2>.  See feedback in
    // mainMenuHelp.js for the same rule.
    //
    // Keep body under the pfod 1024-byte response limit.  Per-item
    // descriptions are intentionally terse.
    let out = '{,' + DESIGNER_PROMPT_FMT + '~<b><+2>Editing Menu Help</+2></b>\n\n\n';
    out += '<-1><i><y>Target ...</i> sets the code-generation target.  Set this first.</-1>\n\n\n';
    out += '<-1><i><y>Preview Menu</i> shows the menu as pfodWeb and pfodApp will show it.</-1>\n\n\n';
    out += '<-1><i><y>Edit Menu</i> lists items for editing.</-1>\n\n\n';
    out += '<-1><i><y>Edit Prompt</i> opens the prompt-editing screen.</-1>\n\n\n';
    out += '<-1><i><y>Add Menu Item</i> appends a new item.</-1>\n\n\n';
    out += '<-1><i><y>Menu Refresh Interval</i> sets how often pfodApp re-requests this menu.</-1>\n\n\n';
    out += '<-1><i><y>Generate Code</i> saves the Arduino code to a file.</-1>\n\n\n';
    out += '<-1><i><y>Change Menu Name</i> renames the design (not seen by the pfodApp user).</-1>\n\n\n';
    out += '<-1><i><y>Save Design to File</i> downloads this design as JSON.  Reload via';
    out += ' <i><y>Load Design from File</i> on the main menu.</-1>~';
    out += EM_HELP_VERSION + '}';
    return { pfod: out, skipSave: true };
  }

  return Object.freeze({ send });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('w', DesignerEditMenuHelp.send);
