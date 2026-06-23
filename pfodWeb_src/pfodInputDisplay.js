/*
   pfodInputDisplay.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Manages the full-screen text input display (input-mode) for pfod Section 10 string input.
// Assigned to window.pfodInputDisplay as a singleton after class definition.
//
// pfod format: {'<cmd>[`<maxLen>][~<prompt>][|<initialText>]}
// Submission sends: {<cmd>~<newText>} as a 'touch' request.
//
// State read:    document.body.className
// State written: document.body.className (input-mode <-> message-mode)
// DOM elements:  #input-container, #input-textarea, #input-prompt,
//                #input-popup, #input-popup-text, #input-submit-btn, #input-exit-btn
// Depends on:    pfodSetFormattedText from pfodButtonRenderer.js (must load first),
//                parsePfodFormatCodes from pfodMenuParser.js (must load first),
//                xtermColorToHex, getBlackWhite from redraw.js (must load first)
// Called by:     responseHandlers:handleNonDwgResponse (show),
//                responseHandlers:handleNonDwgResponse / handleDwgResponse / toolbarAndMenu (hide)

// Default background colour for text-input screens that supply no
// `<bg ...>` tag in their prompt — same black the CSS default for
// #input-container would have shown.  Declared at top-of-file so
// show() can initialise `bgColor` with it up-front, and the contrast
// calculation never needs an inline `||` fallback.
const PFOD_INPUT_DEFAULT_BG = '#000000';

class PfodInputDisplay {
  constructor() {
    this._encoder = new TextEncoder();
    this._decoder = new TextDecoder('utf-8', { fatal: false });
    this._cmd = '';
    this._maxLen = 255;
    this._onSubmit = null;
    this._popupTimer = null;
    // Bound handlers stored so they can be removed on hide()
    this._boundHandleInput = this._handleInput.bind(this);
    this._boundHandleSubmit = this._handleSubmit.bind(this);
    this._boundHandleKeydown = this._handleKeydown.bind(this);
  }

  // Pure static parser — no DOM access.
  // cmdArray[0]: "{'<cmd>[`<maxLen>][~<prompt>]"
  // cmdArray[1]: "|<initialText>" (optional, from pfodToJson splitting on '|')
  static parse(cmdArray) {
    const part0 = cmdArray[0]; // e.g. "{'x`11~Edit the message"
    let pos = 2; // skip {'
    // Read cmd chars until backtick, tilde, or end
    let cmd = '';
    while (pos < part0.length && part0[pos] !== '`' && part0[pos] !== '~') {
      cmd += part0[pos++];
    }
    // Default maxLen: 255 minus overhead of {cmd~} = 255 - cmd.length - 3
    let maxLen = 255 - cmd.length - 3;
    if (pos < part0.length && part0[pos] === '`') {
      pos++; // skip backtick
      let lenStr = '';
      while (pos < part0.length && part0[pos] !== '~') {
        lenStr += part0[pos++];
      }
      const parsed = parseInt(lenStr, 10);
      if (!isNaN(parsed)) {
        maxLen = parsed;
      }
    }
    let prompt = '';
    if (pos < part0.length && part0[pos] === '~') {
      pos++; // skip tilde
      prompt = part0.substring(pos);
    }
    let initialText = '';
    if (cmdArray[1] && cmdArray[1].startsWith('|')) {
      initialText = cmdArray[1].substring(1);
    }
    return { cmd, maxLen, prompt, initialText };
  }

  // Show the input screen.
  // inputData: result of PfodInputDisplay.parse()
  // onSubmit(cmd, text): called when user taps checkmark — sends text then navigates back
  show(inputData, onSubmit) {
    const textarea = document.getElementById('input-textarea');
    const promptEl = document.getElementById('input-prompt');
    const popup = document.getElementById('input-popup');
    const popupText = document.getElementById('input-popup-text');
    const submitBtn = document.getElementById('input-submit-btn');

    this._cmd = inputData.cmd;
    this._maxLen = inputData.maxLen;
    this._onSubmit = onSubmit;

    textarea.value = inputData.initialText || '';

    // Strip all <bg colorCode> tags from the prompt wherever they appear.
    // The last valid <bg> found sets the screen background; all are removed from the text.
    // Default background: PFOD_INPUT_DEFAULT_BG (top of file).  Default
    // text colour: <bw> against that background.
    let bgColor = PFOD_INPUT_DEFAULT_BG;
    const promptText = (inputData.prompt || '').replace(/<bg ([^>]+)>/g, function(match) {
      const color = parsePfodFormatCodes(match).bgColor;
      if (color) bgColor = color;
      return '';
    });
    // Apply bgColor to the container AND to the prompt.  The textarea
    // is deliberately left alone — it always renders with the CSS
    // default (`background: black; color: white`) regardless of the
    // device's `<bg ...>`, so the input area stays high-contrast and
    // legible across all themes.
    const container = document.getElementById('input-container');
    if (container) container.style.backgroundColor = bgColor;
    promptEl.style.backgroundColor = bgColor;
    const contrastHex = xtermColorToHex(getBlackWhite(bgColor));
    pfodSetFormattedText(promptEl, promptText, contrastHex);
    promptEl.style.color = contrastHex;

    // Show transient byte-limit popup if maxLen was explicitly provided (not default)
    // We detect an explicit maxLen by checking if the original cmd array element contained a backtick.
    // The parse() result doesn't carry this flag, so we show popup whenever maxLen < default.
    const defaultMaxLen = 255 - inputData.cmd.length - 3;
    if (inputData.maxLen < defaultMaxLen) {
      popupText.textContent = 'Length of text limited to ' + inputData.maxLen;
      popup.style.display = 'flex';
      if (this._popupTimer) {
        clearTimeout(this._popupTimer);
      }
      this._popupTimer = setTimeout(() => {
        popup.style.display = 'none';
        this._popupTimer = null;
      }, 4000);
    } else {
      popup.style.display = 'none';
    }

    textarea.addEventListener('input', this._boundHandleInput);
    submitBtn.addEventListener('click', this._boundHandleSubmit);
    document.addEventListener('keydown', this._boundHandleKeydown);

    document.body.className = 'input-mode';
    textarea.focus();
  }

  // Clear input-mode and reset state.
  // Only switches body class if currently in input-mode.
  hide() {
    if (document.body.className === 'input-mode') {
      document.body.className = 'message-mode';
    }
    if (this._popupTimer) {
      clearTimeout(this._popupTimer);
      this._popupTimer = null;
    }
    const textarea = document.getElementById('input-textarea');
    const submitBtn = document.getElementById('input-submit-btn');
    const popup = document.getElementById('input-popup');
    if (textarea) {
      textarea.removeEventListener('input', this._boundHandleInput);
      textarea.value = '';
    }
    if (submitBtn) {
      submitBtn.removeEventListener('click', this._boundHandleSubmit);
    }
    if (popup) {
      popup.style.display = 'none';
    }
    document.removeEventListener('keydown', this._boundHandleKeydown);
    this._cmd = '';
    this._onSubmit = null;
  }

  isVisible() {
    return document.body.className === 'input-mode';
  }

  // Convert \uXXXX escape sequences and enforce byte limit.
  _handleInput() {
    const textarea = document.getElementById('input-textarea');
    let val = textarea.value;
    const selStart = textarea.selectionStart;

    // Auto-convert \uXXXX sequences to actual Unicode chars
    let cursorShift = 0;
    val = val.replace(/\\u([0-9a-fA-F]{4})/g, (match, hex, offset) => {
      const ch = String.fromCodePoint(parseInt(hex, 16));
      // Each 6-char escape replaced by 1 char = net -5 shift if before cursor
      if (offset < selStart - cursorShift) {
        cursorShift += 5; // match.length(6) - ch.length(1)
      }
      return ch;
    });

    // Enforce byte limit
    const encoded = this._encoder.encode(val);
    if (encoded.length > this._maxLen) {
      val = this._decoder.decode(encoded.slice(0, this._maxLen));
    }

    if (val !== textarea.value) {
      textarea.value = val;
      const newCursor = Math.max(0, selStart - cursorShift);
      textarea.setSelectionRange(newCursor, newCursor);
    }
  }

  // Called when user taps the checkmark button.
  // Does NOT call hide() — the device response handler does that.
  // Per spec, the USER is responsible for escaping restricted pfod characters.
  // If pfodWeb were to auto-escape, it would do so as follows (& must be first):
  //   text = text
  //     .replace(/&/g,  '&amp;')
  //     .replace(/`/g,  '&#96;')
  //     .replace(/\{/g, '&#123;')
  //     .replace(/\|/g, '&#124;')
  //     .replace(/\}/g, '&#125;')
  //     .replace(/~/g,  '&#126;')
  //     .replace(/\\/g, '&#92;')
  //     .replace(/</g,  '&lt;');
  _handleSubmit() {
    if (this._onSubmit) {
      const textarea = document.getElementById('input-textarea');
      this._onSubmit(this._cmd, textarea ? textarea.value : '');
    }
  }

  _handleKeydown(e) {
    // No key shortcuts — user uses the toolbar back button or submit button.
  }
}

window.pfodInputDisplay = new PfodInputDisplay();
