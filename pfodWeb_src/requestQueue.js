/*
   requestQueue.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Request queue processor — dequeues, sends, and dispatches responses.
// Assigned to DrawingViewer.prototype after the class is defined in pfodWeb.js.
//
// State read:    requestQueue, sentRequest, touchState, pendingResponseQueue,
//                hasReceivedFirstResponse, jsonErrorAlertShown, connectionManager, dataRefreshActive,
//                _isProcessingQueue
// State written: requestQueue, sentRequest, pendingResponseQueue, hasReceivedFirstResponse,
//                jsonErrorAlertShown, dataRefreshActive,
//                redraw.redrawDrawingManager (via handleDwgResponse + merger)
// Calls:         navigationAndQueue:setProcessingQueue, navigationAndQueue:scheduleNextUpdate,
//                navigationAndQueue:scheduleDataRefresh, navigationAndQueue:isEmptyCmd,
//                drawingProcessing:redrawCanvas,
//                drawingMerger.mergeAllDrawings, redraw.performRedraw,
//                responseHandlers:handleNonDwgResponse, responseHandlers:handleDwgResponse,
//                resizeAndDimensions:updateCanvasMessage, resizeAndDimensions:clearCanvasMessage,
//                keepAlive:scheduleNextKeepAlive
// Called by:     navigationAndQueue:addToRequestQueue,
//                drawingProcessing:processPendingResponses,
//                chartAndRawData:exitChartDisplay [via setTimeout]
//
// Response shape classification, AllowedResponseShapes table, and
// isResponseShapeValidFor / validateResponseAgainstRequest live in
// responseHandlers.js — those are response-handling concerns, not queue
// mechanics.  This file uses validateResponseAgainstRequest via the
// DrawingViewer prototype.

Object.assign(DrawingViewer.prototype, {

  // Returns true when the post-response repaint should be deferred:
  // while the mouse is down, or while a real (non-refresh) request is
  // still outstanding (in flight or queued) — e.g. a button cmd whose
  // response will set the final state.  Routine refresh responses
  // repaint immediately as they arrive.
  shouldDeferRedraw() {
    if (this.touchState.isDown) {
      return true;
    }
    const isNonRefreshType = r =>
        r.requestType !== 'refresh' && r.requestType !== 'refresh-insertDwg';
    return (this.sentRequest && isNonRefreshType(this.sentRequest)) ||
           this.requestQueue.some(isNonRefreshType);
  },

  // Process the request queue
  async processRequestQueue() {
    // Safety check: ensure requestQueue is initialized
    if (!this.requestQueue) {
      console.error('[QUEUE] Error: requestQueue is undefined. Aborting queue processing.');
      return;
    }
    //if (this.sentRequest) {
    //  console.log(`[QUEUE] processRequestQueue have sentRequest, queue length: ${this.requestQueue.length}`);
    //} else {
    //  console.log(`[QUEUE] processRequestQueue no sentRequest, queue length: ${this.requestQueue.length}`);
    //}
    // Try to atomically set processing state from false to true
//    if (!this.trySetProcessingQueue(false, true)) {
//      console.log(`[QUEUE] Already processing queue - skipping`);
//      return;
//    }

    // Return early if there's already a request in flight or queue is empty.
    // On drain (no sentRequest, queue empty), arm the next refresh timer
    // directly — no setTimeout race.  Mirrors Java pfodAppState.java's pattern
    // of having the receive path restart the refresh timer.
    if (this.sentRequest || this.requestQueue.length === 0) {
      if (this.sentRequest) {
        this.setProcessingQueue(true);
      } else {
        this.setProcessingQueue(false);
        if (document.body.className === 'menu-mode') {
          this.redrawCanvas();
        } else {
          console.log('[QUEUE] Not in menu-mode - skipping final redraw. Current mode:', document.body.className);
        }
        this.scheduleNextUpdate();
      }
      return;
    }

    console.log(`[QUEUE] processRequestQueue current queue is:`, JSON.stringify(this.requestQueue, null, 2));

 //    this.setProcessingQueue(true); // have non-zero queue length
    // Remove the request from queue and move it to sentRequest
    const request = this.requestQueue.shift();
    console.warn(`[QUEUE] PROCESSING: "${request.cmd}" (${request.requestType})#${request._id} - moved from queue to sentRequest`);
    console.warn(`[QUEUE] after shift, remaining queue length=${this.requestQueue.length}, contents:`, JSON.stringify(this.requestQueue.map(r => `${r.cmd}(${r.requestType})#${r._id}`)));
    this.sentRequest = request;
    console.log(`[SENTREQUEST] ASSIGNED: "${request.cmd}" (${request.requestType})#${request._id} at ${new Date().toISOString()}`);
    console.warn(`[QUEUE] sentRequest is:`, JSON.stringify(this.sentRequest, null, 2));

    // Handle dataRefresh: send pfodWeb?cmd= (no dedup) to collect streaming CSV data.
    // Does not go through the normal pfod response pipeline.  IMPORTANT:
    // dataRefresh must NOT cancel updateTimer (the menu/drawing refresh
    // timer).  Both fire on a 1 s cadence; if dataRefresh cancels the
    // menu-refresh timer at send time, the menu-refresh request never
    // gets a chance to dispatch — every cycle the dataRefresh sneaks in
    // first and kills it, then scheduleNextUpdate re-arms it for another
    // 1 s, and the dataRefresh fires first again.  Result: device only
    // sees empty-cmd polls, no `\<refresh>` menu refreshes ever go out.
    if (request.requestType === 'dataRefresh') {
      this.dataRefreshActive = true; // Set synchronously before first await
      let dataRefreshError = null;
      try {
        // Gate on adapter capability so SerialProxyConnection (which
        // inherits sendDataRefresh from HTTPConnection but reports
        // protocol='serial') gets datapolling too.  Native Web Serial /
        // BLE adapters don't have sendDataRefresh and are skipped.
        if (this.connectionManager.adapter
         && typeof this.connectionManager.adapter.sendDataRefresh === 'function') {
          await this.connectionManager.adapter.sendDataRefresh();
        }
      } catch (error) {
        console.warn('[DATAREFRESH] Error during dataRefresh:', error.message);
        dataRefreshError = error;
      }
      this.dataRefreshActive = false;
      console.log(`[SENTREQUEST] CLEARED: "${request.cmd}" (${request.requestType}) - dataRefresh complete at ${new Date().toISOString()}`);
      this.sentRequest = null;
      if (dataRefreshError) {
        // Network failure or HTTP error during polling (distinct from {.} getting no pfod
        // response — here the connection itself is down).  Stop polling and alert.
        // Polling restarts automatically when any subsequent cmd response is received.
        pfodAlert(
          `Connection lost — device stopped responding during data polling.\n\n` +
          `${dataRefreshError.message}\n\n` +
          `You can:\n` +
          `• Click "Close" to dismiss this alert\n` +
          `• Use the pfodWeb toolbar's reload button to reconnect\n` +
          `• Use the pfodWeb toolbar's back button to go back`,
          () => { console.log('[DATAREFRESH] User closed connection-lost alert'); }
        );
        // Do not reschedule — polling stopped; restarts on next successful cmd response
      } else {
        this.scheduleDataRefresh();
      }
      this.processRequestQueue();
      return;
    }

    // Cancel any pending menu-refresh timer at SEND time for non-dataRefresh
    // requests.  Mirrors Java's sendMessage -> cancelRefreshTimer
    // (pfodAppState.java:614): the response we're about to receive will
    // bring updated menu / drawing state, so the refresh timer is re-armed
    // by scheduleNextUpdate after that response is fully applied.
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
      console.log('[REFRESH] Cancelled refresh timer at send time');
    }

    try {
      // Track the touchZone filter and cmd for this request being sent
      if (request.touchZoneInfo) {
        if (!this.sentRequests) {
          this.sentRequests = [];
        }
        this.sentRequests.push({
          cmd: request.touchZoneInfo.cmd,
          filter: request.touchZoneInfo.filter,
          timestamp: Date.now()
        });
        console.log(`[QUEUE] Tracking sent request: cmd="${request.touchZoneInfo.cmd}", filter="${request.touchZoneInfo.filter}"`);
      }
      // Use ConnectionManager to send command
      console.log(`[QUEUE] Sending command: ${request.cmd}`);

      // Option B: hand the connection a tiny interface bound to THIS request.
      // The byte boundary (connectionManager.processReadBuffer) invokes these
      // synchronously when a complete {..} is consumed, to decide
      // raw-vs-valid-response and to apply ~C BEFORE the OUTSIDE bytes that
      // follow the command are collected.  isResponseShapeValidFor /
      // applyClearOption are free functions in responseHandlers.js (same
      // bundle scope).  The byte boundary additionally gates on a pending
      // responseResolve, so "a request is in flight" is guaranteed here.
      const _req = request;
      const respCallbacks = {
        isValidResponse: (json) => {
          let d;
          try { d = JSON.parse(json); } catch (e) { return false; }
          try { return !!isResponseShapeValidFor(_req, d).ok; }
          catch (e) { return false; }
        },
        applyClearOption: (json) => {
          let d;
          try { d = JSON.parse(json); } catch (e) { return; }
          applyClearOption(d);
        },
        // Called by HTTPConnection.sendOnce() on receipt of any HTTP response body
        // (even empty/non-pfod) — signals the connection is live and starts CSV polling.
        onAnyResponseReceived: () => this.scheduleDataRefresh()
      };

      // exitAbort: skip the generic send() below entirely — the shared exit
      // flow's own connectionManager.disconnect() call (see
      // _exitToConnectionScreen() in responseHandlers.js) already sends {!}
      // itself (fire-and-forget, its own dedup char, keepalive so it
      // survives the reload that follows). Calling send('{!}') here too
      // would just be a second, redundant {!} to the device.
      if (request.requestType === 'exitAbort') {
        console.log(`[SENTREQUEST] CLEARED: "${request.cmd}" (${request.requestType}) - exitAbort at ${new Date().toISOString()}`);
        this.sentRequest = null;
        this._exitToConnectionScreen();
        return;
      }

      const responseText = await this.connectionManager.send(request.cmd, respCallbacks);

      // Schedule dataRefresh 1 second after this send completes (HTTP only)
      this.scheduleDataRefresh();

      // Create response-like object for compatibility with existing code
      const response = {
        ok: true,
        status: 200,
        text: async () => responseText
      };

      console.warn(`[QUEUE] Received response for "${request.cmd}": status ${response.status}, queue length: ${this.requestQueue.length}`);

      if (!response.ok) {
        throw new Error(`Server returned ${response.status} for cmd "${request.cmd}"`);
      }

      // Log the raw JSON that we already have
      console.log(`[QUEUE] Received raw JSON data for "${request.cmd}":`);
      console.log(responseText);

      // (No discardResponse path: under the ordinal/overridable model, higher-
      // priority cmds replace lower-priority queued ones at queue time, so
      // racing refresh responses simply complete and are harmless — touch
      // backups protect optimistic state from stale refresh data.)
      // Don't clear sentRequest here - will be cleared after processing is complete

      // Track request type for logging purposes
      let lastRequest = request.requestType;

      /***
      // Prefilter JSON to fix newlines in strings before parsing
      // prehaps add this back later to catch all control chars
      function prefilterJSON(jsonString) {
        let result = '';
        let inString = false;
        let escaping = false;

        for (let i = 0; i < jsonString.length; i++) {
          const char = jsonString[i];

          if (escaping) {
            result += char;
            escaping = false;
            continue;
          }

          if (char === '\\') {
            result += char;
            escaping = true;
            continue;
          }

          if (char === '"') {
            inString = !inString;
            result += char;
            continue;
          }

          if (inString && char === '\n') {
            result += '\\n';  // Replace literal newline with escaped newline
          } else {
            result += char;
          }
        }

        return result;
      }

      // Parse the JSON for processing
      const cleanedResponseText = prefilterJSON(responseText);
      const data = JSON.parse(cleanedResponseText);
      console.log('[QUEUE] parsedText ', JSON.stringify(data,null,2));
      **/
      // Parse JSON response — all protocols (HTTP, Serial, BLE) now deliver {"cmd":[...]} format.
      // csvCollector and rawDataCollector are fed by processIncoming() in the connection layer
      // before this point, so no rawData extraction is needed here.
      let data = null;
      let jsonParseError = null;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error(`[PARSE_ERROR] Failed to parse JSON response for "${request.cmd}"`);
        console.error(`[PARSE_ERROR] Error message: ${parseError.message}`);
        console.error(`[PARSE_ERROR] Response length: ${responseText.length} bytes`);
        console.error(`[PARSE_ERROR] Raw response text:`, responseText);
        jsonParseError = parseError;
      }

      // If JSON parsing failed, re-throw so the outer catch can show the alert
      if (jsonParseError) {
        throw jsonParseError;
      }

      // Delegate response validation to responseHandlers.  Two gates:
      //   - in-flight: response received with no sentRequest is unsolicited / stale
      //   - shape:     data.cmd[0] must match the cmd type's AllowedResponseShapes
      // Mismatches almost always mean a stale response from a previous cmd
      // (whose request was lost/replaced/timed-out) is now being matched to
      // a different sentRequest.  Drop it rather than feed it through
      // processing, which would otherwise corrupt state (e.g.
      // setDrawingData(null, ...) → drawings[null] → '{null}' refresh loop).
      if (!this.validateResponseAgainstRequest(data, request)) {
        console.log(`[SENTREQUEST] CLEARED: "${request.cmd}" (${request.requestType}) - response validation failed at ${new Date().toISOString()}`);
        this.sentRequest = null;
        this.scheduleNextKeepAlive();
        this.processRequestQueue();
        return;
      }

      // Cache response if it has a version.  PfodMenuCache scopes
      // entries by connectionId, so designer-vs-real-device entries
      // stay separate per design name automatically.
      if (typeof cacheResponse === 'function') {
        cacheResponse(data, request, this.connectionManager);
      }

      // Show loading message only on initial load, not during refresh cycles to prevent flashing
      if (!this.hasReceivedFirstResponse) {
        this.updateCanvasMessage('Loading Drawing ...');
      }

      // Mark that we've received the first successful response
      if (!this.hasReceivedFirstResponse) {
        this.hasReceivedFirstResponse = true;
        console.log('[RESPONSE] First successful response received, hasReceivedFirstResponse set to true');
      }
      this.jsonErrorAlertShown = false; // Reset so future JSON errors are reported again

      // Handle the response data
      if (this.touchState.isDown) {
        // Mouse is down - queue the response to prevent flashing
        console.log(`[QUEUE] Mouse is down (touchState.isDown=${this.touchState.isDown}) - queuing response for "${request.cmd}" to prevent flashing`);
        // Remove the processed request from the queue first
//         this.sentRequest = null;
//         this.requestQueue.shift();
         console.warn(`[QUEUE] after isDown sentRequest the current queue is:`, JSON.stringify(this.requestQueue, null, 2));


        // For DRAG responses, keep only the latest one
        if (request.touchZoneInfo && request.touchZoneInfo.filter === TouchZoneFilters.DRAG) {
          const cmd = request.touchZoneInfo.cmd;
          // Remove any existing DRAG response for the same cmd
          this.pendingResponseQueue = this.pendingResponseQueue.filter(pendingResponse =>
            !(pendingResponse.request.touchZoneInfo &&
              pendingResponse.request.touchZoneInfo.filter === TouchZoneFilters.DRAG &&
              pendingResponse.request.touchZoneInfo.cmd === cmd)
          );
          console.log(`[QUEUE] Keeping only latest DRAG response for cmd="${cmd}"`);
        }

        // Add this response to the pending queue
        this.pendingResponseQueue.push({
          request: request,
          data: data
        });
        console.log(`[QUEUE] Added to pending queue. Total pending responses: ${this.pendingResponseQueue.length}`);
      } else {
        // Mouse is up - process immediately

        // Restore-on-response (touch only): undo the optimistic touchAction
        // edits made to allXXX[menuDwg] during the touch.  Per the data
        // model, touchActions modify ONLY the menuDwg's merged collections;
        // the device's reply will re-apply real changes via the merge that
        // follows.  Backup is cleared in either case — a fresh one is built
        // on the next touch.
        if (request.requestType === 'touch'
            && typeof window !== 'undefined'
            && window.pfodWebMouse
            && window.pfodWebMouse.touchActionBackups) {
          const backup = window.pfodWebMouse.touchActionBackups;
          // Derive the menuDwg loadCmd from the request cmd via menu-items
          // lookup, NOT from a backup.drawingName field — backup no longer
          // carries the drawingName.  For non-dwg menu-button touches the
          // resolution returns null and there's nothing to restore.
          const dwg = this._resolveLoadCmdFromRequest(request);
          if (dwg) {
            const live = this.redraw && this.redraw.redrawDrawingManager;
            const fields = ['allTouchZonesByCmd', 'allTouchActionsByCmd',
                            'allTouchActionInputsByCmd', 'allUnindexedItems',
                            'allIndexedItemsByNumber'];
            for (const f of fields) {
              const snap = JSON.parse(JSON.stringify((backup[f] && backup[f][dwg]) ||
                                                      (f === 'allUnindexedItems' ? [] : {})));
              if (live && live[f]) live[f][dwg] = snap;
            }
            console.log(`[TOUCH_RESTORE] Restored allXXX["${dwg}"] on live from backup before applying touch response`);
          }
          window.pfodWebMouse.touchActionBackups = null;
        }

        console.log(`[QUEUE] Processing data for cmd "${request.cmd}" (type: ${request.requestType})`);

        // Detect response type for logging
        if (data.pfodDrawing === 'start' || data.pfodDrawing === 'update') {
          lastRequest = 'dwgUpdate';
        } else if (data.cmd && data.cmd[0]) {
          if (data.cmd[0].startsWith('{,') || data.cmd[0].startsWith('{;')) {
            lastRequest = 'mainMenu';
          } else if (data.cmd[0].startsWith('{=')) {
            lastRequest = 'rawData';
          } else if (data.cmd[0].startsWith('{+')) {
            lastRequest = 'dwgUpdate';
          } else if (this.isEmptyCmd(data.cmd)) {
            lastRequest = 'empty';
          }
        }

        // Check for empty command response {} - typically from keepAlive { }
        // Empty responses should be acknowledged but not trigger any screen refresh or processing
        const isEmptyResponse = this.isEmptyCmd(data.cmd);
        if (isEmptyResponse) {
          // Delegate empty {} handling (cmd-type-aware itemRefreshTimes
          // stamping + mouse-listener re-attach) to responseHandlers.
          this.handleEmptyResponse(request, data);
          // Clear sentRequest and continue queue processing.
          console.log(`[SENTREQUEST] CLEARED: "${request.cmd}" (${request.requestType}) - empty response at ${new Date().toISOString()}`);
          this.sentRequest = null;
          this.scheduleNextKeepAlive();
          this.processRequestQueue();
          return;
        }

        // Check if this is a valid dwg update:
        // 1. {+ response (full or partial dwg update), OR
        // 2. pfodDrawing: 'start' or 'update' (direct drawing format)
        const isFullOrPartialDwgUpdate = (data.cmd && data.cmd.length > 0 && data.cmd[0].startsWith('{+')) || (data.pfodDrawing === 'start') || (data.pfodDrawing === 'update');
        const isDwgUpdate = isFullOrPartialDwgUpdate;

        // If not a valid dwg update, handle as non-dwg response (menu, raw data, etc.)
        if (!isDwgUpdate) {
          console.log(`[QUEUE] Response is NOT a valid dwg update (${lastRequest}) - handling as non-dwg response (isFullOrPartial=${isFullOrPartialDwgUpdate}, isEmpty=${isEmptyResponse})`);
          this.handleNonDwgResponse(data, request, request.requestType);
          // 'menu' itemRefreshTimes is stamped inside processMenuResponse /
          // _navigateToMenu using the just-merged _currentMenu.header.reRequestMs.
          // Clear the sent request and continue processing
          console.log(`[QUEUE] COMPLETED: ${lastRequest} response - clearing sentRequest (was ${this.sentRequest ? this.sentRequest.cmd + '(' + this.sentRequest.requestType + ')#' + this.sentRequest._id : 'null'}; local request was ${request.cmd}(${request.requestType})#${request._id})`);
          this.sentRequest = null;
          // Reschedule keepAlive polling after response (1 second delay)
          this.scheduleNextKeepAlive();
          this.processRequestQueue();
          return;
        }

        // Handle valid dwg response through dedicated method
        if (this.handleDwgResponse(data, request)) {
          // Drain insertDwg items collected during this response's
          // processDrawingData scan, BEFORE clearing sentRequest.  Each
          // handleInsertDwg → addToRequestQueue → processRequestQueue
          // chain early-skips because sentRequest is still set, so items
          // pile into the queue without triggering timer schedules or
          // pulling a new request mid-stream.  After sentRequest is
          // cleared below, the tail processRequestQueue() pulls the first
          // queued insert.  Each subsequent insert's own response will
          // run its own scan and queue its own children the same way.
          const pendingInserts = (data && data._pendingInserts) || [];
          if (pendingInserts.length > 0) {
            console.log(`[QUEUE] Queueing ${pendingInserts.length} deferred insertDwg item(s) from "${request.cmd}" before clearing sentRequest`);
            for (const item of pendingInserts) {
              this.handleInsertDwg(item);
            }
          }

          // Drawing itemRefreshTimes is stamped inside processDrawingData for
          // 'start' responses (which carry the refresh field); 'update' and
          // empty responses leave the timestamp alone.

          // Clear the sent request and continue processing
          console.log(`[QUEUE] COMPLETED: ${lastRequest} response - clearing sentRequest (was ${this.sentRequest ? this.sentRequest.cmd + '(' + this.sentRequest.requestType + ')#' + this.sentRequest._id : 'null'}; local request was ${request.cmd}(${request.requestType})#${request._id})`);
          this.sentRequest = null;
          // Decide whether to re-merge.  Only touch-style responses WITHOUT
          // a source dwg landed straight in allXXX[menuDwg] (legacy merged
          // write) and must NOT be re-merged — re-running mergeAllDrawings
          // would rebuild allXXX from the per-drawing raw collections and
          // clobber the update.  Everything else (drawing-fetch types AND
          // source-routed touch responses) updated per-drawing raw
          // collections, so rebuild allXXX to pick up the new state.
          const rt = request.requestType;
          const isMergedUpdate = (rt === 'touch' || rt === 'drag' || rt === 'partialSlider')
                              && !this._touchSourceDwg(request);
          if (!isMergedUpdate) {
            const merger = new window.DrawingMerger(this.redraw.redrawDrawingManager);
            merger.mergeAllDrawings();
          }
          // Persist per-menuDwg merged cache for each drawing item the
          // current menu shows.  Both branches change allXXX[menuDwg]:
          //   - per-drawing-raw response: merger ran above, allXXX rebuilt.
          //   - merged-update response: processDrawingData wrote items
          //     straight into allXXX[menuDwg].
          // Either way the cache must reflect the new merged state.
          if (typeof getConnectionIdentifier === 'function') {
            try {
              const connectionId = getConnectionIdentifier(this.connectionManager);
              const dwgItems = (window.pfodMenuDisplay && window.pfodMenuDisplay._currentMenu && window.pfodMenuDisplay._currentMenu.drawingItems) || [];
              for (const dwgItem of dwgItems) {
                if (dwgItem.loadCmd) {
                  this.redraw.redrawDrawingManager.saveMenuDwgMergedToStorage(dwgItem.loadCmd, connectionId);
                }
              }
            } catch (e) {
              console.warn('[QUEUE] Could not save menuDwg merged cache:', e.message);
            }
          }
          if (this.shouldDeferRedraw()) {
            console.log(`[REDRAW] Deferred redraw - mouseDown=${this.touchState.isDown}`);
          } else {
            this.redraw.performRedraw();
          }
          // Reschedule keepAlive polling after response (1 second delay)
          this.scheduleNextKeepAlive();
          this.processRequestQueue();
          return;
        } else {
          // Error was already handled in handleDwgResponse
          // Clear the failed request and continue processing
          console.log(`[SENTREQUEST] CLEARED: "${request.cmd}" (${request.requestType}) at ${new Date().toISOString()}`);
          this.sentRequest = null;
          // Reschedule keepAlive polling after response (1 second delay)
          this.scheduleNextKeepAlive();

          // For inserted drawings, if we're at the end of the queue, proceed with redraw (only if in menu-mode)
          if (this.requestQueue.length === 0 && !this.sentRequest) {
            console.log(`[QUEUE] Queue empty after failed request. Drawing with available data.`);
            this.setProcessingQueue(false);
            if (document.body.className === 'menu-mode') {
              this.redrawCanvas();
            } else {
              console.log('[QUEUE] Not in menu-mode - skipping redraw after failed request. Current mode:', document.body.className);
            }
            // Resume update scheduling after failed request cleanup
            this.scheduleNextUpdate();
          }

          // Continue processing queue
          setTimeout(() => {
            if (this.sentRequest || this.requestQueue.length !== 0) {
              this.processRequestQueue();
            }
          }, 10);
          return;
        }
      }

      // Per-response merge+redraw fires above (in the dwg-response branch).

    } catch (error) {
      // Catch any errors from JSON parsing or other non-handler logic
      console.error(`[QUEUE] Error processing request "${request.cmd}":`, error);
      console.error(`[QUEUE] Error stack:`, error.stack);

      // Check if this is a retry exhaustion error (timeout or no response after retries)
      const isRetryExhausted = error.message && (
        error.message.includes('All') && error.message.includes('attempts exhausted') ||
        error.message.includes('timeout') ||
        error.message.includes('device may not be responding')
      );

      // Check if this is a JSON parsing error
      const isJSONError = error instanceof SyntaxError;

      // HTTP response was received but contained no pfod {..} command — connection is alive,
      // device just doesn't send pfod (e.g. CSV-only).  Polling continues for this case.
      const isNoPfodInResponse = error.code === 'NO_PFOD_IN_RESPONSE';

      // Clear canvas message on timeout
      if (isRetryExhausted) {
        this.clearCanvasMessage();
      }

      // Network/HTTP failures mean the connection itself is down — stop data polling.
      // NO_PFOD_IN_RESPONSE means the connection works (device responded), so leave polling alone.
      if (!isNoPfodInResponse && this.dataRefreshTimer) {
        clearTimeout(this.dataRefreshTimer);
        this.dataRefreshTimer = null;
      }

      // Display alert to user for all errors
      const isInitialMainMenu = request.isInitial && request.requestType === 'mainMenu';
      if (isRetryExhausted && this.exitPending) {
        // User clicked Exit while the cmd was retrying — the retry was abandoned
        // mid-way by the adapter (or hit its last attempt) and we are about to send {!}
        // and tear down.  Suppress the "Connection failed" modal so it can't block the
        // Closing Down overlay / _exitToConnectionScreen reload.
        console.log('[QUEUE] Retry exhausted but exitPending — suppressing Connection-failed alert');
      } else if (isRetryExhausted) {
        const maxRetries = this.connectionManager.getMaxRetries();
        const totalAttempts = maxRetries + 1;
        const isSerialTimeout = /serial response timeout/i.test(error.message);

        pfodAlert(
          `Connection failed after ${totalAttempts} attempts.\n\n` +
          `${error.message}\n` +
          (isSerialTimeout ? `Check Baud Rates match.\n` : ``) +
          `\nYou can:\n` +
          `• Click "Close" to dismiss this alert\n` +
          `• Use the pfodWeb toolbar's reload button to try again\n` +
          `• Use the pfodWeb toolbar's back button to go back` +
          (isInitialMainMenu
            ? `\n\nIf just plotting streaming CSV data use the \u22ee menu to open the Chart display`
            : ``),
          () => {
            // Optional callback after user closes the alert
            console.log('[QUEUE] User closed retry failure alert');
          }
        );
      } else if (isJSONError) {
        // JSON parsing error - only show once across retries; reset on next successful response
        if (!this.jsonErrorAlertShown) {
          this.jsonErrorAlertShown = true;
          pfodAlert(
          `Invalid response format - failed to parse data.\n\n` +
          `${error.message}\n\n` +
          `You can:\n` +
          `• Click "Close" to dismiss this alert\n` +
          `• Use the pfodWeb toolbar's reload button to try again\n` +
          `• Use the pfodWeb toolbar's back button to go back` +
          (isInitialMainMenu
            ? `\n\nIf just plotting streaming CSV data use the \u22ee menu to open the Chart display`
            : ``),
          () => {
            // Optional callback after user closes the alert
            console.log('[QUEUE] User closed JSON error alert');
          }
        );
        } // end if (!this.jsonErrorAlertShown)
      } else {
        // All other errors are connection issues.
        // Strip internal proxy noise ("cmd write failed (...): proxy returned NNN:\n"
        // and "open failed: ") so the user sees only the meaningful OS/device error.
        const rawMsg = error.message || '';
        const cleanMsg = rawMsg
          .replace(/^cmd write failed[^:]*:\s*(proxy returned \d+[^\n]*\n?)?/i, '')
          .replace(/^open failed:\s*/i, '')
          .trim() || rawMsg;
        const isNetworkError = /networkerror|failed to fetch|cannot reach/i.test(cleanMsg);
        const activeProtocol = window.pfodConnectionManager && window.pfodConnectionManager.protocol;
        let deviceHint;
        if (activeProtocol === 'http') {
          // Direct HTTP connection to the device — no pfodProxy involved.
          deviceHint = '• Check the device IP/port is correct and the device is powered on and connected';
        } else if (isNetworkError) {
          deviceHint = '• Check pfodProxy is running and the proxy port setting is correct';
        } else if (activeProtocol === 'serial') {
          deviceHint = '• Check COM port is not already in use elsewhere';
        } else {
          deviceHint = '• Check the pfodProxy port setting is correct';
        }
        pfodAlert(
          `Connection issue detected.\n\n` +
          `${cleanMsg}\n\n` +
          `You can:\n` +
          `${deviceHint}\n` +
          `• Click "Close" to dismiss this alert\n` +
          `• Use the pfodWeb toolbar's reload button to reconnect\n` +
          `• Use the pfodWeb toolbar's back button to go back`,
          () => {
            // Optional callback after user closes the alert
            console.log('[QUEUE] User closed connection issue alert');
          }
        );
      }

      // Clear the failed request
      console.log(`[SENTREQUEST] CLEARED: "${request.cmd}" (${request.requestType}) at ${new Date().toISOString()}`);
      this.sentRequest = null;

      // Continue processing queue if:
      //  - JSON errors (sometimes recovered by retry), OR
      //  - exitPending is set: {!} is sitting in the queue waiting to fire so
      //    _exitToConnectionScreen can reload — without this re-trigger the
      //    queue stalls after a retry-exhausted error and Exit locks up.
      if (isJSONError || this.exitPending) {
        setTimeout(() => {
          if (this.sentRequest || this.requestQueue.length !== 0) {
            this.processRequestQueue();
          }
        }, 10);
      }
    }
  }

});
