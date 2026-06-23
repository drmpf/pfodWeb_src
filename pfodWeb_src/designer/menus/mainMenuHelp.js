/*
 * designer/menus/mainMenuHelp.js
 *
 * Handler for the 'c' (mainMenuHelpCmd) item on the designer's main
 * menu: shows a static help screen describing what the designer does
 * and how to navigate it.  Read-only — opts out of state.save() via
 * the {pfod, skipSave} return shape.
 *
 * Origin: pfodDesignerV2/DesignerMsgProcessor.java case mainMenuHelpCmd
 *         (handled inline near the getMainMenuHelp screen).
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

// ── File-level constants ────────────────────────────────────────────

const HELP_MENU_VERSION = 'MH3';
const VERSIONED_HELP_REFRESH_REPLY = '{;}';

// ── Handler ─────────────────────────────────────────────────────────

const DesignerMainMenuHelp = (() => {

  /// Render the help screen.  No state mutation; opts out of auto-save
  /// by returning a {pfod, skipSave: true} wrapper.
  ///
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth
  /// @returns {{pfod: string, skipSave: boolean}}
  function send(rawCmd, state, depth) {
    const parsed = parseVersion(rawCmd);
    if (isVersionRefresh(parsed.version, HELP_MENU_VERSION)) {
      return { pfod: VERSIONED_HELP_REFRESH_REPLY, skipSave: true };
    }

    // pfod font-size tags nest via closing tags: <-1>...</-1> pops back
    // to the prior size.  Without the closing tag the size accumulates
    // (each <-1> shrinks again from the running total), so the body
    // text would get progressively smaller down the screen.  Button
    // names use the same yellow-italic inline pattern as editMenuHelp
    // (<i><y>Name</i> body) so the two help screens stay visually
    // consistent.
    // Keep body under the pfod 1024-byte response limit.  Per-item
    // descriptions are intentionally terse; the buttons themselves
    // double as documentation for what each one does.
    let out = '{,' + DESIGNER_PROMPT_FMT + '~<+2><b>pfod Designer Help</b></+2>\n\n\n';
    out += '<-1>Design pfod menus visually, then (when ready) generate the Arduino code.</-1>\n\n\n';
    out += '<-1><i><y>Start new Menu</i> creates a fresh design.</-1>\n\n\n';
    out += '<-1><i><y>Edit existing Menu</i> reopens a saved design.</-1>\n\n\n';
    out += '<-1><i><y>Load Design from File</i> imports a previously-saved `.pfodDesign.json` file.</-1>\n\n\n';
    out += '<-1><i><y>Delete Menu</i> saves then removes a saved design.</-1>\n\n\n';
    out += '<b>Saving</b>\n';
    out += '<-1>Every edit auto-saves to browser storage and survives reloads.  Use';
    out += ' <i><y>Save Design to File</i> (on the edit screen) and';
    out += ' <i><y>Load Design from File</i> here to move designs between machines or folders.</-1>\n\n\n';
    out += '<-1>Use the bottom back arrow to step back through screens.</-1>';
    out += '~' + HELP_MENU_VERSION + '}';
    return { pfod: out, skipSave: true };
  }

  return Object.freeze({ send });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('e', DesignerMainMenuHelp.send);
