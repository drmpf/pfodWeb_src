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
 * Zips everything with a hand-rolled, dependency-free STORE-only zip
 * writer (same one pfodWebDesigner's own createAndDownloadZip uses, ported
 * verbatim: no new external library), and triggers a browser download.
 *
 * Also bundles each included dwg's own re-loadable design as
 * json/<dwgName>.pfodDwg_json (dwgLibrary.js's own buildSaveableDwg() format —
 * same one dwgControlsPanelUI.js's own Export/_downloadDwgAsJson() produces
 * — so the design can be re-opened later via Load Dwg), plus one
 * json/<name>_serial.pfodMenu_json for the wrapper menu itself
 * (_generateWrapperMenuJSON) — so the whole generated sketch's menu can be
 * pulled back into the Designer later via Load Design from File.
 *
 * An insertDwg target that isn't currently loaded in DwgLibrary is
 * reported back to the caller (missingDrawings) but does NOT stop
 * generation: its #include, init() call, and insertDwg().send() line are
 * all emitted as comments instead (see _convertItemToArduino's own doc),
 * so the rest of the sketch still compiles.
 *
 * Exports:    window.DwgArduinoExport.exportDwgAsZip(dwgName)
 * Depends on: DwgLibrary + buildSaveableDwg (dwgDesigner/dwgLibrary.js, loaded earlier),
 *             flattenTouchActions (dwgDesigner/dwgValidate.js, loaded earlier)
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
    if (typeof color !== 'number' || color < 0 || color > 255) return 'dwgsPtr->BLACK';
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
        if (item.filled === true || item.filled === 'true') code += '.filled()';
        if (item.centered === true || item.centered === 'true') code += '.centered()';
        if (item.rounded === true || item.rounded === 'true') code += '.rounded()';
        code = _addIdx(code, item.idxName);
        return code + '.color(' + color + ').size(' + item.xSize + ',' + item.ySize + ')' +
          '.offset(' + xOffset + ',' + yOffset + ').send();';
      }

      case 'circle': {
        let code = 'dwgsPtr->circle()';
        if (item.filled === true || item.filled === 'true') code += '.filled()';
        code = _addIdx(code, item.idxName);
        return code + '.color(' + color + ').radius(' + item.radius + ')' +
          '.offset(' + xOffset + ',' + yOffset + ').send();';
      }

      case 'arc': {
        let code = _addIdx('dwgsPtr->arc()', item.idxName);
        if (item.filled === true || item.filled === 'true') code += '.filled()';
        return code + '.color(' + color + ').radius(' + item.radius + ').start(' + item.start + ')' +
          '.angle(' + item.angle + ').offset(' + xOffset + ',' + yOffset + ').send();';
      }

      case 'label': {
        let code = _addIdx('dwgsPtr->label()', item.idxName);
        const text = (item.text || '').replace(/\n/g, '\\n');
        code += '.color(' + color + ').text("' + text + '")';
        if (item.fontSize) code += '.fontSize(' + item.fontSize + ')';
        if (item.bold === true || item.bold === 'true') code += '.bold()';
        if (item.italic === true || item.italic === 'true') code += '.italic()';
        if (item.underline === true || item.underline === 'true') code += '.underline()';
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
        if (item.bold === true || item.bold === 'true') code += '.bold()';
        if (item.italic === true || item.italic === 'true') code += '.italic()';
        if (item.underline === true || item.underline === 'true') code += '.underline()';
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
        if (item.centered === true || item.centered === 'true') code += '.centered()';
        code += '.size(' + (item.xSize || 1) + ',' + (item.ySize || 1) + ')' +
          '.offset(' + xOffset + ',' + yOffset + ')';
        if (item.filter) {
          const filterName = TOUCH_FILTER_NAMES[item.filter];
          if (filterName) code += '.filter(' + filterName + ')';
        }
        return code + '.send();';
      }

      case 'touchAction': {
        if (!Array.isArray(item.action) || item.action.length === 0) {
          return 'dwgsPtr->touchAction().cmd(' + item.cmdName + ').action(dwgsPtr->rectangle().size(1,1)).send();';
        }
        return item.action.map((actionItem) => {
          const actionCode = _convertItemToArduino(actionItem, missingDwgSet).replace(/\.send\(\);$/, '');
          return 'dwgsPtr->touchAction().cmd(' + item.cmdName + ').action(' + actionCode + ').send();';
        }).join('\n    ');
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
        if (item.cmdName) return 'dwgsPtr->index().cmd(' + item.cmdName + ').send();';
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
  /// milliseconds, while the Dwg Controls Panel edits dwg.refresh in seconds,
  /// and emitting the seconds value unconverted was a real bug.
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
      if (!item.idxName || !(item.indexed === true || item.indexed === 'true')) return;
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
    // dwg.refresh is in SECONDS (the Dwg Controls Panel edits and displays it
    // that way — "Refresh rate (seconds, 0 = no refresh)", max 3600), but
    // pfodParser::sendRefreshAndVersion() takes MILLISECONDS, same as the main
    // menu's own refresh_ms below.  Convert here; emitting the seconds value
    // raw asked the device for a 5 ms refresh on a dwg set to 5 s.
    const refreshMs = (dwg.refresh || 0) * 1000;
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
      if (!item.idxName || !(item.indexed === true || item.indexed === 'true') || item.type === 'index') return;
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
      if (item.idxName && (item.indexed === true || item.indexed === 'true')) {
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

  // ── ZIP writer — hand-rolled, STORE-only (no compression), no external
  //    dependency — ported verbatim from pfodWebDesigner/src/
  //    arduinoExport.js's own createAndDownloadZip(), split into a pure
  //    "build the bytes" function here (download is a separate, thin
  //    step — see exportDwgAsZip) so this stays independently testable. ──

  function _crc32(data) {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c;
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function _u16le(v) { return new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF]); }
  function _u32le(v) { return new Uint8Array([v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]); }

  /// Build a complete, valid (STORE-only) .zip file as a Blob from a flat
  /// list of {filename, content} text files.
  /// @param {Array<{filename:string, content:string}>} files
  /// @returns {Blob}
  function _buildZipBlob(files) {
    const encoder = new TextEncoder();
    const now = new Date();
    const zipDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const zipTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);

    const localParts = [];
    const centralParts = [];
    let offset = 0;

    files.forEach((file) => {
      const nameBytes = encoder.encode(file.filename);
      const contentBytes = encoder.encode(file.content);
      const crc = _crc32(contentBytes);

      const localHeader = new Uint8Array(30 + nameBytes.length);
      let p = 0;
      localHeader.set([0x50, 0x4B, 0x03, 0x04], p); p += 4;
      localHeader.set(_u16le(20), p); p += 2;   // version needed
      localHeader.set(_u16le(0), p); p += 2;    // flags
      localHeader.set(_u16le(0), p); p += 2;    // compression: store
      localHeader.set(_u16le(zipTime), p); p += 2;
      localHeader.set(_u16le(zipDate), p); p += 2;
      localHeader.set(_u32le(crc), p); p += 4;
      localHeader.set(_u32le(contentBytes.length), p); p += 4; // compressed size
      localHeader.set(_u32le(contentBytes.length), p); p += 4; // uncompressed size
      localHeader.set(_u16le(nameBytes.length), p); p += 2;
      localHeader.set(_u16le(0), p); p += 2;     // extra field length
      localHeader.set(nameBytes, p);

      localParts.push(localHeader, contentBytes);

      const centralHeader = new Uint8Array(46 + nameBytes.length);
      p = 0;
      centralHeader.set([0x50, 0x4B, 0x01, 0x02], p); p += 4;
      centralHeader.set(_u16le(20), p); p += 2;  // version made by
      centralHeader.set(_u16le(20), p); p += 2;  // version needed
      centralHeader.set(_u16le(0), p); p += 2;   // flags
      centralHeader.set(_u16le(0), p); p += 2;   // compression: store
      centralHeader.set(_u16le(zipTime), p); p += 2;
      centralHeader.set(_u16le(zipDate), p); p += 2;
      centralHeader.set(_u32le(crc), p); p += 4;
      centralHeader.set(_u32le(contentBytes.length), p); p += 4;
      centralHeader.set(_u32le(contentBytes.length), p); p += 4;
      centralHeader.set(_u16le(nameBytes.length), p); p += 2;
      centralHeader.set(_u16le(0), p); p += 2;   // extra field length
      centralHeader.set(_u16le(0), p); p += 2;   // comment length
      centralHeader.set(_u16le(0), p); p += 2;   // disk number start
      centralHeader.set(_u16le(0), p); p += 2;   // internal attrs
      centralHeader.set(_u32le(0), p); p += 4;   // external attrs
      centralHeader.set(_u32le(offset), p); p += 4; // local header offset
      centralHeader.set(nameBytes, p);

      centralParts.push(centralHeader);
      offset += localHeader.length + contentBytes.length;
    });

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const centralOffset = offset;

    const endRecord = new Uint8Array(22);
    let p = 0;
    endRecord.set([0x50, 0x4B, 0x05, 0x06], p); p += 4;
    endRecord.set(_u16le(0), p); p += 2;  // disk number
    endRecord.set(_u16le(0), p); p += 2;  // disk with central dir
    endRecord.set(_u16le(files.length), p); p += 2; // entries on this disk
    endRecord.set(_u16le(files.length), p); p += 2; // total entries
    endRecord.set(_u32le(centralSize), p); p += 4;
    endRecord.set(_u32le(centralOffset), p); p += 4;
    endRecord.set(_u16le(0), p); p += 2; // comment length

    return new Blob([...localParts, ...centralParts, endRecord], { type: 'application/zip' });
  }

  /// pfodMainMenu.h — the single-dwg main menu wrapper, ported verbatim
  /// from Menu_withDwg/pfodMainMenu.h (the real V4.1.2 generator's own
  /// reference output for "a menu with a single dwg"): one pfodAutoCmd
  /// (dwgMenuItem_Cmd) for the dwg's own menu row, sendMainMenu/
  /// sendMainMenuUpdate left virtual (matching that reference exactly —
  /// this is the one place virtual survives even in the flat, no-Base
  /// style), and the plot_msOffset/clearPlot pair the reference always
  /// declares regardless of whether there's an actual chart (they only
  /// back the {@} "current time" handshake every pfodApp connection does).
  /// This file never depends on the dwg's own name — the same wrapper
  /// shape works for any single top-level dwg.
  /// @returns {string}
  function _generateMainMenuHeader() {
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
      '    void init(pfodCloseConnectionPtr _closeConnectionFnPtr = NULL);\n' +
      '    void handle(pfodParser &parser);\n\n' +
      '  protected:\n' +
      '    pfodAutoCmd dwgMenuItem_Cmd; // drawing menu item\n\n' +
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
      'extern pfodMainMenu mainMenu;\n' +
      '#endif\n' +
      '// ================= end of pfodMainMenu.h  file\n';
  }

  /// pfodMainMenu.cpp — ported verbatim from Menu_withDwg/pfodMainMenu.cpp,
  /// with the wrapped dwg's own identifier substituted in wherever the
  /// reference hard-coded "Cmd" (init() calling dwg_<name>.init(), and
  /// sendMainMenu() printing dwg_<name> as the loadCmd). The dwgMenuItem_Cmd
  /// branch in handle() is for a touch on the dwg's own MENU ROW that its
  /// processDwgCmds() didn't already consume (matches the reference's own
  /// comment) — it is not part of the dwg's own touchZone handling, which
  /// lives entirely inside Dwg_<name>.cpp.
  /// @param {string} topDwgName — the raw (unsanitized) dwg name, for the
  ///        {.} example in the header comment
  /// @param {string} topDwgIdentifier — _identifier(topDwgName)
  /// @returns {string}
  function _generateMainMenuCpp(topDwgName, topDwgIdentifier) {
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
      'pfodMainMenu mainMenu;\n\n' +
      'static Print* debugPtr = NULL;  // local to this file\n' +
      'static const unsigned long refresh_ms = 0; // main menu refresh\n\n' +
      'handle_mainMenuFnPtr init_pfodMainMenu(pfodCloseConnectionPtr _closeConnectionFnPtr) {\n' +
      '  mainMenu.init(_closeConnectionFnPtr);\n' +
      '  return handle_pfodMainMenu;\n' +
      '}\n\n' +
      'void handle_pfodMainMenu(pfodParser& parser) {\n' +
      '  mainMenu.handle(parser);\n' +
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
      '    } else if (parser.cmdEquals(dwgMenuItem_Cmd)) { // user touch not handled by dwg, handle it here\n' +
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
      '  parser.print(dwgMenuItem_Cmd); // drawing menu item cmd\n' +
      '  parser.print(F("~"));\n' +
      '  parser.print(get_dwg_' + topDwgIdentifier + '()); // the drawing\'s loadCmd\n' +
      '  parser.endOfMsg();  // close pfod message. Send }\n' +
      '}\n\n' +
      'void pfodMainMenu::sendMainMenuUpdate(pfodParser& parser) {\n' +
      '  parser.menuUpdate();  // start an Update Menu pfod message. Send {;\n' +
      '  // send menu items\n' +
      '  parser.print(F("|+")); // drawing menu item update\n' +
      '  parser.print(dwgMenuItem_Cmd);\n' +
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
  /// @param {string} dwgName — raw (unsanitized) dwg name
  /// @param {string} topDwgIdentifier — _identifier(dwgName), also the
  ///        sketch folder's own name minus the '_serial' suffix
  /// @returns {string} JSON string
  function _generateWrapperMenuJSON(dwgName, topDwgIdentifier) {
    const rootMenu = {
      promptText: '',
      promptFormat: {
        fontSize: 0, bold: false, italic: false, underline: false,
        flash: false, sound: false, disabled: false,
        fontColour: null, bgColour: null,
      },
      items: [
        {
          type: ITEM_TYPE_DRAWING,
          autoCmd: _makeAutoCmd(ITEM_TYPE_DRAWING, dwgName, []),
          text: dwgName,
          formats: { disabled: false, sound: false, flash: false },
          dwgName: dwgName,
        },
      ],
      refresh_ms: 0,
    };
    const out = {
      format:     EXPORT_FORMAT_TAG,
      schema:     DESIGNER_STATE_SCHEMA_VERSION,
      name:       topDwgIdentifier + '_serial',
      savedAt:    new Date().toISOString(),
      js_ver:     window.JS_VERSION,
      rootMenu:   _exportableMenu(rootMenu),
      connection: 'serial',
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
  /// @returns {{missingDrawings: Array<string>}} — any insertDwg target(s)
  ///          that aren't currently loaded in this library (export still
  ///          proceeds for everything that IS available)
  function exportDwgAsZip(dwgName) {
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
      // buildSaveableDwg (dwgLibrary.js) does its own flattening/stripping,
      // so it gets the RAW (nested) dwg, not flatDwg — matches
      // dwgControlsPanelUI.js's own _downloadDwgAsJson()/.pfodDwg_json format
      // exactly, so this file can be re-loaded via Load Dwg later.
      files.push({ filename: sketchDir + 'json/' + name + '.pfodDwg_json', content: JSON.stringify(buildSaveableDwg(dwg), null, 2) });
    });

    files.push({ filename: sketchDir + 'pfodMainMenu.h', content: _generateMainMenuHeader() });
    files.push({ filename: sketchDir + 'pfodMainMenu.cpp', content: _generateMainMenuCpp(dwgName, topDwgIdentifier) });
    files.push({ filename: sketchDir + topDwgIdentifier + '_serial.ino', content: _generateIno(topDwgIdentifier) });
    // Re-loadable design for the wrapper menu itself (see
    // _generateWrapperMenuJSON's own doc) — alongside each bundled dwg's
    // own json/<dwgName>.pfodDwg_json above.
    files.push({
      filename: sketchDir + 'json/' + topDwgIdentifier + '_serial.pfodMenu_json',
      content: _generateWrapperMenuJSON(dwgName, topDwgIdentifier),
    });

    const blob = _buildZipBlob(files);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = topDwgIdentifier + '_serial.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return { missingDrawings: missing };
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
    identifier: _identifier,
    generateDwgHeader: _generateHeader,
    generateDwgCpp: _generateCpp,
  });
})();

window.DwgArduinoExport = DwgArduinoExport;
