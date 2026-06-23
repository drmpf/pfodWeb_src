/*
 * designer/state.js
 *
 * Runtime state held by a DesignerVirtualDevice instance.  Holds the
 * board being targeted plus the per-design menu TREE the user is
 * editing.  Each menu in the tree carries its own promptText,
 * promptFormat, and items[] (sub-menus nest via items whose type ===
 * 'submenu' — once item support lands).  `activeMenuPath` is an
 * in-memory pointer to the menu currently being edited, walked from
 * the root.
 *
 * Per-segment handlers in designer/menus/*.js read/write the active
 * menu via state.getActiveMenu(); they never touch the tree directly.
 *
 * PERSISTENCE (required): every user edit survives a page reload.
 * Multiple named designs can coexist in localStorage; the user picks /
 * renames the active name from the designer UI.
 *
 *   localStorage layout:
 *     'pfodDesigner.v1.<name>'   per-design JSON blob (one per named design)
 *     'pfodDesigner.v1.list'     JSON array of all design names
 *     'pfodDesigner.v1.current'  string — name most recently in use
 *
 * Default name follows Java pfodDesignerV2 convention:
 * DesignerStatics.NEW_MENU_NAME = "Menu" → "Menu_1", "Menu_2", …  The JS
 * port reuses that pattern via the static factory newDefault().
 *
 * FILE I/O: exportToBlob() returns a downloadable JSON file (cross-
 * machine sharing / off-site backup); importFromObject() ingests one
 * parsed back into the active state.  Both ends validate at the
 * boundary (required-field checks) — no inline defaulting.
 *
 * Construction:
 *   new DesignerState(board, name)    explicit — both args required
 *   DesignerState.newDefault(board)   factory — picks last-used name
 *                                     or next "Menu_N" if none stored
 *
 * Origin: pfodDesignerV2/V2_DesignerMenu.java + EditScreenData.java —
 *         each EditScreenData carries one menu's prompt+format+items;
 *         items linking to sub-menus reference a screenRowId (Java's
 *         SQLite-backed model).  This port collapses that to a nested
 *         in-memory tree (subMenu pointers on items).
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

// ── File-level constants ────────────────────────────────────────────

// Bump SCHEMA_VERSION whenever the persisted shape changes incompatibly
// — older saved states will then be rejected at load instead of being
// poured into a structure they no longer fit.
const DESIGNER_STATE_SCHEMA_VERSION = 10;

// Java pfodDesignerV2's DesignerStatics.NEW_MENU_NAME = "Menu" — the
// "_<n>" suffix is appended by _nextDefaultName().
const DEFAULT_NAME_PREFIX = 'Menu_';

// Initial prompt text shown on the Edit Prompt screen for a fresh
// design.  Java pfodDesignerV2 left this blank; the JS port seeds it
// with a placeholder so the live-preview prompt area is never empty on
// a new design.  The user can edit (or clear) it freely afterwards.
const DEFAULT_PROMPT_TEXT = 'Prompt Not Set';

// Default prompt format flags — every menu's prompt starts unformatted
// (no bold / italic / underline, no font-size shift, no flash/sound).
// The Edit Prompt screen's format-toggle buttons mutate the active
// menu's promptFormat in place; previewMenu.js applies the same
// flags to the prompt text it emits as the served menu.
//
// fontSize is a SIGNED relative delta: 0 = device default, positive =
// larger, negative = smaller.  pfod tags: <+N>, <-N>.  Bounds match the
// font-size slider on the Edit Prompt screen (-6 to +12, same as Java).
const DEFAULT_PROMPT_FORMAT = Object.freeze({
  fontSize:   0,
  bold:       false,
  italic:     false,
  underline:  false,
  flash:      false,
  sound:      false,
  // `disabled` (User Input Disabled) is button-only — labels are
  // inherently non-interactive via the `!` slot prefix.  Default
  // false so newly added buttons accept user input.
  disabled:   false,
  // null = "use device default" — picker's Default entry clears the
  // override.  Otherwise stored as the pfod colour-tag suffix (e.g.
  // 'r', 'gy', 'bk', 'w') so it drops straight into `<bg X>` and
  // `<X>` tags at render time without translation.
  fontColour: null,
  bgColour:   null,
});

/// Shallow clone of DEFAULT_PROMPT_FORMAT — used wherever we need a
/// mutable copy of the defaults.  Done as a helper so the frozen
/// literal is never reassigned through one of its mutable references
/// by mistake.
function _freshPromptFormat() {
  return {
    fontSize:   DEFAULT_PROMPT_FORMAT.fontSize,
    bold:       DEFAULT_PROMPT_FORMAT.bold,
    italic:     DEFAULT_PROMPT_FORMAT.italic,
    underline:  DEFAULT_PROMPT_FORMAT.underline,
    flash:      DEFAULT_PROMPT_FORMAT.flash,
    sound:      DEFAULT_PROMPT_FORMAT.sound,
    disabled:   DEFAULT_PROMPT_FORMAT.disabled,
    fontColour: DEFAULT_PROMPT_FORMAT.fontColour,
    bgColour:   DEFAULT_PROMPT_FORMAT.bgColour,
  };
}

/// Fresh menu node — one root per design, plus one per nested sub-menu
/// once items land.  No `screenName` / `cmd` fields here: those belong
/// on the items in the PARENT menu (a sub-menu is reachable through its
/// parent's item, not by name on the menu itself).
function _freshMenu() {
  return {
    promptText:   DEFAULT_PROMPT_TEXT,
    promptFormat: _freshPromptFormat(),
    items:        [],
    // Refresh interval in milliseconds — 0 = no auto-refresh (NONE in
    // Java's RefreshIntervalEnum).  pfodApp re-requests the menu every
    // refresh_ms while displayed; the designer's Refresh Interval
    // toggle on editMenu picks from a fixed list (0 / 1s / 5s / 30s /
    // 5min / 15min).
    refresh_ms:   0,
  };
}

// ── Menu-item types ────────────────────────────────────────────────
//
// Each item in a menu's items[] array carries a `type` field that
// drives both render (Button → `|<cmd>...`, Label → `|!<cmd>...`)
// and the per-type edit screen.  More types (PWM slider, ADC display,
// chart, sub-menu, etc.) land in later passes.

const ITEM_TYPE_BUTTON       = 'button';
const ITEM_TYPE_LABEL        = 'label';
const ITEM_TYPE_ONOFF        = 'onoff';
const ITEM_TYPE_ONOFFDISPLAY = 'onoffdisplay';
const ITEM_TYPE_PWM          = 'pwm';
const ITEM_TYPE_DATADISPLAY  = 'datadisplay';
const ITEM_TYPE_SUBMENU      = 'submenu';
const ITEM_TYPE_CHART        = 'chart';
const ITEM_TYPE_DRAWING      = 'drawing';

// Chart x-axis format values — match Java DateTimeFormatEnum.toString() values.
// Index 1 ('ms' = min:sec since start) is the Java default.
const CHART_XAXIS_FORMATS = Object.freeze([
  'sS', 'ms', 'dHms', 'ymdHms', 'weekDayHms', 'weekDayHm', 'weekDayHmsUTC', 'weekDayHmUTC',
]);
const CHART_XAXIS_LABELS = Object.freeze([
  'Secs since start',
  'Min:Sec since start',
  'Day Hr:Min:Sec',
  'Yr/Mo/Day Hr:Min:Sec',
  'WeekDay Hr:Min:Sec',
  'WeekDay Hr:Min',
  'WeekDay Hr:Min:Sec UTC',
  'WeekDay Hr:Min UTC',
]);

// Data interval options in ms — match Java PLOT_DATA_INTERVALS.
const CHART_DATA_INTERVALS       = Object.freeze([1000, 10000, 30000, 60000, 300000, 900000]);
const CHART_DATA_INTERVAL_LABELS = Object.freeze(['1 sec', '10 secs', '30 secs', '1 min', '5 mins', '15 mins']);

const DEFAULT_CHART_LABEL            = 'Chart';
const DEFAULT_CHART_XAXIS_IDX        = 1;
const DEFAULT_CHART_DATA_INTERVAL_IDX = 0;

const DEFAULT_PLOT_LABEL         = 'Plot';
const DEFAULT_PLOT_UNITS         = '';
const DEFAULT_PLOT_DATA_RANGE_MAX = 1023;
const DEFAULT_PLOT_DATA_RANGE_MIN = 0;
const DEFAULT_PLOT_AUTO_SCALE    = true;
const DEFAULT_PLOT_SHOW          = true;
const DEFAULT_PLOT_DISPLAY_MAX   = '1023';
const DEFAULT_PLOT_DISPLAY_MIN   = '0';

/// Fresh plot object for one of a chart's 3 plots.
/// @param {number} n  1-based plot number used in the default label
function _freshPlot(n) {
  return {
    plotLabel:    DEFAULT_PLOT_LABEL + ' ' + n,
    units:        DEFAULT_PLOT_UNITS,
    dataRangeMax: DEFAULT_PLOT_DATA_RANGE_MAX,
    dataRangeMin: DEFAULT_PLOT_DATA_RANGE_MIN,
    autoScale:    DEFAULT_PLOT_AUTO_SCALE,
    showPlot:     DEFAULT_PLOT_SHOW,
    displayMax:   DEFAULT_PLOT_DISPLAY_MAX,
    displayMin:   DEFAULT_PLOT_DISPLAY_MIN,
  };
}

/// Fresh Chart item — a menu button that opens a chart with up to 3 plots.
/// `text` is the button label shown in the menu; `chartLabel` is the title
/// shown inside the chart view.
/// @param {string} autoCmd  C++ variable-name string
function _freshChartItem(autoCmd) {
  return {
    type:            ITEM_TYPE_CHART,
    autoCmd:         autoCmd,
    text:            DEFAULT_CHART_LABEL,
    formats:         _freshPromptFormat(),
    chartLabel:      DEFAULT_CHART_LABEL,
    xAxisIdx:        DEFAULT_CHART_XAXIS_IDX,
    separatePlots:   false,
    dataIntervalIdx: DEFAULT_CHART_DATA_INTERVAL_IDX,
    plots:           [_freshPlot(1), _freshPlot(2), _freshPlot(3)],
  };
}

// Default item text — Java's V2_MenuItemEnum constructors seed
// matching defaults via msgTxt's "|a~Button" / "|!a~Label" snippets.
const DEFAULT_BUTTON_TEXT   = 'Button';
const DEFAULT_LABEL_TEXT    = 'Label';
const DEFAULT_SUBMENU_TEXT  = 'Sub-menu';
const DEFAULT_DRAWING_TEXT  = 'Drawing';
// On/Off defaults match Java MENU_ITEM_ON_OFF msgTxt
// `{,|a`0~Output is ~~Low\\High}` at V2_MenuItemEnum.java line 10 —
// leading text + two option labels + initial current value 0 (Low).
const DEFAULT_ONOFF_LEADING_TEXT  = 'Output is ';
const DEFAULT_ONOFF_TRAILING_TEXT = '';
const DEFAULT_ONOFF_LOW_TEXT      = 'Low';
const DEFAULT_ONOFF_HIGH_TEXT     = 'High';
// On/Off Display defaults
const DEFAULT_ONOFFDISPLAY_LEADING_TEXT  = 'Input is ';
const DEFAULT_ONOFFDISPLAY_TRAILING_TEXT = '';
const DEFAULT_ONOFFDISPLAY_LOW_TEXT      = 'Off';
const DEFAULT_ONOFFDISPLAY_HIGH_TEXT     = 'On';

/// Fresh Button item — `autoCmd` is the C++ variable-name string used
/// in generated code and stored in JSON export.  Wire bytes for the
/// pfod preview are derived from item position, not from this field.
function _freshButtonItem(autoCmd) {
  return {
    type:    ITEM_TYPE_BUTTON,
    autoCmd: autoCmd,
    text:    DEFAULT_BUTTON_TEXT,
    formats: _freshPromptFormat(),
  };
}

/// Fresh Label item — same shape as Button but type='label'.  Renders
/// as a disabled pfod menu item (`|!<cmd>...`); never sends a click.
function _freshLabelItem(autoCmd) {
  return {
    type:    ITEM_TYPE_LABEL,
    autoCmd: autoCmd,
    text:    DEFAULT_LABEL_TEXT,
    formats: _freshPromptFormat(),
  };
}

/// Fresh Drawing item — a pfod `dwg`-type menu item that loads a drawing
/// when the user clicks it.  For now the designer renders a static
/// placeholder drawing (50×25 white bg, centred instructional text).
/// The autoCmd generates the C++ handler stub; text is the button label.
function _freshDrawingItem(autoCmd) {
  return {
    type:    ITEM_TYPE_DRAWING,
    autoCmd: autoCmd,
    text:    DEFAULT_DRAWING_TEXT,
    formats: _freshPromptFormat(),
  };
}

/// Fresh Sub-menu item — renders as a button that opens a nested menu.
/// `subMenu` holds the sub-menu's prompt + items (same shape as rootMenu).
function _freshSubMenuItem(autoCmd) {
  return {
    type:    ITEM_TYPE_SUBMENU,
    autoCmd: autoCmd,
    text:    DEFAULT_SUBMENU_TEXT,
    formats: _freshPromptFormat(),
    subMenu: _freshMenu(),
  };
}

/// Fresh On/Off item — a 2-option pfod toggle (leading + trailing
/// text bracketing the currently-selected option label).  Pfod
/// emit shape: `|<cmd>`<current>~<leading>~<trailing>~<low>\<high>`.
/// `current` is 0 (Low) or 1 (High).
///
/// Pulse semantics mirror Java's MENU_ITEM_ON_OFF +
/// PulseMsgProcessor:
///   `pulse: 'none'`  → "setting" mode, current state is persistent
///   `pulse: 'low'`   → click pulses output to LOW for pulse_ms
///   `pulse: 'high'`  → click pulses output to HIGH for pulse_ms
/// `pulse_ms` is the pulse duration in milliseconds (ignored when
/// pulse='none').  Defaults match Java's MENU_ITEM_ON_OFF setup —
/// no pulse, 1 sec duration.
function _freshOnOffItem(autoCmd) {
  return {
    type:          ITEM_TYPE_ONOFF,
    autoCmd:       autoCmd,
    text:          DEFAULT_ONOFF_LEADING_TEXT,
    trailingText:  DEFAULT_ONOFF_TRAILING_TEXT,
    lowText:       DEFAULT_ONOFF_LOW_TEXT,
    highText:      DEFAULT_ONOFF_HIGH_TEXT,
    current:       0,
    pulse:         'none',
    pulse_ms:      1000,
    // Display mode for the rendered toggle (Java's
    // textOrSliderFormat at DesignerMsgProcessor.java:2122-2131):
    //   'both'   → text label + slider widget (default)
    //   'text'   → text label only (emits `~t` format char)
    //   'slider' → slider widget only (emits `~s` format char)
    displayFormat: 'both',
    formats:       _freshPromptFormat(),
    pin:           null,
  };
}

/// Fresh On/Off Display item — a read-only 2-option pfod toggle that
/// reflects a hardware input (or variable) state.  Always rendered
/// with the pfod `!` disabled flag so pfodApp never sends a command
/// for it.  No pulse fields (display items have no output behaviour).
function _freshOnOffDisplayItem(autoCmd) {
  return {
    type:          ITEM_TYPE_ONOFFDISPLAY,
    autoCmd:       autoCmd,
    text:          DEFAULT_ONOFFDISPLAY_LEADING_TEXT,
    trailingText:  DEFAULT_ONOFFDISPLAY_TRAILING_TEXT,
    lowText:       DEFAULT_ONOFFDISPLAY_LOW_TEXT,
    highText:      DEFAULT_ONOFFDISPLAY_HIGH_TEXT,
    current:       0,
    displayFormat: 'both',
    formats:       _freshPromptFormat(),
    pin:           null,
  };
}

// Display-format option list — kept here so the loader and the
// editor share one canonical order.  Index <-> string mapping for
// the 3-option toggle:  0='both', 1='text', 2='slider'.
const DISPLAY_FORMATS = Object.freeze(['both', 'text', 'slider']);

// PWM / Slider defaults — match Java MENU_ITEM_PWM_SLIDER's
// msgTxt at V2_MenuItemEnum.java line 17:
//   `{,|a`0~PWM Setting ~%`255`0~100~0}`
// → currentValue 0, raw range 0..255, leading "PWM Setting ",
// trailing "%", displayed scale 0..100 (so a raw 128 reads as ~50%).
const DEFAULT_PWM_LEADING_TEXT  = 'PWM Setting ';
const DEFAULT_PWM_TRAILING_TEXT = '%';
const DEFAULT_PWM_CURRENT       = 0;
const DEFAULT_PWM_MAX_VALUE     = 255;
const DEFAULT_PWM_MIN_VALUE     = 0;
const DEFAULT_PWM_MAX_SCALE_STR = '100';
const DEFAULT_PWM_MIN_SCALE_STR = '0';
// Data Display defaults match Java MENU_ITEM_ADC_DISPLAY's
// template `{,|!a`775~Reading ~`1023`0~1023~0}`:
//   raw range 0..1023, display scale 0..1023, units empty,
//   leading text "Reading " (with trailing space per Java).
const DEFAULT_DATADISPLAY_LEADING_TEXT  = 'Reading ';
const DEFAULT_DATADISPLAY_UNITS         = '';
const DEFAULT_DATADISPLAY_MAX_VALUE     = 1023;
const DEFAULT_DATADISPLAY_MIN_VALUE     = 0;
const DEFAULT_DATADISPLAY_MAX_SCALE_STR = '1023';
const DEFAULT_DATADISPLAY_MIN_SCALE_STR = '0';

/// Fresh PWM / Slider item.  Pfod emit shape:
///   `|<cmd><slot>`<current>~<leading>~<trailing>`<max>`<min>~<maxScale>~<minScale>[~<fmtChar>]`
/// Parses as a pfod numeric slider — pfodMenuParser detects it
/// when intFields.length >= 2 (line 227-245).  The user drags the
/// slider thumb to pick an int between minValue..maxValue; the
/// displayed value comes from the (maxScaleStr,minScaleStr) labels
/// at the ends of the slider track so raw 0..255 can read as 0..100%.
function _freshPwmItem(autoCmd) {
  return {
    type:          ITEM_TYPE_PWM,
    autoCmd:       autoCmd,
    text:          DEFAULT_PWM_LEADING_TEXT,
    trailingText:  DEFAULT_PWM_TRAILING_TEXT,
    currentValue:  DEFAULT_PWM_CURRENT,
    maxValue:      DEFAULT_PWM_MAX_VALUE,
    minValue:      DEFAULT_PWM_MIN_VALUE,
    maxScaleStr:   DEFAULT_PWM_MAX_SCALE_STR,
    minScaleStr:   DEFAULT_PWM_MIN_SCALE_STR,
    displayFormat: 'both',
    formats:       _freshPromptFormat(),
    pin:           null,
  };
}

/// Fresh Data Display item — a read-only numeric slider that shows a
/// hardware variable (e.g. ADC reading) scaled to real-world units.
/// Always rendered with the pfod `!` prefix so pfodApp never sends a
/// command for it.  Pfod emit shape (per Java MENU_ITEM_ADC_DISPLAY):
///   `|!<cmd><slot>`<current>~<leading>~<units>`<max>`<min>~<maxScale>~<minScale>[~<fmtChar>]`
/// `trailingText` carries the units string (matches wire-format position).
function _freshDataDisplayItem(autoCmd, adcMax, adcRefVolts) {
  const rawMax   = (adcMax      != null) ? adcMax                            : DEFAULT_DATADISPLAY_MAX_VALUE;
  const rawMin   = DEFAULT_DATADISPLAY_MIN_VALUE;
  const scaleMax = (adcRefVolts != null) ? String(adcRefVolts)               : DEFAULT_DATADISPLAY_MAX_SCALE_STR;
  const scaleMin = DEFAULT_DATADISPLAY_MIN_SCALE_STR;
  const units    = (adcRefVolts != null) ? 'V'                               : DEFAULT_DATADISPLAY_UNITS;
  return {
    type:          ITEM_TYPE_DATADISPLAY,
    autoCmd:       autoCmd,
    text:          DEFAULT_DATADISPLAY_LEADING_TEXT,
    trailingText:  units,
    currentValue:  0,
    maxValue:      rawMax,
    minValue:      rawMin,
    maxScaleStr:   scaleMax,
    minScaleStr:   scaleMin,
    displayFormat: 'both',
    formats:       _freshPromptFormat(),
    pin:           null,
  };
}

// Pulse types — kept here so the tolerant loader and the pulse-
// editor handler can both reach for the same canonical set.
const PULSE_TYPES = Object.freeze(['none', 'low', 'high']);

/// Derive a unique autoCmd string for a new item.  Base form is
/// `type + '_' + text` with spaces replaced by underscores (minimal
/// sanitisation — only spaces change).  When the base collides with
/// an existing autoCmd in the same menu, a `_2`, `_3`, … suffix is
/// appended until the result is unique.
function _makeAutoCmd(type, text, existingItems) {
  const base = type + '_' + (text || '').trim().replace(/ /g, '_').replace(/_+$/, '') + '_Cmd';
  const used = new Set((existingItems || []).map((it) => it && it.autoCmd).filter(Boolean));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const cand = base + '_' + n;
    if (!used.has(cand)) return cand;
  }
}

// ── Tolerant load parsers ────────────────────────────────────────────
//
// Loading a saved design is intentionally lenient: each field is
// validated independently and replaced with its default on type
// mismatch / missing.  A warnings[] array is threaded through every
// parser so the caller can report what couldn't be recovered at the
// end.  This lets a "slightly corrupt" file (single bad field) load
// successfully with every OTHER field intact — strict validators
// would have rejected the whole payload.  See
// `feedback-designer-persistence-required` for the persistence
// contract; tolerant loading is the file-import end of it.

/// Parse a promptFormat object tolerantly.  Returns a clean object
/// seeded from DEFAULT_PROMPT_FORMAT, pulling each field from `input`
/// only when present + correct-typed; mismatches push a one-line
/// description onto `warnings`.  Silent-default when the field is
/// simply absent (caller might be importing a partial old-schema
/// payload — absence is not necessarily corruption).
function _parsePromptFormatTolerant(input, path, warnings) {
  const out = _freshPromptFormat();
  if (input === null || input === undefined) {
    warnings.push(path + ': missing — using defaults');
    return out;
  }
  if (typeof input !== 'object') {
    warnings.push(path + ': not an object — using defaults');
    return out;
  }
  // Track every key the parser actually consults — anything left over
  // in `input` after this run is an unrecognised field (typo, foreign-
  // schema field, etc.) and gets warned.  Building the used-set as we
  // go avoids maintaining a separate "known keys" list in lock-step
  // with the parser logic.
  const used = new Set();
  // Numbers
  used.add('fontSize');
  if (typeof input.fontSize === 'number')  out.fontSize = input.fontSize;
  else if ('fontSize' in input)            warnings.push(path + '.fontSize: not a number — defaulted to 0');
  // Booleans
  for (const key of ['bold', 'italic', 'underline', 'flash', 'sound', 'disabled']) {
    used.add(key);
    if (typeof input[key] === 'boolean')   out[key] = input[key];
    else if (key in input)                 warnings.push(path + '.' + key + ': not a boolean — defaulted to false');
  }
  // Nullable strings (pfod colour-tag suffixes)
  for (const key of ['fontColour', 'bgColour']) {
    used.add(key);
    if (input[key] === null)               out[key] = null;
    else if (typeof input[key] === 'string') out[key] = input[key];
    else if (key in input)                 warnings.push(path + '.' + key + ': not null|string — defaulted to null');
  }
  // Flag every input key the parser didn't touch.
  for (const key of Object.keys(input)) {
    if (!used.has(key)) warnings.push(path + '.' + key + ': unrecognised field — ignored');
  }
  return out;
}

/// Parse one item tolerantly.  Currently knows about Button + Label
/// (other types — PWM, ADC, Chart, Drawing, Sub-menu — pass through
/// unchanged for forward-compatibility, so a design saved by a future
/// version with more item types reopens with those items still on
/// disk even though this build can't render / edit them).
function _parseItemTolerant(input, path, warnings) {
  if (input === null || input === undefined) {
    warnings.push(path + ': missing — dropped');
    return null;
  }
  if (typeof input !== 'object') {
    warnings.push(path + ': not an object — dropped');
    return null;
  }
  // For known types we re-build the item from defaults + valid input
  // fields, mirroring the prompt-format / menu parsers.  For unknown
  // types we trust the future schema and return the input as-is —
  // the warning surfaces to the user so they know this build won't
  // edit it.
  if (input.type !== ITEM_TYPE_BUTTON       &&
      input.type !== ITEM_TYPE_LABEL        &&
      input.type !== ITEM_TYPE_ONOFF        &&
      input.type !== ITEM_TYPE_PWM          &&
      input.type !== ITEM_TYPE_ONOFFDISPLAY &&
      input.type !== ITEM_TYPE_DATADISPLAY  &&
      input.type !== ITEM_TYPE_SUBMENU      &&
      input.type !== ITEM_TYPE_CHART        &&
      input.type !== ITEM_TYPE_DRAWING) {
    warnings.push(path + '.type: "' + input.type + '" not supported in this build — kept as-is');
    return input;
  }
  let out;
  if      (input.type === ITEM_TYPE_BUTTON)        out = _freshButtonItem('');
  else if (input.type === ITEM_TYPE_LABEL)          out = _freshLabelItem('');
  else if (input.type === ITEM_TYPE_ONOFF)          out = _freshOnOffItem('');
  else if (input.type === ITEM_TYPE_ONOFFDISPLAY)   out = _freshOnOffDisplayItem('');
  else if (input.type === ITEM_TYPE_DATADISPLAY)    out = _freshDataDisplayItem('');
  else if (input.type === ITEM_TYPE_SUBMENU)        out = _freshSubMenuItem('');
  else if (input.type === ITEM_TYPE_CHART)          out = _freshChartItem('');
  else if (input.type === ITEM_TYPE_DRAWING)        out = _freshDrawingItem('');
  else                                              out = _freshPwmItem('');
  const used = new Set(['type']);

  used.add('text');
  if (typeof input.text === 'string')        out.text = input.text;
  else if ('text' in input)                  warnings.push(path + '.text: not a string — defaulted');

  used.add('autoCmd');
  if (typeof input.autoCmd === 'string' && input.autoCmd.length > 0) {
    out.autoCmd = input.autoCmd;
  } else {
    out.autoCmd = _makeAutoCmd(out.type, out.text, []);
    if ('autoCmd' in input) warnings.push(path + '.autoCmd: invalid — derived from type+text');
  }

  used.add('formats');
  out.formats = _parsePromptFormatTolerant(input.formats, path + '.formats', warnings);

  // On/off-only fields.  Quietly ignored for other types (warned via
  // the unrecognised-field loop below).
  if (input.type === ITEM_TYPE_ONOFF) {
    used.add('trailingText');
    if (typeof input.trailingText === 'string')  out.trailingText = input.trailingText;
    else if ('trailingText' in input)            warnings.push(path + '.trailingText: not a string — defaulted');

    used.add('lowText');
    if (typeof input.lowText === 'string')       out.lowText = input.lowText;
    else if ('lowText' in input)                 warnings.push(path + '.lowText: not a string — defaulted');

    used.add('highText');
    if (typeof input.highText === 'string')      out.highText = input.highText;
    else if ('highText' in input)                warnings.push(path + '.highText: not a string — defaulted');

    used.add('current');
    if (typeof input.current === 'number')       out.current = (input.current === 1) ? 1 : 0;
    else if ('current' in input)                 warnings.push(path + '.current: not a number — defaulted to 0');

    // Pulse settings — `pulse` (string enum) replaces the older
    // `isPulse` (boolean) field; accept both for forward-compat
    // with designs saved before the enum landed.  Legacy
    // isPulse=true migrates to pulse='high' (the most common case
    // — pulse output to HIGH was Java's only "on" mode for the
    // original boolean).  pulse_ms defaults to 1000 (1 sec).
    used.add('pulse');
    used.add('pulse_ms');
    used.add('isPulse');
    if (typeof input.pulse === 'string' && PULSE_TYPES.indexOf(input.pulse) !== -1) {
      out.pulse = input.pulse;
    } else if (typeof input.isPulse === 'boolean') {
      out.pulse = input.isPulse ? 'high' : 'none';
    } else if ('pulse' in input) {
      warnings.push(path + '.pulse: not one of "none" / "low" / "high" — defaulted to "none"');
    } else if ('isPulse' in input) {
      warnings.push(path + '.isPulse: not a boolean — defaulted to "none"');
    }
    if (typeof input.pulse_ms === 'number' && input.pulse_ms >= 0) {
      out.pulse_ms = input.pulse_ms;
    } else if ('pulse_ms' in input) {
      warnings.push(path + '.pulse_ms: not a non-negative number — defaulted to 1000');
    }

    used.add('displayFormat');
    if (typeof input.displayFormat === 'string' && DISPLAY_FORMATS.indexOf(input.displayFormat) !== -1) {
      out.displayFormat = input.displayFormat;
    } else if ('displayFormat' in input) {
      warnings.push(path + '.displayFormat: not one of "both" / "text" / "slider" — defaulted to "both"');
    }
  }

  // On/Off Display-only fields — same text/current/displayFormat as
  // on/off but no pulse fields (display items are read-only).
  if (input.type === ITEM_TYPE_ONOFFDISPLAY) {
    used.add('trailingText');
    if (typeof input.trailingText === 'string')  out.trailingText = input.trailingText;
    else if ('trailingText' in input)            warnings.push(path + '.trailingText: not a string — defaulted');

    used.add('lowText');
    if (typeof input.lowText === 'string')       out.lowText = input.lowText;
    else if ('lowText' in input)                 warnings.push(path + '.lowText: not a string — defaulted');

    used.add('highText');
    if (typeof input.highText === 'string')      out.highText = input.highText;
    else if ('highText' in input)                warnings.push(path + '.highText: not a string — defaulted');

    used.add('current');
    if (typeof input.current === 'number')       out.current = (input.current === 1) ? 1 : 0;
    else if ('current' in input)                 warnings.push(path + '.current: not a number — defaulted to 0');

    used.add('displayFormat');
    if (typeof input.displayFormat === 'string' && DISPLAY_FORMATS.indexOf(input.displayFormat) !== -1) {
      out.displayFormat = input.displayFormat;
    } else if ('displayFormat' in input) {
      warnings.push(path + '.displayFormat: not one of "both" / "text" / "slider" — defaulted to "both"');
    }
  }

  // PWM-only fields.  All four shape the numeric-slider widget;
  // string scale values are kept verbatim (Java's emit feeds them
  // straight into the maxScaleStr / minScaleStr text fields).
  if (input.type === ITEM_TYPE_PWM) {
    used.add('trailingText');
    if (typeof input.trailingText === 'string') out.trailingText = input.trailingText;
    else if ('trailingText' in input)           warnings.push(path + '.trailingText: not a string — defaulted');

    used.add('currentValue');
    if (typeof input.currentValue === 'number') out.currentValue = input.currentValue;
    else if ('currentValue' in input)           warnings.push(path + '.currentValue: not a number — defaulted');

    used.add('maxValue');
    if (typeof input.maxValue === 'number')     out.maxValue = input.maxValue;
    else if ('maxValue' in input)               warnings.push(path + '.maxValue: not a number — defaulted');

    used.add('minValue');
    if (typeof input.minValue === 'number')     out.minValue = input.minValue;
    else if ('minValue' in input)               warnings.push(path + '.minValue: not a number — defaulted');

    used.add('maxScaleStr');
    if (typeof input.maxScaleStr === 'string')  out.maxScaleStr = input.maxScaleStr;
    else if ('maxScaleStr' in input)            warnings.push(path + '.maxScaleStr: not a string — defaulted');

    used.add('minScaleStr');
    if (typeof input.minScaleStr === 'string')  out.minScaleStr = input.minScaleStr;
    else if ('minScaleStr' in input)            warnings.push(path + '.minScaleStr: not a string — defaulted');

    used.add('displayFormat');
    if (typeof input.displayFormat === 'string' && DISPLAY_FORMATS.indexOf(input.displayFormat) !== -1) {
      out.displayFormat = input.displayFormat;
    } else if ('displayFormat' in input) {
      warnings.push(path + '.displayFormat: not one of "both" / "text" / "slider" — defaulted to "both"');
    }
  }

  // Data Display-only fields — same numeric-slider shape as PWM but
  // display-only; trailingText carries units (matches wire format).
  if (input.type === ITEM_TYPE_DATADISPLAY) {
    used.add('trailingText');
    if (typeof input.trailingText === 'string') out.trailingText = input.trailingText;
    else if ('trailingText' in input)           warnings.push(path + '.trailingText: not a string — defaulted');

    used.add('currentValue');
    if (typeof input.currentValue === 'number') out.currentValue = input.currentValue;
    else if ('currentValue' in input)           warnings.push(path + '.currentValue: not a number — defaulted');

    used.add('maxValue');
    if (typeof input.maxValue === 'number')     out.maxValue = input.maxValue;
    else if ('maxValue' in input)               warnings.push(path + '.maxValue: not a number — defaulted');

    used.add('minValue');
    if (typeof input.minValue === 'number')     out.minValue = input.minValue;
    else if ('minValue' in input)               warnings.push(path + '.minValue: not a number — defaulted');

    used.add('maxScaleStr');
    if (typeof input.maxScaleStr === 'string')  out.maxScaleStr = input.maxScaleStr;
    else if ('maxScaleStr' in input)            warnings.push(path + '.maxScaleStr: not a string — defaulted');

    used.add('minScaleStr');
    if (typeof input.minScaleStr === 'string')  out.minScaleStr = input.minScaleStr;
    else if ('minScaleStr' in input)            warnings.push(path + '.minScaleStr: not a string — defaulted');

    used.add('displayFormat');
    if (typeof input.displayFormat === 'string' && DISPLAY_FORMATS.indexOf(input.displayFormat) !== -1) {
      out.displayFormat = input.displayFormat;
    } else if ('displayFormat' in input) {
      warnings.push(path + '.displayFormat: not one of "both" / "text" / "slider" — defaulted to "both"');
    }
  }

  // Pin assignment — applies to on/off, PWM, and data display items.
  // Stored as null (not connected) or { name, type, invertOutput }.
  if (input.type === ITEM_TYPE_ONOFF || input.type === ITEM_TYPE_PWM || input.type === ITEM_TYPE_ONOFFDISPLAY
      || input.type === ITEM_TYPE_DATADISPLAY) {
    used.add('pin');
    if (input.pin === null || input.pin === undefined) {
      out.pin = null;
    } else if (typeof input.pin === 'object') {
      const pinName   = typeof input.pin.name         === 'string'  ? input.pin.name         : null;
      const pinType   = typeof input.pin.type         === 'string'  ? input.pin.type         : null;
      const pinInvert = typeof input.pin.invertOutput === 'boolean' ? input.pin.invertOutput : false;
      if (pinName && pinType) {
        out.pin = { name: pinName, type: pinType, invertOutput: pinInvert };
      } else {
        warnings.push(path + '.pin: missing name or type — defaulted to null');
        out.pin = null;
      }
    } else {
      warnings.push(path + '.pin: not an object — defaulted to null');
      out.pin = null;
    }
  }

  // Sub-menu pointer — recursively parse the nested menu node.
  if (input.type === ITEM_TYPE_SUBMENU) {
    used.add('subMenu');
    out.subMenu = _parseMenuTolerant(input.subMenu, path + '.subMenu', warnings);
  }

  // Chart-only fields: chartLabel, xAxisIdx, separatePlots, dataIntervalIdx, plots[3].
  if (input.type === ITEM_TYPE_CHART) {
    used.add('chartLabel');
    if (typeof input.chartLabel === 'string') out.chartLabel = input.chartLabel;
    else if ('chartLabel' in input)           warnings.push(path + '.chartLabel: not a string — defaulted');

    used.add('xAxisIdx');
    if (typeof input.xAxisIdx === 'number' && input.xAxisIdx >= 0 && input.xAxisIdx < CHART_XAXIS_FORMATS.length) {
      out.xAxisIdx = input.xAxisIdx;
    } else if ('xAxisIdx' in input) {
      warnings.push(path + '.xAxisIdx: out of range — defaulted to ' + DEFAULT_CHART_XAXIS_IDX);
    }

    used.add('separatePlots');
    if (typeof input.separatePlots === 'boolean') out.separatePlots = input.separatePlots;
    else if ('separatePlots' in input)            warnings.push(path + '.separatePlots: not a boolean — defaulted');

    used.add('dataIntervalIdx');
    if (typeof input.dataIntervalIdx === 'number' && input.dataIntervalIdx >= 0 && input.dataIntervalIdx < CHART_DATA_INTERVALS.length) {
      out.dataIntervalIdx = input.dataIntervalIdx;
    } else if ('dataIntervalIdx' in input) {
      warnings.push(path + '.dataIntervalIdx: out of range — defaulted to ' + DEFAULT_CHART_DATA_INTERVAL_IDX);
    }

    used.add('plots');
    if (Array.isArray(input.plots)) {
      for (let pi = 0; pi < 3; pi++) {
        const p = (input.plots[pi] && typeof input.plots[pi] === 'object') ? input.plots[pi] : {};
        const fp = _freshPlot(pi + 1);
        if (typeof p.plotLabel    === 'string')  fp.plotLabel    = p.plotLabel;
        if (typeof p.units        === 'string')  fp.units        = p.units;
        if (typeof p.dataRangeMax === 'number')  fp.dataRangeMax = p.dataRangeMax;
        if (typeof p.dataRangeMin === 'number')  fp.dataRangeMin = p.dataRangeMin;
        if (typeof p.autoScale    === 'boolean') fp.autoScale    = p.autoScale;
        if (typeof p.showPlot     === 'boolean') fp.showPlot     = p.showPlot;
        if (typeof p.displayMax   === 'string')  fp.displayMax   = p.displayMax;
        if (typeof p.displayMin   === 'string')  fp.displayMin   = p.displayMin;
        if (p.pin && typeof p.pin === 'object' && typeof p.pin.name === 'string' && p.pin.name) {
          fp.pin = { name: p.pin.name, codeName: typeof p.pin.codeName === 'string' ? p.pin.codeName : p.pin.name, type: PinType.ANALOG_INPUT };
        }
        out.plots[pi] = fp;
      }
    } else if ('plots' in input) {
      warnings.push(path + '.plots: not an array — defaulted to 3 fresh plots');
    }
  }

  for (const key of Object.keys(input)) {
    if (!used.has(key)) warnings.push(path + '.' + key + ': unrecognised field — ignored');
  }
  return out;
}

/// Parse a menu node tolerantly.  Recurses into items[].subMenu (when
/// item support lands) collecting warnings with a path prefix so the
/// caller can pinpoint which menu in the tree was malformed.
function _parseMenuTolerant(input, path, warnings) {
  const out = _freshMenu();
  if (input === null || input === undefined) {
    warnings.push(path + ': missing — using fresh menu');
    return out;
  }
  if (typeof input !== 'object') {
    warnings.push(path + ': not an object — using fresh menu');
    return out;
  }
  // Track every key the parser actually consults — see comment in
  // _parsePromptFormatTolerant.
  const used = new Set();

  used.add('promptText');
  if (typeof input.promptText === 'string')  out.promptText = input.promptText;
  else if ('promptText' in input)            warnings.push(path + '.promptText: not a string — defaulted');

  used.add('promptFormat');
  out.promptFormat = _parsePromptFormatTolerant(input.promptFormat, path + '.promptFormat', warnings);

  used.add('refresh_ms');
  if (typeof input.refresh_ms === 'number')  out.refresh_ms = input.refresh_ms;
  else if ('refresh_ms' in input)            warnings.push(path + '.refresh_ms: not a number — defaulted to 0');

  used.add('items');
  if (Array.isArray(input.items)) {
    // Walk each item through the tolerant parser.  Null returns
    // (dropped items) are filtered out; surviving items keep their
    // index relative to the surviving siblings.
    out.items = [];
    for (let i = 0; i < input.items.length; i++) {
      const it = _parseItemTolerant(input.items[i], path + '.items[' + i + ']', warnings);
      if (it !== null) out.items.push(it);
    }
  } else if ('items' in input) {
    warnings.push(path + '.items: not an array — defaulted to []');
  }
  // Flag every input key the parser didn't touch.
  for (const key of Object.keys(input)) {
    if (!used.has(key)) warnings.push(path + '.' + key + ': unrecognised field — ignored');
  }
  return out;
}

// localStorage key layout.  Per-design payloads live under
// '<STORAGE_PREFIX><name>'; LIST_KEY tracks all names; CURRENT_KEY
// points at the most recently used.
const STORAGE_PREFIX     = 'pfodDesigner.v1.';
const LIST_KEY           = 'pfodDesigner.v1.list';
const CURRENT_KEY        = 'pfodDesigner.v1.current';

// Wrapper format tag for exportToBlob() / importFromObject() — lets a
// future schema bump reject a foreign or stale file cleanly.
const EXPORT_FORMAT_TAG  = 'pfodDesigner';

// ── DesignerState class ─────────────────────────────────────────────

class DesignerState {
  /// Explicit constructor — both args are REQUIRED.  For the "give me
  /// a fresh state with a sensible default name" path, use the static
  /// factory DesignerState.newDefault(board) instead.
  /// @param {BaseBoard} board — runtime board model (from BoardLoader.load)
  /// @param {string}    name  — design name; becomes part of the
  ///                            localStorage key for this design
  constructor(board, name) {
    if (!board) throw new Error('[DesignerState] constructor: board is required');
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('[DesignerState] constructor: name is required (non-empty string)');
    }
    this.board    = board;
    this.name     = name;
    // Currently-chosen transport for this design.  Persisted so the
    // user's connection pick (Serial / BLE / TCP/IP Socket / HTTP)
    // survives reload.  Initialised to 'serial' because every board
    // must support serial (BoardLoader enforces it).  Updated by the
    // connection picker in designer/menus/editConnection.js.
    this.connection = 'serial';
    // Currently-chosen baud rate for the serial transport.  Defaults
    // to the board's own default; persisted so the user's pick from
    // the baud picker survives reload.  Validated against the board's
    // supportedBauds on _tryLoad — boards may change between sessions.
    this.baud = board.connections.serial.defaultBaud;
    // The whole design's menu tree.  rootMenu carries the top-level
    // prompt + format + items; items of type 'submenu' nest sub-menus
    // recursively (no fixed depth cap).
    this.rootMenu = _freshMenu();
    // Path from root to the menu the user is currently editing.  Each
    // element is an item index into the parent's items[] array.  Empty
    // = editing the root.  IN-MEMORY ONLY — reopening a design lands
    // you at root regardless of where you stopped last time.
    this.activeMenuPath = [];
    // Index into state.getActiveMenu().items of the item the user is
    // currently editing — set by addMenuItem on creation, set by Edit
    // Menu Items when the user picks an item to edit.  null when no
    // item is active (user is on editMenu or earlier).  IN-MEMORY ONLY.
    this.activeItemIdx  = null;
    // Item currently bound to the "Change Display Format" sub-screen
    // (cmd 'F').  Any caller can point this at an arbitrary object
    // carrying a `.formats` block before navigating to `{F}`; the
    // format handler mutates `.formats` in place and the caller
    // picks up the changes via the same reference on back-nav.
    // Defaults to whatever editMenuItem is editing (active item)
    // when the format sub-screen is reached without an explicit
    // setter call.  IN-MEMORY ONLY.
    this.formatItem      = null;
    // Set by addMenuItem._applyPick to the index of the newly-created
    // item before it queues {d}.  handleSubMenuEntry checks this flag to
    // distinguish "addMenuItem just ran and queued {d}" (preserve
    // activeItemIdx so the queued {d} opens the right editor) from all
    // other {s<path>} invocations (reset activeItemIdx=null so {d}
    // bare-restore can pop the path back to the parent item editor).
    // Cleared by handleSubMenuEntry after the one re-send pfodApp fires
    // before the queued {d} arrives.  IN-MEMORY ONLY.
    this._pendingNewItemIdx = null;
    // Server-side editor context stack.  Each frame {menuPath, itemIdx} records
    // the state before entering a sub-menu editor via {s<path>}.  Popped by {d}
    // bare-restore when back-navigating from a sub-menu editMenu to the parent
    // item editor.  IN-MEMORY ONLY.
    this.contextStack = [];
    // Debug flag — verbose dispatch logging when truthy.
    this.debug    = false;
    // Attempt to restore persisted designer artefacts for this name.
    // _tryLoad applies the full payload or nothing — no per-field
    // partial restores.
    this._tryLoad();
  }

  /// Factory: construct a state with a sensible default name.  Resolves
  /// to the last-used name if one is stored, else the first unused
  /// "Menu_<n>".  Use this when the caller has no specific name in mind.
  static newDefault(board) {
    const lastUsed = DesignerState._readCurrentPointer();
    if (lastUsed) return new DesignerState(board, lastUsed);
    return new DesignerState(board, DesignerState._nextDefaultName());
  }

  // ── Active-menu navigation ──────────────────────────────────────────

  /// Walk activeMenuPath from rootMenu and return the menu currently
  /// being edited.  A stale path (e.g. an item index that no longer
  /// exists because it was deleted) resets the path to [] and returns
  /// the root — handlers never see a dangling reference.
  getActiveMenu() {
    let m = this.rootMenu;
    for (const idx of this.activeMenuPath) {
      const it = m.items[idx];
      if (!it || it.type !== 'submenu' || !it.subMenu) {
        this.activeMenuPath = [];
        return this.rootMenu;
      }
      m = it.subMenu;
    }
    return m;
  }

  /// Return the item the user is currently editing (the item at
  /// state.activeItemIdx in the active menu).  null when no item is
  /// active or the index is out of range — handlers check the return
  /// and treat null as "abort, render parent".
  getActiveItem() {
    if (this.activeItemIdx === null) return null;
    const items = this.getActiveMenu().items;
    if (this.activeItemIdx < 0 || this.activeItemIdx >= items.length) return null;
    return items[this.activeItemIdx];
  }

  /// DFS walk of rootMenu, returning every item at all depths.
  /// Used by _makeAutoCmd callers so generated C++ variable names
  /// are unique across the whole design tree, not just siblings.
  getAllItems() {
    const items = [];
    function walk(menu) {
      for (const item of menu.items) {
        items.push(item);
        if (item.type === 'submenu' && item.subMenu) walk(item.subMenu);
      }
    }
    walk(this.rootMenu);
    return items;
  }

  // ── Persistence — single named design ───────────────────────────────

  /// Persist mutable designer state to localStorage under the active
  /// name.  Called by the dispatcher after every handler that may have
  /// mutated state.  The board is NOT persisted (it is supplied per
  /// session by the connection picker).
  ///
  /// Skipped when `this.name` is empty — that's the transient
  /// "no active design" state the user lands in after deleting the
  /// active design from the Delete-empty-Menu screen.  Writing under
  /// an empty key would just put back the deleted entry.  The next
  /// Start-new / Edit-existing action assigns a real name and saves
  /// normally.
  save() {
    if (!this.name) return;
    try {
      const payload = {
        version:    DESIGNER_STATE_SCHEMA_VERSION,
        rootMenu:   this.rootMenu,
        // Tag the save with the active board's name so _tryLoad can
        // detect a target change since the save was written.  Saved
        // connection/baud are only restored on a same-board load —
        // a different board resets to that board's defaults so the
        // user doesn't end up with a stale 9600 baud after switching
        // an AVR design over to ESP32 (which defaults to 115200).
        boardName:  this.board.name,
        connection: this.connection,
        baud:       this.baud,
      };
      localStorage.setItem(STORAGE_PREFIX + this.name, JSON.stringify(payload));
      DesignerState._addToList(this.name);
      localStorage.setItem(CURRENT_KEY, this.name);
    } catch (err) {
      // Quota exceeded, private browsing, etc.  Log but don't break the
      // dispatch — user can keep editing; we just can't persist this turn.
      console.warn('[DesignerState] save failed:', err.message);
    }
  }

  /// Switch the active design to `name`, replacing in-place fields with
  /// whatever was persisted under that name (or fresh defaults if not
  /// found).  Resets activeMenuPath and activeItemIdx ONLY when the
  /// name actually changes — re-loading the currently-active design
  /// (e.g. Edit existing Menu picking the same name that's already
  /// open) preserves the in-memory editing pointers, which matters
  /// because pfodWeb's selection-screen back-nav re-fires the picker
  /// cmd and would otherwise wipe state that handlers like Add Menu
  /// Item just set during their own dispatch.
  loadNamed(name) {
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('[DesignerState] loadNamed requires a non-empty string name');
    }
    const nameChanged = (name !== this.name);
    this.name     = name;
    this.rootMenu = _freshMenu();
    if (nameChanged) {
      this.activeMenuPath = [];
      this.activeItemIdx  = null;
      this.contextStack   = [];
    }
    this._tryLoad();
  }

  /// Rename the active design.  Removes the old localStorage key, writes
  /// the new one, and updates the index list / current pointer.
  rename(newName) {
    if (typeof newName !== 'string' || newName.length === 0) {
      throw new Error('[DesignerState] rename requires a non-empty string');
    }
    if (newName === this.name) return;
    const oldName = this.name;
    this.name = newName;
    this.save();
    try {
      localStorage.removeItem(STORAGE_PREFIX + oldName);
      DesignerState._removeFromList(oldName);
    } catch (_) {}
  }

  /// Wipe the active design's persisted state (and its index entry).
  /// Used by a future "Discard / New" menu action.  In-memory fields
  /// reset to constructor defaults.
  clear() {
    try {
      localStorage.removeItem(STORAGE_PREFIX + this.name);
      DesignerState._removeFromList(this.name);
    } catch (_) {}
    this.rootMenu       = _freshMenu();
    this.activeMenuPath = [];
    this.activeItemIdx  = null;
    this.contextStack   = [];
  }

  /// Walk the entire menu tree and repair or clear item.pin:
  ///  - null out pins whose name is no longer on the current board
  ///  - repair missing codeName (pre-codeName saved designs)
  ///  - upgrade type from pwm_output → dac_output when the board pin
  ///    natively supports DAC, so code generation emits dacWrite()
  /// Called after every _tryLoad and importFromObject.
  _clearInvalidPins() {
    const pinByName = new Map(this.board.pins.map(p => [p.name, p]));
    const walk = (menu) => {
      for (const item of menu.items) {
        if (item.pin) {
          const bp = pinByName.get(item.pin.name);
          if (!bp) {
            item.pin = null;
          } else {
            if (typeof item.pin.codeName !== 'string' || !item.pin.codeName) {
              item.pin.codeName = bp.codeName;
            }
            if (item.pin.type === PinType.PWM_OUTPUT
                && bp.capabilities.supports(PinType.DAC_OUTPUT)) {
              item.pin.type = PinType.DAC_OUTPUT;
            }
          }
        }
        if (item.subMenu) walk(item.subMenu);
      }
    };
    walk(this.rootMenu);
  }

  /// Internal: load persisted state if a valid-enough payload exists
  /// for the active name.  Tolerantly parses each field — anything
  /// missing / wrong-typed gets its default, with a one-line warning
  /// pushed onto a warnings array that's surfaced via console.warn at
  /// the end (no UI alert — this runs during construction).  Schema
  /// mismatch is still a hard early-return (the localStorage payload
  /// was written by THIS code, so a version mismatch IS the schema-
  /// bump scenario; clean discard is correct).
  _tryLoad() {
    let raw;
    try {
      raw = localStorage.getItem(STORAGE_PREFIX + this.name);
    } catch (_) {
      return;  // localStorage unavailable (private browsing, etc.)
    }
    if (!raw) return;
    let payload;
    try { payload = JSON.parse(raw); } catch (_) { return; }

    if (!payload) return;

    const warnings = [];
    this.rootMenu = _parseMenuTolerant(payload.rootMenu, 'rootMenu', warnings);
    // Clear any item.pin whose name is no longer present on the current
    // board — catches both target switches and board updates that removed
    // a pin.  Done every load so stale pins never reach code generation.
    this._clearInvalidPins();
    // Restore connection + baud ONLY when the save was made under the
    // same target.  Switching targets in the connection prompt should
    // reset both to the new board's defaults — the constructor already
    // seeded them with those defaults, so skipping the restore is all
    // it takes.
    if (payload.boardName === this.board.name) {
      if (typeof payload.connection === 'string'
          && this.board.connections[payload.connection]) {
        this.connection = payload.connection;
      }
      if (typeof payload.baud === 'number'
          && this.board.connections.serial.supportedBauds.includes(payload.baud)) {
        this.baud = payload.baud;
      }
    } else {
      console.log('[DesignerState] target changed since save (' +
                  payload.boardName + ' → ' + this.board.name +
                  ') — resetting connection/baud to new board defaults');
    }
    if (warnings.length > 0) {
      console.warn('[DesignerState] _tryLoad: design "' + this.name +
                   '" loaded with issues: ' + warnings.join('; '));
    }
  }

  // ── File I/O — cross-machine sharing ────────────────────────────────

  /// Serialise the current design to a self-describing JSON blob suitable
  /// for the user to save to a file (download trigger lives in the UI
  /// layer).  Includes the design name and a wrapper `format` tag so
  /// importFromObject() can reject foreign or future-schema files
  /// cleanly.
  /// @returns {Blob} downloadable JSON blob (mime type application/json)
  exportToBlob() {
    return new Blob([this.exportToJSON()], { type: 'application/json' });
  }

  /// Same content as exportToBlob() but returned as a plain JSON string.
  /// Used by generateCode.js to embed the design file inside the ZIP.
  /// @returns {string} JSON string
  exportToJSON() {
    const out = {
      format:   EXPORT_FORMAT_TAG,
      schema:   DESIGNER_STATE_SCHEMA_VERSION,
      name:     this.name,
      savedAt:  new Date().toISOString(),
      data: {
        rootMenu: this.rootMenu,
      },
    };
    return JSON.stringify(out, null, 2);
  }

  /// Counterpart to exportToBlob: load a parsed JSON object back into
  /// this state, then persist.  Two failure modes:
  ///
  ///   HARD — wrapper-level (wrong format tag, missing `data` object,
  ///   missing resolved name).  Throws immediately; state is NOT
  ///   applied.  Caller (loadFromFile.js) should show a "Cannot
  ///   import file: …" alert.
  ///
  ///   PARTIAL — schema mismatch and / or per-field corruption inside
  ///   data.rootMenu.  State IS applied (every valid field used, every
  ///   invalid field defaulted).  Throws a single Error with
  ///   `err.partial === true` and the joined list of per-field
  ///   warnings as its message — caller should show a "Design loaded,
  ///   but some fields had errors: …" alert and let the user keep the
  ///   recovered design.
  ///
  /// The wrapper has its own name; pass `overrideName` only when a
  /// collision was detected and the user picked a new name.
  importFromObject(parsed, overrideName) {
    if (!parsed || parsed.format !== EXPORT_FORMAT_TAG) {
      throw new Error('[DesignerState] not a ' + EXPORT_FORMAT_TAG +
                      ' file (missing or wrong "format" tag)');
    }
    if (!parsed.data || typeof parsed.data !== 'object') {
      throw new Error('[DesignerState] import missing "data" object');
    }
    const resolvedName = overrideName ? overrideName : parsed.name;
    if (typeof resolvedName !== 'string' || resolvedName.length === 0) {
      throw new Error('[DesignerState] import missing "name" (and no overrideName supplied)');
    }

    // Soft schema mismatch — warn + tolerantly parse the data.  Older
    // schemas with fewer fields will simply trigger per-field defaults
    // via _parseMenuTolerant; newer schemas with extra fields will
    // have those silently ignored.
    const warnings = [];
    if (parsed.schema !== DESIGNER_STATE_SCHEMA_VERSION) {
      warnings.push('schema: file=' + parsed.schema + ', expected=' +
                    DESIGNER_STATE_SCHEMA_VERSION +
                    ' — loaded with defaults for unrecognised fields');
    }
    const d = parsed.data;
    this.name           = resolvedName;
    this.rootMenu       = _parseMenuTolerant(d.rootMenu, 'rootMenu', warnings);
    this._clearInvalidPins();
    this.activeMenuPath = [];
    this.activeItemIdx  = null;
    this.contextStack   = [];
    this.save();

    if (warnings.length > 0) {
      const err = new Error('Imported with ' + warnings.length + ' issue(s):\n' +
                            warnings.join('\n'));
      err.partial = true;        // marker the caller checks
      throw err;
    }
  }

  // ── Static helpers — index list + naming ────────────────────────────

  /// All design names persisted on this machine, in insertion order.
  /// Returns [] when localStorage is unavailable or no list has been
  /// written yet.
  static listNames() {
    try {
      const raw = localStorage.getItem(LIST_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.slice();
    } catch (_) { return []; }
  }

  /// Append name to the index list if not already present.
  static _addToList(name) {
    try {
      const list = DesignerState.listNames();
      if (!list.includes(name)) {
        list.push(name);
        localStorage.setItem(LIST_KEY, JSON.stringify(list));
      }
    } catch (_) {}
  }

  /// Drop name from the index list (no-op if absent).  Also clears the
  /// current-pointer if it was pointing at the dropped name.
  static _removeFromList(name) {
    try {
      const list = DesignerState.listNames().filter((n) => n !== name);
      localStorage.setItem(LIST_KEY, JSON.stringify(list));
      const cur = localStorage.getItem(CURRENT_KEY);
      if (cur === name) localStorage.removeItem(CURRENT_KEY);
    } catch (_) {}
  }

  /// Read the "most recently in use" pointer; null if unset.
  static _readCurrentPointer() {
    try { return localStorage.getItem(CURRENT_KEY); } catch (_) { return null; }
  }

  /// First unused "Menu_<n>" name on this machine.  Matches Java
  /// DesignerStatics.NEW_MENU_NAME = "Menu" pattern.
  static _nextDefaultName() {
    const taken = new Set(DesignerState.listNames());
    for (let n = 1; ; n++) {
      const candidate = DEFAULT_NAME_PREFIX + n;
      if (!taken.has(candidate)) return candidate;
    }
  }
}
