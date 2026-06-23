/*
   pfodSelectionDisplay.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Manages single-selection (Section 12: {?...}) and multi-selection (Section 13: {*...}) screens.
// Assigned to window.pfodSelectionDisplay as a singleton after class definition.
//
// Single:  {?<cmd>[`<init>][~<prompt>]|<label0>[|<labelN>]*}
//   Clicking an item immediately sends {<cmd>`N} and navigates back.
// Multi:   {*<cmd>[`<init>]*[~<prompt>]|<label0>[|<labelN>]*}
//   Tick button sends {<cmd>|N1[`N2...]} (or {<cmd>|} for none) and navigates back.
//
// State read:    document.body.className
// State written: document.body.className (selection-mode <-> message-mode)
// DOM elements:  #selection-container, #selection-list, #selection-prompt,
//                #selection-action-bar, #selection-submit-btn
// Depends on:    pfodSetFormattedText from pfodButtonRenderer.js (must load first),
//                parsePfodFormatCodes from pfodMenuParser.js (must load first)
// Called by:     responseHandlers:handleNonDwgResponse (show),
//                responseHandlers / toolbarAndMenu (hide)

class PfodSelectionDisplay {
  constructor() {
    this._cmd = '';
    this._isMulti = false;
    this._labels = [];
    this._selected = new Set();
    this._indicators = [];
    this._onSubmit = null;
    this._contrastHex = '';   // <bw> default text colour against screen background
    this._boundSubmit = this._handleSubmit.bind(this);
  }

  // Parse single-selection response: {?<cmd>[`<init>][~<prompt>]|<label>...}
  // cmdArray from pfodToJson split on '|': [{?cmd...}, |label0, |label1, ..., }]
  static parseSingle(cmdArray) {
    return PfodSelectionDisplay._parse(cmdArray, false);
  }

  // Parse multi-selection response: {*<cmd>[`<init>...][~<prompt>]|<label>...}
  static parseMulti(cmdArray) {
    return PfodSelectionDisplay._parse(cmdArray, true);
  }

  static _parse(cmdArray, isMulti) {
    const prefix = isMulti ? '{*' : '{?';
    const raw = cmdArray[0].slice(prefix.length); // strip "{?" or "{*"

    // Read cmd until ` or ~ or end
    let pos = 0;
    let cmd = '';
    while (pos < raw.length && raw[pos] !== '`' && raw[pos] !== '~') {
      cmd += raw[pos++];
    }

    // Read initial selection indices (one or more `N segments)
    const initialSelected = [];
    while (pos < raw.length && raw[pos] === '`') {
      pos++; // skip `
      let numStr = '';
      while (pos < raw.length && raw[pos] !== '`' && raw[pos] !== '~') {
        numStr += raw[pos++];
      }
      const n = parseInt(numStr, 10);
      if (!isNaN(n)) initialSelected.push(n);
    }

    // Read optional prompt after ~
    let prompt = '';
    if (pos < raw.length && raw[pos] === '~') {
      prompt = raw.slice(pos + 1);
    }

    // Labels from cmdArray[1..] — each element starts with '|'
    const labels = [];
    for (let i = 1; i < cmdArray.length; i++) {
      if (cmdArray[i].startsWith('|')) labels.push(cmdArray[i].slice(1));
    }

    return { cmd, prompt, initialSelected, labels, isMulti };
  }

  // Show the selection screen.
  // inputData: result of parseSingle() or parseMulti()
  // onSubmit(cmd, isMulti, sortedSelectedIndices): called to send response and navigate back
  show(inputData, onSubmit) {
    this._cmd = inputData.cmd;
    this._isMulti = inputData.isMulti;
    this._labels = inputData.labels;
    this._onSubmit = onSubmit;

    // Validate initial selection indices against label count
    this._selected = new Set(
      inputData.initialSelected.filter(n => n >= 0 && n < inputData.labels.length)
    );

    // Strip all <bg colorCode> tags from the prompt wherever they appear.
    // The last valid <bg> found sets the screen background; all are removed from the text.
    // Default background: black. Default text colour: <bw> against that background.
    let bgColor = '';
    const promptText = (inputData.prompt || '').replace(/<bg ([^>]+)>/g, function(match) {
      const color = parsePfodFormatCodes(match).bgColor;
      if (color) bgColor = color;
      return '';
    });
    // Cache screen bg for _buildList — per-option rows that don't
    // declare their own bg fall back to this for the auto-contrast
    // text colour calc.
    this._screenBg    = bgColor || '#000000';
    this._contrastHex = xtermColorToHex(getBlackWhite(this._screenBg));

    this._buildList();

    const container = document.getElementById('selection-container');
    if (container) container.style.backgroundColor = bgColor;

    const promptEl = document.getElementById('selection-prompt');
    if (promptEl) {
      pfodSetFormattedText(promptEl, promptText, this._contrastHex);
      promptEl.style.color = this._contrastHex;
    }

    const submitBtn = document.getElementById('selection-submit-btn');
    if (submitBtn) {
      if (this._isMulti) {
        submitBtn.style.display = 'flex';
        submitBtn.addEventListener('click', this._boundSubmit);
      } else {
        submitBtn.style.display = 'none';
      }
    }

    document.body.className = 'selection-mode';
  }

  // Clear selection-mode and reset state.
  hide() {
    if (document.body.className === 'selection-mode') {
      document.body.className = 'message-mode';
    }
    const list = document.getElementById('selection-list');
    if (list) list.innerHTML = '';
    const submitBtn = document.getElementById('selection-submit-btn');
    if (submitBtn) submitBtn.removeEventListener('click', this._boundSubmit);

    this._cmd = '';
    this._onSubmit = null;
    this._selected = new Set();
    this._labels = [];
    this._indicators = [];
    this._contrastHex = '';
  }

  isVisible() {
    return document.body.className === 'selection-mode';
  }

  // Build the scrollable list of labelled items with checkbox/radio indicators.
  _buildList() {
    const list = document.getElementById('selection-list');
    if (!list) return;
    list.innerHTML = '';
    this._indicators = [];

    this._labels.forEach((label, idx) => {
      const item = document.createElement('div');
      item.className = 'selection-item';

      // Parse the option's leading format prefix the same way a
      // menu-item button would — `<bg X>` for per-row background,
      // `<colorCode>` for sticky text colour, `<+N>` / `<-N>` for
      // font-size, `<b>` / `<i>` / `<u>` for sticky styles.  The
      // tags before the first non-format character apply to the
      // ENTIRE row; tags inside the remainder go through pfod-
      // SetFormattedText's inline-tag parser as before.  Mirrors
      // renderPfodButton's approach in pfodButtonRenderer.js so
      // single-selection rows render visually as button-style
      // items rather than plain text.
      const fmt  = parsePfodFormatCodes(label);
      const text = fmt.remaining;

      // applyPfodFormats sets bgColor / textColor (when non-null) /
      // bold / italic / underline / non-zero fontSize on the row.
      // Children inherit text-related styles, so the label span
      // below renders with the same colour / weight / size.
      applyPfodFormats(item, fmt);

      // Auto-contrast text colour against whatever bg the row
      // ended up with — explicit textColor wins, otherwise <bw>
      // against the row's bg (per-row when declared, else the
      // screen bg).
      const rowBg       = fmt.bgColor || this._screenBg;
      const rowContrast = xtermColorToHex(getBlackWhite(rowBg));
      if (!fmt.textColor) item.style.color = rowContrast;

      const labelEl = document.createElement('span');
      labelEl.className = 'selection-label';
      // Inline tags inside the remainder still go through the
      // text-renderer.  contrastHex resolves inline <bw> tags
      // against the row's bg (not the screen bg).
      pfodSetFormattedText(labelEl, text, rowContrast);

      const indicator = document.createElement('span');
      indicator.className = this._isMulti ? 'selection-checkbox' : 'selection-radio';
      if (this._selected.has(idx)) indicator.classList.add('selected');
      this._indicators.push(indicator);

      item.appendChild(labelEl);
      item.appendChild(indicator);
      item.addEventListener('click', () => this._handleItemClick(idx));
      list.appendChild(item);

      // Separator between items (not after last)
      if (idx < this._labels.length - 1) {
        const sep = document.createElement('div');
        sep.className = 'selection-separator';
        list.appendChild(sep);
      }
    });
  }

  _handleItemClick(idx) {
    if (this._isMulti) {
      if (this._selected.has(idx)) {
        this._selected.delete(idx);
        this._indicators[idx].classList.remove('selected');
      } else {
        this._selected.add(idx);
        this._indicators[idx].classList.add('selected');
      }
    } else {
      // Single selection: clicking submits immediately
      this._selected = new Set([idx]);
      this._handleSubmit();
    }
  }

  // Called when tick button clicked (multi) or item clicked (single).
  // Does NOT call hide() — responseHandlers does that when the device reply arrives.
  _handleSubmit() {
    if (this._onSubmit) {
      const sorted = Array.from(this._selected).sort((a, b) => a - b);
      this._onSubmit(this._cmd, this._isMulti, sorted);
    }
  }
}

window.pfodSelectionDisplay = new PfodSelectionDisplay();
