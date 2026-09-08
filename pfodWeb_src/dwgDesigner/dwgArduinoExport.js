/*
 * dwgDesigner/dwgArduinoExport.js
 *
 * "Generate Code" — produces a complete, ready-to-compile Arduino Serial
 * sketch for a single top-level dwg: the .ino, a single-dwg pfodMainMenu.h/
 * .cpp wrapper (the dwg embedded as the menu's one "Drawing" item), and
 * Dwg_<name>.h/.cpp for the dwg itself plus every dwg it reaches via
 * insertDwg (recursively). Every file's shape is ported verbatim from the
 * real V4.1.2 pfodWeb generator's own reference output for exactly this
 * scenario (see Menu_withDwg/ in this project's own root — a menu wrapping
 * one dwg — and pfodWebDesigner/src/arduinoExport.js's convertItemToArduino/
 * convertColor for the per-item wire encoding this shares with that older
 * generator). Flat style throughout: one class per dwg/menu, no Base/thin
 * file split (see generated-code-structure.md's own Menu_ex_4-based writeup
 * for that OTHER, split-class style, which this "Generate Code" feature
 * does NOT use).
 *
 * Zips everything with the app's shared STORE-only zip writer
 * (designer/menus/zipBuilder.js) and triggers a browser download. A
 * hand-rolled second writer used to live in this file; it took only text,
 * so it could not carry the binary design bundle below, and being a
 * separate implementation nothing proved readZip could read what it wrote.
 *
 * The sketch carries the design that produced it in menujson/, exactly as
 * the menu designer's own Generate Code does — saveToFile.js's
 * buildBundleFrom builds it, around the one-item wrapper design this
 * module synthesises (_generateWrapperMenuJSON). That is the only layout
 * the loaders accept, so the generated sketch can be picked straight back
 * up with Load Design from File. It used to write the wrapper design and
 * each drawing's json flat in a `json/` directory instead — a shape
 * nothing reads, so a sketch generated here could not be re-loaded at all.
 *
 * An insertDwg target that isn't currently loaded in DwgLibrary is
 * reported back to the caller (missingDrawings) but does NOT stop
 * generation: its #include, init() call, and insertDwg().send() line are
 * all emitted as comments instead (see _convertItemToArduino's own doc),
 * so the rest of the sketch still compiles.
 *
 * Exports:    window.DwgArduinoExport.exportDwgAsZip(dwgName)
 * Depends on: DwgLibrary (dwgDesigner/dwgLibrary.js, loaded earlier),
 *             flattenTouchActions (dwgDesigner/dwgValidate.js, loaded earlier),
 *             DesignerZipBuilder + DesignerSaveToFile.buildBundleFrom
 *             (designer/menus/, loaded later — reached only at click time)
 * Called by:  dwgDesigner/dwgControlsPanelUI.js's Generate Code buttons
 *             (main Dwg Controls Panel list screen, and the Edit Dwg screen)
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DwgArduinoExport = (() => {

  /// Real embedded pfodDrawing colour constant names, index 0-15 —
  /// pfodWebDesigner/src/arduinoExport.js's own convertColor() standard-
  /// colour table, ported verbatim.
  const STANDARD_COLOR_NAMES = Object.freeze([
    'dwgsPtr->BLACK', 'dwgsPtr->MAROON', 'dwgsPtr->GREEN', 'dwgsPtr->OLIVE',
    'dwgsPtr->NAVY', 'dwgsPtr->PURPLE', 'dwgsPtr->TEAL', 'dwgsPtr->SILVER',
    'dwgsPtr->GREY', 'dwgsPtr->RED', 'dwgsPtr->LIME', 'dwgsPtr->YELLOW',
    'dwgsPtr->BLUE', 'dwgsPtr->FUCHSIA', 'dwgsPtr->AQUA', 'dwgsPtr->WHITE',
  ]);

  /// Real embedded pfodDrawing touch-filter constant names, keyed by
  /// their own numeric value — mirrors add-item.html's own Touch Filter
  /// dropdown (dwgControlsPanelUI.js's TOUCH_FILTER_OPTIONS) exactly.
  /// Unlike pfodWebDesigner's own TouchZoneFilters.decode() (which
  /// bitwise-decodes an arbitrary OR-combination, since the real embedded
  /// library allows combining filter flags), this project's own UI only
  /// ever lets a user pick ONE of these eight values at a time — a
  /// simple lookup is all that's needed here.
  const TOUCH_FILTER_NAMES = Object.freeze({
    0: 'dwgsPtr->TOUCH', 1: 'dwgsPtr->DOWN', 2: 'dwgsPtr->DRAG', 4: 'dwgsPtr->UP',
    8: 'dwgsPtr->CLICK', 16: 'dwgsPtr->PRESS',
    256: 'dwgsPtr->DOWN_DRAG_UP', 512: 'dwgsPtr->TOUCH_DISABLED',
  });

  /// The copyright notice every generated file must carry — shared here
  /// so every generated file this module produces (Dwg_<name>.h/.cpp,
  /// pfodMainMenu.h/.cpp, <name>_serial.ino) stays in sync. Matches
  /// generateCode.js's own _fileHeader.
  function _copyrightBlock() {
    return ' * (c)2026 Forward Computing and Control Pty. Ltd.\n' +
           ' * NSW Australia, www.forward.com.au\n' +
           ' * This code is not warranted to be fit for any purpose. You may only use it at your own risk.\n' +
           ' * This generated code may be freely used for both private and commercial use\n' +
           ' * provided this copyright is maintained.\n';
  }

  /// A valid C++ identifier from a DwgLibrary dwg name — pfodWebDesigner's
  /// own `.replace(/[^a-zA-Z0-9_]/g, '')`, ported verbatim (dwg names in
  /// this project are free text; class/variable names cannot contain
  /// spaces, punctuation, etc).
  /// @param {string} name
  /// @returns {string}
  function _identifier(name) {
    return (name || '').replace(/[^a-zA-Z0-9_]/g, '');
  }

  /// The pfodAutoCmd member name for a Drawing MENU ITEM, from that item's
  /// own autoCmd: "drawing_Home_Cmd" → "dwgMenuItem_Home_Cmd".
  ///
  /// One rule, one place. Both code generators emit this member — this file
  /// for the single-dwg wrapper menu (Generate Code - Serial) and
  /// generateCode.js for a full design — and they had drifted: this one
  /// hard-coded "dwgMenuItem_Cmd" while the other derived a name per item.
  /// That was harmless only because the wrapper menu holds exactly one
  /// Drawing item, but it meant the same design produced different member
  /// names depending on which button generated it, and only one of the two
  /// matched the guide.
  ///
  /// Only the leading type word is dropped, so the rest of the autoCmd —
  /// which state.js's _makeAutoCmd has already made unique within its menu,
  /// dedup suffix included — survives intact.
  ///
  /// @param {string} autoCmd — a drawing menu item's autoCmd
  /// @returns {string} a valid C++ identifier
  function _dwgMenuItemCmdVar(autoCmd) {
    const id  = _identifier(autoCmd);
    const pos = id.indexOf('_');
    return 'dwgMenuItem_' + (pos >= 0 ? id.substring(pos + 1) : id);
  }

  /// The same name for the single-dwg WRAPPER menu, derived from the dwg's
  /// own name through the autoCmd _generateWrapperMenuJSON would mint for
  /// it. Going the long way round — name → autoCmd → member — is the point:
  /// the sketch and the .pfodMenu_json bundled beside it then agree, so
  /// re-generating from that bundle through the menu designer produces the
  /// same member name.
  /// @param {string} topDwgName — the raw (unsanitized) dwg name
  /// @returns {string}
  function _wrapperCmdVar(topDwgName) {
    return _dwgMenuItemCmdVar(_makeAutoCmd(ITEM_TYPE_DRAWING, topDwgName, []));
  }

  // Colours this export run had to degrade to BLACK — see _convertColor.
  // A Set for the duration of exportDwgAsZip(), null outside one, so the
  // pure-function call sites don't have to thread a collector through four
  // levels of nesting for something that only ever has one run in flight.
  let _degradedColours = null;

  /// pfodWebDesigner/src/arduinoExport.js's own convertColor(), ported
  /// verbatim: -1/BLACK_WHITE and the 16 standard palette entries get
  /// their own named constant, 16-255 is emitted as a bare number, and
  /// anything else (including this project's own RRGGBB hex-string
  /// colours, which the real embedded 256-colour palette has no slot
  /// for) falls back to BLACK, matching the reference's own "non-numeric
  /// input" catch-all exactly.
  /// @param {number|string} color
  /// @returns {string}
  function _convertColor(color) {
    if (color === -1) return 'dwgsPtr->BLACK_WHITE';
    if (typeof color !== 'number' || color < 0 || color > 255) {
      // The pfodParser builder methods take a palette INTEGER — there is no
      // .colour("FF0000") overload, so an RRGGBB colour (valid everywhere
      // else in this app: the file format, the wire, and the renderer) has
      // nowhere to go in generated code and becomes BLACK. Silently, until
      // now: the dwg previewed in the right colour and then came out black on
      // the device, with nothing anywhere saying why. Recorded so the caller
      // can tell the user which colours changed and that they need to build
      // those primitive strings by hand if they want them.
      if (_degradedColours) _degradedColours.add(String(color));
      return 'dwgsPtr->BLACK';
    }
    const c = Math.floor(color);
    if (c <= 15) return STANDARD_COLOR_NAMES[c];
    return String(c);
  }

  /// pfodWebDesigner/src/arduinoExport.js's own convertOffset(): the
  /// literal strings "COL"/"ROW" (a touchAction target's own touch-
  /// relative position, see dwgWireEncoder.js's own _offsetField doc)
  /// become the real embedded library's own TOUCHED_COL/TOUCHED_ROW
  /// constants; a real number passes through unchanged.
  /// @param {number|string} offset
  /// @returns {number|string}
  function _convertOffset(offset) {
    if (offset === 'COL') return 'dwgsPtr->TOUCHED_COL';
    if (offset === 'ROW') return 'dwgsPtr->TOUCHED_ROW';
    return offset || 0;
  }

  /// How generated code names ANOTHER dwg's object — the accessor call, never
  /// the raw dwg_<name> global.  Dwg_<name>.h declares get_dwg_<name>() and
  /// Dwg_<name>.cpp defines it weak returning the default instance, so going
  /// through it lets a user subclass that dwg and take over by defining the
  /// accessor in their own .cpp, without editing any generated file.  Applies
  /// to inserted dwgs exactly as it does to a menu's own top-level dwg: an
  /// insertDwg's init() and loadCmd, and hide/unhide/erase-by-drawing, all
  /// have to resolve to the SAME object the subclass supplies, or the
  /// subclass is never registered and never advertised.
  /// @param {string} drawingName — raw dwg name, _identifier() applied here
  /// @returns {string}
  function _dwgAccessor(drawingName) {
    return 'get_dwg_' + _identifier(drawingName) + '()';
  }

  // Types whose idxName is a REFERENCE to some other item's index, never a
  // declaration of their own — mirrors dwgValidate.js's REFERENCE_ONLY_TYPES,
  // which is the authority. This file has to know the difference now that a
  // non-blank idxName is what makes an item indexed: a touchActionInput
  // legitimately carries the idxName of the label whose text it edits, and
  // treating that as a declaration would re-send it from sendIndexedItems()
  // detached from its touchZone, and replace it with an index() placeholder
  // in sendFullDrawing() so the input itself was never emitted at all.
  const EXPORT_REFERENCE_ONLY_TYPES = Object.freeze([
    'hide', 'unhide', 'erase', 'touchAction', 'touchActionInput',
  ]);

  /// True when this item DECLARES an index — a non-blank idxName on a type
  /// that owns it rather than pointing at someone else's.
  /// @param {object} item
  /// @returns {boolean}
  function _declaresIdx(item) {
    return typeof item.idxName === 'string' && item.idxName !== ''
      && EXPORT_REFERENCE_ONLY_TYPES.indexOf(item.type) === -1;
  }

  /// Append `.idx(idxName)` when idxName is set — pfodWebDesigner's own
  /// addIdx() helper, ported verbatim.
  /// @param {string} code
  /// @param {string} [idxName]
  /// @returns {string}
  function _addIdx(code, idxName) {
    return idxName ? code + '.idx(' + idxName + ')' : code;
  }

  /// One DwgLibrary item -> one fluent-builder Arduino statement (or, for
  /// touchAction, one statement per nested action) — pfodWebDesigner/src/
  /// arduinoExport.js's own convertItemToArduino(), ported field-for-
  /// field against this project's own DWG_ITEM_FIELD_SCHEMA (dwgValidate.js)
  /// shape, which already matches the reference's own field names almost
  /// exactly (both ultimately derive from the same real embedded pfodDrawing
  /// library). Returns '' for a type this project doesn't otherwise support
  /// authoring (nothing currently reaches that case, since every item
  /// passing through here already validated against DWG_ITEM_TYPES).
  /// @param {object} item
  /// @param {Set<string>} [missingDwgSet] — insertDwg/hide/unhide/erase
  ///        drawingNames not currently loaded in DwgLibrary; referencing
  ///        one here is commented out instead of emitted, since the
  ///        generated code has no Dwg_<name> class for it (never
  ///        generated, so referencing it wouldn't compile)
  /// @returns {string}
  function _convertItemToArduino(item, missingDwgSet) {
    const color = _convertColor(item.color !== undefined ? item.color : -1);
    const xOffset = _convertOffset(item.xOffset || 0);
    const yOffset = _convertOffset(item.yOffset || 0);

    if (item.drawingName && missingDwgSet && missingDwgSet.has(item.drawingName)) {
      const wouldBe = _convertItemToArduino(Object.assign({}, item), null);
      return '// MISSING: drawing \'' + item.drawingName + '\' is not currently loaded in the Dwg Library --\n' +
        '    // load it and regenerate to include this line:\n' +
        '    // ' + wouldBe;
    }

    switch (item.type) {
      case 'line':
        return _addIdx('dwgsPtr->line()', item.idxName) +
          '.color(' + color + ').size(' + (item.xSize || 0) + ',' + (item.ySize || 0) + ')' +
          '.offset(' + xOffset + ',' + yOffset + ').send();';

      case 'rectangle': {
        let code = 'dwgsPtr->rectangle()';
        if (item.filled === true) code += '.filled()';
        if (item.centered === true) code += '.centered()';
        if (item.rounded === true) code += '.rounded()';
        code = _addIdx(code, item.idxName);
        return code + '.color(' + color + ').size(' + item.xSize + ',' + item.ySize + ')' +
          '.offset(' + xOffset + ',' + yOffset + ').send();';
      }

      case 'circle': {
        let code = 'dwgsPtr->circle()';
        if (item.filled === true) code += '.filled()';
        code = _addIdx(code, item.idxName);
        return code + '.color(' + color + ').radius(' + item.radius + ')' +
          '.offset(' + xOffset + ',' + yOffset + ').send();';
      }

      case 'arc': {
        let code = _addIdx('dwgsPtr->arc()', item.idxName);
        if (item.filled === true) code += '.filled()';
        return code + '.color(' + color + ').radius(' + item.radius + ').start(' + item.start + ')' +
          '.angle(' + item.angle + ').offset(' + xOffset + ',' + yOffset + ').send();';
      }

      case 'label': {
        let code = _addIdx('dwgsPtr->label()', item.idxName);
        const text = (item.text || '').replace(/\n/g, '\\n');
        code += '.color(' + color + ').text("' + text + '")';
        if (item.fontSize) code += '.fontSize(' + item.fontSize + ')';
        if (item.bold === true) code += '.bold()';
        if (item.italic === true) code += '.italic()';
        if (item.underline === true) code += '.underline()';
        code += '.offset(' + xOffset + ',' + yOffset + ')';
        code += item.align === 'left' ? '.left()' : (item.align === 'right' ? '.right()' : '.center()');
        // value/decimals/units: optional label-only suffix — see
        // dwgWireEncoder.js's own _appendFormattedValue doc.
        if (item.units !== undefined && item.units !== '') code += '.units("' + item.units + '")';
        if (item.decimals !== undefined && item.decimals !== '') code += '.decimals(' + item.decimals + ')';
        if (item.value !== undefined && item.value !== '') code += '.value(' + item.value + ')';
        return code + '.send();';
      }

      case 'value': {
        let code = _addIdx('dwgsPtr->label()', item.idxName);
        const text = (item.text || '').replace(/\n/g, '\\n');
        code += '.color(' + color + ').text("' + text + '")';
        if (item.fontSize) code += '.fontSize(' + item.fontSize + ')';
        if (item.bold === true) code += '.bold()';
        if (item.italic === true) code += '.italic()';
        if (item.underline === true) code += '.underline()';
        code += '.offset(' + xOffset + ',' + yOffset + ')';
        code += item.align === 'left' ? '.left()' : (item.align === 'right' ? '.right()' : '.center()');
        const intValue = _convertOffset(item.intValue);
        code += '.intValue(' + intValue + ')';
        if (item.units) code += '.units("' + item.units + '")';
        if (item.max !== undefined) code += '.maxValue(' + item.max + ')';
        if (item.min !== undefined) code += '.minValue(' + item.min + ')';
        if (item.displayMax !== undefined) code += '.displayMax(' + item.displayMax + ')';
        if (item.displayMin !== undefined) code += '.displayMin(' + item.displayMin + ')';
        if (item.decimals !== undefined) code += '.decimals(' + item.decimals + ')';
        return code + '.send();';
      }

      case 'hide':
        if (item.drawingName) return 'dwgsPtr->hide().loadCmd(' + _dwgAccessor(item.drawingName) + ').send();';
        if (item.cmdName) return 'dwgsPtr->hide().cmd(' + item.cmdName + ').send();';
        if (item.idxName) return 'dwgsPtr->hide().idx(' + item.idxName + ').send();';
        return '// hide: no cmd or idx specified';

      case 'unhide':
        if (item.drawingName) return 'dwgsPtr->unhide().loadCmd(' + _dwgAccessor(item.drawingName) + ').send();';
        if (item.cmdName) return 'dwgsPtr->unhide().cmd(' + item.cmdName + ').send();';
        if (item.idxName) return 'dwgsPtr->unhide().idx(' + item.idxName + ').send();';
        return '// unhide: no cmd or idx specified';

      case 'erase':
        if (item.drawingName) return 'dwgsPtr->erase().loadCmd(' + _dwgAccessor(item.drawingName) + ').send();';
        if (item.cmdName) return 'dwgsPtr->erase().cmd(' + item.cmdName + ').send();';
        if (item.idxName) return 'dwgsPtr->erase().idx(' + item.idxName + ').send();';
        return '// erase: no cmd or idx specified';

      case 'touchZone': {
        let code = 'dwgsPtr->touchZone().cmd(' + item.cmdName + ')';
        // An idx on a touchZone is its touch PRIORITY among overlapping
        // zones (pfodTouchZone::idx(pfodAutoIdx&)), not a handle for
        // redrawing it — so it is emitted here, inline with the zone, and
        // the zone is never deferred into sendIndexedItems() the way a real
        // indexed item is.
        if (_declaresIdx(item)) code += '.idx(' + item.idxName + ')';
        if (item.centered === true) code += '.centered()';
        code += '.size(' + (item.xSize || 1) + ',' + (item.ySize || 1) + ')' +
          '.offset(' + xOffset + ',' + yOffset + ')';
        if (item.filter) {
          const filterName = TOUCH_FILTER_NAMES[item.filter];
          if (filterName) code += '.filter(' + filterName + ')';
        }
        return code + '.send();';
      }

      case 'touchAction': {
        // action[0] ONLY. A touchAction carries exactly one primitive: that
        // is what the wire form |X~cmd~<primitive> holds, what
        // pfodTouchAction::action(pfodDwgsBase&) takes, and what
        // dwgWireEncoder emits. This used to map over the whole array and
        // emit a line per element, so a file with two entries generated two
        // touchActions here but sent only the first from the preview — the
        // array is a container the runtime spreads into its per-cmd list
        // (drawingDataProcessor), not a way to put two primitives on one
        // item. validateAndRepairDwg drops any extras on load, so reaching
        // here with more than one is not expected.
        if (!Array.isArray(item.action) || item.action.length === 0) {
          return 'dwgsPtr->touchAction().cmd(' + item.cmdName + ').action(dwgsPtr->rectangle().size(1,1)).send();';
        }
        const actionCode = _convertItemToArduino(item.action[0], missingDwgSet).replace(/\.send\(\);$/, '');
        return 'dwgsPtr->touchAction().cmd(' + item.cmdName + ').action(' + actionCode + ').send();';
      }

      case 'touchActionInput': {
        let code = 'dwgsPtr->touchActionInput().cmd(' + item.cmdName + ').prompt("' + (item.prompt || '') + '")';
        if (item.idxName) code += '.textIdx(' + item.idxName + ')';
        if (item.fontSize !== undefined && item.fontSize !== null) code += '.fontSize(' + item.fontSize + ')';
        if (item.color !== undefined && item.color !== null) code += '.color(' + _convertColor(item.color) + ')';
        if (item.backgroundColor !== undefined && item.backgroundColor !== null) code += '.backgroundColor(' + _convertColor(item.backgroundColor) + ')';
        return code + '.send();';
      }

      case 'index':
        // idx ONLY. An index placeholder reserves an index and does nothing
        // else: the wire form is |i`idx with no cmd slot at all, and
        // pfodIndex has no cmd() — the library header has it commented out —
        // so the `.cmd()` form this used to emit for an index carrying a
        // cmdName would not have compiled. validateAndRepairDwg strips a
        // cmdName off an index on load, so one cannot reach here.
        if (item.idxName) return 'dwgsPtr->index().idx(' + item.idxName + ').send();';
        return '// index: no idx specified';

      case 'insertDwg':
        return 'dwgsPtr->insertDwg().loadCmd(' + _dwgAccessor(item.drawingName) + ').offset(' + xOffset + ',' + yOffset + ').send();';

      case 'pushZero':
        return 'dwgsPtr->pushZero(' + (item.x || 0) + ', ' + (item.y || 0) + ', ' + (item.scale !== undefined ? item.scale : 1) + ');';

      case 'popZero':
        return 'dwgsPtr->popZero();';

      default:
        return '// Unsupported item type: ' + item.type;
    }
  }

  /// Dwg_<name>.h — class declaration, one pfodAutoIdx per distinct
  /// declared idxName and one pfodAutoCmd per distinct touchZone cmdName
  /// (insertDwg shares the same cmdName namespace but doesn't get its
  /// own pfodAutoCmd member here, matching pfodWebDesigner's own .h
  /// generator exactly — only touchZone's cmd is ever a class member;
  /// insertDwg's own cmd is resolved differently on the real device).
  /// Flat style (matches Menu_withDwg/Dwg_Cmd.h, the real V4.1.2
  /// generator's own reference output) — a single class per dwg, no
  /// Base/thin file split. dwgRefresh_ms is a public instance member (set in
  /// the constructor), not a file-scope static, matching that reference.
  /// Its _ms suffix is deliberate: pfodParser::sendRefreshAndVersion() takes
  /// milliseconds, and the stored dwg.dwgRefresh_ms carries the same unit
  /// under the same name, so the value passes straight through.
  /// sendIndexedItems() is virtual (as in that same reference's own
  /// menu-side pfodMainMenu::sendMainMenu/sendMainMenuUpdate) so a user's
  /// own subclass can override just the indexed-item values without
  /// touching anything else; sendFullDrawing/sendUpdate/processDwgCmds are
  /// plain, and public so a sketch can push a redraw itself.
  /// Each touchZone gets its own protected, virtual per-cmd method declared
  /// here (bool Dwg_<name>_<cmdName>(row, col, touchType, editedText)) for
  /// the user to fill in directly in the .cpp, or override from their own
  /// subclass.  It returns whether it handled the touch: true means it sent
  /// the response itself (the generated stub calls sendUpdate() and returns
  /// true), false propagates back out of processDwgCmds() so the main menu
  /// sends the response instead.
  /// @param {object} dwg — DwgLibrary shape, items already FLAT
  /// @returns {string}
  function _generateHeader(dwg) {
    const name = _identifier(dwg.name);
    let code = '// Dwg_' + name + '.h  file  =================\n' +
      '// generated by pfodWeb Designer Dwg Code Generator\n' +
      '/*\n' +
      _copyrightBlock() +
      ' */\n' +
      '#ifndef DWG_' + name + '_H\n' +
      '#define DWG_' + name + '_H\n' +
      '// Arduino code for drawing: ' + name + '\n' +
      '// Generated from pfodWeb Designer dwg "' + dwg.name + '"\n' +
      '#include <pfodDrawing.h>\n\n' +
      'class Dwg_' + name + ' : public pfodDrawing {\n' +
      '  public:\n' +
      '    Dwg_' + name + '();\n' +
      // virtual: the menu calls init() through a Dwg_<name>& returned by
      // get_dwg_<name>(), so a subclass's own init() only runs if this
      // dispatches.  Non-virtual silently ran the base version instead.
      '    virtual void init();\n' +
      '    bool sendDwg(); // returns true if dwg sent else false i.e. not this dwg\'s loadCmd\n' +
      '    bool processDwgCmds(); // return true if handled else false\n' +
      '    void sendFullDrawing();\n' +
      '    void sendUpdate();\n';

    code += '    unsigned long dwgRefresh_ms;\n\n' +
      '  protected:\n' +
      '    virtual void sendIndexedItems();\n';

    const cmdList = [];
    (dwg.items || []).forEach((item) => {
      if (item.type !== 'touchZone' || !item.cmdName) return;
      if (cmdList.includes(item.cmdName)) return;
      cmdList.push(item.cmdName);
      code += '    virtual bool Dwg_' + name + '_' + item.cmdName +
        '(int row, int col, uint8_t touchType, const byte* editedText); // touchZone ' + item.cmdName + ' touched, return true if handled\n';
    });

    // The idx/cmd members stay PROTECTED, alongside the virtual methods that
    // use them: a subclass overriding sendIndexedItems() has to name its own
    // idx_<n> to send replacement values, and one overriding a touchZone
    // handler may need its cmd.  Private would make the override impossible
    // to write.  Only `initialized` (nothing outside this class's own init()
    // ever touches it) is private.
    const idxList = [];
    (dwg.items || []).forEach((item) => {
      if (!_declaresIdx(item)) return;
      if (idxList.includes(item.idxName)) return;
      idxList.push(item.idxName);
      code += '    pfodAutoIdx ' + item.idxName + ';\n';
    });
    cmdList.forEach((cmdName) => {
      code += '    pfodAutoCmd ' + cmdName + ';\n';
    });

    code += '  private:\n' +
      '    bool initialized;\n';

    code += '\n};\n\n' +
      '// The drawing object the menu code uses.  To add your own behaviour,\n' +
      '// subclass Dwg_' + name + ', define your own instance, and define this\n' +
      '// function in YOUR .cpp to return it -- the weak default in\n' +
      '// Dwg_' + name + '.cpp is then replaced at link time and NONE of these\n' +
      '// generated files need editing:\n' +
      '//     My' + name + ' my' + name + ';\n' +
      '//     Dwg_' + name + '& get_dwg_' + name + '() { return my' + name + '; }\n' +
      '// The unused default instance then never has init() called on it, so it\n' +
      '// never registers with the parser and never allocates its pfodDwgs.\n' +
      'Dwg_' + name + '& get_dwg_' + name + '();\n' +
      'extern Dwg_' + name + ' dwg_' + name + '; // the default instance\n' +
      '#endif\n' +
      '// ================= end of Dwg_' + name + '.h  file\n';
    return code;
  }

  /// Dwg_<name>.cpp — constructor/init/processDwgCmds/sendDwg/
  /// sendIndexedItems/sendFullDrawing/sendUpdate — pfodWebDesigner's own
  /// convertJsonToArduino_CPP(), ported near-verbatim. sendFullDrawing()
  /// defers every INDEXED item's real content to sendIndexedItems()
  /// (sending just an index placeholder at that item's own position),
  /// matching dwgWireEncoder.js's own encodeDwgStart two-phase scheme —
  /// this generated C++ and this project's own live wire preview both
  /// implement the exact same real embedded-library convention.
  /// @param {object} dwg — DwgLibrary shape, items already FLAT
  /// @param {Set<string>} [missingDwgSet] — insertDwg drawingNames not
  ///        currently loaded in DwgLibrary; their #include, init() call,
  ///        and insertDwg().send() line are all commented out instead of
  ///        emitted, since there is no generated Dwg_<name> class for them
  ///        to reference (see _convertItemToArduino's own doc)
  /// @returns {string}
  function _generateCpp(dwg, missingDwgSet) {
    const name = _identifier(dwg.name);
    const items = dwg.items || [];
    // dwg.dwgRefresh_ms is already MILLISECONDS, the unit
    // pfodParser::sendRefreshAndVersion() takes and the same unit as the main
    // menu's own refresh_ms below — so it passes straight through under the
    // same name.  The Dwg Controls Panel's own seconds input is the only
    // place that converts.
    const refreshMs = dwg.dwgRefresh_ms || 0;
    const bgColor = _convertColor(dwg.color !== undefined ? dwg.color : -1);
    missingDwgSet = missingDwgSet || new Set();

    let code = '// Dwg_' + name + '.cpp  file ==============\n' +
      '// generated by pfodWeb Designer Dwg Code Generator\n' +
      '/*\n' +
      _copyrightBlock() +
      ' */\n\n' +
      '#include "Dwg_' + name + '.h"\n' +
      '#include <pfodDebugPtr.h>\n\n' +
      '//#define DEBUG\n' +
      'static Print* debugPtr = NULL;  // local to this file\n\n' +
      'Dwg_' + name + ' dwg_' + name + ';\n' +
      '// weak: defining this function in any other .cpp replaces it, which is\n' +
      '// how a subclass takes over without editing this file -- see Dwg_' + name + '.h\n' +
      'Dwg_' + name + '& __attribute__((weak)) get_dwg_' + name + '() { return dwg_' + name + '; }\n\n';

    items.forEach((item) => {
      if (item.type !== 'insertDwg' || !item.drawingName) return;
      if (missingDwgSet.has(item.drawingName)) {
        code += '// MISSING: #include "Dwg_' + _identifier(item.drawingName) + '.h" -- drawing \'' +
          item.drawingName + '\' is not currently loaded in the Dwg Library, load it and regenerate to include this\n';
      } else {
        code += '#include "Dwg_' + _identifier(item.drawingName) + '.h"\n';
      }
    });
    code += '\n';

    const insertedDwgNames = [];
    items.forEach((item) => {
      if (item.type === 'insertDwg' && item.drawingName && !insertedDwgNames.includes(item.drawingName)) {
        insertedDwgNames.push(item.drawingName);
      }
    });

    // Per-touchZone hook methods, in touchZone order, deduped by cmdName.
    // Emitted as the FIRST methods in the file: they are the empty stubs the
    // user fills in, so they go above the fully-generated machinery
    // (constructor / init / processDwgCmds / sendDwg / send*) rather than
    // being buried in the middle of it.
    const seenCmds = [];
    items.forEach((item) => {
      if (item.type !== 'touchZone' || !item.cmdName) return;
      if (seenCmds.includes(item.cmdName)) return;
      seenCmds.push(item.cmdName);
    });

    seenCmds.forEach((cmdName) => {
      code += 'bool Dwg_' + name + '::Dwg_' + name + '_' + cmdName +
        '(int row, int col, uint8_t touchType, const byte* editedText) {\n' +
        '  (void)row; (void)col; (void)touchType; (void)editedText; // suppress warnings\n' +
        '  // sendUpdate from here\n' +
        '  // and return true,  if only this dwg needs updating\n' +
        '  sendUpdate(); \n' +
        '  return true;\n' +
        '  // else return false to propagate upto the mainmenu to let it send the response.\n' +
        '}\n\n';
    });

    code += 'Dwg_' + name + '::Dwg_' + name + '() {\n' +
      '  initialized = false;\n' +
      '  dwgRefresh_ms = ' + refreshMs + ';\n' +
      '}\n\n' +
      'void Dwg_' + name + '::init() {\n' +
      '  if (initialized) {\n' +
      '    return;\n' +
      '  }\n' +
      '  initialized = true;\n' +
      '  (void)debugPtr;  // suppress unused warning\n' +
      '#ifdef DEBUG\n' +
      '  debugPtr = getDebugPtr();\n' +
      '#endif\n' +
      '  pfodDrawing::init();\n';
    // Prime the auto-assigned identifiers, BEFORE the inserted drawings.
    //
    // pfodAutoIdx / pfodAutoCmd hand out their value on FIRST USE, so
    // without this a drawing's idx and cmd depend on the order the client
    // happens to ask for things -- different across runs, and different
    // between two clients connecting in a different order. Sending the
    // drawing once at boot fixes them, and it goes nowhere: a
    // default-constructed pfodParser has io == NULL, so every write() is a
    // silent no-op.
    //
    // Ahead of the children, not after them, so the numbering follows the
    // nesting: this drawing takes its own idx values first, and everything
    // it inserts gets higher ones. Init order then reads the same way the
    // drawing does.
    if (insertedDwgNames.length > 0) {
      code += '  // Forces this dwg\'s own pfodAutoIdx/pfodAutoCmd to a fixed,\n' +
        '  // deterministic value at boot instead of leaving it lazily assigned by\n' +
        '  // client request order -- sent to a local discard sink\n' +
        '  // (default-constructed pfodParser leaves io=NULL, so its write()s\n' +
        '  // silently no-op), never a real client. Runs BEFORE the drawings\n' +
        '  // inserted below, so this dwg takes the lower idx values and each\n' +
        '  // child it inserts takes higher ones.\n';
    } else {
      code += '  // Forces this dwg\'s own pfodAutoIdx to a fixed, deterministic value at\n' +
        '  // boot instead of leaving it lazily assigned by client request order --\n' +
        '  // sent to a local discard sink (default-constructed pfodParser leaves\n' +
        '  // io=NULL, so its write()s silently no-op), never a real client.\n';
    }
    code += '  pfodParser primingSink;\n' +
      '  setParser(&primingSink);\n' +
      '  sendFullDrawing();' +
      (insertedDwgNames.length > 0
        ? '  // before any included dwgs to match later gets higher idx\n\n'
        : '\n');
    insertedDwgNames.forEach((drawingName) => {
      if (missingDwgSet.has(drawingName)) {
        code += '  // MISSING: ' + _dwgAccessor(drawingName) + '.init(); -- drawing \'' + drawingName +
          '\' is not currently loaded in the Dwg Library, load it and regenerate to include this\n';
      } else {
        code += '  ' + _dwgAccessor(drawingName) + '.init(); // initialize inserted drawing\n';
      }
    });
    code += '}\n\n' +
      '// return true if handled else false\n' +
      '// either handle cmd here or in main sketch\n' +
      'bool Dwg_' + name + '::processDwgCmds() {\n' +
      '  if (!(*(parserPtr->getDwgCmd()))) {  // ==> getDwgCmd returned pointer to empty string\n' +
      '    return false; // not dwg cmd, not handled\n' +
      '  }\n';

    seenCmds.forEach((cmdName) => {
      code += '  if (parserPtr->dwgCmdEquals(' + cmdName + ')) { // handle touchZone ' + cmdName + '\n' +
        '    return Dwg_' + name + '_' + cmdName + '(parserPtr->getTouchedRow(), parserPtr->getTouchedCol(), parserPtr->getTouchType(), parserPtr->getEditedText());\n' +
        '  }\n';
    });

    code += '  return false; // not handled\n' +
      '}\n\n' +
      'bool Dwg_' + name + '::sendDwg() {\n' +
      '  if (!parserPtr->cmdEquals(*this)) {\n' +
      '    return false; // not this dwg\'s loadCmd\n' +
      '  }  // else\n' +
      '  if (parserPtr->isRefresh()) { // refresh just send update\n' +
      '    sendUpdate();\n' +
      '  } else {\n' +
      '    sendFullDrawing();\n' +
      '  }\n' +
      '  return true;\n' +
      '}\n\n' +
      '// all the indexed items are included here, edit as needed for updates\n' +
      'void Dwg_' + name + '::sendIndexedItems() {\n';

    items.forEach((item) => {
      if (item.type === 'hide' || item.type === 'unhide' || item.type === 'erase') return; // sent in sendFullDrawing
      // touchZone: sent whole in sendFullDrawing — its idx is touch priority,
      // not redrawable content, and it has to stay adjacent to its own
      // touchAction/touchActionInput lines.
      if (item.type === 'touchZone') return;
      if (!_declaresIdx(item) || item.type === 'index') return;
      const line = _convertItemToArduino(item, missingDwgSet);
      if (line) code += '    ' + line + '\n';
    });
    code += '}\n\n' +
      'void Dwg_' + name + '::sendFullDrawing() {\n' +
      '    // Start the drawing\n' +
      '    dwgsPtr->start(' + (dwg.x || 50) + ', ' + (dwg.y || 50) + ', ' + bgColor + ');\n' +
      '    parserPtr->sendRefreshAndVersion(dwgRefresh_ms); // sets version and refresh time for dwg pfodWeb processes this\n';

    const placeholderIdxSent = [];
    items.forEach((item) => {
      if (item.type === 'hide' || item.type === 'unhide' || item.type === 'erase') {
        const line = _convertItemToArduino(item, missingDwgSet);
        if (line) code += '    ' + line + '\n';
        return;
      }
      if (_declaresIdx(item) && item.type !== 'touchZone') {
        if (placeholderIdxSent.includes(item.idxName)) return;
        placeholderIdxSent.push(item.idxName);
        code += '    dwgsPtr->index().idx(' + item.idxName + ').send(); // place holder for indexed item\n';
        return;
      }
      const line = _convertItemToArduino(item, missingDwgSet);
      if (line) code += '    ' + line + '\n';
    });

    code += '    sendIndexedItems(); // update indexed items with their real values\n' +
      '    dwgsPtr->end();\n' +
      '}\n\n' +
      '// only indexed items can be sent as an update\n' +
      '// all the indexed items are included here, edit as needed\n' +
      'void Dwg_' + name + '::sendUpdate() {\n' +
      '    dwgsPtr->startUpdate();\n' +
      '    sendIndexedItems(); // send updated indexed items\n' +
      '    dwgsPtr->end();\n' +
      '}\n' +
      '// ============== end of Dwg_' + name + '.cpp  file\n';
    return code;
  }

  /// Recursively collect every dwg reachable from `dwgName` via insertDwg
  /// (nested to any depth), including `dwgName` itself — pfodWebDesigner's
  /// own collectAllInsertedDwgs(), simplified: that version fetches each
  /// drawing from the server asynchronously; DwgLibrary is already fully
  /// in memory, so this is synchronous and needs no callback. Missing
  /// (not-yet-loaded) insertDwg targets are recorded, not thrown — export
  /// still proceeds for everything that IS available, matching the
  /// reference's own "missing drawings are tracked but not considered
  /// errors" behaviour.
  /// @param {string} dwgName
  /// @param {Set<string>} [collected]
  /// @param {Array<string>} [missing]
  /// @returns {{names: Array<string>, missing: Array<string>}}
  function _collectAllDwgs(dwgName, collected, missing) {
    collected = collected || new Set();
    missing = missing || [];
    if (collected.has(dwgName)) return { names: Array.from(collected), missing };
    const dwg = DwgLibrary.get(dwgName);
    if (!dwg) {
      if (!missing.includes(dwgName)) missing.push(dwgName);
      return { names: Array.from(collected), missing };
    }
    collected.add(dwgName);
    const flat = flattenTouchActions(dwg.items || []);
    flat.forEach((item) => {
      if (item.type === 'insertDwg' && item.drawingName && !collected.has(item.drawingName)) {
        _collectAllDwgs(item.drawingName, collected, missing);
      }
    });
    return { names: Array.from(collected), missing };
  }

  /// pfodMainMenu.h — the single-dwg main menu wrapper, ported verbatim
  /// from Menu_withDwg/pfodMainMenu.h (the real V4.1.2 generator's own
  /// reference output for "a menu with a single dwg"): one pfodAutoCmd
  /// (dwgMenuItem_<Dwg>_Cmd) for the dwg's own menu row, sendMainMenu/
  /// sendMainMenuUpdate left virtual (matching that reference exactly —
  /// this is the one place virtual survives even in the flat, no-Base
  /// style), and the plot_msOffset/clearPlot pair the reference always
  /// declares regardless of whether there's an actual chart (they only
  /// back the {@} "current time" handshake every pfodApp connection does).
  /// The one thing here that does depend on the dwg is the member name —
  /// the same rule generateCode.js uses, so a design generated from either
  /// button declares the same member.
  ///
  /// It is derived here rather than passed in: a parameter is one a caller
  /// can forget, and forgetting it emits `pfodAutoCmd undefined;` — which
  /// compiles nowhere and is not obviously wrong in a diff.
  /// @param {string} topDwgName — the raw (unsanitized) dwg name
  /// @returns {string}
  function _generateMainMenuHeader(topDwgName) {
    const cmdVar = _wrapperCmdVar(topDwgName);
    return '#ifndef PFOD_MAIN_MENU_H\n' +
      '#define PFOD_MAIN_MENU_H\n\n' +
      '// pfodMainMenu.h  file  =================\n' +
      '// generated by pfodWeb Designer Dwg Code Generator\n' +
      '/*\n' +
      _copyrightBlock() +
      ' */\n\n' +
      '#include <pfodParser.h>\n\n' +
      'typedef void (*pfodCloseConnectionPtr)(Stream *);  // the pointer to the method that handles parser closeConnection calls\n\n' +
      'class pfodMainMenu {\n' +
      '  public:\n' +
      '    pfodMainMenu();\n' +
      // virtual for the same reason Dwg_<name>::init() is: init()/handle()
      // are reached through the pfodMainMenu& get_pfodMainMenu() returns, so
      // a subclass's own versions only run if these dispatch.
      '    virtual void init(pfodCloseConnectionPtr _closeConnectionFnPtr = NULL);\n' +
      '    virtual void handle(pfodParser &parser);\n\n' +
      '  protected:\n' +
      '    pfodAutoCmd ' + cmdVar + '; // drawing menu item\n\n' +
      '    virtual void sendMainMenu(pfodParser &parser);\n' +
      '    virtual void sendMainMenuUpdate(pfodParser &parser);\n\n' +
      '    unsigned long plot_msOffset; // set by {@} response\n' +
      '    bool clearPlot;              // set by the {@} response code\n\n' +
      '  private:\n' +
      '    bool initialized;\n' +
      '    pfodCloseConnectionPtr closeConnectionFnPtr;\n' +
      '    void closeConnection(Stream *io);\n' +
      '};\n\n' +
      'typedef void (*handle_mainMenuFnPtr)(pfodParser &parser);\n' +
      'handle_mainMenuFnPtr init_pfodMainMenu(pfodCloseConnectionPtr = NULL);\n' +
      'void handle_pfodMainMenu(pfodParser &parser);\n\n' +
      // Same weak-accessor scheme as Dwg_<name>'s own get_dwg_<name>(): the
      // bridge functions above call this, never the raw global, so a user's
      // subclass takes over by defining it in their own .cpp.
      '// The main menu object the sketch runs.  To add your own behaviour,\n' +
      '// subclass pfodMainMenu, define your own instance, and define this\n' +
      '// function in YOUR .cpp to return it -- the weak default in\n' +
      '// pfodMainMenu.cpp is then replaced at link time and NONE of these\n' +
      '// generated files need editing:\n' +
      '//     MyMainMenu myMainMenu;\n' +
      '//     pfodMainMenu& get_pfodMainMenu() { return myMainMenu; }\n' +
      '// The unused default instance then never has init() called on it.\n' +
      'pfodMainMenu& get_pfodMainMenu();\n' +
      'extern pfodMainMenu mainMenu; // the default instance\n' +
      '#endif\n' +
      '// ================= end of pfodMainMenu.h  file\n';
  }

  /// pfodMainMenu.cpp — ported verbatim from Menu_withDwg/pfodMainMenu.cpp,
  /// with the wrapped dwg's own identifier substituted in wherever the
  /// reference hard-coded "Cmd" (init() calling dwg_<name>.init(), and
  /// sendMainMenu() printing dwg_<name> as the loadCmd). The
  /// dwgMenuItem_<Dwg>_Cmd branch in handle() is for a touch on the dwg's
  /// own MENU ROW that its processDwgCmds() didn't already consume (matches
  /// the reference's own comment) — it is not part of the dwg's own
  /// touchZone handling, which lives entirely inside Dwg_<name>.cpp.
  /// @param {string} topDwgName — the raw (unsanitized) dwg name, for the
  ///        {.} example in the header comment
  /// @param {string} topDwgIdentifier — _identifier(topDwgName)
  /// @returns {string}
  function _generateMainMenuCpp(topDwgName, topDwgIdentifier) {
    const cmdVar = _wrapperCmdVar(topDwgName);
    return '// pfodMainMenu.cpp  file ==============\n' +
      '// generated by pfodWeb Designer Dwg Code Generator\n' +
      '/*\n' +
      _copyrightBlock() +
      ' */\n\n' +
      '/* ===== pfod Command for ' + topDwgName + ' ====\n' +
      'pfodApp msg {.} --> {,~`0~V1|+c0~<' + topDwgIdentifier + '\'s loadCmd>}\n' +
      ' */\n\n' +
      '#include "pfodMainMenu.h"\n' +
      '#include <pfodParser.h>\n' +
      '#include <pfodDebugPtr.h>\n' +
      '#include "Dwg_' + topDwgIdentifier + '.h"\n\n' +
      '// #define DEBUG\n\n' +
      'pfodMainMenu mainMenu;\n' +
      '// weak: defining this function in any other .cpp replaces it, which is\n' +
      '// how a subclass takes over without editing this file -- see pfodMainMenu.h\n' +
      'pfodMainMenu& __attribute__((weak)) get_pfodMainMenu() { return mainMenu; }\n\n' +
      'static Print* debugPtr = NULL;  // local to this file\n' +
      'static const unsigned long refresh_ms = 0; // main menu refresh\n\n' +
      'handle_mainMenuFnPtr init_pfodMainMenu(pfodCloseConnectionPtr _closeConnectionFnPtr) {\n' +
      '  get_pfodMainMenu().init(_closeConnectionFnPtr);\n' +
      '  return handle_pfodMainMenu;\n' +
      '}\n\n' +
      'void handle_pfodMainMenu(pfodParser& parser) {\n' +
      '  get_pfodMainMenu().handle(parser);\n' +
      '}\n\n' +
      'pfodMainMenu::pfodMainMenu() {\n' +
      '  initialized = false;\n' +
      '  closeConnectionFnPtr = NULL;\n' +
      '  plot_msOffset = 0;\n' +
      '  clearPlot = false;\n' +
      '}\n\n' +
      'void pfodMainMenu::init(pfodCloseConnectionPtr _closeConnectionFnPtr) {\n' +
      '  if (initialized) {\n' +
      '    return;\n' +
      '  }\n' +
      '  (void)debugPtr;  // suppress not used warning\n' +
      '#ifdef DEBUG\n' +
      '  debugPtr = getDebugPtr();\n' +
      '#endif\n' +
      '  initialized = true;\n' +
      '  closeConnectionFnPtr = _closeConnectionFnPtr;\n' +
      // Same priming the full menu generator emits (generateCode.js) and the
      // drawings do for themselves: pfodAutoCmd assigns on first use, so
      // without a send at boot the cmds fall out of client request order.
      // Ahead of the drawing, so the menu takes the lower values.
      '  // Forces this menu\'s pfodAutoCmds to fixed, deterministic values at boot\n' +
      '  // instead of leaving them lazily assigned by client request order -- sent\n' +
      '  // to a local discard sink (default-constructed pfodParser leaves io=NULL,\n' +
      '  // so its write()s silently no-op), never a real client. Runs BEFORE the\n' +
      '  // drawing below, so this menu takes the lower cmds and the drawing and\n' +
      '  // everything it inserts take higher ones.\n' +
      '  pfodParser primingSink;\n' +
      '  sendMainMenu(primingSink);  // before any included dwgs to match later gets higher idx\n\n' +
      '  get_dwg_' + topDwgIdentifier + '().init(); // initialize drawing -- \'' + topDwgName + '\'\n' +
      '}\n\n' +
      'void pfodMainMenu::handle(pfodParser &parser) {\n' +
      '  if (!initialized) {\n' +
      '    if (debugPtr) {\n' +
      '      debugPtr->println(F(" Need to call init_pfodMainMenu() from setup()."));\n' +
      '    }\n' +
      '  }\n' +
      '  uint8_t cmd = parser.parse(); // parse incoming data from connection\n' +
      '  // parser returns non-zero when a pfod command is fully parsed\n' +
      '  if (cmd != 0) { // have parsed a complete msg { to }\n' +
      '    uint8_t* pfodFirstArg = parser.getFirstArg(); // may point to \\0 if no arguments in this msg.\n' +
      '    pfod_MAYBE_UNUSED(pfodFirstArg); // may not be used, just suppress warning\n' +
      '    long pfodLongRtn; // used for parsing long return arguments, if any\n' +
      '    pfod_MAYBE_UNUSED(pfodLongRtn); // may not be used, just suppress warning\n' +
      '    if (\'.\' == cmd) {\n' +
      '      // pfodApp has connected and sent {.} , it is asking for the main menu\n' +
      '      if (!parser.isRefresh()) {\n' +
      '        sendMainMenu(parser); // send back the menu designed\n' +
      '      } else {\n' +
      '        sendMainMenuUpdate(parser); // menu is cached just send update\n' +
      '      }\n\n' +
      '      // handle {@} request\n' +
      '    } else if (\'@\' == cmd) { // pfodApp requested \'current\' time\n' +
      '      plot_msOffset = millis(); // capture current millis as offset rawdata timestamps\n' +
      '      clearPlot = true; // clear plot on reconnect as have new plot_msOffset\n' +
      '      parser.print(F("{@`0}")); // return `0 as \'current\' raw data milliseconds\n\n' +
      '      // now handle commands returned from button/sliders\n' +
      '    } else if (parser.cmdEquals(' + cmdVar + ')) { // user touch not handled by dwg, handle it here\n' +
      '      // in the main Menu of ' + topDwgName + '\n' +
      '      // drawing loadCmd handled internally by get_dwg_' + topDwgIdentifier + '().init()\n' +
      '      // add touchZone handling here for input not handled in processDwgCmds()\n' +
      '      sendMainMenuUpdate(parser); // always send back a pfod msg otherwise pfodApp will disconnect.\n\n' +
      '    } else if (\'!\' == cmd) {\n' +
      '      // CloseConnection command\n' +
      '      if (closeConnectionFnPtr) {\n' +
      '        closeConnectionFnPtr(parser.getPfodAppStream());\n' +
      '      }\n' +
      '    } else {\n' +
      '      // unknown command\n' +
      '      parser.print(F("{}")); // always send back a pfod msg otherwise pfodApp will disconnect.\n' +
      '    }\n' +
      '  }\n' +
      '  //  <<<<<<<<<<<  Your other loop() code goes here\n\n' +
      '}\n\n' +
      'void pfodMainMenu::sendMainMenu(pfodParser& parser) {\n' +
      '  // !! Remember to change the parser version string OR Clear the cache\n' +
      '  //    every time you edit this method\n' +
      '  parser.menu();  // start a Menu screen pfod message.  Send {,\n' +
      '  // send menu background, format, prompt, refresh and version\n' +
      '  parser.print(F("~")); // no prompt text\n' +
      '  parser.sendRefreshAndVersion(refresh_ms); // send the menu version\n' +
      '  // send menu items\n' +
      '  parser.print(F("|+")); // start Drawing\n' +
      '  parser.print(' + cmdVar + '); // drawing menu item cmd\n' +
      '  parser.print(F("~"));\n' +
      '  parser.print(get_dwg_' + topDwgIdentifier + '()); // the drawing\'s loadCmd\n' +
      '  parser.endOfMsg();  // close pfod message. Send }\n' +
      '}\n\n' +
      'void pfodMainMenu::sendMainMenuUpdate(pfodParser& parser) {\n' +
      '  parser.menuUpdate();  // start an Update Menu pfod message. Send {;\n' +
      '  // send menu items\n' +
      '  parser.print(F("|+")); // drawing menu item update\n' +
      '  parser.print(' + cmdVar + ');\n' +
      '  parser.endOfMsg();  // close pfod message. Send }\n' +
      '  // ============ end of menu ===========\n' +
      '}\n' +
      '// ============= end generated code =========\n';
  }

  /// <name>_serial.ino — the main sketch, ported verbatim from
  /// Menu_withDwg.ino: connect the parser to Serial, hand off to
  /// pfodMainMenu, loop. No dwg-specific content at all — every dwg's own
  /// setup needs (pins, timers, etc) go in the thin Dwg_<name>.cpp file(s)
  /// themselves or, for anything truly sketch-global, right after the
  /// marked "extra setup code" line below.
  /// @param {string} topDwgIdentifier — _identifier(topDwgName)
  /// @returns {string}
  function _generateIno(topDwgIdentifier) {
    return '// ' + topDwgIdentifier + '_serial.ino  file  =================\n' +
      '// generated by pfodWeb Designer Dwg Code Generator\n' +
      '/*\n' +
      _copyrightBlock() +
      ' */\n\n' +
      '// install pfodParser from the Arduino Library Manager\n' +
      '//    OR download the libraries from http://www.forward.com.au/pfod/pfodParserLibraries/index.html\n' +
      '// pfodParser V5.1.0+ contains pfodParser, pfodSecurity\n' +
      '#include <pfodParser.h>\n' +
      '#include "pfodMainMenu.h"\n\n' +
      'const char version[] = "V1";\n' +
      'pfodParser parser; // create a parser to handle the pfod messages\n' +
      'handle_mainMenuFnPtr handle_mainMenu; // pointer to fn the handles the main menu\n\n' +
      'void closeConnection(Stream *io) {\n' +
      '  (void)(io);\n' +
      '  // add any special code here to force connection to be dropped\n' +
      '}\n\n' +
      '// the setup routine runs once on reset:\n' +
      'void setup() {\n' +
      '  Serial.begin(115200);\n' +
      '  for (int i=3; i>0; i--) {\n' +
      '    // wait a few secs to see if we are being programmed\n' +
      '    delay(1000);\n' +
      '  }\n\n' +
      '  parser.setVersion(version);\n' +
      '  parser.connect(&Serial); // connect the parser to the i/o stream\n' +
      '  handle_mainMenu = init_pfodMainMenu(closeConnection); // intialize main menu, returns pointer to mainMenu handler\n' +
      '  // <<<<<<<<< Your extra setup code goes here\n' +
      '}\n\n' +
      'void loop() {\n' +
      '  handle_mainMenu(parser); // handle i/o via this parser\n' +
      '}\n';
  }

  /// Display name of the target the Designer is currently running against.
  /// Same resolution designer/adapter.js uses to build its board —
  /// getCurrentTargetId() (boardSelector.js) -> BOARD_DATA_BY_ID -> that
  /// entry's own name — so a wrapper menu records the SAME board a design
  /// saved from the Menu Designer would, and the two are interchangeable on
  /// load. The Dwg Designer is only ever reached THROUGH the Menu Designer,
  /// so a target is always selected by the time Generate Code can run; the
  /// guards below are for a bundle where boardSelector hasn't loaded yet,
  /// and fall back to the same avr_unoData default adapter.js does.
  /// @returns {string|undefined} board display name, e.g. 'Arduino UNO'
  function _currentBoardName() {
    const targetId = (typeof getCurrentTargetId === 'function') ? getCurrentTargetId() : null;
    if (targetId && typeof BOARD_DATA_BY_ID !== 'undefined' && BOARD_DATA_BY_ID[targetId]) {
      return BOARD_DATA_BY_ID[targetId].name;
    }
    return (typeof avr_unoData !== 'undefined') ? avr_unoData.name : undefined;
  }

  /// Re-loadable .pfodMenu_json for the generated single-dwg pfodMainMenu
  /// wrapper (_generateMainMenuHeader/_generateMainMenuCpp above) — a
  /// bare one-item menu whose only item is a Drawing linked to `dwgName`,
  /// matching what those two hard-coded templates actually generate
  /// (empty prompt, no refresh, one Drawing item, Serial connection).
  /// Lets the user pull this exported sketch's own menu back into the
  /// Designer later (Load Design from File) instead of hand-editing the
  /// generated code, the same way each bundled dwg's own .pfodDwg_json
  /// (json/<dwgName>.pfodDwg_json, above) lets it be re-loaded via Load
  /// Dwg. Reuses designer/state.js's own exportToJSON() building blocks
  /// (EXPORT_FORMAT_TAG, DESIGNER_STATE_SCHEMA_VERSION, _exportableMenu,
  /// _makeAutoCmd — all loaded earlier, before this file, and declared at
  /// module scope there) rather than hand-duplicating that shape, so this
  /// stays in sync with the Designer's own export format automatically.
  /// Two callers, so the design name is a parameter rather than derived:
  /// Generate Code - Serial names it after the sketch ('<id>_serial'),
  /// while the Dwg Controls Panel's Save Dwg names it after the drawing.
  /// Both want the identical one-item design, which is why there is one
  /// function rather than two that could drift.
  ///
  /// @param {string|string[]} dwgName — raw (unsanitized) dwg name, or
  ///        several for a design that shows more than one
  /// @param {string} designName — the design's own `name` field
  /// @returns {string} JSON string
  function _generateWrapperMenuJSON(dwgName, designName) {
    // One name or several. A snapshot of the whole drawing library wants a
    // Drawing item per top-level drawing, so opening it shows all of them;
    // the two sketch callers pass a single name and get what they always
    // got. autoCmd is minted against the items already built, since
    // _makeAutoCmd dedupes only against what it is shown.
    const names = Array.isArray(dwgName) ? dwgName : [dwgName];
    const items = [];
    names.forEach((n) => {
      items.push({
        type: ITEM_TYPE_DRAWING,
        autoCmd: _makeAutoCmd(ITEM_TYPE_DRAWING, n, items),
        text: n,
        formats: { disabled: false, sound: false, flash: false },
        dwgName: n,
      });
    });
    const rootMenu = {
      promptText: '',
      promptFormat: {
        fontSize: 0, bold: false, italic: false, underline: false,
        flash: false, sound: false, disabled: false,
        fontColour: null, bgColour: null,
      },
      items: items,
      refresh_ms: 0,
    };
    // Same field set and key order as DesignerState.exportToJSON(), per this
    // function's own "stays in sync with the Designer's export format"
    // contract above — boardName included: the Dwg Designer is reached from
    // the Menu Designer, so a target board is always selected and there is
    // always something truthful to record.  Recording it matters because a
    // schema-12 file WITHOUT it is read as a legacy design assumed to be an
    // UNO, which would be a silent lie on any other target.
    const out = {
      format:     EXPORT_FORMAT_TAG,
      schema:     DESIGNER_STATE_SCHEMA_VERSION,
      name:       designName,
      connection: 'serial',
      boardName:  _currentBoardName(),
      savedAt:    new Date().toISOString(),
      js_ver:     window.JS_VERSION,
      rootMenu:   _exportableMenu(rootMenu),
    };
    return JSON.stringify(out, null, 2);
  }

  /// Generate a complete Arduino sketch for `dwgName`: the .ino, the
  /// single-dwg pfodMainMenu.h/.cpp wrapper, and Dwg_<name>.h/.cpp for
  /// `dwgName` and every dwg it reaches via insertDwg (recursively) — see
  /// Menu_withDwg for the reference this whole shape is ported from. Zips
  /// them and triggers a browser download, same Blob + object-URL +
  /// synthetic-click pattern dwgControlsPanelUI.js's own
  /// _downloadDwgAsJson() uses.
  /// @param {string} dwgName
  /// @returns {{missingDrawings: Array<string>, unsupportedColours: Array<string>}}
  ///          missingDrawings — insertDwg target(s) not currently loaded in
  ///          this library; unsupportedColours — colours the generated code
  ///          could not express and emitted as BLACK (see _convertColor).
  ///          Export still proceeds in both cases.
  function exportDwgAsZip(dwgName) {
    _degradedColours = new Set();
    const { names, missing } = _collectAllDwgs(dwgName);
    const missingSet = new Set(missing);
    const topDwgIdentifier = _identifier(dwgName);
    // Arduino requires the sketch's .ino to sit inside a folder of the
    // exact same name — every file goes inside this one top-level
    // directory so the zip extracts straight into a valid sketch folder.
    const sketchDir = topDwgIdentifier + '_serial/';

    const files = [];
    names.forEach((name) => {
      const dwg = DwgLibrary.get(name);
      if (!dwg) return; // already recorded in `missing`
      const flatDwg = Object.assign({}, dwg, { items: flattenTouchActions(dwg.items || []) });
      const cName = _identifier(name);
      files.push({ filename: sketchDir + 'Dwg_' + cName + '.h', content: _generateHeader(flatDwg) });
      files.push({ filename: sketchDir + 'Dwg_' + cName + '.cpp', content: _generateCpp(flatDwg, missingSet) });
    });

    files.push({ filename: sketchDir + 'pfodMainMenu.h',
                 content: _generateMainMenuHeader(dwgName) });
    files.push({ filename: sketchDir + 'pfodMainMenu.cpp',
                 content: _generateMainMenuCpp(dwgName, topDwgIdentifier) });
    files.push({ filename: sketchDir + topDwgIdentifier + '_serial.ino', content: _generateIno(topDwgIdentifier) });

    // The design that produced this sketch, in the ONE layout the loaders
    // accept — built by saveToFile.js's buildBundleFrom, exactly as the
    // menu designer's own Generate Code does it.
    //
    // This used to be laid out here by hand: the wrapper design and each
    // drawing's json flat together in a `json/` directory. That is a shape
    // nothing writes any more and nothing reads, so a sketch generated
    // from this button could not be loaded back at all — which is the bug
    // this replaces. The wrapper design (see _generateWrapperMenuJSON) is
    // a real one-item design around the drawing being exported, so it
    // bundles like any other.
    const enc = new TextEncoder();
    const bundle = DesignerSaveToFile.buildBundleFrom(
      topDwgIdentifier + '_serial',
      _generateWrapperMenuJSON(dwgName, topDwgIdentifier + '_serial'), names);

    // One zip writer for the whole app (designer/menus/zipBuilder.js). The
    // hand-rolled one that used to live in this file took only text, so it
    // could not have carried the bundle above at all — and being a second
    // implementation, nothing proved readZip could read what it wrote.
    const entries = files.map((f) => ({ path: f.filename, data: enc.encode(f.content) }));
    entries.push({ path: sketchDir + 'menujson/' + bundle.name, data: bundle.bytes });
    DesignerZipBuilder.triggerDownload(topDwgIdentifier + '_serial.zip',
      DesignerZipBuilder.buildZip(entries));

    const unsupportedColours = Array.from(_degradedColours);
    _degradedColours = null;
    return { missingDrawings: missing, unsupportedColours };
  }

  // _collectAllDwgs is also reused by designer/menus/saveToFile.js (Save
  // Design to File bundling every dwg a Drawing menu item links to, plus
  // whatever each reaches via insertDwg, into the same zip).
  // _identifier/_generateHeader/_generateCpp are also reused by
  // designer/menus/generateCode.js — Generate Code (the MENU'S own
  // generator) embeds each Drawing item's real linked dwg using this
  // exact same per-dwg class generator, rather than a generic stub,
  // per direction ("follow the create/edit dwg Generate Serial format
  // for adding the dwg to the menu generated code").
  return Object.freeze({
    exportDwgAsZip,
    collectAllDwgs: _collectAllDwgs,
    // Shared with saveToFile.js's buildDwgBundle — Save Dwg wraps the
    // drawing in the same one-item design so what it writes is an ordinary
    // design bundle and loads through the ordinary path.
    buildWrapperMenuJSON: _generateWrapperMenuJSON,
    // Shared with generateCode.js, which owns the OTHER generator that
    // declares this member. Exported rather than duplicated because the two
    // had already drifted once: this file hard-coded one name while that one
    // derived a name per item, so the same design produced different member
    // names depending on which Generate button was pressed.
    dwgMenuItemCmdVar: _dwgMenuItemCmdVar,
    identifier: _identifier,
    generateDwgHeader: _generateHeader,
    generateDwgCpp: _generateCpp,
  });
})();

window.DwgArduinoExport = DwgArduinoExport;
