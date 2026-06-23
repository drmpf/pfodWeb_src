/*
   pfodNumericInputDisplay.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Manages the full-screen numeric input display (numeric-input-mode) for pfod Section 11.
// Assigned to window.pfodNumericInputDisplay as a singleton after class definition.
//
// pfod format: {#<cmd>[~<prompt>]`<current>[`<max>[`<min>]][~units[~scale[~offset]]}
// Submission sends: {<cmd>`<integerValue>} as a 'touch' request.
// Display value = (integerValue * scale) + offset, shown with units appended.
//
// State read:    document.body.className
// State written: document.body.className (numeric-input-mode <-> message-mode)
// DOM elements:  #numeric-input-container, #numeric-input-value-display,
//                #numeric-input-value-text, #numeric-input-field,
//                #numeric-input-slider, #numeric-input-prompt,
//                #numeric-input-popup, #numeric-input-popup-text,
//                #numeric-input-submit-btn, #numeric-input-exit-btn
// Depends on:    pfodSetFormattedText from pfodButtonRenderer.js (must load first),
//                parsePfodFormatCodes from pfodMenuParser.js (must load first),
//                xtermColorToHex, getBlackWhite from redraw.js (must load first)
// Called by:     responseHandlers:handleNonDwgResponse (show),
//                responseHandlers:handleNonDwgResponse / handleDwgResponse / toolbarAndMenu (hide)

class PfodNumericInputDisplay {
  constructor() {
    this._cmd = '';
    this._min = 0;
    this._max = 254;
    this._scale = 1;
    this._offset = 0;
    this._units = '';
    this._currentInt = 0;
    this._onSubmit = null;
    this._popupTimer = null;
    // Bound handlers stored so they can be removed on hide()
    this._boundSliderInput = this._handleSliderInput.bind(this);
    this._boundValueTap = this._handleValueTap.bind(this);
    this._boundFieldChange = this._handleFieldChange.bind(this);
    this._boundFieldBlur = this._handleFieldBlur.bind(this);
    this._boundSubmit = this._handleSubmit.bind(this);
  }

  // Pure static parser — no DOM access.
  // cmdArray[0]: "{#<cmd>[~<prompt>]`<current>[`<max>[`<min>]][~units[~scale[~offset]]"
  // Backtick splits numbers; each numeric field may carry a ~units~scale~offset tail
  // if it is the last backtick-separated segment before the units section.
  static parse(cmdArray) {
    const raw = cmdArray[0]; // e.g. "{#n~Set Volts`908`1000`5~ Volts~0.011074~-0.055"
    const content = raw.slice(2); // strip "{#"

    const backtickParts = content.split('`');

    // First segment: "<cmd>[~<prompt>]"
    const firstPart = backtickParts[0];
    const tildeIdx = firstPart.indexOf('~');
    let cmd, prompt;
    if (tildeIdx >= 0) {
      cmd = firstPart.slice(0, tildeIdx);
      prompt = firstPart.slice(tildeIdx + 1);
    } else {
      cmd = firstPart;
      prompt = '';
    }

    let current = 0, max = 254, min = 0;
    let units = '', scale = 1, offset = 0;
    let unitsTail = '';

    // Each backtick segment is a numeric field; the final one may have ~units~scale~offset appended.
    function parseNumField(str) {
      const ti = str.indexOf('~');
      if (ti >= 0) {
        return { value: parseInt(str.slice(0, ti), 10) || 0, tail: str.slice(ti + 1) };
      }
      return { value: parseInt(str, 10) || 0, tail: '' };
    }

    if (backtickParts.length > 1) {
      const f = parseNumField(backtickParts[1]);
      current = f.value; if (f.tail) unitsTail = f.tail;
    }
    if (backtickParts.length > 2) {
      const f = parseNumField(backtickParts[2]);
      max = f.value; if (f.tail) unitsTail = f.tail;
    }
    if (backtickParts.length > 3) {
      const f = parseNumField(backtickParts[3]);
      min = f.value; if (f.tail) unitsTail = f.tail;
    }

    // Parse the units tail: "units~scale~offset"
    if (unitsTail) {
      const tailParts = unitsTail.split('~');
      units = tailParts[0] || '';
      if (tailParts.length > 1) { const s = parseFloat(tailParts[1]); if (!isNaN(s)) scale = s; }
      if (tailParts.length > 2) { const o = parseFloat(tailParts[2]); if (!isNaN(o)) offset = o; }
    }

    // Swap max/min if necessary so max >= min (mirrors pfodApp behaviour)
    if (min > max) { const tmp = min; min = max; max = tmp; }
    // Clamp current to [min, max]
    current = Math.max(min, Math.min(max, current));

    return { cmd, prompt, current, max, min, units, scale, offset };
  }

  // Show the numeric input screen.
  // inputData: result of PfodNumericInputDisplay.parse()
  // onSubmit(cmd, intValue): called when user taps checkmark
  show(inputData, onSubmit) {
    this._cmd = inputData.cmd;
    this._min = inputData.min;
    this._max = inputData.max;
    this._scale = inputData.scale;
    this._offset = inputData.offset;
    this._units = substituteUnsupportedUnitsGlyphs(inputData.units || '');
    this._currentInt = inputData.current;
    this._onSubmit = onSubmit;
    // dp: just enough so one raw count produces a visible change (scale = display change per count)
    this._decimals = calcDisplayDecimalPlaces(1, this._scale);

    const slider = document.getElementById('numeric-input-slider');
    const promptEl = document.getElementById('numeric-input-prompt');
    const popup = document.getElementById('numeric-input-popup');
    const popupText = document.getElementById('numeric-input-popup-text');
    const submitBtn = document.getElementById('numeric-input-submit-btn');
    const valueDisplay = document.getElementById('numeric-input-value-display');

    slider.min = this._min;
    slider.max = this._max;
    slider.value = this._currentInt;

    this._updateValueText(this._currentInt);

    // Strip all <bg colorCode> tags from the prompt wherever they appear.
    // The last valid <bg> found sets the screen background; all are removed from the text.
    // Default background: black. Default text colour: <bw> against that background.
    let bgColor = '';
    const promptText = (inputData.prompt || '').replace(/<bg ([^>]+)>/g, function(match) {
      const color = parsePfodFormatCodes(match).bgColor;
      if (color) bgColor = color;
      return '';
    });
    const container = document.getElementById('numeric-input-container');
    if (container) container.style.backgroundColor = bgColor;
    const contrastHex = xtermColorToHex(getBlackWhite(bgColor || '#000000'));
    pfodSetFormattedText(promptEl, promptText, contrastHex);
    promptEl.style.color = contrastHex;

    // Show transient popup with the valid display-value range
    const minDisplay = (this._min * this._scale + this._offset).toFixed(this._decimals);
    const maxDisplay = (this._max * this._scale + this._offset).toFixed(this._decimals);
    popupText.textContent = 'Number between ' + minDisplay + ' and ' + maxDisplay;
    popup.style.display = 'flex';
    if (this._popupTimer) clearTimeout(this._popupTimer);
    this._popupTimer = setTimeout(() => {
      popup.style.display = 'none';
      this._popupTimer = null;
    }, 4000);

    slider.addEventListener('input', this._boundSliderInput);
    valueDisplay.addEventListener('click', this._boundValueTap);
    submitBtn.addEventListener('click', this._boundSubmit);

    document.body.className = 'numeric-input-mode';
  }

  // Clear numeric-input-mode and reset state.
  // Only switches body class if currently in numeric-input-mode.
  hide() {
    if (document.body.className === 'numeric-input-mode') {
      document.body.className = 'message-mode';
    }
    if (this._popupTimer) {
      clearTimeout(this._popupTimer);
      this._popupTimer = null;
    }

    const slider = document.getElementById('numeric-input-slider');
    const valueDisplay = document.getElementById('numeric-input-value-display');
    const submitBtn = document.getElementById('numeric-input-submit-btn');
    const field = document.getElementById('numeric-input-field');
    const valueText = document.getElementById('numeric-input-value-text');
    const popup = document.getElementById('numeric-input-popup');

    if (slider) slider.removeEventListener('input', this._boundSliderInput);
    if (valueDisplay) valueDisplay.removeEventListener('click', this._boundValueTap);
    if (submitBtn) submitBtn.removeEventListener('click', this._boundSubmit);
    if (field) {
      field.removeEventListener('change', this._boundFieldChange);
      field.removeEventListener('blur', this._boundFieldBlur);
      field.style.display = 'none';
    }
    if (valueText) valueText.style.display = '';
    if (popup) popup.style.display = 'none';

    this._cmd = '';
    this._onSubmit = null;
  }

  isVisible() {
    return document.body.className === 'numeric-input-mode';
  }

  // Format display value: (intVal * scale) + offset, to the calculated decimal places.
  _formatDisplay(intVal) {
    const d = intVal * this._scale + this._offset;
    return d.toFixed(this._decimals);
  }

  // Update the visible value text span with current integer value.
  _updateValueText(intVal) {
    const valueText = document.getElementById('numeric-input-value-text');
    if (valueText) valueText.textContent = this._formatDisplay(intVal) + this._units;
  }

  // Slider moved — update integer value and displayed text.
  _handleSliderInput() {
    const slider = document.getElementById('numeric-input-slider');
    this._currentInt = parseInt(slider.value, 10);
    this._updateValueText(this._currentInt);
  }

  // User tapped the value display — switch to editable numeric input field.
  _handleValueTap() {
    const valueText = document.getElementById('numeric-input-value-text');
    const field = document.getElementById('numeric-input-field');
    // Already editing iff we set display='block' below.  Don't test `!== 'none'` —
    // on first show the inline style is '' (CSS provides display:none), so that
    // test would falsely flag "already editing" and the field would never open.
    if (!field || field.style.display === 'block') return;
    valueText.style.display = 'none';
    field.value = this._formatDisplay(this._currentInt);
    field.style.display = 'block';
    field.addEventListener('change', this._boundFieldChange);
    field.addEventListener('blur', this._boundFieldBlur);
    field.focus();
    field.select();
  }

  // Commit the edited field value back to integer, clamp, update slider and text.
  _commitFieldValue() {
    const field = document.getElementById('numeric-input-field');
    const valueText = document.getElementById('numeric-input-value-text');
    const displayVal = parseFloat(field.value);
    if (!isNaN(displayVal)) {
      let intVal = Math.round((displayVal - this._offset) / this._scale);
      intVal = Math.max(this._min, Math.min(this._max, intVal));
      this._currentInt = intVal;
      const slider = document.getElementById('numeric-input-slider');
      if (slider) slider.value = intVal;
    }
    this._updateValueText(this._currentInt);
    field.removeEventListener('change', this._boundFieldChange);
    field.removeEventListener('blur', this._boundFieldBlur);
    field.style.display = 'none';
    if (valueText) valueText.style.display = '';
  }

  _handleFieldChange() {
    this._commitFieldValue();
  }

  _handleFieldBlur() {
    this._commitFieldValue();
  }

  // Called when user taps the checkmark button.
  // Does NOT call hide() — the response handler does that when device reply arrives.
  _handleSubmit() {
    if (this._onSubmit) {
      this._onSubmit(this._cmd, this._currentInt);
    }
  }
}

window.pfodNumericInputDisplay = new PfodNumericInputDisplay();
