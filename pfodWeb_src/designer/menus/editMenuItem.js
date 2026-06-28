/*
 * designer/menus/editMenuItem.js
 *
 * Handler for the 'd' (editMenuItemCmd) top-level cmd — the per-item
 * editor reached from Add Menu Item's Button / Label picks, and (in
 * later passes) from the Edit Menu Items list.  Operates on whichever
 * item is at state.activeItemIdx in the active menu.
 *
 * Wired in THIS pass (Button / Label only):
 *   - Edit text         ({dT — text-input subscreen})
 *   - Font Size slider  ({ds`<N>})
 *   - Bold / Italic / Underline toggles ({db}, {di}, {du})
 *   - Flash / Sound toggles ({df}, {do})
 *   - Font / Background colour pickers ({dc}, {dB})
 *   - Help              ({dw} — placeholder)
 *
 * Structure mirrors editPrompt.js — the format-edit fields are the
 * same set (sticky b/i/u/size/colour + non-sticky flash/sound) — but
 * the target object is state.getActiveItem().formats instead of the
 * active menu's promptFormat.  The buildPromptScreenFormat helper
 * (exposed from editPrompt.js) is re-used for the inline preview tags
 * since both prompt and item-text share the same pfod-format syntax.
 *
 * `{;…}` UPDATE PATTERN — same rationale as editPrompt.js: toggle and
 * slider responses use the in-place update so pfodWeb doesn't push
 * the toggle-cmd onto menuNavStack (which would force extra back-
 * presses).  Hitting `{d}` directly (i.e. a fresh navigation after
 * Add Menu Item) returns a full `{,…}` so the editor IS the new
 * navigation entry.
 *
 * No version tag, no trailing `~`.
 *
 * Origin: pfodDesignerV2/DesignerMsgProcessor.java editButton /
 *         editLabel (around line 4307 onwards).
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

// ── File-level constants ────────────────────────────────────────────

const EMI_EDIT_TEXT_CMD       = 'T';   // Edit text (text-input)
const EMI_FORMAT_MENU_CMD     = 'F';   // Format Menu Item sub-screen (top-level cmd)
const EMI_IO_PIN_CMD          = 'p';   // I/O pin connection — picker stub for now
const EMI_SWAP_ENDS_CMD       = 'S';   // On/Off: swap Low/High slider end labels
                                       // (matches Java DesignerMsgProcessor.java case 'S')
const EMI_IGNORE_CMD          = 'g';   // Toggle disabled (iGnore user input)
const EMI_TRAILING_TEXT_CMD   = 't';   // On/Off: Edit trailing text
const EMI_LOW_TEXT_CMD        = 'L';   // On/Off: Edit Low option text
const EMI_HIGH_TEXT_CMD       = 'H';   // On/Off: Edit High option text
const EMI_INITIAL_CMD         = 'I';   // On/Off: Toggle initial state (current 0<->1)
const EMI_DISPLAY_FORMAT_CMD  = 'z';   // On/Off / PWM: Toggle Display mode (Both / Text only / Slider only)
const EMI_MAX_SCALE_CMD       = 'x';   // PWM: Edit Display Max text (maxScaleStr)
const EMI_MIN_SCALE_CMD       = 'n';   // PWM: Edit Display Min text (minScaleStr)
const EMI_DATA_RANGE_CMD      = 'r';   // PWM: Edit Data Variable Range sub-screen
// Pulse settings live on a sibling top-level cmd 'O' (pulseEditor.js)
// — not a 'd' sub-cmd — because the sub-menu opens via a separate
// pfod navigation rather than re-rendering the editor in place.
const EMI_HELP_CMD            = 'w';   // Help (stub)

const EMI_HEADING_LABEL_CMD   = 'H';

const EMI_FONT_SIZE_MAX       = 12;
const EMI_FONT_SIZE_MIN       = -6;

// Max prompt length for the edit-text subscreen — matches the
// editMenuName / editPromptText caps (the input field's `<maxLen>`
// declaration).  Item text is single-line in pfodApp; cap chosen to
// match Java's V2_MenuItem default-text field length.
const EMI_TEXT_MAX_LEN        = 64;
const EMI_SCALE_TEXT_MAX_LEN  = 20;   // PWM display max/min scale strings (Java maxChars=20)
const EMI_DATA_RANGE_MAX_LEN  = 11;   // PWM data variable range integers (Java maxChars=11)
const EMI_TEXT_PROMPT_FILLER  = '\n\n';

// ── Handler ─────────────────────────────────────────────────────────

const DesignerEditMenuItem = (() => {

  /// Build the unique sub-menu-edit cmd for the item currently being
  /// edited.  Joins activeMenuPath + activeItemIdx with '_', prefixed by 's'.
  /// E.g. root item 2 → 's2'; sub-item 1 inside root item 2 → 's2_1'.
  /// @param {DesignerState} state
  /// @returns {string} cmd byte string for DesignerDispatch
  function _subMenuEditCmd(state) {
    return 's' + [...state.activeMenuPath, state.activeItemIdx].join('_');
  }

  /// Render the H1 + preview-row + H2 block shared between editMenuItem
  /// and the formatMenuItem sub-screen.  Takes the item to preview as
  /// an explicit argument so the helper isn't tied to state.getActiveItem()
  /// — callers handing a different target to the "Change Display Format"
  /// sub-screen can pass that target here too.  `headingTitle` lets each
  /// screen name itself ("Editing Menu Item" vs "Change Display Format")
  /// while keeping the layout / preview logic in a single place.
  /// Returns the partial body string starting with the leading `|`
  /// — caller concatenates onto the screen-format prefix.
  function renderItemHeaderAndPreview(state, item, headingTitle) {
    if (!item) return '';
    const fmt  = item.formats;
    const menu = state.getActiveMenu();
    const effFmt = {
      fontSize:   fmt.fontSize,
      bold:       fmt.bold,
      italic:     fmt.italic,
      underline:  fmt.underline,
      flash:      fmt.flash,
      sound:      fmt.sound,
      fontColour: fmt.fontColour !== null ? fmt.fontColour : menu.promptFormat.fontColour,
      bgColour:   fmt.bgColour   !== null ? fmt.bgColour   : menu.promptFormat.bgColour,
    };
    const previewSlot   = designerItemPrefix(effFmt);
    const previewInline = designerInlineFormat(effFmt);

    let out = '';
    // 1. Heading — design context.
    out += '|!H1<bg bl><w>~<b>' + headingTitle + ' from\n<l>' + state.name;

    // 2. Item preview — render with current format so the user sees
    // the button / label exactly as it will appear.  Buttons stay
    // CLICKABLE (no `!` prefix) so they read as real buttons; the
    // cmd byte is the unregistered placeholder "BB" rather than the
    // item's real cmd byte, so a click on the preview routes through
    // DesignerDispatch's no-route fallback and returns PFOD_EMPTY
    // (pfodWeb stays put).  Labels get the `!` prefix per pfod
    // convention — a label IS a disabled item.
    if (item.type === 'onoffdisplay') {
      const previewFmtChar = (item.displayFormat === 'text')   ? 't'
                           : (item.displayFormat === 'slider') ? 's'
                           : '';
      out += '|!BB' + previewSlot + '`' + item.current +
             '~' + previewInline + (item.text || '') +
             '~' + (item.trailingText || '') +
             '~' + (item.lowText || 'Low') + '\\' + (item.highText || 'High') +
             '~' + previewFmtChar;
    } else if (item.type === 'onoff') {
      const previewDisabledFlag = item.formats.disabled ? '!' : '';
      const previewFmtChar = (item.displayFormat === 'text')   ? 't'
                           : (item.displayFormat === 'slider') ? 's'
                           : '';
      out += '|BB' + previewDisabledFlag + previewSlot + '`' + item.current +
             '~' + previewInline + (item.text || '') +
             '~' + (item.trailingText || '') +
             '~' + (item.lowText || 'Low') + '\\' + (item.highText || 'High') +
             '~' + previewFmtChar;
    } else if (item.type === 'pwm') {
      const previewDisabledFlag = item.formats.disabled ? '!' : '';
      const previewFmtChar = (item.displayFormat === 'text')   ? 't'
                           : (item.displayFormat === 'slider') ? 's'
                           : '';
      out += '|BB' + previewDisabledFlag + previewSlot +
             '`' + item.currentValue +
             '~' + previewInline + (item.text || '') +
             '~' + (item.trailingText || '') +
             '`' + item.maxValue + '`' + item.minValue +
             '~' + (item.maxScaleStr || '') +
             '~' + (item.minScaleStr || '') +
             '~' + previewFmtChar;
    } else if (item.type === 'datadisplay') {
      const previewFmtChar = (item.displayFormat === 'text')   ? 't'
                           : (item.displayFormat === 'slider') ? 's'
                           : '';
      out += '|!BB' + previewSlot +
             '`' + item.currentValue +
             '~' + previewInline + (item.text || '') +
             '~' + (item.trailingText || '') +
             '`' + item.maxValue + '`' + item.minValue +
             '~' + (item.maxScaleStr || '') +
             '~' + (item.minScaleStr || '') +
             '~' + previewFmtChar;
    } else if (item.type === 'submenu') {
      out += '|!Z2<-6>~ ';
      out += '|' + _subMenuEditCmd(state) + previewSlot + '~' + previewInline + (item.text || '');
      out += '|!Z3<-6>~ ';
    } else if (item.type === 'chart') {
      // Preview button uses 'R' so clicking it opens the chart editor.
      // Thin spacers above and below match the editChart.js heading layout.
      // The disabled flag mirrors the item's current disabled state.
      const previewDisabledFlag = item.formats.disabled ? '!' : '';
      out += '|!Z2<-6>~ ';
      out += '|R' + previewDisabledFlag + previewSlot + '~' + previewInline + (item.text || '');
      out += '|!Z3<-6>~ ';
    } else if (item.type === 'drawing') {
      // Drawing preview: pfod dwg button auto-fetches {dP} which returns the
      // placeholder drawing. Tap-cmd BB = unregistered → PFOD_EMPTY → stays put.
      out += '|!Z2<-6>~ ';
      out += '|+BB' + previewSlot + '~dP';
      out += '|!Z3<-6>~ ';
    } else {
      const previewLabelPrefix  = (item.type === 'label') ? '!' : '';
      const previewDisabledFlag = (item.type !== 'label' && item.formats.disabled) ? '!' : '';
      out += '|' + previewLabelPrefix + 'BB' + previewDisabledFlag + previewSlot +
             '~' + previewInline + item.text;
    }

    // 3. "Options for changing" heading.  For chart items the yellow hint is
    // embedded in the same row (inline below the heading text) so that only
    // one label item separates the preview from the format options.
    // Drawing items get a placeholder message instead — no edit options yet.
    if (item.type === 'chart') {
      out += '|!H2<bg bl><w>~<-2><y><i>Click the button above to edit the plot settings</y>\n' +
             '<b><i>Options for changing the above\nmenu item follow';
    } else if (item.type === 'drawing') {
      out += '|!H2<bg bl><w>~<-2>This is placeholder drawing to be coded later\nUse the back arrow key to return.';
    } else {
      out += '|!H2<bg bl><w>~<-2><b><i>Options for changing the above\nmenu item follow';
    }
    return out;
  }

  /// Build the body shared by full-form `{,…}` and update `{;…}`
  /// renders.  The live-preview prompt at the screen header shows the
  /// item's text rendered with its current format (mirrors how
  /// editPrompt shows the prompt's live preview).
  function _renderBody(state) {
    const item = state.getActiveItem();
    // Fallback: no active item (stale handler reach).  Render an info
    // line in the prompt area so the user isn't on a blank screen.
    if (!item) {
      return DESIGNER_PROMPT_FMT + '~No item selected.';
    }
    const fmt = item.formats;
    // Screen prompt area stays empty — the editor's structure lives
    // entirely in the items list (matches Java, which never puts
    // text in the prompt area of the editMenuItem screen).
    let out = DESIGNER_PROMPT_FMT + '~';
    out += renderItemHeaderAndPreview(state, item, 'Editing Menu Item');

    if (item.type === 'drawing') return out;

    // Bind the active item as the target of the "Change Item's
    // Appearance" sub-screen — the format handler reads
    // state.formatItem to know what to mutate.  Set during render
    // so the next user click on the F button picks up the right
    // target without an extra round-trip.  Side-effect-on-render
    // is benign because the pointer just tracks whatever was active
    // when the page rendered.
    state.formatItem = item;

    // 4. Format buttons rendered at <-1> for compactness (matches
    // Java's getEditPromptMenuItems format choice).
    const fmt1 = '<-1>' + DESIGNER_MENU_FMT;

    // I/O pin connection — first row under "Options for changing".
    // Only rendered for item types that can drive / read a hardware
    // pin.  Matches Java DesignerMsgProcessor.java line ~2175
    // (MENU_ITEM_ON_OFF / INPUT_DISPLAY / ADC_DISPLAY / PWM_SLIDER).
    // Labels, buttons, charts, drawings and sub-menus are pure-UI —
    // showing a pin row on them would be meaningless.  Today shows
    // the static "Not connected to an I/O pin" label (pin picker is
    // a placeholder cmd that just re-renders this screen).  Yellow-
    // italic "Click here to change" hint sits below so the
    // affordance is obvious.
    const itemHasPin = (item.type === 'onoff'
                     || item.type === 'onoffdisplay'
                     || item.type === 'pwm'
                     || item.type === 'datadisplay');
    if (itemHasPin) {
      // Targets with no routable pins (e.g. the Minimal C Code board)
      // have nothing for the picker to offer — disable the row instead
      // of opening a picker with only "Not connected" in it.
      const hasPins = state.board.pins.length > 0;
      const pinLabel = !hasPins ? 'No I/O pins defined'
                      : item.pin ? 'Connected to ' + item.pin.name
                      : 'Not connected to an I/O pin';
      const pinFmt = hasPins ? fmt1 : ('<-1>' + DESIGNER_DISABLED_FMT);
      out += '|d' + EMI_IO_PIN_CMD + pinFmt + '~' + pinLabel;
      if (hasPins) out += '\n<-3>' + EM_HINT_COLOUR + '<i>Click here to change';
    }

    // Change Item's Appearance — opens the sub-screen carrying
    // font size / font + background colour pickers / B/I/U + Flash/
    // Sound toggles.  Pulled out of this screen so the on/off+pulsed
    // case (with its extra Initial-state + Pulse rows) stays under
    // pfod's 1024-byte response cap.  See designer/menus/formatMenuItem.js
    // for the sub-menu (top-level cmd 'F').
    out += '|' + EMI_FORMAT_MENU_CMD + fmt1 + "~Change Item's Appearance";

    // On/Off display-format toggle — 3-option picker (Text and
    // Slider / Text only / Slider only).  Same intent as
    // DesignerMsgProcessor.java line 2137-2139 with two pfodWeb-
    // specific tweaks:
    //   - The `<-2>` size goes INLINE in the leading text rather
    //     than in the format slot.  pfodWeb's slot tags are
    //     applied via element-level CSS (applyPfodFormats) while
    //     inline tags walk pfodSetFormattedText's separate stack,
    //     so a slot `<-2>` can't be closed by an inline `</-2>`
    //     in the trailing text — Java's trailing `</-2>` would
    //     render as a literal `</-2>` visible in the row.  Move
    //     the open tag inline and the auto-close-at-end-of-text
    //     rule handles the rest.
    //   - Drop the explicit `</-2>` in the trailing for the same
    //     reason.  The `<-3>` inline that follows compounds on
    //     top of `<-2>` so the "Click here to change" hint reads
    //     at -5 size, close to Java's intended -3 hint size after
    //     close-then-reopen.
    // Trailing `~t` format char makes the OPTIONS render as a
    // text picker rather than as a slider (pfodMenuParser:256).
    if (item.type === 'pwm') {
      // PWM has only two valid display formats: both and slider-only.
      // "Text only" is not valid for a slider item (Java lines 1950-1954).
      const displayIdx = (item.displayFormat === 'slider') ? 1 : 0;
      out += '|d' + EMI_DISPLAY_FORMAT_CMD + DESIGNER_MENU_FMT;
      out += '`' + displayIdx;
      out += '~<-2>Display ';
      out += '~\n<-3><b><y>Click here to change';
      out += '~Text and Slider\\Slider only~t';
    } else if (item.type === 'onoff' || item.type === 'onoffdisplay' || item.type === 'datadisplay') {
      const displayIdx = Math.max(0, DISPLAY_FORMATS.indexOf(item.displayFormat));
      out += '|d' + EMI_DISPLAY_FORMAT_CMD + DESIGNER_MENU_FMT;
      out += '`' + displayIdx;
      out += '~<-2>Display ';
      out += '~\n<-3><b><y>Click here to change';
      out += '~Text and Slider\\Text only\\Slider only~t';
    }

    // Text-edit rows: differ by item type.  On/Off has four text
    // fields (leading + trailing + low option label + high option
    // label); buttons / labels have just the single text field.
    // Java's DesignerMsgProcessor.java line 2140-2149 lays out the
    // on/off case the same way.
    //
    // The Low/High row labels embed the current option text in
    // quotes.  Replace `\n` with space and trim so a multi-line
    // user-entered value doesn't break the row into multiple lines
    // — mirrors V2_MenuItem.getLeadingTextNoFormat (the same Java
    // helper move/delete/edit-menu-items rows already use).
    const labelFromText = (s, fallback) => {
      const trimmed = (s || '').replace(/\n/g, ' ').trim();
      return trimmed.length > 0 ? trimmed : fallback;
    };
    if (item.type === 'onoff' || item.type === 'onoffdisplay') {
      // Match Java's emit at DesignerMsgProcessor.java:2140-2149,
      // trimmed for the 1024-byte response cap: size tags INLINE
      // in the text so the lowText / highText values themselves
      // render at default size while the surrounding "Edit ...
      // text" framing reads smaller.  The Java second line "for
      // output low|high" is omitted — pfodWeb has no hardware
      // pin connection so the low/high pairing is already obvious
      // from the embedded value, and dropping it saves the ~34
      // bytes that previously pushed the editor screen over the
      // limit.
      out += '|d' + EMI_EDIT_TEXT_CMD     + DESIGNER_MENU_FMT + '~<-2>Edit Leading Text';
      out += '|d' + EMI_TRAILING_TEXT_CMD + DESIGNER_MENU_FMT + '~<-2>Edit Trailing Text';
      out += '|d' + EMI_LOW_TEXT_CMD      + DESIGNER_MENU_FMT + '~<-2>Edit</-2> ';
      out += labelFromText(item.lowText,  'Low')  + ' <-2>text';
      out += '|d' + EMI_HIGH_TEXT_CMD     + DESIGNER_MENU_FMT + '~<-2>Edit</-2> ';
      out += labelFromText(item.highText, 'High') + ' <-2>text';
      // Swap Slider Ends — only for on/off (has no meaning for display items)
      if (item.type === 'onoff') {
        out += '|d' + EMI_SWAP_ENDS_CMD + DESIGNER_MENU_FMT + '~<-2>Swap Slider Ends';
      }
    } else if (item.type === 'pwm') {
      // Java DesignerMsgProcessor.java:2160-2168 — leading text, trailing
      // text, display max/min scale strings, and data variable range.
      out += '|d' + EMI_EDIT_TEXT_CMD     + DESIGNER_MENU_FMT + '~<-2>Edit Leading Text';
      out += '|d' + EMI_TRAILING_TEXT_CMD + DESIGNER_MENU_FMT + '~<-2>Edit Trailing Text';
      out += '|d' + EMI_MAX_SCALE_CMD     + DESIGNER_MENU_FMT + '~<-2>Edit Display Max';
      out += '|d' + EMI_MIN_SCALE_CMD     + DESIGNER_MENU_FMT + '~<-2>Edit Display Min';
      out += '|d' + EMI_DATA_RANGE_CMD    + DESIGNER_MENU_FMT + '~<-2>Edit Data Variable Range\n';
      out += '<-2>Currently (' + item.minValue + ' to ' + item.maxValue + ')';
    } else if (item.type === 'datadisplay') {
      out += '|d' + EMI_EDIT_TEXT_CMD     + DESIGNER_MENU_FMT + '~<-2>Edit Leading Text';
      out += '|d' + EMI_TRAILING_TEXT_CMD + DESIGNER_MENU_FMT + '~<-2>Edit Units';
      out += '|d' + EMI_MAX_SCALE_CMD     + DESIGNER_MENU_FMT + '~<-2>Edit Display Max';
      out += '|d' + EMI_MIN_SCALE_CMD     + DESIGNER_MENU_FMT + '~<-2>Edit Display Min';
      out += '|d' + EMI_DATA_RANGE_CMD    + DESIGNER_MENU_FMT + '~<-2>Edit Data Variable Range\n';
      out += '<-2>Currently (' + item.minValue + ' to ' + item.maxValue + ')';
    } else if (item.type === 'submenu') {
      out += '|' + _subMenuEditCmd(state) + fmt1 + '~Edit Sub-menu Contents';
      out += '|d' + EMI_EDIT_TEXT_CMD    + fmt1 + '~Edit Button Text';
    } else if (item.type === 'chart') {
      out += '|d' + EMI_EDIT_TEXT_CMD + fmt1 + '~Edit Text';
    } else {
      out += '|d' + EMI_EDIT_TEXT_CMD + fmt1 + '~Edit Text';
    }

    // Font Size slider + colour pickers + B/I/U + Flash/Sound moved
    // to the Format Menu Item sub-screen above — those rows alone
    // are ~250 bytes and the on/off+pulsed case overflows pfod's
    // 1024-byte cap when they're inline here.

    // User Input Disabled toggle — shown for every NON-label item
    // (Java's `if ((!isLabel) && (!isPrompt))` at
    // DesignerMsgProcessor.java line 2491).  Buttons and on/off
    // items both have a clickable / non-interactive choice; labels
    // are inherently non-interactive via the `!` slot prefix so
    // the toggle wouldn't mean anything for them.  Two-line label
    // per Java line 2492-2494:
    //   <toggle text>
    //   <-3><b><y>Click here to change
    if (item.type !== 'label' && item.type !== 'onoffdisplay' && item.type !== 'datadisplay' && item.type !== 'submenu') {
      out += '|d' + EMI_IGNORE_CMD + fmt1 + '~';
      out += (fmt.disabled ? 'User input Disabled' : 'Responds to User Input');
      out += '\n<-3><b><y>Click here to change';
    }

    // On/Off-only: initial state row + pulse sub-menu button.
    //   Initial state — visible only when pulse='none' (Java line
    //     2190 `if (PulseEnum.NONE.equals(...))`; a pulsed output
    //     toggles each click so it has no persistent rest state to
    //     set).
    //   Pulse — opens the pulse sub-menu (cmd 'O' = Java's
    //     setOutputPulseCmd).  Button label inlines the current
    //     pulse state, matching Java's emit at line 2208-2217 —
    //     "Output is not pulsed." when none, otherwise
    //     "Output is pulsed <LOW|HIGH> for <duration>".
    if (item.type === 'onoff') {
      if (item.pulse === 'none') {
        out += '|d' + EMI_INITIAL_CMD + fmt1 + '~';
        out += '<-1>On power up and after reset\n';
        out += 'Output is <b>' + (item.current === 1 ? 'HIGH' : 'LOW') + '</b>';
        out += '\n<-3><b><y>Click here to change';
      }
      out += '|O' + fmt1 + '~';
      if (item.pulse === 'none') {
        out += 'Output is not pulsed.';
      } else {
        // Waveform glyphs use U+2502 BOX DRAWINGS LIGHT VERTICAL
        // `│` (NOT the ASCII pipe `|` U+007C) for the same reason
        // pulseEditor.js's PULSE_TYPE_MENU_STRING does: a raw
        // pipe inside item text is pfod's menu-item separator
        // and would split this row up; the `&#124;` escape works
        // here on a regular button but is inconsistent inside
        // toggle-option strings (see pulseEditor.js for why), so
        // U+2502 is the single solution that works in both spots.
        const menuText = (item.pulse === 'high')
          ? 'Pulsed High (│‾│)'
          : 'Pulsed Low (│_│)';
        out += 'Output is ' + menuText;
        out += '\n<b>' + _formatPulseDuration(item.pulse_ms) + '</b>';
      }
      out += '\n<-3><b><y>Click here to change';
    }

    // 5. Help.
    out += '|d' + EMI_HELP_CMD + fmt1 + '~Help';
    return out;
  }

  function _renderParentScreen(state) {
    return '{,' + _renderBody(state) + '}';
  }

  function _renderUpdateScreen(state) {
    return '{;' + _renderBody(state) + '}';
  }

  /// Render a text-input subscreen.  Submit returns to this 'd'
  /// handler via `{d<subCmd>~<typed>}` which routes back through
  /// the dispatch switch to the matching apply path.  Same shape
  /// is used for every text field (leading, trailing, low, high)
  /// — only the sub-cmd byte, prompt line, and seeded text differ.
  /// Optional maxLen overrides EMI_TEXT_MAX_LEN (used for scale
  /// strings and data-range integers which have smaller Java caps).
  function _renderTextInput(subCmd, promptLine, currentValue, maxLen) {
    const len = (maxLen !== undefined) ? maxLen : EMI_TEXT_MAX_LEN;
    let out = "{'d" + subCmd + '`' + len + '~' + DESIGNER_PROMPT_FMT;
    out += '\n<+1>' + promptLine + '\n';
    out += '(Max ' + len + ' characters)';
    out += EMI_TEXT_PROMPT_FILLER;
    out += '|' + currentValue;
    out += '}';
    return out;
  }

  /// Render the Data Variable Range sub-screen.  A full `{,`
  /// navigation — two buttons to edit max and min values.
  /// Java: DesignerMsgProcessor.java editMenuItemDataRange() line 3683.
  function _renderDataRangeScreen(state) {
    const item = state.getActiveItem();
    if (!item) return PFOD_EMPTY;
    const fmt1 = '<-1>' + DESIGNER_MENU_FMT;
    let out = '{,' + DESIGNER_PROMPT_FMT + '~';
    out += '<b><+2>Set the Data Variable Range</+2></b>\n';
    out += '<-1>Set the maximum and minimum integer values that the data variable will/can have.';
    out += '|drM' + fmt1 + '~Edit Maximum Value\n<-2>(Currently set to ' + item.maxValue + ')';
    out += '|drm' + fmt1 + '~Edit Minimum Value\n<-2>(Currently set to ' + item.minValue + ')';
    out += '}';
    return out;
  }

  /// Handle data-range sub-screen dispatch.  depth = index of 'd'.
  ///   {dr}          → render data range sub-screen
  ///   {drM}         → render text-input for max value
  ///   {drMT~<val>}  → apply max value
  ///   {drm}         → render text-input for min value
  ///   {drmT~<val>}  → apply min value
  /// Java: editMenuItemDataRange / editDataRange lines 3680-3756.
  function _handleDataRange(rawCmd, state, depth) {
    const item = state.getActiveItem();
    if (!item) return PFOD_EMPTY;
    const next = rawCmd[depth + 2];
    if (next === undefined || next === '}') {
      return { pfod: _renderDataRangeScreen(state), skipSave: true };
    }
    const isMax = (next === 'M');
    const isMin = (next === 'm');
    if (!isMax && !isMin) return { pfod: _renderUpdateScreen(state), skipSave: true };
    const afterMm = rawCmd[depth + 3];
    if (afterMm !== undefined && afterMm !== '}' && rawCmd[depth + 4] === '~') {
      // {drMT~<val>} or {drmT~<val>} — apply
      const valStr = rawCmd.substring(depth + 5, rawCmd.length - 1).trim();
      const num = parseInt(valStr, 10);
      if (!isNaN(num)) {
        if (isMax) item.maxValue = num;
        else       item.minValue = num;
        state.save();
      }
      return PFOD_EMPTY;
    }
    // Bare {drM} or {drm} — render text-input
    const subCmd = 'r' + next + 'T';
    const promptLine = isMax
      ? 'Edit <b>Maximum</b> Value\nfor the Data variable.\nAs an integer in the range -2,147,483,647 to 2,147,483,646'
      : 'Edit <b>Minimum</b> Value\nfor the Data variable.\nAs an integer in the range -2,147,483,647 to 2,147,483,646';
    const currentVal = String(isMax ? item.maxValue : item.minValue);
    return { pfod: _renderTextInput(subCmd, promptLine, currentVal, EMI_DATA_RANGE_MAX_LEN), skipSave: true };
  }

  /// Apply the user's submitted text to `fieldKey` on the active
  /// item.  argStart = index of the `~` after the sub-cmd byte.
  /// Returns PFOD_EMPTY so pfodWeb's queued back-nav fetches the
  /// parent (item editor) refreshed.
  function _applyTextField(state, rawCmd, argStart, fieldKey) {
    if (rawCmd[argStart] !== '~') return PFOD_EMPTY;
    const item = state.getActiveItem();
    if (!item) return PFOD_EMPTY;
    item[fieldKey] = rawCmd.substring(argStart + 1, rawCmd.length - 1);
    if (fieldKey === 'text') {
      item.autoCmd = _makeAutoCmd(item.type, item.text, state.getAllItems().filter(it => it !== item));
    }
    state.save();
    return PFOD_EMPTY;
  }

  /// Toggle the on/off item's `current` field between 0 and 1
  /// (initial-state Low <-> High).  Distinct from _toggle because
  /// the value isn't a boolean and lives directly on the item, not
  /// on item.formats.
  function _toggleCurrent(state) {
    const item = state.getActiveItem();
    if (!item) return PFOD_EMPTY;
    item.current = (item.current === 1) ? 0 : 1;
    state.save();
    return _renderUpdateScreen(state);
  }

  /// Apply the display-format picker's submit.  rawCmd shape:
  /// `{dz`<idx>}`.  argStart points to the backtick.  Maps the
  /// 0/1/2 index to 'both' / 'text' / 'slider' via DISPLAY_FORMATS.
  function _applyDisplayFormat(state, rawCmd, argStart) {
    if (rawCmd[argStart] !== '`') return _renderUpdateScreen(state);
    const idx = parseInt(rawCmd.substring(argStart + 1, rawCmd.length - 1), 10);
    if (isNaN(idx) || idx < 0 || idx >= DISPLAY_FORMATS.length) {
      return _renderUpdateScreen(state);
    }
    const item = state.getActiveItem();
    if (!item) return PFOD_EMPTY;
    if (item.type === 'pwm') {
      // 2-option picker: 0 = both, 1 = slider.
      item.displayFormat = (idx === 1) ? 'slider' : 'both';
    } else {
      item.displayFormat = DISPLAY_FORMATS[idx];
    }
    state.save();
    return _renderUpdateScreen(state);
  }

  /// Pulse duration in the same `Nd H:MM:SS.s` shape Java's
  /// PulseMsgProcessor.getPulseIntervalStr (line 182-205) emits
  /// inside the pulse sub-menu's prompt, but with any leading
  /// all-zero components dropped — `0d ` is skipped when days=0,
  /// `0:` is skipped when hrs=0 (and days=0), `0:` is skipped
  /// again when mins=0 (and hrs+days=0).  Lowest unit shown is
  /// always `<secs>.<tenths>` so the trailing decimal stays
  /// readable even for sub-second pulses (e.g. 100 ms → "0.1").
  /// Granularity matches the pulse editor (100 ms — the sec_10
  /// slider's resolution).
  function _formatPulseDuration(ms) {
    if (ms < 0) ms = 0;
    ms = Math.round(ms / 100) * 100;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const HR_MS  = 60 * 60 * 1000;
    const MIN_MS = 60 * 1000;
    const SEC_MS = 1000;
    const days = Math.floor(ms / DAY_MS); ms -= days * DAY_MS;
    const hrs  = Math.floor(ms / HR_MS);  ms -= hrs  * HR_MS;
    const mins = Math.floor(ms / MIN_MS); ms -= mins * MIN_MS;
    const secs = Math.floor(ms / SEC_MS); ms -= secs * SEC_MS;
    const tenths = Math.floor(ms / 100);
    const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
    if (days > 0) return days + 'd ' + hrs + ':' + pad2(mins) + ':' + pad2(secs) + '.' + tenths;
    if (hrs  > 0) return hrs  + ':' + pad2(mins) + ':' + pad2(secs) + '.' + tenths;
    if (mins > 0) return mins + ':' + pad2(secs) + '.' + tenths;
    return secs + '.' + tenths;
  }

  /// Toggle a boolean flag on item.formats.  Only used here for the
  /// 'g' (User Input Disabled) toggle now that the b/i/u/f/o toggles
  /// live on the Format Menu Item sub-screen.
  function _toggle(state, key) {
    const item = state.getActiveItem();
    if (!item) return PFOD_EMPTY;
    item.formats[key] = !item.formats[key];
    state.save();
    return _renderUpdateScreen(state);
  }

  /// Swap the on/off item's low + high end labels.  Mirrors Java
  /// DesignerMsgProcessor.java case 'S' (around line 1975):
  ///
  ///   currentMenuItem.getPin().invert();
  ///   String s = lowStr; lowStr = highStr; highStr = s;
  ///   currentMenuItem.updateTextSelectionsValue(lowStr + "\\" + highStr);
  ///
  /// No-op on non-onoff items (the row only renders for onoff so this
  /// is defensive only).  Re-render in place so the user sees both
  /// the Edit Low / Edit High rows show the swapped values immediately.
  function _swapSliderEnds(state) {
    const item = state.getActiveItem();
    if (!item || item.type !== 'onoff') return _renderUpdateScreen(state);
    const tmp = item.lowText;
    item.lowText  = item.highText;
    item.highText = tmp;
    if (item.pin) item.pin.invertOutput = !item.pin.invertOutput;
    state.save();
    return _renderUpdateScreen(state);
  }

  // Help is rendered by the sibling editMenuItemHelp.js so the
  // type-specific Button vs Label text + per-type version tags can
  // live alongside the static help-screen pattern (see
  // editPromptHelp.js for the same arrangement).

  /// Dispatch handler.  depth = index of 'd' in rawCmd.  sub byte
  /// at depth+1 picks the action; arg bytes follow at depth+2.
  function send(rawCmd, state, depth) {
    const sub = rawCmd[depth + 1];

    if (sub === undefined || sub === '}') {
      // Restore parent item-editor context when pfodApp back-navigates from
      // a sub-menu editMenu to here.  Pop the contextStack frame pushed by
      // handleSubMenuEntry when {s<path>} entered that sub-menu.
      if (state.activeItemIdx === null && state.contextStack.length > 0) {
        const frame = state.contextStack.pop();
        state.activeMenuPath = frame.menuPath;
        state.activeItemIdx  = frame.itemIdx;
        console.error('[Designer] {d} context-restore: popped frame=' +
                      JSON.stringify(frame) + ', stack depth now=' + state.contextStack.length);
        state.save();
      } else {
        console.error('[Designer] {d}: rendering item editor — idx=' + state.activeItemIdx +
                      ' path=' + JSON.stringify(state.activeMenuPath) +
                      ' stack=' + state.contextStack.length);
      }
      return { pfod: _renderParentScreen(state), skipSave: true };
    }

    // Inline helper for text-field edits — bare `{d<sub>}` renders
    // the input screen, `{d<sub>~<typed>}` applies.  Optional maxLen
    // overrides the default text-input length cap.
    const textEdit = (subCmdByte, fieldKey, promptLine, maxLen) => {
      if (rawCmd[depth + 2] === '~') {
        return _applyTextField(state, rawCmd, depth + 2, fieldKey);
      }
      const item = state.getActiveItem();
      if (!item) return PFOD_EMPTY;
      return { pfod: _renderTextInput(subCmdByte, promptLine, item[fieldKey] || '', maxLen), skipSave: true };
    };

    switch (sub) {
      case EMI_EDIT_TEXT_CMD: {
        const item = state.getActiveItem();
        const promptLine = (item && (item.type === 'onoff' || item.type === 'onoffdisplay')) ? 'Edit Leading Text' : 'Edit Item Text';
        return textEdit(EMI_EDIT_TEXT_CMD, 'text', promptLine);
      }
      case EMI_TRAILING_TEXT_CMD:
        return textEdit(EMI_TRAILING_TEXT_CMD, 'trailingText', 'Edit Trailing Text');
      case EMI_LOW_TEXT_CMD:
        return textEdit(EMI_LOW_TEXT_CMD,      'lowText',      'Edit Low Text');
      case EMI_HIGH_TEXT_CMD:
        return textEdit(EMI_HIGH_TEXT_CMD,     'highText',     'Edit High Text');
      case EMI_IGNORE_CMD:    return _toggle(state, 'disabled');
      case EMI_INITIAL_CMD:   return _toggleCurrent(state);
      case EMI_SWAP_ENDS_CMD: return _swapSliderEnds(state);
      case EMI_IO_PIN_CMD:
        return DesignerEditMenuItemPin.send(rawCmd, state, depth);
      case EMI_DISPLAY_FORMAT_CMD:
        return _applyDisplayFormat(state, rawCmd, depth + 2);
      case EMI_MAX_SCALE_CMD:
        return textEdit(EMI_MAX_SCALE_CMD, 'maxScaleStr',
          'Enter the number to display for the Maximum value\n' +
          'This scales the slider value and is for display only.',
          EMI_SCALE_TEXT_MAX_LEN);
      case EMI_MIN_SCALE_CMD:
        return textEdit(EMI_MIN_SCALE_CMD, 'minScaleStr',
          'Enter the number to display for the Minimum value\n' +
          'This scales the slider value and is for display only.',
          EMI_SCALE_TEXT_MAX_LEN);
      case EMI_DATA_RANGE_CMD:
        return _handleDataRange(rawCmd, state, depth);
      case EMI_HELP_CMD:
        return DesignerEditMenuItemHelp.send(rawCmd, state, depth);
      case 'P':
        return { pfod: DesignerPreviewMenu.getPlaceholderDrawing(), skipSave: true };

      // Chart inline format sub-cmds ('ds','db','di','du','dc','dB').
      // Only active when the current item is a chart (these byte values
      // are unused by every other item type's editor).
      case 's': {
        const it = state.getActiveItem();
        if (!it || it.type !== ITEM_TYPE_CHART) return { pfod: _renderUpdateScreen(state), skipSave: true };
        if (rawCmd[depth + 2] === '`') {
          const sz = parseInt(rawCmd.substring(depth + 3, rawCmd.length - 1), 10);
          if (!isNaN(sz) && sz >= EMI_FONT_SIZE_MIN && sz <= EMI_FONT_SIZE_MAX) {
            it.formats.fontSize = sz;
            state.save();
          }
        }
        return _renderUpdateScreen(state);
      }
      case 'b': {
        const it = state.getActiveItem();
        if (!it || it.type !== ITEM_TYPE_CHART) return { pfod: _renderUpdateScreen(state), skipSave: true };
        it.formats.bold = !it.formats.bold;
        state.save();
        return _renderUpdateScreen(state);
      }
      case 'i': {
        const it = state.getActiveItem();
        if (!it || it.type !== ITEM_TYPE_CHART) return { pfod: _renderUpdateScreen(state), skipSave: true };
        it.formats.italic = !it.formats.italic;
        state.save();
        return _renderUpdateScreen(state);
      }
      case 'u': {
        const it = state.getActiveItem();
        if (!it || it.type !== ITEM_TYPE_CHART) return { pfod: _renderUpdateScreen(state), skipSave: true };
        it.formats.underline = !it.formats.underline;
        state.save();
        return _renderUpdateScreen(state);
      }
      case 'c': {
        // {dc} → show font colour picker; {dc`<idx>} → apply selection.
        const it = state.getActiveItem();
        if (!it || it.type !== ITEM_TYPE_CHART) return { pfod: _renderUpdateScreen(state), skipSave: true };
        if (rawCmd[depth + 2] === '`') {
          const idx = parseInt(rawCmd.substring(depth + 3, rawCmd.length - 1), 10);
          it.formats.fontColour = designerColourFromIndex(idx).code;
          state.save();
          return PFOD_EMPTY;
        }
        const currFc = designerColourIndex(it.formats.fontColour);
        let fcPicker = '{?dc`' + currFc + '~' + DESIGNER_PROMPT_FMT + 'Select Font Colour';
        for (const entry of DESIGNER_COLOUR_PALETTE) fcPicker += '|' + entry.label;
        fcPicker += '}';
        return { pfod: fcPicker, skipSave: true };
      }
      case 'B': {
        // {dB} → show background colour picker; {dB`<idx>} → apply selection.
        const it = state.getActiveItem();
        if (!it || it.type !== ITEM_TYPE_CHART) return { pfod: _renderUpdateScreen(state), skipSave: true };
        if (rawCmd[depth + 2] === '`') {
          const idx = parseInt(rawCmd.substring(depth + 3, rawCmd.length - 1), 10);
          it.formats.bgColour = designerColourFromIndex(idx).code;
          state.save();
          return PFOD_EMPTY;
        }
        const currBg = designerColourIndex(it.formats.bgColour);
        let bgPicker = '{?dB`' + currBg + '~' + DESIGNER_PROMPT_FMT + 'Select Background Colour';
        for (const entry of DESIGNER_COLOUR_PALETTE) bgPicker += '|' + entry.label;
        bgPicker += '}';
        return { pfod: bgPicker, skipSave: true };
      }

      default:
        return { pfod: _renderUpdateScreen(state), skipSave: true };
    }
  }

  return Object.freeze({ send, renderItemHeaderAndPreview });
})();

/// Handle s<path> cmd — navigate the editor into the sub-menu at the
/// given path.  path is an underscore-joined list of 0-based item indices
/// from the root (e.g. "1" → root item 1; "1_3" → sub-item 3 of root item 1).
/// Idempotent: re-sending the same s<path> re-renders the editMenu for that
/// level, which is exactly what pfodApp does when back-navigating from a
/// nested screen that was reached from this sub-menu editor.
/// @param {string}        rawCmd  full raw cmd including braces
/// @param {DesignerState} state
/// @param {number}        depth  index of 's' in rawCmd
/// @returns {{pfod: string, skipSave: boolean}}
function handleSubMenuEntry(rawCmd, state, depth) {
  const pathStr = rawCmd.substring(depth + 1, rawCmd.length - 1);
  if (!pathStr) return PFOD_EMPTY;
  const indices = pathStr.split('_').map(p => parseInt(p, 10));
  if (indices.some(n => isNaN(n))) return PFOD_EMPTY;

  const isSamePath = (state.activeMenuPath.length === indices.length &&
                      state.activeMenuPath.every((v, i) => v === indices[i]));

  if (!isSamePath) {
    // Case A: fresh navigation into a different sub-menu level.
    // Push current {menuPath, itemIdx} onto contextStack so {d} bare-restore
    // can return exactly here later.
    const frame = { menuPath: state.activeMenuPath.slice(), itemIdx: state.activeItemIdx };
    state.contextStack.push(frame);
    state.activeMenuPath     = indices;
    state.activeItemIdx      = null;
    state._pendingNewItemIdx = null;
    console.error('[Designer] handleSubMenuEntry {' + pathStr + '}: pushed frame=' +
                  JSON.stringify(frame) + ', stack depth now=' + state.contextStack.length);
    state.save();
  } else if (state._pendingNewItemIdx !== null) {
    // Case B: same path, addMenuItem just created an item and queued {d}.
    // Preserve activeItemIdx so {d} opens the new item's editor.
    console.error('[Designer] handleSubMenuEntry {' + pathStr + '}: pending new item ' +
                  state._pendingNewItemIdx + ' — preserving activeItemIdx=' +
                  state.activeItemIdx + ', stack depth=' + state.contextStack.length);
    state._pendingNewItemIdx = null;
    state.save();
  } else {
    // Case C: same path, back-nav re-render of the same sub-menu editMenu.
    // Reset activeItemIdx=null so the next {d} can pop from contextStack.
    console.error('[Designer] handleSubMenuEntry {' + pathStr + '}: re-render (same path), ' +
                  'resetting idx from ' + state.activeItemIdx +
                  ', stack depth=' + state.contextStack.length);
    state.activeItemIdx = null;
    state.save();
  }
  return { pfod: DesignerEditMenu.send(state), skipSave: true };
}
DesignerDispatch.add('s', handleSubMenuEntry);

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('d', DesignerEditMenuItem.send);
