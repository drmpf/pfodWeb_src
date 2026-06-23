/*
 * designer/menus/editMenuItemHelp.js
 *
 * Handler for the 'dw' sub-cmd on the Edit Menu Item screen ("Help"):
 * shows a static help screen describing the per-item editor.  Routed
 * through editMenuItem.js — there is no top-level dispatch entry
 * here; editMenuItem's send() recognises 'w' after 'd' and delegates
 * to DesignerEditMenuItemHelp.send().
 *
 * The help text is item-type-specific — Button / Label / On/Off /
 * On/Off Display each have their own version tag so pfodWeb caches
 * them independently.
 *
 * Tag balance: title block uses balanced `<+2>…</+2>` / `<b>…</b>`,
 * body uses balanced `<-1>…</-1>` per region.  pfodWeb's renderer
 * compounds size deltas (see pfodButtonRenderer.js _changeFontSize
 * — `fontSize += e.deltaSize`), so leaving `<+2>` unclosed before
 * opening `<-1>` would render the body at +1 (compound) instead of
 * the intended -1.  Same pattern as editPromptHelp.js.
 *
 * Wording is verbatim from pfodDesignerV2 — only the tag structure
 * diverges (for the compounding-size reason above) and the JS port
 * uses DESIGNER_PROMPT_FMT (dark navy bg + white) instead of Java's
 * `<bg gy>` (gray bg + dark text), matching the existing designer-
 * chrome aesthetic.  See feedback-designer-match-java-colours-text.
 *
 * Origin: pfodDesignerV2/DesignerMsgProcessor.java editButtonHelp()
 *         (line 4557), editLabelHelp() (line 4405),
 *         editOnOffHelp() and editInputDisplayHelp().
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

// ── File-level constants ────────────────────────────────────────────

// Per-type version tags so pfodWeb's menu cache treats each item type
// help as a distinct cacheable screen.  Bump the trailing digit when
// the corresponding help text changes.
const EMIH_BUTTON_VERSION       = 'EMIH.B2';
const EMIH_LABEL_VERSION        = 'EMIH.L3';
const EMIH_ONOFF_VERSION        = 'EMIH.OO3';
const EMIH_ONOFFDISPLAY_VERSION = 'EMIH.OD3';
const EMIH_PWM_VERSION          = 'EMIH.P3';

// Refresh reply when pfodWeb sends back the cached version asking
// "anything new?" — `{;}` means "nothing changed, use the cached
// copy".  Matches the Java refresh path's `{;}` reply.
const EMIH_REFRESH_REPLY  = '{;}';

// ── Handler ─────────────────────────────────────────────────────────

const DesignerEditMenuItemHelp = (() => {

  /// Render the Button help screen.  Wording lifted verbatim from
  /// pfodDesignerV2/DesignerMsgProcessor.java editButtonHelp().
  ///
  /// Each paragraph is its own balanced `<-1>…</-1>` block so the
  /// per-paragraph `\n` line breaks live OUTSIDE any styled span.
  /// (When `\n` chars were embedded inside one large `<-1>` span
  /// containing the whole body, pfodWeb's prompt-area layout
  /// produced spurious blank lines after each inline `<i><y>…</i>`
  /// emphasis.  Same pattern as editPromptHelp.js.)
  /// @returns {string} full pfod menu response with version tag
  function _renderButton() {
    let out = '{,' + DESIGNER_PROMPT_FMT + '~';
    out += '<b><+2>Editing Button Help</+2></b>\n';
    out += '<-1>A preview of the menu button is shown at the top of the screen.</-1>\n';
    out += '<-1><i><y>Change command char</i> lets you choose the command char that';
    out += ' will be sent back when this Button is clicked by the user.';
    out += '  The generated code leaves a place holder for you to add your own action code.</-1>\n';
    out += '<-1>Usually you will not need to change this.';
    out += '  The command chars should be unique for any one pfodDevice';
    out += ' so only the  chars not currently assigned to other items are shown.</-1>\n\n';
    out += '<-1>Use <i><y>Delete Items</i>';
    out += ' on the <i><y>Editing Menu</i> screen to remove this button.</-1>';
    out += '~' + EMIH_BUTTON_VERSION + '}';
    return out;
  }

  /// Render the Label help screen.  Wording lifted verbatim from
  /// pfodDesignerV2/DesignerMsgProcessor.java editLabelHelp().  The
  /// spacer guidance and "Label does not accept user input" notes
  /// are Label-specific; the rest mirrors Button help structure.
  /// Per-paragraph `<-1>…</-1>` blocks — see _renderButton above
  /// for why.
  /// @returns {string} full pfod menu response with version tag
  function _renderLabel() {
    let out = '{,' + DESIGNER_PROMPT_FMT + '~';
    out += '<b><+2>Editing Label Help</+2></b>\n';
    out += '<-1>Use this menu item to display fixed text or to add a spacer.';
    out += '  A preview of the Label is shown at the top of the screen, under the title.</-1>\n';
    out += '<-1>You can use this item as a spacer by deleting the text and using the';
    out += ' <i><y>Font Size</i> to adjust the height of the spacer</-1>\n';
    out += '<-1>For very thin spacers edit the generated code to set a font size smaller than -6</-1>\n\n';
    out += "<-1>This menu item is a 'Label' and does not accept user input.</-1>\n";
    out += '<-1>The command character associated with this menu item is only used to update it.';
    out += '  No command is ever sent to the pfodDevice for this item.</-1>\n\n';
    out += '<-1>The command chars should be unique for any one pfodDevice';
    out += ' so only the chars not currently assigned to other items are shown as options.</-1>\n\n';
    out += '<-1>Use <i><y>Delete Items</i>';
    out += ' on the <i><y>Editing Menu</i> screen to remove this label.</-1>';
    out += '~' + EMIH_LABEL_VERSION + '}';
    return out;
  }

  /// Render the On/Off Setting or Pulse help screen.
  /// Wording from onOffSettingHelp.txt.
  /// @returns {string} full pfod menu response with version tag
  function _renderOnOff() {
    let out = '{,' + DESIGNER_PROMPT_FMT + '~';
    out += '<b><+2>Editing On/Off Setting or Pulse Help</+2></b>\n';
    out += '<-1>A preview of the On/Off item is shown at the top of the screen.</-1>\n';
    out += '\n';
    out += '<-1>Use this item to display and set an On/Off value.';
    out += '  When the user clicks the item the new value is sent back to the pfodDevice.</-1>\n';
    out += '\n';
    out += '<-1>The <i><y>Leading Text</i> is displayed before the slider.';
    out += '  The <i><y>Trailing Text</i> is displayed after it.';
    out += '  <i><y>Low text</i> and <i><y>High text</i> label the two slider end positions.</-1>\n';
    out += '\n';
    out += '<-1>Connect to an I/O pin to drive a digital output.';
    out += '  The generated code sets the pin HIGH or LOW to match the current value.\n';
    out += 'The <i><y>Initial State</i> row sets the power-up output level (HIGH or LOW).';
    out += '  It is only shown when the output is not pulsed.</-1>\n';
    out += '\n';
    out += '<-1>Use <i><y>Output is not pulsed</i> to configure a timed pulse.';
    out += '  Each user click then generates a single timed HIGH or LOW pulse on the output pin.</-1>\n';
    out += '\n';
    out += '<-1>Use <i><y>Delete Items</i>';
    out += ' on the <i><y>Editing Menu</i> screen to remove this item.</-1>';
    out += '~' + EMIH_ONOFF_VERSION + '}';
    return out;
  }

  /// Render the On/Off Display help screen.
  /// Wording from onOffDisplayHelp.txt.
  /// @returns {string} full pfod menu response with version tag
  function _renderOnOffDisplay() {
    let out = '{,' + DESIGNER_PROMPT_FMT + '~';
    out += '<b><+2>Editing On/Off Display Help</+2></b>\n';
    out += '\n';
    out += '<-1>A preview of the On/Off Display item is shown at the top of the screen.</-1>\n';
    out += '\n';
    out += '<-1>Use this item to display a read-only On/Off value, e.g. the state of a digital input pin.\n';
    out += 'The <i><y>Leading Text</i> is displayed before the slider.';
    out += '  The <i><y>Trailing Text</i> is displayed after it.';
    out += '  <i><y>Low text</i> and <i><y>High text</i> label the two slider end positions.</-1>\n';
    out += '\n';
    out += '<-1>The pfodApp user cannot change this value — it is display only.';
    out += '  No command is ever sent to the pfodDevice when the user touches this item.</-1>\n';
    out += '\n';
    out += '<-1>To have the display update, go back to the <i><y>Editing Menu</i> screen';
    out += ' and set a <i><y>Refresh Interval</i> for the menu</-1>';
    out += '~' + EMIH_ONOFFDISPLAY_VERSION + '}';
    return out;
  }

  /// Render the Slider Input / PWM / Analog Output help screen.
  /// Wording from pfodDesignerV2 DesignerMsgProcessor.java editPWMHelp()
  /// (line 4443), title updated to match pfodWeb's item naming.
  /// @returns {string} full pfod menu response with version tag
  function _renderPWM() {
    let out = '{,' + DESIGNER_PROMPT_FMT + '~';
    out += '<b><+2>Editing Slider Input or PWM/Analog Output Help</+2></b>\n';
    out += '\n';
    out += '<-1>Use this menu item to send an integer value to your pfodDevice.';
    out += '  A preview of the slider is shown at the top of the screen, under the title.</-1>\n';
    out += '\n';
    out += '<-1>The slider sends an integer limited to the Data Variable Range.';
    out += '  You can use <i><y>Edit Data Variable Range</i> to edit the range covered by the slider.</-1>\n';
    out += '\n';
    out += '<-1>The number displayed to the user is the current value in the data range scaled to between Display Min and Display Max and';
    out += ' shown between the Leading and Trailing text.';
    out += '  You can edit the <i><y>Display Max</i> and <i><y>Display Min</i> strings to any valid floating point number.</-1>\n';
    out += '\n';
    out += '<-1>If you connect this slider to a PWM or DAC capable digital pin then it will output a variable PWM or Analog signal.</-1>\n';
    out += '\n';
    out += '<-1>Use <i><y>Delete Items</i>';
    out += ' on the <i><y>Editing Menu</i> screen to remove this item.</-1>';
    out += '~' + EMIH_PWM_VERSION + '}';
    return out;
  }

  /// Help-screen dispatch entry.  Picks the help screen by the active
  /// item's type; replies `{;}` to a matching version refresh so
  /// pfodWeb's cache stays warm.
  ///
  /// @param {string}        rawCmd — the inbound pfod cmd (`{dw}` or
  ///                                  `{<ver>:dw}` for the refresh case)
  /// @param {DesignerState} state
  /// @param {number}        depth  — index of 'd' in rawCmd
  /// @returns {{pfod: string, skipSave: boolean}}
  function send(rawCmd, state, depth) {
    const item = state.getActiveItem();
    // No active item means the user reached this handler via a stale
    // back-nav or a malformed cmd — return PFOD_EMPTY so pfodWeb
    // doesn't push a phantom navigation entry.  skipSave because the
    // help screen is read-only.
    if (!item) return { pfod: PFOD_EMPTY, skipSave: true };

    // Pick the per-type version BEFORE the refresh check — the
    // active item's type determines which version key pfodWeb's
    // refresh callback should match.
    let expectedVersion;
    if      (item.type === 'label')         expectedVersion = EMIH_LABEL_VERSION;
    else if (item.type === 'onoff')         expectedVersion = EMIH_ONOFF_VERSION;
    else if (item.type === 'onoffdisplay')  expectedVersion = EMIH_ONOFFDISPLAY_VERSION;
    else if (item.type === 'pwm')           expectedVersion = EMIH_PWM_VERSION;
    else                                    expectedVersion = EMIH_BUTTON_VERSION;

    const parsed = parseVersion(rawCmd);
    if (isVersionRefresh(parsed.version, expectedVersion)) {
      return { pfod: EMIH_REFRESH_REPLY, skipSave: true };
    }

    let pfod;
    if      (item.type === 'label')         pfod = _renderLabel();
    else if (item.type === 'onoff')         pfod = _renderOnOff();
    else if (item.type === 'onoffdisplay')  pfod = _renderOnOffDisplay();
    else if (item.type === 'pwm')           pfod = _renderPWM();
    else                                    pfod = _renderButton();
    return { pfod, skipSave: true };
  }

  return Object.freeze({ send });
})();

// Not registered top-level — editMenuItem.js's 'd' handler delegates
// here when it sees the 'w' sub-byte after 'd' (cmd `{dw}`).
