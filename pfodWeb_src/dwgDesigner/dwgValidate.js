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
 *     (background), refresh, version, items.
 *   - pfodWebDesigner/src/add-item.js:1770-1968 — the real per-item
 *     fields for every item type (xOffset/yOffset/xSize/ySize/radius/
 *     text/fontSize/align/bold/italic/underline/intValue/min/max/
 *     displayMin/displayMax/decimals/units/start/angle/cmd/cmdName/
 *     drawingName/filter/priority/centered, booleans stored as the
 *     strings 'true'/'false').
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
 *     colour is chosen), an integer 0-255, or a 6-digit hex string.
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
// 'string' | 'colour'. Booleans accept a real boolean OR the strings
// 'true'/'false' (matches add-item.js's own wire format — see
// drawingDataProcessor.js:599, 'filled === "true" || filled === true').
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
    { name: 'align',     kind: 'enum',    default: 'left', enumValues: DWG_ALIGN_VALUES },
    { name: 'bold',      kind: 'boolean', default: false },
    { name: 'italic',    kind: 'boolean', default: false },
    { name: 'underline', kind: 'boolean', default: false },
    { name: 'color',     kind: 'colour',  default: DWG_COLOUR_BLACKWHITE },
  ],
  value: [
    { name: 'xOffset',    kind: 'number',  default: 0 },
    { name: 'yOffset',    kind: 'number',  default: 0 },
    { name: 'text',       kind: 'string',  default: '' },
    { name: 'fontSize',   kind: 'number',  default: 0 },
    { name: 'align',      kind: 'enum',    default: 'left', enumValues: DWG_ALIGN_VALUES },
    { name: 'bold',       kind: 'boolean', default: false },
    { name: 'italic',     kind: 'boolean', default: false },
    { name: 'underline',  kind: 'boolean', default: false },
    { name: 'intValue',   kind: 'number',  default: 0 },
    { name: 'min',        kind: 'number',  default: 0 },
    { name: 'max',        kind: 'number',  default: 1 },
    { name: 'displayMin', kind: 'number',  default: 0 },
    { name: 'displayMax', kind: 'number',  default: 1 },
    { name: 'decimals',   kind: 'number',  default: 2 },
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
  index: [
    { name: 'idx', kind: 'number', default: 1 },
  ],
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

/// Validate + repair a colour value. -1 (BLACK_WHITE mode, add-item.js's
/// own default when no colour is chosen), an integer 0-255, or a 6-digit
/// hex string (with or without a leading '#') are all valid — matches
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
  if (typeof value === 'string' && /^#?[0-9A-Fa-f]{6}$/.test(value)) {
    return { value: value.replace(/^#/, '').toUpperCase(), error: false };
  }
  return {
    value: missingDefault, error: true,
    message: JSON.stringify(value) + ' is not a valid colour (expected -1 for BLACK_WHITE, an integer 0-255, or a 6-digit hex string)',
    fix: 'colour defaulted to ' + missingDefaultLabel,
  };
}

/// Cheap pre-check for "Load Dwg"/"Load All Dwgs in Dir and sub-Dirs":
/// a chosen file or scanned directory may contain other, unrelated
/// .pfodDwg_json/.json files (menu designs, config files, etc.) — this is
/// the discriminator for "is this actually a dwg file", checked BEFORE
/// running the full validate/repair pass, so a non-dwg file can be
/// rejected up front (with a visible message — see the Load Dwg call
/// site) rather than tripping a wall of unrelated validation errors.
/// Strict: only accepts the self-describing wrapper tag dwgLibrary.js's
/// buildSaveableDwg() writes (matches designer/state.js's own
/// importFromObject() convention — its EXPORT_FORMAT_TAG). A file
/// without "format": "pfodDwgDesigner" is rejected outright, even if it
/// otherwise has a name/items shape — no bare/unwrapped form is accepted.
///
/// @param {*} parsed — JSON.parse() result of a candidate file
/// @returns {boolean}
function looksLikeDwgFile(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  return parsed.format === DWG_EXPORT_FORMAT_TAG;
}

/// Validate + repair one loaded dwg object against the real, in-use
/// schema (see file header). Every problem found is fixed in place and
/// also recorded in `errors` so the caller can show it before saving.
/// Always returns a `dwg` safe to persist, even when `errors` is
/// non-empty.
///
/// @param {*} raw — JSON.parse() result of the picked file; any shape
/// @param {string} fileName — used as a fallback name (control.js:1104-1113)
/// @param {boolean} [isLoad=false] — true only for the two genuine "load
///        untrusted external data" call sites (Load Dwg / Load All Dwgs).
///        Every other caller is re-validating a dwg that was already
///        deduped the last time anything saved it — see
///        _dedupDeclaredIdxNames's own doc for what this changes.
/// @returns {{dwg: object, errors: Array<{field,message,fix}>}}
function validateAndRepairDwg(raw, fileName, isLoad) {
  const errors = [];
  const dwg = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? Object.assign({}, raw) : {};

  if (typeof dwg.name !== 'string' || !dwg.name) {
    const fromFile = (fileName || '')
      .replace(/\.dwg\.json$/i, '').replace(/\.json$/i, '').replace(/\s*\(\d+\)$/, '');
    dwg.name = fromFile || 'Dwg';
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

  // refresh (seconds, 0 = no auto-refresh) — optional, no listed error;
  // matches createNewDrawing's own permissive `refresh !== undefined ? refresh : 0`.
  if (typeof dwg.refresh !== 'number' || !isFinite(dwg.refresh) || dwg.refresh < 0) {
    dwg.refresh = 0;
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
    // An item with a bare numeric idx and no idxName just keeps that
    // idx as-is (DwgDesignerVirtualDevice._resolveAutoCmdAndIdx only
    // resolves/renumbers idx via idxName; it leaves a name-less idx
    // completely untouched).
    if (item.type === 'touchZone' || item.type === 'insertDwg') {
      const hasCmd = typeof fixed.cmd === 'string' && fixed.cmd.trim();
      const hasCmdName = typeof fixed.cmdName === 'string' && fixed.cmdName.trim();
      if (!hasCmd && !hasCmdName) {
        errors.push(_err('items[' + i + '].cmd', 'missing required property',
          'cmd defaulted to "c' + i + '", cmdName defaulted to "cmd_c' + i + '"'));
        fixed.cmd = 'c' + i;
        fixed.cmdName = 'cmd_c' + i;
      }
    }
    if (item.type === 'hide' || item.type === 'unhide' || item.type === 'erase') {
      const hasIdxName = typeof fixed.idxName === 'string' && fixed.idxName.trim();
      const hasCmdName = typeof fixed.cmdName === 'string' && fixed.cmdName.trim();
      if (!fixed.idx && !fixed.cmd && !hasIdxName && !hasCmdName) {
        errors.push(_err('items[' + i + ']', 'neither idx/cmd nor idxName/cmdName is set — nothing to ' + item.type,
          'cmd defaulted to "c' + i + '"'));
        fixed.cmd = 'c' + i;
      }
    }
    if (item.type === 'insertDwg' && (typeof fixed.drawingName !== 'string' || !fixed.drawingName)) {
      errors.push(_err('items[' + i + '].drawingName', 'missing required property',
        'drawingName left empty — this insertDwg item points at nothing until edited'));
      fixed.drawingName = '';
    }

    (DWG_ITEM_FIELD_SCHEMA[item.type] || []).forEach((f) => {
      const path = 'items[' + i + '].' + f.name;
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
      } else if (f.kind === 'boolean') {
        if (typeof fixed[f.name] === 'boolean') {
          // already valid
        } else if (fixed[f.name] === 'true' || fixed[f.name] === 'false') {
          // valid wire format (add-item.js stores booleans as these strings) — left as-is
        } else {
          fixed[f.name] = f.default;
        }
      } else if (f.kind === 'enum') {
        if (f.enumValues.indexOf(fixed[f.name]) === -1) fixed[f.name] = f.default;
      } else if (f.kind === 'string') {
        if (typeof fixed[f.name] !== 'string') fixed[f.name] = f.default;
      }
    });

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
/// @param {boolean} isLoad — true only for a genuine Load Dwg / Load All
///        Dwgs call (untrusted external data, where a duplicate is a
///        realistic, expected possibility worth silently repairing and
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
        errors.push(_err('items[' + i + ']',
          item.type + ' with cmd ' + JSON.stringify(item.cmd) + ' does not immediately follow a touchZone with a matching cmd',
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
      // Auto-correction on load: a touchAction/touchActionInput always
      // shares its zone's cmdName — never an independently-authored
      // name of its own (matches the "cmdName fallback only for
      // touchZone/insertDwg" rule: these two never invent/keep a
      // separate cmdName identity).
      if (zone.cmdName) child.cmdName = zone.cmdName;
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
  const topLevelIdxNames = new Set();
  nested.forEach((item) => {
    if (item.idxName && REFERENCE_ONLY_TYPES.indexOf(item.type) === -1) topLevelIdxNames.add(item.idxName);
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
  return nested.filter((item, i) => {
    if ((item.type === 'hide' || item.type === 'unhide' || item.type === 'erase')
        && item.idxName && !topLevelIdxNames.has(item.idxName)) {
      errors.push(_err('items[' + i + ']',
        item.type + ' targeting idxName ' + JSON.stringify(item.idxName) + ' does not match any top-level item',
        'items[' + i + '] deleted — orphaned index reference'));
      return false;
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
