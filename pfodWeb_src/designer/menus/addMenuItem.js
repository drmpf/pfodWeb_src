/*
 * designer/menus/addMenuItem.js
 *
 * Handler for the 'k' (addNewMenuItemCmd) item on the editMenu
 * screen.  Renders the pfod selection screen that lists the nine
 * available menu-item types — matches Java pfodDesignerV2's
 * `addNewMenuItem` (DesignerMsgProcessor.java line 3059) +
 * V2_MenuItemEnum.java (entries 6–66) exactly, including each item's
 * title and the smaller-text descriptions underneath.
 *
 * Reach path:
 *   {k}           → render the pfod selection screen ({?ks`-1~…})
 *   {ks`<idx>}    → STUB — picking an option is a no-op for now;
 *                   pfodWeb's queued back-nav fetches editMenu so
 *                   the user lands back on the design's home screen
 *                   without any new item.  Per-item creation +
 *                   editor screens land in subsequent passes.
 *
 * Selection-screen format (per pfodSelectionDisplay.parseSingle):
 *   {?<cmd>`<initialIdx>~<prompt>|<opt0>|<opt1>|…}
 * `cmd` here is the FULL byte sequence pfodWeb will echo back on
 * submit; we use `ks` so the submit lands as `{ks`<idx>}` and our
 * `k` handler routes the `s` sub-byte to the apply path.
 * `initialIdx` of -1 means "no default selection" (matches Java's
 * `currentIdx = -1` at line 3079).
 *
 * Origin: pfodDesignerV2/DesignerMsgProcessor.java addNewMenuItem +
 *         designerSupport/V2_MenuItemEnum.java.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DesignerAddMenuItem = (() => {

  // Selection labels — copied verbatim from V2_MenuItemEnum.java's
  // `selectionTxt` constructor parameter for each enum entry, in
  // the same order.  Order is significant: the picker's submit
  // index refers to position in this list.  Per-item layout:
  //   - Title on first line (default size)
  //   - <-3> shrinks for body text
  //   - <-1> shrinks further for an "Option to connect to <pin>"
  //     code-generation note where Java has one
  // Font-size deltas are NOT closed — pfodSelectionDisplay parses
  // each option's label in isolation so the tag-stack resets between
  // items.  Full Java wording is preserved (matches the
  // feedback-designer-match-java-colours-text rule) even though the
  // total response runs above pfod's 1024-byte device limit — this
  // picker is served entirely in-browser by the designer's virtual
  // device, so no network truncation applies.
  // Order chosen by the user (input/output grouping):
  //   0 OnOff   1 OnOff-display   2 PWM   3 Data-display
  //   4 Chart   5 Button   6 Label   7 Drawing   8 Sub-menu
  //
  // pfodWeb's connectionManager caps every pfod cmd at 1024 wire
  // bytes (auto-closes with implicit '}' at the cap and logs the
  // tail) — Sub-menu used to fall off the end with Java's verbatim
  // ~1250-byte text.  Adjustments to fit:
  //   - "pfodDesigner only allows one chart …" dropped from Chart.
  //   - I/O options (OnOff / OnOff-Display / PWM / Data-Display /
  //     Chart) carry a single shared <-1> "Option to connect to
  //     board pin." line — replaces Java's per-item wording (digital
  //     output / input / PWM-capable / Analog) with a generic note
  //     to save bytes.
  //   - Drawing's secondary lines ("A sample control button …",
  //     "Edit the generated code …") dropped — title + first body
  //     line carry the meaning.
  // Titles + Java's <-3> first-line body + (Data Display's)
  // <i>e.g. …</i> example are preserved verbatim.  Final response
  // sits around 1000 bytes (was 1250 verbatim).
  const IO_PIN_NOTE = '\n<-1>Option to connect to board pin.';
  const MENU_ITEM_OPTIONS = Object.freeze([
    // 0 — MENU_ITEM_ON_OFF
    'On/Off Setting or Pulse\n' +
    '<-3>Set or pulse a variable.' + IO_PIN_NOTE,

    // 1 — MENU_ITEM_INPUT_DISPLAY
    'On/Off Display\n' +
    '<-3>Display a boolean variable (0 or 1)' + IO_PIN_NOTE,

    // 2 — MENU_ITEM_PWM_SLIDER
    'Slider Input or \n PWM/Analog Output\n' +
    '<-3>Slider to let the user set a number.\n<-1>Option to connect to PWM or DAC pin',

    // 3 — MENU_ITEM_ADC_DISPLAY
    'Data Display\n' +
    '<-3>Display an int or long variable scaled to the real value it represents with units\n' +
    'Horizontal bar indicator optional.\n' +
    '<i>e.g. 0 to 1023 variable mapped to 0V to 3.3V displayed.</i>' + IO_PIN_NOTE,

    // 4 — MENU_ITEM_PLOT
    'Chart Button\n' +
    '<-3>This menu item opens a chart with upto 3 plots.' + IO_PIN_NOTE,

    // 5 — MENU_ITEM_BUTTON
    'Button\n' +
    '<-3>This menu item just sends a command when pressed. ' +
    'A place holder is generated where you can add your own code.',

    // 6 — MENU_ITEM_LABEL
    'Label\n' +
    '<-3>To display fixed text or add a blank spacer to the menu.',

    // 7 — MENU_ITEM_IMAGE_DISPLAY
    'Drawing\n' +
    '<-3>This menu item loads a drawing to show your custom controls.',

    // 8 — SUB_MENU
    'Sub-menu\n' +
    '<-3>This menu item opens a sub-menu.',
  ]);

  /// Render the picker.  Header prompt uses DESIGNER_PROMPT_FMT (dark
  /// navy bg + white text — the designer chrome) so the prompt reads
  /// as part of the designer UI rather than as one of the options.
  /// Initial selection -1 means no option starts highlighted —
  /// matches Java's line 3079.
  function _renderPicker() {
    let out = "{?ks`-1~" + DESIGNER_PROMPT_FMT +
              'Select the function of menu item to add.';
    for (const label of MENU_ITEM_OPTIONS) {
      out += '|' + label;
    }
    out += '}';
    return out;
  }

  // Indices into MENU_ITEM_OPTIONS — kept as named constants so the
  // create-handler stays readable even when the picker order shifts.
  const IDX_ONOFF         = 0;
  const IDX_ONOFF_DISPLAY = 1;
  const IDX_PWM           = 2;
  const IDX_DATA_DISPLAY  = 3;
  const IDX_CHART         = 4;
  const IDX_BUTTON        = 5;
  const IDX_LABEL         = 6;
  const IDX_DRAWING       = 7;
  const IDX_SUBMENU       = 8;

  /// Picker submit — rawCmd = `{ks\`<idx>}`.  argStart points to the
  /// backtick after 's'.  Create the picked item type on the active
  /// menu, set activeItemIdx so the item editor knows which one to
  /// open, persist, then queue `{d}` so pfodWeb navigates into the
  /// per-item editor.  Item types other than Button / Label are not
  /// yet implemented — they no-op (return PFOD_EMPTY) so the user
  /// lands back on editMenu via pfodWeb's already-queued back-nav.
  function _applyPick(state, rawCmd, argStart) {
    if (rawCmd[argStart] !== '`') return PFOD_EMPTY;
    const idx = parseInt(rawCmd.substring(argStart + 1, rawCmd.length - 1), 10);
    if (isNaN(idx)) return PFOD_EMPTY;

    // If a new item was already created this session (_pendingNewItemIdx set),
    // this is a re-request of the same picker submit (e.g. after a text-field
    // submit inside the item editor returns {}).  Re-show the item editor for
    // the existing item without creating a duplicate.
    if (state._pendingNewItemIdx !== null) {
      return DesignerDispatch.dispatch('{d}', state, DISPATCH_ROOT_DEPTH);
    }

    const menu = state.getActiveMenu();
    let newItem = null;
    if (idx === IDX_BUTTON) {
      newItem = _freshButtonItem(_makeAutoCmd('button', DEFAULT_BUTTON_TEXT, state.getAllItems()));
    } else if (idx === IDX_LABEL) {
      newItem = _freshLabelItem(_makeAutoCmd('label', DEFAULT_LABEL_TEXT, state.getAllItems()));
    } else if (idx === IDX_ONOFF) {
      newItem = _freshOnOffItem(_makeAutoCmd('onoff', DEFAULT_ONOFF_LEADING_TEXT, state.getAllItems()));
    } else if (idx === IDX_ONOFF_DISPLAY) {
      newItem = _freshOnOffDisplayItem(_makeAutoCmd('onoffdisplay', DEFAULT_ONOFFDISPLAY_LEADING_TEXT, state.getAllItems()));
    } else if (idx === IDX_PWM) {
      newItem = _freshPwmItem(_makeAutoCmd('pwm', DEFAULT_PWM_LEADING_TEXT, state.getAllItems()));
    } else if (idx === IDX_DATA_DISPLAY) {
      const boardAdc = (state.board && state.board.adc) ? state.board.adc : {};
      newItem = _freshDataDisplayItem(_makeAutoCmd('datadisplay', DEFAULT_DATADISPLAY_LEADING_TEXT, state.getAllItems()), boardAdc.max, boardAdc.defaultRefVolts);
    } else if (idx === IDX_CHART) {
      newItem = _freshChartItem(_makeAutoCmd('chart', DEFAULT_CHART_LABEL, state.getAllItems()));
    } else if (idx === IDX_DRAWING) {
      newItem = _freshDrawingItem(_makeAutoCmd('drawing', DEFAULT_DRAWING_TEXT, state.getAllItems()));
    } else if (idx === IDX_SUBMENU) {
      newItem = _freshSubMenuItem(_makeAutoCmd('submenu', DEFAULT_SUBMENU_TEXT, state.getAllItems()));
    } else {
      return PFOD_EMPTY;
    }

    menu.items.push(newItem);
    state.activeItemIdx = menu.items.length - 1;
    // Signal to handleSubMenuEntry that this {d} is for a newly-created
    // item.  pfodApp back-navs by re-sending the top of its nav stack
    // ({s<path>} or {a}) BEFORE the queued {d} fires; that re-send must
    // preserve activeItemIdx rather than resetting to null.
    state._pendingNewItemIdx = state.activeItemIdx;
    console.error('[Designer] addMenuItem: created item idx=' + state.activeItemIdx +
                  ' in path=' + JSON.stringify(state.activeMenuPath) +
                  ', set _pendingNewItemIdx=' + state._pendingNewItemIdx);
    state.save();

    // Dispatch {d} directly — returns the item editor screen.
    return DesignerDispatch.dispatch('{d}', state, DISPATCH_ROOT_DEPTH);
  }

  /// Dispatch handler.  depth = index of 'k' in rawCmd.
  ///   sub byte at depth+1 === 's' → picker submit; create the
  ///     picked item type and open its edit screen.
  ///   otherwise (bare `{k}`) → render the picker.
  ///
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth
  /// @returns {string|{pfod, skipSave}}
  function send(rawCmd, state, depth) {
    if (rawCmd[depth + 1] === 's') {
      return _applyPick(state, rawCmd, depth + 2);
    }
    return { pfod: _renderPicker(), skipSave: true };
  }

  return Object.freeze({ send });
})();

// Self-register into the top-level designer dispatcher.
DesignerDispatch.add('k', DesignerAddMenuItem.send);
