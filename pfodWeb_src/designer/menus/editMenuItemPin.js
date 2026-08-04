/*
 * designer/menus/editMenuItemPin.js
 *
 * Pin-selector screen for on/off and PWM menu items — reached via the
 * 'p' sub-byte of the 'd' (editMenuItem) handler.  Renders a pfod
 * single-selection screen listing all board pins that match the active
 * item's I/O requirement (digital-output for on/off, PWM-output for
 * PWM slider), with already-used pins filtered out.
 *
 * Command flow:
 *   {dp}         → render picker   {?dps`<currentIdx>~…}
 *   {dps`<idx>}  → apply selection → PFOD_EMPTY (back-nav to editMenuItem)
 *
 * Pin uniqueness scope: the entire design tree (rootMenu + all nested
 * sub-menus).  The active item's own current pin is kept available so
 * the user can re-confirm an existing choice without it vanishing from
 * the list.  Analog inputs are the exception to uniqueness — an ADC read
 * is non-exclusive, so a pin already read by a Data/ADC Display (or a
 * chart plot) stays selectable for another analog reader.
 *
 * Origin: pfodDesignerV2/DesignerMsgProcessor.java selectBoardPin
 *         (editButton / editOnOff pin-picker branch).
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DesignerEditMenuItemPin = (() => {

  // Map each item type that can have a pin to the board capability it needs.
  const ITEM_TYPE_TO_PIN_CAP = Object.freeze({
    onoff:        PinType.DIGITAL_OUTPUT,
    onoffdisplay: PinType.DIGITAL_INPUT,
    pwm:          PinType.PWM_OUTPUT,
    datadisplay:  PinType.ANALOG_INPUT,
  });

  // Human-readable capability label used in the picker prompt.
  const PIN_CAP_LABEL = Object.freeze({
    [PinType.DIGITAL_INPUT]:  'digital input',
    [PinType.DIGITAL_OUTPUT]: 'digital output',
    [PinType.PWM_OUTPUT]:     'PWM output',
    [PinType.ANALOG_INPUT]:   'analog input',
  });

  /// Collect all pin names already assigned across the entire design tree
  /// (rootMenu + all nested sub-menus), excluding the active item so its
  /// own current pin stays re-selectable.
  ///
  /// Chart plot pins count as allocations too — a plot drives an
  /// analogRead() on that pin, so it must not also be claimed as a
  /// digital/PWM output.
  ///
  /// When the picker is looking for an ANALOG_INPUT pin (a Data/ADC
  /// Display), pins already allocated as ANALOG_INPUT elsewhere — whether
  /// by another Data/ADC Display or by a chart plot — are NOT counted as
  /// used: an ADC read is non-exclusive, so several readers may share the
  /// one input (see editChart.js's _usedPinNamesForPlot for the chart-plot
  /// side of the same rule).  For every other capability (digital output,
  /// PWM, digital input) an existing ADC allocation still blocks the pin,
  /// since driving a pin that is also being read is a real conflict.
  /// @param {DesignerState} state
  /// @param {string}        requiredCap — capability the picker is filtering on
  /// @returns {Set<string>}
  function _usedPinNames(state, requiredCap) {
    const used        = new Set();
    const activeItem  = state.getActiveItem();
    const shareAnalog = (requiredCap === PinType.ANALOG_INPUT);
    /// Add pin unless it's an analog input the caller is allowed to share.
    const addPin = (pin) => {
      if (!pin) return;
      if (shareAnalog && pin.type === PinType.ANALOG_INPUT) return;
      used.add(pin.name);
    };
    function walkMenu(menu) {
      for (const it of menu.items) {
        if (it === activeItem) continue;
        addPin(it.pin);
        if (it.type === ITEM_TYPE_CHART && Array.isArray(it.plots)) {
          for (const p of it.plots) addPin(p.pin);
        }
        if (it.type === 'submenu' && it.subMenu) walkMenu(it.subMenu);
      }
    }
    walkMenu(state.rootMenu);
    return used;
  }

  /// True if a pin supports a capability for the active connection.
  /// The convention: "cap" is available for all connections; "cap_serial"
  /// (or "cap_ble" etc.) is available only when that connection is active.
  function _pinSupports(bp, cap, connection) {
    return bp.capabilities.supports(cap) ||
           bp.capabilities.supports(cap + '_' + connection);
  }

  /// Build the ordered array of selectable entries for this item.
  /// Entry 0 is always "Not connected" (name: null, type: null).
  /// Remaining entries are board pins that support the required capability
  /// for the current connection type, and are not already used elsewhere
  /// in the design tree.
  /// @returns {{ label: string, notes: string|null, busTags: string[], name: string|null, type: string|null }[]}
  function _buildPinList(state) {
    const item = state.getActiveItem();
    if (!item) return [];
    const requiredCap = ITEM_TYPE_TO_PIN_CAP[item.type];
    if (!requiredCap) return [];
    const used = _usedPinNames(state, requiredCap);
    const list = [{ label: 'Not connected', notes: null, name: null, type: null }];
    for (const bp of state.board.pins) {
      if (!_pinSupports(bp, requiredCap, state.connection)) continue;
      if (used.has(bp.name)) continue;
      // For PWM items: a pin that natively supports DAC output should be
      // tagged dac_output so the code generator emits dacWrite() instead
      // of analogWrite() when the user picks it.
      const pinType = (requiredCap === PinType.PWM_OUTPUT
                       && bp.capabilities.supports(PinType.DAC_OUTPUT))
                    ? PinType.DAC_OUTPUT
                    : requiredCap;
      list.push({
        label:    bp.label,
        notes:    bp.notes || null,
        busTags:  bp.capabilities.busTags(),
        name:     bp.name,
        codeName: bp.codeName,
        type:     pinType,
      });
    }
    return list;
  }

  /// Render the pfod single-selection screen.  Pre-selects the entry that
  /// matches the item's current pin (or 0 / "Not connected" if none set
  /// or pin no longer in the filtered list).
  function _renderPicker(state) {
    const item = state.getActiveItem();
    if (!item) return PFOD_EMPTY;
    const requiredCap = ITEM_TYPE_TO_PIN_CAP[item.type];
    if (!requiredCap) return PFOD_EMPTY;
    const pinList    = _buildPinList(state);
    const capLabel   = PIN_CAP_LABEL[requiredCap] || requiredCap;
    // Find the current-selection index; fall back to 0 (Not connected)
    // when the item's pin is absent from the available list.
    let currentIdx = 0;
    if (item.pin) {
      for (let i = 1; i < pinList.length; i++) {
        if (pinList[i].name === item.pin.name) { currentIdx = i; break; }
      }
    }
    let out = '{?dps`' + currentIdx + '~' + DESIGNER_PROMPT_FMT;
    out += 'Select ' + capLabel + ' pin\nfor ' + state.name;
    for (const entry of pinList) {
      // Append notes (plus any I2C/SPI bus-role tags, in parentheses) in
      // smaller font on a new line when present. <-2> shrinks two steps;
      // the tag-stack resets between options so no explicit close tag is
      // needed (matches addMenuItem.js convention).
      const busTagsStr = entry.busTags && entry.busTags.length ? entry.busTags.join(', ') : null;
      let subtitle = entry.notes;
      if (busTagsStr) subtitle = subtitle ? subtitle + ' (' + busTagsStr + ')' : busTagsStr;
      const optLabel = subtitle ? entry.label + '\n<-2>' + subtitle : entry.label;
      out += '|' + optLabel;
    }
    out += '}';
    return out;
  }

  /// Apply the user's pin selection.  argStart points to the '`' in
  /// `{dps`<idx>}`.  Index 0 = "Not connected" → clears item.pin.
  /// Preserves invertOutput when the user re-selects the same pin.
  function _applyPick(state, rawCmd, argStart) {
    if (rawCmd[argStart] !== '`') return PFOD_EMPTY;
    const idx = parseInt(rawCmd.substring(argStart + 1, rawCmd.length - 1), 10);
    if (isNaN(idx) || idx < 0) return PFOD_EMPTY;
    const item = state.getActiveItem();
    if (!item) return PFOD_EMPTY;
    const pinList = _buildPinList(state);
    if (idx >= pinList.length) return PFOD_EMPTY;
    const entry = pinList[idx];
    if (entry.name === null) {
      item.pin = null;
    } else {
      // invertOutput only applies to onoff (output drive polarity) —
      // onoffdisplay/pwm/datadisplay pins never get it set via the UI,
      // so it's omitted for those types rather than stamping a
      // meaningless invertOutput: false onto them.  Keep existing
      // invertOutput when re-picking the same pin so a user tweaking
      // other settings doesn't accidentally lose their polarity choice.
      const usesInvert = item.type === 'onoff';
      if (usesInvert) {
        const prevInvert = (item.pin && item.pin.name === entry.name)
                           ? item.pin.invertOutput : false;
        item.pin = { name: entry.name, codeName: entry.codeName, type: entry.type, invertOutput: prevInvert };
      } else {
        item.pin = { name: entry.name, codeName: entry.codeName, type: entry.type };
      }
    }
    state.save();
    return PFOD_EMPTY;   // back-nav returns to editMenuItem
  }

  /// Boards with zero routable pins (Unlisted Board, and any future
  /// target that isn't "Minimal C Code") have no real list for the
  /// picker to offer, but — unlike Minimal C, which has no Arduino pin
  /// API at all — their generated code is still a normal Arduino/C++
  /// sketch, so the user may still want the pin-dependent code emitted
  /// with a `?` placeholder to fill in by hand once the real pin number
  /// is known.  See editMenuItem.js's itemHasPin rendering for the
  /// matching enabled-toggle-vs-disabled-label UI logic.
  function _togglePlaceholder(state) {
    const item = state.getActiveItem();
    if (!item) return PFOD_EMPTY;
    const requiredCap = ITEM_TYPE_TO_PIN_CAP[item.type];
    if (!requiredCap) return PFOD_EMPTY;
    if (item.pin && item.pin.name === PLACEHOLDER_PIN_NAME) {
      item.pin = null;
    } else {
      item.pin = { name: PLACEHOLDER_PIN_NAME, codeName: PLACEHOLDER_PIN_NAME, type: requiredCap };
    }
    state.save();
    // Unlike _applyPick's list-submit (which gets a free re-render via
    // pfod's automatic back-navigation on selection), this fires from a
    // plain button click — nothing re-renders the screen unless we
    // explicitly do it here.
    return DesignerEditMenuItem.renderUpdateScreen(state);
  }

  /// Dispatch entry-point — called from editMenuItem.send's
  /// EMI_IO_PIN_CMD ('p') case with depth pointing to 'd'.
  ///   {dp}        → rawCmd[depth+2] = '}' → render picker (or toggle
  ///                 the `?` placeholder — see _togglePlaceholder — on
  ///                 a non-ccode board with no real pins)
  ///   {dps`<idx>} → rawCmd[depth+2] = 's' → apply pick
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth — index of 'd' in rawCmd
  function send(rawCmd, state, depth) {
    if (rawCmd[depth + 2] === 's') {
      return _applyPick(state, rawCmd, depth + 3);
    }
    if (state.board.pins.length === 0 && state.board.family !== 'ccode') {
      return _togglePlaceholder(state);
    }
    return { pfod: _renderPicker(state), skipSave: true };
  }

  return Object.freeze({ send });
})();
