/*
 * designer/menus/editPrompt.js
 *
 * Handler for the 'n' (editPromptCmd) item on the editMenu screen:
 * opens the Edit Prompt screen — a self-previewing editor where the
 * prompt area shows the user's current prompt text live, and the menu
 * items below let them change it.
 *
 * Wired in THIS pass:
 *   - Edit prompt text       ({h} — separate top-level peer)
 *   - Font Size slider       ({ns`<N>})
 *   - Bold / Italic / Underline toggles ({nb}, {ni}, {nu})
 *   - Flash / Sound toggles  ({nf}, {no})
 *   - Help                   ({nw} — delegates to editPromptHelp.js)
 *
 * Still stubs:
 *   - Set Font colour        ({nc})
 *   - Set Background colour  ({nB})
 *   (colour pickers land with the colour-menu port.)
 *
 * Cmd routing — flat, like the Java's editPrompt() switch:
 *   {n}            → render parent Edit Prompt screen
 *   {ns`<N>}       → apply font size; in-place update reply ({;...})
 *   {nb}/ni/nu/nf/no → toggle; in-place update reply ({;...})
 *   {nc}/{nB}      → no-op stubs; just re-render
 *   {nw}           → delegate to DesignerEditPromptHelp.send
 *   {h}, {hT~…}    → peer top-level route in editPromptText.js
 *
 * IN-PLACE UPDATE PATTERN ({;…}): toggle / slider responses use the
 * pfod "{;<format>~<title>|<items>}" update form so pfodWeb applies
 * the change to the visible menu without pushing the cmd onto
 * menuNavStack.  A `{,…}` reply would push (e.g. `{nb}`) onto the
 * stack and force the user to press back one extra time per toggle.
 * See responseHandlers.js line ~439 (`_navigateToMenu`) for the
 * push gate that 'back'/'refresh' types — and {;} updates — skip.
 *
 * No version tag and no trailing `~` — the live preview's prompt
 * area mirrors the active menu's promptText + promptFormat, both of which
 * change on every edit, so pfodWeb must always re-fetch.  See
 * feedback-designer-menus-no-cache.
 *
 * Origin: pfodDesignerV2/DesignerMsgProcessor.java editPrompt() +
 *         getEditPromptMsg()  (around lines 2500 / 2543).
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

// ── File-level constants ────────────────────────────────────────────

// pfod cmd bytes for the items on the Edit Prompt parent screen.
const EP_EDIT_TEXT_CMD        = 'h';   // Edit prompt text — top-level peer
const EP_FONT_SIZE_CMD        = 's';   // Set Font Size (slider)
const EP_FONT_COLOUR_CMD      = 'c';   // Set Font colour (stub)
const EP_BG_COLOUR_CMD        = 'B';   // Set Background colour (stub)
const EP_BOLD_CMD             = 'b';   // Toggle bold
const EP_ITALIC_CMD           = 'i';   // Toggle italic
const EP_UNDERLINE_CMD        = 'u';   // Toggle underline
const EP_FLASH_CMD            = 'f';   // Toggle flash
const EP_SOUND_CMD            = 'o';   // Toggle sound
const EP_HELP_CMD             = 'w';   // Help (delegates to editPromptHelp.js)

// Dummy cmd byte for the disabled heading-label item at the top of
// the items list.  Disabled so the byte never reaches the dispatcher.
const EP_HEADING_LABEL_CMD    = 'H';

// "(stub)" suffix appended to colour buttons whose handlers aren't
// implemented yet, so it's obvious in the UI which buttons are inert.
const EP_STUB_SUFFIX          = '  (stub)';

// Font-size slider bounds — match Java's `+12`/`-6` (the relative
// font-size range pfod accepts on prompts).  Stored as ints so we
// don't have to parse them at render time.
const EP_FONT_SIZE_MAX  = 12;
const EP_FONT_SIZE_MIN  = -6;

// ── Handler ─────────────────────────────────────────────────────────

const DesignerEditPrompt = (() => {

  /// Build the screen-format prefix from a promptFormat object — the
  /// string that goes between `{,` and `~` in the pfod response.
  /// Encodes EVERY field on promptFormat as the matching pfod tag /
  /// flag (matches Java pfodDesignerV2's EditScreenData.getPromptFormat).
  /// No fallbacks: when a sticky field is unset (null / 0 / false), the
  /// corresponding tag is simply omitted and pfodWeb's default applies.
  /// Shared by the editor's live preview and previewMenu's "as the
  /// device serves it" render — same output for both contexts so what
  /// the user sees while editing is exactly what Preview Menu shows.
  function _buildPromptScreenFormat(fmt) {
    let out = '';
    if (fmt.bgColour)   out += '<bg ' + fmt.bgColour + '>';
    if (fmt.fontColour) out += '<' + fmt.fontColour + '>';
    if (fmt.fontSize > 0) out += '<+' + fmt.fontSize + '>';
    if (fmt.fontSize < 0) out += '<' + fmt.fontSize + '>';   // fontSize already has '-'
    if (fmt.bold)       out += '<b>';
    if (fmt.italic)     out += '<i>';
    if (fmt.underline)  out += '<u>';
    if (fmt.flash)      out += '+';                          // non-sticky flash flag
    if (fmt.sound)      out += '@';                          // non-sticky sound flag
    return out;
  }

  /// Build the prompt + items body shared by the full-form and update
  /// renders — everything between `{,` (or `{;`) and the closing `}`.
  /// Re-emitted on every interaction so the live preview reflects the
  /// latest state.promptFormat and the toggle button labels show the
  /// correct "Set …" / "Clear …" verb.
  function _renderBody(state) {
    const menu = state.getActiveMenu();
    const fmt  = menu.promptFormat;
    // Screen-format prefix carries EVERY format flag the user has
    // chosen — bg, fg, size, b/i/u, flash, sound — and only what
    // they've chosen (no chrome fallback, per
    // feedback-no-fallbacks-init-at-top).  pfodMenuDisplay applies
    // header.bgColor to both #menu-scroll-area and #menu-prompt;
    // applies sticky promptFormat fields (b/i/u/size/fg) to
    // #menu-prompt only; and toggles the .pfod-flash class +
    // pfodPlayPingSound from the non-sticky flags.
    let out = _buildPromptScreenFormat(fmt) + '~' + menu.promptText;

    // Disabled heading label — explains what the screen is and points
    // to the live preview at the bottom.  Uses a basic-blue bg
    // (`<bg bl>`) to visually mark it as the screen's heading,
    // distinct from the dark-navy designer-chrome items below.
    // Matches Java pfodDesignerV2's `<bg bl><w>` choice on this label.
    out += '|!' + EP_HEADING_LABEL_CMD + '<bg bl><w>';
    out += '~<b><-1>Editing Prompt</-1></b>';
    out += '\n<-2>A preview of the menu prompt';
    out += '\nis at the bottom of this screen';
    out += '\n<-2>The background colour of the prompt area sets the default';
    out += ' background colour for the whole screen.';

    // Edit prompt text — peer top-level cmd `h`.
    out += '|' + EP_EDIT_TEXT_CMD + DESIGNER_MENU_FMT + '~Edit prompt text';

    // Font Size slider.  Slider format: `<curr>`<max>`<min> for ints
    // and ~leading~trailing~maxLabel~minLabel for text.  leading
    // = 'Font Size ' includes a trailing space so the display reads
    // "Font Size +2" / "Font Size -1" / "Font Size 0".  +12/-6 labels
    // are emitted verbatim (parser uses them for the slider scale
    // tickmarks AND triggers the showPlus prefix logic for positive
    // currentValue display via the leading '+').
    out += '|n' + EP_FONT_SIZE_CMD + DESIGNER_MENU_FMT;
    out += '`' + fmt.fontSize + '`' + EP_FONT_SIZE_MAX + '`' + EP_FONT_SIZE_MIN;
    out += '~Font Size ~~+' + EP_FONT_SIZE_MAX + '~' + EP_FONT_SIZE_MIN;

    // Colour buttons — click opens a pfod selection-screen colour
    // picker (handler below; rawCmd[depth+2] === '`' distinguishes
    // the picker's submit reply from the initial click).
    out += '|n' + EP_FONT_COLOUR_CMD + DESIGNER_MENU_FMT + '~Set Font colour';
    out += '|n' + EP_BG_COLOUR_CMD   + DESIGNER_MENU_FMT + '~Set Background colour';

    // Format-toggle buttons.  Label-verb flips with the current state
    // (matches Java: "Clear" vs "Set", "Remove" vs "Set to").  Inline
    // tags echo the format the button toggles so the user sees the
    // effect on the button text too.
    out += '|n' + EP_BOLD_CMD      + DESIGNER_MENU_FMT + '~' + (fmt.bold      ? 'Clear' : 'Set')    + ' <b>Bold</b>';
    out += '|n' + EP_ITALIC_CMD    + DESIGNER_MENU_FMT + '~' + (fmt.italic    ? 'Clear' : 'Set')    + ' <i>Italic</i>';
    out += '|n' + EP_UNDERLINE_CMD + DESIGNER_MENU_FMT + '~' + (fmt.underline ? 'Clear' : 'Set')    + ' <u>Underline</u>';
    out += '|n' + EP_FLASH_CMD     + DESIGNER_MENU_FMT + '~' + (fmt.flash     ? 'Remove' : 'Set to') + ' Flash';
    out += '|n' + EP_SOUND_CMD     + DESIGNER_MENU_FMT + '~' + (fmt.sound     ? 'Remove' : 'Set to play') + ' sound';

    // Help — sub-cmd, delegates to editPromptHelp.js inside this file's
    // send() (no separate top-level route — see file header).
    out += '|n' + EP_HELP_CMD + DESIGNER_MENU_FMT + '~Help';

    return out;
  }

  /// Render the parent Edit Prompt screen as a FULL new menu (`{,…}`).
  /// Used on the initial open (cmd `{n}`) — pfodWeb navigates into the
  /// new menu and pushes `{n}` onto menuNavStack.
  function _renderParentScreen(state) {
    return '{,' + _renderBody(state) + '}';
  }

  /// Render the parent Edit Prompt screen as an in-place UPDATE
  /// (`{;…}`).  Used after toggle / slider mutations so the visible
  /// menu refreshes without pfodWeb pushing the toggle-cmd onto
  /// menuNavStack (which would force an extra back-press per toggle).
  function _renderUpdateScreen(state) {
    return '{;' + _renderBody(state) + '}';
  }

  /// Apply the new font-size value sent by pfodWeb's slider on
  /// release.  rawCmd shape: `{ns\`<value>}`.  argStart points to the
  /// byte after 's' — expect a backtick then digits then closing `}`.
  function _applyFontSize(state, rawCmd, argStart) {
    if (rawCmd[argStart] !== '`') return _renderUpdateScreen(state);
    const valStr = rawCmd.substring(argStart + 1, rawCmd.length - 1);
    const val    = parseInt(valStr, 10);
    if (isNaN(val)) return _renderUpdateScreen(state);
    // Clamp to declared range so a stray cmd from a stale slider can't
    // store an out-of-bounds value.  parser/render already clip to
    // [-6, +12] but defensive clamp here keeps stored state honest.
    const clamped = Math.max(EP_FONT_SIZE_MIN, Math.min(EP_FONT_SIZE_MAX, val));
    state.getActiveMenu().promptFormat.fontSize = clamped;
    state.save();
    // fontSize=0 means "device default" — the sticky-merge logic in
    // pfodMenuDisplay ignores 0 values, so a {;} update with no fontSize
    // tag would leave the old size in place.  Use {,} (full menu) when
    // resetting to default so the prompt area reflects the cleared state.
    return clamped === 0 ? _renderParentScreen(state) : _renderUpdateScreen(state);
  }

  /// Toggle a boolean flag on the active menu's promptFormat and
  /// return the appropriate reply.
  /// Sticky formats (bold, italic, underline): pfodMenuDisplay's sticky-merge
  /// logic only applies non-default (true) values from a {;} update — it
  /// cannot clear a sticky flag via {;}.  When the user turns a sticky flag
  /// OFF, use {,} (full menu) so the prompt area reflects the cleared state.
  /// Non-sticky flags (flash, sound): {;} replace-on-update handles both
  /// directions, so {;} is always correct for them.
  function _toggle(state, key) {
    const fmt = state.getActiveMenu().promptFormat;
    fmt[key] = !fmt[key];
    state.save();
    const isStickyKey = (key === 'bold' || key === 'italic' || key === 'underline');
    if (isStickyKey && !fmt[key]) {
      // Sticky flag just cleared — {;} can't propagate this; use {,}.
      return _renderParentScreen(state);
    }
    return _renderUpdateScreen(state);
  }

  /// Render a pfod single-selection screen offering the 16 named
  /// colours + a Default entry.  Each item label is prefixed with the
  /// colour's own tag so the option renders coloured — the user sees
  /// the preview directly in the list (matches Java's
  /// getColorChoiceMsg pattern).  Initial selection cursor (the
  /// `<currentIdx>` backtick field) points at whichever colour is
  /// currently stored — Default (idx 0) when null.
  ///
  /// pickerCmd is the FULL cmd byte sequence pfodWeb will send back
  /// on submit (e.g. 'nc' for font, 'nB' for background).  pfodWeb's
  /// selection submit wraps it: `{<pickerCmd>\`<idx>}`.  See the
  /// matching cases in send() for the apply path.
  function _renderColourPicker(state, pickerCmd, promptText, currentCode) {
    const currentIdx = designerColourIndex(currentCode);
    // Screen-format prefix on the picker prompt itself — designer
    // chrome (dark navy bg + white text) so the prompt header reads
    // as part of the designer UI, not as one of the previewed colours.
    let out = "{?" + pickerCmd + '`' + currentIdx + '~' + DESIGNER_PROMPT_FMT + promptText;
    // Each item label follows Java pfodDesignerV2's getColorChoiceMsg
    // pattern: name rendered in white (readable label), followed by
    // a space, followed by name rendered in its own colour (preview).
    // The Default entry uses grey for the preview half — matches
    // pfodApp's default-prompt-colour convention.  Bold on the
    // readable half + bold-italic on coloured-name entries mirrors
    // the Java's <b> / <b><i> tag choices.
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

  /// Handle the 'c' / 'B' sub-bytes.  Two reach paths:
  ///   - User clicks the button on the Edit Prompt screen → rawCmd
  ///     is e.g. `{nc}`.  rawCmd[depth+2] is `}` (no backtick).  We
  ///     return the colour-picker selection screen.
  ///   - pfodWeb submits the picker → rawCmd is e.g. `{nc\`5}`.
  ///     rawCmd[depth+2] is '`'.  We parse the index, store the
  ///     code on promptFormat (null for Default), save, and return
  ///     PFOD_EMPTY — pfodWeb's queued back-nav (`{n}`) refreshes
  ///     the parent screen with the new colour applied.  Same
  ///     pattern as the text-input / numeric-input flows; avoids
  ///     pushing a phantom entry onto menuNavStack.
  function _applyColour(state, rawCmd, argStart, formatKey, pickerCmd, pickerPrompt) {
    const currentCode = state.getActiveMenu().promptFormat[formatKey];
    if (rawCmd[argStart] !== '`') {
      // Initial click — render the picker.
      return { pfod: _renderColourPicker(state, pickerCmd, pickerPrompt, currentCode), skipSave: true };
    }
    // Picker submit — parse the index after the backtick.
    const idxStr = rawCmd.substring(argStart + 1, rawCmd.length - 1);
    const idx    = parseInt(idxStr, 10);
    if (isNaN(idx)) return PFOD_EMPTY;
    const entry = designerColourFromIndex(idx);
    state.getActiveMenu().promptFormat[formatKey] = entry.code;
    state.save();
    return PFOD_EMPTY;
  }

  /// Dispatch handler.  depth points to 'n'.  sub-byte at depth+1
  /// picks the action; arg bytes (for slider) follow at depth+2.
  ///
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth
  /// @returns {string|{pfod, skipSave}}
  function send(rawCmd, state, depth) {
    const sub = rawCmd[depth + 1];

    // Bare `{n}` or terminator — full-form parent screen.  skipSave
    // because the render itself doesn't change state.
    if (sub === undefined || sub === '}') {
      return { pfod: _renderParentScreen(state), skipSave: true };
    }

    switch (sub) {
      case EP_FONT_SIZE_CMD:                                   // 's'
        return _applyFontSize(state, rawCmd, depth + 2);
      case EP_BOLD_CMD:      return _toggle(state, 'bold');     // 'b'
      case EP_ITALIC_CMD:    return _toggle(state, 'italic');   // 'i'
      case EP_UNDERLINE_CMD: return _toggle(state, 'underline');// 'u'
      case EP_FLASH_CMD:     return _toggle(state, 'flash');    // 'f'
      case EP_SOUND_CMD:     return _toggle(state, 'sound');    // 'o'
      case EP_HELP_CMD:                                         // 'w'
        return DesignerEditPromptHelp.send(rawCmd, state, depth + 1);
      case EP_FONT_COLOUR_CMD:                                  // 'c'
        return _applyColour(state, rawCmd, depth + 2, 'fontColour',
                            'n' + EP_FONT_COLOUR_CMD,
                            'Select Colour for Prompt Text');
      case EP_BG_COLOUR_CMD:                                    // 'B'
        return _applyColour(state, rawCmd, depth + 2, 'bgColour',
                            'n' + EP_BG_COLOUR_CMD,
                            'Select Background Colour for Prompt');
      default:
        // Unknown sub-cmd (probably a future button we haven't wired
        // yet).  Render the parent so the user gets visible feedback
        // instead of a silently-dropped click.
        return { pfod: _renderUpdateScreen(state), skipSave: true };
    }
  }

  /// Internal hook for sibling files (editPromptText.js) to re-render
  /// this screen after their handlers mutate state.  Mirror of
  /// DesignerEditMenu.send(state) — caller already mutated state.
  function renderFor(state) {
    return _renderParentScreen(state);
  }

  /// Public version of _buildPromptScreenFormat — exposed so
  /// previewMenu.js (and any future "render as the device serves it"
  /// caller) can emit the same screen-format prefix the editor's live
  /// preview uses.  Single source of truth for the bg/fg/size/b/i/u/
  /// flash/sound encoding; matches Java pfodDesignerV2's
  /// EditScreenData.getPromptFormat output.
  function buildPromptScreenFormat(fmt) {
    return _buildPromptScreenFormat(fmt);
  }

  return Object.freeze({ send, renderFor, buildPromptScreenFormat });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('n', DesignerEditPrompt.send);
