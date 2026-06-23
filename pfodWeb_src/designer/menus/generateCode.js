/*
 * designer/menus/generateCode.js
 *
 * Handler for the 'l' (EM_GENERATE_CODE_CMD) button on the editMenu
 * screen.  Generates a 3-file Arduino sketch ZIP:
 *   <name>/<name>.ino        — Serial setup, loop(), closeConnection()
 *   <name>/pfodMainMenu.h    — typedefs and forward declarations (static)
 *   <name>/pfodMainMenu.cpp  — sendMainMenu / sendMainMenuUpdate /
 *                               handle_pfodMainMenu (fully generated)
 *
 * The ZIP uses STORE compression (no deflate) so no external library
 * is needed.  CRC-32 is computed from scratch.
 *
 * Globals required at call time:
 *   DesignerEditPrompt.buildPromptScreenFormat()
 *   DesignerEditChart.buildChartMsgForCode()
 *   designerItemPrefix()     (formats.js)
 *   designerInlineFormat()   (formats.js)
 *   PFOD_EMPTY               (dispatch.js)
 *   CHART_DATA_INTERVALS / CHART_DATA_INTERVAL_LABELS (state.js)
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DesignerGenerateCode = (() => {

  // ── C++ string escaping ──────────────────────────────────────────
  // Escapes a string for use inside an Arduino F("...") literal.

  function _cppStr(s) {
    return (s || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g,  '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '');
  }

  // ── Effective item formats ───────────────────────────────────────
  // bgColour/fontColour fall back to the parent menu's promptFormat
  // when the item leaves them null (same rule as previewMenu.js).

  function _effectiveFmt(itemFormats, promptFormat) {
    return {
      fontSize:   itemFormats.fontSize,
      bold:       itemFormats.bold,
      italic:     itemFormats.italic,
      underline:  itemFormats.underline,
      flash:      itemFormats.flash,
      sound:      itemFormats.sound,
      fontColour: itemFormats.fontColour !== null ? itemFormats.fontColour : promptFormat.fontColour,
      bgColour:   itemFormats.bgColour   !== null ? itemFormats.bgColour   : promptFormat.bgColour,
    };
  }

  // ── C++ identifier sanitizer ─────────────────────────────────────
  // Replaces any non-alphanumeric character with '_' and prepends '_'
  // if the first character would be a digit.

  function _cppId(s) {
    let id = (s || '').replace(/[^A-Za-z0-9]/g, '_');
    if (id && /^[0-9]/.test(id)) id = '_' + id;
    return id;
  }

  // ── C++ variable name helpers ────────────────────────────────────

  function _cmdVarName(autoCmd) {
    return _cppId(autoCmd);
  }

  function _intVarName(autoCmd) {
    return _cppId(autoCmd).replace(/_Cmd$/, '') + '_var';
  }

  function _pinConstName(autoCmd) {
    return _cppId(autoCmd) + '_pin';
  }

  /// C++ name prefix for a chart's plotting variables/functions —
  /// strips the trailing _Cmd so e.g. autoCmd 'chart_Chart_Cmd' yields
  /// 'chart_Chart' (vars chart_Chart_plot_1_var, fn chart_Chart_sendData).
  function _chartPrefix(autoCmd) {
    return _cppId(autoCmd).replace(/_Cmd$/, '');
  }

  /// Render a plot display max/min string as a C++ float literal —
  /// '10' → '10.0', '1.25' → '1.25', unparsable → '0.0'.
  function _floatLit(s) {
    const f = parseFloat(s);
    if (isNaN(f)) return '0.0';
    return Number.isInteger(f) ? f + '.0' : String(f);
  }

  /// Collect every chart item across the design tree with a comment tag
  /// for where it lives ('main Menu' / 'sub-menu' / 'sub-sub-menu').
  /// @param {object[]} items  main-menu items array
  /// @returns {{item: object, where: string}[]}
  function _allCharts(items) {
    const charts = [];
    for (const item of items) {
      if (item.type === 'chart') charts.push({ item, where: 'main Menu' });
      if (item.type !== 'submenu' || !item.subMenu) continue;
      for (const sItem of item.subMenu.items) {
        if (sItem.type === 'chart') charts.push({ item: sItem, where: 'sub-menu' });
        if (sItem.type !== 'submenu' || !sItem.subMenu) continue;
        for (const ssItem of sItem.subMenu.items) {
          if (ssItem.type === 'chart') charts.push({ item: ssItem, where: 'sub-sub-menu' });
        }
      }
    }
    return charts;
  }

  /// Emit the handle_pfodMainMenu dispatch branch for a chart button —
  /// prints the {= plot message head, a conditional ~C (clear collected
  /// data after reconnect, set by the {@} handler), then the column/plot
  /// body.  Plot CSV data is sent separately by <prefix>_sendData().
  /// @param {object} item     chart item
  /// @param {string} comment  trailing comment for the else-if line
  /// @param {string} context  second comment line (menu location), or ''
  function _chartDispatchBranch(item, comment, context) {
    const msg = DesignerEditChart.buildChartMsgForCode(item);
    let out = '    } else if(parser.cmdEquals(' + _cmdVarName(item.autoCmd) + ')) { ' + comment + '\n';
    if (context) out += '      ' + context + '\n';
    out += '      // return plotting msg.\n';
    out += '      parser.print(F("' + _cppStr(msg.head) + '"));\n';
    out += '      if (clearPlot) {\n';
    out += '        clearPlot = false;\n';
    out += '        parser.print(F("~C"));\n';
    out += '      }\n';
    out += '      parser.print(F("' + _cppStr(msg.body) + '"));\n';
    out += '\n';
    return out;
  }


  // Drawing names use only the _Cmd suffix (stripping type_text_ prefix),
  // so "drawing_Drawing_Cmd" → "Dwg_Cmd" and "drawing_Drawing_Cmd_2" → "Dwg_Cmd_2".
  function _dwgSuffix(autoCmd) {
    const id  = _cppId(autoCmd);
    const pos = id.indexOf('_Cmd');
    return pos >= 0 ? id.substring(pos + 1) : id;
  }

  function _dwgClassName(autoCmd) {
    return 'Dwg_' + _dwgSuffix(autoCmd);
  }

  function _dwgVarName(autoCmd) {
    return 'dwg_' + _dwgSuffix(autoCmd);
  }

  // pfodAutoCmd variable name for a drawing item's tap-cmd: "drawing_Cmd" or "drawing_Cmd_2" etc.
  function _dwgCmdVarName(autoCmd) {
    return 'dwgMenuItem_' + _dwgSuffix(autoCmd);
  }

  function _allDrawings(items) {
    const drawings = [];
    for (const item of items) {
      if (item.type === 'drawing') drawings.push({ item, where: 'main Menu' });
      if (item.type !== 'submenu' || !item.subMenu) continue;
      for (const sItem of item.subMenu.items) {
        if (sItem.type === 'drawing') drawings.push({ item: sItem, where: 'sub-menu' });
        if (sItem.type !== 'submenu' || !sItem.subMenu) continue;
        for (const ssItem of sItem.subMenu.items) {
          if (ssItem.type === 'drawing') drawings.push({ item: ssItem, where: 'sub-sub-menu' });
        }
      }
    }
    return drawings;
  }

  function _generateDwgH(item, state) {
    const className = _dwgClassName(item.autoCmd);
    const guardName = className.toUpperCase() + '_H';
    const connStr = state.connection === 'serial'
      ? 'Serial @ ' + (state.baud || 9600) + ' baud'
      : (state.connection || 'serial');
    let out = '// Board: ' + state.board.name + '\n';
    out += '// Connection: ' + connStr + '\n';
    out += '\n';
    out += '#ifndef ' + guardName + '\n';
    out += '#define ' + guardName + '\n';
    out += '/*\n';
    out += '   ' + className + '.h\n';
    out += ' * (c)2026 Forward Computing and Control Pty. Ltd.\n';
    out += ' * NSW Australia, www.forward.com.au\n';
    out += ' * This code is not warranted to be fit for any purpose. You may only use it at your own risk.\n';
    out += ' * This generated code may be freely used for both private and commercial use\n';
    out += ' * provided this copyright is maintained.\n';
    out += ' */\n';
    out += '#include <pfodDrawing.h>\n';
    out += '\n';
    out += 'class ' + className + ' : public pfodDrawing {\n';
    out += 'public:\n';
    out += '  ' + className + '();\n';
    out += '  void init();\n';
    out += '  bool sendDwg();         // returns true if dwg sent else false i.e. not this dwg\'s loadCmd\n';
    out += '  bool processDwgCmds();  // return true if handled else false\n';
    out += '  unsigned long dwgRefresh;\n';
    out += '\n';
    out += 'protected:\n';
    out += '  void sendFullDrawing();\n';
    out += '  void sendUpdate();\n';
    out += '  void sendIndexedItems();\n';
    out += '};\n';
    out += '\n';
    out += '#endif\n';
    return out;
  }

  function _generateDwgCpp(item, state) {
    const className = _dwgClassName(item.autoCmd);
    const connStr = state.connection === 'serial'
      ? 'Serial @ ' + (state.baud || 9600) + ' baud'
      : (state.connection || 'serial');
    let out = '// Board: ' + state.board.name + '\n';
    out += '// Connection: ' + connStr + '\n';
    out += '\n';
    out += '/*\n';
    out += '   ' + className + '.cpp\n';
    out += ' * (c)2026 Forward Computing and Control Pty. Ltd.\n';
    out += ' * NSW Australia, www.forward.com.au\n';
    out += ' * This code is not warranted to be fit for any purpose. You may only use it at your own risk.\n';
    out += ' * This generated code may be freely used for both private and commercial use\n';
    out += ' * provided this copyright is maintained.\n';
    out += ' */\n';
    out += '\n';
    out += '#include <pfodDrawing.h>\n';
    out += '#include <pfodDebugPtr.h>\n';
    out += '#include "' + className + '.h"\n';
    out += '\n';
    out += '// #define DEBUG\n';
    out += 'static Print* debugPtr = NULL;   // local to this file\n';
    out += '\n';
    out += className + '::' + className + '() {\n';
    out += '  dwgRefresh = 0;\n';
    out += '}\n';
    out += '\n';
    out += 'void ' + className + '::init() {\n';
    out += '  (void)debugPtr;  // suppress not used warning\n';
    out += '#ifdef DEBUG\n';
    out += '  debugPtr = getDebugPtr();\n';
    out += '#endif\n';
    out += '  // <<< add insertDwg.init() calls here for any inserted sub-drawings\n';
    out += '}\n';
    out += '\n';
    out += '// return true if handled else false\n';
    out += '// either handle cmd here or in main sketch\n';
    out += 'bool ' + className + '::processDwgCmds() {\n';
    out += '  return false;  // not handled\n';
    out += '}\n';
    out += '\n';
    out += 'bool ' + className + '::sendDwg() {\n';
    out += '  if (!parserPtr->cmdEquals(*this)) {\n';
    out += '    return false;                // not this dwg\'s loadCmd\n';
    out += '  }                              // else\n';
    out += '  if (parserPtr->isRefresh()) {  // refresh just send update\n';
    out += '    sendUpdate();\n';
    out += '  } else {\n';
    out += '    sendFullDrawing();\n';
    out += '  }\n';
    out += '  return true;\n';
    out += '}\n';
    out += '\n';
    out += '// all the indexed items are included here, edit as needed for updates\n';
    out += 'void ' + className + '::sendIndexedItems() {\n';
    out += '}\n';
    out += '\n';
    out += 'void ' + className + '::sendFullDrawing() {\n';
    out += '  // Start the drawing - edit width, height and background colour as needed\n';
    out += '  dwgsPtr->start(110, 50, dwgsPtr->WHITE);\n';
    out += '  parserPtr->sendRefreshAndVersion(dwgRefresh);\n';
    out += '  // <<< replace with insertDwg() calls to insert your controls\n';
    out += '  // e.g. dwgsPtr->pushZero(x, y, scale);\n';
    out += '  //      dwgsPtr->insertDwg().loadCmd(<yourControl>).send();\n';
    out += '  //      dwgsPtr->popZero();\n';
    out += '  sendIndexedItems();\n';
    out += '  dwgsPtr->end();\n';
    out += '}\n';
    out += '\n';
    out += 'void ' + className + '::sendUpdate() {\n';
    out += '  dwgsPtr->startUpdate();\n';
    out += '  sendIndexedItems();\n';
    out += '  dwgsPtr->end();\n';
    out += '}\n';
    return out;
  }

  function _pinModeStr(pinType) {
    if (pinType === 'digital_input') return 'INPUT';
    return 'OUTPUT';
  }

  function _pinWriteFn(pinType) {
    if (pinType === 'pwm_output') return 'analogWrite';
    if (pinType === 'dac_output')  return 'dacWrite';
    return 'digitalWrite';
  }

  // ── Format comment ───────────────────────────────────────────────
  // Maps pfod color codes to human-readable names for inline code
  // comments.

  const _COLOR_NAME = {
    r: 'red', g: 'green', b: 'blue', bl: 'dark blue', bk: 'black',
    w: 'white', s: 'silver', gy: 'grey', l: 'light blue', y: 'yellow',
    p: 'pink', o: 'orange', f: 'flesh',
  };

  function _colorName(code) {
    return _COLOR_NAME[code] || code;
  }

  function _fmtComment(eff) {
    const parts = [];
    if (eff.bgColour)     parts.push('background ' + _colorName(eff.bgColour));
    if (eff.flash)        parts.push('flash');
    if (eff.sound)        parts.push('sound');
    if (eff.fontSize > 0) parts.push('+' + eff.fontSize + ' size');
    if (eff.fontSize < 0) parts.push(eff.fontSize + ' size');
    if (eff.bold)         parts.push('bold');
    if (eff.italic)       parts.push('italic');
    if (eff.underline)    parts.push('underline');
    if (eff.fontColour)   parts.push(_colorName(eff.fontColour) + ' text');
    return parts.length > 0 ? ' // ' + parts.join(', ') : '';
  }

  // ── pfod message builder (for the .ino comment) ──────────────────
  // Constructs the full pfod menu message as pfodApp would receive it,
  // including refresh/version marker.

  function _pfodMsgForComment(state) {
    const menu = state.getActiveMenu();
    const fmt  = DesignerEditPrompt.buildPromptScreenFormat(menu.promptFormat);
    let out = '{,' + fmt + '~' + menu.promptText + '`0~V1';
    for (let i = 0; i < menu.items.length; i++) {
      const item    = menu.items[i];
      const wireCmd = 'c' + i;
      const eff     = _effectiveFmt(item.formats, menu.promptFormat);
      const slotFmt  = designerItemPrefix(eff);
      const inlineFmt = designerInlineFormat(eff);
      const disabledSlotFlag = (item.type !== 'label' && item.formats.disabled) ? '!' : '';

      if (item.type === 'onoff') {
        const fmtChar = item.displayFormat === 'text' ? 't' : item.displayFormat === 'slider' ? 's' : '';
        out += '|' + wireCmd + disabledSlotFlag + slotFmt +
               '`' + item.current +
               '~' + inlineFmt + (item.text || '') +
               '~' + (item.trailingText || '') +
               '~' + (item.lowText || 'Low') + '\\' + (item.highText || 'High') +
               '~' + fmtChar;
      } else if (item.type === 'onoffdisplay') {
        const fmtChar = item.displayFormat === 'text' ? 't' : item.displayFormat === 'slider' ? 's' : '';
        out += '|!' + wireCmd + slotFmt +
               '`' + item.current +
               '~' + inlineFmt + (item.text || '') +
               '~' + (item.trailingText || '') +
               '~' + (item.lowText || 'Off') + '\\' + (item.highText || 'On') +
               '~' + fmtChar;
      } else if (item.type === 'pwm') {
        const fmtChar = item.displayFormat === 'text' ? 't' : item.displayFormat === 'slider' ? 's' : '';
        out += '|' + wireCmd + disabledSlotFlag + slotFmt +
               '`' + item.currentValue +
               '~' + inlineFmt + (item.text || '') +
               '~' + (item.trailingText || '') +
               '`' + item.maxValue + '`' + item.minValue +
               '~' + (item.maxScaleStr || '') +
               '~' + (item.minScaleStr || '') +
               '~' + fmtChar;
      } else if (item.type === 'label') {
        out += '|!' + wireCmd + slotFmt + '~' + inlineFmt + (item.text || '');
      } else {
        // button (and any future types)
        out += '|' + wireCmd + disabledSlotFlag + slotFmt + '~' + inlineFmt + (item.text || '');
      }
    }
    out += '}';
    return out;
  }

  // ── .ino generator ───────────────────────────────────────────────

  function _generateIno(state) {
    const baud = state.baud || 9600;
    const name = state.name;
    const connStr = state.connection === 'serial'
      ? 'Serial @ ' + baud + ' baud'
      : (state.connection || 'serial');
    let out = '// Board: ' + state.board.name + '\n';
    out += '// Connection: ' + connStr + '\n';
    out += '\n';
    out += '// Using Serial and ' + baud + ' baud for send and receive\n';
    out += '// Serial D0 (RX) and D1 (TX) on Arduino Uno, Micro, ProMicro, Due, Mega, Mini, Nano, Pro and Ethernet\n';
    out += '/* Code generated by pfodWeb ' + (window.JS_VERSION || '') + '\n';
    out += ' */\n';
    out += '/*\n';
    out += ' * (c)2014-2026 Forward Computing and Control Pty. Ltd.\n';
    out += ' * NSW Australia, www.forward.com.au\n';
    out += ' * This code is not warranted to be fit for any purpose. You may only use it at your own risk.\n';
    out += ' * This generated code may be freely used for both private and commercial use\n';
    out += ' * provided this copyright is maintained.\n';
    out += ' */\n';
    out += '\n';
    out += '// install pfodParser from the Arduino Library Manager \n';
    out += '//    OR download the libraries from http://www.forward.com.au/pfod/pfodParserLibraries/index.html\n';
    out += '// pfodParser V4.1.2+ contains pfodParser, pfodSecurity\n';
    out += '#include <pfodParser.h>\n';
    out += '#include "pfodMainMenu.h"\n';
    out += '\n';
    out += 'const char version[] = "V1";\n';
    out += 'pfodParser parser; // create a parser to handle the pfod messages, version set by pfodMainMenu\n';
    out += 'handle_mainMenuFnPtr handle_mainMenu; // pointer to fn the handles the main menu\n';
    out += '\n';
    out += 'void closeConnection(Stream *io) {\n';
    out += '  (void)(io);\n';
    out += '  // add any special code here to force connection to be dropped\n';
    out += '}\n';
    out += '\n';
    out += '// the setup routine runs once on reset:\n';
    out += 'void setup() {\n';
    out += '  Serial.begin(' + baud + ');\n';
    out += '  for (int i=3; i>0; i--) {\n';
    out += '    // wait a few secs to see if we are being programmed\n';
    out += '    delay(1000);\n';
    out += '  }\n';
    out += '  \n';
    out += '  parser.connect(&Serial); // connect the parser to the i/o stream\n';
    out += '  pfodMainMenu_setVersion(version); // set version\n';
    out += '  handle_mainMenu = init_pfodMainMenu(closeConnection); // intialize main menu, returns pointer to mainMenu handler\n';
    out += '  // <<<<<<<<< Your extra setup code goes here\n';
    out += '}\n';
    out += '\n';
    out += 'void loop() {\n';
    out += '  handle_mainMenu(parser); // handle i/o via this parser\n';
    out += '}\n';
    out += '\n ';
    return out;
  }

  // ── .h generator (static content) ────────────────────────────────

  function _generateH(state) {
    const connStr = state.connection === 'serial'
      ? 'Serial @ ' + (state.baud || 9600) + ' baud'
      : (state.connection || 'serial');
    let out = '// Board: ' + state.board.name + '\n';
    out += '// Connection: ' + connStr + '\n';
    out += '\n';
    out += '#ifndef PFOD_MAIN_MENU_H\n';
    out += '#define PFOD_MAIN_MENU_H\n';
    out += '/*   \n';
    out += '   pfodMainMenu.h\n';
    out += ' * (c)2026 Forward Computing and Control Pty. Ltd.\n';
    out += ' * NSW Australia, www.forward.com.au\n';
    out += ' * This code is not warranted to be fit for any purpose. You may only use it at your own risk.\n';
    out += ' * This generated code may be freely used for both private and commercial use\n';
    out += ' * provided this copyright is maintained.\n';
    out += ' */\n';
    out += '\n';
    out += '#include <pfodParser.h>\n';
    out += 'typedef void (*pfodCloseConnectionPtr)(Stream *);  // the pointer to the method that handles parser closeConnection calls\n';
    out += 'typedef  void (*handle_mainMenuFnPtr)(pfodParser & parser);\n';
    out += 'handle_mainMenuFnPtr init_pfodMainMenu(pfodCloseConnectionPtr = NULL);\n';
    out += 'void handle_pfodMainMenu(pfodParser & parser);\n';
    out += 'void pfodMainMenu_setVersion(const char *version);\n';
    out += '#endif\n';
    return out;
  }

  // ── .cpp generator ───────────────────────────────────────────────

  function _generateCpp(state) {
    const name  = state.name;
    const menu  = state.getActiveMenu();
    const items = menu.items;
    const charts = _allCharts(items);
    const drawings = _allDrawings(items);
    const connStr = state.connection === 'serial'
      ? 'Serial @ ' + (state.baud || 9600) + ' baud'
      : (state.connection || 'serial');

    let out = '// Board: ' + state.board.name + '\n';
    out += '// Connection: ' + connStr + '\n';
    out += '\n';
    out += '/* ===== pfod Command for ' + name + ' ====\n';
    out += 'pfodApp msg {.} --> ' + _pfodMsgForComment(state) + '\n';
    out += ' */\n';
    out += '/*   \n';
    out += '   pfodMainMenu.cpp\n';
    out += ' * (c)2026 Forward Computing and Control Pty. Ltd.\n';
    out += ' * NSW Australia, www.forward.com.au\n';
    out += ' * This code is not warranted to be fit for any purpose. You may only use it at your own risk.\n';
    out += ' * This generated code may be freely used for both private and commercial use\n';
    out += ' * provided this copyright is maintained.\n';
    out += ' */\n';
    out += '\n';
    out += '#include "pfodMainMenu.h"\n';
    out += '#include <pfodParser.h>\n';
    out += '#include <pfodDebugPtr.h>\n';
    if (drawings.length > 0) {
      out += '#include <pfodDwgs.h>\n';
      out += '#include <pfodDrawing.h>\n';
      for (const { item } of drawings) {
        out += '#include "' + _dwgClassName(item.autoCmd) + '.h"\n';
      }
    }
    out += '\n';
    out += '// #define DEBUG\n';
    out += 'static Print* debugPtr = NULL;  // local to this file\n';
    out += 'static bool initialized = false;\n';
    out += 'static const char emptyVersion[] = "";\n';
    out += 'static const char* version = NULL;\n';
    out += 'static const unsigned long refresh_ms = ' + menu.refresh_ms + '; // main menu refresh\n';
    // Refresh interval constants for each sub-menu.
    for (const item of items) {
      if (item.type !== 'submenu' || !item.subMenu) continue;
      out += 'static const unsigned long ' + _cppId(item.autoCmd) + '_refresh_ms = ' + item.subMenu.refresh_ms + ';\n';
      // Refresh interval constants for each sub-sub-menu.
      for (const sItem of item.subMenu.items) {
        if (sItem.type !== 'submenu' || !sItem.subMenu) continue;
        out += 'static const unsigned long ' + _cppId(sItem.autoCmd) + '_refresh_ms = ' + sItem.subMenu.refresh_ms + ';\n';
      }
    }
    out += 'static int swap01(int in);\n';
    if (charts.length > 0) {
      out += 'float getPlotVarScaling(long varMax, long varMin, float displayMax, float displayMin);\n';
      for (const { item } of charts) {
        out += 'void ' + _chartPrefix(item.autoCmd) + '_sendData(pfodParser &parser);\n';
      }
    }
    out += '\n';

    // Int variable declarations for stateful items (onoff / pwm).
    for (const item of items) {
      if (item.type === 'onoff') {
        const intVar  = _intVarName(item.autoCmd);
        const leading = _cppStr((item.text || '').replace(/\n/g, ' ').trim() || 'output');
        const initVar = (item.pin && item.pin.invertOutput) ? (item.current === 0 ? 1 : 0) : item.current;
        out += 'int ' + intVar + ' = ' + initVar + '; // name the variable for \'' + leading + '\'  0=' + (item.lowText || 'Low') + ' 1=' + (item.highText || 'High') + ' \n';
        if (item.pulse && item.pulse !== 'none') {
          const cmdVar   = _cmdVarName(item.autoCmd);
          const pulseSecs = (item.pulse_ms / 1000.0).toFixed(1);
          out += 'static unsigned long ' + cmdVar + '_pulseStartTime=0; // the time when ' + cmdVar + ' pulse started\n';
          out += 'static bool ' + cmdVar + '_pulseRunning = false; // true when ' + cmdVar + ' pulse running\n';
          out += 'static unsigned long ' + cmdVar + '_PULSE_LENGTH = ' + item.pulse_ms + '; // ' + pulseSecs + ' secs\n';
          out += 'static void ' + cmdVar + '_checkPulse();\n';
        }
      } else if (item.type === 'pwm') {
        const intVar  = _intVarName(item.autoCmd);
        const leading = _cppStr((item.text || '').replace(/\n/g, ' ').trim() || 'slider');
        out += 'int ' + intVar + ' = ' + item.minValue + '; // initial value for \'' + leading + '\' range ' + item.minValue + ' to ' + item.maxValue + '\n';
      } else if (item.type === 'onoffdisplay') {
        const intVar  = _intVarName(item.autoCmd);
        const leading = _cppStr((item.text || '').replace(/\n/g, ' ').trim() || 'display');
        out += 'int ' + intVar + ' = ' + item.current + '; // display variable for \'' + leading + '\'  0=' + (item.lowText || 'Off') + ' 1=' + (item.highText || 'On') + ' \n';
      } else if (item.type === 'datadisplay') {
        const intVar  = _intVarName(item.autoCmd);
        const leading = _cppStr((item.text || '').replace(/\n/g, ' ').trim() || 'reading');
        out += 'int ' + intVar + ' = ' + item.minValue + '; // data display variable for \'' + leading + '\' range ' + item.minValue + ' to ' + item.maxValue + '\n';
        if (item.pin && item.pin.name) {
          out += 'pfodDelay ' + _cppId(item.autoCmd) + '_adcTimer; // ADC timer\n';
          out += 'unsigned long ' + _cppId(item.autoCmd) + '_ADC_READ_INTERVAL = 1000; // 1sec, edit this to change adc read interval\n';
          out += 'void ' + _cppId(item.autoCmd) + '_readADC();\n';
        }
      }
    }
    out += '\n';

    // pfodAutoCmd variable declarations — one per item (main menu).
    for (const item of items) {
      const label = _cppStr((item.text || '').replace(/\n/g, ' ').trim() || item.type);
      if (item.type === 'drawing') {
        out += 'pfodAutoCmd ' + _dwgCmdVarName(item.autoCmd) + '; // drawing menu item\n';
      } else {
        out += 'pfodAutoCmd ' + _cmdVarName(item.autoCmd) + '; // ' + item.type + ' -- \'' + label + '\'\n';
      }
    }
    // pfodAutoCmd and int variable declarations for sub-menu child items.
    for (const item of items) {
      if (item.type !== 'submenu' || !item.subMenu) continue;
      for (const sItem of item.subMenu.items) {
        const sLabel = _cppStr((sItem.text || '').replace(/\n/g, ' ').trim() || sItem.type);
        if (sItem.type === 'onoff') {
          const sIntVar = _intVarName(sItem.autoCmd);
          const sInitVar = sItem.current;
          out += 'int ' + sIntVar + ' = ' + sInitVar + '; // sub-menu variable for \'' + sLabel + '\'\n';
        } else if (sItem.type === 'pwm') {
          const sIntVar = _intVarName(sItem.autoCmd);
          out += 'int ' + sIntVar + ' = ' + sItem.minValue + '; // sub-menu slider variable for \'' + sLabel + '\'\n';
        }
        if (sItem.type === 'drawing') {
          out += 'pfodAutoCmd ' + _dwgCmdVarName(sItem.autoCmd) + '; // drawing\n';
        } else {
          out += 'pfodAutoCmd ' + _cmdVarName(sItem.autoCmd) + '; // ' + sItem.type + ' (sub-menu) -- \'' + sLabel + '\'\n';
        }
      }
    }
    // pfodAutoCmd and int variable declarations for sub-sub-menu child items.
    for (const item of items) {
      if (item.type !== 'submenu' || !item.subMenu) continue;
      for (const sItem of item.subMenu.items) {
        if (sItem.type !== 'submenu' || !sItem.subMenu) continue;
        for (const ssItem of sItem.subMenu.items) {
          const ssLabel = _cppStr((ssItem.text || '').replace(/\n/g, ' ').trim() || ssItem.type);
          if (ssItem.type === 'onoff') {
            const ssIntVar = _intVarName(ssItem.autoCmd);
            out += 'int ' + ssIntVar + ' = ' + ssItem.current + '; // sub-sub-menu variable for \'' + ssLabel + '\'\n';
          } else if (ssItem.type === 'pwm') {
            const ssIntVar = _intVarName(ssItem.autoCmd);
            out += 'int ' + ssIntVar + ' = ' + ssItem.minValue + '; // sub-sub-menu slider variable for \'' + ssLabel + '\'\n';
          }
          if (ssItem.type === 'drawing') {
            out += 'pfodAutoCmd ' + _dwgCmdVarName(ssItem.autoCmd) + '; // drawing\n';
          } else {
            out += 'pfodAutoCmd ' + _cmdVarName(ssItem.autoCmd) + '; // ' + ssItem.type + ' (sub-sub-menu) -- \'' + ssLabel + '\'\n';
          }
        }
      }
    }
    // Pin constant declarations for allocated pins.
    for (const item of items) {
      if (item.pin && item.pin.name) {
        const pinLabel = _cppStr((item.text || '').replace(/\n/g, ' ').trim() || item.type);
        out += 'const int ' + _pinConstName(item.autoCmd) + ' = ' + item.pin.codeName + '; // name the ' + item.pin.type.replace(/_/g, ' ') + ' pin for \'' + pinLabel + '\'\n';
      }
    }
    // Pin constant declarations for chart plots connected to analog inputs.
    for (const { item } of charts) {
      const prefix = _chartPrefix(item.autoCmd);
      for (let n = 1; n <= 3; n++) {
        const p = item.plots[n - 1];
        if (p.pin && p.pin.name) {
          const plotLabel = _cppStr((p.plotLabel || '').replace(/\n/g, ' ').trim() || ('plot ' + n));
          out += 'const int ' + prefix + '_plot_' + n + '_pin = ' + p.pin.codeName + '; // name the analog input pin for \'' + plotLabel + '\'\n';
        }
      }
    }
    out += '\n';

    for (const { item, where } of drawings) {
      const label = _cppStr((item.text || '').replace(/\n/g, ' ').trim() || 'drawing');
      out += _dwgClassName(item.autoCmd) + ' ' + _dwgVarName(item.autoCmd) + '; // drawing (' + where + ') -- \'' + label + '\'\n';
    }
    if (drawings.length > 0) out += '\n';
    out += 'static unsigned long plot_msOffset = 0; // set by {@} response\n';
    out += 'static bool clearPlot = false; // set by the {@} response code\n';
    out += '\n';
    for (const { item } of charts) {
      const prefix = _chartPrefix(item.autoCmd);
      const chartLabel = _cppStr((item.text || '').replace(/\n/g, ' ').trim() || 'chart');
      out += '// plotting data variables for \'' + chartLabel + '\'\n';
      for (let n = 1; n <= 3; n++) {
        const p = item.plots[n - 1];
        out += 'static int ' + prefix + '_plot_' + n + '_varMin = ' + p.dataRangeMin + ';\n';
        out += 'static int ' + prefix + '_plot_' + n + '_var = ' + prefix + '_plot_' + n + '_varMin;\n';
        out += 'static float ' + prefix + '_plot_' + n + '_scaling;\n';
        out += 'static float ' + prefix + '_plot_' + n + '_varDisplayMin = ' + _floatLit(p.displayMin) + ';\n';
      }
      const intervalMs    = CHART_DATA_INTERVALS[item.dataIntervalIdx] || CHART_DATA_INTERVALS[0];
      const intervalLabel = CHART_DATA_INTERVAL_LABELS[item.dataIntervalIdx] || CHART_DATA_INTERVAL_LABELS[0];
      out += 'static pfodDelay ' + prefix + '_plotDataTimer; // plot data timer\n';
      out += 'static unsigned long ' + prefix + '_PLOT_DATA_INTERVAL = ' + intervalMs + ';// ms == ' + intervalLabel + ', edit this to change the plot data interval\n';
    }
    if (charts.length > 0) out += '\n';
    out += 'static pfodCloseConnectionPtr closeConnectionFnPtr = NULL;\n';
    out += '\n';
    out += 'void pfodMainMenu_setVersion(const char *version_) {\n';
    out += '  version = version_;\n';
    out += '}\n';
    out += '\n';
    out += 'handle_mainMenuFnPtr init_pfodMainMenu(pfodCloseConnectionPtr _closeConnectionFnPtr) {\n';
    out += '  if (initialized) {\n';
    out += '    return handle_pfodMainMenu;\n';
    out += '  }\n';
    out += '  (void)debugPtr;  // suppress not used warning\n';
    out += '#ifdef DEBUG\n';
    out += '  debugPtr = getDebugPtr();\n';
    out += '#endif\n';
    out += '  initialized = true;\n';
    out += '  if (!version) {\n';
    out += '    version = emptyVersion;\n';
    out += '  }\n';
    out += '  closeConnectionFnPtr = _closeConnectionFnPtr;\n';
    for (const item of items) {
      const label = _cppStr((item.text || '').replace(/\n/g, ' ').trim() || item.type);
      if (item.type === 'onoff') {
        const intVar  = _intVarName(item.autoCmd);
        const initVar = (item.pin && item.pin.invertOutput) ? (item.current === 0 ? 1 : 0) : item.current;
        out += '  ' + intVar + ' = ' + initVar + ';\n';
        if (item.pin && item.pin.name) {
          const pinConst  = _pinConstName(item.autoCmd);
          const initLevel = initVar ? 'HIGH' : 'LOW';
          out += '  pinMode(' + pinConst + ', ' + _pinModeStr(item.pin.type) + '); // ' + item.pin.type.replace(/_/g, ' ') + ' for \'' + label + '\' is initially ' + initLevel + ',\n';
          out += '  ' + _pinWriteFn(item.pin.type) + '(' + pinConst + ',' + intVar + '); // set output\n';
        }
      } else if (item.type === 'pwm') {
        const intVar = _intVarName(item.autoCmd);
        out += '  ' + intVar + ' = ' + item.minValue + ';\n';
        if (item.pin && item.pin.name) {
          const pinConst = _pinConstName(item.autoCmd);
          out += '  pinMode(' + pinConst + ', OUTPUT); // output for \'' + label + '\' is initially ' + item.minValue + ',\n';
          out += '  ' + _pinWriteFn(item.pin.type) + '(' + pinConst + ',' + intVar + '); // set output\n';
        }
      } else if (item.type === 'onoffdisplay') {
        const intVar = _intVarName(item.autoCmd);
        out += '  ' + intVar + ' = ' + item.current + ';\n';
        if (item.pin && item.pin.name) {
          const pinConst = _pinConstName(item.autoCmd);
          out += '  pinMode(' + pinConst + ', INPUT); // input for \'' + label + '\'\n';
        }
      } else if (item.type === 'datadisplay') {
        const intVar = _intVarName(item.autoCmd);
        out += '  ' + intVar + ' = ' + item.minValue + ';\n';
        if (item.pin && item.pin.name) {
          out += '  ' + _cppId(item.autoCmd) + '_adcTimer.start(' + _cppId(item.autoCmd) + '_ADC_READ_INTERVAL); // start ADC timer\n';
        }
      }
    }
    for (const { item } of charts) {
      const prefix = _chartPrefix(item.autoCmd);
      out += '\n';
      out += '  // calculate the plot vars scaling here once to reduce computation\n';
      for (let n = 1; n <= 3; n++) {
        const p = item.plots[n - 1];
        out += '  ' + prefix + '_plot_' + n + '_scaling = getPlotVarScaling(' + p.dataRangeMax + ',' +
               prefix + '_plot_' + n + '_varMin,' + _floatLit(p.displayMax) + ',' +
               prefix + '_plot_' + n + '_varDisplayMin);\n';
      }
      out += '\n';
      out += '  ' + prefix + '_plotDataTimer.start(' + prefix + '_PLOT_DATA_INTERVAL); // start plot timer\n';
    }
    for (const { item } of drawings) {
      const label = _cppStr((item.text || '').replace(/\n/g, ' ').trim() || 'drawing');
      out += '  ' + _dwgVarName(item.autoCmd) + '.init(); // initialize drawing -- \'' + label + '\'\n';
    }
    out += '  return handle_pfodMainMenu;\n';
    out += '}\n';
    out += '\n';
    out += 'void sendMainMenu(pfodParser& parser);\n';
    out += 'void sendMainMenuUpdate(pfodParser& parser);\n';
    // Forward declarations for sub-menu and sub-sub-menu send/update functions.
    for (const item of items) {
      if (item.type !== 'submenu') continue;
      out += 'void sendSubMenu_' + _cppId(item.autoCmd) + '(pfodParser& parser);\n';
      out += 'void sendSubMenuUpdate_' + _cppId(item.autoCmd) + '(pfodParser& parser);\n';
      if (!item.subMenu) continue;
      for (const sItem of item.subMenu.items) {
        if (sItem.type !== 'submenu') continue;
        out += 'void sendSubSubMenu_' + _cppId(sItem.autoCmd) + '(pfodParser& parser);\n';
        out += 'void sendSubSubMenuUpdate_' + _cppId(sItem.autoCmd) + '(pfodParser& parser);\n';
      }
    }
    out += '\n';

    // handle_pfodMainMenu
    out += '// the loop routine runs over and over again forever:\n';
    out += 'void handle_pfodMainMenu(pfodParser& parser) {\n';
    out += '  if (!initialized) {\n';
    out += '    if (debugPtr) {\n';
    out += '      debugPtr->println(" Need to call init_pfodMainMenu() from setup().");\n';
    out += '    }\n';
    out += '  }\n';
    out += '  parser.setVersion(version); \n';
    out += '  uint8_t cmd = parser.parse(); // parse incoming data from connection\n';
    out += '  // parser returns non-zero when a pfod command is fully parsed\n';
    out += '  if (cmd != 0) { // have parsed a complete msg { to }\n';
    out += '    uint8_t* pfodFirstArg = parser.getFirstArg(); // may point to \\0 if no arguments in this msg.\n';
    out += '    pfod_MAYBE_UNUSED(pfodFirstArg); // may not be used, just suppress warning\n';
    out += '    long pfodLongRtn; // used for parsing long return arguments, if any\n';
    out += '    pfod_MAYBE_UNUSED(pfodLongRtn); // may not be used, just suppress warning\n';
    out += '    if (\'.\' == cmd) {\n';
    out += '      // pfodApp has connected and sent {.} , it is asking for the main menu\n';
    out += '      if (!parser.isRefresh()) {\n';
    out += '        sendMainMenu(parser); // send back the menu designed\n';
    out += '      } else {\n';
    out += '        sendMainMenuUpdate(parser); // menu is cached just send update\n';
    out += '      }\n';
    out += '\n';
    out += '      // handle {@} request\n';
    out += '    } else if(\'@\'==cmd) { // pfodApp requested \'current\' time\n';
    out += '      plot_msOffset = millis(); // capture current millis as offset rawdata timestamps\n';
    out += '      clearPlot = true; // clear plot on reconnect as have new plot_msOffset\n';
    out += '      parser.print(F("{@`0}")); // return `0 as \'current\' raw data milliseconds\n';
    out += '    \n';
    out += '\n';
    out += '    // now handle commands returned from button/sliders\n';

    for (const item of items) {
      const label = _cppStr((item.text || '').replace(/\n/g, ' ').trim() || item.type);
      if (item.type === 'onoff') {
        const intVar = _intVarName(item.autoCmd);
        out += '    } else if(parser.cmdEquals(' + _cmdVarName(item.autoCmd) + ')) { // user moved slider -- \'' + label + '\'\n';
        out += '      // in the main Menu of ' + name + ' \n';
        out += '      // set output based on slider 0=' + (item.lowText || 'Low') + ' 1=' + (item.highText || 'High') + ' \n';
        out += '      parser.parseLong(pfodFirstArg,&pfodLongRtn); // parse first arg as a long\n';
        if (item.pin && item.pin.invertOutput) {
          out += '      ' + intVar + ' = swap01((int)pfodLongRtn); // set variable\n';
        } else {
          out += '      ' + intVar + ' = (int)pfodLongRtn; // set variable\n';
        }
        if (item.pin && item.pin.name) {
          out += '      ' + _pinWriteFn(item.pin.type) + '(' + _pinConstName(item.autoCmd) + ',' + intVar + '); // set output\n';
        }
        if (item.pulse && item.pulse !== 'none') {
          const cmdVar     = _cmdVarName(item.autoCmd);
          const triggerVal = item.pulse === 'low' ? 0 : 1;
          const pulseDir   = item.pulse === 'low' ? 'low pulse' : 'high pulse';
          out += '      if(' + intVar + ' == ' + triggerVal + ') {\n';
          out += '        ' + cmdVar + '_pulseStartTime = millis(); // ' + pulseDir + '\n';
          out += '        ' + cmdVar + '_pulseRunning = true;\n';
          out += '      } else {\n';
          out += '        ' + cmdVar + '_pulseRunning = false;\n';
          out += '      }\n';
        }
        out += '      sendMainMenuUpdate(parser); // always send back a pfod msg otherwise pfodApp will disconnect.\n';
        out += '\n';
      } else if (item.type === 'pwm') {
        const intVar = _intVarName(item.autoCmd);
        out += '    } else if(parser.cmdEquals(' + _cmdVarName(item.autoCmd) + ')) { // user moved slider -- \'' + label + '\'\n';
        out += '      // in the main Menu of ' + name + ' \n';
        out += '      parser.parseLong(pfodFirstArg,&pfodLongRtn); // parse first arg as a long\n';
        out += '      ' + intVar + ' = (int)pfodLongRtn; // set variable\n';
        if (item.pin && item.pin.name) {
          out += '      ' + _pinWriteFn(item.pin.type) + '(' + _pinConstName(item.autoCmd) + ',' + intVar + '); // set output\n';
        }
        out += '      sendMainMenuUpdate(parser); // always send back a pfod msg otherwise pfodApp will disconnect.\n';
        out += '\n';
      } else if (item.type === 'button') {
        out += '    } else if(parser.cmdEquals(' + _cmdVarName(item.autoCmd) + ')) { // user pressed -- \'' + label + '\'\n';
        out += '      // in the main Menu of ' + name + ' \n';
        out += '      // << add your action code here for this button\n';
        out += '      parser.print(F("{}")); // change this return as needed.\n';
        out += '       // always send back a pfod msg otherwise pfodApp will disconnect.\n';
        out += '\n';
      } else if (item.type === 'chart') {
        out += _chartDispatchBranch(item, '// user pressed -- \'' + label + '\'',
                                    '// in the main Menu of ' + name + ' ');
      } else if (item.type === 'label') {
        out += '//    } else if(parser.cmdEquals(' + _cmdVarName(item.autoCmd) + ')) { // this is a label. pfodApp NEVER sends this cmd -- \'' + label + '\'\n';
        out += '//      // in the main Menu of ' + name + ' \n';
        out += '\n';
      } else if (item.type === 'onoffdisplay') {
        out += '//    } else if(parser.cmdEquals(' + _cmdVarName(item.autoCmd) + ')) { // this is a display item. pfodApp NEVER sends this cmd -- \'' + label + '\'\n';
        out += '//      // in the main Menu of ' + name + ' \n';
        out += '\n';
      } else if (item.type === 'datadisplay') {
        out += '//    } else if(parser.cmdEquals(' + _cmdVarName(item.autoCmd) + ')) { // this is a data display. pfodApp NEVER sends this cmd -- \'' + label + '\'\n';
        out += '//      // in the main Menu of ' + name + ' \n';
        out += '\n';
      } else if (item.type === 'submenu') {
        out += '    } else if(parser.cmdEquals(' + _cmdVarName(item.autoCmd) + ')) { // user pressed sub-menu button -- \'' + label + '\'\n';
        out += '      // in the main Menu of ' + name + ' \n';
        out += '      if (!parser.isRefresh()) {\n';
        out += '        sendSubMenu_' + _cppId(item.autoCmd) + '(parser); // send the sub-menu\n';
        out += '      } else {\n';
        out += '        sendSubMenuUpdate_' + _cppId(item.autoCmd) + '(parser); // refresh the sub-menu\n';
        out += '      }\n';
        out += '\n';
      } else if (item.type === 'drawing') {
        out += '    } else if(parser.cmdEquals(' + _dwgCmdVarName(item.autoCmd) + ')) { // user touch not handled by dwg, handle it here\n';
        out += '      // in the main Menu of ' + name + '\n';
        out += '      // drawing loadCmd handled internally by ' + _dwgVarName(item.autoCmd) + '.init()\n';
        out += '      // add touchZone handling here for input not handled in processDwgCmds()\n';
        out += '      sendMainMenuUpdate(parser); // always send back a pfod msg otherwise pfodApp will disconnect.\n';
        out += '\n';
      }
    }

    // Handlers for sub-menu child items (onoff / pwm / button / submenu).
    for (const item of items) {
      if (item.type !== 'submenu' || !item.subMenu) continue;
      for (const sItem of item.subMenu.items) {
        const sLabel = _cppStr((sItem.text || '').replace(/\n/g, ' ').trim() || sItem.type);
        if (sItem.type === 'onoff') {
          const sIntVar = _intVarName(sItem.autoCmd);
          out += '    } else if(parser.cmdEquals(' + _cmdVarName(sItem.autoCmd) + ')) { // sub-menu slider -- \'' + sLabel + '\'\n';
          out += '      parser.parseLong(pfodFirstArg,&pfodLongRtn);\n';
          out += '      ' + sIntVar + ' = (int)pfodLongRtn; // set variable\n';
          out += '      sendSubMenuUpdate_' + _cppId(item.autoCmd) + '(parser); // resend sub-menu update\n';
          out += '\n';
        } else if (sItem.type === 'pwm') {
          const sIntVar = _intVarName(sItem.autoCmd);
          out += '    } else if(parser.cmdEquals(' + _cmdVarName(sItem.autoCmd) + ')) { // sub-menu slider -- \'' + sLabel + '\'\n';
          out += '      parser.parseLong(pfodFirstArg,&pfodLongRtn);\n';
          out += '      ' + sIntVar + ' = (int)pfodLongRtn; // set variable\n';
          out += '      sendSubMenuUpdate_' + _cppId(item.autoCmd) + '(parser); // resend sub-menu update\n';
          out += '\n';
        } else if (sItem.type === 'button') {
          out += '    } else if(parser.cmdEquals(' + _cmdVarName(sItem.autoCmd) + ')) { // sub-menu button -- \'' + sLabel + '\'\n';
          out += '      // << add your action code here for this sub-menu button\n';
          out += '      parser.print(F("{}")); // change this return as needed.\n';
          out += '\n';
        } else if (sItem.type === 'chart') {
          out += _chartDispatchBranch(sItem, '// sub-menu chart button -- \'' + sLabel + '\'', '');
        } else if (sItem.type === 'submenu') {
          out += '    } else if(parser.cmdEquals(' + _cmdVarName(sItem.autoCmd) + ')) { // user pressed sub-sub-menu button -- \'' + sLabel + '\'\n';
          out += '      if (!parser.isRefresh()) {\n';
          out += '        sendSubSubMenu_' + _cppId(sItem.autoCmd) + '(parser); // send the sub-sub-menu\n';
          out += '      } else {\n';
          out += '        sendSubSubMenuUpdate_' + _cppId(sItem.autoCmd) + '(parser); // refresh the sub-sub-menu\n';
          out += '      }\n';
          out += '\n';
        } else if (sItem.type === 'drawing') {
          out += '    } else if(parser.cmdEquals(' + _dwgCmdVarName(sItem.autoCmd) + ')) { // user touch not handled by dwg, handle it here\n';
          out += '      sendSubMenuUpdate_' + _cppId(item.autoCmd) + '(parser);\n';
          out += '\n';
        }
      }
    }
    // Handlers for sub-sub-menu child items (onoff / pwm / button).
    for (const item of items) {
      if (item.type !== 'submenu' || !item.subMenu) continue;
      for (const sItem of item.subMenu.items) {
        if (sItem.type !== 'submenu' || !sItem.subMenu) continue;
        for (const ssItem of sItem.subMenu.items) {
          const ssLabel = _cppStr((ssItem.text || '').replace(/\n/g, ' ').trim() || ssItem.type);
          if (ssItem.type === 'onoff') {
            const ssIntVar = _intVarName(ssItem.autoCmd);
            out += '    } else if(parser.cmdEquals(' + _cmdVarName(ssItem.autoCmd) + ')) { // sub-sub-menu slider -- \'' + ssLabel + '\'\n';
            out += '      parser.parseLong(pfodFirstArg,&pfodLongRtn);\n';
            out += '      ' + ssIntVar + ' = (int)pfodLongRtn; // set variable\n';
            out += '      sendSubSubMenuUpdate_' + _cppId(sItem.autoCmd) + '(parser); // resend sub-sub-menu update\n';
            out += '\n';
          } else if (ssItem.type === 'pwm') {
            const ssIntVar = _intVarName(ssItem.autoCmd);
            out += '    } else if(parser.cmdEquals(' + _cmdVarName(ssItem.autoCmd) + ')) { // sub-sub-menu slider -- \'' + ssLabel + '\'\n';
            out += '      parser.parseLong(pfodFirstArg,&pfodLongRtn);\n';
            out += '      ' + ssIntVar + ' = (int)pfodLongRtn; // set variable\n';
            out += '      sendSubSubMenuUpdate_' + _cppId(sItem.autoCmd) + '(parser); // resend sub-sub-menu update\n';
            out += '\n';
          } else if (ssItem.type === 'button') {
            out += '    } else if(parser.cmdEquals(' + _cmdVarName(ssItem.autoCmd) + ')) { // sub-sub-menu button -- \'' + ssLabel + '\'\n';
            out += '      // << add your action code here for this sub-sub-menu button\n';
            out += '      parser.print(F("{}")); // change this return as needed.\n';
            out += '\n';
          } else if (ssItem.type === 'chart') {
            out += _chartDispatchBranch(ssItem, '// sub-sub-menu chart button -- \'' + ssLabel + '\'', '');
          } else if (ssItem.type === 'drawing') {
            out += '    } else if(parser.cmdEquals(' + _dwgCmdVarName(ssItem.autoCmd) + ')) { // user touch not handled by dwg, handle it here\n';
            out += '      sendSubSubMenuUpdate_' + _cppId(sItem.autoCmd) + '(parser);\n';
            out += '\n';
          }
        }
      }
    }

    out += '    } else if (\'!\' == cmd) {\n';
    out += '      // CloseConnection command\n';
    out += '      closeConnectionFnPtr(parser.getPfodAppStream());\n';
    out += '    } else {\n';
    out += '      // unknown command\n';
    out += '      parser.print(F("{}")); // always send back a pfod msg otherwise pfodApp will disconnect.\n';
    out += '    }\n';
    out += '  }\n';
    for (const item of items) {
      if (item.type === 'onoff' && item.pulse && item.pulse !== 'none') {
        out += '  ' + _cmdVarName(item.autoCmd) + '_checkPulse(); \n';
      }
    }
    for (const item of items) {
      if (item.type === 'onoffdisplay' && item.pin && item.pin.name) {
        const intVar   = _intVarName(item.autoCmd);
        const pinConst = _pinConstName(item.autoCmd);
        if (item.pin.invertOutput) {
          out += '  ' + intVar + ' = swap01(digitalRead(' + pinConst + ')); // read input pin (inverted)\n';
        } else {
          out += '  ' + intVar + ' = digitalRead(' + pinConst + '); // read input pin\n';
        }
      }
    }
    for (const item of items) {
      if (item.type === 'datadisplay' && item.pin && item.pin.name) {
        out += '  ' + _cppId(item.autoCmd) + '_readADC(); \n';
      }
    }
    for (const { item } of charts) {
      out += '  ' + _chartPrefix(item.autoCmd) + '_sendData(parser);\n';
    }
    out += '  //  <<<<<<<<<<<  Your other loop() code goes here \n';
    out += '  \n';
    out += '}\n';
    out += '\n';
    out += '\n';

    // Per-chart sendData functions — read plot inputs on the plot data
    // timer and stream one CSV record (time, plot1..plot3) per interval.
    for (const { item } of charts) {
      const prefix = _chartPrefix(item.autoCmd);
      out += 'void ' + prefix + '_sendData(pfodParser &parser) {\n';
      out += '  if (' + prefix + '_plotDataTimer.justFinished()) {\n';
      out += '    ' + prefix + '_plotDataTimer.repeat(); // restart plot data timer, without drift\n';
      out += '    // assign values to plot variables from your loop variables or read ADC inputs\n';
      for (let n = 1; n <= 3; n++) {
        const p = item.plots[n - 1];
        if (p.pin && p.pin.name) {
          out += '    ' + prefix + '_plot_' + n + '_var = analogRead(' + prefix + '_plot_' + n + '_pin); // read input to plot \n';
        } else {
          out += '    ' + prefix + '_plot_' + n + '_var = ' + prefix + '_plot_' + n + '_varMin; //<<< replace this Min value with your actual data \n';
        }
      }
      out += '    // send plot data in CSV format\n';
      out += '    parser.print(millis()-plot_msOffset);// time in milliseconds\n';
      for (let n = 1; n <= 3; n++) {
        out += '    parser.print(\',\'); parser.print(((float)(' + prefix + '_plot_' + n + '_var-' +
               prefix + '_plot_' + n + '_varMin)) * ' + prefix + '_plot_' + n + '_scaling + ' +
               prefix + '_plot_' + n + '_varDisplayMin);\n';
      }
      out += '    parser.println(); // end of CSV data record\n';
      out += '  }\n';
      out += '}\n';
      out += '\n';
    }
    if (charts.length > 0) {
      out += '\n';
      out += 'float getPlotVarScaling(long varMax, long varMin, float displayMax, float displayMin) {\n';
      out += '  long varRange = varMax - varMin;\n';
      out += '  if (varRange == 0) { varRange = 1; } // prevent divide by zero\n';
      out += '  return (displayMax - displayMin)/((float)varRange);\n';
      out += '}\n';
      out += '\n';
    }

    // sendMainMenu
    const promptFmtStr = DesignerEditPrompt.buildPromptScreenFormat(menu.promptFormat);
    const promptText   = _cppStr(menu.promptText || '');

    out += 'void sendMainMenu(pfodParser& parser) {\n';
    out += '  // !! Remember to change the parser version string OR Clear the cache\n';
    out += '  //    every time you edit this method\n';
    out += '  parser.menu();  // start a Menu screen pfod message.  Send {,\n';
    out += '  // send menu background, format, prompt, refresh and version\n';
    out += '  parser.print(F("' + _cppStr(promptFmtStr) + '~' + promptText + '"));' + _fmtComment(menu.promptFormat) + '\n';
    out += '  parser.sendRefreshAndVersion(refresh_ms); // send the menu version \n';
    out += '  // send menu items\n';

    for (const item of items) {
      const eff      = _effectiveFmt(item.formats, menu.promptFormat);
      const slotFmt  = designerItemPrefix(eff);
      const inlineFmt = designerInlineFormat(eff);
      const fmtCmt   = _fmtComment(eff);

      const allFmt = slotFmt + inlineFmt;
      if (item.type === 'onoff') {
        const intVar      = _intVarName(item.autoCmd);
        const disabledFlag = item.formats.disabled ? '!' : '';
        const fmtChar     = item.displayFormat === 'text' ? 't' : item.displayFormat === 'slider' ? 's' : '';
        const lowEsc      = _cppStr(item.lowText || 'Low');
        const highEsc     = _cppStr(item.highText || 'High');
        const trailEsc    = _cppStr(item.trailingText || '');
        const textEsc     = _cppStr(item.text || '');
        out += '  parser.slider(' + _cmdVarName(item.autoCmd) + '); // start Slider\n';
        if (disabledFlag) out += '  parser.print(F("!")); // disable this menu item\n';
        if (allFmt) out += '  parser.print(F("' + _cppStr(allFmt) + '"));' + fmtCmt + '\n';
        out += '  parser.print(\'`\');\n';
        if (item.pin && item.pin.invertOutput) {
          out += '  parser.print(swap01(' + intVar + ')); // output the current state 0 ' + (item.lowText || 'Low') + ' or 1 ' + (item.highText || 'High') + ' (swapped)\n';
        } else {
          out += '  parser.print(' + intVar + '); // output the current value \n';
        }
        out += '  parser.print(F("~' + textEsc + '~' + trailEsc + '~' + lowEsc + '\\\\' + highEsc + '~' + fmtChar + '"));\n';
        out += '  // Note the \\\\\\\\ inside the \' \'s to send \\\\ ...\n';
      } else if (item.type === 'pwm') {
        const intVar      = _intVarName(item.autoCmd);
        const disabledFlag = item.formats.disabled ? '!' : '';
        const fmtChar     = item.displayFormat === 'text' ? 't' : item.displayFormat === 'slider' ? 's' : '';
        const textEsc     = _cppStr(item.text || '');
        const trailEsc    = _cppStr(item.trailingText || '');
        const maxScaleEsc = _cppStr(item.maxScaleStr || '');
        const minScaleEsc = _cppStr(item.minScaleStr || '');
        out += '  parser.slider(' + _cmdVarName(item.autoCmd) + '); // start Slider\n';
        if (disabledFlag) out += '  parser.print(F("!")); // disable this menu item\n';
        if (allFmt) out += '  parser.print(F("' + _cppStr(allFmt) + '"));' + fmtCmt + '\n';
        out += '  parser.print(\'`\');\n';
        out += '  parser.print(' + intVar + '); // output the current value \n';
        out += '  parser.print(F("~' + textEsc + '~' + trailEsc + '`' + item.maxValue + '`' + item.minValue + '~' + maxScaleEsc + '~' + minScaleEsc + '~' + fmtChar + '"));\n';
      } else if (item.type === 'button') {
        const disabledFlag = item.formats.disabled ? '!' : '';
        const textEsc      = _cppStr(item.text || '');
        out += '  parser.button(' + _cmdVarName(item.autoCmd) + '); // start Button\n';
        if (disabledFlag) out += '  parser.print(F("!")); // disable this menu item\n';
        if (allFmt) out += '  parser.print(F("' + _cppStr(allFmt) + '"));' + fmtCmt + '\n';
        out += '  parser.print(F("~' + textEsc + '"));\n';
      } else if (item.type === 'chart') {
        const disabledFlag = item.formats.disabled ? '!' : '';
        const textEsc      = _cppStr(item.text || '');
        out += '  parser.button(' + _cmdVarName(item.autoCmd) + '); // start Button (opens chart)\n';
        if (disabledFlag) out += '  parser.print(F("!")); // disable this menu item\n';
        if (allFmt) out += '  parser.print(F("' + _cppStr(allFmt) + '"));' + fmtCmt + '\n';
        out += '  parser.print(F("~' + textEsc + '"));\n';
      } else if (item.type === 'label') {
        const textEsc = _cppStr(item.text || '');
        out += '  parser.label(' + _cmdVarName(item.autoCmd) + '); // start Label\n';
        if (allFmt) out += '  parser.print(F("' + _cppStr(allFmt) + '"));' + fmtCmt + '\n';
        out += '  parser.print(F("~' + textEsc + '"));\n';
      } else if (item.type === 'onoffdisplay') {
        const intVar     = _intVarName(item.autoCmd);
        const fmtChar    = item.displayFormat === 'text' ? 't' : item.displayFormat === 'slider' ? 's' : '';
        const lowEsc     = _cppStr(item.lowText || 'Off');
        const highEsc    = _cppStr(item.highText || 'On');
        const trailEsc   = _cppStr(item.trailingText || '');
        const textEsc    = _cppStr(item.text || '');
        out += '  parser.onOffDisplay(' + _cmdVarName(item.autoCmd) + '); // start On/Off Display (outputs |!cmd)\n';
        if (allFmt) out += '  parser.print(F("' + _cppStr(allFmt) + '"));' + fmtCmt + '\n';
        out += '  parser.print(\'`\');\n';
        out += '  parser.print(' + intVar + '); // output the current state 0 ' + (item.lowText || 'Off') + ' or 1 ' + (item.highText || 'On') + '\n';
        out += '  parser.print(F("~' + textEsc + '~' + trailEsc + '~' + lowEsc + '\\\\' + highEsc + '~' + fmtChar + '"));\n';
        out += '  // Note the \\\\\\\\ inside the \' \'s to send \\\\ ...\n';
      } else if (item.type === 'datadisplay') {
        const intVar      = _intVarName(item.autoCmd);
        const fmtChar     = item.displayFormat === 'text' ? 't' : item.displayFormat === 'slider' ? 's' : '';
        const textEsc     = _cppStr(item.text || '');
        const unitsEsc    = _cppStr(item.trailingText || '');
        const maxScaleEsc = _cppStr(item.maxScaleStr || '');
        const minScaleEsc = _cppStr(item.minScaleStr || '');
        out += '  parser.onOffDisplay(' + _cmdVarName(item.autoCmd) + '); // start Data Display (outputs |!cmd)\n';
        if (allFmt) out += '  parser.print(F("' + _cppStr(allFmt) + '"));' + fmtCmt + '\n';
        out += '  parser.print(\'`\');\n';
        out += '  parser.print(' + intVar + '); // output the current value\n';
        out += '  parser.print(F("~' + textEsc + '~' + unitsEsc + '`' + item.maxValue + '`' + item.minValue + '~' + maxScaleEsc + '~' + minScaleEsc + '~' + fmtChar + '"));\n';
      } else if (item.type === 'submenu') {
        const textEsc = _cppStr(item.text || '');
        out += '  parser.button(' + _cmdVarName(item.autoCmd) + '); // start Button (opens sub-menu)\n';
        if (allFmt) out += '  parser.print(F("' + _cppStr(allFmt) + '"));' + fmtCmt + '\n';
        out += '  parser.print(F("~' + textEsc + '"));\n';
      } else if (item.type === 'drawing') {
        const disabledFlag = item.formats.disabled ? '!' : '';
        out += '  parser.print(F("|+")); // start Drawing\n';
        out += '  parser.print(' + _dwgCmdVarName(item.autoCmd) + '); // drawing menu item cmd\n';
        if (disabledFlag) out += '  parser.print(F("!")); // disable this menu item\n';
        if (allFmt) out += '  parser.print(F("' + _cppStr(allFmt) + '"));' + fmtCmt + '\n';
        out += '  parser.print(F("~"));\n';
        out += '  parser.print(' + _dwgVarName(item.autoCmd) + '); // the drawing\'s loadCmd\n';
      }
    }

    out += '  parser.endOfMsg();  // close pfod message. Send }\n';
    out += '}\n';
    out += '\n';

    // sendMainMenuUpdate
    out += 'void sendMainMenuUpdate(pfodParser& parser) {\n';
    out += '  parser.menuUpdate();  // start an Update Menu pfod message. Send {;\n';
    out += '  // send menu items\n';

    for (const item of items) {
      if (item.type === 'onoff') {
        const intVar      = _intVarName(item.autoCmd);
        const disabledFlag = item.formats.disabled ? '!' : '';
        out += '  parser.slider(' + _cmdVarName(item.autoCmd) + '); // start Slider\n';
        if (disabledFlag) out += '  parser.print(F("!")); // disable this menu item\n';
        out += '  parser.print(\'`\');\n';
        if (item.pin && item.pin.invertOutput) {
          out += '  parser.print(swap01(' + intVar + ')); // output the current state 0 ' + (item.lowText || 'Low') + ' or 1 ' + (item.highText || 'High') + ' (swapped)\n';
        } else {
          out += '  parser.print(' + intVar + '); // output the current value \n';
        }
      } else if (item.type === 'pwm') {
        const intVar      = _intVarName(item.autoCmd);
        const disabledFlag = item.formats.disabled ? '!' : '';
        out += '  parser.slider(' + _cmdVarName(item.autoCmd) + '); // start Slider\n';
        if (disabledFlag) out += '  parser.print(F("!")); // disable this menu item\n';
        out += '  parser.print(\'`\');\n';
        out += '  parser.print(' + intVar + '); // output the current value \n';
      } else if (item.type === 'button') {
        const disabledFlag = item.formats.disabled ? '!' : '';
        out += '  parser.button(' + _cmdVarName(item.autoCmd) + '); // start Button\n';
        if (disabledFlag) out += '  parser.print(F("!")); // disable this menu item\n';
      } else if (item.type === 'chart') {
        const disabledFlag = item.formats.disabled ? '!' : '';
        out += '  parser.button(' + _cmdVarName(item.autoCmd) + '); // start Button (chart)\n';
        if (disabledFlag) out += '  parser.print(F("!")); // disable this menu item\n';
      } else if (item.type === 'label') {
        out += '  parser.label(' + _cmdVarName(item.autoCmd) + '); // start Label\n';
      } else if (item.type === 'onoffdisplay') {
        const intVar = _intVarName(item.autoCmd);
        out += '  parser.onOffDisplay(' + _cmdVarName(item.autoCmd) + '); // start On/Off Display (outputs |!cmd)\n';
        out += '  parser.print(\'`\');\n';
        out += '  parser.print(' + intVar + '); // output the current state\n';
      } else if (item.type === 'datadisplay') {
        const intVar = _intVarName(item.autoCmd);
        out += '  parser.onOffDisplay(' + _cmdVarName(item.autoCmd) + '); // start Data Display (outputs |!cmd)\n';
        out += '  parser.print(\'`\');\n';
        out += '  parser.print(' + intVar + '); // output the current value\n';
      } else if (item.type === 'submenu') {
        out += '  parser.button(' + _cmdVarName(item.autoCmd) + '); // start Button (sub-menu)\n';
      } else if (item.type === 'drawing') {
        const disabledFlag = item.formats.disabled ? '!' : '';
        out += '  parser.print(F("|+")); // drawing menu item update\n';
        out += '  parser.print(' + _dwgCmdVarName(item.autoCmd) + ');\n';
        if (disabledFlag) out += '  parser.print(F("!")); // disable this menu item\n';
      }
    }

    out += '  parser.endOfMsg();  // close pfod message. Send }\n';
    out += '  // ============ end of menu ===========\n';
    out += '}\n';
    out += '\n';

    // Sub-menu send functions — one per submenu item in the main menu.
    for (const item of items) {
      if (item.type !== 'submenu' || !item.subMenu) continue;
      const subMenu = item.subMenu;
      const subPromptFmtStr = DesignerEditPrompt.buildPromptScreenFormat(subMenu.promptFormat);
      const subPromptText   = _cppStr(subMenu.promptText || '');
      out += 'void sendSubMenu_' + _cppId(item.autoCmd) + '(pfodParser& parser) {\n';
      out += '  parser.menu();  // start a Menu screen pfod message.  Send {,\n';
      out += '  parser.print(F("' + _cppStr(subPromptFmtStr) + '~' + subPromptText + '"));' + _fmtComment(subMenu.promptFormat) + '\n';
      out += '  parser.sendRefreshAndVersion(' + _cppId(item.autoCmd) + '_refresh_ms);\n';
      for (let si = 0; si < subMenu.items.length; si++) {
        const sItem    = subMenu.items[si];
        const sLabel   = _cppStr((sItem.text || '').replace(/\n/g, ' ').trim() || sItem.type);
        const sEff     = _effectiveFmt(sItem.formats, subMenu.promptFormat);
        const sSlotFmt  = designerItemPrefix(sEff);
        const sInlineFmt = designerInlineFormat(sEff);
        const sAllFmt  = sSlotFmt + sInlineFmt;
        const sFmtCmt  = _fmtComment(sEff);
        if (sItem.type === 'button') {
          const sDisabledFlag = sItem.formats.disabled ? '!' : '';
          const sTextEsc = _cppStr(sItem.text || '');
          out += '  parser.button(' + _cmdVarName(sItem.autoCmd) + '); // start Button -- \'' + sLabel + '\'\n';
          if (sDisabledFlag) out += '  parser.print(F("!")); // disable this menu item\n';
          if (sAllFmt) out += '  parser.print(F("' + _cppStr(sAllFmt) + '"));' + sFmtCmt + '\n';
          out += '  parser.print(F("~' + sTextEsc + '"));\n';
        } else if (sItem.type === 'label') {
          const sTextEsc = _cppStr(sItem.text || '');
          out += '  parser.label(' + _cmdVarName(sItem.autoCmd) + '); // start Label -- \'' + sLabel + '\'\n';
          if (sAllFmt) out += '  parser.print(F("' + _cppStr(sAllFmt) + '"));' + sFmtCmt + '\n';
          out += '  parser.print(F("~' + sTextEsc + '"));\n';
        } else if (sItem.type === 'onoff') {
          const sIntVar  = _intVarName(sItem.autoCmd);
          const sFmtChar = sItem.displayFormat === 'text' ? 't' : sItem.displayFormat === 'slider' ? 's' : '';
          const sDisabledFlag = sItem.formats.disabled ? '!' : '';
          out += '  parser.slider(' + _cmdVarName(sItem.autoCmd) + '); // start Slider -- \'' + sLabel + '\'\n';
          if (sDisabledFlag) out += '  parser.print(F("!")); // disable this menu item\n';
          if (sAllFmt) out += '  parser.print(F("' + _cppStr(sAllFmt) + '"));' + sFmtCmt + '\n';
          out += '  parser.print(\'`\');\n';
          out += '  parser.print(' + sIntVar + '); // output the current value\n';
          out += '  parser.print(F("~' + _cppStr(sItem.text || '') + '~' + _cppStr(sItem.trailingText || '') + '~' + _cppStr(sItem.lowText || 'Low') + '\\\\' + _cppStr(sItem.highText || 'High') + '~' + sFmtChar + '"));\n';
        } else if (sItem.type === 'pwm') {
          const sIntVar  = _intVarName(sItem.autoCmd);
          const sFmtChar = sItem.displayFormat === 'text' ? 't' : sItem.displayFormat === 'slider' ? 's' : '';
          const sDisabledFlag = sItem.formats.disabled ? '!' : '';
          out += '  parser.slider(' + _cmdVarName(sItem.autoCmd) + '); // start Slider -- \'' + sLabel + '\'\n';
          if (sDisabledFlag) out += '  parser.print(F("!")); // disable this menu item\n';
          if (sAllFmt) out += '  parser.print(F("' + _cppStr(sAllFmt) + '"));' + sFmtCmt + '\n';
          out += '  parser.print(\'`\');\n';
          out += '  parser.print(' + sIntVar + '); // output the current value\n';
          out += '  parser.print(F("~' + _cppStr(sItem.text || '') + '~' + _cppStr(sItem.trailingText || '') + '`' + sItem.maxValue + '`' + sItem.minValue + '~' + _cppStr(sItem.maxScaleStr || '') + '~' + _cppStr(sItem.minScaleStr || '') + '~' + sFmtChar + '"));\n';
        } else if (sItem.type === 'chart') {
          const sDisabledFlag = sItem.formats.disabled ? '!' : '';
          const sTextEsc = _cppStr(sItem.text || '');
          out += '  parser.button(' + _cmdVarName(sItem.autoCmd) + '); // start Button (opens chart) -- \'' + sLabel + '\'\n';
          if (sDisabledFlag) out += '  parser.print(F("!")); // disable this menu item\n';
          if (sAllFmt) out += '  parser.print(F("' + _cppStr(sAllFmt) + '"));' + sFmtCmt + '\n';
          out += '  parser.print(F("~' + sTextEsc + '"));\n';
        } else if (sItem.type === 'submenu') {
          const sTextEsc = _cppStr(sItem.text || '');
          out += '  parser.button(' + _cmdVarName(sItem.autoCmd) + '); // start Button (opens sub-sub-menu) -- \'' + sLabel + '\'\n';
          if (sAllFmt) out += '  parser.print(F("' + _cppStr(sAllFmt) + '"));' + sFmtCmt + '\n';
          out += '  parser.print(F("~' + sTextEsc + '"));\n';
        } else if (sItem.type === 'drawing') {
          const sDisabledFlag = sItem.formats.disabled ? '!' : '';
          out += '  parser.print(F("|+")); // start Drawing -- \'' + sLabel + '\'\n';
          out += '  parser.print(' + _dwgCmdVarName(sItem.autoCmd) + '); // drawing menu item cmd\n';
          if (sDisabledFlag) out += '  parser.print(F("!")); // disable this menu item\n';
          if (sAllFmt) out += '  parser.print(F("' + _cppStr(sAllFmt) + '"));' + sFmtCmt + '\n';
          out += '  parser.print(F("~"));\n';
          out += '  parser.print(' + _dwgVarName(sItem.autoCmd) + '); // the drawing\'s loadCmd\n';
        }
        // onoffdisplay, datadisplay sub-menu items omitted for brevity
      }
      out += '  parser.endOfMsg();\n';
      out += '}\n';
      out += '\n';

      // sendSubMenuUpdate — sends {; with current values only (no format strings).
      out += 'void sendSubMenuUpdate_' + _cppId(item.autoCmd) + '(pfodParser& parser) {\n';
      out += '  parser.menuUpdate();  // start an Update Menu pfod message. Send {;\n';
      for (let si = 0; si < subMenu.items.length; si++) {
        const sItem = subMenu.items[si];
        if (sItem.type === 'onoff') {
          const sIntVar = _intVarName(sItem.autoCmd);
          out += '  parser.slider(' + _cmdVarName(sItem.autoCmd) + '); // start Slider\n';
          out += '  parser.print(\'`\');\n';
          out += '  parser.print(' + sIntVar + '); // output the current value\n';
        } else if (sItem.type === 'pwm') {
          const sIntVar = _intVarName(sItem.autoCmd);
          out += '  parser.slider(' + _cmdVarName(sItem.autoCmd) + '); // start Slider\n';
          out += '  parser.print(\'`\');\n';
          out += '  parser.print(' + sIntVar + '); // output the current value\n';
        } else if (sItem.type === 'button') {
          out += '  parser.button(' + _cmdVarName(sItem.autoCmd) + '); // start Button\n';
        } else if (sItem.type === 'chart') {
          out += '  parser.button(' + _cmdVarName(sItem.autoCmd) + '); // start Button (chart)\n';
        } else if (sItem.type === 'label') {
          out += '  parser.label(' + _cmdVarName(sItem.autoCmd) + '); // start Label\n';
        } else if (sItem.type === 'submenu') {
          out += '  parser.button(' + _cmdVarName(sItem.autoCmd) + '); // start Button (sub-sub-menu)\n';
        } else if (sItem.type === 'drawing') {
          const sDisabledFlag = sItem.formats.disabled ? '!' : '';
          out += '  parser.print(F("|+")); // drawing menu item update\n';
          out += '  parser.print(' + _dwgCmdVarName(sItem.autoCmd) + ');\n';
          if (sDisabledFlag) out += '  parser.print(F("!")); // disable this menu item\n';
        }
      }
      out += '  parser.endOfMsg();\n';
      out += '}\n';
      out += '\n';
    }

    // sendSubSubMenu and sendSubSubMenuUpdate functions.
    for (const item of items) {
      if (item.type !== 'submenu' || !item.subMenu) continue;
      for (const sItem of item.subMenu.items) {
        if (sItem.type !== 'submenu' || !sItem.subMenu) continue;
        const ssMenu = sItem.subMenu;
        const ssPromptFmtStr = DesignerEditPrompt.buildPromptScreenFormat(ssMenu.promptFormat);
        const ssPromptText   = _cppStr(ssMenu.promptText || '');
        out += 'void sendSubSubMenu_' + _cppId(sItem.autoCmd) + '(pfodParser& parser) {\n';
        out += '  parser.menu();  // start a Menu screen pfod message.  Send {,\n';
        out += '  parser.print(F("' + _cppStr(ssPromptFmtStr) + '~' + ssPromptText + '"));' + _fmtComment(ssMenu.promptFormat) + '\n';
        out += '  parser.sendRefreshAndVersion(' + _cppId(sItem.autoCmd) + '_refresh_ms);\n';
        for (let ssi = 0; ssi < ssMenu.items.length; ssi++) {
          const ssItem    = ssMenu.items[ssi];
          const ssLabel   = _cppStr((ssItem.text || '').replace(/\n/g, ' ').trim() || ssItem.type);
          const ssEff     = _effectiveFmt(ssItem.formats, ssMenu.promptFormat);
          const ssSlotFmt  = designerItemPrefix(ssEff);
          const ssInlineFmt = designerInlineFormat(ssEff);
          const ssAllFmt  = ssSlotFmt + ssInlineFmt;
          const ssFmtCmt  = _fmtComment(ssEff);
          if (ssItem.type === 'button') {
            const ssDisabledFlag = ssItem.formats.disabled ? '!' : '';
            const ssTextEsc = _cppStr(ssItem.text || '');
            out += '  parser.button(' + _cmdVarName(ssItem.autoCmd) + '); // start Button -- \'' + ssLabel + '\'\n';
            if (ssDisabledFlag) out += '  parser.print(F("!")); // disable this menu item\n';
            if (ssAllFmt) out += '  parser.print(F("' + _cppStr(ssAllFmt) + '"));' + ssFmtCmt + '\n';
            out += '  parser.print(F("~' + ssTextEsc + '"));\n';
          } else if (ssItem.type === 'chart') {
            const ssDisabledFlag = ssItem.formats.disabled ? '!' : '';
            const ssTextEsc = _cppStr(ssItem.text || '');
            out += '  parser.button(' + _cmdVarName(ssItem.autoCmd) + '); // start Button (opens chart) -- \'' + ssLabel + '\'\n';
            if (ssDisabledFlag) out += '  parser.print(F("!")); // disable this menu item\n';
            if (ssAllFmt) out += '  parser.print(F("' + _cppStr(ssAllFmt) + '"));' + ssFmtCmt + '\n';
            out += '  parser.print(F("~' + ssTextEsc + '"));\n';
          } else if (ssItem.type === 'label') {
            const ssTextEsc = _cppStr(ssItem.text || '');
            out += '  parser.label(' + _cmdVarName(ssItem.autoCmd) + '); // start Label -- \'' + ssLabel + '\'\n';
            if (ssAllFmt) out += '  parser.print(F("' + _cppStr(ssAllFmt) + '"));' + ssFmtCmt + '\n';
            out += '  parser.print(F("~' + ssTextEsc + '"));\n';
          } else if (ssItem.type === 'drawing') {
            const ssDisabledFlag = ssItem.formats.disabled ? '!' : '';
            out += '  parser.print(F("|+")); // start Drawing -- \'' + ssLabel + '\'\n';
            out += '  parser.print(' + _dwgCmdVarName(ssItem.autoCmd) + '); // drawing menu item cmd\n';
            if (ssDisabledFlag) out += '  parser.print(F("!")); // disable this menu item\n';
            if (ssAllFmt) out += '  parser.print(F("' + _cppStr(ssAllFmt) + '"));' + ssFmtCmt + '\n';
            out += '  parser.print(F("~"));\n';
            out += '  parser.print(' + _dwgVarName(ssItem.autoCmd) + '); // the drawing\'s loadCmd\n';
          } else if (ssItem.type === 'onoff') {
            const ssIntVar  = _intVarName(ssItem.autoCmd);
            const ssFmtChar = ssItem.displayFormat === 'text' ? 't' : ssItem.displayFormat === 'slider' ? 's' : '';
            const ssDisabledFlag = ssItem.formats.disabled ? '!' : '';
            out += '  parser.slider(' + _cmdVarName(ssItem.autoCmd) + '); // start Slider -- \'' + ssLabel + '\'\n';
            if (ssDisabledFlag) out += '  parser.print(F("!")); // disable this menu item\n';
            if (ssAllFmt) out += '  parser.print(F("' + _cppStr(ssAllFmt) + '"));' + ssFmtCmt + '\n';
            out += '  parser.print(\'`\');\n';
            out += '  parser.print(' + ssIntVar + '); // output the current value\n';
            out += '  parser.print(F("~' + _cppStr(ssItem.text || '') + '~' + _cppStr(ssItem.trailingText || '') + '~' + _cppStr(ssItem.lowText || 'Low') + '\\\\' + _cppStr(ssItem.highText || 'High') + '~' + ssFmtChar + '"));\n';
          } else if (ssItem.type === 'pwm') {
            const ssIntVar  = _intVarName(ssItem.autoCmd);
            const ssFmtChar = ssItem.displayFormat === 'text' ? 't' : ssItem.displayFormat === 'slider' ? 's' : '';
            const ssDisabledFlag = ssItem.formats.disabled ? '!' : '';
            out += '  parser.slider(' + _cmdVarName(ssItem.autoCmd) + '); // start Slider -- \'' + ssLabel + '\'\n';
            if (ssDisabledFlag) out += '  parser.print(F("!")); // disable this menu item\n';
            if (ssAllFmt) out += '  parser.print(F("' + _cppStr(ssAllFmt) + '"));' + ssFmtCmt + '\n';
            out += '  parser.print(\'`\');\n';
            out += '  parser.print(' + ssIntVar + '); // output the current value\n';
            out += '  parser.print(F("~' + _cppStr(ssItem.text || '') + '~' + _cppStr(ssItem.trailingText || '') + '`' + ssItem.maxValue + '`' + ssItem.minValue + '~' + _cppStr(ssItem.maxScaleStr || '') + '~' + _cppStr(ssItem.minScaleStr || '') + '~' + ssFmtChar + '"));\n';
          }
        }
        out += '  parser.endOfMsg();\n';
        out += '}\n';
        out += '\n';

        // sendSubSubMenuUpdate — sends {; with current values only.
        out += 'void sendSubSubMenuUpdate_' + _cppId(sItem.autoCmd) + '(pfodParser& parser) {\n';
        out += '  parser.menuUpdate();  // start an Update Menu pfod message. Send {;\n';
        for (let ssi = 0; ssi < ssMenu.items.length; ssi++) {
          const ssItem = ssMenu.items[ssi];
          if (ssItem.type === 'onoff') {
            const ssIntVar = _intVarName(ssItem.autoCmd);
            out += '  parser.slider(' + _cmdVarName(ssItem.autoCmd) + '); // start Slider\n';
            out += '  parser.print(\'`\');\n';
            out += '  parser.print(' + ssIntVar + '); // output the current value\n';
          } else if (ssItem.type === 'pwm') {
            const ssIntVar = _intVarName(ssItem.autoCmd);
            out += '  parser.slider(' + _cmdVarName(ssItem.autoCmd) + '); // start Slider\n';
            out += '  parser.print(\'`\');\n';
            out += '  parser.print(' + ssIntVar + '); // output the current value\n';
          } else if (ssItem.type === 'button') {
            out += '  parser.button(' + _cmdVarName(ssItem.autoCmd) + '); // start Button\n';
          } else if (ssItem.type === 'chart') {
            out += '  parser.button(' + _cmdVarName(ssItem.autoCmd) + '); // start Button (chart)\n';
          } else if (ssItem.type === 'label') {
            out += '  parser.label(' + _cmdVarName(ssItem.autoCmd) + '); // start Label\n';
          } else if (ssItem.type === 'drawing') {
            const ssDisabledFlag = ssItem.formats.disabled ? '!' : '';
            out += '  parser.print(F("|+")); // drawing menu item update\n';
            out += '  parser.print(' + _dwgCmdVarName(ssItem.autoCmd) + ');\n';
            if (ssDisabledFlag) out += '  parser.print(F("!")); // disable this menu item\n';
          }
        }
        out += '  parser.endOfMsg();\n';
        out += '}\n';
        out += '\n';
      }
    }

    for (const item of items) {
      if (item.type === 'datadisplay' && item.pin && item.pin.name) {
        const intVar   = _intVarName(item.autoCmd);
        const pinConst = _pinConstName(item.autoCmd);
        const adcTimer = _cppId(item.autoCmd) + '_adcTimer';
        const readFn   = _cppId(item.autoCmd) + '_readADC';
        out += 'void ' + readFn + '() {\n';
        out += '  if (' + adcTimer + '.justFinished()) {\n';
        out += '    ' + adcTimer + '.repeat(); // restart timer, without drift\n';
        out += '    ' + intVar + ' = analogRead(' + pinConst + ');  // read ADC input\n';
        out += '  }\n';
        out += '}\n';
        out += '\n';
      }
    }
    for (const item of items) {
      if (item.type === 'onoff' && item.pulse && item.pulse !== 'none') {
        const cmdVar    = _cmdVarName(item.autoCmd);
        const intVar    = _intVarName(item.autoCmd);
        const returnVal = item.pulse === 'low' ? 1 : 0;
        const returnLvl = returnVal ? 'HIGH' : 'LOW';
        out += 'static void ' + cmdVar + '_checkPulse() {\n';
        out += '  if (' + cmdVar + '_pulseRunning && ((millis() - ' + cmdVar + '_pulseStartTime) > ' + cmdVar + '_PULSE_LENGTH)) {\n';
        out += '    ' + cmdVar + '_pulseRunning = false; // timer finished\n';
        out += '    ' + intVar + ' = ' + returnVal + ';  // return output to ' + returnLvl + '\n';
        if (item.pin && item.pin.name) {
          out += '    ' + _pinWriteFn(item.pin.type) + '(' + _pinConstName(item.autoCmd) + ',' + intVar + '); // update output pin\n';
        }
        out += '  }\n';
        out += '}\n';
        out += '\n';
      }
    }
    out += 'static int swap01(int in) {\n';
    out += '  return (in==0)?1:0;\n';
    out += '}\n';
    out += '// ============= end generated code =========\n';
    out += '\n';
    return out;
  }

  // ── CRC-32 (for ZIP) ────────────────────────────────────────────

  const _CRC32_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();

  function _crc32(data) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc = _CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // ── ZIP STORE writer ────────────────────────────────────────────
  // Builds a minimal ZIP archive (STORE, no compression) from an array
  // of {path: string, data: Uint8Array} entries.

  function _u16le(v) { return [v & 0xFF, (v >> 8) & 0xFF]; }
  function _u32le(v) { return [v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF]; }

  function _buildZip(entries) {
    const enc = new TextEncoder();
    const localHeaders = [];
    let offset = 0;

    for (const entry of entries) {
      const nameBytes = enc.encode(entry.path);
      const data      = entry.data;
      const crc       = _crc32(data);
      const size      = data.length;

      const lh = [
        0x50, 0x4B, 0x03, 0x04,    // local file header signature
        ..._u16le(20),              // version needed to extract (2.0)
        ..._u16le(0),               // general purpose bit flag
        ..._u16le(0),               // compression method: STORE
        ..._u16le(0),               // last mod file time
        ..._u16le(0),               // last mod file date
        ..._u32le(crc),
        ..._u32le(size),            // compressed size (= uncompressed for STORE)
        ..._u32le(size),            // uncompressed size
        ..._u16le(nameBytes.length),
        ..._u16le(0),               // extra field length
        ...nameBytes,
      ];

      localHeaders.push({ header: lh, data, crc, size, nameBytes, localOffset: offset });
      offset += lh.length + size;
    }

    // Central directory records
    const centralDirs = [];
    const cdStart = offset;
    for (const e of localHeaders) {
      const cd = [
        0x50, 0x4B, 0x01, 0x02,    // central directory file header signature
        ..._u16le(20),              // version made by
        ..._u16le(20),              // version needed to extract
        ..._u16le(0),               // general purpose bit flag
        ..._u16le(0),               // compression method: STORE
        ..._u16le(0),               // last mod file time
        ..._u16le(0),               // last mod file date
        ..._u32le(e.crc),
        ..._u32le(e.size),          // compressed size
        ..._u32le(e.size),          // uncompressed size
        ..._u16le(e.nameBytes.length),
        ..._u16le(0),               // extra field length
        ..._u16le(0),               // file comment length
        ..._u16le(0),               // disk number start
        ..._u16le(0),               // internal file attributes
        ..._u32le(0),               // external file attributes
        ..._u32le(e.localOffset),   // relative offset of local header
        ...e.nameBytes,
      ];
      centralDirs.push(cd);
      offset += cd.length;
    }

    const cdSize = offset - cdStart;

    // End of central directory record
    const eocd = [
      0x50, 0x4B, 0x05, 0x06,    // end of central directory signature
      ..._u16le(0),               // number of this disk
      ..._u16le(0),               // disk with start of central directory
      ..._u16le(entries.length),  // entries on this disk
      ..._u16le(entries.length),  // total entries
      ..._u32le(cdSize),          // size of central directory
      ..._u32le(cdStart),         // offset of start of central directory
      ..._u16le(0),               // zip file comment length
    ];

    // Assemble all parts into one Uint8Array.
    const totalSize = offset + eocd.length;
    const result    = new Uint8Array(totalSize);
    let pos = 0;
    for (const e of localHeaders) {
      result.set(e.header, pos);  pos += e.header.length;
      result.set(e.data,   pos);  pos += e.data.length;
    }
    for (const cd of centralDirs) {
      result.set(cd, pos);  pos += cd.length;
    }
    result.set(eocd, pos);
    return result;
  }

  // ── Download trigger ────────────────────────────────────────────

  function _triggerDownload(state) {
    const name = state.name;
    const enc  = new TextEncoder();
    const entries = [
      { path: name + '/' + name + '.ino',                       data: enc.encode(_generateIno(state)) },
      { path: name + '/pfodMainMenu.h',                         data: enc.encode(_generateH(state)) },
      { path: name + '/pfodMainMenu.cpp',                       data: enc.encode(_generateCpp(state)) },
      { path: name + '/json/' + name + '.pfodDesigner_json',    data: enc.encode(state.exportToJSON()) },
    ];
    const allDwgs = _allDrawings(state.rootMenu.items);
    for (const { item } of allDwgs) {
      const cls = _dwgClassName(item.autoCmd);
      entries.push({ path: name + '/' + cls + '.h',   data: enc.encode(_generateDwgH(item, state)) });
      entries.push({ path: name + '/' + cls + '.cpp', data: enc.encode(_generateDwgCpp(item, state)) });
    }
    const zipBytes = _buildZip(entries);
    const blob = new Blob([zipBytes], { type: 'application/zip' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = name + '.zip';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (navigator.userAgent.includes('Windows')) {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:99999';
      const box = document.createElement('div');
      box.style.cssText = 'background:#fff;border-radius:6px;padding:24px 28px;max-width:360px;width:90%;box-shadow:0 4px 24px rgba(0,0,0,.35);font-family:sans-serif;font-size:14px;line-height:1.5';
      box.innerHTML =
        '<div style="font-size:16px;font-weight:bold;margin-bottom:12px">Generated Code</div>' +
        '<div><b>' + name + '.zip</b> downloaded.</div>' +
        '<div style="margin-top:12px"><b>To clear Windows Security Block:</b><br>' +
        'Right-click the .zip → Properties<br>→ tick <b>Unblock</b> → OK</div>' +
        '<div style="text-align:right;margin-top:18px"><button style="padding:6px 18px;cursor:pointer">OK</button></div>';
      box.querySelector('button').onclick = () => document.body.removeChild(overlay);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    }
  }

  // ── Dispatch handler ─────────────────────────────────────────────
  // Returns PFOD_EMPTY (no navigation change) after triggering the
  // browser download.  skipSave prevents the dispatch wrapper from
  // persisting the state on what is a read-only action.

  function send(rawCmd, state, depth) {
    if (!state.name) return { pfod: PFOD_EMPTY, skipSave: true };
    _triggerDownload(state);
    return { pfod: PFOD_EMPTY, skipSave: true };
  }

  return Object.freeze({ send });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('l', DesignerGenerateCode.send);
