/*
 * dwgDesigner/dwgLibrary.js
 *
 * DwgLibrary — minimal localStorage-backed store for the Dwg Library
 * concept documented in dwg-dataflow.md: a named, explicitly-saved dwg
 * entry independent of any one menu. Mirrors DesignerState's own
 * persistence convention exactly (see designer/state.js:855-857,
 * 1054-1078, 1341-1369 — STORAGE_PREFIX/LIST_KEY/save()/listNames()/
 * _addToList()), just under the `pfodDwgLibrary.v1.` prefix
 * dwg-dataflow.md already specifies (distinct from DesignerState's own
 * `pfodDesigner.v1.` menu-design storage — a dwg is a separate concept
 * from the menu tree that references it by name).
 *
 * First consumer: dwgDesigner/dwgControlsPanelUI.js's Load Dwg flow.
 * DesignerState.listDwgNames() (state.js) delegates to listNames() here.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DWG_LIBRARY_STORAGE_PREFIX = 'pfodDwgLibrary.v1.';
const DWG_LIBRARY_LIST_KEY       = 'pfodDwgLibrary.v1.list';

// Self-describing wrapper tag/schema for saved & exported dwg JSON —
// mirrors designer/state.js's own EXPORT_FORMAT_TAG/DESIGNER_STATE_SCHEMA_VERSION
// convention ('pfodDesigner'/DESIGNER_STATE_SCHEMA_VERSION) so a dwg file
// is self-identifying the same way a menu design export is.
const DWG_EXPORT_FORMAT_TAG = 'pfodDwgDesigner';
const DWG_EXPORT_SCHEMA_VERSION = 1;

/// Strip the REGENERABLE wire values (cmd, idx, and touchActionInput's
/// own textIdx) from a single item, wherever it has a stable name to
/// regenerate them from (cmdName / idxName). Recurses into a
/// touchAction's own nested `.action[0]` sub-item (e.g. a line/label/
/// hide the touchAction draws/performs) — that sub-item is a full item
/// in its own right and can carry its own idx/idxName exactly like a
/// top-level one (see test.json's real saved shape: a touchAction's
/// action[0] line item has its own idx/idxName pair), so it needs the
/// same stripping, not just the touchAction's own cmd/cmdName.
/// @param {object} item
/// @returns {object} shallow-copied item with regenerable fields removed
function _stripItemWireFields(item) {
  const out = Object.assign({}, item);
  if (out.cmdName) delete out.cmd;
  if (out.idxName) {
    delete out.idx;
    delete out.textIdx; // touchActionInput's own idx-target field
  }
  if (out.type === 'touchAction' && Array.isArray(out.action) && out.action[0]) {
    out.action = [_stripItemWireFields(out.action[0])];
  }
  return out;
}

/// Strip the REGENERABLE wire values from every item in a flat items
/// array — per direction: "the idx: field is a convenience for the
/// preview, and can be omitted in the export and regenerated on the
/// load, same for the cmd." The real, authoritative value only ever
/// gets minted at wire-encode time
/// (DwgDesignerVirtualDevice._resolveAutoCmdAndIdx, dwgDesignerAdapter.js
/// — mimics the real embedded pfodAutoCmd/pfodAutoIdx's own global
/// counters, guaranteeing uniqueness across a whole composed tree of
/// insertDwg'd dwgs, which a single dwg's own stored value never could).
/// Keeping a stale cmd/idx in the saved/exported JSON would be actively
/// misleading — it was only ever whatever this device last happened to
/// assign, not a value anything should rely on. An item with NO
/// cmdName/idxName (hand-authored or legacy data with no name to
/// regenerate from) keeps its raw cmd/idx untouched — there's nothing to
/// regenerate it FROM.
/// @param {Array<object>} items
/// @returns {Array<object>} new array of shallow-copied items
function _stripRegenerableWireFields(items) {
  return items.map(_stripItemWireFields);
}

/// Build the self-describing, saveable representation of a dwg — used by
/// BOTH DwgLibrary.save() (localStorage) and any file-export path
/// (Unload Dwg's download, a future Export Dwg), so every place a dwg
/// gets serialized produces the exact same shape:
///   { format, schema, savedAt, name, js_ver, x, y, color, dwgRefresh_ms, items }
/// dwgRefresh_ms is MILLISECONDS — the same unit the wire start header and
/// the generated sketch's own dwgRefresh_ms member use, so no conversion
/// happens on any emit path. The Dwg Controls Panel is the only place that
/// works in seconds (its own input field); it converts on read and write.
/// format/schema/savedAt/js_ver are ALWAYS regenerated fresh here — they
/// describe THIS save, not whatever the dwg happened to carry in from a
/// previous load. (A separate `version` field once existed for the same
/// "describes this save" reason, but savedAt's own ISO timestamp already
/// serves that purpose — nothing ever read version back — so it was
/// dropped.) items is flattened back to the plain sibling form
/// (dwgValidate.js's flattenTouchActions) since this is the on-disk/wire
/// shape, not the internal nested one, then has its regenerable cmd/idx/
/// textIdx values stripped wherever a cmdName/idxName exists to
/// regenerate them from later.
/// @param {object} dwg
/// @returns {object}
function buildSaveableDwg(dwg) {
  return {
    format: DWG_EXPORT_FORMAT_TAG,
    schema: DWG_EXPORT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    name: dwg.name,
    description: (typeof dwg.description === 'string') ? dwg.description : '',
    js_ver: window.JS_VERSION,
    x: dwg.x,
    y: dwg.y,
    color: dwg.color,
    dwgRefresh_ms: dwg.dwgRefresh_ms,
    items: _stripRegenerableWireFields(flattenTouchActions(dwg.items || [])),
  };
}

const DwgLibrary = (() => {

  /// All dwg names persisted on this machine, in insertion order.
  /// Returns [] when localStorage is unavailable or no list has been
  /// written yet. Mirrors DesignerState.listNames() exactly.
  function listNames() {
    try {
      const raw = localStorage.getItem(DWG_LIBRARY_LIST_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.slice();
    } catch (_) { return []; }
  }

  /// True if a dwg with this exact name is already in the library.
  function exists(name) {
    return listNames().includes(name);
  }

  /// Read + parse one library entry, returning it in the nested internal
  /// shape (storage always holds the FLAT item form — see save()). null on
  /// any failure; callers already treat that the same as "not found".
  ///
  /// Every read runs the FULL validateAndRepairDwg, and a stored dwg that
  /// needs ANY repair is logged and DELETED rather than repaired:
  ///
  ///   - Browser storage is deliberately not migrated. A dwg saved before the
  ///     "refresh" -> "dwgRefresh_ms" rename has no usable refresh value, and
  ///     the wire encoder's own guard threw on it — from _buildListHtml,
  ///     which sizes every row, so one such entry took out the whole Dwg
  ///     Controls Panel instead of just its own line.
  ///   - Not every non-conformance is that loud. A stored dwg still holding
  ///     the old string booleans ("filled": "true") does not throw: _bool()
  ///     reads it as false and the shape silently draws unfilled. A stored
  ///     RRGGBB colour still encodes here but generates BLACK in a sketch.
  ///     Deleting is the only outcome that is impossible to miss.
  ///   - Nothing legitimate reaches storage needing repair. Every write path
  ///     goes through validateAndRepairDwg (file loads) or builds items in
  ///     the editor and flattens them via buildSaveableDwg, so orphaned
  ///     touchActions, duplicate idxNames and bad fields are all already
  ///     prevented. A stored dwg that fails here is corrupt or pre-dates a
  ///     format change — in both cases repairing it in place would just hide
  ///     the problem behind a console line nobody reads.
  ///
  /// Recovery for the user is the file, not the browser: re-loading the same
  /// dwg from its own .pfodDwg_json DOES migrate and repair, then saves clean.
  ///
  /// @param {string} name
  /// @returns {object|null} the validated, nested dwg; null if missing,
  ///          unreadable, or discarded as non-conformant
  function get(name) {
    try {
      const raw = localStorage.getItem(DWG_LIBRARY_STORAGE_PREFIX + name);
      if (!raw) return null;
      const stored = JSON.parse(raw);

      let result;
      try {
        // isLoad=false: this is not untrusted external data, it is data this
        // app wrote. A duplicate idxName here throws rather than being
        // silently merged, and that throw lands in the catch below — which is
        // what we want, since it means something upstream wrote a dwg it
        // should not have been able to.
        result = validateAndRepairDwg(stored, name, false);
      } catch (err) {
        _discardUnusable(name, 'could not be validated (' + err.message + ')', stored);
        return null;
      }
      if (result.errors.length > 0) {
        _discardUnusable(name, 'does not match the current dwg format', stored, result.errors);
        return null;
      }
      return result.dwg;
    } catch (_) { return null; }
  }

  /// Log a non-conformant stored dwg loudly, with its content, and remove it.
  /// Console rather than a dialog: get() is called while rendering (once per
  /// row of the dwg list), so it has no UI to interrupt, and the stored
  /// content is dumped so the user can recover anything they need from it.
  /// @param {string} name
  /// @param {string} reason — completes "dwg <name> ..."
  /// @param {object} stored — the raw parsed content being discarded
  /// @param {Array} [errors] — validateAndRepairDwg's own findings, when it
  ///        got far enough to produce any
  function _discardUnusable(name, reason, stored, errors) {
    console.error('[DwgLibrary] dwg "' + name + '" ' + reason + ', so it has been ' +
      'DISCARDED from browser storage.\n' +
      'Dwgs already saved in the browser are not migrated across format changes. ' +
      'Re-load this dwg from its own .pfodDwg_json file — the file-load path does ' +
      'migrate and repair — or recreate it.',
      errors && errors.length ? { reason: errors, discarded: stored } : { discarded: stored });
    remove(name);
  }

  /// Persist a dwg under dwg.name, adding it to the index list. Storage
  /// always holds the self-describing, FLAT wrapper form buildSaveableDwg()
  /// produces (touchZone followed by its touchActionInput/touchActions as
  /// plain siblings) regardless of whether the caller passed flat or
  /// nested items — matches the wire/file format every other consumer
  /// (dwgWireEncoder.js, exported dwg JSON) expects; get() re-nests on
  /// the way back out. Quota exceeded / private-browsing failures are
  /// logged, not thrown — same tolerance as DesignerState.save().
  function save(dwg) {
    _writeToStorage(dwg, true);
  }

  /// Same as save() — same storage write, readable back via get() the
  /// same way — EXCEPT it never adds the name to the visible index list
  /// (_addToList), so it never appears in DesignerState.listDwgNames()/
  /// the main dwg list UI. For internal-only entries the panel itself
  /// manages (dwgControlsPanelUI.js's CREATE_DWG_DRAFT_NAME/
  /// EDIT_DWG_DRAFT_NAME/ADD_ITEM_DRAFT_NAME temp-preview drafts, and
  /// Remove's own "<name>_undo" snapshot) — a name
  /// that's real to look up but was never meant to be a browsable
  /// library entry a user could navigate into. Using plain save() for
  /// these was the actual bug behind "_undo"/"_undo_undo" names
  /// appearing: the undo snapshot sat in the visible index long enough
  /// (by design — it's meant to persist until Undo Delete or the next
  /// Remove) that a user could open IT via Edit and remove an item from
  /// it, which then saved ITS OWN "<name>_undo_undo" snapshot the exact
  /// same way. Callers needing to check whether a hidden entry currently
  /// exists must use get(name) !== null, NOT exists()/listNames() —
  /// those only ever reflect the visible index.
  /// @param {object} dwg
  function saveHidden(dwg) {
    _writeToStorage(dwg, false);
  }

  /// Shared write path for save()/saveHidden().
  /// @param {object} dwg
  /// @param {boolean} addToIndex
  function _writeToStorage(dwg, addToIndex) {
    if (!dwg || typeof dwg.name !== 'string' || !dwg.name) {
      throw new Error('[DwgLibrary] save requires a dwg with a non-empty name');
    }
    try {
      const toSave = buildSaveableDwg(dwg);
      localStorage.setItem(DWG_LIBRARY_STORAGE_PREFIX + dwg.name, JSON.stringify(toSave));
      if (addToIndex) _addToList(dwg.name);
    } catch (err) {
      console.warn('[DwgLibrary] save failed:', err.message);
    }
  }

  /// Replace spaces and any other character outside [A-Za-z0-9_] with
  /// '_' — a dwg name is used directly as a download filename
  /// (dwg.name + '.pfodDwg_json') and as a pfod wire loadCmd identifier
  /// (DWG_PREVIEW_KEY_PREFIX + dwg.name, dwgWireEncoder.js), so it must
  /// stay filename/identifier-safe. Matches dwgArduinoExport.js's own
  /// _identifier() charset exactly (that one strips instead of
  /// replacing, for a C++ identifier; this replaces, so two names that
  /// only differ by punctuation don't collapse into the exact same
  /// string — e.g. "test 1" and "test!1" both become "test_1" either
  /// way, but nextFreeName's own dedup loop below still keeps them
  /// distinct entries).
  /// @param {string} base
  /// @returns {string}
  function _sanitizeDwgName(base) {
    return String(base || '').replace(/[^A-Za-z0-9_]/g, '_');
  }

  /// First unused "<base>", "<base>_1", "<base>_2", ... name — same
  /// suffix pattern DesignerState._nextDefaultName() uses for menu
  /// designs (state.js:1387-1395). Used to dedup a loaded dwg's name
  /// against the library instead of silently overwriting an existing
  /// entry (unlike pfodWebDesigner's server.js:3332-3345). Sanitizes
  /// `base` first (see _sanitizeDwgName) — the one shared chokepoint
  /// every "a new/renamed dwg name is about to be assigned" caller in
  /// this app already goes through (Create Dwg, Rename, Load Dwg, Copy
  /// Dwg, the Choose-a-Drawing screen's own file load).
  function nextFreeName(base) {
    const safeBase = _sanitizeDwgName(base);
    if (!exists(safeBase)) return safeBase;
    const taken = new Set(listNames());
    for (let n = 1; ; n++) {
      const candidate = safeBase + '_' + n;
      if (!taken.has(candidate)) return candidate;
    }
  }

  /// Append name to the index list if not already present.
  function _addToList(name) {
    try {
      const list = listNames();
      if (!list.includes(name)) {
        list.push(name);
        localStorage.setItem(DWG_LIBRARY_LIST_KEY, JSON.stringify(list));
      }
    } catch (_) {}
  }

  /// Delete a dwg entry and remove it from the index list. No-op (not an
  /// error) if the name isn't present. Quota/private-browsing failures
  /// are logged, not thrown — same tolerance as save().
  function remove(name) {
    try {
      localStorage.removeItem(DWG_LIBRARY_STORAGE_PREFIX + name);
      const list = listNames().filter((n) => n !== name);
      localStorage.setItem(DWG_LIBRARY_LIST_KEY, JSON.stringify(list));
    } catch (err) {
      console.warn('[DwgLibrary] remove failed:', err.message);
    }
  }

  return Object.freeze({ listNames, exists, get, save, saveHidden, nextFreeName, remove });
})();
