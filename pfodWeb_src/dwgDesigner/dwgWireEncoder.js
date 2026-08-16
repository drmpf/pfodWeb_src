/*
 * dwgDesigner/dwgWireEncoder.js
 *
 * Pure JS-object -> pfod wire-text encoder for a DwgLibrary dwg
 * ({name,x,y,color,refresh,items:[...]}) and for the single-dwg-item
 * main menu the Dwg Controls Panel's preview embeds it in. This is the
 * byte-for-byte INVERSE of webTranslator.js's translateRaw* parsers (and
 * pfodMenuParser.js's dwg-menu-item parsing) — every wire shape produced
 * here is verified against those parsers' own grammar, not guessed.
 *
 * No state lives here — every function is a pure (data in, wire string
 * out) transform. DwgDesignerVirtualDevice (dwgDesigner/dwgDesignerAdapter.js)
 * owns the "which dwg is selected" / "what version have we last sent"
 * state and calls into this module to actually build the response text.
 *
 * Scoping notes (deliberate simplifications, not oversights):
 *   - DwgLibrary stores booleans (filled/centered/rounded/bold/italic/
 *     underline/etc.) as either a real JS boolean OR the strings "true"/
 *     "false" (dwgDesigner/dwgValidate.js's own schema comment — matches
 *     add-item.js's own wire format). Every boolean field read here goes
 *     through _bool() rather than raw truthiness, since the string
 *     "false" is truthy in JS.
 *   - rectangle/line/circle/arc/label/value/touchZone items DO carry
 *     their own optional `idx` when marked `indexed:true` (referenced
 *     later by hide/unhide/erase-by-idx) — every per-type encoder below
 *     includes it via _fields()'s idx parameter when present.
 *   - The wire protocol has separate `|hd`/`|uhd`/`|ed` prefixes for
 *     hiding/unhiding/erasing a CHILD drawing (by loadCmd) vs `|h`/`|uh`/
 *     `|e` for hiding a plain item (by idx/cmd) — DwgLibrary's schema
 *     doesn't carry a field distinguishing the two cases directly on a
 *     hide/unhide/erase item, so encodeHideUnhideErase branches on
 *     whether `drawingName` was resolved onto the item (see that
 *     function's own doc, and dwgDesignerAdapter.js's
 *     _resolveItemAutoCmdAndIdx / dwgControlsPanelUI.js's Show
 *     press-and-hold, both of which set it when the target is an
 *     insertDwg).
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

// Namespace prefix every dwg-preview loadCmd is wrapped in — the shared
// DrawingManager is keyed globally by drawing name across the whole app,
// so a previewed (or nested insertDwg child) dwg that happens to share a
// name with a live menu's own embedded dwg must not overwrite that menu
// dwg's real data. Shared between dwgControlsPanelUI.js (building the
// initial previewKey) and DwgDesignerVirtualDevice (resolving an incoming
// loadCmd request back to a DwgLibrary name, and encodeInsertDwg below,
// which must apply the same prefix to a nested child's own loadCmd).
window.DWG_PREVIEW_KEY_PREFIX = '__dcpPreview__';

const DwgWireEncoder = (() => {

  /// Encode a dwg colour value (-1 BLACK_WHITE, 0-255 decimal, or a hex
  /// string) as a wire <colour> field. Empty string means "no colour" —
  /// parseDwgColour (webTranslator.js:37-41) reads that back as -1.
  function _colour(color) {
    if (color === -1 || color === undefined || color === null) return '';
    if (typeof color === 'string') return color.toUpperCase();
    return String(color);
  }

  /// Field-list wire fragment: an optional `` `idx `` prefix (when the
  /// item carries one) then a leading `~` and the given fields joined by
  /// `~` — matches every translateRaw* parser's idx/no-idx branches
  /// (content.startsWith('`') vs content.split('~') dropping the leading
  /// empty string).
  function _fields(idx, fields) {
    const idxPart = (idx !== undefined && idx !== null) ? '`' + idx : '';
    return idxPart + '~' + fields.join('~');
  }

  /// DwgLibrary booleans are a real JS boolean OR the strings "true"/
  /// "false" — see this file's own header comment. Never use raw
  /// truthiness on one of these fields directly.
  function _bool(v) {
    return v === true || v === 'true';
  }

  /// Inline formatting tags a label/value's own bold/italic/underline/
  /// fontSize fields need prepended to their text content — DwgLibrary
  /// tracks these as separate item fields, but the wire protocol (and
  /// redraw.js's parsePfodInlineSegments, which renders them) only knows
  /// them as inline <b>/<i>/<u>/<+N>/<-N> tags inside the text itself;
  /// there is no separate wire slot for them on a label/value item.
  /// @param {object} item
  /// @param {boolean} [includeColor] — also prepend a bare text-colour
  ///        tag (`<N>`/`<RRGGBB>`) from item.color, when set and not -1/
  ///        BLACK_WHITE (skipped for BLACK_WHITE — no tag needed, that's
  ///        the assumed default rendering, same convention _colour()
  ///        itself uses). label/value never pass this — their own
  ///        colour already has a dedicated wire slot (encodeLabel/
  ///        encodeValue's own `_colour(item.color)` field), so inlining
  ///        it too would be a duplicate, conflicting instruction.
  ///        touchActionInput has no such slot (see encodeTouchActionInput)
  ///        so its own text colour can ONLY ever be inline.
  function _inlineFormat(item, includeColor) {
    let out = '';
    if (includeColor && item.color !== -1 && item.color !== undefined) {
      out += '<' + _colour(item.color) + '>';
    }
    if (item.fontSize > 0) out += '<+' + item.fontSize + '>';
    if (item.fontSize < 0) out += '<' + item.fontSize + '>';
    if (_bool(item.bold)) out += '<b>';
    if (_bool(item.italic)) out += '<i>';
    if (_bool(item.underline)) out += '<u>';
    return out;
  }

  /// Map a touchAction target item's own xOffset/yOffset (or Value's
  /// intValue) to its wire form: the literal strings "COL"/"ROW" — set
  /// by the touchAction editor's own COL/ROW position mode, meaning
  /// "wherever the touch landed" rather than a fixed number (see
  /// dwgControlsPanelUI.js's _renderTouchActionEditorScreen doc) — become
  /// the bare single-character sentinels 'c'/'r' the wire protocol uses
  /// for exactly that, recognized ONLY within a touchAction's own nested
  /// item (webTranslator.js's translateRaw* functions all gate this on
  /// their own isTouchAction param — a plain top-level item's xOffset/
  /// yOffset is always a real number). Anything else (a real number)
  /// passes through unchanged.
  /// @param {number|string} value
  /// @returns {number|string}
  function _offsetField(value) {
    return value === 'COL' ? 'c' : (value === 'ROW' ? 'r' : value);
  }

  // ── Per-item-type encoders — one per row of the wire-grammar table,
  //    each the exact inverse of its translateRaw* counterpart in
  //    webTranslator.js. `item` is DwgLibrary's own JS-item shape. ──

  function encodeRectangle(item) {
    let prefix = _bool(item.filled) ? 'R' : 'r';
    if (_bool(item.rounded)) prefix += prefix[0];
    if (_bool(item.centered)) prefix += 'c';
    return '|' + prefix + _fields(item.idx, [
      _colour(item.color), item.xSize, item.ySize, _offsetField(item.xOffset), _offsetField(item.yOffset),
    ]);
  }

  function encodeLine(item) {
    return '|l' + _fields(item.idx, [
      _colour(item.color), item.xSize, item.ySize, _offsetField(item.xOffset), _offsetField(item.yOffset),
    ]);
  }

  function encodeCircle(item) {
    const prefix = _bool(item.filled) ? 'C' : 'c';
    return '|' + prefix + _fields(item.idx, [
      _colour(item.color), item.radius, _offsetField(item.xOffset), _offsetField(item.yOffset),
    ]);
  }

  function encodeArc(item) {
    const prefix = _bool(item.filled) ? 'A' : 'a';
    return '|' + prefix + _fields(item.idx, [
      _colour(item.color), item.angle, item.start, item.radius, _offsetField(item.xOffset), _offsetField(item.yOffset),
    ]);
  }

  /// Resolve a label/value item's align field to its single-char wire
  /// code. Throws rather than falling back to a default: dwgValidate.js's
  /// enum validation (DWG_ALIGN_VALUES) already guarantees align is
  /// always one of 'left'/'center'/'right' by the time an item reaches
  /// here (via validateAndRepairDwg/DwgLibrary.get()) — anything else
  /// means that guarantee was bypassed somewhere, which is a real bug
  /// worth surfacing loudly, not silently drawing as center-aligned.
  /// @param {string} align
  /// @returns {string} 'L' | 'C' | 'R'
  function _alignCode(align) {
    const alignMap = { left: 'L', center: 'C', right: 'R' };
    const code = alignMap[align];
    if (!code) {
      throw new Error('[DwgWireEncoder] unrecognized align value ' + JSON.stringify(align) +
        ' — dwgValidate.js should already guarantee left/center/right');
    }
    return code;
  }

  /// Port of pfodWebDesigner/src/displayTextUtils.js's printFloatDecimals
  /// (itself a JS port of the real embedded C++ printFloatDecimals) —
  /// rounds `f` to `decPlaces` decimal places; a NEGATIVE decPlaces
  /// rounds to the left of the decimal point instead (e.g. decPlaces=-2
  /// rounds 1234 to 1200), matching the real device's own formatting so
  /// a label's optional value/decimals/units suffix (see encodeLabel)
  /// previews exactly what the compiled sketch would actually display.
  /// @param {number} f
  /// @param {number} decPlaces
  /// @returns {string}
  function _printFloatDecimals(f, decPlaces) {
    let isNegative = false;
    if (f < 0) { f = -f; isNegative = true; }
    let result;
    if (decPlaces <= 0) {
      let iValue = Math.floor(f);
      if ((f - iValue) !== 0) iValue = Math.floor(f + 0.5);
      if (decPlaces === 0) {
        result = iValue.toString();
      } else {
        let divider = 1;
        for (let i = 0; i < (-decPlaces) && (divider < iValue); i++) divider = divider * 10;
        if (divider > iValue) divider = Math.floor(divider / 10);
        let idValue = Math.floor(iValue / divider) * divider;
        if ((idValue - iValue) !== 0) {
          iValue = iValue + Math.floor(divider / 2);
          iValue = Math.floor(iValue / divider);
          idValue = iValue * divider;
        }
        result = idValue.toString();
      }
    } else {
      result = f.toFixed(decPlaces);
    }
    return isNegative ? '-' + result : result;
  }

  /// Port of pfodWebDesigner/src/displayTextUtils.js's
  /// addFormattedValueToText — a 'label' item's own value/decimals/units
  /// are an OPTIONAL, unschema'd authoring convenience (dwgValidate.js's
  /// DWG_ITEM_FIELD_SCHEMA deliberately excludes them — a 'number'-kind
  /// schema field always gets a default-filled-in value, which would
  /// force every label to carry a phantom value/suffix even when the
  /// user never set one). There is no separate wire slot for them either
  /// (webTranslator.js's |t grammar is colour~text~... only) — matches
  /// the real embedded dwgs library's label().value()/.decimals()/
  /// .units() builder, which bakes the formatted suffix into the SAME
  /// text the device eventually transmits, not a separate wire field.
  /// @param {string} text
  /// @param {object} item
  /// @returns {string}
  function _appendFormattedValue(text, item) {
    if (item.value === undefined || item.value === null || item.value === '') return text;
    const decimals = (item.decimals !== undefined && item.decimals !== null) ? parseInt(item.decimals, 10) : 2;
    const units = item.units || '';
    return text + _printFloatDecimals(parseFloat(item.value), decimals) + units;
  }

  function encodeLabel(item) {
    const alignCode = _alignCode(item.align);
    const text = _appendFormattedValue(item.text, item);
    return '|t' + _fields(item.idx, [
      _colour(item.color), _inlineFormat(item) + text, _offsetField(item.xOffset), _offsetField(item.yOffset), alignCode,
    ]);
  }

  function encodeValue(item) {
    const alignCode = _alignCode(item.align);
    const idxPart = (item.idx !== undefined && item.idx !== null) ? '`' + item.idx : '';
    return '|v' + idxPart + '~' + [_colour(item.color), _inlineFormat(item) + item.text, _offsetField(item.xOffset), _offsetField(item.yOffset)].join('~') +
      '`' + [_offsetField(item.intValue), item.units].join('~') +
      '`' + item.max +
      '`' + [item.min, item.displayMax, item.displayMin].join('~') +
      '`' + [item.decimals, alignCode].join('~');
  }

  function encodeTouchZone(item) {
    const prefix = _bool(item.centered) ? 'xc' : 'x';
    let out = '|' + prefix + _fields(item.idx, [item.cmd, item.xSize, item.ySize, item.xOffset, item.yOffset]);
    if (item.filter) out += '`' + item.filter;
    return out;
  }

  /// Deliberate empty 3rd field, per webTranslator.js:1067-1078's own
  /// "must have exactly 4 parameters (loadcmd, empty, colOffset,
  /// rowOffset)" comment. The child's own loadCmd is namespaced with
  /// DWG_PREVIEW_KEY_PREFIX too — see that constant's own comment.
  function encodeInsertDwg(item) {
    return '|d~' + window.DWG_PREVIEW_KEY_PREFIX + item.drawingName + '~~' + item.xOffset + '~' + item.yOffset;
  }

  /// touchActionInput's own wire grammar (|XI~cmd~prompt[`textIdx]) has no
  /// dedicated slot for text colour or font size at all — unlike label/
  /// value, which get a real `~color~` field. Both are instead baked as
  /// inline formatting tags directly into the prompt text (matching the
  /// same convention pfodApp's own dialog renderer already parses
  /// inline — see _inlineFormat's own doc): backgroundColor still gets
  /// the dedicated `<bg N>` tag (parsed OUT of the prompt into its own
  /// field by webTranslator.js's translateRawTouchActionInput, since it
  /// controls the dialog's own background, not a text span within it),
  /// while color/fontSize are left in the prompt text for
  /// pfodSetFormattedText to render inline when the dialog displays it.
  function encodeTouchActionInput(item) {
    const bg = (item.backgroundColor !== undefined && item.backgroundColor !== -1) ? '<bg ' + _colour(item.backgroundColor) + '>' : '';
    const inline = _inlineFormat(item, true);
    let out = '|XI~' + item.cmd + '~' + bg + inline + item.prompt;
    if (item.textIdx !== undefined && item.textIdx !== null) out += '`' + item.textIdx;
    return out;
  }

  /// Recursively encodes item.action[0] (always a 1-element array — see
  /// webTranslator.js:1214-1219) with its own leading `|` stripped, per
  /// the |X~cmd~<primitive-without-leading-|> grammar.
  function encodeTouchAction(item) {
    const primitive = encodeItem(item.action[0]);
    return '|X~' + item.cmd + '~' + primitive.substring(1);
  }

  function encodeHideUnhideErase(item) {
    // Hiding/unhiding/erasing an INSERTED DRAWING is a distinct wire form
    // (|hd/|uhd/|ed, targeted by loadCmd) from hiding a plain item/
    // touchZone (|h/|uh/|e, targeted by idx or an auto cmd) — matches
    // webTranslator.js's own translateRawHideDwg/UnhideDwg/EraseDwg
    // grammar exactly. An insertDwg's own |d... wire fragment never
    // transmits a cmd at all (see encodeInsertDwg's own doc), so a hide/
    // unhide/erase item targeting one carries `drawingName` (set by
    // dwgDesignerAdapter.js's _resolveItemAutoCmdAndIdx, or directly by
    // dwgControlsPanelUI.js's Show press-and-hold — see either's own
    // doc) instead of a resolved idx/cmd.
    if (item.drawingName) {
      const dwgPrefix = item.type === 'hide' ? 'hd' : (item.type === 'unhide' ? 'uhd' : 'ed');
      return '|' + dwgPrefix + '~' + window.DWG_PREVIEW_KEY_PREFIX + item.drawingName;
    }
    const prefix = item.type === 'hide' ? 'h' : (item.type === 'unhide' ? 'uh' : 'e');
    const target = (item.idx !== undefined && item.idx !== null) ? '`' + item.idx : '~' + item.cmd;
    return '|' + prefix + target;
  }

  function encodePushPopZero(item) {
    if (item.type === 'popZero') return '|z';
    return '|z~' + item.x + '~' + item.y + '~' + item.scale;
  }

  function encodeIndex(item) {
    return '|i`' + item.idx;
  }

  /// Dispatch a single DwgLibrary item to its encoder. Throws on an
  /// unrecognized type — matches dwgValidate.js's own DWG_ITEM_TYPES
  /// enum; a dwg that passed validation can never reach here with a bad
  /// type.
  function encodeItem(item) {
    switch (item.type) {
      case 'rectangle': return encodeRectangle(item);
      case 'line': return encodeLine(item);
      case 'circle': return encodeCircle(item);
      case 'arc': return encodeArc(item);
      case 'label': return encodeLabel(item);
      case 'value': return encodeValue(item);
      case 'touchZone': return encodeTouchZone(item);
      case 'insertDwg': return encodeInsertDwg(item);
      case 'touchActionInput': return encodeTouchActionInput(item);
      case 'touchAction': return encodeTouchAction(item);
      case 'hide': case 'unhide': case 'erase': return encodeHideUnhideErase(item);
      case 'pushZero': case 'popZero': return encodePushPopZero(item);
      case 'index': return encodeIndex(item);
      default:
        throw new Error('[DwgWireEncoder] encodeItem: unrecognized item type "' + item.type + '"');
    }
  }

  // Item types that never get the placeholder-then-real-value treatment
  // below, even when they carry an idx — mirrors pfodWebDesigner's real
  // generated code (arduinoExport.js's sendFullDrawing()/sendIndexedItems()):
  //   - hide/unhide/erase: explicitly exempted there ("skip index here as
  //     was sent in sendFullDrawing") — they're single-shot ACTIONS on an
  //     already-established item, not a redrawable value with a "real"
  //     form to defer.
  //   - index: IS the placeholder mechanism itself — nothing to defer.
  //   - touchAction/touchActionInput: always sent as one atomic wire
  //     fragment (their own cmd-keyed |X.../|XI... encoding); their
  //     nested action's own idx (if any) is just content inside that one
  //     fragment, not a separate deferrable item.
  //   - pushZero/popZero: establish/pop the transform stack a later
  //     item's offset is measured against — deferring one to the end
  //     would silently break every other item's positioning that relied
  //     on it being applied in sequence.
  //   - insertDwg: drawingDataProcessor.js itself actively nulls out any
  //     idx it finds on an insertDwg item ("insertDwg should never be
  //     indexed") — so it can never legitimately reach here with one.
  const NEVER_DEFERRED_TYPES = Object.freeze([
    'hide', 'unhide', 'erase', 'index', 'touchAction', 'touchActionInput',
    'pushZero', 'popZero', 'insertDwg',
  ]);

  /// Build a full pfod "start" drawing response — {+colour`x`y`refresh~version|item...}.
  /// dwg.items may be in this project's internal NESTED form (a
  /// touchZone's own .touchActionInput/.touchActions holding its
  /// children — see dwgValidate.js's nestAndValidateTouchActions()/
  /// flattenTouchActions()) since that's what DwgLibrary.get() returns;
  /// the wire protocol itself only ever has the flat sibling form, so
  /// flattenTouchActions() runs first (a no-op if items are already flat).
  ///
  /// Follows pfodWebDesigner's real generated-code send sequence exactly
  /// (arduinoExport.js's sendFullDrawing()/sendIndexedItems() —
  /// "sendIndexedItems(); // update indexed items with their real
  /// values"), not just for parity: pfod messages are capped at 1023
  /// bytes, and the whole point of previewing is to show the user the
  /// ACTUAL message shape/size their generated sketch will send. As each
  /// indexed item (has `.idx`, not one of NEVER_DEFERRED_TYPES) is met in
  /// item order, an `|i\`idx` index placeholder is sent in its place —
  /// holding that item's position/pushZero-scale context — and the real
  /// item is queued; every OTHER item (not indexed, or one of the never-
  /// deferred types above) is sent immediately, in place, as normal.
  /// Once every item has been walked, the queued real items are sent —
  /// each still carrying its own idx, so on the wire this auto-updates
  /// the matching placeholder in place, keeping that placeholder's own
  /// pushZero/scale context while replacing its content with the real
  /// item. Deduped by idx (mirrors arduinoExport.js's own idxList/
  /// indexList dedup) so a repeated idx only gets ONE placeholder, not
  /// one per occurrence — matches "items are usually indexed so they can
  /// be updated, localizing update code to one place."
  /// @param {object} dwg     — DwgLibrary shape {x,y,color,refresh,items}
  /// @param {string} version — the version string to stamp on this response
  /// @returns {string}
  function encodeDwgStart(dwg, version) {
    // Throws rather than silently interpolating a bad value: validateAndRepairDwg
    // already guarantees dwg.x/dwg.y are numbers clamped to
    // DWG_DIM_MIN..DWG_DIM_MAX on every write path — a missing/invalid
    // value here means something wrote to DwgLibrary without going
    // through it (DwgLibrary.get() never re-checks these on read), a
    // real bug worth surfacing loudly rather than embedding the literal
    // text "undefined" into the wire message.
    if (typeof dwg.x !== 'number' || !isFinite(dwg.x) || dwg.x < DWG_DIM_MIN || dwg.x > DWG_DIM_MAX) {
      throw new Error('[DwgWireEncoder] dwg.x is not a valid ' + DWG_DIM_MIN + '-' + DWG_DIM_MAX +
        ' number: ' + JSON.stringify(dwg.x) + ' — validateAndRepairDwg should already guarantee this');
    }
    if (typeof dwg.y !== 'number' || !isFinite(dwg.y) || dwg.y < DWG_DIM_MIN || dwg.y > DWG_DIM_MAX) {
      throw new Error('[DwgWireEncoder] dwg.y is not a valid ' + DWG_DIM_MIN + '-' + DWG_DIM_MAX +
        ' number: ' + JSON.stringify(dwg.y) + ' — validateAndRepairDwg should already guarantee this');
    }
    // Same reasoning for refresh — see this check's own original comment
    // history; kept as a separate guard since it has its own valid range
    // (non-negative, no upper bound enforced by validateAndRepairDwg).
    if (typeof dwg.refresh !== 'number' || !isFinite(dwg.refresh) || dwg.refresh < 0) {
      throw new Error('[DwgWireEncoder] dwg.refresh is not a valid non-negative number: ' +
        JSON.stringify(dwg.refresh) + ' — validateAndRepairDwg should already guarantee this');
    }
    // dwg.refresh is in SECONDS (the Dwg Controls Panel edits and displays it
    // that way — "Refresh rate (seconds, 0 = no refresh)", max 3600) but this
    // header field is MILLISECONDS, which is what pfodParser's own
    // sendRefreshAndVersion() sends and what webTranslator.js reads back as
    // refreshMs.  Emitting the seconds value raw put `5 on the wire for a dwg
    // set to 5 s, which the auto-refresh floor then rounded up to 250 ms.
    // The menu side never had this problem — it stores refresh_ms already.
    const refreshMs = dwg.refresh * 1000;
    let out = '{+' + _colour(dwg.color) + '`' + dwg.x + '`' + dwg.y + '`' + refreshMs + '~' + version;
    const deferred = [];
    const placeholderSent = new Set();
    for (const item of flattenTouchActions(dwg.items)) {
      const canDefer = (item.idx !== undefined && item.idx !== null)
        && NEVER_DEFERRED_TYPES.indexOf(item.type) === -1;
      if (canDefer) {
        if (!placeholderSent.has(item.idx)) {
          placeholderSent.add(item.idx);
          out += encodeIndex(item);
        }
        deferred.push(item);
      } else {
        out += encodeItem(item);
      }
    }
    for (const item of deferred) {
      out += encodeItem(item);
    }
    return out + '}';
  }

  /// Build a real pfod "update" response — {+|item...} — carrying no
  /// colour/x/y/refresh/version header at all. webTranslator.js's own
  /// updatePattern (/^\{\+(~(m)?)?$/) only matches cmd[0] being exactly
  /// "{+"/"{+~"/"{+~m" with nothing else — i.e. an update is signalled by
  /// the ABSENCE of header content, not a separate wire tag — so this must
  /// never include the colour`x`y`refresh~version fields encodeDwgStart
  /// does. Used to patch a small number of already-displayed items in
  /// place (e.g. one hide/unhide-by-idx/cmd directive) instead of re-
  /// sending the whole drawing as a fresh "start": drawingDataProcessor.js's
  /// 'update' branch patches the existing per-drawing item collections
  /// directly (targetItem.visible = ...) rather than clearing and
  /// rebuilding them, so every unrelated item keeps its existing DOM/canvas
  /// state untouched instead of flashing on a full redraw.
  /// @param {Array<object>} items — DwgLibrary-shaped items (e.g. one
  ///        hide/unhide directive carrying an already-resolved numeric idx
  ///        or cmd, not idxName/cmdName)
  /// @returns {string}
  function encodeDwgUpdate(items) {
    return '{+' + items.map(encodeItem).join('') + '}';
  }

  /// Build a real one-item pfod main menu embedding a dwg item — empty
  /// title (no prompt), exactly one dwg-type entry. Mirrors the
  /// pfodMenuParser.js:137-194 dwg-item grammar
  /// (`+<cmd><format-codes>~<loadCmd>`) — no format codes needed for the
  /// preview's own wrapper item.
  /// @param {string} itemCmd — the menu item's own touch identifier
  /// @param {string} loadCmd — the cmd used to later fetch this dwg's data
  /// @returns {string}
  function encodeMainMenuWithDwgItem(itemCmd, loadCmd) {
    return '{,~|+' + itemCmd + '~' + loadCmd + '}';
  }

  return Object.freeze({ encodeDwgStart, encodeDwgUpdate, encodeMainMenuWithDwgItem, encodeItem });
})();

// Exposed the same way DesignerDwgPanel/pfodMenuDisplay are — a plain
// global, no module system in this bundle.
window.DwgWireEncoder = DwgWireEncoder;
