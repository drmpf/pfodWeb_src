/*
 * dwgDesigner/dwgValidate.js
 *
 * Schema constants + validateAndRepairDwg() for the Dwg Library's "Load
 * Dwg from file" flow.
 *
 * CORRECTED: the first version of this file was built against
 * dwg-dataflow.md's documented (aspirational, not-yet-real) schema —
 * width/height/backgroundColour/refreshRateSeconds field names and a
 * 13-type item enum. That doesn't match any real dwg JSON, so every
 * real file failed validation immediately. This version is built
 * instead against the schema this project's OWN existing, working code
 * already uses for real dwg data:
 *   - pfodWebDesigner/src/server.js:109-121 (createNewDrawing) — the
 *     real dwg-level fields: name, x (width), y (height), color
 *     (background), refresh (carried here as dwgRefresh_ms, in
 *     milliseconds), version, items.
 *   - pfodWebDesigner/src/add-item.js:1770-1968 — the real per-item
 *     fields for every item type (xOffset/yOffset/xSize/ySize/radius/
 *     text/fontSize/align/bold/italic/underline/intValue/min/max/
 *     displayMin/displayMax/decimals/units/start/angle/cmd/cmdName/
 *     drawingName/filter/priority/centered; that older tool stored
 *     booleans as the strings 'true'/'false', which this validator
 *     converts to real booleans on load — see the boolean branch in
 *     validateAndRepairDwg).
 *   - pfodWeb_src/drawingDataProcessor.js:524-741 — this project's own
 *     real item processor: the authoritative, already-in-production
 *     type enum (rectangle, line, insertDwg, touchZone, touchAction,
 *     touchActionInput, label, value, circle, arc, index, hide, unhide,
 *     erase, pushZero, popZero) and how permissive/lenient it already
 *     is — nearly every field silently defaults when absent; only a
 *     handful of cases are treated as real problems (missing/
 *     unrecognized type, touchZone/touchAction with no cmd).
 *   - pfodWeb_src's own colour handling (redraw.js/webTranslator.js,
 *     extended earlier this project for RRGGBB hex support): a colour
 *     is -1 (BLACK_WHITE mode — add-item.js's own default when no
 *     colour is chosen) or an integer 0-255. RRGGBB hex is part of the
 *     pfod colour syntax but NOT a dwg colour value — see _repairColour.
 *
 * Repairs are still applied automatically and listed (not hidden) so
 * the user can review before saving — see the file's earlier revision
 * history / tasklog.txt for that design rationale — but the *schema*
 * itself now matches reality, so a genuinely valid file gets errors: []
 * and loads straight in instead of tripping false positives.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

// Real, already-in-production item type enum — drawingDataProcessor.js's
// own if/else chain (lines 557-741) is the authoritative list.
const DWG_ITEM_TYPES = Object.freeze([
  'rectangle', 'line', 'insertDwg', 'touchZone', 'touchAction',
  'touchActionInput', 'label', 'value', 'circle', 'arc', 'index',
  'hide', 'unhide', 'erase', 'pushZero', 'popZero',
]);

const DWG_DIM_MIN          = 1;
const DWG_DIM_MAX          = 255;
const DWG_COLOUR_BLACKWHITE = -1;      // add-item.js's own "no colour chosen" default
const DWG_ALIGN_VALUES     = Object.freeze(['left', 'center', 'right']);


// Item types whose own idxName (or, for touchAction, action[0].idxName)
// is a REFERENCE to some other item's declaration, never a declaration
// of their own. Shared by _dedupDeclaredIdxNames (duplicate detection)
// and _dropOrphanedTouchActionTargets (orphan detection) — both need to
// know a reference never counts as "this idxName still exists".
const REFERENCE_ONLY_TYPES = Object.freeze(['hide', 'unhide', 'erase', 'touchAction', 'touchActionInput']);

// Per-item-type field list driving one generic repair pass instead of
// hand-duplicated per-type checks. kind: 'number' | 'boolean' | 'enum' |
// 'string' | 'colour'. A boolean field always LEAVES here as a real JSON
// boolean; the older string form 'true'/'false' is converted to it, and any
// other non-boolean defaults (see the boolean branch in
// validateAndRepairDwg for why those two are converted and nothing else is).
// Absent fields default silently with no listed error — that's the
// existing, working behaviour of drawingDataProcessor.js itself, not a
// gap this validator is introducing.
const DWG_ITEM_FIELD_SCHEMA = Object.freeze({
  rectangle: [
    { name: 'xOffset',  kind: 'number',  default: 0 },
    { name: 'yOffset',  kind: 'number',  default: 0 },
    { name: 'xSize',    kind: 'number',  default: 1 },
    { name: 'ySize',    kind: 'number',  default: 1 },
    { name: 'filled',   kind: 'boolean', default: false },
    { name: 'centered', kind: 'boolean', default: false },
    { name: 'rounded',  kind: 'boolean', default: false },
    { name: 'color',    kind: 'colour',  default: DWG_COLOUR_BLACKWHITE },
  ],
  line: [
    { name: 'xOffset', kind: 'number', default: 0 },
    { name: 'yOffset', kind: 'number', default: 0 },
    { name: 'xSize',   kind: 'number', default: 1 },
    { name: 'ySize',   kind: 'number', default: 1 },
    { name: 'color',   kind: 'colour', default: DWG_COLOUR_BLACKWHITE },
  ],
  insertDwg: [
    { name: 'xOffset', kind: 'number', default: 0 },
    { name: 'yOffset', kind: 'number', default: 0 },
  ],
  touchZone: [
    { name: 'xOffset',  kind: 'number',  default: 0 },
    { name: 'yOffset',  kind: 'number',  default: 0 },
    { name: 'xSize',    kind: 'number',  default: 1 },
    { name: 'ySize',    kind: 'number',  default: 1 },
    { name: 'filter',   kind: 'number',  default: 0 },
    { name: 'centered', kind: 'boolean', default: false },
  ],
  touchAction: [],      // action: [] — nested action-item array, not field-checked here
  touchActionInput: [   // prompt/textIdx/fontSize/backgroundColor not field-checked here
    { name: 'color', kind: 'colour', default: DWG_COLOUR_BLACKWHITE },
  ],
  label: [
    { name: 'xOffset',   kind: 'number',  default: 0 },
    { name: 'yOffset',   kind: 'number',  default: 0 },
    { name: 'text',      kind: 'string',  default: '' },
    { name: 'fontSize',  kind: 'number',  default: 0 },
    { name: 'align',     kind: 'enum',    default: 'center', enumValues: DWG_ALIGN_VALUES },
    { name: 'bold',      kind: 'boolean', default: false },
    { name: 'italic',    kind: 'boolean', default: false },
    { name: 'underline', kind: 'boolean', default: false },
    { name: 'color',     kind: 'colour',  default: DWG_COLOUR_BLACKWHITE },
    // A label's value/decimals/units are an OPTIONAL authoring suffix baked
    // into the transmitted text, so an absent one stays absent — but a
    // present decimals still reaches the device as .decimals(n)
    // (dwgArduinoExport's own label case), so it gets the same int + -6..+6
    // treatment as a value item's.
    { name: 'decimals',  kind: 'integer', default: 2, min: -6, max: 6, optional: true },
  ],
  value: [
    { name: 'xOffset',    kind: 'number',  default: 0 },
    { name: 'yOffset',    kind: 'number',  default: 0 },
    { name: 'text',       kind: 'string',  default: '' },
    { name: 'fontSize',   kind: 'number',  default: 0 },
    { name: 'align',      kind: 'enum',    default: 'center', enumValues: DWG_ALIGN_VALUES },
    { name: 'bold',       kind: 'boolean', default: false },
    { name: 'italic',     kind: 'boolean', default: false },
    { name: 'underline',  kind: 'boolean', default: false },
    // The RAW side is integer, the DISPLAY side is not — pfodLabel.h's own
    // split: intValue/minValue/maxValue take int32_t, displayMin/displayMax
    // take float. decimals is an int, "limits to -6 to +6" on the device.
    { name: 'intValue',   kind: 'integer', default: 0 },
    { name: 'min',        kind: 'integer', default: 0 },
    { name: 'max',        kind: 'integer', default: 1 },
    { name: 'displayMin', kind: 'number',  default: 0 },
    { name: 'displayMax', kind: 'number',  default: 1 },
    { name: 'decimals',   kind: 'integer', default: 2, min: -6, max: 6 },
    { name: 'units',      kind: 'string',  default: '' },
    { name: 'color',      kind: 'colour',  default: DWG_COLOUR_BLACKWHITE },
  ],
  circle: [
    { name: 'xOffset', kind: 'number',  default: 0 },
    { name: 'yOffset', kind: 'number',  default: 0 },
    { name: 'radius',  kind: 'number',  default: 1 },
    { name: 'filled',  kind: 'boolean', default: false },
    { name: 'color',   kind: 'colour',  default: DWG_COLOUR_BLACKWHITE },
  ],
  arc: [
    { name: 'xOffset', kind: 'number',  default: 0 },
    { name: 'yOffset', kind: 'number',  default: 0 },
    { name: 'radius',  kind: 'number',  default: 1 },
    { name: 'start',   kind: 'number',  default: 0 },
    { name: 'angle',   kind: 'number',  default: 90 },
    { name: 'filled',  kind: 'boolean', default: false },
    { name: 'color',   kind: 'colour',  default: DWG_COLOUR_BLACKWHITE },
  ],
  // No `idx` here: it is a wire value, minted from idxName at encode time
  // and stripped on save like cmd and textIdx. Listing it would have this
  // pass put an idx: 1 back onto every index placeholder immediately after
  // the strip below removed it.
  index: [],   // idxName is the only field, and it is not defaulted
  hide:   [],
  unhide: [],
  erase:  [],
  pushZero: [
    { name: 'x',     kind: 'number', default: 0 },
    { name: 'y',     kind: 'number', default: 0 },
    { name: 'scale', kind: 'number', default: 1 },
  ],
  popZero: [],
});

function _err(field, message, fix) {
  return { field, message, fix };
}

/// Repair one boolean field in place, and report what it did.
///
/// A real JSON boolean is what leaves here, and nothing else — every
/// consumer would otherwise have to remember that the STRING 'false' is
/// truthy in JS, and one raw truthiness test anywhere reads it as true. A
/// file must also never carry both forms at once, which is what happens
/// when a legacy dwg is passed through untouched and then has an item
/// added in pfodWeb.
///
/// The strings 'true'/'false' are the older pfodWebDesigner's own format,
/// and they say exactly what the author meant, so they are CONVERTED rather
/// than defaulted. Defaulting them threw the author's intent away — a
/// legacy 'true' silently became false, which is the one outcome that reads
/// as the drawing being wrong rather than the file being old. Anything else
/// (`1`, `"yes"`, a number) is not a boolean in any format this ever wrote,
/// so there is no intent to recover and it still defaults.
///
/// Either way the repair is reported and re-saving writes a real boolean,
/// so a file only ever passes through this once.
///
/// A named helper rather than inline in the field pass because a
/// touchAction's nested action[0] needs the identical rule but CANNOT go
/// through that pass — see the nested call site for why.
/// @param {object} obj — the item (or nested action item) to repair
/// @param {{name: string, default: boolean}} f — the field's schema entry
/// @param {string} path — field path for the report, e.g. 'items[3].filled'
/// @param {Array} errors — findings list, appended to
function _repairBooleanField(obj, f, path, errors) {
  if (typeof obj[f.name] === 'boolean') return;
  const raw = obj[f.name];
  if (raw === 'true' || raw === 'false') {
    obj[f.name] = (raw === 'true');
    errors.push(_err(path, JSON.stringify(raw) +
      ' is a string, not a boolean — the older pfodWebDesigner wrote it that way',
      f.name + ' converted to ' + obj[f.name]));
    return;
  }
  if (raw !== undefined) {
    errors.push(_err(path, JSON.stringify(raw) +
      ' is not a boolean — write true or false, unquoted',
      f.name + ' defaulted to ' + f.default));
  }
  obj[f.name] = f.default;
}

/// Validate + repair a colour value. -1 (BLACK_WHITE mode, add-item.js's
/// own default when no colour is chosen), an integer 0-255, or a 6-digit
/// integer are the only valid forms — matches
/// this project's own colour handling in redraw.js/webTranslator.js.
/// A genuinely missing colour is NOT an error — it has a defined
/// default per direction: item colours default to BLACK_WHITE mode (-1,
/// add-item.js's own default when no colour is chosen) when unspecified;
/// the dwg's own backgroundColour instead defaults to Black (0) when
/// unspecified. Only a colour that IS present but resolves to none of
/// the valid forms is flagged.
///
/// @param {*} value
/// @param {number} missingDefault — value to use when `value === undefined`
///                 (DWG_COLOUR_BLACKWHITE for items, 0/Black for the
///                 dwg's own background)
/// @param {string} missingDefaultLabel — human-readable name for
///                 missingDefault, used in the "Fix applied" text when an
///                 invalid (not missing) value has to fall back to it
function _repairColour(value, missingDefault, missingDefaultLabel) {
  if (value === undefined) {
    return { value: missingDefault, error: false };
  }
  if (value === -1 || value === '-1') {
    return { value: -1, error: false };
  }
  if (typeof value === 'number' && isFinite(value) && value >= 0 && value <= 255) {
    return { value: Math.round(value), error: false };
  }
  // RRGGBB hex is rejected rather than carried. It IS part of the pfod
  // protocol's colour syntax, and both the wire parser and the renderer
  // handle it — but the pfodParser builder methods a generated sketch is made
  // of take a palette integer, with no .colour("FF0000") form, so a hex
  // colour previews correctly here and comes out BLACK on the device. Letting
  // it load meant the drawing on screen and the drawing on hardware disagreed,
  // with nothing saying so until someone noticed the colour was wrong.
  // Rejected at the boundary instead, with the reason spelled out.
  if (typeof value === 'string' && /^#?[0-9A-Fa-f]{6}$/.test(value)) {
    return {
      value: missingDefault, error: true,
      message: JSON.stringify(value) + ' is an RRGGBB hex colour, which a dwg cannot use' +
        ' — the pfodParser methods a generated sketch is built from take a palette number 0-255',
      fix: 'colour defaulted to ' + missingDefaultLabel + '; pick the nearest palette number instead',
    };
  }
  return {
    value: missingDefault, error: true,
    message: JSON.stringify(value) + ' is not a valid colour (expected -1 for BLACK_WHITE, or an integer 0-255)',
    fix: 'colour defaulted to ' + missingDefaultLabel,
  };
}

/// Pre-check for every file-load path ("Load Dwg", "Load All Dwgs in Dir and
/// sub-Dirs", the missing-insertDwg picker, the Choose a Drawing loader, the
/// missing-dwg prompt, and a menu zip's own dwgs/ entries): a chosen file or
/// scanned directory may contain other, unrelated .pfodDwg_json/.json files
/// (menu designs, config files, etc.), so this decides "is this actually a
/// usable dwg file" BEFORE the full validate/repair pass runs — a file that
/// fails here is rejected up front with a visible message, rather than
/// tripping a wall of unrelated validation errors or, worse, loading as
/// something broken.
///
/// Two requirements, and the caller is told WHICH one failed so the message
/// it shows is about the real problem:
///
///   format — must be the self-describing wrapper tag buildSaveableDwg()
///     writes (dwgLibrary.js), matching designer/state.js's own
///     importFromObject() convention. Strict: no bare/unwrapped form is
///     accepted even if the file otherwise has a name/items shape.
///   name — the drawing's identity. It is what a menu Drawing item's dwgName
///     and another drawing's insertDwg.drawingName resolve against, the
///     DwgLibrary key, the download filename and the generated C++ class
///     name. Nothing outside the file knows what references point at it, so
///     it cannot be reconstructed or invented: a file without one is
///     rejected rather than loaded under a made-up name that silently fails
///     to link.
///
/// @param {*} parsed — JSON.parse() result of a candidate file
/// @returns {string|null} null when the file is acceptable; otherwise a
///          reason phrase that reads correctly after '"<file>" ' — e.g.
///          'is missing the required "name" property'
function dwgFileRejectReason(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return 'is not a JSON object';
  }
  if (parsed.format !== DWG_EXPORT_FORMAT_TAG) {
    return 'does not look like a dwg file (missing "format": "' + DWG_EXPORT_FORMAT_TAG + '")';
  }
  if (typeof parsed.name !== 'string' || !parsed.name.trim()) {
    return 'is missing the required "name" property';
  }
  return null;
}

// ── TEMPORARY: legacy `refresh` -> `dwgRefresh_ms` migration ─────────
//
// TRANSITIONAL SHIM — SCHEDULED FOR REMOVAL. Not part of the dwg file
// format: `refresh` is read here, never written anywhere, and nothing
// downstream of validateAndRepairDwg() knows the field exists. It buys
// existing .pfodDwg_json files (shared dwgs, and the json/ entries inside
// already-generated sketch and menu-design zips) one migration hop.
//
// TO REMOVE, delete all four of:
//   1. DWG_LEGACY_REFRESH_MS_THRESHOLD (just below)
//   2. _migrateLegacyDwgFields() (just below that)
//   3. its single call at the top of validateAndRepairDwg()
//   4. the test: scratchpad test_refresh_migration.js
// Nothing else references any of them. After removal a legacy file loads
// with dwgRefresh_ms defaulted to 0 (no auto-refresh) and the user re-enters
// the rate once in the Dwg Controls Panel.
//
// Value at or above which a legacy `refresh` is read as ALREADY being
// milliseconds rather than seconds — see _migrateLegacyDwgFields for the
// two populations this separates. 1000 is the break-even point: below it a
// millisecond reading is under one second (and under pfodWeb's own 250 ms
// auto-refresh floor, so it could never have been the intent), while at or
// above it a seconds reading means a refresh of 16.7 minutes or more.
const DWG_LEGACY_REFRESH_MS_THRESHOLD = 1000;

/// TEMPORARY — see the removal note above this function's own constant.
/// Upgrade a dwg loaded from a FILE to the current field names and units.
///
/// The refresh interval was once stored as `refresh` in SECONDS — the raw
/// number the Dwg Controls Panel's seconds input held — and multiplied by
/// 1000 at each emit point (the wire start header, and the generated
/// sketch's own dwgRefresh_ms member). It is now stored as `dwgRefresh_ms`
/// in milliseconds, matching both of those directly, so no emit path
/// converts any more and the panel's seconds input is the only converting
/// layer.
///
/// This runs here rather than at each call site because every file-borne
/// dwg reaches the app through validateAndRepairDwg(): the single-file
/// Load Dwg, the directory scan, the missing-insertDwg picker
/// (dwgControlsPanelUI.js), the Choose a Drawing loader
/// (selectDwgForItem.js), the missing-dwg prompt (missingDwgPrompt.js),
/// and a menu zip's own dwgs/ entries (loadFromFile.js) all call it. One
/// pass here covers all six, and any load path added later gets it free.
/// It deliberately does NOT depend on `isLoad` — three of those six omit
/// that argument.
///
/// Deliberately NOT applied to dwgs read back out of localStorage
/// (DwgLibrary.get()): per direction, browser-saved data is not migrated.
///
/// A legacy `refresh` is therefore not one unit but two, and which one it
/// is has to be inferred:
///
///   - Files saved from 2026-08-09 (when the seconds/ms emit bug was
///     fixed) up to the dwgRefresh_ms rename hold the SECONDS the panel's
///     input showed — typically 1, 2, 5, 30.
///   - Files saved BEFORE that fix put their stored number on the wire as
///     milliseconds, so a user chasing a 2 s refresh typed 2000 into a
///     field labelled seconds and it looked correct. pfodWeb's own shipped
///     examples did exactly this ("refresh": 2000).
///
/// DWG_LEGACY_REFRESH_MS_THRESHOLD splits them: below 1000 the value can
/// only sensibly be seconds (as ms it would be under a second, and under
/// the 250 ms auto-refresh floor), at or above 1000 it can only sensibly
/// be milliseconds (as seconds it would be a 16.7-minute-or-slower
/// refresh). The residual misreads are a genuine 1000-3600 s (17-60 min)
/// rate saved during that ~2-week window, which comes across far too fast
/// — rare enough to accept, and both branches report what they assumed so
/// the user can see and correct it on the Validation Errors screen.
///
/// @param {object} dwg — the shallow copy validateAndRepairDwg is building
/// @param {Array} errors — that function's own errors array; entries show
///                on the Validation Errors screen like any other repair
function _migrateLegacyDwgFields(dwg, errors) {
  if (!('refresh' in dwg)) return;
  const legacy = dwg.refresh;
  delete dwg.refresh;

  if (dwg.dwgRefresh_ms !== undefined) {
    errors.push(_err('refresh',
      'file carries both the legacy "refresh" field and "dwgRefresh_ms"',
      'legacy "refresh" (' + JSON.stringify(legacy) + ') ignored — "dwgRefresh_ms" (' +
        JSON.stringify(dwg.dwgRefresh_ms) + ') kept'));
    return;
  }

  // 0, negative, or non-numeric all end up at the same place: the
  // dwgRefresh_ms check below defaults them to 0 (no auto-refresh), which
  // is what a legacy 0 meant too. Nothing changed, so nothing is reported.
  if (typeof legacy !== 'number' || !isFinite(legacy) || legacy <= 0) return;

  if (legacy >= DWG_LEGACY_REFRESH_MS_THRESHOLD) {
    dwg.dwgRefresh_ms = legacy;
    errors.push(_err('refresh',
      'legacy "refresh" of ' + legacy + ' is too large to be seconds (that would be a ' +
        Math.round(legacy / 60) + ' minute refresh), so this file was already storing milliseconds',
      'carried across unchanged as dwgRefresh_ms = ' + legacy + ' ms (' +
        (legacy / 1000) + ' s) — check that is the rate you want'));
    return;
  }

  dwg.dwgRefresh_ms = legacy * 1000;
  errors.push(_err('refresh',
    'legacy "refresh" field (seconds) is now "dwgRefresh_ms" (milliseconds)',
    'converted to dwgRefresh_ms = ' + dwg.dwgRefresh_ms + ' ms (' + legacy + ' s)'));
}

// Every field that is an IDENTITY — something else finds this thing by
// matching the string exactly. Leading/trailing whitespace in any of them
// breaks that match silently, so they are all trimmed on the way in.
const DWG_ITEM_NAME_FIELDS = Object.freeze(['cmdName', 'idxName', 'drawingName']);

// The five characters that FRAME a pfod message, and the escape each is
// written as. A raw one in displayed text is read as structure, not text: a
// `|` starts a new item, a `}` ends the message, a `~` adds a field. The
// damage is silent and total — "|}" in a label produces {+...|t~1~|}~1~1~L},
// which the client's own parser then throws on ("Unknown item type"), so the
// drawing cannot be rendered at all.
//
// Exactly these five, and NOT the other three escapes the format defines:
//   `<` opens an inline format tag (<b>, <+2>, colour tags) and escaping it
//       would destroy every deliberate one.
//   `&` begins every escape sequence, so escaping it would turn an already
//       correct `&#124;` into `&amp;#124;`.
// So this pair is only safe for the framing five — which is also exactly what
// pfodApp's own touchActionInput dialog escapes (see chars.txt).
const DWG_RESTRICTED_CHARS = Object.freeze([
  ['`', '&#96;'],
  ['{', '&#123;'],
  ['|', '&#124;'],
  ['}', '&#125;'],
  ['~', '&#126;'],
]);

// Text fields whose contents are DISPLAYED, per item type — the ones that
// have to be escaped. Everything else on an item is a number, a name or an
// enum, none of which can carry a restricted character usefully.
const DWG_TEXT_FIELDS = Object.freeze({
  label: ['text', 'units'],
  value: ['text', 'units'],
  touchActionInput: ['prompt'],
});

/// Escape the five framing characters, leaving every other character —
/// including `<` and `&` — untouched. Order is irrelevant: no replacement
/// contains any of the five sources.
/// @param {string} str
/// @returns {string}
function escapeRestrictedChars(str) {
  if (typeof str !== 'string' || !str) return str;
  let out = str;
  DWG_RESTRICTED_CHARS.forEach(([ch, esc]) => { out = out.split(ch).join(esc); });
  return out;
}

/// Inverse of escapeRestrictedChars — turn the five escapes back into their
/// characters, for putting a stored value into an editor field.
/// @param {string} str
/// @returns {string}
function unescapeRestrictedChars(str) {
  if (typeof str !== 'string' || !str) return str;
  let out = str;
  DWG_RESTRICTED_CHARS.forEach(([ch, esc]) => { out = out.split(esc).join(ch); });
  return out;
}

/// Trim the dwg's own name and every item's name-like fields, reporting each
/// value that actually changed.
///
/// These are matched by exact string equality all over the app — a menu
/// Drawing item's dwgName against dwg.name, an insertDwg's drawingName
/// against another dwg's name, a touchAction/touchActionInput's cmdName
/// against its touchZone's, a hide/unhide/erase's idxName against the item
/// that declares it — so ' LedOn ' and 'LedOn' are different drawings and
/// nothing says why. The designer's own screens already trim what the user
/// types (Create/Edit Dwg name, Add/Edit Item cmdName/idxName), so padding
/// only ever arrives from a hand-edited or externally-produced file; this
/// makes the file path agree with the UI path.
///
/// Runs BEFORE every other pass, because the passes that follow match on
/// exactly these fields: _dedupDeclaredIdxNames groups by idxName, and
/// nestAndValidateTouchActions pairs a touchAction to its touchZone by
/// cmdName. Trimming afterwards would let ' idx_1 ' and 'idx_1' be treated
/// as two different declarations first, and only look identical later.
///
/// A value that trims away to nothing is left as the empty string rather than
/// removed: the checks below already treat an empty name as absent, and the
/// dwg's own name being empty is caught by the required-name throw.
///
/// @param {object} dwg — the shallow copy validateAndRepairDwg is building
/// @param {Array} errors — that function's own errors array
function _trimNames(dwg, errors) {
  const trimField = (obj, field, path) => {
    if (typeof obj[field] !== 'string') return;
    const trimmed = obj[field].trim();
    if (trimmed === obj[field]) return;
    errors.push(_err(path + '.' + field,
      JSON.stringify(obj[field]) + ' has leading or trailing whitespace, which would ' +
        'stop anything referring to it by name from matching',
      'trimmed to ' + JSON.stringify(trimmed)));
    obj[field] = trimmed;
  };

  trimField(dwg, 'name', 'dwg');
  if (!Array.isArray(dwg.items)) return;
  dwg.items.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const path = 'items[' + i + ']';
    DWG_ITEM_NAME_FIELDS.forEach((f) => trimField(item, f, path));
    // A touchAction's action[0] is a full item in its own right and carries
    // its own idxName/cmdName — see _stripItemWireFields's own doc.
    if (item.type === 'touchAction' && Array.isArray(item.action) && item.action[0]
        && typeof item.action[0] === 'object') {
      DWG_ITEM_NAME_FIELDS.forEach((f) => trimField(item.action[0], f, path + '.action[0]'));
    }
  });
}

/// Validate + repair one loaded dwg object against the real, in-use
/// schema (see file header). Every problem found is fixed in place and
/// also recorded in `errors` so the caller can show it before saving.
/// Always returns a `dwg` safe to persist, even when `errors` is
/// non-empty.
///
/// @param {*} raw — JSON.parse() result of the picked file; any shape
/// @param {string} fileName — used as a fallback name (control.js:1104-1113)
/// @param {boolean} [isLoad=false] — true for every genuine "load
///        untrusted external data" call site. There are six, and they must
///        all pass it: Load Dwg, Load All Dwgs in Dir, and the
///        missing-insertDwg picker (dwgControlsPanelUI.js); the Choose a
///        Drawing loader (selectDwgForItem.js); the missing-dwg prompt
///        (missingDwgPrompt.js); and a menu zip's own dwgs/ entries
///        (loadFromFile.js). Everything else is re-validating a dwg that
///        was already deduped the last time anything saved it, and leaves
///        this false — see _dedupDeclaredIdxNames's own doc for what the
///        difference actually changes.
/// @returns {{dwg: object, errors: Array<{field,message,fix}>}}
function validateAndRepairDwg(raw, fileName, isLoad) {
  const errors = [];
  const dwg = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? Object.assign({}, raw) : {};

  // TEMPORARY (scheduled for removal — see _migrateLegacyDwgFields's own
  // header): legacy field names/units first, so every check below sees only
  // the current shape. Deleting this one line is all that disables it.
  _migrateLegacyDwgFields(dwg, errors);

  // Then trim every name, before anything below matches on one — see
  // _trimNames for why the order matters.
  _trimNames(dwg, errors);

  // `name` is REQUIRED. It is not cosmetic and it is not derivable: it is the
  // DwgLibrary key, the string a menu Drawing item's dwgName and another
  // drawing's insertDwg.drawingName have to match, the download filename, and
  // the generated C++ class name via _identifier(). Nothing outside the file
  // knows what those references say, so a name invented here is a guess that
  // silently fails to link rather than failing visibly.
  //
  // The filename fallback below is DELIBERATELY DISABLED, not deleted, so the
  // decision stays visible and reversible. It was also wrong for most of its
  // life: the strip list predated this project's own .pfodDwg_json extension,
  // which does not end in '.json' (the separator is an underscore), so the
  // extension survived into the name — a dwg loaded from LedOn.pfodDwg_json
  // with no name field became 'LedOn.pfodDwg_json', and every reference to
  // 'LedOn' then missed it. fileName is kept as a parameter because the error
  // text below names the file the problem is in.
  //
  //   const fromFile = (fileName || '')
  //     .replace(/\.pfodDwg_json$/i, '')
  //     .replace(/\.dwg\.json$/i, '').replace(/\.json$/i, '').replace(/\s*\(\d+\)$/, '');
  //   dwg.name = fromFile || 'Dwg';
  //
  // Reaching here without a name is a CALLER BUG, not bad file data, so it is
  // thrown rather than repaired — matching this project's own convention for
  // "should never happen" (dwgDesignerAdapter.js's resolveIdx/resolveCmd, and
  // _dedupDeclaredIdxNames's own non-isLoad branch below).
  //
  // Every route in is already covered: the six file-load paths reject a
  // nameless file at the gate (dwgFileRejectReason), and every internal caller
  // passes either a draft-name constant, the name of a dwg already in the
  // library, or a typed name its own screen has already rejected when empty.
  //
  // Inventing one instead would be actively harmful: the name IS the
  // DwgLibrary key and the string every menu Drawing item and insertDwg
  // resolves against, so a made-up name either collides with a real dwg or
  // creates one nothing points at — silently, in code the user never asked to
  // run. Whitespace counts as missing (trim), matching the gate exactly, so a
  // name like '   ' cannot slip through as a technically-non-empty string.
  if (typeof dwg.name !== 'string' || !dwg.name.trim()) {
    throw new Error('[dwgValidate] validateAndRepairDwg: dwg has no usable name ' +
      '(' + JSON.stringify(dwg.name) + ')' + (fileName ? ' for "' + fileName + '"' : '') +
      ' — name is required and is never invented here; the caller must supply one, ' +
      'and a file missing it should already have been rejected by dwgFileRejectReason.');
  }

  if (typeof dwg.x !== 'number' || !isFinite(dwg.x)) {
    errors.push(_err('x', 'missing required property (canvas width)', 'x defaulted to 50'));
    dwg.x = 50;
  } else if (dwg.x < DWG_DIM_MIN || dwg.x > DWG_DIM_MAX) {
    const clamped = Math.min(DWG_DIM_MAX, Math.max(DWG_DIM_MIN, Math.round(dwg.x)));
    errors.push(_err('x', dwg.x + ' exceeds the maximum drawing size, ' + DWG_DIM_MAX,
      'x clamped to ' + clamped + ' (the spec maximum)'));
    dwg.x = clamped;
  } else {
    dwg.x = Math.round(dwg.x);
  }

  if (typeof dwg.y !== 'number' || !isFinite(dwg.y)) {
    errors.push(_err('y', 'missing required property (canvas height)',
      'y = ' + dwg.x + ' (square canvas, same as x)'));
    dwg.y = dwg.x;
  } else if (dwg.y < DWG_DIM_MIN || dwg.y > DWG_DIM_MAX) {
    const clamped = Math.min(DWG_DIM_MAX, Math.max(DWG_DIM_MIN, Math.round(dwg.y)));
    errors.push(_err('y', dwg.y + ' exceeds the maximum drawing size, ' + DWG_DIM_MAX,
      'y clamped to ' + clamped + ' (the spec maximum)'));
    dwg.y = clamped;
  } else {
    dwg.y = Math.round(dwg.y);
  }

  // dwgRefresh_ms (MILLISECONDS, 0 = no auto-refresh) — optional, no listed
  // error; matches createNewDrawing's own permissive
  // `refresh !== undefined ? refresh : 0`. Stored in ms so it matches the
  // wire start header and the generated sketch's own dwgRefresh_ms member
  // with no conversion on any emit path; the Dwg Controls Panel's own
  // seconds input is the only place that converts.
  if (typeof dwg.dwgRefresh_ms !== 'number' || !isFinite(dwg.dwgRefresh_ms) || dwg.dwgRefresh_ms < 0) {
    dwg.dwgRefresh_ms = 0;
  }

  // The dwg's own background colour defaults to Black (0) when
  // unspecified — distinct from item colours, which default to
  // BLACK_WHITE mode (-1) when unspecified (see _repairColour above).
  const bc = _repairColour(dwg.color, 0, 'Black');
  if (bc.error) errors.push(_err('color', bc.message, bc.fix));
  dwg.color = bc.value;

  if (!Array.isArray(dwg.items)) dwg.items = [];
  let repaired = [];
  dwg.items.forEach((item, i) => {
    if (!item || typeof item !== 'object' || typeof item.type !== 'string'
        || DWG_ITEM_TYPES.indexOf(item.type) === -1) {
      const badType = item && item.type;
      errors.push(_err('items[' + i + '].type',
        JSON.stringify(badType) + ' is not a recognized item type — expected one of: ' + DWG_ITEM_TYPES.join(', '),
        'items[' + i + '] deleted — an unrecognized type isn\'t guessed at, it\'s dropped'));
      return; // drop the item — not carried into repaired[]
    }

    const fixed = Object.assign({}, item);

    // `idx` is a WIRE value and never belongs in a file. It is minted from
    // idxName at encode time and stripped on save (buildSaveableDwg), so
    // nothing this app writes ever produces one — a stored idx can only be
    // hand-authored, and it is quietly destructive:
    //
    // The minting counter knows nothing about hand-written numbers, so a raw
    // idx: 1 and the first minted index both claim slot 1. On the wire that
    // is one `|i`1` and two items carrying idx 1 — the second overwrites the
    // first and one of them simply disappears. _dedupDeclaredIdxNames cannot
    // catch it either, because it groups by idxName and a raw-idx item has
    // none, so the one check built for exactly this collision is blind to it.
    //
    // Stripped rather than dropped: the item's geometry and colour are fine,
    // the only thing wrong is a field the format says not to write. It just
    // becomes un-indexed, which does move it from the first draw pass to
    // being drawn with the other un-indexed items — so it is reported, not
    // silent. Anything referencing it by that raw idx becomes an orphan and
    // is dropped by the reference checks further down.
    if (fixed.idx !== undefined) {
      errors.push(_err('items[' + i + '].idx',
        'idx ' + JSON.stringify(fixed.idx) + ' is a wire value, not a file field — an index ' +
          'is minted from idxName, and a hand-written one can silently collide with it',
        typeof fixed.idxName === 'string' && fixed.idxName.trim()
          ? 'idx removed — the index is minted from idxName ' + JSON.stringify(fixed.idxName.trim())
          : 'idx removed — this item is no longer indexed; give it an idxName to index it'));
      delete fixed.idx;
    }

    // `cmd` and `textIdx` are the same thing for the other two wire values,
    // and go the same way. There is no `cmd` or `textIdx` on incoming JSON —
    // or there should not be: cmd is minted from cmdName and textIdx from a
    // touchActionInput's idxName, both at encode time, and buildSaveableDwg
    // strips them on save.
    //
    // A hand-written one is as destructive as a hand-written idx and for the
    // same reason: the minting counters know nothing about it, so it either
    // collides with a minted value and silently steals whatever that names,
    // or points at nothing at all. Neither is visible in the file, because
    // every reference check in here matches on cmdName/idxName and a raw
    // cmd/textIdx has neither.
    ['cmd', 'textIdx'].forEach((f) => {
      if (fixed[f] === undefined) return;
      const nameField = (f === 'cmd') ? 'cmdName' : 'idxName';
      const name = typeof fixed[nameField] === 'string' && fixed[nameField].trim();
      errors.push(_err('items[' + i + '].' + f,
        f + ' ' + JSON.stringify(fixed[f]) + ' is a wire value, not a file field — it is ' +
          'minted from ' + nameField + ' at encode time, and a hand-written one silently ' +
          'collides with the minted values or points at nothing',
        name
          ? f + ' removed — it is minted from ' + nameField + ' ' + JSON.stringify(name)
          : f + ' removed — give this item a ' + nameField + ' to give it a target'));
      delete fixed[f];
    });

    // `priority` is the OLD pfodWebDesigner's name for a touchZone's index —
    // the same setting `indexed` + `idxName` expresses now, written as a bare
    // number. So it is a raw idx wearing a different name, and it goes the
    // same way as one: removed, because a number cannot mint an index here
    // (indices come from idxName) and nothing in this project has ever read
    // the field.
    //
    // Only a NON-ZERO one is reported. 0 means "no priority", so removing it
    // loses nothing and there is nothing for the user to act on; a non-zero
    // one is a real setting that cannot be carried over automatically —
    // idxName is never invented — so it is named in the report along with how
    // to restore it.
    if (fixed.priority !== undefined) {
      const wasSet = fixed.priority !== 0 && fixed.priority !== '0';
      if (wasSet) {
        errors.push(_err('items[' + i + '].priority',
          'priority ' + JSON.stringify(fixed.priority) + ' is the old name for a ' +
            'touchZone index, written as a bare number — an index is minted from ' +
            'idxName, so this one has never had any effect here',
          'priority removed — to restore that priority give the item an idxName'));
      }
      delete fixed.priority;
    }

    // A touchAction carries EXACTLY ONE primitive. The wire form is
    // |X~cmd~<primitive>, pfodTouchAction::action() takes one, and
    // dwgWireEncoder's encodeTouchAction emits action[0] and nothing else.
    // The array is a container the runtime spreads into its per-cmd list
    // (drawingDataProcessor pushes ...item.action into allTouchActionsByCmd),
    // not a way to hang two primitives off one item — a zone with several
    // action primitives is several touchAction items sharing a cmd.
    //
    // Extras past [0] were previously ignored here and never validated,
    // trimmed or reference-checked, while the Arduino exporter DID emit a
    // line for each: a file with two entries generated two touchActions in
    // the sketch and sent one from the preview. Dropped and reported, so
    // the file says what every layer actually does.
    if (item.type === 'touchAction') {
      if (!Array.isArray(fixed.action) || fixed.action.length === 0) {
        errors.push(_err('items[' + i + '].action',
          'a touchAction must carry exactly one action item, and this one carries ' +
            (Array.isArray(fixed.action) ? 'none' : JSON.stringify(fixed.action)),
          'items[' + i + '] deleted — there is nothing for this touchAction to draw'));
        return; // drop the item — not carried into repaired[]
      }
      if (fixed.action.length > 1) {
        errors.push(_err('items[' + i + '].action',
          'a touchAction carries exactly one action item, but this one has ' +
            fixed.action.length + ' — only the first is ever sent',
          fixed.action.length - 1 + ' extra action item(s) dropped — give the touchZone another touchAction with the same cmdName to show more than one'));
        fixed.action = [fixed.action[0]];
      }
    }

    // Displayed text is PRE-ESCAPED in the file: the encoder emits it
    // verbatim and the renderer decodes escapes before drawing, so a raw
    // framing character reaches the wire as structure and breaks the
    // message. Repaired rather than reported-and-left, because the item is
    // otherwise fine and the fix is exact — there is only one escape for
    // each of the five, and no information is lost.
    (DWG_TEXT_FIELDS[item.type] || []).forEach((f) => {
      if (typeof fixed[f] !== 'string' || !fixed[f]) return;
      const escaped = escapeRestrictedChars(fixed[f]);
      if (escaped === fixed[f]) return;
      errors.push(_err('items[' + i + '].' + f,
        JSON.stringify(fixed[f]) + ' contains a character that frames a pfod message ' +
          '(one of ` { | } ~) — written raw it is read as structure, and the drawing ' +
          'cannot be parsed at all',
        f + ' escaped to ' + JSON.stringify(escaped) + ' — it renders the same'));
      fixed[f] = escaped;
    });

    // touchZone/insertDwg are the DECLARING items for a cmd — each is
    // its own independent identity, so if one is missing BOTH a real cmd
    // and a cmdName to regenerate one from later, it's fine to invent
    // both (cmd default matches the real embedded pfodAutoCmd's own
    // naming — pfodParser/src/dwgs/pfodAutoCmd.cpp:8 — "c1","c2",... a
    // bare 'c' prefix, NOT pfodWebDesigner's longer 'cmd_c<N>'
    // authoring-tool convention; every cmd is sent over the wire
    // verbatim and the pfod message is capped at 1023 bytes, so the
    // shorter form is the real wire-optimal one. cmdName is the
    // separate, stable authoring-side identity — pfodWebDesigner's own
    // convention, test_text.json's real saved shape: cmdName "cmd_c1"
    // alongside cmd "cmd_c145" — only filled in if the item doesn't
    // already have one of its own).
    //
    // touchAction/touchActionInput/hide/unhide/erase only ever REFERENCE
    // an existing touchZone/insertDwg's cmd (touchAction/
    // touchActionInput positionally, via nestAndValidateTouchActions;
    // hide/unhide/erase by matching value) — per direction, they never
    // get an independently-INVENTED cmdName of their own (that would
    // fabricate a connection to something that was never actually
    // declared). If one of these is missing cmd outright, it's left
    // alone here — an unresolvable touchAction/touchActionInput gets
    // caught as an orphan by nestAndValidateTouchActions below; an
    // unresolvable hide/unhide/erase still gets a bare compact cmd
    // fallback (never a cmdName) purely so wire-encoding has SOMETHING
    // to emit, not because it now legitimately targets anything.
    //
    // idxName is NEVER auto-generated anywhere, for any type — unlike
    // cmdName it's purely a user-assigned label (there's no equivalent
    // "the wire needs some cmd" pressure forcing a name into existence).
    // An item with no idxName is simply not indexed: any raw idx it
    // carried was stripped above, and nothing mints one without a name.
    if (item.type === 'insertDwg' || item.type === 'touchZone') {
      const hasCmdName = typeof fixed.cmdName === 'string' && fixed.cmdName.trim();
      if (!hasCmdName) {
        if (item.type === 'insertDwg') {
          // DERIVED, not invented. An insertDwg's cmdName is DEFINED as
          // "dwg_" + drawingName — the editor's own field is readonly and
          // both commit paths compute it — so the answer is fully determined
          // by a field this item already requires. Inventing a cmd_c<N> here
          // instead (as this used to) broke that invariant silently: a
          // hide/unhide/erase written against "dwg_Child" then matched
          // nothing, and was not even flagged, because orphan detection only
          // looked at idxName. A missing drawingName is reported separately
          // just below, and leaves nothing to derive from.
          if (typeof fixed.drawingName === 'string' && fixed.drawingName.trim()) {
            fixed.cmdName = 'dwg_' + fixed.drawingName.trim();
            errors.push(_err('items[' + i + '].cmdName', 'missing required property',
              'derived from drawingName as ' + JSON.stringify(fixed.cmdName)));
          }
        } else {
          // A touchZone's cmdName is NOT derivable from anything, so it is
          // not invented either — the old cmd_c<N> fallback named the zone
          // after its own array position, which nothing else could ever have
          // been written to reference. Without a cmd a touchZone cannot be
          // touched at all (drawingDataProcessor throws on an empty one), so
          // the item is unusable and is dropped, exactly like an
          // unrecognised type. Its own touchActions/touchActionInput follow
          // it out as orphans via nestAndValidateTouchActions.
          errors.push(_err('items[' + i + '].cmdName', 'missing required property',
            'items[' + i + '] deleted — a touchZone with no cmdName cannot be touched, ' +
            'and the name is not derivable from anything else'));
          return; // drop the item — not carried into repaired[]
        }
      }
    }
    if (item.type === 'hide' || item.type === 'unhide' || item.type === 'erase') {
      const hasIdxName = typeof fixed.idxName === 'string' && fixed.idxName.trim();
      const hasCmdName = typeof fixed.cmdName === 'string' && fixed.cmdName.trim();
      // Names only. A raw idx/cmd is not an alternative target — both were
      // stripped above, since neither belongs in a file — so what decides
      // this is whether the item names something.
      if (!hasIdxName && !hasCmdName) {
        // Dropped, not given an invented cmd. This item names nothing to act
        // on, and the old fallback said so itself — it existed "purely so
        // wire-encoding has SOMETHING to emit, not because it now
        // legitimately targets anything". So it emitted a |h`c<N> aimed at
        // whatever happened to hold that cmd, or at nothing, forever. An
        // action with no target is not recoverable by guessing, the same way
        // a touchZone with no cmdName is not, so it goes the same way.
        errors.push(_err('items[' + i + ']',
          'neither idxName nor cmdName is set — nothing to ' + item.type,
          'items[' + i + '] deleted — an action with no target cannot be guessed at'));
        return; // drop the item — not carried into repaired[]
      }
    }
    if (item.type === 'insertDwg' && (typeof fixed.drawingName !== 'string' || !fixed.drawingName)) {
      errors.push(_err('items[' + i + '].drawingName', 'missing required property',
        'drawingName left empty — this insertDwg item points at nothing until edited'));
      fixed.drawingName = '';
    }

    (DWG_ITEM_FIELD_SCHEMA[item.type] || []).forEach((f) => {
      const path = 'items[' + i + '].' + f.name;
      // An OPTIONAL field that is absent stays absent. Defaulting one in would
      // write a field the author deliberately left out — a label's
      // value/decimals/units are an opt-in suffix, and materialising
      // `decimals: 2` on every label would claim a formatted number that
      // isn't there.
      if (f.optional && fixed[f.name] === undefined) return;
      if (f.kind === 'colour') {
        const c = _repairColour(fixed[f.name], DWG_COLOUR_BLACKWHITE, 'BLACK_WHITE mode');
        if (c.error) errors.push(_err(path, c.message, c.fix));
        fixed[f.name] = c.value;
      } else if (f.kind === 'number') {
        if (typeof fixed[f.name] !== 'number' || !isFinite(fixed[f.name])) {
          if (fixed[f.name] !== undefined) {
            errors.push(_err(path, JSON.stringify(fixed[f.name]) + ' is not a number',
              f.name + ' defaulted to ' + f.default));
          }
          fixed[f.name] = f.default;
        }
      } else if (f.kind === 'integer') {
        // A whole number, because the device field is one: a value item's
        // intValue/min/max are int32_t and decimals is an int
        // (pfodParser/src/dwgs/pfodLabel.h:22-27). A fractional min/max is
        // not a range the hardware can hold — it gets truncated there, and
        // the file and the device then disagree about the scale, so the
        // readout is quietly wrong. Rounded to nearest rather than dropped
        // (matching the menu side's own chart-index coercion): the intent is
        // obvious and the item is otherwise fine.
        //
        // f.min/f.max, where present, are the DEVICE's own limits, not a UI
        // preference — decimals is documented as "limits to -6 to +6", and
        // out-of-range values are clamped there silently, so they are clamped
        // here where the user can see it happen.
        if (typeof fixed[f.name] !== 'number' || !isFinite(fixed[f.name])) {
          if (fixed[f.name] !== undefined) {
            errors.push(_err(path, JSON.stringify(fixed[f.name]) + ' is not a number',
              f.name + ' defaulted to ' + f.default));
          }
          fixed[f.name] = f.default;
        } else if (!Number.isInteger(fixed[f.name])) {
          const rounded = Math.round(fixed[f.name]);
          errors.push(_err(path, JSON.stringify(fixed[f.name]) +
            ' is not a whole number — this field is an integer on the device, so a ' +
            'fraction is truncated there and the file no longer describes what runs',
            f.name + ' rounded to ' + rounded));
          fixed[f.name] = rounded;
        }
        if (f.min !== undefined && fixed[f.name] < f.min) {
          errors.push(_err(path, fixed[f.name] + ' is below the device limit of ' + f.min,
            f.name + ' clamped to ' + f.min));
          fixed[f.name] = f.min;
        }
        if (f.max !== undefined && fixed[f.name] > f.max) {
          errors.push(_err(path, fixed[f.name] + ' is above the device limit of ' + f.max,
            f.name + ' clamped to ' + f.max));
          fixed[f.name] = f.max;
        }
      } else if (f.kind === 'boolean') {
        _repairBooleanField(fixed, f, path, errors);
      } else if (f.kind === 'enum') {
        if (f.enumValues.indexOf(fixed[f.name]) === -1) fixed[f.name] = f.default;
      } else if (f.kind === 'string') {
        if (typeof fixed[f.name] !== 'string') fixed[f.name] = f.default;
      }
    });

    // A touchAction's action[0] is a full drawable item in its own right,
    // and the field pass above never sees it — DWG_ITEM_FIELD_SCHEMA lists
    // touchAction as [] deliberately, because that nested item is NOT an
    // ordinary item: its xOffset/yOffset/intValue may legitimately be the
    // strings "COL"/"ROW", meaning "wherever the touch landed"
    // (dwgWireEncoder's own _offsetField, dwgArduinoExport's own
    // _convertOffset, and docs/Slider.pfodDwg_json's own readout). Running
    // the number kinds over it would default every one of those to 0 and
    // silently break the drawing.
    //
    // Booleans have no such form: "true"/"false" in a nested action item is
    // always the old pfodWebDesigner's string, never a touch placeholder.
    // So they get the identical rule the top level gets — which they were
    // missing entirely, leaving a legacy touchAction's replacement shape
    // reading `filled: "true"` and drawing unfilled.
    if (fixed.type === 'touchAction' && Array.isArray(fixed.action) &&
        fixed.action[0] && typeof fixed.action[0] === 'object') {
      const nested = fixed.action[0];
      (DWG_ITEM_FIELD_SCHEMA[nested.type] || []).forEach((f) => {
        if (f.kind !== 'boolean') return;
        _repairBooleanField(nested, f, 'items[' + i + '].action[0].' + f.name, errors);
      });
    }

    // `idxName` is the ONLY switch: a non-blank one makes the item indexed.
    // `indexed` was a second flag saying the same thing, and it is dropped
    // here. Nothing authored it — the panel wrote it alongside idxName when
    // the user ticked "Assign Index" and wrote neither otherwise — and only
    // the Arduino exporter ever read it, while the idx minting
    // (_resolveAutoCmdAndIdx), this file's own dedup and reference passes,
    // and the whole runtime render path all keyed on idxName alone. Keeping
    // both let a file preview as indexed and export as un-indexed.
    //
    // Reported only where dropping it changes something. A `true` beside a
    // real idxName says nothing new; the two mismatched cases each lose or
    // invert an intent, so those are named.
    //
    // REFERENCE_ONLY_TYPES are skipped: their idxName is a REFERENCE to
    // someone else's declaration, and they never carried the flag anyway.
    if (REFERENCE_ONLY_TYPES.indexOf(item.type) === -1) {
      const hasIdxName = typeof fixed.idxName === 'string' && fixed.idxName !== '';
      if (fixed.indexed !== undefined) {
        if (hasIdxName && fixed.indexed !== true) {
          errors.push(_err('items[' + i + '].indexed',
            'indexed is ' + JSON.stringify(fixed.indexed) + ' but idxName ' +
              JSON.stringify(fixed.idxName) + ' is set — an idxName is now what makes an ' +
              'item indexed, so this item IS indexed despite the flag',
            'indexed removed — delete the idxName instead if this item should not be indexed'));
        } else if (!hasIdxName && fixed.indexed !== false) {
          errors.push(_err('items[' + i + '].indexed',
            'indexed is ' + JSON.stringify(fixed.indexed) + ' but there is no idxName — an ' +
              'index is minted from the name, and nothing mints one without it',
            'indexed removed — give the item an idxName to index it'));
        }
        delete fixed.indexed;
      }
    }

    // An `index` carries an idxName and NOTHING else — no cmdName. The wire
    // form is |i`idx, which has no cmd slot (encodeIndex / translateRawIndex,
    // which throws without one), and pfodIndex has no cmd() at all: the
    // library header has it commented out, so generated code using one would
    // not compile.
    if (item.type === 'index') {
      if (typeof fixed.cmdName === 'string' && fixed.cmdName !== '') {
        errors.push(_err('items[' + i + '].cmdName',
          'an index placeholder cannot carry a cmdName — it reserves an index and ' +
            'nothing else, and there is no cmd slot in the |i wire form to put one in',
          'cmdName ' + JSON.stringify(fixed.cmdName) + ' removed — use a touchZone if ' +
            'this was meant to be touchable'));
        delete fixed.cmdName;
      }
      // With that gone, an index with no idxName reserves nothing and draws
      // nothing, so it has no reason to exist — unlike a rectangle, which
      // still draws without one.
      if (!(typeof fixed.idxName === 'string' && fixed.idxName !== '')) {
        errors.push(_err('items[' + i + ']',
          'an index placeholder with no idxName reserves nothing and draws nothing',
          'items[' + i + '] deleted — give it an idxName to keep it'));
        return; // drop the item — not carried into repaired[]
      }
    }

    repaired.push(fixed);
  });
  repaired = _dedupDeclaredIdxNames(repaired, errors, !!isLoad);
  dwg.items = nestAndValidateTouchActions(repaired, errors);

  return { dwg, errors };
}

/// Resolve duplicate DECLARED idxNames — the same per-kind dedup rule the
/// Dwg Controls Panel's own Add/Edit Item screens already enforce at
/// commit time (dwgControlsPanelUI.js's _collectUsedIdxNames), applied
/// here so a hand-edited or externally-produced file can't sneak a
/// duplicate past the UI's own per-item check (which only ever looks at
/// the ONE item currently being added/edited, never the file as a
/// whole). An `index`-type item (Index Placeholder) is a bare
/// reservation, not a drawn item, so it's legitimate for it to SHARE a
/// name with a non-index item (they intentionally resolve to the same
/// wire idx) — collisions are only checked WITHIN one kind: two Index
/// Placeholders, or two non-index items, sharing a name.
/// REFERENCE_ONLY_TYPES never DECLARE an idxName (their own idxName/
/// action[0].idxName is a REFERENCE to some other item's declaration),
/// so they're never counted or touched here.
///
/// Resolution matches what a real device actually does with duplicate
/// declarations, NOT "rename to make them coexist" (that would change
/// the dwg's real behaviour — see this function's own history/tasklog):
/// items are processed sequentially on the wire, so a later declaration
/// sharing a numeric idx with an earlier one REPLACES its content in
/// place — only the LAST declaration with real drawable content is ever
/// actually visible. dwgWireEncoder.js's own encodeDwgStart already
/// defers EVERY indexed item's real content to the end of the wire
/// message, sending a bare `|i` placeholder at that item's own array
/// POSITION to reserve the idx (and capture whatever pushZero/popZero
/// transform context is active there) — so "which array position ends up
/// holding this idx's declaration" is what determines its pushZero
/// context and how early anything can reference it, independent of
/// where its drawable fields originated.
///
/// So for each duplicate group (same kind, same idxName): find the LAST
/// occurrence with real content (not `type: 'index'`) — that's genuinely
/// what a device would show. If one exists, its full item (type + every
/// field) REPLACES whatever is at the FIRST occurrence's array position —
/// not just its idxName, its entire content — so the surviving
/// declaration lives at the position anything referencing this idx early
/// would expect, and its own now-vacated original position is removed
/// along with every other occurrence in the group (any occurrence
/// strictly between, and any occurrence that's itself already an Index
/// Placeholder — a placeholder never draws, so it can never usefully be
/// "the real content that wins", real content or not, first or not). If
/// NO occurrence has real content (every one is already an Index
/// Placeholder), the first occurrence is left exactly as-is and every
/// other one is dropped as redundant.
///
/// @param {Array<object>} items — flat, field-repaired items
/// @param {Array} errors — validateAndRepairDwg's own errors array;
///                entries pushed here show on the Validation Errors
///                screen like any other repair (only ever reached when
///                `isLoad` is true — see below)
/// @param {boolean} isLoad — true for any of the six genuine file-load
///        call sites listed on validateAndRepairDwg's own isLoad param
///        (untrusted external data, where a duplicate is a realistic,
///        expected possibility worth silently repairing and
///        reporting). Every other caller is re-validating a dwg that
///        should already be duplicate-free (nothing else should ever be
///        able to write one — see dwgControlsPanelUI.js's own newIdxName-
///        vs-every-sharing-kind check), so finding one there means a bug
///        slipped past prevention — thrown loudly rather than silently
///        patched over, matching this project's own existing convention
///        for "should never happen" (dwgDesignerAdapter.js's
///        resolveIdx/resolveCmd).
/// @returns {Array<object>} items, possibly shorter (duplicates removed)
///          and/or with some entries replaced in place by the winning
///          occurrence's content — never mutated in place, since some
///          entries may need removing, not just editing
function _dedupDeclaredIdxNames(items, errors, isLoad) {
  const groups = new Map(); // 'kind|idxName' -> [itemIndex, ...] in array order
  items.forEach((item, i) => {
    if (!item.idxName || REFERENCE_ONLY_TYPES.indexOf(item.type) !== -1) return;
    const kind = (item.type === 'index') ? 'index' : 'nonindex';
    const key = kind + '|' + item.idxName;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  });

  const replacements = new Map(); // itemIndex -> replacement item (winner's content moved here)
  const toDelete = new Set();     // itemIndex -> drop entirely

  groups.forEach((indices) => {
    if (indices.length < 2) return;
    const idxName = items[indices[0]].idxName;

    if (!isLoad) {
      throw new Error('[dwgValidate] _dedupDeclaredIdxNames: duplicate idxName ' +
        JSON.stringify(idxName) + ' found outside a Load Dwg/Load All Dwgs context ' +
        '(items[' + indices.join(', ') + ']) — this dwg should already have been ' +
        'duplicate-free; something upstream failed to prevent this rename/edit.');
    }

    // Last occurrence with real drawable content (not an Index
    // Placeholder) — genuinely what a device would show. -1 if every
    // occurrence in the group is already a placeholder.
    let winner = -1;
    for (let k = indices.length - 1; k >= 0; k--) {
      if (items[indices[k]].type !== 'index') { winner = indices[k]; break; }
    }

    const first = indices[0];
    if (winner !== -1 && winner !== first) {
      errors.push(_err('items[' + first + ']',
        'idxName ' + JSON.stringify(idxName) + ' is also declared later by items[' + winner +
          '] — only the LAST declaration is ever actually shown on a device',
        'items[' + winner + ']\'s content moved to items[' + first + ']\'s position ' +
          '(preserving the pushZero/popZero context and early-reference availability of the ' +
          'FIRST occurrence, since that\'s where this idx is actually reserved on the wire)'));
      replacements.set(first, items[winner]);
      indices.forEach((i) => {
        if (i === first) return;
        if (i !== winner) {
          errors.push(_err('items[' + i + ']',
            'idxName ' + JSON.stringify(idxName) + ' duplicate, superseded by items[' + winner + ']',
            'items[' + i + '] deleted — redundant duplicate declaration'));
        }
        toDelete.add(i);
      });
    } else {
      // Either the first occurrence IS the winner (nothing to move — it's
      // already in place), or nothing in the group has real content at
      // all (every occurrence is already a placeholder) — either way,
      // the first occurrence is kept exactly as-is and every other
      // occurrence is redundant.
      indices.forEach((i) => {
        if (i === first) return;
        errors.push(_err('items[' + i + ']',
          'idxName ' + JSON.stringify(idxName) + ' duplicate of items[' + first + ']',
          'items[' + i + '] deleted — redundant duplicate declaration'));
        toDelete.add(i);
      });
    }
  });

  if (replacements.size === 0 && toDelete.size === 0) return items;
  return items
    .map((item, i) => replacements.has(i) ? replacements.get(i) : item)
    .filter((item, i) => !toDelete.has(i));
}

/// Convert a FLAT, already-field-repaired items array into the nested
/// form this project's own code (dwgWireEncoder.js, the future Add/Edit
/// Item screens) works with internally: a touchZone item gains
/// `.touchActionInput` (at most one, or undefined) and `.touchActions`
/// (an array, possibly empty) holding the touchActionInput/touchAction
/// items that immediately follow it on the wire and share its own `cmd`.
/// This is the ONLY validated shape for that relationship — a
/// touchAction/touchActionInput anywhere else (no immediately-preceding
/// touchZone, or one whose cmd doesn't match, or a second
/// touchActionInput for a zone that already has one) is flagged as an
/// error and DROPPED, per direction: "touchactions and input MUST
/// immediately follow their touchzone and be keyed with the same touch
/// cmd anything else is an error to be flagged and deleted on load."
///
/// Mirrors pfodWebDesigner's own principle of running the identical
/// normalize pass on both file-load and every later edit (server.js's
/// updateNumericIndices, invoked from the same /api/drawings/import
/// endpoint either way) — this function is called from both
/// validateAndRepairDwg() (file load) and DwgLibrary.get() (every read),
/// so a hand-edited or externally-produced dwg gets the same cleanup
/// either way. The touchZone/touchAction/touchActionInput matching
/// itself is the simple positional rule (child immediately follows its
/// zone, same cmd) — but once a touchAction/touchActionInput is matched
/// to its zone, its cmdName is auto-corrected to the zone's own cmdName
/// (overwriting whatever it had, or filling it in if it had none) —
/// they're conceptually the SAME named control, so this can't be left to
/// drift out of sync between the declaring touchZone and whatever
/// references it.
///
/// @param {Array<object>} items
/// @param {Array} errors — validateAndRepairDwg()'s own errors array;
///                 entries are pushed here in the same {field,message,fix}
///                 shape so file-load violations show on the Validation
///                 Errors screen like any other repair.
/// @returns {Array<object>} nested items array
function nestAndValidateTouchActions(items, errors) {
  const nested = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    if (item.type !== 'touchZone') {
      // A touchAction/touchActionInput reached here (rather than being
      // consumed by the touchZone branch below) has no immediately-
      // preceding matching touchZone — an orphan.
      if (item.type === 'touchAction' || item.type === 'touchActionInput') {
        // Name the cmdName, not item.cmd: a file-loaded child carries only
        // the name (any raw cmd was stripped), so reporting item.cmd printed
        // "with cmd undefined" and told the user nothing about which item it
        // meant.
        errors.push(_err('items[' + i + ']',
          item.type + ' with cmdName ' + JSON.stringify(item.cmdName) +
            ' does not immediately follow a touchZone with a matching cmdName',
          'items[' + i + '] deleted — orphaned ' + item.type));
        i++;
        continue;
      }
      nested.push(item);
      i++;
      continue;
    }

    const zone = Object.assign({}, item, { touchActionInput: undefined, touchActions: [] });
    nested.push(zone);
    i++;
    while (i < items.length
        && (items[i].type === 'touchAction' || items[i].type === 'touchActionInput')
        && items[i].cmd === zone.cmd) {
      const child = Object.assign({}, items[i]);
      // BOTH position and cmdName have to be right. Position alone used to
      // decide it: the loop condition compares cmd, but a saved file has no
      // cmd on either side (buildSaveableDwg strips it wherever a cmdName
      // exists), so that test was trivially true and whatever cmdName the
      // child carried was simply overwritten with the zone's. A touchAction
      // naming the wrong zone was therefore not an error at all — it was
      // silently re-pointed at whichever zone it happened to sit under, and
      // the zone it named got nothing. Two ways to say which zone a child
      // belongs to, only one of them honoured, and no warning when they
      // disagreed.
      //
      // Now a mismatch deletes that child and nothing else: the run keeps
      // going, so one mis-named action does not orphan the correctly-named
      // ones after it. A child with no cmdName at all counts as a mismatch —
      // the name is required, not optional-and-filled-in.
      const childCmdName = (typeof child.cmdName === 'string') ? child.cmdName : '';
      if (childCmdName !== zone.cmdName) {
        errors.push(_err('items[' + i + ']',
          child.type + ' has cmdName ' + JSON.stringify(child.cmdName) +
            ' but immediately follows the touchZone ' + JSON.stringify(zone.cmdName) +
            ' — a touchAction/touchActionInput must match the zone it follows on BOTH',
          'items[' + i + '] deleted — mismatched cmdName'));
        i++;
        continue;
      }
      if (child.type === 'touchActionInput') {
        if (zone.touchActionInput === undefined) {
          zone.touchActionInput = child;
        } else {
          errors.push(_err('items[' + i + ']',
            'touchActionInput with cmd ' + JSON.stringify(child.cmd) + ' is a duplicate — this touchZone already has one',
            'items[' + i + '] deleted — duplicate touchActionInput'));
        }
      } else {
        zone.touchActions.push(child);
      }
      i++;
    }
  }
  return _dropOrphanedTouchActionTargets(nested, errors);
}

/// Delete a touchZone's touchActionInput, an individual touchAction, or a
/// top-level hide/unhide/erase-by-index item, whose own idxName
/// reference (touchActionInput.idxName, touchAction.action[0].idxName, or
/// the hide/unhide/erase item's own idxName) doesn't match ANY top-level
/// DECLARING item's idxName in this dwg. Per direction: items are no
/// longer forced into "every touchZone after every plain item" order
/// (removed — see this file's own tasklog history for why that existed
/// and why it was too restrictive) — touchZones can now sit anywhere in
/// the list. The matching numeric idx is minted later, at preview/
/// wire-encode time (DwgDesignerVirtualDevice._resolveAutoCmdAndIdx's own
/// two-pass resolution mirrors this exact same check); here, at
/// file-load time, only the idxName STRING match is checked (no numeric
/// idx exists yet), so the user gets an immediate, visible fix message on
/// the Load Dwg — Validation Errors screen instead of a silent runtime
/// "no dwg item for this index" surprise later. An action with no idxName
/// at all (e.g. a cmd-targeted hide/unhide) has nothing to check and is
/// left untouched.
///
/// `topLevelIdxNames` (what "still legitimately declared" means) is built
/// from DECLARING items only — REFERENCE_ONLY_TYPES are excluded, since a
/// stray hide/unhide item's own idxName is a reference, not a
/// declaration, and would otherwise make an already-orphaned reference
/// elsewhere look like it still has something to point at.
/// @param {Array<object>} nested — touchZone-nested items array (each
///        touchZone carries .touchActions/.touchActionInput)
/// @param {Array} errors — validateAndRepairDwg's own errors array;
///                 entries pushed here show on the Validation Errors
///                 screen like any other repair.
/// @returns {Array<object>} items array — touchActions filtered,
///          touchActionInput cleared, and any orphaned top-level
///          hide/unhide/erase item dropped, where orphaned
function _dropOrphanedTouchActionTargets(nested, errors) {
  // Each declared idxName, and the EARLIEST array position declaring it.
  // Position matters as much as existence: encodeDwgStart emits the `|i`
  // placeholder that creates an idx at the position of the first item
  // carrying it, while hide/unhide/erase are in NEVER_DEFERRED_TYPES and go
  // out exactly where they sit. So a hide above its target emits |h`1 before
  // |i`1 and acts on an index the device has not been told about yet. An
  // index placeholder does not excuse that — it is the mechanism for fixing
  // it, by reserving the number early, which is why the EARLIEST declaration
  // is the one that counts rather than the item holding the real content.
  const topLevelIdxNames = new Set();
  const declaredIdxAt = new Map();
  nested.forEach((item, i) => {
    if (item.idxName && REFERENCE_ONLY_TYPES.indexOf(item.type) === -1) {
      topLevelIdxNames.add(item.idxName);
      if (!declaredIdxAt.has(item.idxName)) declaredIdxAt.set(item.idxName, i);
    }
  });
  nested.forEach((zone, zoneIdx) => {
    if (zone.type !== 'touchZone') return;
    if (zone.touchActionInput && zone.touchActionInput.idxName
        && !topLevelIdxNames.has(zone.touchActionInput.idxName)) {
      errors.push(_err('items[' + zoneIdx + '].touchActionInput',
        'idxName ' + JSON.stringify(zone.touchActionInput.idxName) + ' does not match any top-level item',
        'touchActionInput deleted — orphaned index reference'));
      zone.touchActionInput = undefined;
    }
    if (Array.isArray(zone.touchActions)) {
      zone.touchActions = zone.touchActions.filter((action) => {
        const target = action.type === 'touchAction' && Array.isArray(action.action) && action.action[0];
        if (target && target.idxName && !topLevelIdxNames.has(target.idxName)) {
          errors.push(_err('items[' + zoneIdx + '].touchActions',
            'touchAction targeting idxName ' + JSON.stringify(target.idxName) + ' does not match any top-level item',
            'touchAction deleted — orphaned index reference'));
          return false;
        }
        return true;
      });
    }
  });
  // Where each cmdName is DECLARED, and by what. hide/unhide/erase can target
  // a touchZone or an insertDwg by cmdName, and that reference was never
  // checked — only idxName was — so a hide against a drawing that was never
  // inserted just sat there pointing at nothing.
  const declaredCmd = new Map();
  nested.forEach((item, i) => {
    if ((item.type === 'touchZone' || item.type === 'insertDwg') && item.cmdName
        && !declaredCmd.has(item.cmdName)) {
      declaredCmd.set(item.cmdName, { at: i, type: item.type });
    }
  });

  return nested.filter((item, i) => {
    const isHideFamily = item.type === 'hide' || item.type === 'unhide' || item.type === 'erase';
    if (isHideFamily && item.idxName) {
      if (!topLevelIdxNames.has(item.idxName)) {
        errors.push(_err('items[' + i + ']',
          item.type + ' targeting idxName ' + JSON.stringify(item.idxName) + ' does not match any top-level item',
          'items[' + i + '] deleted — orphaned index reference'));
        return false;
      }
      const declAt = declaredIdxAt.get(item.idxName);
      if (declAt > i) {
        errors.push(_err('items[' + i + ']',
          item.type + ' targeting ' + JSON.stringify(item.idxName) + ' appears BEFORE anything ' +
            'that declares it (items[' + declAt + ']), so the index does not exist yet at that ' +
            'point in the drawing',
          'items[' + i + '] deleted — move it after items[' + declAt + '], or add an index ' +
            'placeholder for ' + JSON.stringify(item.idxName) + ' above it to reserve the index early'));
        return false;
      }
    }
    if (isHideFamily && item.cmdName) {
      const decl = declaredCmd.get(item.cmdName);
      if (!decl) {
        errors.push(_err('items[' + i + ']',
          item.type + ' targeting cmdName ' + JSON.stringify(item.cmdName) +
            ' does not match any touchZone or insertDwg in this drawing',
          'items[' + i + '] deleted — orphaned command reference'));
        return false;
      }
      // An inserted drawing is a special case: it is hidden by its own
      // loadCmd (|hd), which only means anything once the child has actually
      // been sent. Items go out in array order, so an insertDwg BELOW the
      // hide has not been inserted yet and there is nothing to hide. An
      // indexed item can legitimately be referenced before it is defined —
      // that is what the index placeholder exists for — but there is no
      // equivalent placeholder for a loadCmd, so this one really is an
      // ordering error rather than a forward reference.
      if (decl.type === 'insertDwg' && decl.at > i) {
        errors.push(_err('items[' + i + ']',
          item.type + ' targeting ' + JSON.stringify(item.cmdName) + ' appears BEFORE the ' +
            'insertDwg that declares it (items[' + decl.at + ']), so that drawing has not ' +
            'been inserted yet and there is nothing to ' + item.type,
          'items[' + i + '] deleted — move it after the insertDwg to keep it'));
        return false;
      }
    }
    return true;
  });
}

/// Inverse of nestAndValidateTouchActions() — expands a touchZone's
/// nested `.touchActionInput`/`.touchActions` back into flat siblings
/// immediately following it (touchActionInput first, then touchActions,
/// in their original order), matching the wire/file format every
/// consumer outside this project's own in-memory model expects (the
/// wire protocol, dwgWireEncoder.js's own item-by-item encoder, and any
/// saved/exported dwg JSON file all use the flat form). Safe to call on
/// already-flat items (no `.touchActionInput`/`.touchActions` fields) —
/// they pass through unchanged.
///
/// @param {Array<object>} items — flat OR nested
/// @returns {Array<object>} flat items array, safe to persist/encode
function flattenTouchActions(items) {
  const flat = [];
  for (const item of items) {
    if (item.type !== 'touchZone') {
      flat.push(item);
      continue;
    }
    const zone = Object.assign({}, item);
    const input = zone.touchActionInput;
    const actions = zone.touchActions;
    delete zone.touchActionInput;
    delete zone.touchActions;
    flat.push(zone);
    if (input) flat.push(input);
    if (Array.isArray(actions)) actions.forEach((a) => flat.push(a));
  }
  return flat;
}
