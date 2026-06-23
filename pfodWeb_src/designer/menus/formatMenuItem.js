/*
 * designer/menus/formatMenuItem.js
 *
 * "Change Item's Appearance" sub-screen — generic format-editor
 * reached by any caller that points state.formatItem at an object
 * carrying a `.formats` block and navigates to cmd 'F'.  Mutates
 * `.formats` in place; the caller picks up the changes via the same
 * JS reference on back-nav (no copy-out step needed — JS object
 * semantics).  state.formatItem MUST be set before navigation —
 * there is no fallback, so a stray `{F}` from a caller that forgot
 * to set it renders the "No item selected." prompt and exits.
 *
 * Today's caller is editMenuItem's "Change Item's Appearance" button
 * (bound to state.formatItem = state.getActiveItem() during the
 * parent's render).  Future callers (e.g. an edit-prompt screen,
 * or a different item-type editor) only need to:
 *   1. Set state.formatItem to the target object before rendering
 *      their `|F~Change Item's Appearance` button.
 *   2. Read mutated state.formatItem.formats after pfodWeb back-navs
 *      out of this screen.
 *
 * Carried controls:
 *   - Font Size slider               (Fs `<val>` apply)
 *   - Font Colour picker             (Fc → ?Fc selection → Fc`<idx>`)
 *   - Background Colour picker       (FB → ?FB selection → FB`<idx>`)
 *   - Bold / Italic / Underline      (Fb, Fi, Fu — toggles)
 *   - Flash / Sound                  (Ff, Fo — toggles)
 *
 * Why split out: the on/off + pulsed editor case adds Initial-state
 * and Pulse rows on top of the base editor; with all 8 format rows
 * still inline the response overflows pfod's 1024-byte cap.  Moving
 * them under a single "Change Item's Appearance" button keeps
 * editMenuItem under the limit and groups the format controls
 * logically.
 *
 * Layout mirrors editMenuItem — H1 heading + live-preview row + H2
 * "Options for changing the above menu item follow" — by calling
 * DesignerEditMenuItem.renderItemHeaderAndPreview with the heading
 * title "Change Item's Appearance".  Single source of truth for the
 * preview rendering across both screens.
 *
 * Update pattern matches editMenuItem: bare `{F}` returns a full
 * `{,…}` form (pushed onto pfodWeb's menuNavStack), every sub-cmd
 * (toggle / slider / colour-pick) returns `{;…}` so the screen
 * updates in place without adding stack entries.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

// Sub-cmd bytes inside the 'F' parent.  Names + values match
// editMenuItem's prior layout so the migration is mechanical.
const FMI_FONT_SIZE_CMD   = 's';
const FMI_FONT_COLOUR_CMD = 'c';
const FMI_BG_COLOUR_CMD   = 'B';
const FMI_BOLD_CMD        = 'b';
const FMI_ITALIC_CMD      = 'i';
const FMI_UNDERLINE_CMD   = 'u';
const FMI_FLASH_CMD       = 'f';
const FMI_SOUND_CMD       = 'o';

const FMI_FONT_SIZE_MAX = 12;
const FMI_FONT_SIZE_MIN = -6;

const DesignerFormatMenuItem = (() => {

  /// Resolve the item this screen edits.  Callers MUST set
  /// state.formatItem before navigating to `{F}` — no fallback to
  /// state.getActiveItem() so the format menu's contract stays
  /// explicit (caller hands a target in, gets the mutated target
  /// back on return).
  function _targetItem(state) {
    return state.formatItem;
  }

  /// Build the body shared by full-form `{,…}` and update `{;…}`.
  /// Layout:
  ///   1. H1 + preview + H2 (shared with editMenuItem)
  ///   2. Font Size slider
  ///   3. Font / Background colour pickers
  ///   4. Bold / Italic / Underline toggles
  ///   5. Flash / Sound toggles
  function _renderBody(state) {
    const item = _targetItem(state);
    if (!item) {
      return DESIGNER_PROMPT_FMT + '~No item selected.';
    }
    const fmt = item.formats;
    let out = DESIGNER_PROMPT_FMT + '~';
    out += DesignerEditMenuItem.renderItemHeaderAndPreview(state, item, "Change Item's Appearance");

    const fmt1 = '<-1>' + DESIGNER_MENU_FMT;

    // Font Size slider.
    out += '|F' + FMI_FONT_SIZE_CMD + fmt1;
    out += '`' + fmt.fontSize + '`' + FMI_FONT_SIZE_MAX + '`' + FMI_FONT_SIZE_MIN;
    out += '~Font Size ~~+' + FMI_FONT_SIZE_MAX + '~' + FMI_FONT_SIZE_MIN;

    // Colour pickers.
    out += '|F' + FMI_FONT_COLOUR_CMD + fmt1 + '~Set Font colour';
    out += '|F' + FMI_BG_COLOUR_CMD   + fmt1 + '~Set Background colour';

    // Sticky-format toggles (B/I/U).
    out += '|F' + FMI_BOLD_CMD      + fmt1 + '~' + (fmt.bold      ? 'Clear' : 'Set')    + ' <b>Bold</b>';
    out += '|F' + FMI_ITALIC_CMD    + fmt1 + '~' + (fmt.italic    ? 'Clear' : 'Set')    + ' <i>Italic</i>';
    out += '|F' + FMI_UNDERLINE_CMD + fmt1 + '~' + (fmt.underline ? 'Clear' : 'Set')    + ' <u>Underline</u>';

    // Non-sticky toggles (Flash/Sound).
    out += '|F' + FMI_FLASH_CMD + fmt1 + '~' + (fmt.flash ? 'Remove' : 'Set to') + ' Flash';
    out += '|F' + FMI_SOUND_CMD + fmt1 + '~' + (fmt.sound ? 'Remove' : 'Set to play') + ' sound';
    return out;
  }

  function _renderParentScreen(state) {
    return '{,' + _renderBody(state) + '}';
  }
  function _renderUpdateScreen(state) {
    return '{;' + _renderBody(state) + '}';
  }

  /// Toggle a boolean flag on the target's `.formats` and return the
  /// in-place `{;…}` update so the user stays on the Format screen.
  function _toggle(state, key) {
    const item = _targetItem(state);
    if (!item) return PFOD_EMPTY;
    item.formats[key] = !item.formats[key];
    state.save();
    return _renderUpdateScreen(state);
  }

  /// Apply a new font-size value from the slider's `<val>` payload.
  /// Clamps to the slider bounds so a stray cmd can't escape the
  /// validated range.
  function _applyFontSize(state, rawCmd, argStart) {
    if (rawCmd[argStart] !== '`') return _renderUpdateScreen(state);
    const val = parseInt(rawCmd.substring(argStart + 1, rawCmd.length - 1), 10);
    if (isNaN(val)) return _renderUpdateScreen(state);
    const item = _targetItem(state);
    if (!item) return PFOD_EMPTY;
    item.formats.fontSize = Math.max(FMI_FONT_SIZE_MIN, Math.min(FMI_FONT_SIZE_MAX, val));
    state.save();
    return _renderUpdateScreen(state);
  }

  /// Build the colour-picker selection screen.  pickerCmd is the
  /// FULL byte sequence pfodWeb echoes back on submit (so 'Fc' or
  /// 'FB'), matching the same convention addMenuItem uses.
  function _renderColourPicker(pickerCmd, promptText, currentCode) {
    const currentIdx = designerColourIndex(currentCode);
    let out = "{?" + pickerCmd + '`' + currentIdx + '~' + DESIGNER_PROMPT_FMT + promptText;
    for (let i = 0; i < DESIGNER_COLOUR_PALETTE.length; i++) {
      const entry = DESIGNER_COLOUR_PALETTE[i];
      if (entry.code === null) {
        out += '|<b>Default <gy>Default';
      } else {
        out += '|<b><i>' + entry.label + ' <' + entry.code + '>' + entry.label;
      }
    }
    out += '}';
    return out;
  }

  function _applyColour(state, rawCmd, argStart, formatKey, pickerCmd, pickerPrompt) {
    const item = _targetItem(state);
    if (!item) return PFOD_EMPTY;
    const currentCode = item.formats[formatKey];
    if (rawCmd[argStart] !== '`') {
      return { pfod: _renderColourPicker(pickerCmd, pickerPrompt, currentCode), skipSave: true };
    }
    const idx = parseInt(rawCmd.substring(argStart + 1, rawCmd.length - 1), 10);
    if (isNaN(idx)) return PFOD_EMPTY;
    item.formats[formatKey] = designerColourFromIndex(idx).code;
    state.save();
    return PFOD_EMPTY;
  }

  /// Dispatch handler.  depth = index of 'F' in rawCmd.  sub byte
  /// at depth+1 picks the action; arg bytes follow at depth+2.
  function send(rawCmd, state, depth) {
    const sub = rawCmd[depth + 1];
    if (sub === undefined || sub === '}') {
      return { pfod: _renderParentScreen(state), skipSave: true };
    }
    switch (sub) {
      case FMI_FONT_SIZE_CMD: return _applyFontSize(state, rawCmd, depth + 2);
      case FMI_BOLD_CMD:      return _toggle(state, 'bold');
      case FMI_ITALIC_CMD:    return _toggle(state, 'italic');
      case FMI_UNDERLINE_CMD: return _toggle(state, 'underline');
      case FMI_FLASH_CMD:     return _toggle(state, 'flash');
      case FMI_SOUND_CMD:     return _toggle(state, 'sound');
      case FMI_FONT_COLOUR_CMD:
        return _applyColour(state, rawCmd, depth + 2, 'fontColour',
                            'F' + FMI_FONT_COLOUR_CMD,
                            'Select Colour for Item Text');
      case FMI_BG_COLOUR_CMD:
        return _applyColour(state, rawCmd, depth + 2, 'bgColour',
                            'F' + FMI_BG_COLOUR_CMD,
                            'Select Background Colour for Item');
      default:
        return { pfod: _renderUpdateScreen(state), skipSave: true };
    }
  }

  return Object.freeze({ send });
})();

// Self-register the 'F' cmd byte into the top-level designer dispatcher.
DesignerDispatch.add('F', DesignerFormatMenuItem.send);
