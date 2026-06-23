/*
 * designer/menus/editChart.js
 *
 * Handlers for the chart item editor, reached from editMenuItem when the
 * chart preview button (cmd 'R') is clicked.
 *
 * Registered top-level cmds:
 *   'R'  — main chart editor and all its sub-cmds
 *   'Q'  — per-plot editor sub-cmds (toggles + text-input navigation)
 *   'P'  — plot params sub-dispatcher (data range, display max/min text)
 *
 * Navigation flow:
 *   {d}  → item editor shows chart button preview (cmd 'R' — clicking opens chart editor)
 *   {R}  → main chart editor (header, preview, xAxis, separate, interval, 3 plots, help)
 *     {Rp}                   → chart preview screen (dummy midpoint data)
 *     {Rl}/{RlT~<text>}      → edit chart label
 *     {Rx}/{Rxs`<idx>}       → x-axis format picker / apply
 *     {Rs}                   → toggle combined/separate plots (in-place {;})
 *     {Ri`<idx>}             → set data interval via slider (in-place {;})
 *     {Ra}/{Rb}/{Rc}         → open per-plot editor for plot 0/1/2 (returns {,})
 *     {Rh}                   → help screen
 *   Per-plot editor screen returned by {Ra}/{Rb}/{Rc}.
 *   Sub-cmds fired from that screen:
 *     {Qa}                   → toggle auto-scale (in-place {;})
 *     {Qs}                   → toggle show/hide (in-place {;})
 *     {Ql}/{QlT~<text>}      → edit plot label
 *     {Qu}/{QuT~<text>}      → edit units
 *     {Qp}/{Qps`<idx>}       → plot pin picker / apply selection
 *     {Qh}                   → plot help screen
 *     {P0}                   → data range sub-screen (full {,} nav)
 *       {P0M}/{P0MT~<val>}   → edit/apply range max
 *       {P0m}/{P0mT~<val>}   → edit/apply range min
 *     {P1}/{P1T~<text>}      → edit/apply display max
 *     {P2}/{P2T~<text>}      → edit/apply display min
 *
 * state.currentPlotNo (0/1/2) set by {Ra}/{Rb}/{Rc}; read by {Q*}/{P*}.
 *
 * Origin: pfodDesignerV3 editingPlots / editPlot / editPlotDataRange /
 *         editPlotMaxMinText.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DesignerEditChart = (() => {

  // Text-field length caps — match Java's maxChars values.
  const CHART_LABEL_MAX_LEN  = 20;
  const PLOT_LABEL_MAX_LEN   = 20;
  const PLOT_UNITS_MAX_LEN   = 20;
  const PLOT_DISPLAY_MAX_LEN = 20;
  const PLOT_RANGE_MAX_LEN   = 11;

  // ── Shared helpers ───────────────────────────────────────────────────

  /// Return the chart item currently being edited, or null.
  function _chartItem(state) {
    const item = state.getActiveItem();
    if (!item || item.type !== ITEM_TYPE_CHART) return null;
    return item;
  }

  /// Return the plot at state.currentPlotNo from the active chart item.
  function _activePlot(state) {
    const item = _chartItem(state);
    if (!item) return null;
    const n = (state.currentPlotNo >= 0 && state.currentPlotNo <= 2) ? state.currentPlotNo : 0;
    return item.plots[n] || null;
  }

  /// Render a text-input prompt screen `{'<submitCmd>`<maxLen>~prompt|current}`.
  /// @param {string} submitCmd   e.g. 'RlT' — pfodApp sends {RlT~<typed>}
  /// @param {string} promptLine  body text shown in the prompt area
  /// @param {string} currentValue initial text seeded in the input field
  /// @param {number} maxLen      character limit
  function _renderTextInput(submitCmd, promptLine, currentValue, maxLen) {
    return "{'"+submitCmd+'`'+maxLen+'~'+DESIGNER_PROMPT_FMT+
           '\n<+1>'+promptLine+'\n(Max '+maxLen+' characters)\n\n|'+currentValue+'}';
  }

  /// Map a raw value to display space — mirrors Java PlotData.mapPlotData().
  /// Used to produce the dummy midpoint shown in the plot preview label.
  function _mapToDisplay(raw, dataMin, dataMax, dispMin, dispMax) {
    const range = dataMax - dataMin;
    if (range === 0) return isNaN(dispMin) ? '0.0' : dispMin.toFixed(1);
    const mapped = dispMin + (raw - dataMin) * (dispMax - dispMin) / range;
    return isNaN(mapped) ? '0.0' : mapped.toFixed(1);
  }

  // ── Chart preview — sample data + {= chart command ──────────────────

  // Raw sample data ported verbatim from pfodDesignerV2/PlotData.java.
  // Only the first 58 rows are sent to the chart preview; the second block
  // is retained for reference but not used (the preview uses ~C to clear
  // old data before each display, making the second block unnecessary).
  // Columns: [time-index, A0, A1, A2].
  const _PLOT_RAW_DATA = Object.freeze([
    [9,668,388,205],[10,677,398,221],[11,672,381,253],[12,669,363,269],
    [13,676,342,294],[14,666,314,294],[15,681,318,313],[16,681,299,343],
    [17,676,274,377],[18,674,276,399],[19,680,264,406],[20,678,229,417],
    [21,676,231,465],[22,676,216,466],[23,674,205,476],[24,667,186,516],
    [25,671,165,528],[26,679,156,547],[27,679,123,587],[28,675,123,584],
    [29,677,94,608],[30,681,92,642],[31,680,74,669],[32,677,60,665],
    [33,673,48,702],[34,673,33,703],[35,682,4,718],[36,668,0,767],
    [37,666,0,782],[38,680,0,779],[39,665,0,799],[40,679,0,836],
    [41,681,0,841],[42,667,0,859],[43,684,0,903],[44,678,0,917],
    [45,681,0,945],[46,666,0,950],[47,681,0,986],[48,676,0,987],
    [49,682,0,1006],[50,670,0,1023],[51,682,0,1023],[52,680,0,1023],
    [53,669,0,1023],[54,667,0,1023],[55,683,0,1023],[56,670,0,1023],
    [57,680,0,1023],[58,676,0,1023],[59,686,0,1023],[60,684,0,1023],
    [61,680,0,1023],[62,675,0,1023],[63,676,0,1023],[64,670,0,1023],
    [65,664,0,1023],[66,668,0,1023],
    // second block — identical, pushes total to > 100 so max/min clears
    [9,668,388,205],[10,677,398,221],[11,672,381,253],[12,669,363,269],
    [13,676,342,294],[14,666,314,294],[15,681,318,313],[16,681,299,343],
    [17,676,274,377],[18,674,276,399],[19,680,264,406],[20,678,229,417],
    [21,676,231,465],[22,676,216,466],[23,674,205,476],[24,667,186,516],
    [25,671,165,528],[26,679,156,547],[27,679,123,587],[28,675,123,584],
    [29,677,94,608],[30,681,92,642],[31,680,74,669],[32,677,60,665],
    [33,673,48,702],[34,673,33,703],[35,682,4,718],[36,668,0,767],
    [37,666,0,782],[38,680,0,779],[39,665,0,799],[40,679,0,836],
    [41,681,0,841],[42,667,0,859],[43,684,0,903],[44,678,0,917],
    [45,681,0,945],[46,666,0,950],[47,681,0,986],[48,676,0,987],
    [49,682,0,1006],[50,670,0,1023],[51,682,0,1023],[52,680,0,1023],
    [53,669,0,1023],[54,667,0,1023],[55,683,0,1023],[56,670,0,1023],
    [57,680,0,1023],[58,676,0,1023],[59,686,0,1023],[60,684,0,1023],
    [61,680,0,1023],[62,675,0,1023],[63,676,0,1023],[64,670,0,1023],
    [65,664,0,1023],[66,668,0,1023],
  ]);

  // Java DateTimeFormatEnum.getFormat() values, indexed by CHART_XAXIS_FORMATS order.
  const _XAXIS_JAVA_FMTS = Object.freeze([
    'ss.S', 'mm:ss', 'd HH:mm:ss', 'yyyy/MM/dd HH:mm:ss',
    'E HH:mm:ss', 'E HH:mm', 'E HH:mm:ss UTC', 'E HH:mm UTC',
  ]);
  // isElapsedTime and timeLabel from DateTimeFormatEnum, same index order.
  const _XAXIS_ELAPSED    = Object.freeze([true, true, true, false, false, false, false, false]);
  const _XAXIS_TIME_LABEL = Object.freeze(['secs', 'mm:ss', 'days HH:mm:ss', '', '', '', '', '']);

  /// Map one raw plot value through the display scale — mirrors Java
  /// DesignerMsgProcessor.mapPlotData(idx, dataPoint) for notCcode=true.
  /// @param {number} plotIdx  1-based plot index (1=plot1, 2=plot2, 3=plot3)
  /// @param {number} rawValue raw sample value from _PLOT_RAW_DATA
  /// @param {object} item     chart item (has .plots[])
  function _mapPlotValue(plotIdx, rawValue, item) {
    const p = item.plots[plotIdx - 1];
    if (!p) return rawValue;
    const dataRange = p.dataRangeMax - p.dataRangeMin;
    const scale = dataRange === 0 ? 1.0
      : (parseFloat(p.displayMax) - parseFloat(p.displayMin)) / dataRange;
    return (rawValue - p.dataRangeMin) * scale + parseFloat(p.displayMin);
  }

  /// Build CSV rows for the 58 sample points in the first data block.
  /// Mirrors Java DesignerMsgProcessor.sendPlotData() for notCcode=true.
  /// Only the first block is sent; the chart command uses ~C to clear any
  /// previous preview data before this CSV is collected by the polling update.
  /// Time = dataInterval_ms * row[0]; values are scaled via _mapPlotValue.
  function _buildPlotCSVData(item) {
    const interval_ms = CHART_DATA_INTERVALS[item.dataIntervalIdx] || CHART_DATA_INTERVALS[0];
    let csv = '';
    for (let i = 0; i < 58; i++) {
      const row = _PLOT_RAW_DATA[i];
      const t = interval_ms * row[0];
      csv += t + ',' +
             _mapPlotValue(1, row[1], item) + ',' +
             _mapPlotValue(2, row[2], item) + ',' +
             _mapPlotValue(3, row[3], item) + '\n';
    }
    return csv;
  }

  /// Build the `{=...}` chart command — mirrors Java
  /// MenuChart.getPlotMsg(limitDataShowing=true, notCcode=true).
  /// ~C clears any previously collected preview data when this command is
  /// processed, so each Chart Preview starts with a clean collector.  The
  /// CSV rows (_buildPlotCSVData) are sent AFTER this command and are
  /// collected by the 500 ms polling update rather than the initial display.
  function _buildChartEqMessage(item) {
    const xi   = item.xAxisIdx;
    const jFmt = _XAXIS_JAVA_FMTS[xi] || _XAXIS_JAVA_FMTS[DEFAULT_CHART_XAXIS_IDX];
    // Head: {=<chartLabel>`50~<javaFormat>~C
    let out = '{=' + item.chartLabel + '`50';
    if (jFmt.length > 1) out += '~' + jFmt;
    out += '~C';
    // xAxis column label
    out += '|';
    if (_XAXIS_ELAPSED[xi]) {
      out += 'time (' + _XAXIS_TIME_LABEL[xi] + ')';
    } else {
      out += 'date';
    }
    if (!item.separatePlots) out += '`0';
    // Per-plot entries
    for (const p of item.plots) {
      out += '|';
      if (p.showPlot) {
        out += p.plotLabel;
        if (!item.separatePlots) out += '`1';
        if (p.autoScale) {
          out += '~~';
        } else {
          out += '~' + p.displayMax + '~' + p.displayMin;
        }
        out += '~' + p.units;
      }
      // hidden plot emits bare '|' — tells chart display to skip that column
    }
    out += '}';
    return out;
  }

  /// Return the `{=...~C}` chart command followed by CSV sample data.
  /// The chart command comes first: processIncoming() resolves it as the
  /// pfod response (triggering displayChartWithPlotNo with an empty collector
  /// after ~C clears any old preview data), then the CSV rows that follow
  /// the closing `}` are collected and picked up by the 500 ms polling update.
  function _renderChartPreviewScreen(state) {
    const item = _chartItem(state);
    if (!item) return PFOD_EMPTY;
    return _buildChartEqMessage(item) + _buildPlotCSVData(item);
  }

  // ── Main chart editor body ───────────────────────────────────────────

  /// Build the body rows shared by both the full {,} and in-place {;} renders
  /// of the main chart editor.  Matches Java getPlotEditMsg() layout exactly:
  ///   heading label → thin spacer → preview → thin spacer →
  ///   Edit Chart Label → X-axis → Separate → Data Interval → Plots → Help
  function _renderChartBody(state) {
    const item = _chartItem(state);
    if (!item) return DESIGNER_PROMPT_FMT + '~No chart item selected.';

    const fmt1   = '<-1>' + DESIGNER_MENU_FMT;
    const xLabel = CHART_XAXIS_LABELS[item.xAxisIdx] || CHART_XAXIS_LABELS[DEFAULT_CHART_XAXIS_IDX];

    let out = DESIGNER_PROMPT_FMT + '~';

    // Heading label — Java: |!Z1<bg bl>~<-2>Editing Plots for</-2>\n<b><l>chartLabel
    out += '|!Z1<bg bl>~<-2>Editing Plots for</-2>\n<b><l>' + item.chartLabel;

    // Thin spacing label (font size -6, single space so pfodWeb renders a row)
    out += '|!Z2<-6>~ ';

    // Chart preview button — two-line: large title + smaller yellow italic sub-line.
    out += '|Rp<bg bl>~Chart Preview\n<-2><i><y>using dummy data';

    // Thin spacing label
    out += '|!Z3<-6>~ ';

    // Edit Chart Label — Java: |Rl<Designer_Menu_Format>~<-2>Edit Chart Label
    out += '|Rl' + DESIGNER_MENU_FMT + '~<-2>Edit Chart Label';

    // X-axis — Java: ~<-2>X-axis\n<displayText>\n<-1><y><i>Click here to change
    out += '|Rx' + DESIGNER_MENU_FMT + '~<-2>X-axis\n' + xLabel +
           '\n<-1>' + EM_HINT_COLOUR + '<i>Click here to change';

    // Separate/Combined Plots — Java: ~<-2>Separate/Combined Plots\n<-1><y><i>...
    out += '|Rs' + DESIGNER_MENU_FMT + '~<-2>' +
           (item.separatePlots ? 'Separate Plots' : 'Combined Plots') +
           '\n<-1>' + EM_HINT_COLOUR + '<i>Click here to change';

    // Data interval — Java leading text `<-2>Plot Data Interval\n<b>` puts the
    // currently selected label on its own bold second line (no separate trailing text).
    out += '|Ri' + DESIGNER_MENU_FMT + '`' + item.dataIntervalIdx +
           '~<-2>Plot Data Interval\n<b>~~' + CHART_DATA_INTERVAL_LABELS.join('\\');

    // 3 plot buttons — Java uses <-1> in slot; "(Hidden)" in italic when hidden.
    for (let n = 0; n < 3; n++) {
      const plotCmd      = String.fromCharCode(97 + n); // 'a'/'b'/'c'
      const hiddenSuffix = item.plots[n].showPlot ? '' : '\n<-2><i>(Hidden)';
      out += '|R' + plotCmd + fmt1 + '~Edit Plot ' + (n + 1) + hiddenSuffix;
    }

    out += '|Rh' + fmt1 + '~Help';
    return out;
  }

  function _renderChartScreen(state) { return '{,' + _renderChartBody(state) + '}'; }
  function _renderChartUpdate(state) { return '{;' + _renderChartBody(state) + '}'; }

  // ── Plot pin picker ──────────────────────────────────────────────────

  /// Collect all pin names already in use across the entire design tree
  /// (item pins from all menus) plus sibling plot pins.  The current
  /// plot's own pin is removed so the user can re-confirm it.
  function _usedPinNamesForPlot(state) {
    const used = new Set();
    const item = _chartItem(state);
    const n = (state.currentPlotNo >= 0 && state.currentPlotNo <= 2) ? state.currentPlotNo : 0;
    function walkMenu(menu) {
      for (const it of menu.items) {
        if (it.pin) used.add(it.pin.name);
        if (it.type === 'submenu' && it.subMenu) walkMenu(it.subMenu);
      }
    }
    walkMenu(state.rootMenu);
    if (item) {
      for (let pi = 0; pi < 3; pi++) {
        if (pi === n) continue;
        if (item.plots[pi] && item.plots[pi].pin && item.plots[pi].pin.name) {
          used.add(item.plots[pi].pin.name);
        }
      }
    }
    if (item && item.plots[n] && item.plots[n].pin && item.plots[n].pin.name) {
      used.delete(item.plots[n].pin.name);
    }
    return used;
  }

  /// Build the ordered pin list for the plot pin picker.
  /// Entry 0 = "Not connected"; remaining = ANALOG_INPUT board pins not already used.
  /// @returns {{ label:string, notes:string|null, name:string|null, codeName:string|null }[]}
  function _buildPlotPinList(state) {
    const used = _usedPinNamesForPlot(state);
    const list = [{ label: 'Not connected', notes: null, name: null, codeName: null }];
    for (const bp of state.board.pins) {
      if (!bp.capabilities.supports(PinType.ANALOG_INPUT)) continue;
      if (used.has(bp.name)) continue;
      list.push({ label: bp.label, notes: bp.notes || null, name: bp.name, codeName: bp.codeName });
    }
    return list;
  }

  /// Render the pin picker as a {?Qps`<idx>~...} single-select screen.
  function _renderPlotPinPicker(state) {
    const plot = _activePlot(state);
    if (!plot) return PFOD_EMPTY;
    const pinList   = _buildPlotPinList(state);
    const n         = (state.currentPlotNo >= 0 && state.currentPlotNo <= 2) ? state.currentPlotNo : 0;
    let currentIdx  = 0;
    if (plot.pin) {
      for (let i = 1; i < pinList.length; i++) {
        if (pinList[i].name === plot.pin.name) { currentIdx = i; break; }
      }
    }
    let out = '{?Qps`' + currentIdx + '~' + DESIGNER_PROMPT_FMT;
    out += 'Select analog input pin\nfor Plot ' + (n + 1);
    for (const entry of pinList) {
      const optLabel = entry.notes ? entry.label + '\n<-2>' + entry.notes : entry.label;
      out += '|' + optLabel;
    }
    out += '}';
    return out;
  }

  /// Apply the user's pin selection for the active plot.
  /// argStart points to the '`' in {Qps`<idx>}.
  function _applyPlotPinPick(state, rawCmd, argStart) {
    if (rawCmd[argStart] !== '`') return PFOD_EMPTY;
    const idx = parseInt(rawCmd.substring(argStart + 1, rawCmd.length - 1), 10);
    if (isNaN(idx) || idx < 0) return PFOD_EMPTY;
    const plot = _activePlot(state);
    if (!plot) return PFOD_EMPTY;
    const pinList = _buildPlotPinList(state);
    if (idx >= pinList.length) return PFOD_EMPTY;
    const entry = pinList[idx];
    if (entry.name === null) {
      plot.pin = null;
    } else {
      plot.pin = { name: entry.name, codeName: entry.codeName, type: PinType.ANALOG_INPUT };
    }
    state.save();
    return PFOD_EMPTY;   // back-nav re-requests the plot editor with updated pin shown
  }

  // ── Per-plot editor body ─────────────────────────────────────────────

  /// Build the per-plot editor body for state.currentPlotNo.
  /// Matches Java getPlotEditing() layout exactly.
  function _renderPlotBody(state) {
    const item = _chartItem(state);
    if (!item) return null;
    const n    = (state.currentPlotNo >= 0 && state.currentPlotNo <= 2) ? state.currentPlotNo : 0;
    const plot = item.plots[n];
    const plotNum = n + 1;

    let out = '';

    // Heading label — Java: |!Z1<bg bl>~<-2>Editing Plot N</-2>\n<+0><b><l>plotLabel</+0>
    out += '|!Z1<bg bl>~<-2>Editing Plot ' + plotNum + '</-2>\n<+0><b><l>' + plot.plotLabel + '</+0>';
    out += (plot.showPlot ? '' : '\n<-2><i>(Hidden)');

    // Thin spacers around preview — same as chart editor.
    out += '|!Z2<-6>~ ';
    out += '|Rp<bg bl>~Chart Preview\n<-2><i><y>using dummy data';
    out += '|!Z3<-6>~ ';

    // Edit items — Java uses plain <-2> text, no "(Currently:)" or "Click here to edit".
    out += '|Ql' + DESIGNER_MENU_FMT + '~<-2>Edit Plot Label';
    out += '|Qu' + DESIGNER_MENU_FMT + '~<-2>Edit Plot yAxis Units';
    out += '|P1' + DESIGNER_MENU_FMT + '~<-2>Edit Display Max';
    out += '|P2' + DESIGNER_MENU_FMT + '~<-2>Edit Display Min';
    out += '|P0' + DESIGNER_MENU_FMT + '~<-2>Edit Plot Data Variable Range\n' +
           '<-2>Currently (' + plot.dataRangeMin + ' to ' + plot.dataRangeMax + ')';

    // Pin picker — Java: <-1>slot, text + </-1> + hint.
    const pinText = plot.pin ? 'Connected to pin ' + plot.pin.name : 'Not connected to an I/O pin';
    out += '|Qp<-1>' + DESIGNER_MENU_FMT + '~' + pinText + '\n<-3><b><y>Click here to change';

    // Auto-scale — Java: <-2>text</-2>\n<-3><b><y>hint.
    out += '|Qa' + DESIGNER_MENU_FMT + '~<-2>Plot is ' + (plot.autoScale ? 'Auto' : 'Fixed') +
           ' Scale</-2>\n<-3><b><y>Click here to change';

    // Show/hide — Java: plain <-2> text, NO hint (hint line is commented out in Java).
    out += '|Qs' + DESIGNER_MENU_FMT + '~<-2>' + (plot.showPlot ? 'Hide' : 'Show') + ' Plot';

    // Help — Java: <-1>slot.
    out += '|Qh<-1>' + DESIGNER_MENU_FMT + '~Help';
    return out;
  }

  /// Full {,} per-plot editor screen — returned by {Ra}/{Rb}/{Rc}.
  function _renderPlotScreen(state) {
    const body = _renderPlotBody(state);
    if (!body) return PFOD_EMPTY;
    return '{,' + DESIGNER_PROMPT_FMT + '~' + body + '}';
  }

  /// In-place {;} update of the per-plot editor — returned by {Q*} actions.
  function _renderPlotUpdate(state) {
    const body = _renderPlotBody(state);
    if (!body) return PFOD_EMPTY;
    return '{;' + DESIGNER_PROMPT_FMT + '~' + body + '}';
  }

  // ── X-axis format picker ─────────────────────────────────────────────

  function _renderXAxisPicker(state) {
    const item = _chartItem(state);
    const currIdx = item ? item.xAxisIdx : DEFAULT_CHART_XAXIS_IDX;
    let out = '{?Rxs`' + currIdx + '~' + DESIGNER_PROMPT_FMT + 'Select X-Axis Format';
    for (const label of CHART_XAXIS_LABELS) out += '|' + label;
    out += '}';
    return out;
  }

  // ── Data range sub-screen ────────────────────────────────────────────

  /// Matches Java editPlotDataRange(): prompt carries the heading + plot name + description;
  /// three buttons: Edit Maximum Value, Edit Minimum Value, Help.
  function _renderDataRangeScreen(state) {
    const plot = _activePlot(state);
    if (!plot) return PFOD_EMPTY;
    const item = _chartItem(state);
    const n = (state.currentPlotNo >= 0 && state.currentPlotNo <= 2) ? state.currentPlotNo : 0;
    const plotLabel = item ? item.plots[n].plotLabel : '';
    return '{,' + DESIGNER_PROMPT_FMT +
      '~<b><+2>Set the Plot Data Variable Range for\n<b><+2><l>' + plotLabel +
      '\n<-1>Set the maximum and minimum integer values that the plot data variable will/can have.' +
      '|P0M' + DESIGNER_MENU_FMT + '~Edit Maximum Value\n<-2>(Currently set to ' + plot.dataRangeMax + ')' +
      '|P0m' + DESIGNER_MENU_FMT + '~Edit Minimum Value\n<-2>(Currently set to ' + plot.dataRangeMin + ')' +
      '|P0h' + DESIGNER_MENU_FMT + '~Help' +
      '}';
  }

  /// Data range help screen — matches Java editPlotDataRangeHelp():
  /// empty prompt, single large label item with all text.
  function _renderDataRangeHelpScreen() {
    return '{,~' +
      '|!Z' + DESIGNER_MENU_FMT + '~' +
      '<b><+2>Editing the Data Range\n' +
      '<-1>Set the maximum and minimum integer values that the data variable will have.\n\n' +
      'This range is scaled to the Display Max .. Display Min range for display.\n\n' +
      'Values must be integers in the range -2,147,483,647 to 2,147,483,646\n\n' +
      'If either value is outside (-32,768 to 32,767) the generated code will use a long variable.' +
      '}';
  }

  // ── R handler (main chart editor) ────────────────────────────────────

  /// Handler for the 'R' top-level cmd.
  function sendR(rawCmd, state, depth) {
    const item = _chartItem(state);
    const sub  = rawCmd[depth + 1];

    // Bare {R} — render the main chart editor.
    if (sub === undefined || sub === '}') {
      return { pfod: _renderChartScreen(state), skipSave: true };
    }

    // {Rp} — chart preview screen with dummy midpoint data.
    if (sub === 'p') {
      return { pfod: _renderChartPreviewScreen(state), skipSave: true };
    }

    // {Rl}/{RlT~<text>} — edit chart label.
    if (sub === 'l') {
      if (!item) return PFOD_EMPTY;
      if (rawCmd[depth + 2] === 'T' && rawCmd[depth + 3] === '~') {
        item.chartLabel = rawCmd.substring(depth + 4, rawCmd.length - 1);
        state.save();
        return PFOD_EMPTY;
      }
      return { pfod: _renderTextInput('RlT', 'Edit Chart Label', item.chartLabel, CHART_LABEL_MAX_LEN), skipSave: true };
    }

    // {Rx}/{Rxs`<idx>} — x-axis format picker / apply.
    if (sub === 'x') {
      if (!item) return PFOD_EMPTY;
      if (rawCmd[depth + 2] === 's' && rawCmd[depth + 3] === '`') {
        const idx = parseInt(rawCmd.substring(depth + 4, rawCmd.length - 1), 10);
        if (!isNaN(idx) && idx >= 0 && idx < CHART_XAXIS_FORMATS.length) {
          item.xAxisIdx = idx;
          state.save();
        }
        return PFOD_EMPTY;
      }
      return { pfod: _renderXAxisPicker(state), skipSave: true };
    }

    // {Rs} — toggle combined/separate plots (simple button click, no backtick value).
    if (sub === 's') {
      if (!item) return PFOD_EMPTY;
      if (rawCmd[depth + 2] === '`') {
        // Legacy toggle-format path — keep for safety.
        item.separatePlots = (parseInt(rawCmd.substring(depth + 3, rawCmd.length - 1), 10) === 1);
      } else {
        item.separatePlots = !item.separatePlots;
      }
      state.save();
      return _renderChartUpdate(state);
    }

    // {Ri`<idx>} — set data interval via slider.
    if (sub === 'i') {
      if (!item) return PFOD_EMPTY;
      if (rawCmd[depth + 2] === '`') {
        const idx = parseInt(rawCmd.substring(depth + 3, rawCmd.length - 1), 10);
        if (!isNaN(idx) && idx >= 0 && idx < CHART_DATA_INTERVALS.length) {
          item.dataIntervalIdx = idx;
          state.save();
        }
      }
      return _renderChartUpdate(state);
    }

    // {Ra}/{Rb}/{Rc} — open per-plot editor for plot 0/1/2.
    if (sub === 'a' || sub === 'b' || sub === 'c') {
      if (!item) return PFOD_EMPTY;
      state.currentPlotNo = sub.charCodeAt(0) - 97; // 'a'→0, 'b'→1, 'c'→2
      return { pfod: _renderPlotScreen(state), skipSave: true };
    }

    // {Rh} — chart help screen.
    if (sub === 'h') {
      return { pfod:
        '{,~' +
        '|!Z' + DESIGNER_MENU_FMT + '~' +
        '<b><+2>Editing Chart Help</b>\n' +
        '<-1>The Chart Preview button is at the top of the screen will preview dummy data.\n\n' +
        'This chart only supports upto 3 variables versus time.\n' +
        'pfodApp/pfodWeb supports more\n\n' +
        'The plots can be separate plots or combine in one plot.\n' +
        'Use the <i><y>Separate Plots</i> / <i><y>Combined Plots</i> toggle button.\n\n' +
        'Use the <i><y>Edit Plot</i> buttons to hide/configure the individual plots.' +
        '}',
        skipSave: true };
    }

    return { pfod: _renderChartUpdate(state), skipSave: true };
  }

  // ── Q handler (per-plot toggles and text edits) ──────────────────────

  /// Handler for the 'Q' top-level cmd.
  /// The per-plot editor SCREEN is served by {Ra}/{Rb}/{Rc} under sendR.
  /// {Q*} handles in-place updates and text-input navigation from that screen.
  function sendQ(rawCmd, state, depth) {
    const plot = _activePlot(state);
    const sub  = rawCmd[depth + 1];

    if (sub === undefined || sub === '}') {
      return { pfod: _renderPlotScreen(state), skipSave: true };
    }

    // {Qa} — toggle auto-scale (simple button click, no backtick value).
    if (sub === 'a') {
      if (!plot) return PFOD_EMPTY;
      plot.autoScale = !plot.autoScale;
      state.save();
      return _renderPlotUpdate(state);
    }

    // {Qs} — toggle show/hide (simple button click, no backtick value).
    if (sub === 's') {
      if (!plot) return PFOD_EMPTY;
      plot.showPlot = !plot.showPlot;
      state.save();
      return _renderPlotUpdate(state);
    }

    // {Ql}/{QlT~<text>} — edit plot label.
    if (sub === 'l') {
      if (!plot) return PFOD_EMPTY;
      if (rawCmd[depth + 2] === 'T' && rawCmd[depth + 3] === '~') {
        plot.plotLabel = rawCmd.substring(depth + 4, rawCmd.length - 1);
        state.save();
        return PFOD_EMPTY;
      }
      return { pfod: _renderTextInput('QlT', 'Edit Plot Label', plot.plotLabel, PLOT_LABEL_MAX_LEN), skipSave: true };
    }

    // {Qu}/{QuT~<text>} — edit plot yAxis units.
    if (sub === 'u') {
      if (!plot) return PFOD_EMPTY;
      if (rawCmd[depth + 2] === 'T' && rawCmd[depth + 3] === '~') {
        plot.units = rawCmd.substring(depth + 4, rawCmd.length - 1);
        state.save();
        return PFOD_EMPTY;
      }
      return { pfod: _renderTextInput('QuT', 'Edit Plot yAxis Units', plot.units, PLOT_UNITS_MAX_LEN), skipSave: true };
    }

    // {Qp}/{Qps`<idx>} — plot pin picker.
    if (sub === 'p') {
      if (rawCmd[depth + 2] === 's') {
        return _applyPlotPinPick(state, rawCmd, depth + 3);
      }
      return { pfod: _renderPlotPinPicker(state), skipSave: true };
    }

    // {Qh} — plot help screen.
    if (sub === 'h') {
      return { pfod:
        '{,~' +
        '|!Z' + DESIGNER_MENU_FMT + '~' +
        '<b><+2>Editing the Individual Plot Settings</b>\n\n' +
        '<-1>The Chart Preview button is at the top of the screen will open a chart preview with dummy data.\n\n' +
        'You can plot an Analog input by connecting this plot to that pin or you can leave it unconnected and have your code supply the data values.\n\n' +
        'The <i><y>Display Max</i> and <i><y>Display Min</i> and the <i><y>Data Variable Range</i> set the mapping between ' +
        'the integral data variable and the plot data. The mapping is done in the generated code.\n' +
        'Set the Data Variable Range to the match the range of the measured value and then set the Display Max and ' +
        'Display Min to the real world values for this data range.\n' +
        'The <i><y>Fixed Scale</i> / <i><y>Auto Scale</i> toggle button sets the initial plot scales. Fixed Scales sets the initial ' +
        'plot scale to the Display Max/Min, Auto Scale adjusts the plot scales to the plot data.\n\n' +
        'You can enable/disable this plot using the\n' +
        '<i><y>Show Plot</i> / <i><y>Hide Plot</i> toggle button.' +
        '}',
        skipSave: true };
    }

    return _renderPlotUpdate(state);
  }

  // ── P handler (plot params sub-dispatcher) ───────────────────────────

  /// Handler for the 'P' top-level cmd.
  function sendP(rawCmd, state, depth) {
    const plot = _activePlot(state);
    const sub  = rawCmd[depth + 1];

    if (sub === undefined || sub === '}') return PFOD_EMPTY;

    // {P0}/{P0M}/{P0MT~<val>}/{P0m}/{P0mT~<val>}/{P0h} — data range sub-screen.
    if (sub === '0') {
      if (!plot) return PFOD_EMPTY;
      const next = rawCmd[depth + 2];
      if (next === undefined || next === '}') {
        return { pfod: _renderDataRangeScreen(state), skipSave: true };
      }
      // {P0h} — data range help. Matches Java editPlotDataRangeHelp().
      if (next === 'h') {
        return { pfod: _renderDataRangeHelpScreen(), skipSave: true };
      }
      const isMax = (next === 'M');
      const isMin = (next === 'm');
      if (!isMax && !isMin) return { pfod: _renderDataRangeScreen(state), skipSave: true };
      if (rawCmd[depth + 3] === 'T' && rawCmd[depth + 4] === '~') {
        const num = parseInt(rawCmd.substring(depth + 5, rawCmd.length - 1).trim(), 10);
        if (!isNaN(num)) {
          if (isMax) plot.dataRangeMax = num;
          else       plot.dataRangeMin = num;
          state.save();
        }
        return PFOD_EMPTY;
      }
      const subCmd     = 'P0' + next + 'T';
      const promptLine = isMax
        ? 'Edit <b>Maximum</b> Value\nfor the Plot Data variable.\nAs an integer in the range -2,147,483,647 to 2,147,483,646'
        : 'Edit <b>Minimum</b> Value\nfor the Plot Data variable.\nAs an integer in the range -2,147,483,647 to 2,147,483,646';
      const currentVal = String(isMax ? plot.dataRangeMax : plot.dataRangeMin);
      return { pfod: _renderTextInput(subCmd, promptLine, currentVal, PLOT_RANGE_MAX_LEN), skipSave: true };
    }

    // {P1}/{P1T~<text>} — display max text. Matches Java editPlotMaxMinText(true).
    if (sub === '1') {
      if (!plot) return PFOD_EMPTY;
      if (rawCmd[depth + 2] === 'T' && rawCmd[depth + 3] === '~') {
        plot.displayMax = rawCmd.substring(depth + 4, rawCmd.length - 1);
        state.save();
        return PFOD_EMPTY;
      }
      const item1 = _chartItem(state);
      const n1 = (state.currentPlotNo >= 0 && state.currentPlotNo <= 2) ? state.currentPlotNo : 0;
      const plotLabel1 = item1 ? item1.plots[n1].plotLabel : '';
      return { pfod: _renderTextInput('P1T',
        'Display Max for Plot ' + (n1 + 1) + '\n<b><+2><l>' + plotLabel1 + '</l>\n' +
        'Enter the number to display for the Maximum Data Range value\n' +
        'The generated code maps the Data Variable Range to\n(DisplayMin .. DisplayMax)\nbefore sending it to pfodApp.',
        plot.displayMax, PLOT_DISPLAY_MAX_LEN), skipSave: true };
    }

    // {P2}/{P2T~<text>} — display min text. Matches Java editPlotMaxMinText(false).
    if (sub === '2') {
      if (!plot) return PFOD_EMPTY;
      if (rawCmd[depth + 2] === 'T' && rawCmd[depth + 3] === '~') {
        plot.displayMin = rawCmd.substring(depth + 4, rawCmd.length - 1);
        state.save();
        return PFOD_EMPTY;
      }
      const item2 = _chartItem(state);
      const n2 = (state.currentPlotNo >= 0 && state.currentPlotNo <= 2) ? state.currentPlotNo : 0;
      const plotLabel2 = item2 ? item2.plots[n2].plotLabel : '';
      return { pfod: _renderTextInput('P2T',
        'Display Min for Plot ' + (n2 + 1) + '\n<b><+2><l>' + plotLabel2 + '</l>\n' +
        'Enter the number to display for the Minimum Data Range value\n' +
        'The generated code maps the Data Variable Range to\n(DisplayMin .. DisplayMax)\nbefore sending it to pfodApp.',
        plot.displayMin, PLOT_DISPLAY_MAX_LEN), skipSave: true };
    }

    return PFOD_EMPTY;
  }

  /// Render the chart preview for a given chart item without requiring
  /// it to be the current state active item.  Called by DesignerPreviewMenu
  /// when the user taps a chart button in the menu preview, so the chart
  /// displays with dummy data exactly as the Chart Preview button does.
  /// @param {object} item  chart item from DesignerState
  /// @returns {string} pfod response (chart command + CSV), or PFOD_EMPTY
  function renderPreviewForItem(item) {
    if (!item || item.type !== ITEM_TYPE_CHART) return PFOD_EMPTY;
    return _buildChartEqMessage(item) + _buildPlotCSVData(item);
  }

  /// Build the `{=...}` chart command split for the Arduino code generator
  /// (DesignerGenerateCode).  Differs from _buildChartEqMessage (preview):
  /// no `50 data limit (that is preview-only, Java limitDataShowing=true)
  /// and no ~C — the generated code prints ~C conditionally on clearPlot
  /// between head and body.  Mirrors Java MenuChart.getPlotMsg(false, false).
  /// @param {object} item  chart item from DesignerState
  /// @returns {{head: string, body: string}} raw pfod strings (caller escapes for C++)
  function buildChartMsgForCode(item) {
    const xi   = item.xAxisIdx;
    const jFmt = _XAXIS_JAVA_FMTS[xi] || _XAXIS_JAVA_FMTS[DEFAULT_CHART_XAXIS_IDX];
    let head = '{=' + item.chartLabel;
    if (jFmt.length > 1) head += '~' + jFmt;
    // xAxis column label
    let body = '|';
    if (_XAXIS_ELAPSED[xi]) {
      body += 'time (' + _XAXIS_TIME_LABEL[xi] + ')';
    } else {
      body += 'date';
    }
    if (!item.separatePlots) body += '`0';
    // Per-plot entries
    for (const p of item.plots) {
      body += '|';
      if (p.showPlot) {
        body += p.plotLabel;
        if (!item.separatePlots) body += '`1';
        if (p.autoScale) {
          body += '~~';
        } else {
          body += '~' + p.displayMax + '~' + p.displayMin;
        }
        body += '~' + p.units;
      }
      // hidden plot emits bare '|' — tells chart display to skip that column
    }
    body += '}';
    return { head, body };
  }

  return Object.freeze({ sendR, sendQ, sendP, renderPreviewForItem, buildChartMsgForCode });
})();

// Self-register into the top-level designer dispatcher.
// 'R' — main chart editor (also handles {Rp} preview from per-plot editor)
DesignerDispatch.add('R', DesignerEditChart.sendR);
// 'Q' — per-plot editor actions and text-input navigation
DesignerDispatch.add('Q', DesignerEditChart.sendQ);
// 'P' — plot params sub-dispatcher (data range, display max/min)
DesignerDispatch.add('P', DesignerEditChart.sendP);
