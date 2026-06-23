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
 * the list.
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
  /// @param {DesignerState} state
  /// @returns {Set<string>}
  function _usedPinNames(state) {
    const used        = new Set();
    const activeItem  = state.getActiveItem();
    function walkMenu(menu) {
      for (const it of menu.items) {
        if (it === activeItem) continue;
        if (it.pin) used.add(it.pin.name);
        if (it.type === 'submenu' && it.subMenu) walkMenu(it.subMenu);
      }
    }
    walkMenu(state.rootMenu);
    return used;
  }

  /// Build the ordered array of selectable entries for this item.
  /// Entry 0 is always "Not connected" (name: null, type: null).
  /// Remaining entries are board pins that support the required capability
  /// and are not already used elsewhere in the design tree.
  /// @returns {{ label: string, notes: string|null, name: string|null, type: string|null }[]}
  function _buildPinList(state) {
    const item = state.getActiveItem();
    if (!item) return [];
    const requiredCap = ITEM_TYPE_TO_PIN_CAP[item.type];
    if (!requiredCap) return [];
    const used = _usedPinNames(state);
    const list = [{ label: 'Not connected', notes: null, name: null, type: null }];
    for (const bp of state.board.pins) {
      if (!bp.capabilities.supports(requiredCap)) continue;
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
      // Append notes in smaller font on a new line when present.
      // <-2> shrinks two steps; the tag-stack resets between options so
      // no explicit close tag is needed (matches addMenuItem.js convention).
      const optLabel = entry.notes
        ? entry.label + '\n<-2>' + entry.notes
        : entry.label;
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
      // Keep existing invertOutput when re-picking the same pin so a
      // user tweaking other settings doesn't accidentally lose their
      // polarity choice.
      const prevInvert = (item.pin && item.pin.name === entry.name)
                         ? item.pin.invertOutput : false;
      item.pin = { name: entry.name, codeName: entry.codeName, type: entry.type, invertOutput: prevInvert };
    }
    state.save();
    return PFOD_EMPTY;   // back-nav returns to editMenuItem
  }

  /// Dispatch entry-point — called from editMenuItem.send's
  /// EMI_IO_PIN_CMD ('p') case with depth pointing to 'd'.
  ///   {dp}        → rawCmd[depth+2] = '}' → render picker
  ///   {dps`<idx>} → rawCmd[depth+2] = 's' → apply pick
  /// @param {string}        rawCmd
  /// @param {DesignerState} state
  /// @param {number}        depth — index of 'd' in rawCmd
  function send(rawCmd, state, depth) {
    if (rawCmd[depth + 2] === 's') {
      return _applyPick(state, rawCmd, depth + 3);
    }
    return { pfod: _renderPicker(state), skipSave: true };
  }

  return Object.freeze({ send });
})();
