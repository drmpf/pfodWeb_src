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
const DESIGNER_STATE_SCHEMA_VERSION = 12;

// Board a pre-schema-12 design is assumed to have been built for.
// Schema 11 and earlier did not record the target in the exported file
// (only the localStorage payload carried boardName), so a target change
// could not be detected on a file load and pin/ADC values were left as
// saved. Those files still load; they are simply treated as "built for an
// Arduino UNO", which is both the designer's own default target and by far
// the most likely origin. If that guess is wrong the only cost is that the
// ADC re-derivation below either runs when it needn't or is skipped when it
// should have run — the user is told either way, and can re-save under the
// real target to make it explicit from then on.
const LEGACY_ASSUMED_BOARD_NAME = 'Arduino UNO';

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

/// Index into CHART_DATA_INTERVALS / CHART_DATA_INTERVAL_LABELS for a
/// chart item, validated.  Every chart item carries a valid
/// dataIntervalIdx: _freshChartItem seeds one, the item editor only ever
/// writes an in-range slider index, and _parseItemTolerant reports (and
/// re-seeds) anything else on load.  So a bad value reaching here means
/// a chart item was built or mutated outside all three — this throws
/// rather than substituting CHART_DATA_INTERVALS[0], which would bake a
/// silently wrong sample rate into generated code (or into the chart
/// preview's own CSV timestamps) with nothing to show the user it
/// happened.
/// @param {object} item — a chart menu item
/// @returns {number} a valid index into both interval arrays
function chartDataIntervalIdx(item) {
  const idx = item.dataIntervalIdx;
  if (!Number.isInteger(idx) || idx < 0 || idx >= CHART_DATA_INTERVALS.length) {
    throw new Error('[DesignerState] chart "' + (item.chartLabel || item.autoCmd || '?') +
      '": dataIntervalIdx is not a valid 0-' + (CHART_DATA_INTERVALS.length - 1) +
      ' index: ' + JSON.stringify(idx));
  }
  return idx;
}

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
///
/// Seeded from the active board's ADC block (board.adc), passed down from
/// _freshChartItem — the exact same two values, handled the exact same
/// way, as _freshDataDisplayItem's own adcMax/adcRefVolts, since a plot
/// wired to an analog pin and a Data/ADC Display on that pin are reading
/// the same hardware:
///
///   adcMax      — full-scale count (1023 on a 10-bit AVR/ESP8266, 4095
///                 on a 12-bit ESP32/RP2040) becomes the Data Variable
///                 Range max.  A plot reads RAW counts, so this has to
///                 span the chip's real full scale or the trace sits at a
///                 fraction of the axis.
///   adcRefVolts — reference voltage becomes the display max, with units
///                 'V', so a fresh plot reads in volts rather than raw
///                 counts (mapping is done in the generated code).
///
/// Both fall back to the 10-bit/no-units constants when the board has no
/// value: an empty adc block (the "Minimal C Code" and "Unlisted Board"
/// targets — nothing to derive from), and the tolerant-parser seed path,
/// where every field is about to be overwritten from the file anyway.
/// @param {number} n              1-based plot number used in the default label
/// @param {number} [adcMax]       board.adc.max
/// @param {string} [adcRefVolts]  board.adc.defaultRefVolts
function _freshPlot(n, adcMax, adcRefVolts) {
  const rawMax  = (adcMax      != null) ? adcMax              : DEFAULT_PLOT_DATA_RANGE_MAX;
  const dispMax = (adcRefVolts != null) ? String(adcRefVolts) : DEFAULT_PLOT_DISPLAY_MAX;
  const units   = (adcRefVolts != null) ? 'V'                 : DEFAULT_PLOT_UNITS;
  return {
    plotLabel:    DEFAULT_PLOT_LABEL + ' ' + n,
    units:        units,
    dataRangeMax: rawMax,
    dataRangeMin: DEFAULT_PLOT_DATA_RANGE_MIN,
    autoScale:    DEFAULT_PLOT_AUTO_SCALE,
    showPlot:     DEFAULT_PLOT_SHOW,
    displayMax:   dispMax,
    displayMin:   DEFAULT_PLOT_DISPLAY_MIN,
  };
}

/// Fresh Chart item — a menu button that opens a chart with up to 3 plots.
/// `text` is the button label shown in the menu; `chartLabel` is the title
/// shown inside the chart view.
/// @param {string} autoCmd  C++ variable-name string
/// @param {number} [adcMax]      board.adc.max — the active board's ADC
///        full-scale count, seeded into all 3 plots' Data Variable Range
///        (see _freshPlot).  Omitted on the tolerant-parser seed path.
/// @param {string} [adcRefVolts] board.adc.defaultRefVolts — seeded into
///        all 3 plots' display max, with units 'V'.
function _freshChartItem(autoCmd, adcMax, adcRefVolts) {
  return {
    type:            ITEM_TYPE_CHART,
    autoCmd:         autoCmd,
    text:            DEFAULT_CHART_LABEL,
    formats:         _freshPromptFormat(),
    chartLabel:      DEFAULT_CHART_LABEL,
    xAxisIdx:        DEFAULT_CHART_XAXIS_IDX,
    separatePlots:   true,
    dataIntervalIdx: DEFAULT_CHART_DATA_INTERVAL_IDX,
    plots: [
      _freshPlot(1, adcMax, adcRefVolts),
      _freshPlot(2, adcMax, adcRefVolts),
      _freshPlot(3, adcMax, adcRefVolts),
    ],
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
/// when the user clicks it.  dwgName is the DwgLibrary entry this item
/// is linked to — null until the user picks or loads one via the
/// "Choose a Drawing" screen (designer/menus/selectDwgForItem.js),
/// reached immediately after this item is first created (see
/// addMenuItem.js's IDX_DRAWING branch) or later via the item editor's
/// own "Change Drawing" button.
/// The autoCmd generates the C++ handler stub; text is the button label.
function _freshDrawingItem(autoCmd) {
  return {
    type:    ITEM_TYPE_DRAWING,
    autoCmd: autoCmd,
    text:    DEFAULT_DRAWING_TEXT,
    formats: _freshPromptFormat(),
    dwgName: null,
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
/// `type + '_' + text + '_Cmd'`.  `text` is first sanitised: any
/// inline <b>/<+1>/<r>-style format tag is stripped out whole (not
/// just its punctuation — the tag's own letters/digits, e.g. the 'b'
/// in <b>, never become part of the name), then any run of remaining
/// non-alphanumeric characters (spaces, newlines) collapses to a
/// single '_', then the result is capped at 15 characters, so a long
/// or heavily-formatted button/label doesn't produce an unusably long
/// generated name (this is the single source _cppId/_pinConstName/
/// generateCode's own C++ output and every "Cmd:"-style display all
/// build on, so a short name here is short everywhere).  When the
/// base collides with an existing autoCmd in the same menu, a `_2`,
/// `_3`, … suffix is appended until the result is unique.
function _makeAutoCmd(type, text, existingItems) {
  const cleaned = (text || '')
    .replace(/<[^>]*>/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 15)
    .replace(/_+$/, '');
  const base = type + '_' + cleaned + '_Cmd';
  const used = new Set((existingItems || []).map((it) => it && it.autoCmd).filter(Boolean));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const cand = base + '_' + n;
    if (!used.has(cand)) return cand;
  }
}

/// Canonical 52-slot single-letter pfod cmd pool for the "Minimal C
/// Code" target: 'A'..'Z' then 'a'..'z'.  Order matters — new letters
/// are always handed out from this sequence (A-Z exhausted before any
/// lowercase letter), and it must be an explicit array rather than
/// char-code arithmetic since 'Z' -> 'a' is not contiguous in ASCII.
const CCODE_CMD_POOL = Object.freeze(
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('')
);

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

/// Coerce a saved list index (a chart's xAxisIdx / dataIntervalIdx) onto the
/// NEAREST valid slot rather than discarding it for the type's default.
///
/// Both fields index a fixed option list whose length can change between
/// builds, and both change what the generated sketch actually does — an
/// x-axis format, and a sample rate.  Snapping an out-of-range value back to
/// the fresh-item default throws away everything the saved value said: a
/// dataIntervalIdx of 7 written by a build with more intervals means "the
/// slowest rate I had", and resetting it to index 0 turns that into the
/// FASTEST rate — the opposite of the intent, and a change the user may not
/// notice.  Clamping to the nearest end preserves that intent as closely as
/// the current list allows.
///
/// A fractional index is rounded to the nearest slot first, then clamped.  A
/// non-number has no "nearest" and still falls back to the supplied default.
///
/// @param {*} input — raw value from the file
/// @param {number} len — length of the option list
/// @param {number} fallback — used only when input is not a finite number
/// @returns {{value:number, changed:boolean, reason:string|null}}
///          changed=false means the input was already a valid slot
function _coerceListIdx(input, len, fallback) {
  if (typeof input !== 'number' || !isFinite(input)) {
    return { value: fallback, changed: true, reason: 'not a number' };
  }
  const rounded = Math.round(input);
  const clamped = Math.min(len - 1, Math.max(0, rounded));
  if (clamped === input) return { value: clamped, changed: false, reason: null };
  return {
    value: clamped,
    changed: true,
    reason: (clamped !== rounded) ? 'out of range 0-' + (len - 1) : 'not a whole number',
  };
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
  // fields, mirroring the prompt-format / menu parsers.  An unknown type is
  // DROPPED, not carried through: this build cannot render it, edit it, or
  // generate code for it, so keeping it would leave the design holding an
  // item the user can neither see nor remove, which then gets written back
  // out on the next save as though it were still meaningful.  Dropping it
  // costs the round-trip of a design saved by some future build with more
  // item types, which is the deliberate trade: the file on disk is still
  // intact until the user saves over it, and the warning names exactly what
  // was removed.  Same treatment as every other unusable item (a null entry,
  // a non-object, a Drawing with no dwgName).
  if (input.type !== ITEM_TYPE_BUTTON       &&
      input.type !== ITEM_TYPE_LABEL        &&
      input.type !== ITEM_TYPE_ONOFF        &&
      input.type !== ITEM_TYPE_PWM          &&
      input.type !== ITEM_TYPE_ONOFFDISPLAY &&
      input.type !== ITEM_TYPE_DATADISPLAY  &&
      input.type !== ITEM_TYPE_SUBMENU      &&
      input.type !== ITEM_TYPE_CHART        &&
      input.type !== ITEM_TYPE_DRAWING) {
    warnings.push(path + '.type: "' + input.type + '" is not a supported item type — item dropped');
    return null;
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

  // ccodeCmd is optional and lazily assigned (see DesignerState.assignCcodeCmds) —
  // only present once a design has been generated for the "Minimal C
  // Code" target, so absence here is normal and not warned about.
  used.add('ccodeCmd');
  if (typeof input.ccodeCmd === 'string' && CCODE_CMD_POOL.indexOf(input.ccodeCmd) !== -1) {
    out.ccodeCmd = input.ccodeCmd;
  } else if ('ccodeCmd' in input) {
    warnings.push(path + '.ccodeCmd: not a single A-Z/a-z letter — dropped, will be reassigned');
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
  // invertOutput only applies to onoff (output drive polarity) —
  // onoffdisplay/pwm/datadisplay pins never get it set via the UI, so
  // it's omitted for those types rather than stamping a meaningless
  // invertOutput: false onto them.
  if (input.type === ITEM_TYPE_ONOFF || input.type === ITEM_TYPE_PWM || input.type === ITEM_TYPE_ONOFFDISPLAY
      || input.type === ITEM_TYPE_DATADISPLAY) {
    used.add('pin');
    const usesInvert = input.type === ITEM_TYPE_ONOFF;
    if (input.pin === null || input.pin === undefined) {
      out.pin = null;
    } else if (typeof input.pin === 'object') {
      const pinName   = typeof input.pin.name         === 'string'  ? input.pin.name         : null;
      const pinType   = typeof input.pin.type         === 'string'  ? input.pin.type         : null;
      const pinInvert = typeof input.pin.invertOutput === 'boolean' ? input.pin.invertOutput : false;
      if (pinName && pinType) {
        out.pin = usesInvert
          ? { name: pinName, type: pinType, invertOutput: pinInvert }
          : { name: pinName, type: pinType };
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
    if ('xAxisIdx' in input) {
      const c = _coerceListIdx(input.xAxisIdx, CHART_XAXIS_FORMATS.length, DEFAULT_CHART_XAXIS_IDX);
      out.xAxisIdx = c.value;
      if (c.changed) {
        warnings.push(path + '.xAxisIdx: ' + JSON.stringify(input.xAxisIdx) + ' ' + c.reason +
          ' — using nearest, ' + c.value + ' (' + CHART_XAXIS_LABELS[c.value] + ')');
      }
    }

    // separatePlots and dataIntervalIdx are ALWAYS written by
    // exportToJSON — separatePlots even when false, dataIntervalIdx even
    // when it is the fresh-item value — so neither is optional on the way
    // back in.  Absence is reported the same as a bad value rather than
    // silently accepting the fresh-item seed: a chart's plot layout and
    // sample rate both change what the generated sketch does, so a file
    // that doesn't state them is a file that was hand-edited or written
    // by something else, and the user needs to know before the recovered
    // design is used.  (The seed is still what `out` carries — the load
    // is PARTIAL, not aborted — but it is now named in the warning.)
    used.add('separatePlots');
    if (typeof input.separatePlots === 'boolean') {
      out.separatePlots = input.separatePlots;
    } else {
      warnings.push(path + '.separatePlots: ' +
        ('separatePlots' in input ? 'not a boolean' : 'missing') +
        ' — this field is always written, so it must be present; using ' + out.separatePlots);
    }

    used.add('dataIntervalIdx');
    if ('dataIntervalIdx' in input) {
      const c = _coerceListIdx(input.dataIntervalIdx, CHART_DATA_INTERVALS.length,
                               DEFAULT_CHART_DATA_INTERVAL_IDX);
      out.dataIntervalIdx = c.value;
      if (c.changed) {
        warnings.push(path + '.dataIntervalIdx: ' + JSON.stringify(input.dataIntervalIdx) + ' ' +
          c.reason + ' — using nearest, ' + CHART_DATA_INTERVAL_LABELS[c.value]);
      }
    } else {
      // Absence is still reported even though the value is recoverable — see
      // the separatePlots comment above for why a file that does not state
      // this was not written by this designer.
      warnings.push(path + '.dataIntervalIdx: missing' +
        ' — this field is always written, so it must be present; using ' +
        CHART_DATA_INTERVAL_LABELS[out.dataIntervalIdx]);
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

  // Drawing-only field: the DwgLibrary entry this item is linked to.
  // A drawing item with no dwgName is never valid — the UI's own
  // deferred-creation flow (addMenuItem.js/selectDwgForItem.js) never
  // persists one until a dwg is actually picked, so this should be
  // unreachable via normal use; a hand-edited or corrupted file could
  // still contain one, so it's dropped (whole item removed, not just
  // defaulted) with a warning rather than silently loaded.
  if (input.type === ITEM_TYPE_DRAWING) {
    used.add('dwgName');
    if (typeof input.dwgName === 'string' && input.dwgName.length > 0) {
      out.dwgName = input.dwgName;
    } else {
      warnings.push(path + '.dwgName: missing or invalid — dropping this Drawing item (a menu item must be linked to a dwg)');
      return null;
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
// '<PRESERVED_PREFIX><name>' marks a design whose CURRENT stored bytes have
// already been written out to a file, ahead of a target change. It exists to
// stop the same version being downloaded twice: the target picker writes it
// as the target moves, and the designer would otherwise write it again when
// it opens and finds the same mismatch. save() removes it, because a save
// replaces the very bytes it was vouching for.
const PRESERVED_PREFIX   = 'pfodDesigner.v1.preserved.';

// Wrapper format tag for exportToBlob() / importFromObject() — lets a
// future schema bump reject a foreign or stale file cleanly.
const EXPORT_FORMAT_TAG  = 'pfodDesigner';

/// Return a copy of `menu` (a {prompt,promptFormat,items,...} node — same
/// shape for rootMenu and every subMenu) suitable for JSON export, with
/// every Drawing-type item's formats trimmed down to just {disabled,
/// sound, flash, hidden} (recursing into every nested sub-menu's own
/// items too). A dwg item is rendered as its own canvas, never a text
/// button (pfodMenuDisplay.js's dwg branch), so fontSize/bold/italic/
/// underline/fontColour never apply — and bgColour doesn't either, since
/// the dwg carries its own embedded background colour already.
/// disabled/sound/flash/hidden are the only fields that still do
/// something for a dwg item. The live in-memory rootMenu is never
/// touched; this only ever builds a fresh copy for exportToJSON()/
/// exportToBlob() and deleteEmptyMenuList.js's own equivalent path.
/// @param {object} menu
/// @returns {object} a plain-object copy safe to JSON.stringify
function _exportableMenu(menu) {
  // Key order is the file's reading order, same idea as exportToJSON()'s own
  // header block: refresh_ms is seeded FIRST, above promptText, so it is the
  // first line of every menu. items is by far the largest field, so a value
  // written after it can only be found by scrolling past every item — and
  // every sub-menu repeats that. Seeding only fixes the position; `menu`
  // below still supplies the values, and any field added later lands after
  // items rather than being dropped.
  return Object.assign({
    refresh_ms:   menu.refresh_ms,
    promptText:   menu.promptText,
    promptFormat: menu.promptFormat,
  }, menu, {
    items: menu.items.map((item) => {
      if (item.type === 'submenu' && item.subMenu) {
        return Object.assign({}, item, { subMenu: _exportableMenu(item.subMenu) });
      }
      if (item.type === ITEM_TYPE_DRAWING) {
        const copy = Object.assign({}, item);
        if (copy.formats) {
          copy.formats = {
            disabled: copy.formats.disabled,
            sound:    copy.formats.sound,
            flash:    copy.formats.flash,
            hidden:   copy.formats.hidden,
          };
        }
        return copy;
      }
      return item;
    }),
  });
}

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
    // Serial baud rate.  Fixed at 115200 — the baud picker is no longer
    // shown; state.baud is used only by code generation.
    this.baud = 115200;
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
    // A freshly-created Drawing item, held here rather than in
    // getActiveMenu().items, until the user actually picks or loads a
    // dwg on the "Choose a Drawing" screen (selectDwgForItem.js) —
    // addMenuItem.js's IDX_DRAWING branch stashes it here instead of
    // adding it to the menu immediately, specifically so that pressing
    // the real back button out of that screen (which has no hook back
    // into this dispatcher) leaves the menu completely unchanged instead
    // of with a dangling dwgName-less item. Committed (pushed into the
    // menu for real) by selectDwgForItem.js's _linkAndReturn once a dwg
    // is actually chosen; discarded (just left unused) otherwise.
    // IN-MEMORY ONLY.
    this._pendingDrawingItem = null;
    // Map: rawCmd string of a {ks`<idx>} "Add Menu Item" picker submit
    // addMenuItem.js's own _applyPick has successfully processed ->
    // {menuPath, itemIdx} for where it landed (itemIdx === null while
    // it's still state._pendingDrawingItem — Drawing, not yet linked to
    // a dwg). A PLAIN OBJECT, not a single "last" slot — real pfodApp/
    // device semantics require ANY cmd whose response is a full menu to
    // remain a legitimate, resendable nav target for as long as it's
    // still reachable (e.g. via the client's own nav-stack back-
    // navigation — see responseHandlers.js's own comment on why {,}-
    // shaped responses are always recorded there), and more than one
    // such cmd can be "live" at once (e.g. a Sub-menu's own creation cmd
    // stays live the whole time something is later added INSIDE it) — a
    // single most-recent-only record gets overwritten by the second
    // creation and stops protecting the first (confirmed by testing: an
    // earlier single-slot version of this fix failed exactly this way).
    // Checked at the TOP of _applyPick so an exact resend of any tracked
    // cmd re-shows what it already created instead of creating a
    // duplicate — the bug fixed here (see submenuError.txt): a stale
    // {ks`8} resurfacing via repeated back-presses used to recreate a
    // duplicate Sub-menu item nested inside the one it had already made,
    // because the only prior protection (_pendingNewItemIdx above) is
    // deliberately short-lived and had long since been cleared by the
    // ordinary navigation in between.
    // Entries are pruned (not the whole map — see above) only when
    // addMenuItem.js's own bare {k} is freshly dispatched (a real user
    // click on "Add Menu Item" — never itself a back-navigation replay
    // target, since its own response is a select-list, not a menu):
    // every entry recorded at THAT SAME menuPath is deleted, since
    // reopening the picker at that exact spot is the only genuine signal
    // "the user wants to add ANOTHER item here", as opposed to a
    // historical cmd resurfacing — without this, picking the same item
    // type twice in a row at the same menu level would be mistaken for a
    // resend of the first and just re-show it instead of creating a
    // second. Entries recorded at OTHER menuPaths are left untouched
    // (still legitimately resendable). Known residual gap, accepted as
    // disproportionate to fix here: creating type X at menu A, moving to
    // an unrelated menu B WITHOUT ever reopening {k} back at A in
    // between, then picking type X again at B, is still misread as a
    // resend of A's item — narrower and rarer than the bug this fixes,
    // and no worse than this codebase's pre-existing behaviour around
    // this edge generally. IN-MEMORY ONLY.
    this._addMenuItemHistory = {};
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

  /// Lazily assign a stable single-letter `ccodeCmd` to every item in
  /// the whole design tree that doesn't have one yet.  Called only by
  /// the "Minimal C Code" target's code generator — Arduino/ESP32
  /// never call this, so their designs are unaffected and never hit
  /// the 52-item ceiling below.
  ///
  /// Allocation rule (assign-only-if-missing; an item that already has
  /// a letter is never revisited or reassigned):
  ///   - Scan the whole tree once for every ccodeCmd already in use and
  ///     the highest pool index among them (maxIdx, -1 if none yet).
  ///   - For each item still missing ccodeCmd, in tree order: while
  ///     maxIdx+1 is still within the 52-slot pool, hand out
  ///     POOL[maxIdx+1] and bump maxIdx — a pure forward advance that
  ///     never reuses a letter freed by a deleted item.  Only once the
  ///     pool's tail ('z') has been handed out does it fall back to
  ///     the lowest pool letter NOT currently in use (a gap left by a
  ///     deleted item).
  ///   - Throws if 52 distinct letters are already in use with no gaps
  ///     left (i.e. more than 52 items need a letter).
  /// Persists via save() if any item was actually assigned a letter.
  assignCcodeCmds() {
    const items = this.getAllItems();
    const used  = new Set();
    let maxIdx  = -1;
    for (const it of items) {
      if (it.ccodeCmd) {
        used.add(it.ccodeCmd);
        const idx = CCODE_CMD_POOL.indexOf(it.ccodeCmd);
        if (idx > maxIdx) maxIdx = idx;
      }
    }
    const nextLetter = () => {
      if (maxIdx + 1 < CCODE_CMD_POOL.length) {
        maxIdx += 1;
        return CCODE_CMD_POOL[maxIdx];
      }
      for (const letter of CCODE_CMD_POOL) {
        if (!used.has(letter)) return letter;
      }
      throw new Error('Minimal C Code target supports at most ' +
                       CCODE_CMD_POOL.length + ' menu items needing a cmd letter');
    };
    let changed = false;
    for (const it of items) {
      if (!it.ccodeCmd) {
        const letter = nextLetter();
        it.ccodeCmd = letter;
        used.add(letter);
        changed = true;
      }
    }
    if (changed) this.save();
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
      // These are new bytes, so any "already written to a file" mark left by
      // a target change no longer describes what is stored.
      localStorage.removeItem(PRESERVED_PREFIX + this.name);
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
      this._pendingDrawingItem = null;
      this._addMenuItemHistory = {};
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
    this._pendingDrawingItem = null;
    this._addMenuItemHistory = {};
  }

  /// Walk the entire menu tree and repair or clear item.pin (and, for
  /// chart items, each plot's pin):
  ///  - null out pins whose name is no longer on the current board
  ///  - repair missing codeName (pre-codeName saved designs)
  ///  - upgrade type from pwm_output → dac_output when the board pin
  ///    natively supports DAC, so code generation emits dacWrite()
  /// Called after every _tryLoad and importFromObject.
  _clearInvalidPins() {
    const pinByName = new Map(this.board.pins.map(p => [p.name, p]));
    // Repairs `pin` in place against the current board, or returns null
    // when the board no longer has a pin of that name (e.g. switching
    // to a board with fewer/no pins, or to Unlisted Board/Minimal C).
    const repairPin = (pin) => {
      // True while the `?` placeholder (see editMenuItem.js / editChart.js's
      // canPlaceholder toggle) is meaningful: a non-ccode board that
      // genuinely has no real pins to offer.  Minimal C Code has no
      // Arduino pin API and no placeholder toggle at all.
      const noRealPins = this.board.pins.length === 0 && this.board.family !== 'ccode';
      if (pin.name === PLACEHOLDER_PIN_NAME) {
        // If the board now has real pins, or switched to Minimal C
        // Code, the placeholder no longer applies — clear it.
        return noRealPins ? pin : null;
      }
      if (noRealPins) {
        // Switching to a non-ccode, zero-pin board (e.g. Unlisted
        // Board) shouldn't silently disconnect an item that WAS pin-
        // connected on the previous board — downgrade the real pin
        // reference to the `?` placeholder instead, preserving the
        // "this item drives/reads a pin" intent across the switch.
        // The user can toggle it off like any other placeholder.
        return { name: PLACEHOLDER_PIN_NAME, codeName: PLACEHOLDER_PIN_NAME, type: pin.type };
      }
      const bp = pinByName.get(pin.name);
      if (!bp) return null;
      if (typeof pin.codeName !== 'string' || !pin.codeName) {
        pin.codeName = bp.codeName;
      }
      if (pin.type === PinType.PWM_OUTPUT
          && bp.capabilities.supports(PinType.DAC_OUTPUT)) {
        pin.type = PinType.DAC_OUTPUT;
      }
      // A pin of the same NAME existing on the new board doesn't mean it can
      // still do the job — e.g. a PWM item on "D3" survives a switch to a
      // board whose D3 is digital-only, and code generation would then emit
      // analogWrite() on a pin that can't do it.  Checked AFTER the DAC
      // upgrade above so a pwm_output that legitimately became dac_output is
      // judged on its final type.  Capability rule mirrors
      // editMenuItemPin.js's own _pinSupports (the picker's selection-time
      // check, which this is the load-time counterpart of): a bare "cap" is
      // available on every connection, "cap_<connection>" only on that one
      // (ESP32's ADC2 analog_input_serial).
      if (!(bp.capabilities.supports(pin.type)
            || bp.capabilities.supports(pin.type + '_' + this.connection))) {
        return null;
      }
      return pin;
    };
    const walk = (menu) => {
      for (const item of menu.items) {
        if (item.pin) {
          item.pin = repairPin(item.pin);
        }
        if (item.type === ITEM_TYPE_CHART && Array.isArray(item.plots)) {
          for (const p of item.plots) {
            if (p.pin) p.pin = repairPin(p.pin);
          }
        }
        if (item.subMenu) walk(item.subMenu);
      }
    };
    walk(this.rootMenu);
  }

  /// Re-derive the ADC-seeded numeric ranges on every Data Display item and
  /// every chart plot, when this design was built for a DIFFERENT target.
  ///
  /// These values are seeded from the active board's own adc block at
  /// item-creation time (addMenuItem.js -> _freshDataDisplayItem /
  /// _freshChartItem) and then simply persist. Nothing re-derived them on
  /// load, so a design moved from a 10-bit/5 V AVR to a 12-bit/3.3 V ESP32
  /// kept reading 1023 counts at 5 V full scale — wrong on both axes, in the
  /// generated sketch as well as in the chart.
  ///
  /// Scope is deliberately narrow, because nothing in the file distinguishes
  /// "still the old board's default" from "the user typed this deliberately":
  ///   - the RAW range (maxValue / dataRangeMax) is ALWAYS re-derived. It is
  ///     a hardware fact about the ADC's full-scale count, never a preference.
  ///   - the DISPLAY maximum (maxScaleStr / displayMax) is re-derived only
  ///     while the units still read exactly 'V' — i.e. the field is still the
  ///     reference-voltage reading it was seeded as. A user who changed the
  ///     units to degC/kPa/... has taken the scaling over and is left alone.
  ///   - the units themselves (trailingText / units) are never touched.
  /// Every change is reported, so the load is flagged partial and the user is
  /// shown exactly what moved and why.
  ///
  /// @param {string} sourceBoardName — the target this design was built for:
  ///        parsed.boardName / payload.boardName, or LEGACY_ASSUMED_BOARD_NAME
  ///        for a pre-schema-12 file that never recorded one.
  /// @param {Array<string>} warnings — caller's collector
  _retargetAdcRanges(sourceBoardName, warnings) {
    if (!sourceBoardName || sourceBoardName === this.board.name) return;
    const adc = this.board.adc || {};
    // Unlisted Board / Minimal C Code carry no adc block, so there is nothing
    // to derive from and the saved values remain the best information there is.
    if (adc.max === undefined || adc.max === null) return;
    const newMax = adc.max;
    const newRef = (adc.defaultRefVolts !== undefined && adc.defaultRefVolts !== null)
                 ? String(adc.defaultRefVolts) : null;
    const note = (path, field, from, to) => warnings.push(
      path + '.' + field + ': ' + JSON.stringify(from) + ' was set for "' + sourceBoardName +
      '" — re-derived to ' + JSON.stringify(to) + ' for "' + this.board.name + '"');

    const walk = (menu, path) => {
      menu.items.forEach((item, i) => {
        const ip = path + '.items[' + i + ']';
        if (item.type === ITEM_TYPE_DATADISPLAY) {
          if (item.maxValue !== newMax) {
            note(ip, 'maxValue', item.maxValue, newMax);
            item.maxValue = newMax;
          }
          if (newRef !== null && item.trailingText === 'V' && item.maxScaleStr !== newRef) {
            note(ip, 'maxScaleStr', item.maxScaleStr, newRef);
            item.maxScaleStr = newRef;
          }
        }
        if (item.type === ITEM_TYPE_CHART && Array.isArray(item.plots)) {
          item.plots.forEach((pl, pi) => {
            const pp = ip + '.plots[' + pi + ']';
            if (pl.dataRangeMax !== newMax) {
              note(pp, 'dataRangeMax', pl.dataRangeMax, newMax);
              pl.dataRangeMax = newMax;
            }
            if (newRef !== null && pl.units === 'V' && pl.displayMax !== newRef) {
              note(pp, 'displayMax', pl.displayMax, newRef);
              pl.displayMax = newRef;
            }
          });
        }
        if (item.subMenu) walk(item.subMenu, ip + '.subMenu');
      });
    };
    walk(this.rootMenu, 'rootMenu');
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
    // A design saved under a different target, restored here.
    //
    // This is the path a target change actually takes: change the target,
    // reopen, and the last-used design comes back through here — or it is
    // opened from the design list, which is loadNamed -> _tryLoad -> here.
    // Both were silently clearing the pins, because the target question was
    // only ever asked on the FILE load paths.
    //
    // Recorded rather than acted on: this runs inside the constructor, with
    // no screen to ask over and no way to await an answer. The designer
    // raises it on the next cmd, before anything is dispatched or saved —
    // see DesignerTargetPrompt.resolvePending. Nothing here writes to
    // storage, so the saved copy keeps its pins until that is answered.
    const restoredBoard = (typeof payload.boardName === 'string' && payload.boardName)
      ? payload.boardName : null;
    this.pendingTargetMismatch =
      (restoredBoard && this.board && restoredBoard !== this.board.name)
        ? { designBoard: restoredBoard, currentBoard: this.board.name }
        : null;
    if (this.pendingTargetMismatch) {
      // Capture the stored bytes NOW — before a single pin is touched, and
      // before the answer is known.
      //
      // Only the capture happens here; the file is written by the UI layer a
      // moment later (DesignerTargetPrompt). That is not the same compromise
      // as deciding later: once these bytes are in hand they cannot be
      // changed by anything downstream, whereas re-reading storage after the
      // clearing would depend on nothing having saved in between — an
      // invariant resting on the two lines below happening to be memory-only.
      //
      // Unconditional, because BOTH answers destroy this version. Keeping the
      // design on the current board overwrites it on the next save just as
      // surely as switching does.
      this.pendingTargetMismatch.storedPayload = raw;
    }
    // Clear any item.pin whose name is no longer present on the current
    // board — catches both target switches and board updates that removed
    // a pin.  Done every load so stale pins never reach code generation.
    this._clearInvalidPins();
    // Same for the ADC-seeded ranges: this payload may have been written
    // under a different target (close designer -> change target -> reopen,
    // which rebuilds the state against the NEW board but restores THIS
    // payload).  boardName has always been written here, so the legacy
    // assumption only applies to a payload old enough to predate it.
    this._retargetAdcRanges(
      (typeof payload.boardName === 'string' && payload.boardName)
        ? payload.boardName : LEGACY_ASSUMED_BOARD_NAME,
      warnings);
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
      // Baud selection no longer offered — Serial is always 115200.
      // if (typeof payload.baud === 'number'
      //     && this.board.connections.serial.supportedBauds.includes(payload.baud)) {
      //   this.baud = payload.baud;
      // }
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
    // Key order is the file's reading order (JSON.stringify preserves
    // insertion order), so the four fields that identify the design sit
    // together at the top where they are visible without scrolling past
    // rootMenu: what it is (format/schema), what it is called (name), and
    // what it targets (connection/boardName).  savedAt/js_ver are
    // provenance rather than identity and follow; rootMenu is last because
    // it is by far the largest.  Nothing reads the file positionally —
    // importFromObject takes named fields — so this is presentation only.
    const out = {
      format:     EXPORT_FORMAT_TAG,
      schema:     DESIGNER_STATE_SCHEMA_VERSION,
      name:       this.name,
      connection: this.connection,
      // The target this design was built for.  Added in schema 12 — the
      // localStorage payload has always carried it (see save()), but the
      // exported file did not, so importFromObject had no way to tell that
      // pin assignments and ADC ranges belonged to a different board.
      boardName:  this.board.name,
      savedAt:    new Date().toISOString(),
      js_ver:     window.JS_VERSION,
      rootMenu:   _exportableMenu(this.rootMenu),
    };
    return JSON.stringify(out, null, 2);
  }

  /// Counterpart to exportToBlob: load a parsed JSON object back into
  /// this state, then persist.  Two failure modes:
  ///
  ///   HARD — wrapper-level (wrong format tag, missing resolved name).
  ///   Throws immediately; state is NOT applied.  Caller
  ///   (loadFromFile.js) should show a "Cannot import file: …" alert.
  ///
  ///   PARTIAL — schema mismatch and / or per-field corruption inside
  ///   rootMenu.  State IS applied (every valid field used, every
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
    const resolvedName = overrideName ? overrideName : parsed.name;
    if (typeof resolvedName !== 'string' || resolvedName.length === 0) {
      throw new Error('[DesignerState] import missing "name" (and no overrideName supplied)');
    }

    // Soft schema mismatch — warn + tolerantly parse the data.  Older
    // schemas with fewer fields will simply trigger per-field defaults
    // via _parseMenuTolerant; newer schemas with extra fields will
    // have those silently ignored.
    const warnings = [];
    // Schema 11 is a SUPPORTED legacy load, not a mismatch: its only
    // difference from 12 is the missing boardName, handled immediately
    // below.  Any other version really is unknown, and still warns.
    if (parsed.schema !== DESIGNER_STATE_SCHEMA_VERSION && parsed.schema !== 11) {
      warnings.push('schema: file=' + parsed.schema + ', expected=' +
                    DESIGNER_STATE_SCHEMA_VERSION +
                    ' — loaded with defaults for unrecognised fields');
    }
    // Target this design was built for — absent before schema 12, where it
    // is assumed to be the designer's own default board.  Only worth telling
    // the user about when the assumption actually changes something, i.e.
    // when it differs from the board now selected; a legacy file opened on an
    // UNO needs no explanation.
    const sourceBoardName = (typeof parsed.boardName === 'string' && parsed.boardName)
                          ? parsed.boardName : LEGACY_ASSUMED_BOARD_NAME;
    this.name           = resolvedName;
    this.rootMenu       = _parseMenuTolerant(parsed.rootMenu, 'rootMenu', warnings);
    // Connection is restored BEFORE the pin pass: repairPin's capability
    // check is connection-sensitive (ESP32's ADC2 pins are analog inputs only
    // on Serial), so it has to run against the connection this design
    // actually uses rather than the constructor's 'serial' default.
    if (typeof parsed.connection === 'string' && this.board.connections[parsed.connection]) {
      this.connection = parsed.connection;
    }
    this._clearInvalidPins();
    // The assumed-UNO fallback feeds exactly one thing: _retargetAdcRanges.
    // So it is only worth telling the user about when that pass actually
    // rewrote something — otherwise the assumption had no consequence and
    // the note is pure noise on a file that loaded perfectly.  Every current
    // producer records boardName, so the files this applies to are the
    // genuinely old ones (schema 11 and earlier), and plenty of those — any
    // design with no Data Display and no chart — have nothing for the
    // assumption to affect and should open silently.
    // The note is spliced in AHEAD of the changes it explains, so it reads as
    // their heading rather than as an unrelated trailing remark.
    const beforeAdc = warnings.length;
    this._retargetAdcRanges(sourceBoardName, warnings);
    if (!parsed.boardName && warnings.length > beforeAdc) {
      warnings.splice(beforeAdc, 0,
        'boardName: this file does not record the board it was built for, so it was ' +
        'assumed to be an "' + LEGACY_ASSUMED_BOARD_NAME + '" design — the range(s) ' +
        'below were re-derived on that basis. Re-save to record the real target.');
    }
    this.activeMenuPath = [];
    this.activeItemIdx  = null;
    this.contextStack   = [];
    this._pendingDrawingItem = null;
    this._addMenuItemHistory = {};
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

  /// All dwg-library entry names persisted on this machine. Delegates to
  /// DwgLibrary (dwgDesigner/dwgLibrary.js), which owns the
  /// pfodDwgLibrary.v1.<name> storage — a separate namespace from this
  /// class's own pfodDesigner.v1.<name> menu-design storage.
  static listDwgNames() {
    return DwgLibrary.listNames();
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

  /// Import `parsed` and persist it as a saved design called `name`,
  /// WITHOUT disturbing the design the user is currently editing.
  ///
  /// Every other import path runs on the live state, because the user
  /// asked for that design to be opened. This one exists for the Dwg
  /// Controls Panel: a .zip picked there is a bundle of drawings that
  /// happens to also carry its menu, and the user is in the middle of
  /// editing something else. The design belongs in the list, but nothing
  /// about it should move the user.
  ///
  /// So the import runs on a throwaway instance, and the "current design"
  /// pointer that instance's own save() rewrote is put back afterwards —
  /// otherwise the next session would open the imported design instead of
  /// the one being worked on.
  ///
  /// @param {BaseBoard} board — the board to validate pins/ranges against
  /// @param {object} parsed — a parsed .pfodMenu_json
  /// @param {string} name — must already be free; the caller dedups
  /// @returns {Error|null} the PARTIAL error when the file loaded with
  ///          issues (it is still saved), or null on a clean import.
  ///          A hard failure throws, and nothing is written.
  /// The raw localStorage bytes for a design, or null.
  ///
  /// Safe to call only while the stored copy is known good — that is, before
  /// anything has cleared pins against a board the design was not built for.
  /// The restore path cannot use it for that reason and captures the bytes
  /// itself; the file-load paths can, because they have not touched the open
  /// design at all.
  /// @param {string} name
  /// @returns {string|null}
  static readStoredPayload(name) {
    if (typeof name !== 'string' || !name) return null;
    try { return localStorage.getItem(STORAGE_PREFIX + name); }
    catch (_) { return null; }
  }

  /// Record that the design's CURRENT stored bytes have been written to a
  /// file, so nothing writes them again.
  ///
  /// Two places notice a design is about to be retargeted — the target
  /// picker, as the target moves, and the designer, when it opens and finds
  /// a design built for another board — and in the ordinary case they are
  /// noticing the SAME change, one after the other. Without this the user
  /// gets the same file twice, the second named "… (1)".
  ///
  /// The mark is per design and dies with the next save(), so it means
  /// exactly "what is in storage under this name right now is already on
  /// disk" — never "this design has been backed up at some point".
  ///
  /// @param {string} name — the design's name
  /// @param {string} boardName — the board those bytes were built for
  /// @param {string} fileName — what was written, so the prompt can still
  ///        tell the user where the version went
  static markPreserved(name, boardName, fileName) {
    if (typeof name !== 'string' || !name) return;
    try {
      localStorage.setItem(PRESERVED_PREFIX + name,
        JSON.stringify({ boardName: boardName, fileName: fileName }));
    } catch (_) {}
  }

  /// Move EVERY stored design onto `boardName`.
  ///
  /// There is no such thing as a mixed-target machine: the target picked on
  /// the connection screen is the target, and every design is for it. So
  /// once the user accepts a board for one design, they have accepted it for
  /// all of them, and this writes that decision down.
  ///
  /// Without it the acceptance lived only in memory, and the answer was
  /// re-asked on the next open — for the same design (whose stored copy
  /// still named the old board until some dispatch happened to save it) and
  /// then again for every other design in the list, one at a time.
  ///
  /// Each design is RETARGETED, not relabelled. Stamping the new board name
  /// over a payload that still holds the old board's pins produces a design
  /// that lies about itself: it says UNO and carries ESP32 pin numbers, and
  /// the next Generate Code writes those pin numbers into the sketch. So
  /// every design is put through the same restore the designer itself does
  /// — _tryLoad clears the pins the new board does not have and re-derives
  /// the ADC-seeded ranges — and then saved back.
  ///
  /// The design currently OPEN is saved from live state instead of being
  /// rebuilt from storage, so that unsaved edits are not thrown away; it has
  /// already been through the same restore.
  ///
  /// Preserving the old-target versions to disk is the CALLER's job, and has
  /// to happen before this runs — after it, the pins are gone.
  ///
  /// @param {object} board — the board object every design now belongs to
  /// @param {DesignerState} [openState] — the design open in the designer,
  ///        if any. There may well be none: the target can be changed with
  ///        the designer closed.
  /// @returns {string[]} the designs actually moved (one already on this
  ///          board is left alone, so a no-op change reports nothing)
  static adoptTarget(board, openState) {
    if (!board || typeof board.name !== 'string' || !board.name) return [];
    const moved = [];
    // save() writes the "most recently used" pointer, and rebuilding the
    // other designs must not steal it from whatever the user is actually
    // working on.  Same guard importAsSavedDesign uses.
    const previousCurrent = DesignerState._readCurrentPointer();
    DesignerState.listNames().forEach((n) => {
      const raw = DesignerState.readStoredPayload(n);
      if (!raw) return;
      let payload;
      try { payload = JSON.parse(raw); } catch (_) { return; }
      if (!payload || payload.boardName === board.name) return;
      try {
        if (openState && openState.name === n) {
          openState.save();
        } else {
          // The constructor restores this design against `board`, which is
          // where the pin clearing and the ADC retargeting happen; save()
          // then writes it back stamped with the new board.
          new DesignerState(board, n).save();
        }
        moved.push(n);
      } catch (e) {
        console.warn('[DesignerState] could not retarget design "' + n + '":', e);
      }
    });
    try {
      if (previousCurrent === null) localStorage.removeItem(CURRENT_KEY);
      else localStorage.setItem(CURRENT_KEY, previousCurrent);
    } catch (_) {}
    return moved;
  }

  /// The file markPreserved recorded for this design and board, if the
  /// bytes it vouched for are still the ones in storage.
  ///
  /// Read, never consumed: the mark is cleared by save(), which is the only
  /// event that can make it wrong. Consuming it here would mean the second
  /// of two callers looking at the same unchanged design wrote a duplicate
  /// after all. A mark naming a different board is not about this change and
  /// is ignored.
  ///
  /// @param {string} name
  /// @param {string} boardName — the board the caller is preserving from
  /// @returns {string|null} the file already written, or null if there is
  ///          none and the caller should write one
  static preservedFile(name, boardName) {
    if (typeof name !== 'string' || !name) return null;
    try {
      const raw = localStorage.getItem(PRESERVED_PREFIX + name);
      if (!raw) return null;
      const mark = JSON.parse(raw);
      if (!mark || mark.boardName !== boardName) return null;
      return mark.fileName || null;
    } catch (_) { return null; }
  }

  /// The stored design, as loadable file PARTS, for saving to disk before
  /// the target changes.
  ///
  /// Parts, not a file: whether it ends up a `.pfodMenu_json` or a
  /// `<name>_menuJson.zip` carrying its drawings is DesignerSaveToFile's
  /// decision, made in one place for every command that writes a design.
  /// This supplies the base name, the json and the rootMenu the drawing
  /// list is read from.
  ///
  /// There is one localStorage slot per design NAME, and save() stamps it
  /// with whatever board is current. So a design opened under a new target
  /// is not modified — it is overwritten: same slot, new boardName, pins
  /// cleared. The version built for the old board has to leave the browser
  /// to survive; another localStorage entry is not a backup, it is one more
  /// thing in the same place that clearing site data takes with it.
  ///
  /// Built from the STORED payload, never from the live state — the caller
  /// captures those bytes before _tryLoad clears a pin, and they carry the
  /// ORIGINAL boardName, connection and pins. Rebuilding from the live state
  /// would stamp the new board and defeat the whole exercise.
  ///
  /// The payload shape (save()) and the file shape (exportToJSON) are not
  /// the same — a payload written straight out would not load back — so the
  /// fields are mapped across here, in exportToJSON's own order.
  ///
  /// @param {string} name — the design's name
  /// @param {string} rawPayload — the localStorage bytes, captured intact
  /// @returns {{baseName: string, text: string, rootMenu: object}|null}
  ///          `baseName` carries NO extension — the bundler adds the one
  ///          that matches the shape it chose.
  static designFileFromPayload(name, rawPayload) {
    if (typeof name !== 'string' || !name || typeof rawPayload !== 'string') return null;
    let payload;
    try { payload = JSON.parse(rawPayload); } catch (_) { return null; }
    if (!payload || !payload.rootMenu) return null;

    const out = {
      format:     EXPORT_FORMAT_TAG,
      schema:     DESIGNER_STATE_SCHEMA_VERSION,
      name:       name,
      connection: payload.connection,
      boardName:  payload.boardName,
      savedAt:    new Date().toISOString(),
      js_ver:     (typeof window !== 'undefined') ? window.JS_VERSION : undefined,
      rootMenu:   payload.rootMenu,
    };
    // The old board's name is in the FILE name too: a folder of downloads a
    // week later is where this has to be recognisable, and "Menu_1.pfodMenu_json"
    // beside the current one says nothing about which is which.
    const boardPart = payload.boardName
      ? '_' + String(payload.boardName).replace(/[^A-Za-z0-9]+/g, '_').replace(/_+$/, '')
      : '_old_target';
    const safeName = name.replace(/[^A-Za-z0-9]+/g, '_').replace(/_+$/, '') || 'Menu';
    return {
      // No extension: the caller runs this through saveToFile's own bundler,
      // which appends either ".pfodMenu_json" or "_menuJson.zip" depending on
      // whether the design links any drawings. Deciding that here would mean
      // a second implementation of the rule.
      baseName: safeName + boardPart,
      text: JSON.stringify(out, null, 2),
      // For working out which drawings have to travel with it.
      rootMenu: payload.rootMenu,
    };
  }

  /// Does this file target a different board from the one now selected?
  ///
  /// Asked BEFORE importing, and that ordering is the whole point.
  /// importFromObject runs _clearInvalidPins() against whatever board is
  /// current, so by the time an import has finished, a design built for
  /// another target has already lost every pin that board does not have —
  /// and offering to switch afterwards would be offering to reload a design
  /// that had already been stripped. The caller asks first, and only calls
  /// import once the user has chosen which board to import against.
  ///
  /// Only a file that RECORDS a board can mismatch. Schema 11 and earlier
  /// carry no `boardName` and are assumed to be UNO designs
  /// (LEGACY_ASSUMED_BOARD_NAME); they are not treated as a mismatch here,
  /// because the file is not claiming a target — it simply predates the
  /// field. The consequence of that assumption is already reported by
  /// _retargetAdcRanges, and only when it actually changed something.
  /// Prompting on every legacy file instead would put a target question in
  /// front of the user on loads where nothing is wrong.
  ///
  /// Drawings never reach here: a .pfodDwg_json records no board and holds
  /// no pins, so a drawing loads against whatever target is current. A
  /// drawing BUNDLE is a different matter — its wrapper menu carries the
  /// board, and that menu comes through this check like any other.
  ///
  /// @param {BaseBoard} currentBoard — the board now selected
  /// @param {object} parsed — a parsed .pfodMenu_json
  /// @returns {{designBoard: string, currentBoard: string}|null} null when
  ///          the file records no board, or records the current one
  static targetMismatch(currentBoard, parsed) {
    const designBoard = (parsed && typeof parsed.boardName === 'string' && parsed.boardName)
      ? parsed.boardName : null;
    if (!designBoard) return null;
    const currentName = (currentBoard && currentBoard.name) ? currentBoard.name : null;
    if (!currentName || designBoard === currentName) return null;
    return { designBoard: designBoard, currentBoard: currentName };
  }

  static importAsSavedDesign(board, parsed, name) {
    const previousCurrent = DesignerState._readCurrentPointer();
    const restoreCurrent = () => {
      try {
        if (previousCurrent === null) localStorage.removeItem(CURRENT_KEY);
        else localStorage.setItem(CURRENT_KEY, previousCurrent);
      } catch (_) { /* same quota/private-mode case save() already tolerates */ }
    };

    const scratch = new DesignerState(board, name);
    try {
      scratch.importFromObject(parsed, name);
    } catch (err) {
      // A hard failure throws before importFromObject's own save(), so
      // nothing was written and the pointer never moved. A partial one
      // throws after, so it did.
      if (!err.partial) throw err;
      restoreCurrent();
      return err;
    }
    restoreCurrent();
    return null;
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
