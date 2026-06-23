/*
 * designer/menus/pulseEditor.js
 *
 * Handler for cmd 'O' (Java's setOutputPulseCmd) — opens the pulse
 * setting sub-menu for the active on/off item.  Direct port of
 * pfodDesignerV2/PulseMsgProcessor.java — same prompt strings,
 * same per-setter slider layout, same hide-on-not-current-setter
 * semantics.
 *
 * Sub-cmd byte map (mirrors PulseMsgProcessor.getResponse line
 * 134-165):
 *   bare {O}      → first-entry render; resets _setter to 0
 *   {OA`<idx>}    → pulse type (NONE/LOW/HIGH)
 *   {OB`<idx>}    → setter (0=Sec, 1=Min, 2=Hr, 3=Day)
 *   {OC`<v>}      → sec_10  (0..9 — tenths of a second)
 *   {OD`<v>}      → sec     (0..9 — units of seconds)
 *   {OE`<v>}      → sec10   (0..5 — tens of seconds)
 *   {OF`<v>}      → mins    (0..9)
 *   {OG`<v>}      → mins10  (0..5)
 *   {OH`<v>}      → hrs     (0..23)
 *   {OI`<v>}      → days    (0..9)
 *   {OJ`<v>}      → days10  (0..4)
 *
 * Layout — same as Java:
 *   1. Prompt (different copy when pulse=NONE vs Low/High).
 *   2. |OA — pulse-type toggle (3 options).
 *   3. |OB — setter toggle (4 options).  HIDDEN when pulse=NONE.
 *   4. |!Oz — read-only setter label ("Setting Seconds" etc.).
 *           HIDDEN when pulse=NONE.
 *   5. Slider rows OC..OJ — each HIDDEN unless its setter is
 *      current AND pulse !== NONE.
 *
 * Each slider clamps to its `max` value (0..9 / 0..5 / 0..23 etc.)
 * — the slider widget itself enforces this client-side, the handler
 * re-clamps as a safety net.  Slider changes recompute pulse_ms via
 * sliders_to_ms() and write back to item.pulse_ms; the next render
 * reloads via ms_to_sliders() so any rounding (100 ms granularity
 * on the sec_10 slider) stays consistent across renders.
 *
 * Module-level closure state — _setter and the 8 digit components —
 * mirrors PulseMsgProcessor's instance fields.  Reset to 0 on every
 * bare {O} entry so a stale value from a previous on/off item never
 * leaks into a fresh session.
 *
 * Why use numeric sliders (`<-2><i>Set the </i>~~ sec (1/10's)~0.9`
 * 4-field shape) for digits rather than text input?  Matches Java
 * line-for-line; the slider widget gives discrete tap-able zones
 * for the small (0..9 / 0..5 / 0..23) ranges, which is what the
 * pfodApp UI does on Android.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DesignerPulseEditor = (() => {

  // Invisible-space sentinel — pfodAppStatics.NON_DISPLAY_BLANK_CHAR
  // is U+0080.  pfodWeb's renderer treats U+0080 inside text as a
  // visibility:hidden spacer span (pfodButtonRenderer.js line 200+),
  // matching the pfodApp behaviour Java relies on for "no visible
  // leading text" in toggle widgets.
  const NON_DISPLAY = '';

  // ── Module-level state — mirrors PulseMsgProcessor instance fields ─

  let _setter = 0;            // 0=Sec, 1=Min, 2=Hr, 3=Day
  let _sec_10 = 0;            // 0..9 (tenths of a second)
  let _sec    = 0;            // 0..9
  let _sec10  = 0;            // 0..5
  let _mins   = 0;            // 0..9
  let _mins10 = 0;            // 0..5
  let _hrs    = 0;            // 0..23
  let _days   = 0;            // 0..9
  let _days10 = 0;            // 0..4

  // ── ms <-> digit-components ─────────────────────────────────────

  /// Decompose `ms` into the 8 digit components.  Mirrors
  /// PulseMsgProcessor.ms_to_sliders (line 26-75).  Rounds to the
  /// nearest 100 ms — the sec_10 slider's resolution.  Caps total
  /// at 49 days (combined days10 + days).
  function _ms_to_sliders(ms) {
    if (ms < 0) ms = 0;
    let remD = ms;
    let val  = Math.floor(ms / (1000 * 24 * 60 * 60));
    remD = remD - (24 * 60 * 60 * 1000 * val);
    let rem = Math.round(remD / 100) * 100;
    if (val > 49) val = 49;

    _days10 = Math.floor(val / 10);
    _days   = val - _days10 * 10;

    val = Math.floor(rem / (60 * 60 * 1000));
    rem = rem - 60 * 60 * 1000 * val;
    _hrs = val;

    val = Math.floor(rem / (60 * 1000));
    rem = rem - 60 * 1000 * val;
    _mins10 = Math.floor(val / 10);
    _mins   = val - _mins10 * 10;

    val = Math.floor(rem / 1000);
    rem = rem - 1000 * val;
    _sec10 = Math.floor(val / 10);
    _sec   = val - _sec10 * 10;

    _sec_10 = Math.floor(rem / 100);
  }

  /// Recompose the 8 digit components back into ms.  Inverse of
  /// _ms_to_sliders.  Mirrors PulseMsgProcessor.sliders_to_ms
  /// (line 89-104).
  function _sliders_to_ms() {
    let ms = _sec_10 * 100;
    ms += (_sec10 * 10 + _sec)         * 1000;
    ms += (_mins  + _mins10 * 10)      * 60 * 1000;
    ms += _hrs                         * 60 * 60 * 1000;
    ms += (_days  + _days10 * 10)      * 24 * 60 * 60 * 1000;
    return ms;
  }

  /// "Nd H:MM:SS.s" pulse-interval display string.  Mirrors
  /// PulseMsgProcessor.getPulseIntervalStr (line 182-205) — same
  /// padding rules (leading space when days10=0 etc.) so the
  /// label width stays consistent as values change.
  function _getPulseIntervalStr(ms) {
    _ms_to_sliders(ms);
    let rtn = '';
    if (_days10 === 0) rtn += ' ';
    rtn += (_days + _days10 * 10) + 'd ';
    if (_hrs < 10) rtn += ' ';
    rtn += _hrs;
    rtn += ':';
    if (_mins10 === 0) rtn += '0';
    rtn += (_mins10 * 10 + _mins);
    rtn += ':';
    if (_sec10 === 0) rtn += '0';
    rtn += (_sec10 * 10 + _sec) + '.' + _sec_10;
    return rtn;
  }

  // ── Prompt + toggle/slider emits (port of Java helpers) ─────────

  function _updatePrompt(state) {
    const item = state.getActiveItem();
    let rtn = '';
    if (item.pulse === 'none') {
      rtn += '~Set Pulse to None, Low or High';
      rtn += '\nthen the set the pulse interval';
      rtn += '\n';
      rtn += '<-4><i>Use the bottom back arrow to return.';
    } else {
      rtn += '~<b>Pulse Interval (d h:m:s)\n<+1>';
      rtn += _getPulseIntervalStr(item.pulse_ms);
      rtn += '</b>\n';
      rtn += '<808080><-2>Set the secs, mins, hrs and days duration for the pulse</-2>\n';
      rtn += '<-4><i>Use the bottom back arrow to return.';
    }
    return rtn;
  }

  // Pulse-type option labels.  Java pfodDesignerV2 uses the
  // unicode quadrant-block trio `▕▁▏` / `▕▔▏`
  // (PulseEnum.java line 6-7); Roboto's proportional metrics leave
  // gaps between the blocks so they don't read as a single shape.
  //
  // The "pipe" characters here are U+2502 BOX DRAWINGS LIGHT
  // VERTICAL `│`, NOT the ASCII pipe `|` (U+007C).  Two reasons:
  //  - Raw `|` inside text is pfod's menu-item separator; the row
  //    would split at the first inner pipe.
  //  - The `&#124;` escape doesn't work inside a toggle's options-
  //    text field — pfodMenuParser line 252 decodes the escape
  //    BEFORE deciding how to split options (line 254
  //    `optStr.includes('|') ? split('|') : split('\\')`), so
  //    decoded pipes trigger the wrong split path.
  // U+2502 is visually identical to a pipe at typical font sizes
  // and unambiguous to the parser.
  const PULSE_TYPE_MENU_STRING =
      'No Pulse\\Pulsed Low (│_│)\\Pulsed High (│‾│)';

  function _updatePulse(state) {
    const item = state.getActiveItem();
    const idx  = Math.max(0, PULSE_TYPES.indexOf(item.pulse));
    let rtn = '|OA<bg bk>';
    rtn += '`' + idx;
    rtn += '~' + NON_DISPLAY + '~~';
    rtn += PULSE_TYPE_MENU_STRING;
    return rtn;
  }

  function _hideIfPulseNull(state, rtn) {
    if (state.getActiveItem().pulse === 'none') rtn += '-';
    return rtn;
  }

  function _appendSetter(state) {
    let rtn = '';
    rtn += '|OB<bg bk>';
    rtn = _hideIfPulseNull(state, rtn);
    // Java's PulseMsgProcessor.java line 261 emits a literal space
    // before the backtick.  Kept byte-for-byte; pfodMenuParser now
    // skips whitespace between the format slot and the first int /
    // text separator (matches pfodApp's tolerance).
    rtn += ' `' + _setter;
    rtn += '~<-2><i>Set the </i>~~';
    rtn += 'Seconds\\Minutes\\Hours\\Days';

    rtn += '|!Oz<bg bl>';
    rtn = _hideIfPulseNull(state, rtn);
    rtn += '~';
    if      (_setter === 0) rtn += 'Setting Seconds';
    else if (_setter === 1) rtn += 'Setting Minutes';
    else if (_setter === 2) rtn += 'Setting Hours';
    else                    rtn += 'Setting Days';
    rtn += NON_DISPLAY;
    return rtn;
  }

  function _hideIfNotSetter(state, rtn, setterTest) {
    if (_setter !== setterTest || state.getActiveItem().pulse === 'none') {
      rtn += '-';
    }
    return rtn;
  }

  function _appendSec(state) {
    let rtn = '';
    rtn += '|OC<bg bk>'; rtn = _hideIfNotSetter(state, rtn, 0);
    rtn += '`' + _sec_10 + '`9';
    rtn += "~~ sec (1/10's)~0.9";

    rtn += '|OD<bg bk>'; rtn = _hideIfNotSetter(state, rtn, 0);
    rtn += '`' + _sec + '`9';
    rtn += '~~ sec';

    rtn += '|OE<bg bk>'; rtn = _hideIfNotSetter(state, rtn, 0);
    rtn += '`' + _sec10 + '`5';
    rtn += "~~ sec (10's)~50";
    return rtn;
  }

  function _appendMin(state) {
    let rtn = '';
    rtn += '|OF<bg bk>'; rtn = _hideIfNotSetter(state, rtn, 1);
    rtn += '`' + _mins + '`9';
    rtn += '~~ min~9';

    rtn += '|OG<bg bk>'; rtn = _hideIfNotSetter(state, rtn, 1);
    rtn += '`' + _mins10 + '`5';
    rtn += "~~ min (10's)~50";
    return rtn;
  }

  function _appendHrs(state) {
    let rtn = '';
    rtn += '|OH<bg bk>'; rtn = _hideIfNotSetter(state, rtn, 2);
    rtn += '`' + _hrs + '`23';
    rtn += '~~ hr~23';
    return rtn;
  }

  function _appendDays(state) {
    let rtn = '';
    rtn += '|OI<bg bk>'; rtn = _hideIfNotSetter(state, rtn, 3);
    rtn += '`' + _days + '`9';
    rtn += '~~ days~9';

    rtn += '|OJ<bg bk>'; rtn = _hideIfNotSetter(state, rtn, 3);
    rtn += '`' + _days10 + '`4';
    rtn += "~~ days (10's)~40";
    return rtn;
  }

  function _renderBody(state) {
    // Always reload digit components from current pulse_ms before
    // emitting — module-level state can be stale across handler
    // invocations and we need the rendered slider current-values
    // to reflect what's actually saved.
    _ms_to_sliders(state.getActiveItem().pulse_ms);
    let rtn = '';
    rtn += DESIGNER_PROMPT_FMT;
    rtn += _updatePrompt(state);
    rtn += _updatePulse(state);
    rtn += _appendSetter(state);
    rtn += _appendSec(state);
    rtn += _appendMin(state);
    rtn += _appendHrs(state);
    rtn += _appendDays(state);
    return rtn;
  }

  function _renderFull(state)   { return '{,' + _renderBody(state) + '}'; }
  function _renderUpdate(state) { return '{;' + _renderBody(state) + '}'; }

  // ── Mutation handlers ──────────────────────────────────────────

  function _parseArg(rawCmd, argStart) {
    if (rawCmd[argStart] !== '`') return NaN;
    return parseInt(rawCmd.substring(argStart + 1, rawCmd.length - 1), 10);
  }

  function _applyPulseType(state, rawCmd, argStart) {
    const idx = _parseArg(rawCmd, argStart);
    if (isNaN(idx) || idx < 0 || idx >= PULSE_TYPES.length) return _renderUpdate(state);
    const item = state.getActiveItem();
    if (!item) return PFOD_EMPTY;
    item.pulse = PULSE_TYPES[idx];
    state.save();
    return _renderUpdate(state);
  }

  function _applySetter(state, rawCmd, argStart) {
    const idx = _parseArg(rawCmd, argStart);
    if (isNaN(idx)) return _renderUpdate(state);
    _setter = Math.max(0, Math.min(idx, 3));
    return _renderUpdate(state);
  }

  /// Apply a single digit-slider update.  Loads the full component
  /// set from item.pulse_ms first (so the other digits stay in
  /// sync), writes the picked one, recomposes, saves.
  function _applySliderUpdate(state, rawCmd, argStart, componentKey, max) {
    const val = _parseArg(rawCmd, argStart);
    if (isNaN(val)) return _renderUpdate(state);
    const item = state.getActiveItem();
    if (!item) return PFOD_EMPTY;
    _ms_to_sliders(item.pulse_ms);
    const clamped = Math.max(0, Math.min(val, max));
    switch (componentKey) {
      case 'sec_10': _sec_10 = clamped; break;
      case 'sec':    _sec    = clamped; break;
      case 'sec10':  _sec10  = clamped; break;
      case 'mins':   _mins   = clamped; break;
      case 'mins10': _mins10 = clamped; break;
      case 'hrs':    _hrs    = clamped; break;
      case 'days':   _days   = clamped; break;
      case 'days10': _days10 = clamped; break;
    }
    item.pulse_ms = _sliders_to_ms();
    state.save();
    return _renderUpdate(state);
  }

  // ── Dispatch ────────────────────────────────────────────────────

  function send(rawCmd, state, depth) {
    const sub = rawCmd[depth + 1];
    if (sub === undefined || sub === '}') {
      // Bare {O} — first entry.  Reset setter so the user starts
      // on the Seconds sliders (Java's setter=0 initial).
      _setter = 0;
      return { pfod: _renderFull(state), skipSave: true };
    }
    const argStart = depth + 2;
    switch (sub) {
      case 'A': return _applyPulseType(state,    rawCmd, argStart);
      case 'B': return _applySetter(state,       rawCmd, argStart);
      case 'C': return _applySliderUpdate(state, rawCmd, argStart, 'sec_10', 9);
      case 'D': return _applySliderUpdate(state, rawCmd, argStart, 'sec',    9);
      case 'E': return _applySliderUpdate(state, rawCmd, argStart, 'sec10',  5);
      case 'F': return _applySliderUpdate(state, rawCmd, argStart, 'mins',   9);
      case 'G': return _applySliderUpdate(state, rawCmd, argStart, 'mins10', 5);
      case 'H': return _applySliderUpdate(state, rawCmd, argStart, 'hrs',    23);
      case 'I': return _applySliderUpdate(state, rawCmd, argStart, 'days',   9);
      case 'J': return _applySliderUpdate(state, rawCmd, argStart, 'days10', 4);
      default:
        return { pfod: _renderUpdate(state), skipSave: true };
    }
  }

  return Object.freeze({ send });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('O', DesignerPulseEditor.send);
