/*
   keepAlive.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// KeepAlive polling methods for the DrawingViewer class.
// Assigned to DrawingViewer.prototype after the class is defined in pfodWeb.js.
// Sends periodic { } commands on Serial/BLE connections to collect rawData.
//
// State read:    csvLoaded, connectionManager.protocol, keepAliveActive, keepAliveTimer,
//                keepAliveInterval, requestQueue, sentRequest
// State written: keepAliveActive, keepAliveTimer
// Calls:         navigationAndQueue:addToRequestQueue
// Called by:     connectionSetup:setupEventListeners [startKeepAlivePolling after connect],
//                drawingProcessing:processPendingResponses [scheduleNextKeepAlive],
//                requestQueue:processRequestQueue [scheduleNextKeepAlive after each response]

Object.assign(DrawingViewer.prototype, {

  /**
   * Start keepAlive polling for TCP/IP Socket connections.
   *
   * Sends `{ }` (open brace, space, close brace) every N seconds while
   * the connection is idle, where N is the value the user picked from
   * the connection-prompt KeepAlive dropdown (0/5/10/20/30 — 0 means
   * disabled).  pfod treats `{ }` as a no-op cmd: the device acks
   * without changing menu state, which both prevents NAT pinholes
   * from expiring and keeps the device's own session alive.
   *
   * The timer is reset on every cmd / refresh / menuRefresh / touch
   * response (via scheduleNextKeepAlive() called from
   * requestQueue.js) but **not** on a dataRefresh response (the
   * dataRefresh branch in requestQueue early-returns before the
   * keepAlive reset call).
   *
   * Only fires for TCP/IP — HTTP has dataRefresh, Serial/BLE have a
   * continuous byte stream so a protocol-level keepAlive is redundant.
   */
  startKeepAlivePolling() {
    // Never start keepAlive when CSV was loaded - no server connection exists
    if (this.csvLoaded) {
      console.log('[KEEPALIVE] Not starting - CSV loaded mode (no server connection)');
      return;
    }

    // KeepAlive is TCP/IP-Socket-only — see method docstring for rationale.
    if (this.connectionManager.protocol !== 'tcp') {
      console.log(`[KEEPALIVE] Not starting - protocol is "${this.connectionManager.protocol}", keepAlive is TCP-only`);
      return;
    }

    // Read user-configured interval (0 = disabled).
    const sec = (typeof this.connectionManager.getKeepAliveSec === 'function')
      ? this.connectionManager.getKeepAliveSec() : 0;
    if (sec === 0) {
      console.log('[KEEPALIVE] Not starting - keepAliveSec=0 (disabled)');
      return;
    }
    this.keepAliveInterval = sec * 1000;

    // Already active - don't start again
    if (this.keepAliveActive) {
      console.log('[KEEPALIVE] Already active - not starting again');
      return;
    }

    console.log(`[KEEPALIVE] Starting keepAlive polling at ${sec}s interval`);
    this.keepAliveActive = true;
    this.scheduleNextKeepAlive();
  },

  /**
   * Stop keepAlive polling
   */
  stopKeepAlivePolling() {
    if (this.keepAliveTimer) {
      clearTimeout(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    this.keepAliveActive = false;
    console.log('[KEEPALIVE] Stopped keepAlive polling');
  },

  /**
   * Schedule the next keepAlive command.
   *
   * Called from requestQueue.processRequestQueue() after every
   * non-dataRefresh response — that's how the timer resets when real
   * traffic flows.  The dataRefresh branch in requestQueue.js
   * early-returns before this call, so dataRefresh responses do
   * **not** reset the keepAlive countdown (that would prevent it from
   * ever firing while datapolling is active).
   */
  scheduleNextKeepAlive() {
    // Only TCP/IP arms this timer (mirrors startKeepAlivePolling's gate).
    if (this.connectionManager && this.connectionManager.protocol !== 'tcp') {
      return;
    }
    if (!this.keepAliveActive) {
      return;
    }

    // Clear any existing timer
    if (this.keepAliveTimer) {
      clearTimeout(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }

    // Schedule next keepAlive after the configured interval.  The
    // interval was set from getKeepAliveSec() in startKeepAlivePolling.
    this.keepAliveTimer = setTimeout(() => {
      this.sendKeepAlive();
    }, this.keepAliveInterval);
  },

  /**
   * Send a keepAlive command { } to collect rawData
   * Independent of menu/drawing refresh settings
   * Only sends if request queue is empty
   */
  sendKeepAlive() {
    if (!this.keepAliveActive) {
      return;
    }

    // Don't add keepAlive if queue is not empty - there's already a request pending
    if (this.requestQueue.length > 0) {
      console.log('[KEEPALIVE] Skipping - requestQueue not empty (length=' + this.requestQueue.length + ')');
      // Schedule next attempt - the response from queued request will trigger reschedule
      this.scheduleNextKeepAlive();
      return;
    }

    // Also skip if there's already a request in flight
    if (this.sentRequest) {
      console.log('[KEEPALIVE] Skipping - request already in flight: ' + this.sentRequest.requestType);
      // Schedule next attempt
      this.scheduleNextKeepAlive();
      return;
    }

    console.log('[KEEPALIVE] Sending keepAlive command { }');

    // Send keepAlive command through queue
    // Use special requestType 'keepAlive' so we can track it
    this.addToRequestQueue('{ }', {}, null, 'keepAlive', false);
  }

});
