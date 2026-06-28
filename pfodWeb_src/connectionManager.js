/*
   connectionManager.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// ConnectionManager — manages HTTP/Serial/BLE connections to pfod devices.
// Also defines pfodAlert(), the shared styled modal used throughout the app.
//
// Exports:    window.ConnectionManager class, window.pfodAlert(message, onClose) function
// Depends on: window.messageCollector, window.csvCollector, window.rawDataCollector
//             (set via ConnectionManager.setMessageCollector/setCSVCollector/setRawDataCollector)
// Called by:  pfodWeb.js constructor (new ConnectionManager(config) → this.connectionManager),
//             requestQueue.js (this.connectionManager.send(), getMaxRetries()),
//             keepAlive.js (reads connectionManager.protocol),
//             connectionSetup.js (builds config, calls adapter methods),
//             keepAliveAndHttp.js (ConnectionManager.setMessageCollector etc. static calls)

/**
 * Resolve after at least ms milliseconds. Used to enforce a minimum gap
 * between retry attempts (see each adapter's send() retry loop) so a
 * struggling device/link isn't hammered with back-to-back requests
 * regardless of which error triggered the retry.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Custom alert modal with pfodWeb branding
 * Shows a styled modal dialog positioned lower on the page
 * @param {string} message - The message to display
 * @param {function} onClose - Optional callback when Close button is clicked
 */
function pfodAlert(message, onClose = null) {
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 150px;
    z-index: 10000;
  `;

  // Create modal box
  const modal = document.createElement('div');
  modal.style.cssText = `
    background-color: white;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    max-width: 500px;
    width: 90%;
    overflow: hidden;
  `;

  // Create title bar
  const titleBar = document.createElement('div');
  titleBar.style.cssText = `
    background-color: #4CAF50;
    color: white;
    padding: 15px 20px;
    font-size: 18px;
    font-weight: bold;
    font-family: Arial, sans-serif;
  `;
  titleBar.textContent = 'pfodWeb';

  // Create message area
  const messageArea = document.createElement('div');
  messageArea.style.cssText = `
    padding: 20px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #333;
    white-space: pre-line;
  `;
  messageArea.textContent = message;

  // Assemble modal
  modal.appendChild(titleBar);
  modal.appendChild(messageArea);

  // Add Close button if callback provided
  if (onClose) {
    const buttonArea = document.createElement('div');
    buttonArea.style.cssText = `
      padding: 0 20px 20px 20px;
      text-align: center;
    `;

    const closeButton = document.createElement('button');
    closeButton.textContent = 'Close';
    closeButton.style.cssText = `
      background-color: #4CAF50;
      color: white;
      padding: 10px 30px;
      border: none;
      border-radius: 5px;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      font-family: Arial, sans-serif;
    `;
    const closeAction = () => {
      document.body.removeChild(overlay);
      onClose();
    };
    closeButton.onclick = closeAction;

    // Add Enter key handler for the overlay
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        closeAction();
      }
    });

    buttonArea.appendChild(closeButton);
    modal.appendChild(buttonArea);

    // Focus the close button so Enter key works immediately
    setTimeout(() => closeButton.focus(), 100);
  }

  overlay.appendChild(modal);

  // Add to page
  document.body.appendChild(overlay);
}

/**
 * Shared dedup mechanism - used by all connection protocols
 * Rotating character prepended to commands to detect duplicates
 * Each send() call atomically gets a unique dedup character
 * Retries reuse the same cached dedup for that send() call
 */
let dedupCounter = 0;
const dedupChars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * Get next dedup character - increments atomically
 * Each call guarantees a unique character for that send() call
 * Retries must cache and reuse the returned character
 * @returns {string} - The next dedup character
 */
function getCurrentDedupChar() {
  const char = dedupChars[dedupCounter];
  dedupCounter = (dedupCounter + 1) % dedupChars.length;
  return char;
}

/**
 * Find the index of the closing brace that matches the opening brace at startIdx
 * Handles nested braces by counting depth
 * @param {string} text - The text to search
 * @param {number} startIdx - Index of opening brace
 * @returns {number} Index of matching closing brace, or -1 if not found
 */
function findMatchingClosingBrace(text, startIdx) {
  if (startIdx < 0 || startIdx >= text.length || text[startIdx] !== '{') {
    return -1;
  }

  let depth = 0;
  for (let i = startIdx; i < text.length; i++) {
    if (text[i] === '{') {
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1; // No matching closing brace found
}

/**
 * ConnectionManager - Unified connection abstraction for multiple protocols
 *
 * Provides a protocol-agnostic interface for communicating with pfod devices.
 * Currently supports: HTTP, Serial, BLE
 */
class ConnectionManager {
  // Static message collector shared across all connection managers
  static messageCollector = null;
  // Static CSV collector shared across all connection managers
  static csvCollector = null;
  // Static raw data collector shared across all connection managers
  static rawDataCollector = null;

  static setMessageCollector(collector) {
    ConnectionManager.messageCollector = collector;
    console.log('[CONNECTION_MANAGER] Message collector set');
  }

  static setCSVCollector(collector) {
    ConnectionManager.csvCollector = collector;
    console.log('[CONNECTION_MANAGER] CSV collector set');
  }

  static setRawDataCollector(collector) {
    ConnectionManager.rawDataCollector = collector;
    console.log('[CONNECTION_MANAGER] Raw data collector set');
  }

  constructor(config = {}) {
    this.protocol = config.protocol || 'http';
    this.adapter = null;
    this.config = config;

    // Response timeout configuration
    // Default is 10 seconds; 0 means never timeout (no timer set).
    const timeoutSeconds = config.responseTimeoutSec !== undefined ? config.responseTimeoutSec : 10;

    // Validate and constrain timeout: 0-30 seconds
    const validatedTimeout = Math.max(0, Math.min(30, timeoutSeconds));

    // 0 = never timeout (responseTimeoutMs === 0); otherwise convert to ms.
    this.responseTimeoutMs = validatedTimeout * 1000;
    console.log(`[CONNECTION_MANAGER] Response timeout set to ${validatedTimeout === 0 ? 'never' : validatedTimeout + ' seconds'}`);

    // KeepAlive interval (TCP/IP Socket only).  Connection-prompt
    // dropdown offers 0/5/10/20/30 — 0 means disabled.  60 s is the
    // hard upper bound (no use-case beyond it; clamp guards against
    // bogus URL params).  Other transports ignore this field.
    const keepAliveRaw = config.keepAliveSec !== undefined ? config.keepAliveSec : 0;
    this.keepAliveSec = Math.max(0, Math.min(60, parseInt(keepAliveRaw, 10) || 0));
    if (this.protocol === 'tcp') {
      console.log(`[CONNECTION_MANAGER] keepAliveSec=${this.keepAliveSec}`);
    }

    // Set up max retries based on protocol.  Applies to both native
    // adapters (HTTPConnection, SerialConnection, BLEConnection) and
    // their proxy peers (SerialProxyConnection via 'serial',
    // BLEProxyConnection via 'ble', TCPProxyConnection via 'tcp').
    //   BLE     = 1 (unreliable radio, fail fast)
    //   HTTP    = 2 (network, can be slow)
    //   Serial  = 2 (DTR-reset / bootloader window may eat first cmd)
    //   TCP     = 2 (network via proxy, same retry budget as HTTP)
    const retryConfig = {
      'ble':      1,
      'http':     2,
      'serial':   2,
      'tcp':      2,
      'designer': 0  // in-browser virtual device; nothing to retry
    };
    // Use explicit check for protocol key to handle 0 values correctly, default to 0
    this.maxRetries = (this.protocol in retryConfig) ? retryConfig[this.protocol] : 0;
    console.log(`[CONNECTION_MANAGER] Max retries set to ${this.maxRetries} for protocol: ${this.protocol}`);

    console.log(`[CONNECTION_MANAGER] Creating connection manager with protocol: ${this.protocol}`);

    // Initialize the appropriate protocol adapter
    this.initializeAdapter();
  }

  initializeAdapter() {
    switch(this.protocol) {
      case 'http':
        this.adapter = new HTTPConnection(this.config, this);
        console.log(`[CONNECTION_MANAGER] Initialized HTTP adapter with targetIP: ${this.config.targetIP}`);
        break;

      case 'serial':
        // Proxy always used — native Web Serial API path disabled.
        this.adapter = new SerialProxyConnection(this.config, this);
        console.log(`[CONNECTION_MANAGER] Initialized SerialProxy adapter via ${this.config.proxyHostPort} for ${this.config.serialPath} @ ${this.config.baudRate} baud`);
        break;

      case 'ble':
        // Proxy always used — native Web Bluetooth API path disabled.
        this.adapter = new BLEProxyConnection(this.config, this);
        console.log(`[CONNECTION_MANAGER] Initialized BLEProxy adapter via ${this.config.proxyHostPort} for ${this.config.bleAddress}`);
        break;

      case 'tcp':
        // TCP/IP Socket — always via pfodProxy (browsers can't open raw
        // TCP sockets).  Proxy holds the persistent socket; we speak HTTP
        // to it with ?ip=&port= query params identifying the device.
        this.adapter = new TCPProxyConnection(this.config, this);
        console.log(`[CONNECTION_MANAGER] Initialized TCPProxy adapter via ${this.config.proxyHostPort} for ${this.config.targetIP}:${this.config.targetPort}`);
        break;

      case 'designer':
        // In-browser virtual pfod device.  No wire, no proxy — pfod
        // commands are routed through a DesignerVirtualDevice (see
        // designer/index.js) that emits the designer-app menus from a
        // chosen board model.  Default board is the Uno + Serial pair
        // baked into designer/boards/Uno/Uno.json.
        this.adapter = new DesignerVirtualAdapter(this.config, this);
        console.log('[CONNECTION_MANAGER] Initialized DesignerVirtualAdapter (in-browser virtual device)');
        break;

      default:
        throw new Error(`Unknown protocol: ${this.protocol}`);
    }
  }

  /**
   * Send a command to the device and get response
   * @param {string} cmd - The pfod command (e.g., "{.}" or "{dwgName}")
   * @returns {Promise<string>} - Response text (usually JSON)
   */
  async send(cmd, respCallbacks) {
    if (!this.adapter) {
      throw new Error('No adapter initialized');
    }

    console.log(`[CONNECTION_MANAGER] Sending command: ${cmd}`);

    // Option B: hand the active adapter the per-request callbacks the byte
    // boundary uses to decide raw-vs-valid-response and to apply ~C.  Bound
    // to THIS request by the queue; consumed/cleared in processReadBuffer
    // when the valid response is matched.  Overwritten every send so a
    // stale bundle can't outlive its request.
    this.adapter._respCallbacks = respCallbacks || null;

    // {!} is always fire-and-forget — send without waiting for a device response.
    // Caller (processRequestQueue exitAbort path) handles screen transition after this returns.
    if (cmd === '{!}') {
      await this.sendAbort();
      return '';
    }

    const response = await this.adapter.send(cmd);
    console.log(`[CONNECTION_MANAGER] Received response (${response.length} bytes)`);

    return response;
  }

  /**
   * Connect to the device (if needed for the protocol)
   */
  async connect() {
    if (this.adapter && this.adapter.connect) {
      console.log(`[CONNECTION_MANAGER] Connecting via ${this.protocol}...`);
      await this.adapter.connect();
      console.log(`[CONNECTION_MANAGER] Connected`);
    }
  }

  /**
   * Disconnect from the device (if needed for the protocol)
   */
  async disconnect() {
    if (this.adapter && this.adapter.disconnect) {
      console.log(`[CONNECTION_MANAGER] Disconnecting...`);
      await this.adapter.disconnect();
      console.log(`[CONNECTION_MANAGER] Disconnected`);
    }
  }

  /**
   * Get a stable identifier string for this connection endpoint.
   * Used as the localStorage key for menu caching (PfodMenuCache).
   *
   * @returns {string} Identifier of the form 'http_<ip>', 'serial_<port>', or 'ble_<name>'
   */
  getConnectionId() {
    switch (this.protocol) {
      case 'http': {
        const rawIP = this.config.targetIP || 'unknown';
        const colonIdx = rawIP.lastIndexOf(':');
        const httpHost = colonIdx > 0 ? rawIP.slice(0, colonIdx) : rawIP;
        const httpPort = colonIdx > 0 ? rawIP.slice(colonIdx + 1) : '80';
        return 'http_' + httpHost + '_' + httpPort;
      }
      case 'serial':
        // Use the cache-stable id (COMn when known, otherwise VID/PID hex)
        // so per-USB-device cache entries stay separate even when Chrome
        // doesn't expose the COM port number.
        return 'serial_' + (this.adapter
          ? (this.adapter.cachePortId || this.adapter.portName || 'unknown')
          : 'unknown');
      case 'ble':
        // BLEProxyConnection carries bleAddress set from config.bleAddress.
        return 'ble_' + (this.adapter ? (this.adapter.bleAddress || 'unknown') : 'unknown');
      case 'tcp':
        return 'tcp_' + (this.config.targetIP || 'unknown') + '_' + this.config.targetPort;
      case 'designer':
        // In-browser virtual device — keyed by the active design name
        // so the per-design pfod-menu cache stays separate from the
        // designer-state localStorage (DesignerState owns that one).
        // adapter + device + state + name are all guaranteed by the
        // DesignerVirtualAdapter / DesignerVirtualDevice / DesignerState
        // constructors — no fallback path.
        return 'designer_' + this.adapter.device.state.name;
      default:
        return 'unknown';
    }
  }

  /**
   * Check if connection is active
   */
  isConnected() {
    if (this.adapter && this.adapter.isConnected) {
      return this.adapter.isConnected();
    }
    return true; // HTTP doesn't need explicit connection
  }

  /**
   * Get response timeout in milliseconds for waiting for device response
   * Returns the configured timeout value
   * @returns {number} - Timeout in milliseconds
   */
  getResponseTimeout() {
    return this.responseTimeoutMs;
  }

  /**
   * Get the configured keepAlive interval, in seconds, for TCP/IP
   * connections.  0 means keepAlive is disabled.  Other transports may
   * call this safely but are expected to ignore the value (only the
   * keepAlive scheduler in keepAlive.js consults it, and it is gated
   * on protocol === 'tcp' in startKeepAlivePolling()).
   * @returns {number} - keepAlive interval in seconds (0 = disabled)
   */
  getKeepAliveSec() {
    return this.keepAliveSec;
  }

  /**
   * Get max retries for the current connection protocol
   * @returns {number} - Max retries (BLE: 1, HTTP: 2, Serial: 3)
   */
  getMaxRetries() {
    return this.maxRetries;
  }

  /**
   * Force re-engage the serial connection (for serial protocol only)
   * Closes and reopens the port to reset stuck communication
   * Returns false for non-serial protocols or if reconnect fails
   * @returns {Promise<boolean>} - true if reconnect succeeded, false otherwise
   */
  async forceReengageSerial() {
    if (this.protocol !== 'serial' || !this.adapter || !this.adapter.forceReconnect) {
      console.log(`[CONNECTION_MANAGER] forceReengageSerial: not a serial connection (protocol=${this.protocol})`);
      return false;
    }

    console.log('[CONNECTION_MANAGER] Force re-engaging serial connection');
    try {
      const result = await this.adapter.forceReconnect();
      return result;
    } catch (error) {
      console.error('[CONNECTION_MANAGER] Force re-engage failed:', error);
      return false;
    }
  }

  /**
   * Fire {!} via the adapter's own dedicated sendAbort() — fire-and-forget,
   * no response wait, keepalive:true so it survives a page unload (Exit's
   * reload, or a tab close). NOT the adapter's generic send() — that path
   * waits for a response with a non-keepalive fetch, which Exit's reload
   * (already in flight on the same call stack) reliably cancels before the
   * device ever receives it. Every adapter that's actually ever
   * constructed (HTTPConnection, and SerialProxyConnection/
   * BLEProxyConnection/TCPProxyConnection via their ProxyStreamConnection
   * base) has this method — Serial/BLE always go via pfodProxy, even on
   * browsers with native Web Serial/Web Bluetooth (see the native
   * SerialConnection/BLEConnection classes' own "NOT USED — proxy only"
   * comments at the bottom of this file).
   */
  async sendAbort() {
    if (!this.adapter) return;
    this.adapter.sendAbort().catch(() => {});
  }
}

/**
 * PfodConnectionBase - Shared pfod protocol parsing for HTTP, Serial and BLE
 *
 * Provides pfodToJson() and processReadBuffer() used identically by all three
 * connection types.  Each subclass sets this.protocol ('http'|'serial'|'ble')
 * so that messageCollector entries are labelled correctly.
 */
class PfodConnectionBase {
  /// Show a modal "Connecting to <device>..." overlay with a
  /// rotating spinner.  Used by both proxy adapters (driven by
  /// proxy-emitted `progress` SSE events) and the native BLE
  /// adapter (driven by JS `await` boundaries between gatt.connect /
  /// getPrimaryService / startNotifications).  Idempotent.
  /// @param {string|null} name    — device name (shown on first line after "Connecting to")
  /// @param {string}      address — device address/UUID (shown on second line when name present)
  _showConnectingDialog(name, address) {
    if (document.getElementById('proxy-connect-overlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'proxy-connect-overlay';
    overlay.style.cssText =
      'position:fixed; inset:0; background:rgba(0,0,0,0.4);' +
      ' z-index:10001; display:flex; align-items:center;' +
      ' justify-content:center; font-family:Arial,sans-serif;';
    const panel = document.createElement('div');
    panel.style.cssText =
      'background:white; border-radius:8px;' +
      ' box-shadow:0 8px 32px rgba(0,0,0,0.25);' +
      ' padding:24px 28px; min-width:280px; text-align:center;';
    if (!document.getElementById('proxy-connect-spinner-style')) {
      const style = document.createElement('style');
      style.id = 'proxy-connect-spinner-style';
      style.textContent =
        '@keyframes proxyConnectSpin { to { transform: rotate(360deg); } }';
      document.head.appendChild(style);
    }
    const spinner = document.createElement('div');
    spinner.style.cssText =
      'width:36px; height:36px; margin:0 auto 14px;' +
      ' border:4px solid #e0e0e0; border-top-color:#4078ff;' +
      ' border-radius:50%;' +
      ' animation: proxyConnectSpin 0.9s linear infinite;';
    panel.appendChild(spinner);
    const title = document.createElement('div');
    title.style.cssText = 'font-size:14px; font-weight:600; margin-bottom:6px;';
    title.textContent = 'Connecting to ' + (name || address || 'device') + '…';
    if (name && address) {
      const addrLine = document.createElement('div');
      addrLine.style.cssText = 'font-size:11px; color:#888; font-weight:normal; margin-top:2px;';
      addrLine.textContent = address;
      title.appendChild(addrLine);
    }
    panel.appendChild(title);
    const status = document.createElement('div');
    status.id = 'proxy-connect-status';
    status.style.cssText = 'font-size:12px; color:#666;';
    // Neutral until the proxy actually confirms it's scanning (a real
    // "scanning" progress event) — showing "Scanning for device…" here
    // unconditionally was misleading when pfodProxy isn't even running.
    status.textContent = 'Connecting to proxy…';
    panel.appendChild(status);
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText =
      'margin-top:14px; padding:6px 20px; font-size:12px; cursor:pointer;' +
      ' border:1px solid #ccc; border-radius:4px; background:#f5f5f5;';
    cancelBtn.onclick = () => { if (this._cancelConnect) this._cancelConnect(); };
    panel.appendChild(cancelBtn);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  _updateConnectingDialogName(name, address) {
    const title = document.querySelector('#proxy-connect-overlay div div');
    if (!title) return;
    title.childNodes[0].textContent = 'Connecting to ' + name + '…';
    let addrLine = title.querySelector('.proxy-connect-addr');
    if (!addrLine) {
      addrLine = document.createElement('div');
      addrLine.className = 'proxy-connect-addr';
      addrLine.style.cssText = 'font-size:11px; color:#888; font-weight:normal; margin-top:2px;';
      title.appendChild(addrLine);
    }
    addrLine.textContent = address;
  }

  _updateConnectingDialog(step) {
    const status = document.getElementById('proxy-connect-status');
    if (!status) return;
    const labels = {
      scanning:    'Scanning for device…',
      connecting:  'Connecting (BLE link setup)…',
      discovering: 'Discovering services…',
      subscribing: 'Subscribing to notifications…',
    };
    status.textContent = labels[step] || step;
  }

  _hideConnectingDialog() {
    this._cancelConnect = null;
    const overlay = document.getElementById('proxy-connect-overlay');
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  }

  /**
   * Convert a pfod command string into the {"cmd":[...]} JSON format expected
   * by pfodWeb.js.
   * e.g. "{,~`0~V2|+A~z}" -> '{"cmd":["{,~`0~V2","|+A~z","}"]}'
   *
   * @param {string} pfodString - complete pfod command from { to }
   * @returns {string} JSON string
   */
  pfodToJson(pfodString) {
    const cmdArray = [];
    let currentElement = '';

    for (let i = 0; i < pfodString.length; i++) {
      const char = pfodString[i];
      if (char === '|' || char === '}') {
        if (currentElement.length > 0) {
          cmdArray.push(currentElement);
        }
        currentElement = char;
        if (char === '}') {
          cmdArray.push(currentElement);
          currentElement = '';
        }
      } else {
        currentElement += char;
      }
    }
    if (currentElement.length > 0) {
      cmdArray.push(currentElement);
    }
    return JSON.stringify({ cmd: cmdArray });
  }

  /**
   * Scan this.readBuffer for a complete pfod {..} command.
   * Text before { is logged to messageCollector.
   * When a complete command is found, pfodToJson() is called and
   * this.responseResolve() is called with the JSON string.
   * The buffer is trimmed to whatever follows the closing }.
   */
  // Feed an OUTSIDE (raw / CSV) text segment, in stream order, to the data
  // collectors and (optionally) the Raw Message viewer.  Collectors are NO
  // LONGER pre-fed the whole chunk by processIncoming — they only ever see
  // true OUTSIDE bytes, exactly between the {..} commands, so a {=..~C..}
  // clear (applied at the command boundary) drops only data that arrived
  // BEFORE it.
  _emitRaw(str, opts) {
    if (!str) return;
    const o = opts || {};
    const toCsv    = o.csv    !== false;
    const toRaw    = o.raw    !== false;
    const toViewer = o.viewer !== false;
    if (toCsv && ConnectionManager.csvCollector)     ConnectionManager.csvCollector.processCharacters(str);
    if (toRaw && ConnectionManager.rawDataCollector) ConnectionManager.rawDataCollector.processCharacters(str);
    if (toViewer && ConnectionManager.messageCollector) {
      ConnectionManager.messageCollector.addMessage('received', str, this.protocol);
    }
  }

  processReadBuffer() {
    if (this.readBuffer.length === 0) return;

    // Treat the readBuffer as a UTF-8 byte stream — pfod is byte-oriented
    // and the 1024-byte cmd cap from the spec counts wire bytes, not JS
    // string chars (`°` is 1 char / 2 bytes).  Decoder uses fatal:false so
    // a partial UTF-8 sequence at any cut becomes U+FFFD instead of
    // throwing.
    //
    // Single in-order state machine: OUTSIDE (raw → collectors) until a
    // '{' → INSIDE (command bytes) until '}' or the 1024 cap → OUTSIDE.
    // The command is processed COMPLETELY before the loop returns to the
    // stream for the bytes that follow it, so a {=..~C..} clear lands
    // between the old and the new data.  Each completed command, when it is
    // a *valid response to the pending request* (the byte boundary owns
    // that decision via the injected _respCallbacks), applies ~C
    // synchronously then resolves; otherwise it is treated as raw data and
    // the pending request is left waiting (times out / retries as before).
    const PFOD_MAX_BYTES = 1024;
    const enc = new TextEncoder();
    const dec = new TextDecoder('utf-8', { fatal: false });

    while (this.readBuffer.length > 0) {
      const bytes = enc.encode(this.readBuffer);

      // ── OUTSIDE: bytes before the next '{' are raw data → emit in order.
      let startIdx = 0;
      while (startIdx < bytes.length && bytes[startIdx] !== 0x7B /* '{' */) {
        startIdx++;
      }
      if (startIdx > 0) {
        this._emitRaw(dec.decode(bytes.subarray(0, startIdx)));
      }
      if (startIdx >= bytes.length) {
        // No '{' — whole buffer was raw and is now emitted.
        this.readBuffer = '';
        return;
      }

      // ── OUTSIDE → INSIDE: discard any partial CSV line.  Bytes before a
      // command are raw-only (already sent to rawData/messageCollector via
      // _emitRaw above); they must never become a CSV line nor glue onto
      // the bytes that follow the command.
      if (ConnectionManager.csvCollector) ConnectionManager.csvCollector.resetLine();

      // ── INSIDE: '}' within the 1024 cap, or auto-close at the cap.
      let endIdx = -1;
      const scanLimit = Math.min(bytes.length, startIdx + PFOD_MAX_BYTES);
      for (let i = startIdx; i < scanLimit; i++) {
        if (bytes[i] === 0x7D /* '}' */) { endIdx = i; break; }
      }

      let pfodBytes;
      let consumedThrough;
      let autoClosed = false;
      let excessRawStr = null;

      if (endIdx !== -1) {
        pfodBytes       = bytes.subarray(startIdx, endIdx + 1);
        consumedThrough = endIdx + 1;
      } else if ((bytes.length - startIdx) >= PFOD_MAX_BYTES) {
        // ≥1024 bytes, no '}'.  Keep the first 1023 wire bytes + an
        // implicit '}' as byte 1024.  The tail (bytes after 1024, up to &
        // including any late '}') is OUTSIDE raw — fed to the collectors
        // after the command, in order; anything past that '}' loops on.
        autoClosed = true;
        pfodBytes  = new Uint8Array(PFOD_MAX_BYTES);
        pfodBytes.set(bytes.subarray(startIdx, startIdx + PFOD_MAX_BYTES - 1));
        pfodBytes[PFOD_MAX_BYTES - 1] = 0x7D;

        const tailStart = startIdx + PFOD_MAX_BYTES;
        let tailEnd     = -1;
        for (let i = tailStart; i < bytes.length; i++) {
          if (bytes[i] === 0x7D) { tailEnd = i; break; }
        }
        let rawTailBytes;
        if (tailEnd !== -1) {
          rawTailBytes    = bytes.subarray(tailStart, tailEnd + 1);
          consumedThrough = tailEnd + 1;
        } else {
          rawTailBytes    = bytes.subarray(tailStart);
          consumedThrough = bytes.length;
        }
        if (rawTailBytes.length > 0) {
          excessRawStr = dec.decode(rawTailBytes);
        }
        console.error(`[${this.protocol.toUpperCase()}_CONNECTION] pfod cmd ≥${PFOD_MAX_BYTES} bytes without closing brace — auto-closed with implicit }; ${rawTailBytes.length} byte(s) of tail truncated from the command and logged after it as a separate raw-data message`);
      } else {
        // INSIDE, no '}' yet, < 1024 bytes — keep from '{' (partial
        // serial/BLE frame) and wait for the next chunk.
        this.readBuffer = dec.decode(bytes.subarray(startIdx));
        return;
      }

      const pfodString = dec.decode(pfodBytes);
      this.readBuffer  = dec.decode(bytes.subarray(consumedThrough));

      const receiveTime = Date.now();
      const elapsedMs   = this.sendTime ? (receiveTime - this.sendTime) : 0;
      console.log(`[${this.protocol.toUpperCase()}_CONNECTION] Received complete pfod command after ${elapsedMs}ms${autoClosed ? ' (auto-closed)' : ''}:`, pfodString);

      const jsonString = this.pfodToJson(pfodString);

      if (ConnectionManager.messageCollector) {
        ConnectionManager.messageCollector.addMessage('received', pfodString, this.protocol);
        if (excessRawStr !== null) {
          ConnectionManager.messageCollector.addMessage('excess >1024', excessRawStr, this.protocol);
        }
      }

      // ── INSIDE → OUTSIDE.  The byte boundary owns the valid-response
      // decision via the queue-supplied callbacks (Option B).  Valid only
      // when there is a pending request AND its requestType accepts this
      // command's shape.
      const cb = this._respCallbacks;
      let validResponse = false;
      if (cb && this.responseResolve) {
        try {
          validResponse = !!cb.isValidResponse(jsonString);
        } catch (e) {
          console.error('[STREAM] isValidResponse threw — treating cmd as raw:', e && e.message);
          validResponse = false;
        }
      }

      if (validResponse) {
        // Apply ~C (clear) synchronously NOW — before the loop feeds the
        // OUTSIDE bytes that follow this command — so the clear drops only
        // data that preceded the {=..~C..} marker.
        try {
          cb.applyClearOption(jsonString);
        } catch (e) {
          console.error('[STREAM] applyClearOption threw:', e && e.message);
        }
        if (this.timeoutId) {
          clearTimeout(this.timeoutId);
          this.timeoutId = null;
        }
        const resolve = this.responseResolve;
        this.responseResolve = null;
        this.responseReject  = null;
        this._respCallbacks  = null;
        resolve(jsonString);
      } else {
        // Not a valid response (no pending request, requestType mismatch,
        // or unsolicited) — usually a pfodDevice coding error.  Treat the
        // command as raw data so it isn't silently dropped (it is already
        // in the Raw Message viewer above; also feed it to rawData), and
        // leave any pending request waiting so it times out / retries
        // exactly as before.  NOT fed to csvCollector — a stray command is
        // not CSV (and resetLine() above already cleared any partial line).
        this._emitRaw(pfodString, { csv: false, viewer: false });
      }

      // The >1024 excess tail is OUTSIDE raw that followed the (truncated)
      // command — feed it to the collectors AFTER the command, in order.
      // It was already shown in the viewer as 'excess >1024' above.
      if (excessRawStr !== null) {
        this._emitRaw(excessRawStr, { viewer: false });
      }
      // loop: continue with whatever follows (next {..} or OUTSIDE CSV,
      // which is now collected AFTER any ~C clear applied just above).
    }
  }

  /**
   * Append newly received text and consume the stream strictly in order.
   * The collectors are fed by processReadBuffer from the OUTSIDE segments
   * BETWEEN pfod commands (not a separate whole-chunk pass) so a {=..~C..}
   * clear lands exactly between the old and new data.  Serial/BLE/TCP/HTTP
   * all go through this one path.
   *
   * @param {string} text - new characters received
   */
  processIncoming(text) {
    this.readBuffer += text;
    this.processReadBuffer();
  }
}

/**
 * HTTPConnection - Adapter for HTTP protocol
 *
 * Handles communication with pfod devices over HTTP.
 * Supports CORS for cross-origin requests.
 */
class HTTPConnection extends PfodConnectionBase {
  constructor(config, connectionManager) {
    super();
    this.protocol = 'http';
    this.config = config;
    this.connectionManager = connectionManager;
    this.targetIP = config.targetIP;
    this.baseURL = '';
    this.timeoutId = null;
    this.readBuffer = '';       // Shared with PfodConnectionBase.processReadBuffer
    this.responseResolve = null;
    this.responseReject = null;
    this._respCallbacks = null; // Option B: queue-bound {isValidResponse, applyClearOption}
    this.sendTime = null;
    this.dataRefreshInFlight = false;  // Guard against concurrent sendDataRefresh calls

    // Parse IP:port format, default to port 80 if not specified
    if (this.targetIP) {
      let ipAddress = this.targetIP;
      let port = 80;

      if (this.targetIP.includes(':')) {
        const parts = this.targetIP.split(':');
        ipAddress = parts[0];
        port = parseInt(parts[1], 10);
      }

      this.baseURL = `http://${ipAddress}:${port}`;
    }

    console.log(`[HTTP_CONNECTION] Created with baseURL: ${this.baseURL || '(relative)'}`);
  }

  /**
   * Build fetch options for plain-text HTTP responses.
   * No Accept: application/json — device sends plain text like serial/BLE.
   * @returns {object} - Fetch options object
   */
  buildFetchOptions() {
    return {
      mode: this.targetIP ? 'cors' : 'same-origin',
      credentials: this.targetIP ? 'omit' : 'same-origin',
      cache: 'no-cache'
    };
  }

  /**
   * Build the URL for a sendOnce() request.  Extracted so subclasses
   * (e.g. SerialProxyConnection) can prepend connection-target query
   * params on top of the standard ?cmd=.
   * @param {string} cmdWithPrefix - Command with dedup prefix
   * @returns {string} - Absolute URL for fetch()
   */
  _buildSendEndpoint(cmdWithPrefix) {
    return this.baseURL + `/pfodWeb?cmd=${encodeURIComponent(cmdWithPrefix)}`;
  }

  /**
   * Build the URL for a sendDataRefresh() request (idle CSV-collecting
   * poll, empty cmd).  Extracted for the same subclass-override reason
   * as _buildSendEndpoint().
   * @returns {string} - Absolute URL for fetch()
   */
  _buildDataRefreshEndpoint() {
    return this.baseURL + '/pfodWeb?cmd=';
  }

  /**
   * Send a command via HTTP with retry logic.
   * Each attempt calls sendOnce(), which feeds the plain-text response through
   * processIncoming() → processReadBuffer() → responseResolve(jsonString).
   * All retries use the same dedup character captured at the start.
   *
   * @param {string} cmd - The pfod command (e.g., "{.}" or "{dwgName}")
   * @returns {Promise<string>} - JSON string from pfodToJson, or '' if no pfod found
   */
  async send(cmd) {
    const cmdWithPrefix = getCurrentDedupChar() + cmd;
    // {!} is the exit/abort command — fire once, never retry.  Retrying {!}
    // only delays the user-visible page transition; the device will see it on
    // the first attempt or not at all, both acceptable.
    const maxRetries = (cmd === '{!}') ? 0 : this.connectionManager.getMaxRetries();
    let lastError = null;

    console.log(`[HTTP_CONNECTION] Allocated dedup='${cmdWithPrefix[0]}' for this send()`);

    // Reset read buffer at the start of each new send
    this.readBuffer = '';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[HTTP_CONNECTION] Send attempt ${attempt + 1}/${maxRetries + 1}: ${cmdWithPrefix}`);
        const jsonString = await this.sendOnce(cmdWithPrefix, cmd);
        console.log(`[HTTP_CONNECTION] Success on attempt ${attempt + 1} with dedup='${cmdWithPrefix[0]}'`);
        return jsonString;
      } catch (error) {
        lastError = error;
        console.warn(`[HTTP_CONNECTION] Attempt ${attempt + 1}/${maxRetries + 1} failed: ${error.message}`);
        if (attempt >= maxRetries) {
          console.error(`[HTTP_CONNECTION] All ${maxRetries + 1} attempts exhausted with dedup='${cmdWithPrefix[0]}'. Throwing.`);
          throw error;
        }
        // User clicked Exit while we were retrying — abandon remaining attempts
        // so {!} can fire and the page can reload promptly.  Flag is set by
        // navigationAndQueue.js addToRequestQueue when exitAbort is enqueued.
        if (this.connectionManager.exitPending) {
          console.warn(`[HTTP_CONNECTION] exitPending — abandoning ${maxRetries - attempt} remaining retr${(maxRetries - attempt) === 1 ? 'y' : 'ies'}`);
          throw error;
        }
        // Always wait at least 1 s before retrying, regardless of which
        // error triggered the retry — gives a device draining a backlog
        // (e.g. accumulated raw/CSV data) time to finish before the next
        // request, instead of hammering it back-to-back.
        await sleep(1000);
        console.log(`[HTTP_CONNECTION] Retrying with same dedup='${cmdWithPrefix[0]}'...`);
      }
    }

  }

  /**
   * Single HTTP send attempt (no retries).
   * Returns a Promise resolved by processReadBuffer() when a complete pfod {..} command
   * is found in the response text. If no pfod command is present the Promise resolves ''.
   * CSV/raw data in the response are fed to csvCollector and rawDataCollector via
   * processIncoming() before the Promise resolves.
   *
   * @param {string} cmdWithPrefix - Command with dedup prefix to send
   * @param {string} originalCmd - Original command without dedup (for message logging)
   * @returns {Promise<string>} - JSON string or ''
   * @private
   */
  sendOnce(cmdWithPrefix, originalCmd) {
    return new Promise(async (resolve, reject) => {
      this.responseResolve = resolve;
      this.responseReject = reject;
      this.sendTime = Date.now();

      const endpoint = this._buildSendEndpoint(cmdWithPrefix);
      const options = this.buildFetchOptions();

      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }

      const controller = new AbortController();
      const timeout = this.connectionManager.getResponseTimeout();
      console.log(`[HTTP_CONNECTION] Setting response timeout to ${timeout === 0 ? 'never' : timeout + 'ms'}`);
      if (timeout !== 0) this.timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        console.log(`[HTTP_CONNECTION] Fetching: ${endpoint}`);

        if (ConnectionManager.messageCollector) {
          ConnectionManager.messageCollector.addMessage('sent', cmdWithPrefix, 'http', originalCmd);
        }

        const response = await fetch(endpoint, { ...options, signal: controller.signal });

        console.log(`[HTTP_CONNECTION] Response status: ${response.status}`);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const responseText = await response.text();

        if (this.timeoutId) {
          clearTimeout(this.timeoutId);
          this.timeoutId = null;
        }

        // Any HTTP response body — even empty — signals the connection is alive.
        // Fire immediately so CSV polling starts without waiting for a valid pfod reply.
        if (this._respCallbacks && typeof this._respCallbacks.onAnyResponseReceived === 'function') {
          this._respCallbacks.onAnyResponseReceived();
        }

        console.log(`[HTTP_CONNECTION] Response received (${responseText.length} bytes)`);

        // Feed plain-text response through shared pipeline:
        // csvCollector + rawDataCollector + processReadBuffer.
        // processReadBuffer will call this.responseResolve(jsonString) if a pfod command is found.
        this.processIncoming(responseText);

        // The in-order OUTSIDE/INSIDE machine already emitted every OUTSIDE
        // (raw/CSV) segment and every complete command.  The only thing that
        // can remain is an INSIDE partial ('{...' with no '}' and < 1024) —
        // a truncated/garbled trailing fragment.  HTTP responses are
        // independent, so flush it to the Raw Message viewer and clear it so
        // it cannot mis-frame the next response.  (Serial/BLE keep partials
        // across chunks — they have no such flush.)
        if (this.readBuffer.length > 0 && ConnectionManager.messageCollector) {
          ConnectionManager.messageCollector.addMessage('received', this.readBuffer, this.protocol);
          this.readBuffer = '';
        }

        // processReadBuffer did not find a complete pfod {..} in the
        // response.  Every pfod cmd — including the bare keepalive {} —
        // must come back with some {..} reply per protocol; a missing or
        // truncated {..} is therefore always a transport-level failure
        // (HTTP body empty, dropped, truncated mid-cmd, or only non-pfod
        // bytes).  Note: a {..} body ≥1024 bytes without a `}` is auto-
        // closed by processReadBuffer (synthetic `}` appended at byte 1024)
        // and resolves NORMALLY — that path never reaches here.
        //
        // Log via console.error so the diagnostic survives in non-debug
        // mode (applyDebugLogging stubs console.log / warn / info but
        // leaves console.error intact), then reject the Promise with a
        // NO_PFOD_IN_RESPONSE error.  The outer send() retry loop
        // (lines ~794-809) catches the rejection and re-sends the same
        // cmd (same dedup char) up to maxRetries times before surfacing
        // the failure to the caller.
        if (this.responseResolve) {
          const bodyPreview = responseText.length > 512
            ? responseText.slice(0, 512) + '… (' + (responseText.length - 512) + ' more chars)'
            : responseText;
          console.error(
            `[HTTP_CONNECTION] No pfod {..} in response for cmd "${originalCmd}" — `
            + `body=${responseText.length} bytes, content=`,
            JSON.stringify(bodyPreview)
          );
          const err = new Error(
            `Empty/non-pfod response for cmd "${originalCmd}" (${responseText.length} bytes) — `
            + `transport drop or truncation; will retry if budget remains`
          );
          err.code = 'NO_PFOD_IN_RESPONSE';
          const reject = this.responseReject;
          this.responseResolve = null;
          this.responseReject = null;
          if (reject) reject(err);
        }
      } catch (error) {
        if (this.timeoutId) {
          clearTimeout(this.timeoutId);
          this.timeoutId = null;
        }
        const wrappedError = error.name === 'AbortError'
          ? new Error('HTTP response timeout - device may not be responding')
          : error;
        if (this.responseReject) {
          this.responseReject(wrappedError);
          this.responseResolve = null;
          this.responseReject = null;
        }
      }
    });
  }

  /**
   * Send a data-refresh request: GET pfodWeb?cmd= with no dedup character.
   * Used by the 1-second auto-polling cycle to collect streaming CSV data between pfod commands.
   * Feeds the response through processIncoming (csvCollector, rawDataCollector, processReadBuffer).
   * Any pfod {..} command in the response is logged but does not resolve a promise.
   * @returns {Promise<void>}
   */
  async sendDataRefresh() {
    // Lowest-level guard: prevent concurrent HTTP fetches regardless of higher-level queue state
    if (this.dataRefreshInFlight) {
      console.warn('[HTTP_CONNECTION] sendDataRefresh: already in flight, skipping');
      return;
    }
    this.dataRefreshInFlight = true;

    const endpoint = this._buildDataRefreshEndpoint();
    const options = this.buildFetchOptions();

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    const controller = new AbortController();
    const timeout = this.connectionManager.getResponseTimeout();
    if (timeout !== 0) this.timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      console.log(`[HTTP_CONNECTION] dataRefresh: ${endpoint}`);
      if (ConnectionManager.messageCollector) {
        ConnectionManager.messageCollector.addMessage('sent', '', this.protocol, '');
      }
      const response = await fetch(endpoint, { ...options, signal: controller.signal });

      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const responseText = await response.text();
      console.log(`[HTTP_CONNECTION] dataRefresh response (${responseText.length} bytes)`);

      // Feed through shared pipeline: csvCollector, rawDataCollector, processReadBuffer
      this.processIncoming(responseText);

      // Flush any remaining buffer (CSV after pfod command) to messageCollector
      if (this.readBuffer.length > 0 && ConnectionManager.messageCollector) {
        ConnectionManager.messageCollector.addMessage('received', this.readBuffer, this.protocol);
        this.readBuffer = '';
      }
    } catch (error) {
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }
      if (error.name === 'AbortError') {
        throw new Error('dataRefresh timeout - device may not be responding');
      }
      throw error;
    } finally {
      this.dataRefreshInFlight = false;
    }
  }

  /**
   * HTTP doesn't need explicit connection
   */
  async connect() {
    // No-op for HTTP
  }

  /**
   * Fire `{!}` at the device without waiting for a response, so the device's
   * pfodParser resets its dedup state (see pfodParser::closeConnection())
   * before the next connect -- otherwise a reconnect whose first message
   * reuses the same dedup char as this connection's last message would be
   * wrongly dropped as a duplicate. Uses keepalive so the request can
   * outlive a page-unload event (mirrors ProxyStreamConnection.sendAbort()).
   */
  async sendAbort() {
    const cmdWithPrefix = getCurrentDedupChar() + '{!}';
    const url = this._buildSendEndpoint(cmdWithPrefix);
    try {
      fetch(url, { ...this.buildFetchOptions(), keepalive: true }).catch(() => {});
      console.log(`[HTTP_CONNECTION] sent {!} on abort to ${url}`);
    } catch (e) {
      // best-effort; page may be on its way out.
    }
  }

  /**
   * HTTP has no persistent connection to tear down, but still fire {!} so
   * the device resets its dedup state before the next connect.
   */
  async disconnect() {
    await this.sendAbort();
  }

  /**
   * HTTP is always "connected"
   */
  isConnected() {
    return true;
  }
}

/**
 * ProxyStreamConnection — shared base for all three pfodProxy adapters
 * (serial, TCP, BLE).
 *
 * After the all-SSE refactor the proxy is a *streaming* peer of the
 * native `SerialConnection` / `BLEConnection`: bytes flow from the
 * device through `pfodProxy` into a long-lived Server-Sent-Events
 * stream the browser holds open, and cmd writes go out as
 * fire-and-forget `fetch('?…&cmd=…')` calls.  The proxy returns
 * 200/empty for cmd writes immediately; the actual response bytes
 * arrive over the SSE stream a few milliseconds later and are parsed
 * by the inherited `PfodConnectionBase.processReadBuffer()`.
 *
 * The two HTTP requests in flight per session:
 *   • One persistent SSE `GET ?<target-params>` — held open by
 *     EventSource for the entire session, hex-encoded device byte
 *     chunks arrive as `data:` events.
 *   • One short `GET ?<target-params>&cmd=<…>` per cmd — fires the
 *     write to the proxy, returns 200+empty in ms, doesn't carry
 *     the response.
 *
 * Subclasses only override `_proxyTargetQuery()` (and pass their
 * protocol name + protocol-specific config in via the constructor).
 *
 * dataRefresh polling is **not** inherited from HTTPConnection here
 * (we extend `PfodConnectionBase` directly): the SSE byte stream
 * pushes streaming data live, so the 1 s dataRefresh poll the
 * direct-HTTP path uses is unnecessary and was actively harmful
 * (raced with menu refresh + keepAlive timers, see prior debug
 * sessions).  The request-queue's scheduleDataRefresh gates on
 * `protocol === 'http'` to keep it out of the proxy path.
 */
class ProxyStreamConnection extends PfodConnectionBase {
  constructor(config, connectionManager, protocol) {
    super();
    this.protocol          = protocol;     // 'serial' | 'tcp' | 'ble'
    this.config            = config;
    this.connectionManager = connectionManager;
    this.proxyHostPort     = config.proxyHostPort || 'localhost:4989';
    this.baseURL           = `http://${this.proxyHostPort}`;

    this.eventSource     = null;
    this.connected       = false;
    this.readBuffer      = '';
    this.responseResolve = null;
    this.responseReject  = null;
    this.timeoutId       = null;
    this.sendTime        = null;
    this._decoder        = new TextDecoder('utf-8', { fatal: false });
  }

  /// Subclasses MUST override.  Returns the target query (e.g.
  /// "serial=COM16&baud=115200" / "ip=10.0.0.1&port=4989" /
  /// "ble=AA:BB:…"), plus any `&debug=` flag.
  _proxyTargetQuery() {
    throw new Error(`${this.constructor.name} must override _proxyTargetQuery()`);
  }

  /// URL for the connection SSE (no `cmd=`).
  _connectionURL() {
    return this.baseURL + '/pfodWeb?' + this._proxyTargetQuery();
  }

  /// URL for a cmd write (`&cmd=<encoded>` appended).
  _cmdURL(cmdWithPrefix) {
    return this.baseURL + '/pfodWeb?'
         + this._proxyTargetQuery()
         + '&cmd=' + encodeURIComponent(cmdWithPrefix);
  }

  /// Open the SSE byte stream.  Idempotent — calling twice is a
  /// no-op after the first.  Resolves when the EventSource fires
  /// `open`; rejects if the initial connect fails.
  async connect() {
    if (this.connected && this.eventSource) {
      return;
    }
    // Reset the parser state for each fresh connect so stale
    // partial-UTF-8 from a previous session can't corrupt the
    // first bytes of the new one.
    this.readBuffer = '';
    this._decoder   = new TextDecoder('utf-8', { fatal: false });

    const url = this._connectionURL();
    console.log(`[${this.protocol.toUpperCase()}_PROXY] Opening SSE: ${url}`);

    // Show a progress dialog only for BLE proxy connections — that's
    // where the multi-step GATT setup can take ~10 s for sparsely-
    // advertising sensors.  Serial / TCP proxy opens are millisecond-
    // scale and a dialog would just flash.  See _showConnectingDialog
    // for the actual modal.
    const showDialog = (this.protocol === 'ble');
    if (showDialog) {
      const name    = this.bleName    || null;
      const address = this.bleAddress || '';
      this._showConnectingDialog(name, address);
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn) => { if (!settled) { settled = true; fn(); } };

      // Cancel wired to the dialog Cancel button.  Closes whatever
      // EventSource is current at the time the button is pressed.
      if (showDialog) {
        this._cancelConnect = () => {
          if (this.eventSource) { this.eventSource.close(); this.eventSource = null; }
          this.connected = false;
          this._hideConnectingDialog();
          settle(() => reject(new Error('Connection cancelled')));
        };
      }

      const startAttempt = () => {
        if (settled) return;   // cancelled while a retry was queued
        let es;
        try {
          es = new EventSource(url);
        } catch (err) {
          // `new EventSource(url)` can throw synchronously (e.g. a
          // malformed URL) — whatever the underlying cause, the
          // user-facing message should be the same actionable
          // "proxy not running" guidance the async never-opened path
          // below gives, not a raw DOMException like "An invalid or
          // illegal string was specified".
          if (showDialog) this._hideConnectingDialog();
          const hp = this.proxyHostPort || 'localhost:4989';
          const portPart = hp.indexOf(':') >= 0 ? hp.substring(hp.lastIndexOf(':') + 1) : '4989';
          settle(() => reject(new Error(
            `Cannot reach pfodProxy at ${hp}.\n\n` +
            `Start pfodProxy on port ${portPart} first — run:\n` +
            `    pfodProxy ${portPart}\n\n` +
            `then retry the connection.`
          )));
          return;
        }
        this.eventSource = es;
        let opened = false;

        es.onopen = () => {
          opened = true;
          this.connected = true;
          console.log(`[${this.protocol.toUpperCase()}_PROXY] SSE open`);
          // For serial: arm the post-connect grace flag (Arduino DTR reset
          // bootloader window) as soon as the port physically opens.
          // All transports resolve on `progress: ready` (not here) so a
          // second-connection refused error — sent before ready — is never
          // silently swallowed after the promise has already settled.
          if (this.protocol === 'serial') {
            this._postConnectGrace = true;
          }
        };

        es.onmessage = (e) => {
          // Hex-decode device chunk → bytes → UTF-8 string → parser.
          // hex-encoded by the proxy so the data: payload is plain
          // ASCII and free of any chars that could confuse SSE framing
          // (newlines, NUL, lone surrogates).
          const hex = e.data;
          if (!hex || (hex.length & 1)) return;  // skip empty/odd-length safety
          const bytes = new Uint8Array(hex.length >>> 1);
          for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(hex.substr(i << 1, 2), 16);
          }
          const text = this._decoder.decode(bytes, { stream: true });
          this.processIncoming(text);
        };

        // Proxy echoes back the device name (from the ?name= query param)
        // so the dialog can show it even before the first progress step.
        es.addEventListener('device_name', (e) => {
          const n = (e.data || '').trim();
          if (n && showDialog) this._updateConnectingDialogName(n, this.bleAddress || '');
        });

        // Proxy emits `event: progress` with `data: "<step>"` during
        // the BLE GATT setup: "scanning" → "connecting" → "discovering"
        // → "subscribing" → "ready".  Update the dialog as each step
        // arrives; close on "ready" (or on the SSE error handler below).
        es.addEventListener('progress', (e) => {
          const step = (e.data || '').trim();
          console.log(`[${this.protocol.toUpperCase()}_PROXY] progress: ${step}`);
          if (step === 'ready') {
            if (showDialog) this._hideConnectingDialog();
            settle(() => resolve());
          } else {
            if (showDialog) this._updateConnectingDialog(step);
          }
        });

        es.addEventListener('lagged', (e) => {
          // Proxy broadcast channel reported a slow subscriber; we
          // skipped `e.data` chunks.  Surface as a warning — the
          // pfod parser can't recover lost middle bytes cleanly, but
          // the next complete `{…}` block will resync.
          console.warn(`[${this.protocol.toUpperCase()}_PROXY] SSE lagged — ${e.data} chunks skipped`);
        });

        es.addEventListener('error', (event) => {
          // Two distinct cases share this handler:
          //
          // 1. Named SSE `event: error` from the proxy (e.g. "device not found",
          //    "open failed: …").  These arrive as MessageEvent with a .data
          //    payload.
          //    "not found": device wasn't advertising — close and retry
          //    (the dialog stays open; user can Cancel at any time).
          //    Any other proxy error: fatal — dismiss dialog and reject.
          //
          // 2. EventSource network/transport error (plain Event, no .data).
          //    EventSource auto-reconnects on transient drops.  Only treat as
          //    fatal when readyState reaches CLOSED.
          if (event instanceof MessageEvent) {
            es.close();
            this.connected = false;
            const rawMsg = (event.data || `${this.protocol} connection failed`).replace(/^open failed:\s*/i, '');
            // Retry-without-erroring only ever made sense for BLE — a device
            // that hasn't started advertising yet might still show up on the
            // next scan.  A missing serial port or unreachable TCP host won't
            // fix itself by retrying, so this must stay BLE-only — otherwise
            // any other transport's error message that happens to contain
            // "not found" (e.g. serial's "Port not found") silently loops
            // forever instead of ever surfacing to the user.
            if (!settled && this.protocol === 'ble' && (/not found/i.test(rawMsg) || /not connected/i.test(rawMsg))) {
              // Device not advertising or BLE link failed — keep dialog open and retry.
              if (showDialog) this._updateConnectingDialog('scanning');
              startAttempt();
              return;
            }
            if (showDialog) this._hideConnectingDialog();
            const name = this.bleName;
            const addr = this.bleAddress || '';
            const addrEsc = addr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const msg = name
              ? rawMsg.replace(new RegExp(`device\\s+${addrEsc}`, 'i'), `${name} (${addr})`)
              : rawMsg;
            settle(() => reject(new Error(msg)));
            return;
          }
          if (es.readyState === EventSource.CLOSED) {
            this.connected = false;
            if (showDialog) this._hideConnectingDialog();
            if (!opened) {
              // The SSE never opened — almost always because pfodProxy isn't
              // running (or is on a different port).  Give an actionable
              // message naming the host:port and the command to start it,
              // instead of the opaque "SSE connection failed".
              const hp = this.proxyHostPort || 'localhost:4989';
              const portPart = hp.indexOf(':') >= 0 ? hp.substring(hp.lastIndexOf(':') + 1) : '4989';
              settle(() => reject(new Error(
                `Cannot reach pfodProxy at ${hp}.\n\n` +
                `Start pfodProxy on port ${portPart} first — run:\n` +
                `    pfodProxy ${portPart}\n\n` +
                `then retry the connection.`
              )));
            } else {
              // SSE opened but closed before progress:ready or named error arrived.
              // This happens when the proxy sends an error event + closes the stream
              // very quickly (e.g. COM port in use) and the browser bundles the
              // event data with the connection-close in the same TCP segment so the
              // named error event fires, but onerror may fire first on some paths.
              // Settle here as a fallback so send() is never left hanging.
              settle(() => reject(new Error(
                'Connection to proxy closed before ready — COM port may be in use'
              )));
            }
            if (this.responseReject) {
              this.responseReject(new Error('SSE disconnected'));
              this.responseResolve = null;
              this.responseReject  = null;
              if (this.timeoutId) { clearTimeout(this.timeoutId); this.timeoutId = null; }
            }
          }
        });
      };

      startAttempt();
    });
  }

  // _showConnectingDialog / _updateConnectingDialog /
  // _hideConnectingDialog are inherited from PfodConnectionBase so
  // the native BLEConnection can share the same UI.

  /// Send a cmd.  Allocates the dedup char, fires a fire-and-forget
  /// fetch to the proxy, and returns a Promise that resolves when
  /// the inherited `processReadBuffer()` surfaces the next complete
  /// `{…}` block on the SSE stream.
  ///
  /// `{!}` is a special case: route to `sendAbort()` and resolve
  /// immediately with empty string.  The device doesn't reply to
  /// its own abort, so awaiting a response would just block until
  /// the response-timeout fires — wasteful, and ConnectionManager
  /// .sendAbort() already does this.sendAbort().catch(noop) (this
  /// class's own dedicated sendAbort(), below) which would silently
  /// leak the rejected Promise.
  async send(cmd) {
    if (cmd === '{!}') {
      await this.sendAbort();
      return '';
    }

    if (!this.connected) {
      await this.connect();
    }

    // Allocate the dedup char ONCE per send — every retry reuses
    // the same prefix so the pfod device's protocol-level dedup
    // matches an identical retry to the original cmd and replies
    // with the same response (rather than re-running side effects).
    const cmdWithPrefix = getCurrentDedupChar() + cmd;
    const url           = this._cmdURL(cmdWithPrefix);
    const fullTimeoutMs = this.connectionManager.getResponseTimeout();
    const maxRetries    = this.connectionManager.getMaxRetries();
    const tag           = this.protocol.toUpperCase();

    console.log(`[${tag}_PROXY] Allocated dedup='${cmdWithPrefix[0]}'`);

    // Post-connect grace for serial proxy: same as native serial.
    // First cmd after opening the COM port waits 2.5 s (Arduino
    // DTR-reset bootloader window), probes with a 5 s timeout, then
    // resends with full timeout if no reply.  See
    // SerialConnection.sendOnceWithProgressiveTimeout for the
    // matching native-path behaviour.
    if (this.protocol === 'serial' && this._postConnectGrace) {
      this._postConnectGrace = false;
      console.log('[SERIAL_PROXY] Post-connect grace: waiting 2.5 s before first cmd...');
      await new Promise(r => setTimeout(r, 2500));

      // Probe with 5 s timeout.
      try {
        const json = await this._proxySendOnce(cmdWithPrefix, url, 5000, tag, 'probe');
        return json;
      } catch (e) {
        if (!`${e.message}`.includes('timeout') && !`${e.message}`.includes('cmd write failed')) {
          throw e;
        }
        console.warn(`[SERIAL_PROXY] First cmd timed out at 5 s — resending with full ${fullTimeoutMs} ms timeout`);
      }
      // Resend with full timeout — same dedup char.
      return await this._proxySendOnce(cmdWithPrefix, url, fullTimeoutMs, tag, 'resend');
    }

    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      console.log(`[${tag}_PROXY] Send attempt ${attempt + 1}/${maxRetries + 1}: ${cmdWithPrefix}`);
      try {
        const json = await this._proxySendOnce(cmdWithPrefix, url, fullTimeoutMs, tag, `attempt ${attempt + 1}/${maxRetries + 1}`);
        return json;
      } catch (e) {
        lastError = e;
        console.warn(`[${tag}_PROXY] Attempt ${attempt + 1}/${maxRetries + 1} failed: ${e.message}`);
        if (attempt >= maxRetries) throw lastError;
        // Always wait at least 1 s before retrying, regardless of which
        // error triggered the retry — see sleep() doc comment.
        await sleep(1000);
      }
    }
    throw lastError || new Error(`${this.protocol} send exhausted retries`);
  }

  /// One cmd write + one response wait, with explicit timeout.
  /// Returns the JSON response string; throws on fetch/proxy error
  /// or response timeout.  Always pushes a SENT entry to the message
  /// panel so the raw-msg view shows every wire attempt.
  /// @private
  async _proxySendOnce(cmdWithPrefix, url, timeoutMs, tag, label) {
    if (ConnectionManager.messageCollector) {
      ConnectionManager.messageCollector.addMessage('sent', cmdWithPrefix, this.protocol);
    }
    const responsePromise = new Promise((resolve, reject) => {
      this.responseResolve = resolve;
      this.responseReject  = reject;
      if (timeoutMs !== 0) this.timeoutId = setTimeout(() => {
        if (this.responseReject) {
          const r = this.responseReject;
          if (this.readBuffer.length > 0 && ConnectionManager.messageCollector) {
            ConnectionManager.messageCollector.addMessage('timeout', this.readBuffer, this.protocol);
          }
          this.readBuffer      = '';
          this.responseResolve = null;
          this.responseReject  = null;
          this.timeoutId       = null;
          r(new Error(`${this.protocol} response timeout - device may not be responding`));
        }
      }, timeoutMs);
    });
    this.sendTime = Date.now();
    try {
      const resp = await fetch(url, {
        mode:        'cors',
        credentials: 'omit',
        cache:       'no-cache',
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`proxy returned ${resp.status}${body ? ':\n' + body.trim() : ''}`);
      }
    } catch (e) {
      if (this.timeoutId) { clearTimeout(this.timeoutId); this.timeoutId = null; }
      this.responseResolve = null;
      this.responseReject  = null;
      throw new Error(`cmd write failed (${label}): ${e.message}`);
    }
    const json = await responsePromise;
    console.log(`[${tag}_PROXY] ${label} success with dedup='${cmdWithPrefix[0]}' (timeout was ${timeoutMs} ms)`);
    return json;
  }

  /// Fire `{!}` at the proxy without waiting.  Used by
  /// `ConnectionManager.send('{!}')` (the exitAbort path) and by
  /// `disconnect()`.  Uses `keepalive: true` so the request can
  /// outlive a page-unload event.
  async sendAbort() {
    const url = this._cmdURL('{!}');
    try {
      fetch(url, { mode: 'cors', keepalive: true }).catch(() => {});
      console.log(`[${this.protocol.toUpperCase()}_PROXY] sent {!} on abort to ${url}`);
    } catch (e) {
      // best-effort; page may be on its way out.
    }
  }

  /// Disconnect: tell the proxy to close the device session, then
  /// close our EventSource so the proxy's ScanGuard-style cleanup
  /// fires the cancel signal and the device socket actually goes
  /// away.  Both halves are best-effort — page may be unloading.
  async disconnect() {
    await this.sendAbort();
    if (this.eventSource) {
      try { this.eventSource.close(); } catch (_) {}
      this.eventSource = null;
    }
    this.connected = false;
    if (this.responseReject) {
      this.responseReject(new Error('disconnected'));
      this.responseResolve = null;
      this.responseReject  = null;
      if (this.timeoutId) { clearTimeout(this.timeoutId); this.timeoutId = null; }
    }
  }

  isConnected() {
    return this.connected && this.eventSource
        && this.eventSource.readyState !== EventSource.CLOSED;
  }
}

/**
 * SerialProxyConnection — fallback for browsers without the Web Serial API.
 * Uses pfodProxy's serial transport (`?serial=<path>&baud=<rate>`) over SSE.
 */
class SerialProxyConnection extends ProxyStreamConnection {
  constructor(config, connectionManager) {
    super(config, connectionManager, 'serial');
    this.serialPath  = config.serialPath;
    this.baudRate    = config.baudRate || 9600;
    this.portName    = config.serialPath || 'Unknown Port';
    this.cachePortId = config.serialPath || null;
    console.log(`[SERIAL_PROXY] Created for ${this.serialPath} @ ${this.baudRate} baud via ${this.baseURL}`);
  }

  _proxyTargetQuery() {
    let q = 'serial=' + encodeURIComponent(this.serialPath)
          + '&baud='  + this.baudRate;
    if (window.DEBUG) q += '&debug=';
    return q;
  }
}

/**
 * BLEProxyConnection — BLE transport via pfodProxy (Nordic UART).
 *
 * Fallback path for browsers without Web Bluetooth API (Firefox,
 * Safari).  Uses pfodProxy's BLE transport (`?ble=<address>`); the
 * proxy holds the GATT connection and pushes NUS-TX-characteristic
 * notifications onto the SSE stream.
 */
class BLEProxyConnection extends ProxyStreamConnection {
  constructor(config, connectionManager) {
    super(config, connectionManager, 'ble');
    this.bleAddress = config.bleAddress;
    this.bleName    = config.bleName || null;
    console.log(`[BLE_PROXY] Created for ${this.bleName || this.bleAddress} via ${this.baseURL}`);
  }

  _proxyTargetQuery() {
    let q = 'ble=' + encodeURIComponent(this.bleAddress);
    if (this.bleName) q += '&name=' + encodeURIComponent(this.bleName);
    if (window.DEBUG) q += '&debug=';
    return q;
  }
}

/**
 * TCPProxyConnection — raw-TCP transport via pfodProxy.
 *
 * Browsers can't open raw TCP sockets, so reaching a pfod device that
 * speaks TCP requires the local pfodProxy.  Uses `?ip=…&port=…`; the
 * proxy holds the TCP socket and pushes recv bytes onto the SSE
 * stream.
 */
class TCPProxyConnection extends ProxyStreamConnection {
  constructor(config, connectionManager) {
    super(config, connectionManager, 'tcp');
    this.deviceIP   = config.targetIP;
    this.devicePort = config.targetPort || 4989;
    console.log(`[TCP_PROXY] Created for ${this.deviceIP}:${this.devicePort} via ${this.baseURL}`);
  }

  _proxyTargetQuery() {
    let q = 'ip='   + encodeURIComponent(this.deviceIP)
          + '&port=' + this.devicePort;
    if (window.DEBUG) q += '&debug=';
    return q;
  }
}

/**
 * SerialConnection - Adapter for Serial protocol using Web Serial API
 * NOT USED — proxy always used for all serial connections (SerialProxyConnection).
 * Retained for reference only.
 */
class SerialConnection extends PfodConnectionBase {
  constructor(config, connectionManager) {
    super();
    this.protocol = 'serial';
    this.config = config;
    this.connectionManager = connectionManager;
    this.port = null;
    this.portName = 'Unknown Port';  // Human-readable port name for UI / error messages
    this.cachePortId = null;         // Stable identifier for localStorage cache keys
                                     // (set during connect: COM number when available,
                                     // VID/PID hex pair otherwise — Chrome on Windows
                                     // doesn't expose COM numbers but always exposes
                                     // USB VID/PID via port.getInfo()).
    this.reader = null;
    this.writer = null;
    this.connected = false;
    this.readBuffer = '';
    this.responsePromise = null;
    this.responseResolve = null;
    this.responseReject = null;
    this.timeoutId = null;  // Store timeout ID so it can be cancelled
    this._decoder = null;
    this._readingPromise = null;
    this.firstRequest = true;  // Flag to track if this is the first request
    this.firstRequestAttemptTimeout = 3000;  // Start at 3 second for first request attempts

    // Serial configuration with defaults
    this.baudRate = config.baudRate || 9600;
    this.dataBits = config.dataBits || 8;
    this.stopBits = config.stopBits || 1;
    this.parity = config.parity || 'none';
    this.flowControl = 'none'; //'hardware' ;//config.flowControl || 'none';

    console.log(`[SERIAL_CONNECTION] Created with baud rate: ${this.baudRate}`);
  }

  /**
   * Connect to a serial port
   * Always prompts user to select port (does not reuse previously granted ports)
   */
  async connect() {
    try {
      // Check if Web Serial API is supported
      if (!('serial' in navigator)) {
        const errorMsg = 'Web Serial API is not supported in this browser.\n\n' +
                        'Serial connections require:\n' +
                        '• Chrome (version 89 or later)\n' +
                        '• Edge (version 89 or later)\n' +
                        '• Opera (version 75 or later)\n\n' +
                        'Please use a supported browser for Serial connections.';
        throw new Error(errorMsg);
      }

      // Always prompt user to select serial port
      console.log('[SERIAL_CONNECTION] Prompting user to select serial port...');

      try {
        // Request port from user
        this.port = await navigator.serial.requestPort();

        // Capture port name from port info
        try {
          const portInfo = this.port.getInfo();
          let foundComPort = null;

          // Try to find matching port from navigator.serial.getPorts()
          // This works better on Windows where COM port info isn't exposed directly
          try {
            const allPorts = await navigator.serial.getPorts();
            console.log('[SERIAL_CONNECTION] Total available ports:', allPorts.length);

            // Try to find the just-selected port by matching VID/PID
            for (let availablePort of allPorts) {
              const availableInfo = availablePort.getInfo();
              if (availableInfo.usbVendorId === portInfo.usbVendorId &&
                  availableInfo.usbProductId === portInfo.usbProductId) {
                console.log('[SERIAL_CONNECTION] Matched port by VID/PID');

                // Try to extract path/name from available port
                if (availablePort.path) {
                  foundComPort = availablePort.path;
                  console.log('[SERIAL_CONNECTION] Found path:', availablePort.path);
                  break;
                }
              }
            }
          } catch (e) {
            console.warn('[SERIAL_CONNECTION] Error getting ports list:', e);
          }

          // Fallback approaches if above didn't work
          if (!foundComPort) {
            // Try port.path
            if (this.port.path) {
              foundComPort = this.port.path;
              console.log('[SERIAL_CONNECTION] Using port.path:', foundComPort);
            }
          }

          // Set final port name (human-readable, for UI / error messages)
          if (foundComPort) {
            // If it looks like a COM port, use it as is
            if (foundComPort.match(/COM\d+/)) {
              this.portName = foundComPort.match(/COM\d+/)[0];
            } else {
              this.portName = foundComPort;
            }
          } else {
            // Chrome on Windows doesn't expose COM port number, just show COM?
            this.portName = 'COM?';
          }

          // Set cache-stable identifier (for localStorage cache keys).
          //   Prefer COMn when Chrome exposed it.
          //   Otherwise fall back to USB VID/PID hex pair from port.getInfo()
          //   so per-USB-device cache entries don't collide on the literal
          //   'COM?' fallback when multiple USB serial devices are used.
          if (this.portName.match(/^COM\d+$/)) {
            this.cachePortId = this.portName;
          } else if (portInfo && portInfo.usbVendorId != null && portInfo.usbProductId != null) {
            const vid = portInfo.usbVendorId.toString(16).toUpperCase().padStart(4, '0');
            const pid = portInfo.usbProductId.toString(16).toUpperCase().padStart(4, '0');
            this.cachePortId = `VID${vid}_PID${pid}`;
          } else {
            this.cachePortId = this.portName;  // last resort, e.g. 'COM?'
          }

          console.log('[SERIAL_CONNECTION] Final port name:', this.portName, '/ cache id:', this.cachePortId);
        } catch (e) {
          this.portName = 'Serial Port';
          this.cachePortId = 'Serial Port';
          console.warn('[SERIAL_CONNECTION] Error extracting port name:', e);
        }
        console.log('[SERIAL_CONNECTION] Attempting to open port...');

        // Try to open the newly selected port
        await this.port.open({
          baudRate: this.baudRate,
          dataBits: this.dataBits,
          stopBits: this.stopBits,
          parity: this.parity,
          flowControl: this.flowControl
        });
        console.log('[SERIAL_CONNECTION] Port opened successfully');
      } catch (selectError) {
        console.error('[SERIAL_CONNECTION] Port selection or opening failed:', selectError);

        const errorMsg = 'Serial port could not be opened. Please ensure:\n' +
                        '1. The device is connected\n' +
                        '2. No other application is using the port\n' +
                        '3. You selected the correct port';
        throw new Error(errorMsg);
      }

      // Get reader and writer
      this.reader = this.port.readable.getReader();
      this.writer = this.port.writable.getWriter();
      this.connected = true;

      // Reset first request flag for new connection
      this.firstRequest = true;
      console.log('[SERIAL_CONNECTION] Serial connection established successfully, firstRequest flag reset');

      // Fresh decoder for each connection so no stale partial-character state carries over
      this._decoder = new TextDecoder('utf-8', { fatal: false });

      // Start reading loop (don't await - let it run in background)
      this._readingPromise = this.startReading();

      // Give a moment for the read loop to actually start before returning
      // This ensures the reader is actively listening before we send commands
      await new Promise(resolve => setTimeout(resolve, 50));

    } catch (error) {
      console.error('[SERIAL_CONNECTION] Connection failed:', error);
      throw error;
    }
  }

  /**
   * Start continuous reading from serial port
   * Buffers incoming data until a complete response is received
   * Resets timeout each time data is received
   */
  async startReading() {
    console.log('[SERIAL_CONNECTION] Starting read loop...');

    try {
      while (this.connected && this.reader) {
        const { value, done } = await this.reader.read();

        if (done) {
          console.log('[SERIAL_CONNECTION] Reader closed');
          break;
        }

        // Decode using the persistent instance decoder (created/reset at connect time)
        // with stream:true so multi-byte UTF-8 characters split across chunks decode correctly.
        const text = this._decoder.decode(value, { stream: true });

        // NOTE: Do NOT reset timeout here - timeout should apply to the entire response,
        // not reset on partial data. Only clear timeout when complete response is received
        // in processReadBuffer()

        // Feed data through shared pipeline: csvCollector, rawDataCollector, processReadBuffer
        this.processIncoming(text);
      }
    } catch (error) {
      if (this.connected) {
        console.error('[SERIAL_CONNECTION] Read error:', error);
        if (this.responseReject) {
          this.responseReject(error);
          this.responseResolve = null;
          this.responseReject = null;
        }
      }
    }
  }

  /**
   * Send a command via serial with internal retry logic
   * Retries up to maxRetries times using the same dedup character
   * Only advances dedup on final success
   * @param {string} cmd - The pfod command (e.g., "{.}" or "{dwgName}")
   * @returns {Promise<string>} - Response text (usually JSON)
   */
  async send(cmd) {
    // Auto-connect if not already connected
    if (!this.connected || !this.writer) {
      console.log('[SERIAL_CONNECTION] Not connected, connecting now...');
      await this.connect();
    }

    // Diagnostic logging: Check if a previous request is still pending
    if (this.responseResolve || this.responseReject) {
      console.warn(`[SERIAL_CONNECTION] WARNING: send() called while previous request still pending`);
      console.warn(`[SERIAL_CONNECTION] This should not happen - queue protection may not be working`);
    }

    // Get dedup character atomically - getCurrentDedupChar() increments for next call
    const cmdWithPrefix = getCurrentDedupChar() + cmd;
    // {!} is the exit/abort command — fire once, never retry (see HTTPAdapter.send).
    const maxRetries = (cmd === '{!}') ? 0 : this.connectionManager.getMaxRetries();
    const isFirstRequest = this.firstRequest;
    let lastError = null;

    console.log(`[SERIAL_CONNECTION] Allocated dedup='${cmdWithPrefix[0]}' for this send()`);

    // Clear response state once at the start - keep accumulated data across retries
    this.readBuffer = '';

    // Retry loop: attempt up to (maxRetries + 1) times
    // Data continues to accumulate in readBuffer across retry attempts
    // All retries use the SAME cmdWithPrefix (dedup already captured)
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[SERIAL_CONNECTION] Send attempt ${attempt + 1}/${maxRetries + 1}: ${cmdWithPrefix}`);

        // Cancel any previous timeout
        if (this.timeoutId) {
          clearTimeout(this.timeoutId);
          console.log(`[SERIAL_CONNECTION] Cancelled previous timeout`);
          this.timeoutId = null;
        }

        let responseText;
        // For first request, use progressive timeout
        if (isFirstRequest && attempt === 0) {
          this.firstRequest = false;
          responseText = await this.sendOnceWithProgressiveTimeout(cmdWithPrefix, cmd);
        } else {
          // Normal send for subsequent requests or retries
          // NOTE: readBuffer is NOT cleared here - it persists across retries
          // This allows partial responses to accumulate if retries occur
          responseText = await this.sendOnceInternal(cmdWithPrefix, cmd, this.connectionManager.getResponseTimeout());
        }

        // Success! Return response (dedup already allocated and advanced at start)
        console.log(`[SERIAL_CONNECTION] Success on attempt ${attempt + 1} with dedup='${cmdWithPrefix[0]}'`);
        return responseText;
      } catch (error) {
        lastError = error;
        console.warn(`[SERIAL_CONNECTION] Attempt ${attempt + 1}/${maxRetries + 1} failed: ${error.message}`);

        // If this was the last attempt, close the port then throw the error.
        // forceReconnect() may have left the port open; closing it now ensures the next
        // connect() call can open it fresh (avoids "port is already open" on Reload).
        if (attempt >= maxRetries) {
          console.error(`[SERIAL_CONNECTION] All ${maxRetries + 1} attempts exhausted with dedup='${cmdWithPrefix[0]}'. Throwing error back to queue.`);
          await this.disconnect().catch(() => {});
          throw error;
        }
        // User clicked Exit while we were retrying — abandon remaining attempts.
        if (this.connectionManager.exitPending) {
          console.warn(`[SERIAL_CONNECTION] exitPending — abandoning ${maxRetries - attempt} remaining retr${(maxRetries - attempt) === 1 ? 'y' : 'ies'}`);
          await this.disconnect().catch(() => {});
          throw error;
        }

        // Always wait at least 1 s before retrying, regardless of which
        // error triggered the retry — see sleep() doc comment.
        await sleep(1000);

        // Close and reopen connection before retry, but only on subsequent timeouts (not first)
        if (attempt > 0) {
          console.log(`[SERIAL_CONNECTION] Closing and reopening serial connection before retry...`);
          try {
            await this.forceReconnect();
            console.log(`[SERIAL_CONNECTION] Connection re-engaged successfully, retrying with same dedup='${cmdWithPrefix[0]}'...`);
          } catch (reconnectError) {
            console.error(`[SERIAL_CONNECTION] Failed to re-engage connection during retry: ${reconnectError.message}`);
            // Continue to next retry attempt even if reconnect failed
            console.log(`[SERIAL_CONNECTION] Retrying with same dedup='${cmdWithPrefix[0]}'...`);
          }
        } else {
          // First timeout - just retry without reconnecting
          console.log(`[SERIAL_CONNECTION] First timeout - retrying without reconnect, dedup='${cmdWithPrefix[0]}'...`);
        }
      }
    }

  }

  /**
   * Post-connect grace handler for the FIRST cmd after opening the
   * port.  Serial (USB-CDC) devices typically reset on port open
   * (Arduino's DTR-toggle behaviour); during the bootloader window
   * any cmd sent is dropped on the floor.  Flow:
   *   1. Wait 2.5 s after connect before sending anything.
   *   2. Send the cmd with a 5 s response timeout (probes the device).
   *   3. If no response: resend (same dedup char) and wait the full
   *      response timeout (default 10 s).
   *   4. Subsequent sends use the normal path with full timeout.
   * @private
   */
  async sendOnceWithProgressiveTimeout(cmdWithPrefix, originalCmd) {
    const maxTimeout = this.connectionManager.getResponseTimeout();

    console.log('[SERIAL_CONNECTION] Post-connect grace: waiting 2.5 s before first cmd...');
    await new Promise(resolve => setTimeout(resolve, 2500));

    console.log(`[SERIAL_CONNECTION] First cmd attempt with 5 s timeout (Arduino-bootloader-window probe)`);
    try {
      const response = await this.sendOnceInternal(cmdWithPrefix, originalCmd, 5000);
      console.log('[SERIAL_CONNECTION] First cmd got response within 5 s');
      return response;
    } catch (error) {
      if (!error.message.includes('timeout')) {
        // Non-timeout error — propagate immediately, no resend.
        throw error;
      }
      console.warn(`[SERIAL_CONNECTION] First cmd timed out at 5 s — resending with full ${maxTimeout} ms timeout`);
    }

    // Resend with the full response timeout.  Same dedup char so the
    // device's protocol-level dedup matches if the first cmd actually
    // got through.
    try {
      const response = await this.sendOnceInternal(cmdWithPrefix, originalCmd, maxTimeout);
      console.log(`[SERIAL_CONNECTION] Second cmd succeeded within ${maxTimeout} ms`);
      return response;
    } catch (error) {
      // Throw a normalised timeout error to feed the outer retry loop.
      if (error.message.includes('timeout')) {
        throw new Error('Serial response timeout - device may not be responding');
      }
      throw error;
    }
  }

  /**
   * Send command once with specified timeout (internal - no retry)
   * @param {string} cmdWithPrefix - The command with dedup prefix already applied
   * @param {string} originalCmd - The original command without prefix
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<string>} - Response text
   * @private
   */
  async sendOnceInternal(cmdWithPrefix, originalCmd, timeout) {
    // Record send time for performance measurement
    this.sendTime = Date.now();
    this.currentTimeout = timeout;

    // Set up promise for response
    const responsePromise = new Promise((resolve, reject) => {
      this.responseResolve = resolve;
      this.responseReject = reject;

      console.log(`[SERIAL_CONNECTION] Setting timeout to ${timeout === 0 ? 'never' : timeout + 'ms'}`);
      if (timeout !== 0) this.timeoutId = setTimeout(() => {
        if (this.responseReject) {
          if (this.readBuffer.length > 0 && ConnectionManager.messageCollector) {
            ConnectionManager.messageCollector.addMessage('timeout', this.readBuffer, this.protocol);
          }
          this.readBuffer = '';
          this.responseReject(new Error('Serial response timeout - device may not be responding'));
          this.responseResolve = null;
          this.responseReject = null;
          this.timeoutId = null;
        }
      }, timeout);
    });

    // Send the command
    console.log(`[SERIAL_CONNECTION] Sending: ${cmdWithPrefix} at ${new Date(this.sendTime).toISOString()}`);

    // Record the command being sent (with the dedup prefix)
    if (ConnectionManager.messageCollector) {
      ConnectionManager.messageCollector.addMessage('sent', cmdWithPrefix, 'serial', originalCmd);
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(cmdWithPrefix + '\n'); // Add newline for command termination
    await this.writer.write(data);

    // Wait for response
    return responsePromise;
  }

  /**
   * Disconnect from the serial port
   */
  async disconnect() {
    console.log('[SERIAL_CONNECTION] Disconnecting...');

    this.connected = false;

    try {
      // Cancel reader and wait for startReading() to exit before releasing the lock.
      // reader.cancel() causes the pending reader.read() to resolve with done:true, but
      // startReading() processes that as a microtask — awaiting _readingPromise ensures
      // the loop has fully exited before releaseLock() is called, avoiding the
      // "outstanding read requests" error that would prevent port.close() from running.
      if (this.reader) {
        await this.reader.cancel();
        if (this._readingPromise) {
          await this._readingPromise.catch(() => {});
          this._readingPromise = null;
        }
        this.reader.releaseLock();
        this.reader = null;
      }

      // Release writer
      if (this.writer) {
        this.writer.releaseLock();
        this.writer = null;
      }

      // Close port
      if (this.port) {
        await this.port.close();
        this.port = null;
      }

      console.log('[SERIAL_CONNECTION] Disconnected successfully');
    } catch (error) {
      console.error('[SERIAL_CONNECTION] Error during disconnect:', error);
      throw error;
    }
  }

  /**
   * Check if serial connection is active
   */
  isConnected() {
    return this.connected && this.port !== null;
  }

  /**
   * Force-close and re-open the serial port to reset communication
   * Used when connection appears stuck after timeout
   * Does not prompt user - reuses existing port with same settings
   */
  async forceReconnect() {
    console.error('[SERIAL_CONNECTION] Force-reconnecting serial port...');

    try {
      // Cancel and release reader
      if (this.reader) {
        try {
          await this.reader.cancel();
          this.reader.releaseLock();
        } catch (e) {
          console.error('[SERIAL_CONNECTION] Reader cancel/release error (may be stuck):', e);
        }
        this.reader = null;
      }

      // Release writer
      if (this.writer) {
        try {
          this.writer.releaseLock();
        } catch (e) {
          console.error('[SERIAL_CONNECTION] Writer release error:', e);
        }
        this.writer = null;
      }

      // Close port if open
      if (this.port) {
        try {
          await this.port.close();
          console.error('[SERIAL_CONNECTION] Port closed');
        } catch (e) {
          console.error('[SERIAL_CONNECTION] Port close error:', e);
        }
      }

      // Wait a moment for the port to fully close
      await new Promise(resolve => setTimeout(resolve, 100));

      // Re-open the port with same settings
      if (this.port) {
        try {
          await this.port.open({
            baudRate: this.baudRate,
            dataBits: this.dataBits,
            stopBits: this.stopBits,
            parity: this.parity,
            flowControl: this.flowControl
          });
          console.error('[SERIAL_CONNECTION] Port re-opened successfully');

          // Get new reader and writer
          this.reader = this.port.readable.getReader();
          this.writer = this.port.writable.getWriter();
          this.connected = true;

          // Reset first request flag for new connection
          this.firstRequest = true;
          console.error('[SERIAL_CONNECTION] Serial connection re-engaged, firstRequest flag reset');

          // Fresh decoder for each reconnect so no stale partial-character state carries over
          this._decoder = new TextDecoder('utf-8', { fatal: false });

          // Start reading loop
          this._readingPromise = this.startReading();

          return true;
        } catch (reopenError) {
          console.error('[SERIAL_CONNECTION] Failed to re-open port:', reopenError);
          this.connected = false;
          return false;
        }
      } else {
        console.error('[SERIAL_CONNECTION] Port reference lost - cannot reconnect');
        this.connected = false;
        return false;
      }
    } catch (error) {
      console.error('[SERIAL_CONNECTION] Force-reconnect error:', error);
      this.connected = false;
      return false;
    }
  }
}

/**
 * BLEConnection - Adapter for BLE protocol using Web Bluetooth API
 * NOT USED — proxy always used for all BLE connections (BLEProxyConnection).
 * Retained for reference only.
 */
class BLEConnection extends PfodConnectionBase {
  constructor(config, connectionManager) {
    super();
    this.protocol = 'ble';
    this.config = config;
    this.connectionManager = connectionManager;
    this.device = null;
    this.server = null;
    this.service = null;
    this.characteristicTX = null;
    this.characteristicRX = null;
    this.connected = false;
    this.readBuffer = '';
    this.responseResolve = null;
    this.responseReject = null;
    // Persistent decoder so multi-byte UTF-8 characters split across BLE notifications decode correctly
    this._decoder = new TextDecoder('utf-8', { fatal: false });
    this.timeoutId = null;  // Store timeout ID so it can be cancelled

    // UART Service UUIDs (Nordic UART Service)
    this.UART_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E'.toLowerCase();
    this.UART_TX_CHAR_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'.toLowerCase();
    this.UART_RX_CHAR_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'.toLowerCase();



    console.log(`[BLE_CONNECTION] Created with UART service filtering`);
  }

  /**
   * Connect to a BLE device
   * Uses previously granted device if available, otherwise prompts user with filtering
   */
  async connect() {
    // Fresh decoder for each connect so no stale partial-character state carries over
    this._decoder = new TextDecoder('utf-8', { fatal: false });
    try {
      // Check if Web Bluetooth API is supported
      if (!('bluetooth' in navigator)) {
        const errorMsg = 'Web Bluetooth API is not supported in this browser.\n\n' +
                        'Bluetooth connections require:\n' +
                        '• Chrome (version 56 or later)\n' +
                        '• Edge (version 79 or later)\n' +
                        '• Opera (version 43 or later)\n\n' +
                        'Please use a supported browser for Bluetooth connections.';
        throw new Error(errorMsg);
      }

      // Prompt user to select BLE device
      console.log('[BLE_CONNECTION] Prompting user to select BLE device...');

      try {
        // Request device from user with UART service filter
        this.device = await navigator.bluetooth.requestDevice({
          filters: [{services: [this.UART_SERVICE_UUID]}]
        });
        console.log(`[BLE_CONNECTION] User selected device: ${this.device.name || 'Unknown Device'}`);

        // Try to connect to the newly selected device
        await this.connectToDevice(this.device);
      } catch (selectError) {
        console.error('[BLE_CONNECTION] Device selection or connection failed:', selectError);

        const errorMsg = 'BLE device could not be connected. Please ensure:\n' +
                        '1. The device is powered on\n' +
                        '2. The device is within range\n' +
                        '3. The device is advertising the UART service';
        throw new Error(errorMsg);
      }

      console.log('[BLE_CONNECTION] BLE connection established successfully');

    } catch (error) {
      console.error('[BLE_CONNECTION] Connection failed:', error);
      throw error;
    }
  }

  /**
   * Connect to a specific BLE device and set up characteristics
   */
  async connectToDevice(device) {
    console.log(`[BLE_CONNECTION] Connecting to device: ${device.name || 'Unknown Device'}`);

    // Set up disconnect listener
    device.addEventListener('gattserverdisconnected', () => this.onDisconnected());

    // Show the same connecting modal the proxy adapter uses, with
    // per-phase status text driven by the JS await boundaries here.
    // Hide on completion or any thrown error in this block.
    this._showConnectingDialog(device.name || 'BLE device');
    try {
      this._updateConnectingDialog('connecting');
      this.server = await device.gatt.connect();
      console.log('[BLE_CONNECTION] Connected to GATT Server');

      this._updateConnectingDialog('discovering');
      this.service = await this.server.getPrimaryService(this.UART_SERVICE_UUID);
      console.log('[BLE_CONNECTION] UART Service discovered');

      this.characteristicRX = await this.service.getCharacteristic(this.UART_RX_CHAR_UUID);
      console.log('[BLE_CONNECTION] RX Characteristic discovered');

      // Set up notification handler
      this.characteristicRX.addEventListener('characteristicvaluechanged', (event) => {
        this.handleCharacteristicChange(event);
      });

      this._updateConnectingDialog('subscribing');
      await this.characteristicRX.startNotifications();
      console.log('[BLE_CONNECTION] Notifications started');

      // Get TX characteristic (we transmit, device receives)
      this.characteristicTX = await this.service.getCharacteristic(this.UART_TX_CHAR_UUID);
      console.log('[BLE_CONNECTION] TX Characteristic discovered');

      this.connected = true;
      this.device = device;
    } finally {
      this._hideConnectingDialog();
    }
  }

  /**
   * Handle disconnect event
   */
  onDisconnected() {
    console.log('[BLE_CONNECTION] Device disconnected');
    this.connected = false;
    this.server = null;
    this.service = null;
    this.characteristicTX = null;
    this.characteristicRX = null;
    // Reset decoder so stale partial-character state from the dropped connection
    // doesn't corrupt the first bytes received on a subsequent reconnect.
    this._decoder = new TextDecoder('utf-8', { fatal: false });
  }

  /**
   * Handle incoming data from BLE device
   * Buffers data until complete response is received
   */
  handleCharacteristicChange(event) {
    const text = this._decoder.decode(event.target.value, { stream: true });
    console.log(`[BLE_CONNECTION] Received data: ${text}`);

    // NOTE: Do NOT reset timeout here - timeout should apply to the entire response,
    // not reset on partial data. Only clear timeout when complete response is received
    // in processReadBuffer()

    // Feed data through shared pipeline: csvCollector, rawDataCollector, processReadBuffer
    this.processIncoming(text);
  }

  /**
   * Send a command via BLE with internal retry logic
   * Retries up to maxRetries times using the same dedup character
   * Only advances dedup on final success
   * @param {string} cmd - The pfod command (e.g., "{.}" or "{dwgName}")
   * @returns {Promise<string>} - Response text (usually JSON)
   */
  async send(cmd) {
    // Auto-connect if not already connected
    if (!this.connected || !this.characteristicTX) {
      console.log('[BLE_CONNECTION] Not connected, connecting now...');
      await this.connect();
    }

    // Diagnostic logging: Check if a previous request is still pending
    if (this.responseResolve || this.responseReject) {
      console.warn(`[BLE_CONNECTION] WARNING: send() called while previous request still pending`);
      console.warn(`[BLE_CONNECTION] This should not happen - queue protection may not be working`);
    }

    // Get dedup character atomically - getCurrentDedupChar() increments for next call
    const cmdWithPrefix = getCurrentDedupChar() + cmd;
    // {!} is the exit/abort command — fire once, never retry (see HTTPAdapter.send).
    const maxRetries = (cmd === '{!}') ? 0 : this.connectionManager.getMaxRetries();
    let lastError = null;

    console.log(`[BLE_CONNECTION] Allocated dedup='${cmdWithPrefix[0]}' for this send()`);

    // Clear response state once at the start - keep accumulated data across retries
    this.readBuffer = '';

    // Retry loop: attempt up to (maxRetries + 1) times
    // Data continues to accumulate in readBuffer across retry attempts
    // All retries use the SAME cmdWithPrefix (dedup already captured)
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[BLE_CONNECTION] Send attempt ${attempt + 1}/${maxRetries + 1}: ${cmdWithPrefix}`);

        // Cancel any previous timeout
        if (this.timeoutId) {
          clearTimeout(this.timeoutId);
          console.log(`[BLE_CONNECTION] Cancelled previous timeout`);
          this.timeoutId = null;
        }

        // NOTE: readBuffer is NOT cleared here - it persists across retries
        // This allows partial responses to accumulate if retries occur

        const responseText = await this.sendOnceInternal(cmdWithPrefix, cmd);

        // Success! Return response (dedup already allocated and advanced at start)
        console.log(`[BLE_CONNECTION] Success on attempt ${attempt + 1} with dedup='${cmdWithPrefix[0]}'`);
        return responseText;
      } catch (error) {
        lastError = error;
        console.warn(`[BLE_CONNECTION] Attempt ${attempt + 1}/${maxRetries + 1} failed: ${error.message}`);

        // If this was the last attempt, throw the error
        if (attempt >= maxRetries) {
          console.error(`[BLE_CONNECTION] All ${maxRetries + 1} attempts exhausted with dedup='${cmdWithPrefix[0]}'. Throwing error back to queue.`);
          throw error;
        }
        // User clicked Exit while we were retrying — abandon remaining attempts.
        if (this.connectionManager.exitPending) {
          console.warn(`[BLE_CONNECTION] exitPending — abandoning ${maxRetries - attempt} remaining retr${(maxRetries - attempt) === 1 ? 'y' : 'ies'}`);
          throw error;
        }

        // Always wait at least 1 s before retrying, regardless of which
        // error triggered the retry — see sleep() doc comment.
        await sleep(1000);

        // Otherwise, retry with same dedup character
        console.log(`[BLE_CONNECTION] Retrying with same dedup='${cmdWithPrefix[0]}'...`);
      }
    }

  }

  /**
   * Send command once via BLE (no retries)
   * @private
   */
  async sendOnceInternal(cmdWithPrefix, originalCmd) {
    // Record send time for performance measurement
    this.sendTime = Date.now();

    // Set up promise for response
    const responsePromise = new Promise((resolve, reject) => {
      this.responseResolve = resolve;
      this.responseReject = reject;

      // Get timeout from connection manager (default 10 seconds)
      const timeout = this.connectionManager.getResponseTimeout();
      console.log(`[BLE_CONNECTION] Setting response timeout to ${timeout === 0 ? 'never' : timeout + 'ms'}`);
      if (timeout !== 0) this.timeoutId = setTimeout(() => {
        if (this.responseReject) {
          if (this.readBuffer.length > 0 && ConnectionManager.messageCollector) {
            ConnectionManager.messageCollector.addMessage('timeout', this.readBuffer, this.protocol);
          }
          this.readBuffer = '';
          this.responseReject(new Error('BLE response timeout - device may not be responding'));
          this.responseResolve = null;
          this.responseReject = null;
          this.timeoutId = null;
        }
      }, timeout);
    });

    // Send the command
    console.log(`[BLE_CONNECTION] Sending: ${cmdWithPrefix} at ${new Date(this.sendTime).toISOString()}`);

    // Record the command being sent (with the dedup prefix)
    if (ConnectionManager.messageCollector) {
      ConnectionManager.messageCollector.addMessage('sent', cmdWithPrefix, 'ble', originalCmd);
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(cmdWithPrefix + '\n'); // Add newline for command termination
    await this.characteristicTX.writeValue(data);

    // Wait for response
    return responsePromise;
  }

  /**
   * Disconnect from the BLE device
   */
  async disconnect() {
    console.log('[BLE_CONNECTION] Disconnecting...');

    this.connected = false;

    try {
      // Stop notifications
      if (this.characteristicRX) {
        await this.characteristicRX.stopNotifications();
        console.log('[BLE_CONNECTION] Notifications stopped');
      }

      // Disconnect GATT server
      if (this.server && this.server.connected) {
        this.server.disconnect();
        console.log('[BLE_CONNECTION] GATT server disconnected');
      }

      // Clear references
      this.device = null;
      this.server = null;
      this.service = null;
      this.characteristicTX = null;
      this.characteristicRX = null;

      console.log('[BLE_CONNECTION] Disconnected successfully');
    } catch (error) {
      console.error('[BLE_CONNECTION] Error during disconnect:', error);
      throw error;
    }
  }

  /**
   * Check if BLE connection is active
   */
  isConnected() {
    return this.connected && this.server && this.server.connected;
  }
}

// DesignerVirtualAdapter lives under designer/adapter.js — the entire
// designer subsystem stays self-contained.  The 'designer' case in
// initializeAdapter() above references it as a runtime global, which
// works as long as the build includes designer/adapter.js (it must
// load AFTER connectionManager.js because the adapter extends
// PfodConnectionBase, defined here).

// Make classes available globally for browser use
window.ConnectionManager = ConnectionManager;
window.HTTPConnection = HTTPConnection;
// window.SerialConnection = SerialConnection; // NOT USED — proxy only
window.SerialProxyConnection = SerialProxyConnection;
window.TCPProxyConnection    = TCPProxyConnection;
window.BLEProxyConnection    = BLEProxyConnection;
// window.BLEConnection = BLEConnection; // NOT USED — proxy only
