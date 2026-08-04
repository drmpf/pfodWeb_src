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

  /// PascalCase an item's label text for a per-item hook method name —
  /// split on any run of non-alphanumeric chars, capitalize the first
  /// letter of each word and lowercase the rest, join with no separator.
  /// "Output is" -> "OutputIs", "PWM Setting" -> "PwmSetting",
  /// "Button sub" -> "ButtonSub" — matches Menu_ex_4's own hook names
  /// (onOutputIsChanged / onPwmSettingChanged / onButtonSubPressed).
  function _pascalCase(s) {
    return (s || '')
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');
  }

  /// Sanitize `base` (already a valid-ish identifier fragment, e.g. from
  /// _cppId or _pascalCase) into one that's unique against `usedSet`,
  /// appending _2/_3/... on collision. Records the chosen ident in
  /// usedSet before returning it. Falls back to `fallback` when base is
  /// empty (e.g. an item with no label text).
  function _uniqueIdent(base, usedSet, fallback) {
    let ident = base || fallback;
    let n = 2;
    while (usedSet.has(ident)) { ident = (base || fallback) + '_' + n; n++; }
    usedSet.add(ident);
    return ident;
  }

  // ── Per-item action hooks ────────────────────────────────────────
  // Every onoff/pwm/button/chart item owned directly by one generated
  // class (pfodMainMenu, or a SubMenu_<ident>) gets its own virtual hook
  // method — the mechanical dispatch calls it, its default body holds
  // exactly what today's flat generator already inlines there (pin
  // writes / placeholder response / plot-var assignment). Deduplicated
  // per class (a fresh Set each call) since two items at the SAME level
  // could share identical label text.
  //
  // @param {object[]} items  this level's own items (not descendants)
  // @returns {Map<object, string>} item -> hook method name, for every
  //          onoff/pwm/button/chart item in `items`
  function _computeHookNames(items) {
    const used  = new Set();
    const names = new Map();
    for (const item of items) {
      const label = (item.text || '').replace(/\n/g, ' ').trim();
      if (item.type === 'onoff' || item.type === 'pwm') {
        names.set(item, 'on' + _uniqueIdent(_pascalCase(label), used, 'Value') + 'Changed');
      } else if (item.type === 'button') {
        names.set(item, 'on' + _uniqueIdent(_pascalCase(label), used, 'Button') + 'Pressed');
      } else if (item.type === 'chart') {
        names.set(item, _chartPrefix(item.autoCmd) + '_readPlotData');
      }
    }
    return names;
  }

  /// Protected virtual-hook declaration lines for a class's .h — one per
  /// entry in `hookNames` (computed via _computeHookNames on the SAME
  /// `items` array, so every item that needs a hook has one).
  function _declareHookLines(items, hookNames) {
    let out = '';
    for (const item of items) {
      const name = hookNames.get(item);
      if (!name) continue;
      if (item.type === 'onoff' || item.type === 'pwm') {
        out += '    virtual void ' + name + '(int value);\n';
      } else if (item.type === 'button') {
        out += '    virtual void ' + name + '(pfodParser &parser); // must send a pfod response\n';
      } else if (item.type === 'chart') {
        out += '    virtual void ' + name + '();\n';
      }
    }
    return out;
  }

  // ── Generated-file header ────────────────────────────────────────
  // Every generated file (.ino, .h, .cpp, per-drawing .h/.cpp) opens with
  // the same "// Board: .../// Connection: .../* Code generated by ... */"
  // block identifying the target — shared here so the five generators
  // below stay in sync.

  function _connectionStr(state) {
    return state.connection === 'serial'
      ? 'Serial @ ' + state.baud + ' baud'
      : (state.connection || 'serial');
  }

  function _fileHeader(state) {
    return '// Board: ' + state.board.name + '\n' +
           '// Connection: ' + _connectionStr(state) + '\n' +
           '\n' +
           '/* Code generated by pfodWeb ' + window.JS_VERSION + '\n' +
           ' * (c)2026 Forward Computing and Control Pty. Ltd.\n' +
           ' * NSW Australia, www.forward.com.au\n' +
           ' * This code is not warranted to be fit for any purpose. You may only use it at your own risk.\n' +
           ' * This generated code may be freely used for both private and commercial use\n' +
           ' * provided this copyright is maintained.\n' +
           ' */\n';
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

  // ── Shared per-item mechanical dispatch branch ───────────────────
  // One item -> one "} else if(parser.cmdEquals(...)) { ... }" branch
  // (never opens/closes its OWN outer braces -- callers chain these
  // together, exactly like the existing giant if/else chain already
  // does). Used identically by pfodMainMenu::handle() and every
  // SubMenu_<ident>::handleCmd() -- ctx carries the few things that
  // differ between a top-level `handle()` (void, local `long
  // pfodLongRtn`) and a sub-menu `handleCmd()` (returns bool, receives
  // `long *pfodLongRtn` from its caller).
  //
  // @param {object} item
  // @param {object} ctx  { longRtnAddr, longRtnDeref, sendUpdateCall,
  //                        returnTrue, hookNames, chartContext }
  // @param {Map} submenuNames  _collectSubMenuNames(state) result
  function _itemDispatchBranch(item, ctx, submenuNames) {
    const label = _cppStr((item.text || '').replace(/\n/g, ' ').trim() || item.type);
    const returnTrue = ctx.returnTrue || '';
    let out = '';
    if (item.type === 'onoff') {
      const intVar = _intVarName(item.autoCmd);
      const hookName = ctx.hookNames.get(item);
      out += '    } else if(parser.cmdEquals(' + _cmdVarName(item.autoCmd) + ')) { // user moved slider -- \'' + label + '\'\n';
      out += '      parser.parseLong(pfodFirstArg,' + ctx.longRtnAddr + '); // parse first arg as a long\n';
      if (item.pin && item.pin.invertOutput) {
        out += '      ' + intVar + ' = swap01((int)' + ctx.longRtnDeref + '); // set variable\n';
      } else {
        out += '      ' + intVar + ' = (int)' + ctx.longRtnDeref + '; // set variable\n';
      }
      out += '      ' + hookName + '(' + intVar + '); // virtual hook -- hardware/action handling\n';
      out += '      ' + ctx.sendUpdateCall + '; // always send back a pfod msg otherwise pfodApp will disconnect.\n';
      out += returnTrue;
      out += '\n';
    } else if (item.type === 'pwm') {
      const intVar = _intVarName(item.autoCmd);
      const hookName = ctx.hookNames.get(item);
      out += '    } else if(parser.cmdEquals(' + _cmdVarName(item.autoCmd) + ')) { // user moved slider -- \'' + label + '\'\n';
      out += '      parser.parseLong(pfodFirstArg,' + ctx.longRtnAddr + '); // parse first arg as a long\n';
      out += '      ' + intVar + ' = (int)' + ctx.longRtnDeref + '; // set variable\n';
      out += '      ' + hookName + '(' + intVar + '); // virtual hook -- hardware/action handling\n';
      out += '      ' + ctx.sendUpdateCall + '; // always send back a pfod msg otherwise pfodApp will disconnect.\n';
      out += returnTrue;
      out += '\n';
    } else if (item.type === 'button') {
      const hookName = ctx.hookNames.get(item);
      out += '    } else if(parser.cmdEquals(' + _cmdVarName(item.autoCmd) + ')) { // user pressed -- \'' + label + '\'\n';
      out += '      ' + hookName + '(parser); // virtual hook -- must send a pfod response\n';
      out += returnTrue;
      out += '\n';
    } else if (item.type === 'chart') {
      out += _chartDispatchBranch(item, '// user pressed -- \'' + label + '\'', ctx.chartContext || '');
      if (returnTrue) out += '      ' + returnTrue;
    } else if (item.type === 'label' || item.type === 'onoffdisplay' || item.type === 'datadisplay') {
      out += '//    } else if(parser.cmdEquals(' + _cmdVarName(item.autoCmd) + ')) { // pfodApp NEVER sends this cmd -- \'' + label + '\'\n';
      out += '\n';
    } else if (item.type === 'submenu' && item.subMenu) {
      const info = submenuNames.get(item);
      out += '    } else if(parser.cmdEquals(' + _cmdVarName(item.autoCmd) + ')) { // user pressed sub-menu button -- \'' + label + '\'\n';
      out += '      if (!parser.isRefresh()) {\n';
      out += '        ' + info.varName + '.sendMenu(parser); // send the sub-menu\n';
      out += '      } else {\n';
      out += '        ' + info.varName + '.sendMenuUpdate(parser); // refresh the sub-menu\n';
      out += '      }\n';
      out += returnTrue;
      out += '\n';
    } else if (item.type === 'drawing') {
      out += '    } else if(parser.cmdEquals(' + _dwgCmdVarName(item.autoCmd) + ')) { // user touch not handled by dwg, handle it here\n';
      out += '      // drawing loadCmd handled internally by dwg_xxx.init()\n';
      out += '      // add touchZone handling here and return response for inputs that return false from processDwgCmds()\n';
      out += '      ' + ctx.sendUpdateCall + '; // always send back a pfod msg otherwise pfodApp will disconnect.\n';
      out += returnTrue;
      out += '\n';
    }
    return out;
  }

  /// Default virtual-hook method BODIES -- exactly the placeholder /
  /// pin-write / pulse-timer code that used to be inlined directly in
  /// the mechanical dispatch branch, now the hook's own body (hardware
  /// side effects live only here, matching generated-code-structure.md's
  /// "where hardware/pin code actually lives" rule -- collapsed into
  /// this one class instead of a separate thin override).
  function _onoffHookBody(item, className, hookName) {
    let out = 'void ' + className + '::' + hookName + '(int value) {\n';
    out += '  (void)value;\n';
    if (item.pin && item.pin.name) {
      out += '  ' + _pinWriteFn(item.pin.type) + '(' + _pinConstName(item.autoCmd) + ', value); // set output\n';
    }
    if (item.pulse && item.pulse !== 'none') {
      const cmdVar = _cmdVarName(item.autoCmd);
      const triggerVal = item.pulse === 'low' ? 0 : 1;
      out += '  if (value == ' + triggerVal + ') {\n';
      out += '    ' + cmdVar + '_pulseStartTime = millis();\n';
      out += '    ' + cmdVar + '_pulseRunning = true;\n';
      out += '  } else {\n';
      out += '    ' + cmdVar + '_pulseRunning = false;\n';
      out += '  }\n';
    }
    out += '}\n\n';
    return out;
  }

  function _pwmHookBody(item, className, hookName) {
    let out = 'void ' + className + '::' + hookName + '(int value) {\n';
    out += '  (void)value;\n';
    if (item.pin && item.pin.name) {
      out += '  ' + _pinWriteFn(item.pin.type) + '(' + _pinConstName(item.autoCmd) + ', value); // set output\n';
    }
    out += '}\n\n';
    return out;
  }

  function _buttonHookBody(className, hookName) {
    let out = 'void ' + className + '::' + hookName + '(pfodParser &parser) {\n';
    out += '  // << add your action code here for this button\n';
    out += '  parser.print(F("{}")); // change this return as needed.\n';
    out += '}\n\n';
    return out;
  }

  /// A plot wired to an input pin reads it here, via the same
  /// <prefix>_plot_<n>_pin constant the pin-settings block already
  /// declares for it (see the chart loop in the pin-constants section) —
  /// without this the constant was emitted but never used, and every plot
  /// got the "replace this Min value" placeholder even when the user had
  /// connected it to an ADC pin.  Plots with no pin keep the placeholder:
  /// their data comes from the user's own loop variables.
  function _chartReadPlotDataHookBody(item, className, hookName) {
    const prefix = _chartPrefix(item.autoCmd);
    let out = 'void ' + className + '::' + hookName + '() {\n';
    out += '  // assign values to plot variables from your loop variables or read ADC inputs\n';
    for (let n = 1; n <= 3; n++) {
      const p       = item.plots[n - 1];
      const plotVar = prefix + '_plot_' + n + '_var';
      if (p.pin && p.pin.name) {
        out += '  ' + plotVar + ' = ' + _pinReadFn(p.pin.type) + '(' + prefix + '_plot_' + n + '_pin);  // read ADC input\n';
      } else {
        out += '  ' + plotVar + ' = ' + prefix + '_plot_' + n + '_varMin; //<<< replace this Min value with your actual data\n';
      }
    }
    out += '}\n\n';
    return out;
  }

  /// Non-virtual chart data-send method — calls the virtual readPlotData
  /// hook (own class, unqualified) then streams the CSV plot record.
  /// PUBLIC (unlike the hook) because a parent level's own tickCharts()
  /// calls a descendant sub-menu's own <prefix>_sendData directly.
  function _chartSendDataMethod(item, className, hookName) {
    const prefix = _chartPrefix(item.autoCmd);
    let out = 'void ' + className + '::' + prefix + '_sendData(pfodParser &parser) {\n';
    out += '  if (' + prefix + '_plotDataTimer.justFinished()) {\n';
    out += '    ' + prefix + '_plotDataTimer.repeat(); // restart plot data timer, without drift\n';
    out += '    ' + hookName + '(); // virtual hook -- assigns the 3 plot vars\n';
    out += '    // send plot data in CSV format\n';
    out += '    parser.print(millis() - plot_msOffset); // time in milliseconds\n';
    for (let n = 1; n <= 3; n++) {
      out += '    parser.print(\',\'); parser.print(((float)(' + prefix + '_plot_' + n + '_var-' +
             prefix + '_plot_' + n + '_varMin)) * ' + prefix + '_plot_' + n + '_scaling + ' +
             prefix + '_plot_' + n + '_varDisplayMin);\n';
    }
    out += '    parser.println(); // end of CSV data record\n';
    out += '  }\n';
    out += '}\n\n';
    return out;
  }

  // Drawing names use only the _Cmd suffix (stripping type_text_ prefix),
  // so "drawing_Drawing_Cmd" → "Cmd" and "drawing_Drawing_Cmd_2" → "Cmd_2".
  // Used only for the menu ITEM's own tap-cmd identity (_dwgCmdVarName,
  // below) — never for the dwg class/instance name, which is based on
  // the LINKED DWG's own name instead (see _dwgClassName/_dwgVarName).
  function _dwgSuffix(autoCmd) {
    const id  = _cppId(autoCmd);
    const pos = id.indexOf('_Cmd');
    return pos >= 0 ? id.substring(pos + 1) : id;
  }

  // pfodAutoCmd variable name for a drawing item's tap-cmd (the menu
  // item's own row-touch identity, e.g. Menu_withDwg's own
  // dwgMenuItem_Cmd) — based on the ITEM's autoCmd, independent of
  // which dwg happens to be linked to it.
  function _dwgCmdVarName(autoCmd) {
    return 'dwgMenuItem_' + _dwgSuffix(autoCmd);
  }

  // The generated dwg class/instance name is based on the LINKED DWG's
  // OWN name (via DwgArduinoExport.identifier — dwgArduinoExport.js,
  // the same "Generate Code"/"Generate Serial" feature's own per-dwg
  // generator, reused directly here — see _generateDrawingFiles), NOT
  // the menu item's own autoCmd. The two must name it identically since
  // this reuses that generator's own output verbatim.
  function _dwgClassName(item) {
    return 'Dwg_' + DwgArduinoExport.identifier(item.dwgName);
  }

  function _dwgVarName(item) {
    return 'dwg_' + DwgArduinoExport.identifier(item.dwgName);
  }

  // True when a Drawing item's own linked dwg actually resolves in
  // DwgLibrary right now. A menu-level Drawing item's dwgName is never
  // null/invalid by construction (see addMenuItem.js/selectDwgForItem.js's
  // own deferred-creation guarantee, and state.js's _parseItemTolerant,
  // which drops any item that somehow isn't) — but the dwg itself can
  // still have been unloaded/removed from the library AFTER being
  // linked, so this is checked fresh at generate-code time, not assumed.
  function _dwgIsLinked(item) {
    return !!DwgLibrary.get(item.dwgName);
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

  // ── Sub-menu class naming ────────────────────────────────────────
  // Every 'submenu' item anywhere in the tree (main-level sub-menus and
  // their own nested sub-sub-menus) gets its own generated class. Names
  // are assigned ONCE, up front, in a single global-uniqueness pass —
  // both the outer delegation code (main menu / a parent sub-menu calling
  // into a child) and the child's own generated file need to agree on
  // the exact same className/varName.

  function _assignSubMenuNames(items, usedIdents, out) {
    for (const item of items) {
      if (item.type !== 'submenu' || !item.subMenu) continue;
      const label = (item.text || '').replace(/\n/g, ' ').trim();
      const ident = _uniqueIdent(_cppId(label), usedIdents, 'SubMenu');
      out.set(item, { className: 'SubMenu_' + ident, varName: 'subMenu_' + ident });
      _assignSubMenuNames(item.subMenu.items, usedIdents, out);
    }
  }

  /// @param {object} state
  /// @returns {Map<object, {className: string, varName: string}>} every
  ///          submenu item anywhere in the tree -> its assigned class name
  function _collectSubMenuNames(state) {
    const out = new Map();
    _assignSubMenuNames(state.rootMenu.items, new Set(), out);
    return out;
  }

  /// True if `menu` itself, or any descendant sub-menu at any depth,
  /// contains at least one chart item. tickCharts() only needs to exist
  /// (declared, defined, called, and delegated-to from a parent) at
  /// levels where this is true — everywhere else it would just be dead
  /// code: no chart of its own to send, and nothing below it to
  /// delegate to either.
  /// @param {object} menu
  /// @returns {boolean}
  function _subtreeHasChart(menu) {
    for (const item of menu.items) {
      if (item.type === 'chart') return true;
      if (item.type === 'submenu' && item.subMenu && _subtreeHasChart(item.subMenu)) return true;
    }
    return false;
  }

  /// True if `item` is an onoff with a pulse timer configured -- the items
  /// that need a <cmd>_pulseStartTime / _pulseRunning / _PULSE_LENGTH set
  /// of statics and a <cmd>_checkPulse() called on every loop.
  /// @param {object} item
  /// @returns {boolean}
  function _itemHasPulse(item) {
    return item.type === 'onoff' && item.pulse && item.pulse !== 'none';
  }

  /// True if `menu` itself, or any descendant sub-menu at any depth, has a
  /// pulsed onoff item. The sub-menu counterpart of _subtreeHasChart: a
  /// pulse timer has to be checked on every loop, but a sub-menu has no
  /// loop of its own, so tickPulses() cascades down from pfodMainMenu
  /// ::handle() exactly the way tickCharts() does -- and, like tickCharts,
  /// only exists at levels where this is true.
  /// @param {object} menu
  /// @returns {boolean}
  function _subtreeHasPulse(menu) {
    for (const item of menu.items) {
      if (_itemHasPulse(item)) return true;
      if (item.type === 'submenu' && item.subMenu && _subtreeHasPulse(item.subMenu)) return true;
    }
    return false;
  }

  /// True if any of `items` needs the swap01() helper -- an onoff whose pin
  /// inverts its output.  That is the exact condition guarding every call
  /// site: _itemDispatchBranch's own invertOutput branch (both menu levels)
  /// and sendMainMenu / sendMainMenuUpdate's own swapped current state.
  /// Declared and defined per-file only when one of those actually emits a
  /// call, since an unused `static` function draws a -Wunused-function
  /// warning.
  /// @param {Array} items
  /// @returns {boolean}
  function _needsSwap01(items) {
    return items.some(i => i.type === 'onoff' && i.pin && i.pin.invertOutput);
  }

  /// Collect every dwg reachable from the design's own Drawing menu
  /// items (main + sub + sub-sub menu, each expanded via
  /// DwgArduinoExport.collectAllDwgs (dwgArduinoExport.js) into whatever
  /// it reaches via insertDwg too) and generate its REAL Dwg_<name>.h/
  /// .cpp pair via DwgArduinoExport's own per-dwg generator — the exact
  /// same generator the Dwg Controls Panel's own Generate Code/Generate
  /// Serial button uses for a single dwg, reused here directly instead
  /// of a generic stub, per direction ("follow the create/edit dwg
  /// Generate Serial format for adding the dwg to the menu generated
  /// code"). A dwg linked from more than one Drawing item (or reached
  /// via more than one insertDwg chain) is only generated once —
  /// collectAllDwgs already dedupes via its own `collected` Set.
  /// Missing dwgs (linked but not currently loaded, or an insertDwg
  /// target reached from one that is) don't stop generation — the
  /// missing set is threaded into every generated .cpp so a reference
  /// to one is commented out there too (DwgArduinoExport.generateDwgCpp's
  /// own missingDwgSet param), matching the Dwg Controls Panel's own
  /// missing-dwg tolerance; the caller reports `missing` back to the user.
  /// @param {object} state
  /// @returns {{files: Array<{filename: string, content: string}>,
  ///            names: Array<string>, missing: Array<string>}} `names`
  ///          is every dwg actually generated (for the caller to also
  ///          bundle each one's own re-loadable .pfodDwg_json)
  function _generateDrawingFiles(state) {
    const drawings  = _allDrawings(state.rootMenu.items);
    const collected = new Set();
    const missing   = [];
    drawings.forEach(({ item }) => {
      DwgArduinoExport.collectAllDwgs(item.dwgName, collected, missing);
    });

    const missingSet = new Set(missing);
    const names = Array.from(collected);
    const files = [];
    names.forEach((dwgName) => {
      const dwg = DwgLibrary.get(dwgName);
      const flatDwg = Object.assign({}, dwg, { items: flattenTouchActions(dwg.items || []) });
      const cls = 'Dwg_' + DwgArduinoExport.identifier(dwgName);
      files.push({ filename: cls + '.h',   content: DwgArduinoExport.generateDwgHeader(flatDwg) });
      files.push({ filename: cls + '.cpp', content: DwgArduinoExport.generateDwgCpp(flatDwg, missingSet) });
    });
    return { files, names, missing };
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

  /// Read-side counterpart to _pinWriteFn.  Unlike writes — where a pin
  /// that natively supports DAC output needs dacWrite() rather than
  /// analogWrite() — reads have no such split: analogRead()/digitalRead()
  /// are the Arduino core API on every board family this generator emits
  /// for (AVR, ESP32, ESP8266/ESP8285, RP2040/RP2350), so the function is
  /// chosen by what the pin is being used AS, not by the chip.  The one
  /// target with no Arduino pin API at all, "Minimal C Code", is emitted
  /// by generateCcode.js, which never generates pin reads or writes.
  /// analog_input_serial (ESP32 ADC2, usable only on a Serial connection)
  /// is still an ordinary analogRead() — the restriction is on WHEN the
  /// pin can be offered, handled in the pin pickers, not on how it reads.
  ///
  /// NOTE the ADC's own full-scale count is a chip property analogRead()
  /// does not normalise (AVR/RP2040 0-1023, ESP32 0-4095 by default) —
  /// that is carried by each plot's own Data Variable Range, set in the
  /// plot editor, not by this function.
  /// @param {string} pinType — a PinType value from the item/plot's pin
  /// @returns {string} Arduino read-function name
  function _pinReadFn(pinType) {
    if (pinType === 'analog_input' || pinType === 'analog_input_serial') return 'analogRead';
    return 'digitalRead';
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
    let out = _fileHeader(state);

    // The rest of the sketch (connection setup/parser wiring/setup/loop)
    // comes from variants/<...>/<connection>.ino, built into INO_TEMPLATES
    // by build_boards.js (see designer/boards/shared/inoTemplates.js) —
    // this keeps the sketch body editable per board/connection without
    // touching this generator.  Used verbatim, no substitution.
    const connection = state.connection || 'serial';
    const connCfg     = state.board.connections[connection];
    const templateId  = connCfg && connCfg.inoTemplateId;
    const template     = templateId && INO_TEMPLATES[templateId];
    if (!template) {
      throw new Error('[DesignerGenerateCode] no "' + connection + '" .ino template found for board "' + state.board.name + '"');
    }
    out += template;
    return out;
  }

  // ── .h generator ──────────────────────────────────────────────────
  // pfodMainMenu is a real class (public virtual sendMainMenu/
  // sendMainMenuUpdate — public so a sketch can send the menu itself, and
  // matching SubMenu_<ident>'s own public sendMenu/sendMenuUpdate —
  // and per-item action hooks — the method SHAPE of generated-code-
  // structure.md's pfodMainMenu_Base) but with no thin/Base split: hook
  // bodies live directly in this one class (see _generateCpp), matching
  // dwgArduinoExport.js's own flat, unsplit Dwg_<name> class style. The
  // free-function bridge (handle_mainMenuFnPtr / init_pfodMainMenu /
  // handle_pfodMainMenu) is unchanged so the .ino templates (which call
  // these, not the class directly) need no changes.

  function _generateH(state) {
    const menu  = state.getActiveMenu();
    const items = menu.items;
    const hookNames = _computeHookNames(items);

    let out = _fileHeader(state);
    out += '#ifndef PFOD_MAIN_MENU_H\n';
    out += '#define PFOD_MAIN_MENU_H\n';
    out += '// pfodMainMenu.h\n';
    out += '\n';
    out += '#include <pfodParser.h>\n';
    out += 'typedef void (*pfodCloseConnectionPtr)(Stream *);  // the pointer to the method that handles parser closeConnection calls\n';
    out += '\n';
    const charts = items.filter(i => i.type === 'chart');

    out += 'class pfodMainMenu {\n';
    out += '  public:\n';
    out += '    pfodMainMenu();\n';
    out += '    void init(pfodCloseConnectionPtr _closeConnectionFnPtr = NULL);\n';
    out += '    virtual void sendMainMenu(pfodParser &parser);\n';
    out += '    virtual void sendMainMenuUpdate(pfodParser &parser);\n';
    out += '    void handle(pfodParser &parser);\n';
    if (_subtreeHasChart(menu)) {
      out += '    void tickCharts(pfodParser &parser); // streams this level\'s own charts + every nested sub-menu\'s\n';
    }
    for (const item of charts) {
      out += '    void ' + _chartPrefix(item.autoCmd) + '_sendData(pfodParser &parser);\n';
    }
    out += '  protected:\n';
    out += _declareHookLines(items, hookNames);
    // pfodAutoCmd members — one per item (main menu's own items only —
    // a sub-menu's own items are declared as members of its own
    // SubMenu_<ident> class instead, see _generateSubMenuFiles).
    // protected, not private, so a user's own subclass can reach the cmd
    // of any item it wants to handle itself.
    for (const item of items) {
      const label = _cppStr((item.text || '').replace(/\n/g, ' ').trim() || item.type);
      if (item.type === 'drawing') {
        out += '    pfodAutoCmd ' + _dwgCmdVarName(item.autoCmd) + '; // drawing menu item\n';
      } else {
        out += '    pfodAutoCmd ' + _cmdVarName(item.autoCmd) + '; // ' + item.type + ' -- \'' + label + '\'\n';
      }
    }
    out += '  private:\n';
    out += '    bool initialized;\n';
    out += '    pfodCloseConnectionPtr closeConnectionFnPtr;\n';
    out += '};\n';
    out += '\n';
    out += '// entry points used by the main sketch\n';
    out += 'typedef  void (*handle_mainMenuFnPtr)(pfodParser & parser);\n';
    out += 'handle_mainMenuFnPtr init_pfodMainMenu(pfodCloseConnectionPtr = NULL);\n';
    out += 'void handle_pfodMainMenu(pfodParser & parser);\n';
    out += '\n';
    // The instance is a real (non-static) global defined in pfodMainMenu.cpp,
    // declared here so the sketch -- or any other translation unit -- can
    // reach it directly, e.g. to call sendMainMenu/sendMainMenuUpdate.
    out += 'extern pfodMainMenu mainMenu;\n';
    out += '#endif\n';
    return out;
  }

  // ── .cpp generator ───────────────────────────────────────────────

  function _generateCpp(state) {
    const name  = state.name;
    const menu  = state.getActiveMenu();
    const items = menu.items;
    const charts    = items.filter(i => i.type === 'chart');
    const drawings  = items.filter(i => i.type === 'drawing');
    const childSubs = items.filter(i => i.type === 'submenu' && i.subMenu);
    const submenuNames = _collectSubMenuNames(state);
    const hookNames = _computeHookNames(items);

    let out = _fileHeader(state);
    out += '/* ===== pfod Command for ' + name + ' ====\n';
    out += 'pfodApp msg {.} --> ' + _pfodMsgForComment(state) + '\n';
    out += ' */\n';
    out += '// pfodMainMenu.cpp\n';
    out += '\n';
    out += '#include "pfodMainMenu.h"\n';
    out += '#include <pfodParser.h>\n';
    out += '#include <pfodDebugPtr.h>\n';
    // No <pfodDwgs.h> / <pfodDrawing.h> here -- each Dwg_<name>.h below
    // already pulls in what a drawing needs, matching dwgArduinoExport.js's
    // own _generateMainMenuCpp (the reference single-dwg pfodMainMenu.cpp).
    if (drawings.length > 0) {
      for (const item of drawings) {
        if (_dwgIsLinked(item)) {
          out += '#include "' + _dwgClassName(item) + '.h"\n';
        } else {
          out += '// MISSING: dwg \'' + item.dwgName + '\' is not currently loaded --\n' +
                 '// load it and regenerate to include this line:\n' +
                 '// #include "' + _dwgClassName(item) + '.h"\n';
        }
      }
    }
    for (const child of childSubs) {
      out += '#include "' + submenuNames.get(child).className + '.h" // sub-menu -- \'' +
             _cppStr((child.text || '').replace(/\n/g, ' ').trim()) + '\'\n';
    }
    out += '\n';
    out += '// #define DEBUG\n';
    out += '\n';
    // The one real instance, non-static and declared `extern` in the .h so
    // the sketch can reach it directly.  Defined up here, above everything
    // that might want it, rather than buried after the file's statics.
    out += 'pfodMainMenu mainMenu;\n';
    out += '\n';
    // Pin constants for this menu's own pinned items, and for any chart plot
    // wired to an analog input.  Collected first so the '// Pin settings'
    // header is only emitted when something actually lands under it -- a
    // menu with no hardware would otherwise get a dangling header.
    const pinLines = [];
    for (const item of items) {
      if (item.pin && item.pin.name) {
        const pinLabel = _cppStr((item.text || '').replace(/\n/g, ' ').trim() || item.type);
        pinLines.push('const int ' + _pinConstName(item.autoCmd) + ' = ' + item.pin.codeName + '; // name the ' + item.pin.type.replace(/_/g, ' ') + ' pin for \'' + pinLabel + '\'\n');
      }
    }
    for (const item of charts) {
      const prefix = _chartPrefix(item.autoCmd);
      for (let n = 1; n <= 3; n++) {
        const p = item.plots[n - 1];
        if (p.pin && p.pin.name) {
          const plotLabel = _cppStr((p.plotLabel || '').replace(/\n/g, ' ').trim() || ('plot ' + n));
          pinLines.push('const int ' + prefix + '_plot_' + n + '_pin = ' + p.pin.codeName + '; // name the analog input pin for \'' + plotLabel + '\'\n');
        }
      }
    }
    // A board with no pin definitions at all still gets the header plus its
    // "fill these in yourself" note -- that note IS the content in that case.
    const noBoardPins = state.board.pins.length === 0;
    if (pinLines.length > 0 || noBoardPins) {
      out += '// Pin settings\n';
      if (noBoardPins) {
        out += '// Fill in the appropriate pin nos for your board here\n';
      }
      pinLines.forEach((line) => { out += line; });
      out += '\n';
    }
    out += 'static Print* debugPtr = NULL;  // local to this file\n';
    out += 'static const unsigned long refresh_ms = ' + menu.refresh_ms + '; // main menu refresh\n';
    if (_needsSwap01(items)) {
      out += 'static int swap01(int in);\n';
    }
    if (charts.length > 0) {
      out += 'float getPlotVarScaling(long varMax, long varMin, float displayMax, float displayMin);\n';
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

    // Each linked dwg's own global instance (Dwg_X dwg_X;) is defined
    // exactly once, in that dwg's own Dwg_X.cpp (DwgArduinoExport's own
    // generateDwgCpp) — its Dwg_X.h (already #included above) declares
    // it `extern`, which is all this file needs to use it. Declaring a
    // SECOND real (non-extern) instance here would be a duplicate
    // definition and fail to link.
    // Not static -- a sub-menu's own SubMenu_<ident>.cpp (a different
    // translation unit) also reads these for its own charts, see
    // _generateSubMenuFiles's own 'extern' declarations.
    out += 'unsigned long plot_msOffset = 0; // set by {@} response\n';
    out += 'bool clearPlot = false; // set by the {@} response code\n';
    out += '\n';
    for (const item of charts) {
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
      const intervalIdx   = chartDataIntervalIdx(item);
      const intervalMs    = CHART_DATA_INTERVALS[intervalIdx];
      const intervalLabel = CHART_DATA_INTERVAL_LABELS[intervalIdx];
      out += 'static pfodDelay ' + prefix + '_plotDataTimer; // plot data timer\n';
      out += 'static unsigned long ' + prefix + '_PLOT_DATA_INTERVAL = ' + intervalMs + ';// ms == ' + intervalLabel + ', edit this to change the plot data interval\n';
    }
    if (charts.length > 0) out += '\n';

    // Per-item action hook bodies -- see _computeHookNames/_declareHookLines
    // in this file's shared helpers section; bodies hold exactly what used
    // to be inlined directly in the mechanical dispatch branch below.
    // Emitted as the FIRST methods in the file: these are what the user
    // edits, so they go above the fully-generated machinery (constructor /
    // init / handle / tickCharts / sendMainMenu*) rather than being buried
    // after it.  Everything they reference -- pin constants, plot-data
    // statics, and the getPlotVarScaling / <cmd>_readADC forward
    // declarations -- is emitted above this point.
    for (const item of items) {
      const hookName = hookNames.get(item);
      if (!hookName) continue;
      if      (item.type === 'onoff')  out += _onoffHookBody(item, 'pfodMainMenu', hookName);
      else if (item.type === 'pwm')    out += _pwmHookBody(item, 'pfodMainMenu', hookName);
      else if (item.type === 'button') out += _buttonHookBody('pfodMainMenu', hookName);
      else if (item.type === 'chart')  out += _chartReadPlotDataHookBody(item, 'pfodMainMenu', hookName);
    }

    out += 'pfodMainMenu::pfodMainMenu() {\n';
    out += '  initialized = false;\n';
    out += '  closeConnectionFnPtr = NULL;\n';
    out += '}\n\n';

    out += 'void pfodMainMenu::init(pfodCloseConnectionPtr _closeConnectionFnPtr) {\n';
    out += '  if (initialized) {\n';
    out += '    return;\n';
    out += '  }\n';
    out += '  (void)debugPtr;  // suppress not used warning\n';
    out += '#ifdef DEBUG\n';
    out += '  debugPtr = getDebugPtr();\n';
    out += '#endif\n';
    out += '  initialized = true;\n';
    out += '  closeConnectionFnPtr = _closeConnectionFnPtr;\n';
    for (const item of items) {
      const label = _cppStr((item.text || '').replace(/\n/g, ' ').trim() || item.type);
      if (item.type === 'onoff') {
        const intVar  = _intVarName(item.autoCmd);
        const initVar = (item.pin && item.pin.invertOutput) ? (item.current === 0 ? 1 : 0) : item.current;
        if (item.pin && item.pin.name) {
          const pinConst  = _pinConstName(item.autoCmd);
          const initLevel = initVar ? 'HIGH' : 'LOW';
          out += '  pinMode(' + pinConst + ', ' + _pinModeStr(item.pin.type) + '); // ' + item.pin.type.replace(/_/g, ' ') + ' for \'' + label + '\' is initially ' + initLevel + ',\n';
          out += '  ' + _pinWriteFn(item.pin.type) + '(' + pinConst + ',' + intVar + '); // set output\n';
        }
      } else if (item.type === 'pwm') {
        const intVar = _intVarName(item.autoCmd);
        if (item.pin && item.pin.name) {
          const pinConst = _pinConstName(item.autoCmd);
          out += '  pinMode(' + pinConst + ', OUTPUT); // output for \'' + label + '\' is initially ' + item.minValue + ',\n';
          out += '  ' + _pinWriteFn(item.pin.type) + '(' + pinConst + ',' + intVar + '); // set output\n';
        }
      } else if (item.type === 'onoffdisplay') {
        if (item.pin && item.pin.name) {
          const pinConst = _pinConstName(item.autoCmd);
          out += '  pinMode(' + pinConst + ', INPUT); // input for \'' + label + '\'\n';
        }
      } else if (item.type === 'datadisplay') {
        if (item.pin && item.pin.name) {
          out += '  ' + _cppId(item.autoCmd) + '_adcTimer.start(' + _cppId(item.autoCmd) + '_ADC_READ_INTERVAL); // start ADC timer\n';
        }
      }
    }
    for (const item of charts) {
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
    for (const item of drawings) {
      const label = _cppStr((item.text || '').replace(/\n/g, ' ').trim() || 'drawing');
      if (_dwgIsLinked(item)) {
        out += '  ' + _dwgVarName(item) + '.init(); // initialize drawing -- \'' + label + '\'\n';
      } else {
        out += '  // MISSING: dwg \'' + item.dwgName + '\' is not currently loaded -- load it and regenerate:\n' +
               '  // ' + _dwgVarName(item) + '.init(); // initialize drawing -- \'' + label + '\'\n';
      }
    }
    for (const child of childSubs) {
      out += '  ' + submenuNames.get(child).varName + '.init(); // initialize sub-menu\n';
    }
    out += '}\n\n';

    // handle() -- mechanical dispatch, unchanged shape from before the
    // class split; sub-menu items now delegate to their own instance
    // instead of inlining the sub-menu's own logic here.
    out += '// the loop routine runs over and over again forever:\n';
    out += 'void pfodMainMenu::handle(pfodParser& parser) {\n';
    out += '  if (!initialized) {\n';
    out += '    if (debugPtr) {\n';
    out += '      debugPtr->println(F(" Need to call init_pfodMainMenu() from setup()."));\n';
    out += '    }\n';
    out += '  }\n';
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

    const ctx = {
      longRtnAddr:    '&pfodLongRtn',
      longRtnDeref:   'pfodLongRtn',
      sendUpdateCall: 'sendMainMenuUpdate(parser)',
      returnTrue:     '',
      hookNames:      hookNames,
      chartContext:   '// in the main Menu of ' + name,
    };
    for (const item of items) {
      out += _itemDispatchBranch(item, ctx, submenuNames);
    }
    for (const child of childSubs) {
      const info = submenuNames.get(child);
      out += '    } else if (' + info.varName + '.handleCmd(parser, cmd, pfodFirstArg, &pfodLongRtn)) {\n';
      out += '      // handled by the sub-menu\'s own items\n';
    }

    out += '    } else if (\'!\' == cmd) {\n';
    out += '      // CloseConnection command\n';
    out += '      if (closeConnectionFnPtr) {\n';
    out += '        closeConnectionFnPtr(parser.getPfodAppStream());\n';
    out += '      }\n';
    out += '    } else {\n';
    out += '      // unknown command\n';
    out += '      parser.print(F("{}")); // always send back a pfod msg otherwise pfodApp will disconnect.\n';
    out += '    }\n';
    out += '  }\n';
    for (const item of items) {
      if (_itemHasPulse(item)) {
        out += '  ' + _cmdVarName(item.autoCmd) + '_checkPulse(); \n';
      }
    }
    // A sub-menu has no loop of its own, so its pulse timers are checked
    // from here, cascading down through tickPulses the same way tickCharts
    // does (see _subtreeHasPulse / _generateSubMenuFiles's own tickPulses).
    for (const child of childSubs) {
      if (!_subtreeHasPulse(child.subMenu)) continue; // that child has no tickPulses() of its own
      out += '  ' + submenuNames.get(child).varName + '.tickPulses(); // sub-menu pulse timers\n';
    }
    for (const item of items) {
      if (item.type === 'onoffdisplay' && item.pin && item.pin.name) {
        const intVar   = _intVarName(item.autoCmd);
        const pinConst = _pinConstName(item.autoCmd);
        out += '  ' + intVar + ' = digitalRead(' + pinConst + '); // read input pin\n';
      }
    }
    for (const item of items) {
      if (item.type === 'datadisplay' && item.pin && item.pin.name) {
        out += '  ' + _cppId(item.autoCmd) + '_readADC(); \n';
      }
    }
    const hasCharts = _subtreeHasChart(menu);
    if (hasCharts) {
      out += '  tickCharts(parser); // stream every chart\'s data (this level + every nested sub-menu)\n';
    }
    out += '  //  <<<<<<<<<<<  Your other loop() code goes here \n';
    out += '  \n';
    out += '}\n';
    out += '\n';

    if (hasCharts) {
      out += 'void pfodMainMenu::tickCharts(pfodParser &parser) {\n';
      for (const item of charts) {
        out += '  ' + _chartPrefix(item.autoCmd) + '_sendData(parser);\n';
      }
      for (const child of childSubs) {
        if (!_subtreeHasChart(child.subMenu)) continue; // that child has no tickCharts() of its own
        out += '  ' + submenuNames.get(child).varName + '.tickCharts(parser);\n';
      }
      out += '}\n\n';
    }

    // Per-chart sendData methods -- read plot inputs on the plot data
    // timer, call the virtual readPlotData hook, stream one CSV record
    // (time, plot1..plot3) per interval.
    for (const item of charts) {
      out += _chartSendDataMethod(item, 'pfodMainMenu', hookNames.get(item));
    }
    if (charts.length > 0) {
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

    out += 'void pfodMainMenu::sendMainMenu(pfodParser& parser) {\n';
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
        if (_dwgIsLinked(item)) {
          out += '  parser.print(' + _dwgVarName(item) + '); // the drawing\'s loadCmd\n';
        } else {
          out += '  // MISSING: dwg \'' + item.dwgName + '\' is not currently loaded -- load it and regenerate:\n' +
                 '  // parser.print(' + _dwgVarName(item) + '); // the drawing\'s loadCmd\n';
        }
      }
    }

    out += '  parser.endOfMsg();  // close pfod message. Send }\n';
    out += '}\n';
    out += '\n';

    // sendMainMenuUpdate
    out += 'void pfodMainMenu::sendMainMenuUpdate(pfodParser& parser) {\n';
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
    if (_needsSwap01(items)) {
      out += 'static int swap01(int in) {\n';
      out += '  return (in==0)?1:0;\n';
      out += '}\n';
      out += '\n';
    }

    // Free-function bridge -- unchanged external shape from before the
    // class split, so the .ino templates (which call these, not the
    // class directly) need no changes.
    out += 'handle_mainMenuFnPtr init_pfodMainMenu(pfodCloseConnectionPtr _closeConnectionFnPtr) {\n';
    out += '  mainMenu.init(_closeConnectionFnPtr);\n';
    out += '  return handle_pfodMainMenu;\n';
    out += '}\n\n';
    out += 'void handle_pfodMainMenu(pfodParser& parser) {\n';
    out += '  mainMenu.handle(parser);\n';
    out += '}\n';
    out += '// ============= end generated code =========\n';
    out += '\n';
    return out;
  }

  // ── Sub-menu class generator ──────────────────────────────────────
  // One SubMenu_<ident> class per sub-menu item, any nesting depth --
  // the class-per-sub-menu counterpart of pfodMainMenu, minus the free-
  // function bridge (nothing external needs to reach a sub-menu except
  // its owning level, via the global instance directly). Recurses into
  // any nested sub-sub-menus first so their own files are ready to
  // bundle alongside this one.
  //
  // @param {object} item   the 'submenu' item owning this sub-menu
  // @param {Map}    names  _collectSubMenuNames(state) result
  // @param {object} state
  // @returns {{className: string, varName: string, h: string,
  //            cpp: string, childFiles: Array<{filename, content}>}}
  function _generateSubMenuFiles(item, names, state) {
    const info      = names.get(item);
    const className = info.className;
    const varName   = info.varName;
    const subMenu   = item.subMenu;
    const items     = subMenu.items;
    const label     = _cppStr((item.text || '').replace(/\n/g, ' ').trim() || 'sub-menu');

    const childSubs = items.filter(i => i.type === 'submenu' && i.subMenu);
    let childFiles = [];
    const childGens = childSubs.map(child => _generateSubMenuFiles(child, names, state));
    childGens.forEach((gen) => {
      childFiles.push({ filename: gen.className + '.h',   content: gen.h });
      childFiles.push({ filename: gen.className + '.cpp', content: gen.cpp });
      childFiles = childFiles.concat(gen.childFiles);
    });

    const charts   = items.filter(i => i.type === 'chart');
    const drawings = items.filter(i => i.type === 'drawing');
    const hookNames = _computeHookNames(items);
    const guard = _cppId(className).toUpperCase();

    // ── .h ──
    let h = _fileHeader(state);
    h += '#ifndef ' + guard + '_H\n';
    h += '#define ' + guard + '_H\n';
    h += '// ' + className + '.h -- generated by pfodWeb Generate Code, fully\n';
    h += '// mechanical/regenerated -- see ' + className + '.cpp for hook bodies.\n';
    h += '#include <pfodParser.h>\n';
    h += '\n';
    h += 'class ' + className + ' {\n';
    h += '  public:\n';
    h += '    ' + className + '();\n';
    h += '    void init();\n';
    h += '    virtual void sendMenu(pfodParser &parser);\n';
    h += '    virtual void sendMenuUpdate(pfodParser &parser);\n';
    h += '    bool handleCmd(pfodParser &parser, uint8_t cmd, uint8_t *pfodFirstArg, long *pfodLongRtn);\n';
    if (_subtreeHasChart(subMenu)) {
      h += '    void tickCharts(pfodParser &parser); // streams this level\'s own charts + every nested sub-menu\'s\n';
    }
    if (_subtreeHasPulse(subMenu)) {
      h += '    void tickPulses(); // checks this level\'s own pulse timers + every nested sub-menu\'s\n';
    }
    for (const cItem of charts) {
      h += '    void ' + _chartPrefix(cItem.autoCmd) + '_sendData(pfodParser &parser);\n';
    }
    h += '  protected:\n';
    h += _declareHookLines(items, hookNames);
    h += '  private:\n';
    h += '    bool initialized;\n';
    // pfodAutoCmd members — one per item at this sub-menu level. Matches
    // dwgArduinoExport.js's own _generateHeader() / _generateH()'s own
    // main-menu pfodAutoCmd members above.
    for (const sItem of items) {
      const sLabel = _cppStr((sItem.text || '').replace(/\n/g, ' ').trim() || sItem.type);
      if (sItem.type === 'drawing') {
        h += '    pfodAutoCmd ' + _dwgCmdVarName(sItem.autoCmd) + '; // drawing\n';
      } else {
        h += '    pfodAutoCmd ' + _cmdVarName(sItem.autoCmd) + '; // ' + sItem.type + ' -- \'' + sLabel + '\'\n';
      }
    }
    h += '};\n';
    h += '\n';
    h += 'extern ' + className + ' ' + varName + ';\n';
    h += '#endif\n';

    // ── .cpp ──
    let cpp = _fileHeader(state);
    cpp += '// ' + className + '.cpp -- generated by pfodWeb Generate Code\n';
    cpp += '// Arduino code for sub-menu: ' + label + '\n';
    cpp += '\n';
    cpp += '#include "' + className + '.h"\n';
    // No 'src/' subfolder in this (no-Base-split) design -- SubMenu_*.cpp
    // lives in the same flat sketch folder as every other generated
    // file, so a plain quoted include (not '../') is correct here, same
    // as pfodMainMenu.cpp's own includes.
    for (const child of childSubs) {
      cpp += '#include "' + names.get(child).className + '.h" // sub-menu -- \'' +
             _cppStr((child.text || '').replace(/\n/g, ' ').trim()) + '\'\n';
    }
    // No <pfodDwgs.h> / <pfodDrawing.h> here either -- each Dwg_<name>.h
    // below already pulls in what a drawing needs, same as _generateCpp's
    // own pfodMainMenu.cpp includes above.
    if (drawings.length > 0) {
      for (const dItem of drawings) {
        if (_dwgIsLinked(dItem)) {
          cpp += '#include "' + _dwgClassName(dItem) + '.h"\n';
        } else {
          cpp += '// MISSING: dwg \'' + dItem.dwgName + '\' is not currently loaded --\n' +
                 '// load it and regenerate to include this line:\n' +
                 '// #include "' + _dwgClassName(dItem) + '.h"\n';
        }
      }
    }
    if (charts.length > 0) {
      cpp += '// plot_msOffset/clearPlot live in pfodMainMenu.cpp -- shared across\n';
      cpp += '// every chart in the whole design, regardless of which sub-menu it\'s in.\n';
      cpp += 'extern unsigned long plot_msOffset;\n';
      cpp += 'extern bool clearPlot;\n';
      cpp += 'float getPlotVarScaling(long varMax, long varMin, float displayMax, float displayMin);\n';
    }
    cpp += '\n';

    // Pin constants for this level's own pinned items, and for any chart
    // plot wired to an analog input -- same shape as _generateCpp's own
    // 'Pin settings' block, which only ever emitted the MAIN menu's items.
    // A sub-menu's onoff/pwm hook body writes its pin the same way, so the
    // constant has to be declared in this translation unit too.
    const pinnedItems = items.filter(i => i.pin && i.pin.name &&
                                     (i.type === 'onoff' || i.type === 'pwm'));
    const plotPinLines = [];
    for (const cItem of charts) {
      const prefix = _chartPrefix(cItem.autoCmd);
      for (let n = 1; n <= 3; n++) {
        const p = cItem.plots[n - 1];
        if (p.pin && p.pin.name) {
          const plotLabel = _cppStr((p.plotLabel || '').replace(/\n/g, ' ').trim() || ('plot ' + n));
          plotPinLines.push('const int ' + prefix + '_plot_' + n + '_pin = ' + p.pin.codeName +
            '; // name the analog input pin for \'' + plotLabel + '\'\n');
        }
      }
    }
    if (pinnedItems.length > 0 || plotPinLines.length > 0) {
      cpp += '// Pin settings\n';
      for (const sItem of pinnedItems) {
        const pinLabel = _cppStr((sItem.text || '').replace(/\n/g, ' ').trim() || sItem.type);
        cpp += 'const int ' + _pinConstName(sItem.autoCmd) + ' = ' + sItem.pin.codeName +
          '; // name the ' + sItem.pin.type.replace(/_/g, ' ') + ' pin for \'' + pinLabel + '\'\n';
      }
      plotPinLines.forEach((line) => { cpp += line; });
      cpp += '\n';
    }

    cpp += 'static const unsigned long refresh_ms = ' + subMenu.refresh_ms + ';\n';
    if (_needsSwap01(items)) {
      cpp += 'static int swap01(int in);\n';
    }
    cpp += '\n';

    // int variable declarations for this level's own stateful items —
    // the pfodAutoCmd for each item is now a class member instead (see
    // the .h section above).  An onoff on an inverting pin stores the
    // SWAPPED initial value, matching _generateCpp's own initVar.
    for (const sItem of items) {
      const sLabel = _cppStr((sItem.text || '').replace(/\n/g, ' ').trim() || sItem.type);
      if (sItem.type === 'onoff') {
        const initVar = (sItem.pin && sItem.pin.invertOutput)
          ? (sItem.current === 0 ? 1 : 0) : sItem.current;
        cpp += 'int ' + _intVarName(sItem.autoCmd) + ' = ' + initVar + '; // \'' + sLabel + '\'\n';
        if (_itemHasPulse(sItem)) {
          const cmdVar    = _cmdVarName(sItem.autoCmd);
          const pulseSecs = (sItem.pulse_ms / 1000.0).toFixed(1);
          cpp += 'static unsigned long ' + cmdVar + '_pulseStartTime=0; // the time when ' + cmdVar + ' pulse started\n';
          cpp += 'static bool ' + cmdVar + '_pulseRunning = false; // true when ' + cmdVar + ' pulse running\n';
          cpp += 'static unsigned long ' + cmdVar + '_PULSE_LENGTH = ' + sItem.pulse_ms + '; // ' + pulseSecs + ' secs\n';
          cpp += 'static void ' + cmdVar + '_checkPulse();\n';
        }
      } else if (sItem.type === 'pwm') {
        cpp += 'int ' + _intVarName(sItem.autoCmd) + ' = ' + sItem.minValue + '; // \'' + sLabel + '\'\n';
      }
    }
    cpp += '\n';

    // Each linked dwg's own global instance (Dwg_X dwg_X;) is defined
    // exactly once, in that dwg's own Dwg_X.cpp — its Dwg_X.h (already
    // #included above) declares it `extern`, which is all this file
    // needs. Declaring a second real instance here (as this used to)
    // would be a duplicate definition and fail to link.

    for (const cItem of charts) {
      const prefix = _chartPrefix(cItem.autoCmd);
      const chartLabel = _cppStr((cItem.text || '').replace(/\n/g, ' ').trim() || 'chart');
      cpp += '// plotting data variables for \'' + chartLabel + '\'\n';
      for (let n = 1; n <= 3; n++) {
        const p = cItem.plots[n - 1];
        cpp += 'static int ' + prefix + '_plot_' + n + '_varMin = ' + p.dataRangeMin + ';\n';
        cpp += 'static int ' + prefix + '_plot_' + n + '_var = ' + prefix + '_plot_' + n + '_varMin;\n';
        cpp += 'static float ' + prefix + '_plot_' + n + '_scaling;\n';
        cpp += 'static float ' + prefix + '_plot_' + n + '_varDisplayMin = ' + _floatLit(p.displayMin) + ';\n';
      }
      const intervalIdx   = chartDataIntervalIdx(cItem);
      const intervalMs    = CHART_DATA_INTERVALS[intervalIdx];
      const intervalLabel = CHART_DATA_INTERVAL_LABELS[intervalIdx];
      cpp += 'static pfodDelay ' + prefix + '_plotDataTimer; // plot data timer\n';
      cpp += 'static unsigned long ' + prefix + '_PLOT_DATA_INTERVAL = ' + intervalMs + ';// ms == ' + intervalLabel + ', edit this to change the plot data interval\n';
    }
    if (charts.length > 0) cpp += '\n';

    cpp += className + ' ' + varName + ';\n\n';

    // Per-item action hook bodies.  Emitted as the FIRST methods in the
    // file (same as pfodMainMenu.cpp's own hook bodies): these are what the
    // user edits, so they go above the fully-generated machinery
    // (constructor / init / sendMenu* / handleCmd / tickCharts).  The plot
    // statics and the getPlotVarScaling forward declaration they reference
    // are all emitted above this point.
    for (const sItem of items) {
      const hookName = hookNames.get(sItem);
      if (!hookName) continue;
      if      (sItem.type === 'onoff')  cpp += _onoffHookBody(sItem, className, hookName);
      else if (sItem.type === 'pwm')    cpp += _pwmHookBody(sItem, className, hookName);
      else if (sItem.type === 'button') cpp += _buttonHookBody(className, hookName);
      else if (sItem.type === 'chart')  cpp += _chartReadPlotDataHookBody(sItem, className, hookName);
    }

    cpp += className + '::' + className + '() {\n';
    cpp += '  initialized = false;\n';
    cpp += '}\n\n';

    cpp += 'void ' + className + '::init() {\n';
    cpp += '  if (initialized) {\n';
    cpp += '    return;\n';
    cpp += '  }\n';
    cpp += '  initialized = true;\n';
    // Configure this level's own pins and drive them to their initial
    // value -- same shape as _generateCpp's own init(), which only ever
    // did this for the MAIN menu's items.
    for (const sItem of items) {
      if (!(sItem.pin && sItem.pin.name)) continue;
      const sLabel   = _cppStr((sItem.text || '').replace(/\n/g, ' ').trim() || sItem.type);
      const pinConst = _pinConstName(sItem.autoCmd);
      const intVar   = _intVarName(sItem.autoCmd);
      if (sItem.type === 'onoff') {
        const initVar   = sItem.pin.invertOutput ? (sItem.current === 0 ? 1 : 0) : sItem.current;
        const initLevel = initVar ? 'HIGH' : 'LOW';
        cpp += '  pinMode(' + pinConst + ', ' + _pinModeStr(sItem.pin.type) + '); // ' + sItem.pin.type.replace(/_/g, ' ') + ' for \'' + sLabel + '\' is initially ' + initLevel + ',\n';
        cpp += '  ' + _pinWriteFn(sItem.pin.type) + '(' + pinConst + ',' + intVar + '); // set output\n';
      } else if (sItem.type === 'pwm') {
        cpp += '  pinMode(' + pinConst + ', OUTPUT); // output for \'' + sLabel + '\' is initially ' + sItem.minValue + ',\n';
        cpp += '  ' + _pinWriteFn(sItem.pin.type) + '(' + pinConst + ',' + intVar + '); // set output\n';
      }
    }
    for (const dItem of drawings) {
      const dLabel = _cppStr((dItem.text || '').replace(/\n/g, ' ').trim() || 'drawing');
      if (_dwgIsLinked(dItem)) {
        cpp += '  ' + _dwgVarName(dItem) + '.init(); // initialize drawing -- \'' + dLabel + '\'\n';
      } else {
        cpp += '  // MISSING: dwg \'' + dItem.dwgName + '\' is not currently loaded -- load it and regenerate:\n' +
               '  // ' + _dwgVarName(dItem) + '.init(); // initialize drawing -- \'' + dLabel + '\'\n';
      }
    }
    for (const child of childSubs) {
      cpp += '  ' + names.get(child).varName + '.init(); // initialize nested sub-menu\n';
    }
    for (const cItem of charts) {
      const prefix = _chartPrefix(cItem.autoCmd);
      cpp += '\n';
      cpp += '  // calculate the plot vars scaling here once to reduce computation\n';
      for (let n = 1; n <= 3; n++) {
        const p = cItem.plots[n - 1];
        cpp += '  ' + prefix + '_plot_' + n + '_scaling = getPlotVarScaling(' + p.dataRangeMax + ',' +
               prefix + '_plot_' + n + '_varMin,' + _floatLit(p.displayMax) + ',' +
               prefix + '_plot_' + n + '_varDisplayMin);\n';
      }
      cpp += '  ' + prefix + '_plotDataTimer.start(' + prefix + '_PLOT_DATA_INTERVAL); // start plot timer\n';
    }
    cpp += '}\n\n';

    // sendMenu -- full {, menu, format strings included.
    const promptFmtStr = DesignerEditPrompt.buildPromptScreenFormat(subMenu.promptFormat);
    const promptText   = _cppStr(subMenu.promptText || '');
    cpp += 'void ' + className + '::sendMenu(pfodParser& parser) {\n';
    cpp += '  parser.menu();  // start a Menu screen pfod message.  Send {,\n';
    cpp += '  parser.print(F("' + _cppStr(promptFmtStr) + '~' + promptText + '"));' + _fmtComment(subMenu.promptFormat) + '\n';
    cpp += '  parser.sendRefreshAndVersion(refresh_ms);\n';
    for (const sItem of items) {
      const sLabel = _cppStr((sItem.text || '').replace(/\n/g, ' ').trim() || sItem.type);
      const sEff     = _effectiveFmt(sItem.formats, subMenu.promptFormat);
      const sSlotFmt  = designerItemPrefix(sEff);
      const sInlineFmt = designerInlineFormat(sEff);
      const sAllFmt  = sSlotFmt + sInlineFmt;
      const sFmtCmt  = _fmtComment(sEff);
      if (sItem.type === 'button') {
        const sDisabledFlag = sItem.formats.disabled ? '!' : '';
        const sTextEsc = _cppStr(sItem.text || '');
        cpp += '  parser.button(' + _cmdVarName(sItem.autoCmd) + '); // start Button -- \'' + sLabel + '\'\n';
        if (sDisabledFlag) cpp += '  parser.print(F("!")); // disable this menu item\n';
        if (sAllFmt) cpp += '  parser.print(F("' + _cppStr(sAllFmt) + '"));' + sFmtCmt + '\n';
        cpp += '  parser.print(F("~' + sTextEsc + '"));\n';
      } else if (sItem.type === 'label') {
        const sTextEsc = _cppStr(sItem.text || '');
        cpp += '  parser.label(' + _cmdVarName(sItem.autoCmd) + '); // start Label -- \'' + sLabel + '\'\n';
        if (sAllFmt) cpp += '  parser.print(F("' + _cppStr(sAllFmt) + '"));' + sFmtCmt + '\n';
        cpp += '  parser.print(F("~' + sTextEsc + '"));\n';
      } else if (sItem.type === 'onoff') {
        const sIntVar  = _intVarName(sItem.autoCmd);
        const sFmtChar = sItem.displayFormat === 'text' ? 't' : sItem.displayFormat === 'slider' ? 's' : '';
        const sDisabledFlag = sItem.formats.disabled ? '!' : '';
        cpp += '  parser.slider(' + _cmdVarName(sItem.autoCmd) + '); // start Slider -- \'' + sLabel + '\'\n';
        if (sDisabledFlag) cpp += '  parser.print(F("!")); // disable this menu item\n';
        if (sAllFmt) cpp += '  parser.print(F("' + _cppStr(sAllFmt) + '"));' + sFmtCmt + '\n';
        cpp += '  parser.print(\'`\');\n';
        cpp += '  parser.print(' + sIntVar + '); // output the current value\n';
        cpp += '  parser.print(F("~' + _cppStr(sItem.text || '') + '~' + _cppStr(sItem.trailingText || '') + '~' + _cppStr(sItem.lowText || 'Low') + '\\\\' + _cppStr(sItem.highText || 'High') + '~' + sFmtChar + '"));\n';
      } else if (sItem.type === 'pwm') {
        const sIntVar  = _intVarName(sItem.autoCmd);
        const sFmtChar = sItem.displayFormat === 'text' ? 't' : sItem.displayFormat === 'slider' ? 's' : '';
        const sDisabledFlag = sItem.formats.disabled ? '!' : '';
        cpp += '  parser.slider(' + _cmdVarName(sItem.autoCmd) + '); // start Slider -- \'' + sLabel + '\'\n';
        if (sDisabledFlag) cpp += '  parser.print(F("!")); // disable this menu item\n';
        if (sAllFmt) cpp += '  parser.print(F("' + _cppStr(sAllFmt) + '"));' + sFmtCmt + '\n';
        cpp += '  parser.print(\'`\');\n';
        cpp += '  parser.print(' + sIntVar + '); // output the current value\n';
        cpp += '  parser.print(F("~' + _cppStr(sItem.text || '') + '~' + _cppStr(sItem.trailingText || '') + '`' + sItem.maxValue + '`' + sItem.minValue + '~' + _cppStr(sItem.maxScaleStr || '') + '~' + _cppStr(sItem.minScaleStr || '') + '~' + sFmtChar + '"));\n';
      } else if (sItem.type === 'chart') {
        const sDisabledFlag = sItem.formats.disabled ? '!' : '';
        const sTextEsc = _cppStr(sItem.text || '');
        cpp += '  parser.button(' + _cmdVarName(sItem.autoCmd) + '); // start Button (opens chart) -- \'' + sLabel + '\'\n';
        if (sDisabledFlag) cpp += '  parser.print(F("!")); // disable this menu item\n';
        if (sAllFmt) cpp += '  parser.print(F("' + _cppStr(sAllFmt) + '"));' + sFmtCmt + '\n';
        cpp += '  parser.print(F("~' + sTextEsc + '"));\n';
      } else if (sItem.type === 'submenu') {
        const sTextEsc = _cppStr(sItem.text || '');
        cpp += '  parser.button(' + _cmdVarName(sItem.autoCmd) + '); // start Button (opens nested sub-menu) -- \'' + sLabel + '\'\n';
        if (sAllFmt) cpp += '  parser.print(F("' + _cppStr(sAllFmt) + '"));' + sFmtCmt + '\n';
        cpp += '  parser.print(F("~' + sTextEsc + '"));\n';
      } else if (sItem.type === 'drawing') {
        const sDisabledFlag = sItem.formats.disabled ? '!' : '';
        cpp += '  parser.print(F("|+")); // start Drawing -- \'' + sLabel + '\'\n';
        cpp += '  parser.print(' + _dwgCmdVarName(sItem.autoCmd) + '); // drawing menu item cmd\n';
        if (sDisabledFlag) cpp += '  parser.print(F("!")); // disable this menu item\n';
        if (sAllFmt) cpp += '  parser.print(F("' + _cppStr(sAllFmt) + '"));' + sFmtCmt + '\n';
        cpp += '  parser.print(F("~"));\n';
        if (_dwgIsLinked(sItem)) {
          cpp += '  parser.print(' + _dwgVarName(sItem) + '); // the drawing\'s loadCmd\n';
        } else {
          cpp += '  // MISSING: dwg \'' + sItem.dwgName + '\' is not currently loaded -- load it and regenerate:\n' +
                 '  // parser.print(' + _dwgVarName(sItem) + '); // the drawing\'s loadCmd\n';
        }
      }
      // onoffdisplay, datadisplay sub-menu items not currently supported
      // (matches the flat generator's own pre-existing scope, unchanged).
    }
    cpp += '  parser.endOfMsg();\n';
    cpp += '}\n\n';

    // sendMenuUpdate -- {; current values only, no format strings.
    cpp += 'void ' + className + '::sendMenuUpdate(pfodParser& parser) {\n';
    cpp += '  parser.menuUpdate();  // start an Update Menu pfod message. Send {;\n';
    for (const sItem of items) {
      if (sItem.type === 'onoff') {
        cpp += '  parser.slider(' + _cmdVarName(sItem.autoCmd) + '); // start Slider\n';
        cpp += '  parser.print(\'`\');\n';
        cpp += '  parser.print(' + _intVarName(sItem.autoCmd) + '); // output the current value\n';
      } else if (sItem.type === 'pwm') {
        cpp += '  parser.slider(' + _cmdVarName(sItem.autoCmd) + '); // start Slider\n';
        cpp += '  parser.print(\'`\');\n';
        cpp += '  parser.print(' + _intVarName(sItem.autoCmd) + '); // output the current value\n';
      } else if (sItem.type === 'button') {
        cpp += '  parser.button(' + _cmdVarName(sItem.autoCmd) + '); // start Button\n';
      } else if (sItem.type === 'chart') {
        cpp += '  parser.button(' + _cmdVarName(sItem.autoCmd) + '); // start Button (chart)\n';
      } else if (sItem.type === 'label') {
        cpp += '  parser.label(' + _cmdVarName(sItem.autoCmd) + '); // start Label\n';
      } else if (sItem.type === 'submenu') {
        cpp += '  parser.button(' + _cmdVarName(sItem.autoCmd) + '); // start Button (nested sub-menu)\n';
      } else if (sItem.type === 'drawing') {
        const sDisabledFlag = sItem.formats.disabled ? '!' : '';
        cpp += '  parser.print(F("|+")); // drawing menu item update\n';
        cpp += '  parser.print(' + _dwgCmdVarName(sItem.autoCmd) + ');\n';
        if (sDisabledFlag) cpp += '  parser.print(F("!")); // disable this menu item\n';
      }
    }
    cpp += '  parser.endOfMsg();\n';
    cpp += '}\n\n';

    // handleCmd -- own items' mechanical dispatch, chains to any nested
    // child sub-menu's own handleCmd before giving up.
    cpp += 'bool ' + className + '::handleCmd(pfodParser &parser, uint8_t cmd, uint8_t *pfodFirstArg, long *pfodLongRtn) {\n';
    cpp += '  (void)cmd;\n';
    cpp += '  if (false) {\n';
    cpp += '    // never taken -- keeps every real branch below in a uniform "} else if" shape\n';
    const ctx = {
      longRtnAddr:    'pfodLongRtn',
      longRtnDeref:   '(*pfodLongRtn)',
      sendUpdateCall: 'sendMenuUpdate(parser)',
      returnTrue:     'return true;\n',
      hookNames:      hookNames,
      chartContext:   '',
    };
    for (const sItem of items) {
      cpp += _itemDispatchBranch(sItem, ctx, names);
    }
    for (const child of childSubs) {
      const cInfo = names.get(child);
      cpp += '  } else if (' + cInfo.varName + '.handleCmd(parser, cmd, pfodFirstArg, pfodLongRtn)) {\n';
      cpp += '    return true;\n';
    }
    cpp += '  }\n';
    cpp += '  return false;\n';
    cpp += '}\n\n';

    // tickCharts -- own charts + delegate to every nested child. Only
    // generated when this subtree actually has a chart somewhere in it
    // (see _subtreeHasChart) -- matches the .h section's own gating above.
    if (_subtreeHasChart(subMenu)) {
      cpp += 'void ' + className + '::tickCharts(pfodParser &parser) {\n';
      for (const cItem of charts) {
        cpp += '  ' + _chartPrefix(cItem.autoCmd) + '_sendData(parser);\n';
      }
      for (const child of childSubs) {
        if (!_subtreeHasChart(child.subMenu)) continue; // that child has no tickCharts() of its own
        cpp += '  ' + names.get(child).varName + '.tickCharts(parser);\n';
      }
      cpp += '}\n\n';
    }

    // tickPulses -- own pulse timers + delegate to every nested child.
    // A sub-menu has no loop of its own, so this cascades down from
    // pfodMainMenu::handle() the same way tickCharts does; only generated
    // where the subtree actually has a pulsed item (see _subtreeHasPulse)
    // -- matches the .h section's own gating above.
    if (_subtreeHasPulse(subMenu)) {
      cpp += 'void ' + className + '::tickPulses() {\n';
      for (const sItem of items) {
        if (!_itemHasPulse(sItem)) continue;
        cpp += '  ' + _cmdVarName(sItem.autoCmd) + '_checkPulse();\n';
      }
      for (const child of childSubs) {
        if (!_subtreeHasPulse(child.subMenu)) continue; // that child has no tickPulses() of its own
        cpp += '  ' + names.get(child).varName + '.tickPulses();\n';
      }
      cpp += '}\n\n';
    }

    // Per-chart sendData methods.
    for (const cItem of charts) {
      cpp += _chartSendDataMethod(cItem, className, hookNames.get(cItem));
    }

    // Pulse-timer helpers -- return the output to its rest level once the
    // pulse length has elapsed.  Same shape as _generateCpp's own.
    for (const sItem of items) {
      if (!_itemHasPulse(sItem)) continue;
      const cmdVar    = _cmdVarName(sItem.autoCmd);
      const intVar    = _intVarName(sItem.autoCmd);
      const returnVal = sItem.pulse === 'low' ? 1 : 0;
      const returnLvl = returnVal ? 'HIGH' : 'LOW';
      cpp += 'static void ' + cmdVar + '_checkPulse() {\n';
      cpp += '  if (' + cmdVar + '_pulseRunning && ((millis() - ' + cmdVar + '_pulseStartTime) > ' + cmdVar + '_PULSE_LENGTH)) {\n';
      cpp += '    ' + cmdVar + '_pulseRunning = false; // timer finished\n';
      cpp += '    ' + intVar + ' = ' + returnVal + ';  // return output to ' + returnLvl + '\n';
      if (sItem.pin && sItem.pin.name) {
        cpp += '    ' + _pinWriteFn(sItem.pin.type) + '(' + _pinConstName(sItem.autoCmd) + ',' + intVar + '); // update output pin\n';
      }
      cpp += '  }\n';
      cpp += '}\n\n';
    }

    if (_needsSwap01(items)) {
      cpp += 'static int swap01(int in) {\n';
      cpp += '  return (in==0)?1:0;\n';
      cpp += '}\n\n';
    }

    return { className, varName, h, cpp, childFiles };
  }

  // ── Download trigger ────────────────────────────────────────────
  // ZIP writer + browser-download mechanics live in zipBuilder.js,
  // shared with generateCcode.js.

  function _triggerDownload(state) {
    const name = state.name;
    // Filesystem/Arduino-safe form of the design name for every folder,
    // file, and the download's own zip name below — Arduino requires the
    // sketch folder and its .ino to match exactly, and neither may
    // contain spaces or punctuation. state.name itself is free text (the
    // design's own display name, unaffected — used as-is everywhere else,
    // e.g. inside the generated files' own comments/JSON `name` field).
    const fileName = _cppId(name) || 'Menu';
    const enc  = new TextEncoder();
    const { files: dwgFiles, names: dwgNames, missing } = _generateDrawingFiles(state);

    if (missing.length > 0) {
      alert('Warning: ' + missing.length + ' referenced dwg(s) are not currently loaded ' +
        'and will be commented out in the generated code:\n' + missing.join(', '));
    }

    const entries = [
      { path: fileName + '/' + fileName + '.ino',   data: enc.encode(_generateIno(state)) },
      { path: fileName + '/pfodMainMenu.h',     data: enc.encode(_generateH(state)) },
      { path: fileName + '/pfodMainMenu.cpp',   data: enc.encode(_generateCpp(state)) },
      { path: fileName + '/json/' + fileName + '.pfodMenu_json', data: enc.encode(state.exportToJSON()) },
    ];
    dwgFiles.forEach((f) => entries.push({ path: fileName + '/' + f.filename, data: enc.encode(f.content) }));
    // Each generated dwg's own re-loadable design, alongside the menu's
    // own — dwgLibrary.js's buildSaveableDwg(), the exact same format
    // dwgControlsPanelUI.js's own Export Dwg / Generate Code produces —
    // so any of them can be re-opened later via Load Dwg.
    dwgNames.forEach((dwgName) => {
      const dwg = DwgLibrary.get(dwgName);
      entries.push({
        path: fileName + '/json/' + dwgName + '.pfodDwg_json',
        data: enc.encode(JSON.stringify(buildSaveableDwg(dwg), null, 2)),
      });
    });

    // One SubMenu_<ident>.h/.cpp pair per sub-menu, any nesting depth —
    // _generateSubMenuFiles recurses into its own nested sub-menus and
    // returns their files via childFiles, already flattened.
    const submenuNames = _collectSubMenuNames(state);
    const menu = state.getActiveMenu();
    const topLevelSubmenus = menu.items.filter(i => i.type === 'submenu' && i.subMenu);
    topLevelSubmenus.forEach((item) => {
      const gen = _generateSubMenuFiles(item, submenuNames, state);
      entries.push({ path: fileName + '/' + gen.className + '.h',   data: enc.encode(gen.h) });
      entries.push({ path: fileName + '/' + gen.className + '.cpp', data: enc.encode(gen.cpp) });
      gen.childFiles.forEach((f) => entries.push({ path: fileName + '/' + f.filename, data: enc.encode(f.content) }));
    });

    const zipBytes = DesignerZipBuilder.buildZip(entries);
    DesignerZipBuilder.triggerDownload(fileName + '.zip', zipBytes);
  }

  // ── Dispatch handler ─────────────────────────────────────────────
  // Returns PFOD_EMPTY (no navigation change) after triggering the
  // browser download.  skipSave prevents the dispatch wrapper from
  // persisting the state on what is a read-only action.

  function send(rawCmd, state, depth) {
    if (!state.name) return { pfod: PFOD_EMPTY, skipSave: true };
    // "Minimal C Code" target generates plain C (DesignerGenerateCcode),
    // not an Arduino/C++ sketch — branch before touching any of the
    // C++-specific generators below.
    if (state.board.family === 'ccode') return DesignerGenerateCcode.send(rawCmd, state, depth);
    _triggerDownload(state);
    return { pfod: PFOD_EMPTY, skipSave: true };
  }

  // pinConstName / chartPlotPinName are exposed so editMenuItem.js /
  // editChart.js can display the *exact* generated variable name in the
  // "no I/O pins defined" placeholder toggle (see PLACEHOLDER_PIN_NAME) --
  // duplicating the naming rule there would risk drifting out of sync
  // with what this file actually emits.
  return Object.freeze({
    send,
    pinConstName:     _pinConstName,
    chartPlotPinName: (autoCmd, plotNum) => _chartPrefix(autoCmd) + '_plot_' + plotNum + '_pin',
  });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('l', DesignerGenerateCode.send);
