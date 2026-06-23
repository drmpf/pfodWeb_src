/*
   navigationAndQueue.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Request queue, menu/command navigation stacks, and scheduling helpers
// for the DrawingViewer class.
// Assigned to DrawingViewer.prototype after the class is defined in pfodWeb.js.
//
// State read:    chartOnlyMode, menuNavStack, menuCmdSet, menuCache, isUpdating, touchState,
//                requestQueue, sentRequest,
//                updateTimer, dataRefreshTimer, dataRefreshActive, _isProcessingQueue,
//                requestTracker, connectionManager.protocol, csvLoaded
// State written: menuNavStack, menuCmdSet, menuCache, requestQueue, _isProcessingQueue,
//                updateTimer, dataRefreshTimer, requestTracker, currentRefreshCmd,
//                currentRefreshCmdType, initialRequestQueued
// Calls:         resizeAndDimensions:updateCanvasMessage, chartAndRawData:openChartDirectly,
//                requestQueue:processRequestQueue,
//                keepAliveAndHttp:fetchRefresh [via updateTimer setTimeout]
// Called by:     all files — central hub for queue operations and scheduling
//
// QUEUE PRIORITY MODEL
// --------------------
// Mirrors java/QueuedCmdEmum.java + pfodAppState.java::sendMessageAndWait.
// Lower ordinal = higher priority (popped first by requestQueue.shift()).
// Overridable types replace an existing same-target queued entry in place
// (latest wins) — that's how repeated refresh / keepAlive / drag / partialSlider
// can never accumulate.  Non-overridable types are sorted-inserted by ordinal,
// so a 'back' or 'touch' always sits ahead of any pending refresh.
//
// Drawing-related request types — what they actually fetch:
//   menuItemDwg       The drawing referenced by ONE drawing item in the
//                     current menu.  A menu has zero or more drawing items
//                     (no concept of a single "main" drawing for a menu).
//                     One menuItemDwg request is queued per drawing item.
//   insertDwg         A child drawing referenced by an insertDwg primitive
//                     inside another drawing's item list.  Discovered during
//                     processDrawingData scan of a parent drawing's response.
//   refresh           Timer auto-refresh of a previously fetched menuItemDwg.
//   refresh-insertDwg Timer auto-refresh of a previously fetched insertDwg.
//   menuRefresh       Timer auto-refresh of the current menu (NOT a drawing).
//   mainMenu          Initial main-menu request after connection ({.}).

const RequestOrdinal = {
  exitAbort:           0,
  authentication:      1,
  back:                2,
  mainMenu:            2,
  menuItemDwg:         2,
  touch:               3,
  insertDwg:           4,
  drag:                5,
  partialSlider:       6,
  'refresh-insertDwg': 7,
  menuRefresh:         8,
  refresh:             9,
  dataRefresh:        10,
  keepAlive:          11,
};

const RequestOverridable = new Set([
  'drag',
  'partialSlider',
  'refresh-insertDwg',
  'menuRefresh',
  'refresh',
  'dataRefresh',
  'keepAlive',
]);

function ordinalOf(t)     { return RequestOrdinal[t] ?? 999; }
function isOverridable(t) { return RequestOverridable.has(t); }

Object.assign(DrawingViewer.prototype, {

  // Identity key for an overridable request — two queued requests collide iff
  // they have the same requestType AND the same _replaceKeyOf.  Each
  // overridable type names its own identity field; the singletons return ''
  // so all entries of that type collapse to one.
  //
  //   drag              → touchZoneInfo.cmd                    (one drag per touchzone)
  //   partialSlider     → cmd                                  (one slider per slider-cmd)
  //   refresh,
  //   refresh-insertDwg → loadCmd from cmd (via _extractCmdToken)
  //                                                            (one refresh per drawing — c2
  //                                                             and c4 are independent)
  //   menuRefresh,
  //   dataRefresh,
  //   keepAlive         → ''                                   (singletons — only one queued
  //                                                             globally at any time)
  _replaceKeyOf(req) {
    switch (req.requestType) {
      case 'drag':
        return req.touchZoneInfo ? req.touchZoneInfo.cmd : null;
      case 'partialSlider':
        return req.cmd;
      case 'refresh':
      case 'refresh-insertDwg':
        return this._extractCmdToken(req.cmd) || null;
      case 'menuRefresh':
      case 'dataRefresh':
      case 'keepAlive':
        return '';
      default:
        throw new Error(`_replaceKeyOf: requestType "${req.requestType}" is not overridable — extend RequestOverridable AND _replaceKeyOf together`);
    }
  },

  // Send initial {.} (or versioned equivalent) to request the main menu from the device.
  // Resets navigation state and seeds menuCmdSet from the menu cache for this connection.
  // In chart-only mode, opens the chart directly instead.
  queueInitialRequest() {
    // If in chart-only mode, skip the main menu request and open chart display directly
    if (this.chartOnlyMode) {
      console.log('[CHART_MODE] CHART ONLY MODE - Skipping main menu request, opening chart display');
      this.openChartDirectly();
      return;
    }

    // Clear exit block so the queue accepts commands for the new connection
    this.exitPending = false;

    // Reset menu navigation stack and known-menu-cmd set for the new connection
    this.menuNavStack = [];
    this.menuCmdSet = new Set();
    console.log('[MENU_NAV] Stack and menuCmdSet reset on new connection');

    // Initialise menu cache for this connection endpoint
    const connectionId = window.pfodConnectionManager ? window.pfodConnectionManager.getConnectionId() : 'unknown';
    this.menuCache = new PfodMenuCache(connectionId);
    console.log('[MENU_CACHE] Initialised for connection:', connectionId);

    // Restore menuCmdSet from any previously cached menu cmds for this connection
    const cachedMenuCmds = this.menuCache.getMenuCmds();
    for (const bareCmd of cachedMenuCmds) {
      this.menuCmdSet.add('{' + bareCmd + '}');
    }
    if (cachedMenuCmds.length > 0) {
      console.log('[MENU_NAV] Restored menuCmdSet from cache:', JSON.stringify([...this.menuCmdSet]));
    }

    // Use a versioned initial request if we have a cached main menu, otherwise plain {.}
    const cachedInitialVersion = this.menuCache.getMenuVersion('.');
    const startupCmd = cachedInitialVersion ? ('{' + cachedInitialVersion + ':.}') : '{.}';
    if (cachedInitialVersion) {
      console.log('[MENU_CACHE] Sending versioned initial request:', startupCmd);
    } else {
      console.log('Sending {.} request without version to get drawing name from server via session context');
    }
    console.log(`Queueing initial request with command: ${startupCmd}`);

    // Update canvas to show that we're requesting the main menu
    this.updateCanvasMessage('Requesting Main Menu ...');

    // Add to request queue with mainMenu type - not a drawing request
    const requestType = 'mainMenu';
    // Mark this as the initial request for special timeout handling
    this.initialRequestQueued = true;
    this.addToRequestQueue(startupCmd, null, null, requestType, true);
  },

  // Schedule the next auto-refresh timer.
  // Computes the soonest due time across all items with non-zero refresh rates
  // (menu reRequestMs and per-drawing refresh), using itemRefreshTimes for last-response timestamps.
  scheduleNextUpdate() {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }

    const hasOpenDialog = window.pfodWebMouse.touchActionInputOpen;
    if (this.requestQueue.length > 0 || this.sentRequest || hasOpenDialog) {
      console.log('[REFRESH] Skipping schedule - busy');
      return;
    }

    const now = Date.now();
    let soonestNextDue = Infinity;

    // Per-item effective rate.  rate >= 250 used as-is.  rate > 0 but < 250
    // is clamped up to 250 ms (network/device floor).  rate === 0 means
    // "do not auto-refresh" — caller filters via the entry value being 0.
    const effectiveRate = (rate) => (rate >= 250 ? rate : 250);

    // itemRefreshTimes invariant: every item in dm.drawings (and 'menu'
    // when a menu is shown) MUST have an entry.  Value semantics:
    //   0      → no auto-refresh for this item.  Either no first response
    //            received yet, OR the last response carried rate 0 / no
    //            rate specified.  Either way, do not schedule.
    //   > 0    → last-response timestamp; item's rate is > 0; schedule.
    // A missing entry is a registration-path bug — throw so it surfaces.

    // Per-item nextDue.  When NOT overdue, fire at lastResp+rate.
    // When OVERDUE (lastResp+rate already past), fire at now+rate — i.e.
    // delay one full rate from now, NOT immediately.  This keeps a
    // minimum gap of `rate` between consecutive fires so missed cycles
    // don't bundle up into a burst of back-to-back refreshes.
    const itemNextDue = (lastResp, rate) => {
      const eff = effectiveRate(rate);
      const due = lastResp + eff;
      return due > now ? due : now + eff;
    };

    // Refreshes only apply in menu-mode — that's the only mode where menus
    // and their embedded drawings are rendered.  Chart, rawdata, streaming,
    // and input modes have nothing to refresh; skip scheduling so the timer
    // stays disarmed until the user returns to menu-mode.
    if (document.body.className === 'menu-mode') {
      if (!this.itemRefreshTimes.has('menu')) {
        throw new Error('[REFRESH] itemRefreshTimes has no entry for "menu" — registration path missed; must be initialised to null when the menu is first shown');
      }
      const lastResp = this.itemRefreshTimes.get('menu');
      if (lastResp > 0) {
        const menuRate = window.pfodMenuDisplay?._currentMenu?.header?.reRequestMs || 0;
        const nextDue = itemNextDue(lastResp, menuRate);
        if (nextDue < soonestNextDue) soonestNextDue = nextDue;
      }

      for (const dwgName of this.redraw.redrawDrawingManager.drawings) {
        if (!this.itemRefreshTimes.has(dwgName)) {
          throw new Error(`[REFRESH] itemRefreshTimes has no entry for "${dwgName}" — registration path missed; must be initialised to null when the drawing is added to dm.drawings`);
        }
        const lastResp = this.itemRefreshTimes.get(dwgName);
        if (lastResp > 0) {
          const rate = this.redraw.redrawDrawingManager.drawingsData[dwgName]?.data?.refresh || 0;
          const nextDue = itemNextDue(lastResp, rate);
          if (nextDue < soonestNextDue) soonestNextDue = nextDue;
        }
      }
    }

    // No eligible items (every entry is 0) — skip scheduling entirely.
    // Must not compute delay against Infinity (would give a bogus
    // setTimeout argument).
    if (soonestNextDue === Infinity) {
      console.log('[REFRESH] No auto-refresh items eligible — no timer scheduled');
      return;
    }

    // delay = soonestNextDue - now.  Always > 0 by construction
    // (itemNextDue returns now+rate when overdue, lastResp+rate otherwise
    // and lastResp+rate > now in that branch).
    const delay = soonestNextDue - now;
    console.log(`[REFRESH] Scheduling next update in ${delay}ms`);
    this.updateTimer = setTimeout(() => this.fetchRefresh(), delay);
  },

  /**
   * Schedule a dataRefresh (pfodWeb?cmd=) 1 second after the last send.
   * Direct-HTTP only. Cancelled and rescheduled whenever a non-dataRefresh request is queued.
   * When the timer fires it adds a 'dataRefresh' entry to the request queue.
   */
  scheduleDataRefresh() {
    // Direct-HTTP-only.  All other transports (native Serial / BLE +
    // the *ProxyConnection adapters that use SSE) deliver device bytes
    // via push — no need for the 1-second polling tax.  Gating on
    // protocol === 'http' is sharper than the previous capability
    // check (sendDataRefresh-defined-on-adapter) because the proxy
    // adapters used to inherit sendDataRefresh from HTTPConnection
    // and trip the check incorrectly.  The all-SSE refactor moved
    // the proxy adapters off HTTPConnection entirely, but keep the
    // protocol gate as defence-in-depth.
    if (!this.connectionManager
     || this.connectionManager.protocol !== 'http') return;
    if (this.csvLoaded) return;
    if (this.dataRefreshTimer) {
      clearTimeout(this.dataRefreshTimer);
    }
    this.dataRefreshTimer = setTimeout(() => {
      this.dataRefreshTimer = null;
      // Skip if anything else is queued or in-flight: a real cmd (touch,
      // menuRefresh, drawingRefresh, etc.) is already going to drain any
      // streaming bytes the device has accumulated, so an empty-cmd poll
      // is redundant.  When that cmd's response completes, scheduleData-
      // Refresh fires again and re-arms a fresh 1 s timer.
      if (this.requestQueue.length > 0 || this.sentRequest) {
        console.log('[DATAREFRESH] skipped — queue or sentRequest busy');
        return;
      }
      this.addToRequestQueue('', null, null, 'dataRefresh');
    }, 1000);
  },

  // Find an existing queue entry that an overridable req should replace.
  // Two requests collide iff same requestType AND same _replaceKeyOf().
  // See _replaceKeyOf for the per-type identity rules.
  _findExistingMatch(req) {
    const reqKey = this._replaceKeyOf(req);
    return this.requestQueue.findIndex(r =>
      r.requestType === req.requestType && this._replaceKeyOf(r) === reqKey);
  },

  // Insert a request into the queue using the ordinal/overridable model.
  // Overridable entries replace an existing same-target entry in place
  // (latest wins).  Non-overridable entries are sorted-inserted by ordinal
  // ascending, so requestQueue.shift() always returns the highest-priority
  // pending entry.
  addQueuedCommand(req) {
    const inOrd = ordinalOf(req.requestType);

    if (isOverridable(req.requestType)) {
      const matchIdx = this._findExistingMatch(req);
      if (matchIdx >= 0) {
        const old = this.requestQueue[matchIdx];
        console.log(`[QUEUE] Replace at idx=${matchIdx}: ${old.requestType}(${old.cmd}) <- ${req.requestType}(${req.cmd})`);
        this.requestQueue[matchIdx] = req;
        return true;
      }
    }

    for (let i = 0; i < this.requestQueue.length; i++) {
      if (ordinalOf(this.requestQueue[i].requestType) > inOrd) {
        this.requestQueue.splice(i, 0, req);
        console.log(`[QUEUE] Insert at idx=${i}: ${req.requestType}(${req.cmd}) ord=${inOrd}`);
        return true;
      }
    }
    this.requestQueue.push(req);
    console.log(`[QUEUE] Append at end: ${req.requestType}(${req.cmd}) ord=${inOrd}`);
    return true;
  },

  // Add a request to the queue using the ordinal/overridable priority model
  // (see top of file for the model description).  Hard drops are handled here;
  // ordering and dedup are delegated to addQueuedCommand.
  //
  // Parameters:
  //   cmd           - pfod command string to send
  //   options       - reserved (pass null)
  //   touchZoneInfo - touch zone descriptor (null if not a touch)
  //   requestType   - one of the keys in RequestOrdinal (above)
  //   isInitial     - true only for the very first request after connection
  //
  // The queued request object carries only cmd + requestType + bookkeeping —
  // no drawingName field.  All routing decisions re-derive the loadCmd from
  // cmd/requestType at the consumer:
  //   - Refresh dedup (_replaceKeyOf) uses _extractCmdToken(req.cmd).
  //   - Merged-update flag uses requestType.
  //   - Response-side data.name uses _extractCmdToken / _resolveLoadCmdFromRequest.
  addToRequestQueue(cmd, options, touchZoneInfo, requestType = 'unknown', isInitial = false) {
    console.warn(`[QUEUE] Adding request "${cmd}" (type: ${requestType}, isInitial: ${isInitial})`);
    console.log(`[QUEUE] Queue length before add: ${this.requestQueue.length}, sentRequest: ${this.sentRequest ? this.sentRequest.cmd + '(' + this.sentRequest.requestType + ')#' + this.sentRequest._id : 'null'}`);

    // ----- Hard drops -----
    if (requestType === 'unknown') {
      console.error(`[QUEUE] Error: Unknown requestType`);
      return;
    }

    // {!} wipes the queue and blocks further additions
    if (requestType === 'exitAbort') {
      console.log(`[QUEUE_MUTATION] exitAbort - clearing entire queue (was length=${this.requestQueue.length}):`, JSON.stringify(this.requestQueue.map(r => `${r.cmd}(${r.requestType})`)));
      this.requestQueue = [];
      this.exitPending = true;
      // Mirror to the connectionManager so the adapter's retry loop can see
      // it without plumbing — used to abandon remaining retries on the
      // in-flight cmd as soon as its current attempt times out.
      if (this.connectionManager) this.connectionManager.exitPending = true;
    }
    if (this.exitPending && requestType !== 'exitAbort') {
      console.log(`[QUEUE] exitPending — ignoring new request (type: ${requestType})`);
      return;
    }

    // Block menu auto-refresh while the user has the pointer down on the menu.
    // menuMouseDown is set by pfodMenuDisplay's pointerdown/pointerup listeners on
    // the scroll area, covering HTML buttons, sliders, toggles, and dwg canvases.
    if (requestType === 'menuRefresh' && window.pfodMenuDisplay?.menuMouseDown) {
      console.log('[QUEUE] menuRefresh skipped — pointer is down in menu; rescheduling');
      this.scheduleNextUpdate();
      return;
    }

    // Drop a duplicate touch/drag/slider on the same target while one of the
    // same type is already in flight.  Mirrors Java's pfodAppState.java
    // :1156-1166 DWG_TOUCH/DOWN/CLICK guard.  Compare the menuItem identifier
    // parsed from each cmd (the leading [A-Za-z_]\w* token after "{"/"V<n>:"),
    // not request.drawingName — the cmd is the canonical identifier.
    if (this.sentRequest
        && this.sentRequest.requestType === requestType
        && (requestType === 'touch'
            || requestType === 'drag'
            || requestType === 'partialSlider')) {
      const inFlightTok = this._extractCmdToken(this.sentRequest.cmd);
      const newTok      = this._extractCmdToken(cmd);
      if (inFlightTok && inFlightTok === newTok) {
        console.log(`[QUEUE] Dropping ${requestType} for "${newTok}" (cmd=${cmd}) — same-type already in flight`);
        return;
      }
    }

    this.setProcessingQueue(true);

    // Tracker bookkeeping — key on the cmd-derived identifier so the tracker
    // reflects the touched item (touch) / loadCmd (insertDwg) regardless of
    // whatever drawingName was passed.
    if (requestType === 'touch') {
      const tok = this._extractCmdToken(cmd);
      if (tok) {
        this.requestTracker.touchRequests.add(tok);
        console.log(`[QUEUE] Tracking touch request for "${tok}"`);
      }
    } else if (requestType === 'insertDwg') {
      const tok = this._extractCmdToken(cmd);
      if (tok) {
        this.requestTracker.insertDwgRequests.add(tok);
        console.log(`[QUEUE] Tracking insertDwg request for "${tok}"`);
      }
    }

    // Insert via ordinal/overridable rules (replaces the old per-type filter blocks)
    const _reqId = ++this._nextRequestId;
    this.addQueuedCommand({
      cmd: cmd,
      touchZoneInfo: touchZoneInfo,
      requestType: requestType,
      isInitial: isInitial,
      _id: _reqId
    });
    console.log(`[REQ_ID] #${_reqId} = ${requestType} cmd="${cmd}"`);
    console.log(`[QUEUE_MUTATION] After add, queue (length=${this.requestQueue.length}):`, JSON.stringify(this.requestQueue.map(r => `${r.cmd}(${r.requestType})#${r._id}`)));

    this.processRequestQueue();
  },

  // Return true if cmd is the pfod empty-response '{}'.
  // Used to detect a device acknowledging a command with no new drawing data.
  isEmptyCmd(cmd) {
    if (!cmd) {
      return false
    }
    if (cmd.length < 2) {
      return false;
    }
    let cmd0 = cmd[0].trim();
    let cmd1 = cmd[1].trim();
    if ((cmd0 == '{') && (cmd1 == '}')) {
      console.log(`[DRAWING_DATA] Received empty cmd response `);
      return true; // Successfully handled - no drawing data to process
    }
    return false;
  },

  // Atomic helper methods for queue processing state
  isProcessingQueue() {
    return this._isProcessingQueue;
  },

  setProcessingQueue(value) {
    const oldValue = this._isProcessingQueue;
    this._isProcessingQueue = value;
    console.log(`[QUEUE_STATE] setProcessingQueue(${value}) - oldValue: ${oldValue}, newValue: ${value}`);
    return value;
  },

  trySetProcessingQueue(expectedValue, newValue) {
    if (this._isProcessingQueue === expectedValue) {
      this._isProcessingQueue = newValue;
      console.log(`[QUEUE_STATE] trySetProcessingQueue(${expectedValue}, ${newValue}) - success: true`);
      return true;
    } else {
      console.log(`[QUEUE_STATE] trySetProcessingQueue(${expectedValue}, ${newValue}) - success: false, current: ${this._isProcessingQueue}`);
      return false;
    }
  },

  // Return the versioned form of a menu command if a cached version exists, otherwise return cmd unchanged.
  // e.g. '{.}' → '{V6:.}' when the cache holds version V6 for the main menu.
  versionedMenuCmd(cmd) {
    if (!this.menuCache) return cmd;
    const bareCmd = cmd.slice(1, -1); // '{.}' → '.'
    const ver = this.menuCache.getMenuVersion(bareCmd);
    if (ver) {
      const versioned = '{' + ver + ':' + bareCmd + '}';
      console.log('[MENU_CACHE] versionedMenuCmd:', cmd, '→', versioned);
      return versioned;
    }
    return cmd;
  },

  /**
   * Push a command onto the menu navigation stack.
   * If the command is already present in the stack, all entries above it are removed
   * (circular reference prevention) and it becomes the top — no duplicate is added.
   *
   * @param {string} cmd - The pfod command that produced a full menu response
   */
  pushMenuNavCmd(cmd) {
    const existingIndex = this.menuNavStack.indexOf(cmd);
    if (existingIndex !== -1) {
      // Command already in stack — trim everything above to break the loop
      this.menuNavStack.length = existingIndex + 1;
      console.log('[MENU_NAV] Circular ref removed - stack trimmed to:', JSON.stringify(this.menuNavStack));
      return;
    }
    this.menuNavStack.push(cmd);
    console.log('[MENU_NAV] Pushed:', cmd, '- stack:', JSON.stringify(this.menuNavStack));
  },

  // Update the drawing command navigation stack when a new drawing response arrives.
  // Skipped for refresh (no position change). For back navigation, currentRefreshCmd is
  // updated to the returned-to page without pushing to commandStack (moving backward).
  updateNavigationStack(request) {
    // Skip stack updates for refresh types — these don't change the navigation position
    if (request.requestType === 'refresh' || request.requestType === 'refresh-insertDwg' || request.requestType === 'menuRefresh') {
      console.log('[TOOLBAR] Skipping stack update for request type:', request.requestType);
      return;
    }
    // For back navigation update currentRefreshCmd to reflect where we returned to,
    // but don't push the old currentRefreshCmd to commandStack (we're moving backward).
    // Source the cmd from menuNavStack top (not request.cmd) so error-recovery
    // paths that pop the stack further (e.g. responseHandlers' uncached-{;}
    // fallback) are honoured here without each caller having to also write
    // currentRefreshCmd themselves.  In the success case top === bareCmd of
    // request.cmd, so versionedMenuCmd(top) produces the same value.
    if (request.requestType === 'back') {
      const top = this.menuNavStack.length > 0
        ? this.menuNavStack[this.menuNavStack.length - 1]
        : '{.}';
      this.currentRefreshCmd = this.versionedMenuCmd(top);
      this.currentRefreshCmdType = request.requestType;
      console.log('[TOOLBAR] Back navigation - updated currentRefreshCmd to:', this.currentRefreshCmd, '(menuNavStack top:', top + ')');
      return;
    }

    // Push current command to stack if different from top
    if (this.currentRefreshCmd) {
      if (this.commandStack.length === 0 || this.currentRefreshCmd !== this.commandStack[this.commandStack.length - 1]) {
        this.commandStack.push(this.currentRefreshCmd);
        console.log('[TOOLBAR] Pushed to stack (navigation):', this.currentRefreshCmd);
      }
    }
    // Update current command to the new display
    this.currentRefreshCmd = request.cmd;
    this.currentRefreshCmdType = request.requestType;
    console.log('[TOOLBAR] Updated currentRefreshCmd (navigation):', this.currentRefreshCmd, 'type:', request.requestType);
  },

  // Clear all pending requests from queue (keeps sentRequest intact).
  // Called before sending a back/refresh command to discard queued stale requests.
  clearPendingQueue() {
    const clearTime = Date.now();
    const queueLength = this.requestQueue.length;
    console.log(`[QUEUE] Clearing queue at ${clearTime}, length=${queueLength}, sentRequest: ${this.sentRequest ? this.sentRequest.cmd + '(' + this.sentRequest.requestType + ')#' + this.sentRequest._id : 'null'}`);
    console.log(`[QUEUE_MUTATION] clearPendingQueue contents before clear (length=${queueLength}):`, JSON.stringify(this.requestQueue.map(r => `${r.cmd}(${r.requestType})#${r._id}`)));
    this.requestQueue = [];
    console.log(`[QUEUE] Cleared ${queueLength} pending requests at ${Date.now()}, elapsed: ${Date.now() - clearTime}ms`);
  }

});
