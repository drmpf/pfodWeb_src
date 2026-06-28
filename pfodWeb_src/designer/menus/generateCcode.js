/*
 * designer/menus/generateCcode.js
 *
 * Generates a plain-C pfod device implementation for the "Minimal C
 * Code" (ccode) Designer target — the 'l' (EM_GENERATE_CODE_CMD)
 * button's handler delegates here when state.board.family === 'ccode'
 * (see editMenu.js's dispatch wiring).
 *
 * Modeled on two references (see the design spec discussed with the
 * user for full rationale):
 *   - C:\ai\aicode\pfodWeb\sampleCcode\  — the OUTPUT style: global
 *     statics (no classes), single-letter cmd literals, a flat
 *     if/else if('A'==cmd) dispatch chain, pfodParser_printStr/printCh/
 *     printLong calls. The fixed pfodParser.c/.h + pfodParserStream.h
 *     library files live in designer/pfodParserC/ (moved out of
 *     sampleCcode/, which keeps just main.c/pfodMenu.c/.h as a worked
 *     example) and are bundled verbatim at bundle time by build-bundle.js
 *     as PFOD_PARSER_C_TEXT / PFOD_PARSER_H_TEXT / PFOD_PARSER_STREAM_H_TEXT
 *     — see that file's '.c'/'.h' branch in inlineScripts().
 *   - C:\ai\aicode\pfodWeb\pfodDesignerV2\boards\C_code.java (+
 *     EditScreenData.java) — the original Java tool that produced
 *     sampleCcode.  Confirms: cmd is a single persisted char (no
 *     runtime class), sub-menu nesting is unlimited depth, and chart
 *     values are scaled device-side with a float linear transform.
 *
 * Key differences from generateCode.js's Arduino/C++ output, all
 * deliberate (see spec):
 *   - Variable/function names come from item.autoCmd (descriptive);
 *     item.ccodeCmd (a single persisted letter, see state.js's
 *     assignCcodeCmds()) is used ONLY for the wire literal.
 *   - Sub-menu nesting is genuinely recursive / unlimited depth, not
 *     hand-unrolled to 3 levels.
 *   - No millis()/timer-library dependency anywhere: chart data-send
 *     is gated by a flag the user's own timer ISR sets (exactly like
 *     sampleCcode/main.c's TMR0_CallBack); pulse auto-revert reads a
 *     single shared `pfodParser_millis` counter the user's own ISR
 *     increments (only declared at all when some item actually uses
 *     pulse).
 *   - Drawing items are unsupported (no vtable in plain C) — throws.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DesignerGenerateCcode = (() => {

  // ── C identifier / string helpers ─────────────────────────────────

  function _cId(s) {
    let id = (s || '').replace(/[^A-Za-z0-9]/g, '_');
    if (id && /^[0-9]/.test(id)) id = '_' + id;
    return id;
  }

  function _cStr(s) {
    return (s || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g,  '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '');
  }

  function _baseId(autoCmd) { return _cId(autoCmd).replace(/_Cmd$/, ''); }
  function _varName(autoCmd)   { return _baseId(autoCmd) + '_var'; }
  function _chartPrefix(autoCmd) { return _baseId(autoCmd); }

  /// Render a display max/min string as a C float literal — '10' -> '10.0',
  /// '1.25' -> '1.25', unparsable -> '0.0'.  Mirrors generateCode.js's _floatLit.
  function _floatLit(s) {
    const f = parseFloat(s);
    if (isNaN(f)) return '0.0';
    return Number.isInteger(f) ? f + '.0' : String(f);
  }

  const ROOT_SUFFIX = 'Main';
  function _sendFnName(suffix)       { return 'pfodParser_sendMenu_' + suffix; }
  function _sendUpdateFnName(suffix) { return 'pfodParser_sendMenuUpdate_' + suffix; }

  // ── Effective item formats (same fallback rule as generateCode.js) ─

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

  // ── Tree walk ──────────────────────────────────────────────────────
  // Collect every menu node (root + every sub-menu at any depth) with a
  // unique function-name suffix, plus per-item bookkeeping: which node
  // owns each item (for dispatch -> "send my owner's update"), and
  // which child-node suffix a submenu item opens (for dispatch -> "send
  // my child").  True recursion — no depth cap.

  function _collectMenuNodes(rootMenu) {
    const nodes          = [];
    const ownerSuffixOf   = new Map();   // item -> suffix of the menu node containing it
    const childSuffixOf   = new Map();   // submenu item -> suffix of the node it opens

    function walk(menu, suffix) {
      nodes.push({ suffix, menu });
      for (const item of menu.items) {
        ownerSuffixOf.set(item, suffix);
        if (item.type === 'submenu' && item.subMenu) {
          const childSuffix = _cId(item.autoCmd);
          childSuffixOf.set(item, childSuffix);
          walk(item.subMenu, childSuffix);
        }
      }
    }
    walk(rootMenu, ROOT_SUFFIX);
    return { nodes, ownerSuffixOf, childSuffixOf };
  }

  // ── Per-item-type emission ────────────────────────────────────────
  // Each function appends lines (array of strings) for one item; def =
  // sendMenu_X body, upd = sendMenuUpdate_X body, dispatch (separate,
  // see _emitDispatchBranch) = pfodParser_parse() branch.

  function _fmtLines(item, promptFormat) {
    const eff      = _effectiveFmt(item.formats, promptFormat);
    const slotFmt  = designerItemPrefix(eff);
    const inlineFmt = designerInlineFormat(eff);
    return slotFmt + inlineFmt;
  }

  function _emitDef(out, item, promptFormat) {
    const cmd       = item.ccodeCmd;
    const allFmt    = _fmtLines(item, promptFormat);
    const disabled  = !!item.formats.disabled;
    const text      = _cStr(item.text || '');
    if (item.type === 'button' || item.type === 'chart' || item.type === 'submenu') {
      out.push('  pfodParser_printStr("|' + cmd + '");');
      if (disabled) out.push('  pfodParser_printStr("!"); // disable this menu item');
      if (allFmt) out.push('  pfodParser_printStr("' + _cStr(allFmt) + '");');
      out.push('  pfodParser_printStr("~' + text + '");');
    } else if (item.type === 'label') {
      out.push('  pfodParser_printStr("|!' + cmd + '"); // label - always disabled');
      if (allFmt) out.push('  pfodParser_printStr("' + _cStr(allFmt) + '");');
      out.push('  pfodParser_printStr("~' + text + '");');
    } else if (item.type === 'onoff' || item.type === 'pwm') {
      const intVar  = _varName(item.autoCmd);
      const trail   = _cStr(item.trailingText || '');
      out.push('  pfodParser_printStr("|' + cmd + '");');
      if (disabled) out.push('  pfodParser_printStr("!"); // disable this menu item');
      if (allFmt) out.push('  pfodParser_printStr("' + _cStr(allFmt) + '");');
      out.push('  pfodParser_printCh(\'`\');');
      const fmtChar = item.displayFormat === 'text' ? 't' : item.displayFormat === 'slider' ? 's' : '';
      if (item.type === 'onoff') {
        const lowEsc  = _cStr(item.lowText  || 'Low');
        const highEsc = _cStr(item.highText || 'High');
        out.push('  pfodParser_printLong(' + intVar + '); // output the current value');
        out.push('  pfodParser_printStr("~' + text + '~' + trail + '~' + lowEsc + '\\\\' + highEsc + '~' + fmtChar + '");');
      } else {
        out.push('  pfodParser_printLong(' + intVar + '); // output the current value');
        out.push('  pfodParser_printStr("~' + text + '~' + trail + '`' + item.maxValue + '`' + item.minValue +
                  '~' + _cStr(item.maxScaleStr || '') + '~' + _cStr(item.minScaleStr || '') + '~' + fmtChar + '");');
      }
    } else if (item.type === 'onoffdisplay' || item.type === 'datadisplay') {
      const intVar  = _varName(item.autoCmd);
      const fmtChar = item.displayFormat === 'text' ? 't' : item.displayFormat === 'slider' ? 's' : '';
      out.push('  pfodParser_printStr("|!' + cmd + '"); // display-only - always disabled');
      if (allFmt) out.push('  pfodParser_printStr("' + _cStr(allFmt) + '");');
      out.push('  pfodParser_printCh(\'`\');');
      out.push('  pfodParser_printLong(' + intVar + '); // output the current value');
      if (item.type === 'onoffdisplay') {
        const lowEsc  = _cStr(item.lowText  || 'Off');
        const highEsc = _cStr(item.highText || 'On');
        const trail   = _cStr(item.trailingText || '');
        out.push('  pfodParser_printStr("~' + text + '~' + trail + '~' + lowEsc + '\\\\' + highEsc + '~' + fmtChar + '");');
      } else {
        const units = _cStr(item.trailingText || '');
        out.push('  pfodParser_printStr("~' + text + '~' + units + '`' + item.maxValue + '`' + item.minValue +
                  '~' + _cStr(item.maxScaleStr || '') + '~' + _cStr(item.minScaleStr || '') + '~' + fmtChar + '");');
      }
    }
  }

  function _emitUpdate(out, item) {
    const cmd      = item.ccodeCmd;
    const disabled = !!item.formats.disabled;
    if (item.type === 'button' || item.type === 'chart' || item.type === 'submenu') {
      out.push('  pfodParser_printStr("|' + cmd + '");');
      if (disabled) out.push('  pfodParser_printStr("!"); // disable this menu item');
    } else if (item.type === 'label') {
      out.push('  pfodParser_printStr("|!' + cmd + '");');
    } else if (item.type === 'onoff' || item.type === 'pwm') {
      const intVar = _varName(item.autoCmd);
      out.push('  pfodParser_printStr("|' + cmd + '");');
      if (disabled) out.push('  pfodParser_printStr("!"); // disable this menu item');
      out.push('  pfodParser_printCh(\'`\');');
      out.push('  pfodParser_printLong(' + intVar + ');');
    } else if (item.type === 'onoffdisplay' || item.type === 'datadisplay') {
      const intVar = _varName(item.autoCmd);
      out.push('  pfodParser_printStr("|!' + cmd + '");');
      out.push('  pfodParser_printCh(\'`\');');
      out.push('  pfodParser_printLong(' + intVar + ');');
    }
  }

  /// Dispatch branch for one item.  ownerSuffixOf/childSuffixOf come
  /// from _collectMenuNodes — needed so onoff/pwm send their OWNING
  /// menu's update (not always the root's), and submenu items open
  /// their OWN child node.
  function _emitDispatchBranch(out, item, ownerSuffixOf, childSuffixOf) {
    const cmd   = item.ccodeCmd;
    const label = _cStr((item.text || '').replace(/\n/g, ' ').trim() || item.type);
    if (item.type === 'onoff') {
      const intVar = _varName(item.autoCmd);
      out.push('    } else if(\'' + cmd + '\'==cmd) { // user moved slider -- \'' + label + '\'');
      out.push('      pfodParser_parseLong(pfodFirstArg, &pfodLongRtn); // parse first arg as a long');
      out.push('      ' + intVar + ' = (int)pfodLongRtn; // set variable');
      if (item.pulse && item.pulse !== 'none') {
        const base       = _baseId(item.autoCmd);
        const triggerVal = item.pulse === 'low' ? 0 : 1;
        out.push('      if (' + intVar + ' == ' + triggerVal + ') {');
        out.push('        ' + base + '_pulseStartTime = pfodParser_millis;');
        out.push('        ' + base + '_pulseRunning = 1;');
        out.push('      } else {');
        out.push('        ' + base + '_pulseRunning = 0;');
        out.push('      }');
      }
      out.push('      ' + _sendUpdateFnName(ownerSuffixOf.get(item)) + '(); // always send back a pfod msg otherwise pfodApp will disconnect.');
    } else if (item.type === 'pwm') {
      const intVar = _varName(item.autoCmd);
      out.push('    } else if(\'' + cmd + '\'==cmd) { // user moved slider -- \'' + label + '\'');
      out.push('      pfodParser_parseLong(pfodFirstArg, &pfodLongRtn); // parse first arg as a long');
      out.push('      ' + intVar + ' = (int)pfodLongRtn; // set variable');
      out.push('      ' + _sendUpdateFnName(ownerSuffixOf.get(item)) + '(); // always send back a pfod msg otherwise pfodApp will disconnect.');
    } else if (item.type === 'button') {
      out.push('    } else if(\'' + cmd + '\'==cmd) { // user pressed -- \'' + label + '\'');
      out.push('      // <<< add your action code here for this button');
      out.push('      pfodParser_printStr("{}"); // change this return as needed, but always send back a pfod msg.');
    } else if (item.type === 'chart') {
      out.push(..._chartDispatchLines(item, label));
    } else if (item.type === 'submenu') {
      const childSuffix = childSuffixOf.get(item);
      out.push('    } else if(\'' + cmd + '\'==cmd) { // user pressed sub-menu button -- \'' + label + '\'');
      out.push('      if (!pfodParser_isRefresh()) {');
      out.push('        ' + _sendFnName(childSuffix) + '(); // send the sub-menu');
      out.push('      } else {');
      out.push('        ' + _sendUpdateFnName(childSuffix) + '(); // refresh the sub-menu');
      out.push('      }');
    }
    // label / onoffdisplay / datadisplay: pfodApp never sends these cmds — no branch.
  }

  // ── Chart support ──────────────────────────────────────────────────
  // Each chart item gets its own prefixed plot vars / send-data flag /
  // counter / send function, mirroring sampleCcode's plot_X_var /
  // plot_N_var / pfodParser_sendDataFlag / pfodParser_sendData() —
  // just multiplied per chart instead of one shared global set (the
  // Designer's data model already allows multiple independent charts;
  // see design spec point 5).  No millis()/timer dependency: the
  // generated _sendData() is gated purely by a flag the user's own
  // timer ISR sets — same division of responsibility as sampleCcode's
  // main.c (TMR0_CallBack sets pfodParser_sendDataFlag).
  // clearPlot / plot_msOffset stay GLOBAL (not per-chart) because the
  // {@} request from pfodApp carries no chart identity — confirmed
  // against both the Java reference and the existing Arduino generator.

  function _allCharts(allItems) {
    return allItems.filter((it) => it.type === 'chart');
  }

  function _chartVarsDecl(item) {
    const prefix = _chartPrefix(item.autoCmd);
    const lines  = [];
    lines.push('// plotting data variables for \'' + _cStr(item.chartLabel || item.text || '') + '\'');
    lines.push('static volatile uint8_t ' + prefix + '_sendDataFlag = 0; // set this to 1 from your own timer to send a data point');
    lines.push('static long ' + prefix + '_plot_X_var = 0; // increments once per data row sent; overwrite before calling sendData for a real X value');
    for (let n = 1; n <= 3; n++) {
      const p = item.plots[n - 1];
      lines.push('static long ' + prefix + '_plot_' + n + '_var;');
      lines.push('static const long ' + prefix + '_plot_' + n + '_varMin = ' + p.dataRangeMin + ';');
      if (!_isIdentityScale(p)) {
        lines.push('static float ' + prefix + '_plot_' + n + '_scaling; // set once in pfodParser_setup()');
        lines.push('static float ' + prefix + '_plot_' + n + '_varDisplayMin = ' + _floatLit(p.displayMin) + ';');
      }
    }
    return lines;
  }

  function _isIdentityScale(plot) {
    return plot.dataRangeMin === parseFloat(plot.displayMin) && plot.dataRangeMax === parseFloat(plot.displayMax);
  }

  function _chartInitLines(item) {
    const prefix = _chartPrefix(item.autoCmd);
    const lines  = [];
    for (let n = 1; n <= 3; n++) {
      const p = item.plots[n - 1];
      if (_isIdentityScale(p)) continue;
      lines.push('  ' + prefix + '_plot_' + n + '_scaling = pfodParser_getPlotVarScaling(' +
                 p.dataRangeMax + ', ' + p.dataRangeMin + ', ' + _floatLit(p.displayMax) + ', ' + _floatLit(p.displayMin) + ');');
    }
    return lines;
  }

  function _chartSendDataFn(item) {
    const prefix    = _chartPrefix(item.autoCmd);
    const intervalLabel = CHART_DATA_INTERVAL_LABELS[item.dataIntervalIdx] || CHART_DATA_INTERVAL_LABELS[DEFAULT_CHART_DATA_INTERVAL_IDX];
    const lines = [];
    lines.push('// Drive ' + prefix + '_sendDataFlag = 1 from your own timer at the configured rate (' + intervalLabel + ').');
    lines.push('static void ' + prefix + '_sendData(void) {');
    lines.push('  if (!' + prefix + '_sendDataFlag) {');
    lines.push('    return;');
    lines.push('  }');
    lines.push('  ' + prefix + '_sendDataFlag = 0;');
    lines.push('  // <<< assign plot_N_var from your own sensor readings before this point if not done elsewhere');
    lines.push('  // send plot data in CSV format');
    lines.push('  pfodParser_printLong(' + prefix + '_plot_X_var);');
    for (let n = 1; n <= 3; n++) {
      const p = item.plots[n - 1];
      lines.push('  pfodParser_printCh(\',\');');
      if (_isIdentityScale(p)) {
        lines.push('  pfodParser_printLong(' + prefix + '_plot_' + n + '_var);');
      } else {
        lines.push('  pfodParser_printLong((long)(((float)(' + prefix + '_plot_' + n + '_var - ' + prefix + '_plot_' + n + '_varMin)) * ' +
                   prefix + '_plot_' + n + '_scaling + ' + prefix + '_plot_' + n + '_varDisplayMin));');
      }
    }
    lines.push('  pfodParser_println(); // end of CSV data record');
    lines.push('  ' + prefix + '_plot_X_var++;');
    lines.push('}');
    return lines;
  }

  function _chartDispatchLines(item, label) {
    const cmd    = item.ccodeCmd;
    const msg    = DesignerEditChart.buildChartMsgForCode(item);
    const lines  = [];
    lines.push('    } else if(\'' + cmd + '\'==cmd) { // user pressed -- \'' + label + '\' (opens chart)');
    lines.push('      pfodParser_printStr("' + _cStr(msg.head) + '");');
    lines.push('      if (pfodParser_clearPlot) {');
    lines.push('        pfodParser_clearPlot = 0;');
    lines.push('        pfodParser_printStr("~C");');
    lines.push('      }');
    lines.push('      pfodParser_printStr("' + _cStr(msg.body) + '");');
    return lines;
  }

  // ── Pulse support ──────────────────────────────────────────────────
  // Auto-revert N ms after an onoff item's pulse-triggering value is
  // set.  No millis() dependency: reads a single shared
  // pfodParser_millis counter (declared only when needed) that the
  // user's own periodic timer ISR increments however they like.

  function _pulseItems(allItems) {
    return allItems.filter((it) => it.type === 'onoff' && it.pulse && it.pulse !== 'none');
  }

  function _pulseVarsDecl(item) {
    const base = _baseId(item.autoCmd);
    return [
      'static unsigned long ' + base + '_pulseStartTime;',
      'static uint8_t ' + base + '_pulseRunning;',
      'static const unsigned long ' + base + '_PULSE_LENGTH = ' + (item.pulse_ms || 1000) + ';',
    ];
  }

  function _pulseCheckFn(item) {
    const base      = _baseId(item.autoCmd);
    const intVar    = _varName(item.autoCmd);
    const returnVal = item.pulse === 'low' ? 1 : 0;
    return [
      'static void ' + base + '_checkPulse(void) {',
      '  if (' + base + '_pulseRunning && (pfodParser_millis - ' + base + '_pulseStartTime > ' + base + '_PULSE_LENGTH)) {',
      '    ' + base + '_pulseRunning = 0; // pulse finished',
      '    ' + intVar + ' = ' + returnVal + '; // return output to its rest state',
      '  }',
      '}',
    ];
  }

  // ── Drawing-item rejection ─────────────────────────────────────────

  function _checkNoDrawings(allItems) {
    const drawing = allItems.find((it) => it.type === 'drawing');
    if (drawing) {
      throw new Error('Drawing items are not supported for the Minimal C Code target ' +
                       '(no class/vtable mechanism in plain C). Remove "' +
                       (drawing.text || 'Drawing') + '" and try again.');
    }
  }

  // ── Buffer size (mirrors pfodDesignerV2's calculateParserBufferSize) ─
  // {version : cmd ` largest-arg } -- 5 fixed chars + version length +
  // worst-case single argument width (a long, ~10 digits incl. sign).

  function _calcBufferSize(version) {
    return 5 + version.length + 10;
  }

  // ── pfodMenu.h ─────────────────────────────────────────────────────

  function _generatePfodMenuH(state, items, charts, pulseItems, bufSize) {
    let out = '/*\n';
    out += ' * File:   pfodMenu.h\n';
    out += ' * Board: ' + state.board.name + '\n';
    out += ' * Code generated by pfodWeb ' + (window.JS_VERSION || '') + '\n';
    out += ' * (c)2014-2026 Forward Computing and Control Pty. Ltd.\n';
    out += ' * NSW Australia, www.forward.com.au\n';
    out += ' * This generated code may be freely used for both private and commercial use\n';
    out += ' * provided this copyright is maintained.\n';
    out += ' */\n';
    out += '#ifndef PFODMENU_H\n';
    out += '#define PFODMENU_H\n';
    out += '#include <stdint.h>\n';
    out += '\n';
    out += '#ifdef __cplusplus\n';
    out += 'extern "C" {\n';
    out += '#endif\n';
    out += '\n';
    out += '  // global vars set by parser, access and update these in your main program\n';
    out += '  extern uint8_t pfodParser_connected; // set true (1) when {.} parsed, set false (0) when {!} parsed.\n';
    out += '\n';
    for (const item of items) {
      if (item.type === 'onoff' || item.type === 'pwm' || item.type === 'onoffdisplay' || item.type === 'datadisplay') {
        out += '  extern int ' + _varName(item.autoCmd) + '; // \'' + _cStr(item.text || '') + '\'\n';
      }
    }
    if (pulseItems.length > 0) {
      out += '\n';
      out += '  // Increment this from your own periodic timer ISR (any units you like,\n';
      out += '  // as long as the *_PULSE_LENGTH constants below use the same units).\n';
      out += '  extern volatile unsigned long pfodParser_millis;\n';
    }
    if (charts.length > 0) {
      out += '\n';
      out += '  // set true (1) by the {@} handler on (re)connect so the next chart open clears stale data\n';
      out += '  extern uint8_t pfodParser_clearPlot;\n';
    }
    out += '\n';
    out += '  void pfodParser_setup(void);   // call this just once\n';
    out += '  void pfodParser_parse(void);   // call this every processing loop\n';
    out += '\n';
    out += '  // print support\n';
    out += '  int pfodParser_println(void);\n';
    out += '  int pfodParser_printCh(char c);\n';
    out += '  int pfodParser_printStr(const char *str);\n';
    out += '  int pfodParser_printLong(const long l);\n';
    out += '\n';
    out += '  #define PFOD_PARSER_BUFFER_SIZE ' + bufSize + '\n';
    out += '  //  PFOD_PARSER_BUFFER_SIZE sets the max size msg the parser will store { vers : cmd ` args.. }\n';
    out += '  //  Longer msgs up to 255 can be received and will be parsed but only the first\n';
    out += '  //  PFOD_PARSER_BUFFER_SIZE bytes will be stored in the parser\n';
    out += '\n';
    out += '#ifdef __cplusplus\n';
    out += '}\n';
    out += '#endif\n';
    out += '#endif /* PFODMENU_H */\n';
    return out;
  }

  // ── pfodMenu.c ─────────────────────────────────────────────────────

  function _generatePfodMenuC(state, tree, items, charts, pulseItems) {
    const { nodes, ownerSuffixOf, childSuffixOf } = tree;
    const version = 'V1';

    let out = '/*\n';
    out += ' * File:   pfodMenu.c\n';
    out += ' * Board: ' + state.board.name + '\n';
    out += ' * Code generated by pfodWeb ' + (window.JS_VERSION || '') + '\n';
    out += ' * (c)2014-2026 Forward Computing and Control Pty. Ltd.\n';
    out += ' * NSW Australia, www.forward.com.au\n';
    out += ' * This generated code may be freely used for both private and commercial use\n';
    out += ' * provided this copyright is maintained.\n';
    out += ' */\n';
    out += '#include "pfodMenu.h"\n';
    out += '#include "pfodParser.h"\n';
    out += '\n';
    out += 'uint8_t pfodParser_connected;\n';
    for (const item of items) {
      if (item.type === 'onoff' || item.type === 'pwm' || item.type === 'onoffdisplay' || item.type === 'datadisplay') {
        out += 'int ' + _varName(item.autoCmd) + '; // \'' + _cStr(item.text || '') + '\'\n';
      }
    }
    if (pulseItems.length > 0) {
      out += 'volatile unsigned long pfodParser_millis;\n';
      for (const item of pulseItems) out += _pulseVarsDecl(item).join('\n') + '\n';
    }
    if (charts.length > 0) {
      out += 'uint8_t pfodParser_clearPlot;\n';
      out += 'static unsigned long pfodParser_plot_msOffset; // unused unless your own code wants a time base\n';
      for (const item of charts) out += _chartVarsDecl(item).join('\n') + '\n';
    }
    out += '\n';

    // Forward declarations for every menu node, in case items reference
    // a node defined later in the file.
    for (const node of nodes) {
      out += 'static void ' + _sendFnName(node.suffix) + '(void);\n';
      out += 'static void ' + _sendUpdateFnName(node.suffix) + '(void);\n';
    }
    out += '\n';

    // ── setup ──
    out += 'void pfodParser_setup(void) {\n';
    out += '  pfodParser_pfodParser("' + version + '"); // initialize the pfodParser and set the version\n';
    out += '  pfodParser_connected = 0;\n';
    for (const item of items) {
      if (item.type === 'onoff' || item.type === 'onoffdisplay') {
        out += '  ' + _varName(item.autoCmd) + ' = ' + (item.current === 1 ? 1 : 0) + ';\n';
      } else if (item.type === 'pwm' || item.type === 'datadisplay') {
        out += '  ' + _varName(item.autoCmd) + ' = ' + item.minValue + ';\n';
      }
    }
    if (charts.length > 0) {
      out += '  pfodParser_clearPlot = 0;\n';
      for (const item of charts) {
        out += '  ' + _chartPrefix(item.autoCmd) + '_sendDataFlag = 0;\n';
        const initLines = _chartInitLines(item);
        if (initLines.length > 0) out += initLines.join('\n') + '\n';
      }
    }
    out += '}\n';
    out += '\n';

    // ── parse / dispatch ──
    out += 'void pfodParser_parse(void) {\n';
    out += '  uint8_t cmd = pfodParser_parse_RX(); // parse incoming data from connection\n';
    out += '  // parser returns non-zero when a pfod command is fully parsed\n';
    out += '  if (cmd != 0) { // have parsed a complete msg { to }\n';
    out += '    uint8_t* pfodFirstArg = pfodParser_getFirstArg(); // may point to \\0 if no arguments in this msg.\n';
    out += '    long pfodLongRtn; // used for parsing long return arguments, if any\n';
    out += '    pfodParser_connected = 1;\n';
    out += '    if (\'.\' == cmd) {\n';
    if (charts.length > 0) {
      out += '      pfodParser_clearPlot = 1; // clear plot on reconnect, columns are now stale\n';
    }
    out += '      // pfodApp has connected and sent {.} , it is asking for the main menu\n';
    out += '      if (!pfodParser_isRefresh()) {\n';
    out += '        ' + _sendFnName(ROOT_SUFFIX) + '(); // send back the menu designed\n';
    out += '      } else {\n';
    out += '        ' + _sendUpdateFnName(ROOT_SUFFIX) + '(); // menu is cached just send update\n';
    out += '      }\n';
    out += '\n';
    if (charts.length > 0) {
      out += '    } else if(\'@\'==cmd) { // pfodApp requested \'current\' time on (re)connect\n';
      out += '      pfodParser_printStr("{@`0}"); // return `0 as \'current\' raw data time-base\n';
      out += '\n';
    }
    out += '            // now handle commands returned from button/sliders\n';

    const dispatchLines = [];
    for (const item of items) {
      _emitDispatchBranch(dispatchLines, item, ownerSuffixOf, childSuffixOf);
    }
    out += dispatchLines.join('\n') + (dispatchLines.length > 0 ? '\n' : '');

    out += '    } else if (\'!\' == cmd) {\n';
    out += '      // CloseConnection command\n';
    out += '      pfodParser_connected = 0;\n';
    out += '    } else {\n';
    out += '      // unknown command\n';
    out += '      pfodParser_printStr("{}"); // always send back a pfod msg otherwise pfodApp will disconnect.\n';
    out += '    }\n';
    out += '  }\n';
    for (const item of charts) out += '  ' + _chartPrefix(item.autoCmd) + '_sendData();\n';
    for (const item of pulseItems) out += '  ' + _baseId(item.autoCmd) + '_checkPulse();\n';
    out += '}\n';
    out += '\n';

    // ── per-menu-node send / sendUpdate ──
    for (const node of nodes) {
      const promptFmtStr = DesignerEditPrompt.buildPromptScreenFormat(node.menu.promptFormat);
      const promptText   = _cStr(node.menu.promptText || '');

      out += 'static void ' + _sendFnName(node.suffix) + '(void) {\n';
      out += '  // !! Remember to change the parser version string every time you edit this method\n';
      out += '  pfodParser_printStr("{,");\n';
      out += '  pfodParser_printStr("' + _cStr(promptFmtStr) + '~' + promptText + '");\n';
      out += '  pfodParser_printCh(\'`\');\n';
      out += '  pfodParser_printLong(' + node.menu.refresh_ms + ');\n';
      out += '  pfodParser_sendVersion();\n';
      const defLines = [];
      for (const item of node.menu.items) _emitDef(defLines, item, node.menu.promptFormat);
      out += defLines.join('\n') + (defLines.length > 0 ? '\n' : '');
      out += '  pfodParser_printStr("}");\n';
      out += '}\n';
      out += '\n';

      out += 'static void ' + _sendUpdateFnName(node.suffix) + '(void) {\n';
      out += '  pfodParser_printStr("{;");\n';
      const updLines = [];
      for (const item of node.menu.items) _emitUpdate(updLines, item);
      out += updLines.join('\n') + (updLines.length > 0 ? '\n' : '');
      out += '  pfodParser_printStr("}");\n';
      out += '}\n';
      out += '\n';
    }

    // ── chart send-data functions ──
    for (const item of charts) {
      out += _chartSendDataFn(item).join('\n') + '\n\n';
    }
    if (charts.some((it) => it.plots.some((p) => !_isIdentityScale(p)))) {
      out += 'static float pfodParser_getPlotVarScaling(long varMax, long varMin, float displayMax, float displayMin) {\n';
      out += '  long varRange = varMax - varMin;\n';
      out += '  if (varRange == 0) { varRange = 1; } // prevent divide by zero\n';
      out += '  return (displayMax - displayMin) / ((float)varRange);\n';
      out += '}\n\n';
    }

    // ── pulse check functions ──
    for (const item of pulseItems) {
      out += _pulseCheckFn(item).join('\n') + '\n\n';
    }

    return out;
  }

  // ── main.c stub ────────────────────────────────────────────────────

  function _generateMainC(state, charts, pulseItems) {
    let out = '/*\n';
    out += ' * main.c — starting point generated for board: ' + state.board.name + '\n';
    out += ' * Wire pfodParserStream.c up to your actual UART first (see its TODOs),\n';
    out += ' * then fill in the TODOs below.\n';
    out += ' */\n';
    out += '#include "pfodMenu.h"\n';
    out += '\n';
    out += 'void main(void) {\n';
    out += '  // <<< add your microcontroller / peripheral init here\n';
    out += '  pfodParser_setup();\n';
    out += '  while (1) {\n';
    out += '    pfodParser_parse();\n';
    if (charts.length > 0 || pulseItems.length > 0) {
      out += '    // <<<<<<<<<<<  Your other loop() code goes here\n';
    }
    out += '  }\n';
    out += '}\n';
    if (charts.length > 0 || pulseItems.length > 0) {
      out += '\n';
      out += '// TODO: call this from your own periodic timer interrupt.\n';
      out += 'void pfodParser_timerCallback(void) {\n';
      if (pulseItems.length > 0) {
        out += '  pfodParser_millis++; // increment however often this ISR actually fires\n';
      }
      for (const item of charts) {
        const prefix = _chartPrefix(item.autoCmd);
        const intervalLabel = CHART_DATA_INTERVAL_LABELS[item.dataIntervalIdx] || CHART_DATA_INTERVAL_LABELS[DEFAULT_CHART_DATA_INTERVAL_IDX];
        out += '  // set ' + prefix + '_sendDataFlag = 1 once every ' + intervalLabel + " (chart '" + _cStr(item.chartLabel || '') + "')\n";
        out += '  // ' + prefix + '_sendDataFlag = 1;\n';
      }
      out += '}\n';
    }
    return out;
  }

  // ── pfodParserStream.c stub (NOT bundled from sampleCcode — that copy
  // is PIC18-specific; this target has no board/pin info to fill in) ──

  function _generateParserStreamC() {
    let out = '/*\n';
    out += ' * pfodParserStream.c\n';
    out += ' * This is the interface to the i/o.\n';
    out += ' * TODO: replace every body below with calls to YOUR microcontroller\'s\n';
    out += ' * UART (or other serial) driver. As shipped this talks to no hardware.\n';
    out += ' */\n';
    out += '#include "pfodParserStream.h"\n';
    out += '\n';
    out += 'void pfodParserStream_init(void) {\n';
    out += '  // TODO: do any one-time Stream/UART setup here (called from pfodParser_pfodParser()).\n';
    out += '}\n';
    out += '\n';
    out += 'size_t pfodParser_TXfree(void) {\n';
    out += '  // TODO: return the number of bytes free in your UART TX buffer.\n';
    out += '  return 0;\n';
    out += '}\n';
    out += '\n';
    out += 'int pfodParser_write(uint8_t c) {\n';
    out += '  // TODO: write c to your UART TX. Spin here if the buffer is full.\n';
    out += '  return 0;\n';
    out += '}\n';
    out += '\n';
    out += 'size_t pfodParser_RXavailable(void) {\n';
    out += '  // TODO: return the number of bytes available to read from your UART RX.\n';
    out += '  return 0;\n';
    out += '}\n';
    out += '\n';
    out += 'int pfodParser_read(void) {\n';
    out += '  // TODO: read and return one byte from your UART RX. Spin here if none\n';
    out += '  // is available yet — pfodParser_parse_RX() relies on this blocking.\n';
    out += '  return -1;\n';
    out += '}\n';
    return out;
  }

  // ── Dispatch entry point ────────────────────────────────────────────

  function _triggerCcodeDownload(state) {
    const items      = state.getAllItems();
    _checkNoDrawings(items);
    const tree        = _collectMenuNodes(state.rootMenu);
    const charts      = _allCharts(items);
    const pulseItems  = _pulseItems(items);
    const version     = 'V1';
    const bufSize     = _calcBufferSize(version);

    const enc  = new TextEncoder();
    const name = state.name;
    const entries = [
      { path: name + '/pfodMenu.h',         data: enc.encode(_generatePfodMenuH(state, items, charts, pulseItems, bufSize)) },
      { path: name + '/pfodMenu.c',         data: enc.encode(_generatePfodMenuC(state, tree, items, charts, pulseItems)) },
      { path: name + '/pfodParser.h',       data: enc.encode(PFOD_PARSER_H_TEXT) },
      { path: name + '/pfodParser.c',       data: enc.encode(PFOD_PARSER_C_TEXT) },
      { path: name + '/pfodParserStream.h', data: enc.encode(PFOD_PARSER_STREAM_H_TEXT) },
      { path: name + '/pfodParserStream.c', data: enc.encode(_generateParserStreamC()) },
      { path: name + '/main.c',             data: enc.encode(_generateMainC(state, charts, pulseItems)) },
      { path: name + '/json/' + name + '.pfodDesigner_json', data: enc.encode(state.exportToJSON()) },
    ];
    const zipBytes = DesignerZipBuilder.buildZip(entries);
    DesignerZipBuilder.triggerDownload(name + '.zip', zipBytes);
  }

  function send(rawCmd, state, depth) {
    if (!state.name) return { pfod: PFOD_EMPTY, skipSave: true };
    try {
      state.assignCcodeCmds(); // throws if more than 52 items need a cmd letter
      _triggerCcodeDownload(state);
    } catch (e) {
      alert(e.message);
    }
    return { pfod: PFOD_EMPTY, skipSave: true };
  }

  return Object.freeze({ send });
})();
