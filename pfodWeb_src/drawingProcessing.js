/*
   drawingProcessing.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// processDrawingData() wrapper, handleInsertDwg(), and helpers that operate on
// the live redrawDrawingManager after a drawing response arrives.
// Also includes redrawCanvas() and processPendingResponses() which bridge the
// response handler and the request queue.
// Assigned to DrawingViewer.prototype after the class is defined in pfodWeb.js.
//
// State read:    touchState, pendingResponseQueue, requestQueue, sentRequest,
//                redraw.redrawDrawingManager, drawingDataProcessor, touchZonesByCmd
// State written: pendingResponseQueue, requestQueue, sentRequest,
//                redraw.redrawDrawingManager, touchState.wasDown
// Calls:         resizeAndDimensions:handleResize, navigationAndQueue:isEmptyCmd,
//                navigationAndQueue:addToRequestQueue, navigationAndQueue:scheduleNextUpdate,
//                responseHandlers:handleNonDwgResponse, responseHandlers:handleDwgResponse,
//                drawingMerger.mergeAllDrawings, redraw.performRedraw,
//                requestQueue:processRequestQueue, keepAlive:scheduleNextKeepAlive
// Called by:     responseHandlers:handleDwgResponse [processDrawingData],
//                requestQueue:processRequestQueue [via handleDwgResponse/handleNonDwgResponse],
//                pfodWebMouse [processPendingResponses on mouse-up]

Object.assign(DrawingViewer.prototype, {

  // Trigger a canvas redraw after non-touchAction state changes.
  // TouchAction redraws are handled directly by pfodWebMouse calling
  // redraw.redrawForTouchAction(); this method handles all other redraws.
  redrawCanvas() {
    console.warn(`[QUEUE] redrawCanvas isDown: ${this.touchState.isDown}`);
    if (!this.touchState.isDown) {
      if (this.touchState.wasDown) {
        this.touchState.wasDown = this.touchState.isDown;
      }
      // Redraw no longer needs access to drawingManager or requestQueue
      // Data is managed locally in redraw
    }

    // Redraw the canvas with what we have
    // Note: TouchAction redraws are now handled directly by pfodWebMouse calling redraw.redrawForTouchAction()
    // This method only handles normal redraws
    this.handleResize();
  },

  // Drain the pendingResponseQueue that accumulates drawing responses while the mouse
  // button is held down (touch-action in progress).
  // After draining, runs the merger and redraw once for the whole batch and
  // reschedules the request queue.
  processPendingResponses() {
    if (this.pendingResponseQueue.length === 0) {
      console.log(`[QUEUE] No pending responses to process - ensuring refresh timer is restarted`);
      this.scheduleNextUpdate();
      return;
    }

    console.log(`[QUEUE] Processing ${this.pendingResponseQueue.length} pending responses after mouse release`);
    const hadPendingResponses = this.pendingResponseQueue.length > 0;
    // Track whether any pending response targeted a per-drawing raw
    // collection (drawingName !== null).  If yes, we must rebuild allXXX
    // via the merger.  If every response was a merged update (drawingName
    // === null), the writes already landed in allXXX[menuDwg] and a
    // re-merge would clobber them.
    let needsReMerge = false;

    // Process responses in order of receipt
    while (this.pendingResponseQueue.length > 0) {
      const pendingResponse = this.pendingResponseQueue.shift();
      const request = pendingResponse.request;
      const data = pendingResponse.data;

      console.log(`[QUEUE] Processing queued response for "${request.cmd}"`);

      // Check for empty command response {} - skip processing
      const isEmptyResponse = this.isEmptyCmd(data.cmd);
      if (isEmptyResponse) {
        console.log(`[QUEUE] Pending response is empty command {} - skipping processing`);
        continue;
      }

      // Detect response type for logging
      let responseType = request.requestType;
      if (data.pfodDrawing === 'start' || data.pfodDrawing === 'update') {
        responseType = 'dwgUpdate';
      } else if (data.cmd && data.cmd[0]) {
        if (data.cmd[0].startsWith('{,') || data.cmd[0].startsWith('{;')) {
          responseType = 'mainMenu';
        } else if (data.cmd[0].startsWith('{=')) {
          responseType = 'rawData';
        } else if (data.cmd[0].startsWith('{+')) {
          responseType = 'dwgUpdate';
        }
      }

      // Check if this is a valid dwg update:
      // 1. {+ response (full or partial dwg update), OR
      // 2. pfodDrawing: 'start' or 'update' (direct drawing format)
      const isFullOrPartialDwgUpdate = (data.cmd && data.cmd.length > 0 && data.cmd[0].startsWith('{+')) || (data.pfodDrawing === 'start') || (data.pfodDrawing === 'update');
      const isDwgUpdate = isFullOrPartialDwgUpdate;

      if (!isDwgUpdate) {
        console.log(`[QUEUE] Pending response is NOT a current dwg update (${responseType}) - handling as non-dwg response (isFullOrPartial=${isFullOrPartialDwgUpdate})`);
        // Handle the non-dwg response (checks flag, restores backup, redraws, and processes based on type)
        this.handleNonDwgResponse(data, request, request.requestType);
        // Skip normal processing for non-dwg responses
        continue;
      }

      // Handle valid dwg response through dedicated method
      if (this.handleDwgResponse(data, request)) {
        console.log(`[QUEUE] Successfully processed dwg response from pending queue`);
        // Drain insertDwg items collected during this response's scan, the
        // same way requestQueue.processRequestQueue does for the live path.
        // Mouse is still down here so sentRequest is whatever the live
        // queue has (or null between requests); either way, queueing
        // synchronously through handleInsertDwg lands items in the queue
        // before the post-batch redraw and tail processRequestQueue.
        const pendingInserts = (data && data._pendingInserts) || [];
        if (pendingInserts.length > 0) {
          console.log(`[QUEUE] Queueing ${pendingInserts.length} deferred insertDwg item(s) from pending response for "${request.cmd}"`);
          for (const item of pendingInserts) {
            this.handleInsertDwg(item);
          }
        }
        // Per-drawing raw responses require a re-merge — that includes
        // source-routed touch responses (applied to the source dwg's raw
        // collections).  Only touch-style responses WITHOUT a source dwg
        // landed straight in allXXX[menuDwg]; re-merge would clobber them.
        const rt = request.requestType;
        const isMergedUpdate = (rt === 'touch' || rt === 'drag' || rt === 'partialSlider')
                            && !this._touchSourceDwg(request);
        if (!isMergedUpdate) needsReMerge = true;
      } else {
        // Error was already logged in handleDwgResponse
        console.error(`[QUEUE] Failed to process dwg response from pending queue`);
      }
    }

    console.log(`[QUEUE] Finished processing all pending responses`);

    // Re-merge (only if any response targeted per-drawing raw) and redraw
    // once for the whole batch.
    if (hadPendingResponses) {
      if (!this.touchState.isDown) {
        // Clear sentRequest if still set so queue can continue processing insertDwg requests
        if (this.sentRequest) {
          console.log(`[QUEUE] Clearing sentRequest "${this.sentRequest.cmd}" to allow queue processing`);
          console.log(`[SENTREQUEST] CLEARED: "${this.sentRequest.cmd}" (${this.sentRequest.requestType}) - after processing pending responses`);
          this.sentRequest = null;
        }
        if (needsReMerge) {
          const merger = new window.DrawingMerger(this.redraw.redrawDrawingManager);
          merger.mergeAllDrawings();
        }
        // Persist per-menuDwg merged cache for each drawing item the
        // current menu shows — runs whether or not we re-merged, since the
        // merged-update path (touchAction / null drawingName) also mutates
        // allXXX[menuDwg] directly.
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
            console.warn('[QUEUE] Could not save menuDwg merged cache (pending batch):', e.message);
          }
        }
        // Same deferral rule as the live path — see shouldDeferRedraw()
        // in requestQueue.js.
        if (this.shouldDeferRedraw()) {
          console.log(`[REDRAW] Deferred redraw (pending batch) - mouseDown=${this.touchState.isDown}`);
        } else {
          this.redraw.performRedraw();
        }
      }
    }
    setTimeout(() => {
      this.processRequestQueue();
      // Ensure rescheduling after mouse up if queue is empty and no request in flight
      if (this.requestQueue.length === 0 && !this.sentRequest) {
        this.scheduleNextUpdate();
      }
      // Reschedule keepAlive polling after processing pending responses (1 second delay)
      this.scheduleNextKeepAlive();
    }, 10);
  },

  // Thin wrapper: delegate drawing-data processing to DrawingDataProcessor,
  // targeting the live redrawDrawingManager.
  //
  // Parameters:
  //   data        - parsed response object from the device
  //   savedData   - previously cached drawing data (may be null)
  //   requestType - queue entry type string (e.g. 'menuItemDwg', 'refresh', 'insertDwg')
  processDrawingData(data, savedData, requestType = 'unknown') {
    return this.drawingDataProcessor.processDrawingData(data, this.redraw.redrawDrawingManager, savedData, requestType);
  },

  // Handle an insertDwg item: register the named drawing in the live DrawingManager
  // and enqueue a network request to fetch its content.
  //
  // Returns an object describing the outcome (error, alreadyInList, or newlyAdded).
  //
  // Parameters:
  //   item - insertDwg item object with drawingName, xOffset, yOffset, transform
  handleInsertDwg(item) {
    const drawingName = item.drawingName;
    const xOffset = parseFloat(item.xOffset || 0);
    const yOffset = parseFloat(item.yOffset || 0);

    console.log(`[INSERT_DWG] Handling insertDwg for drawing "${drawingName}" with offset (${xOffset}, ${yOffset})`);

    // Verify this is a valid insertDwg item
    if (!item.type || (item.type !== 'insertDwg' && item.type.toLowerCase() !== 'insertdwg')) {
      console.error(`[INSERT_DWG] Invalid item type: ${item.type}. Expected 'insertDwg'`);
      console.log(`[INSERT_DWG] Full item:`, JSON.stringify(item));
    }

    if (!drawingName) {
      console.error('[INSERT_DWG] InsertDwg item missing drawingName:', item);
      return { error: 'Missing drawing name', item: item };
    }

    const dm = this.redraw.redrawDrawingManager;
    dm.ensureItemCollections(drawingName);

    // (Cycle detection lives in DrawingMerger.mergeAllDrawings — it walks
    // the parent/child graph and short-circuits any cycles with a logged
    // error.  No drawings[0]-based guard here.)

    const connectionId = (typeof getConnectionIdentifier === 'function')
      ? getConnectionIdentifier(this.connectionManager) : null;

    // If we don't already have full state in memory, try to hydrate from
    // the per-drawing cache.  loadDrawingDataFromStorage atomically restores
    // .data + the five raw collections (and registers the drawing in
    // dm.drawings), so a non-null .data afterwards reliably implies the
    // raw collections are populated too.
    const hasState = !!dm.drawingsData[drawingName]?.data;
    let cacheLoaded = false;
    if (!hasState && connectionId) {
      const entry = dm.loadDrawingDataFromStorage(drawingName, connectionId);
      if (entry) {
        cacheLoaded = true;
        console.log(`[INSERT_DWG] Hydrated "${drawingName}" from per-drawing cache (version="${entry.version}")`);
      }
    }

    // If still not registered (no in-memory state and no cache hit), create
    // a placeholder entry so the request queue / merger has somewhere to
    // attach the response.
    if (!dm.drawings.includes(drawingName)) {
      // The parent is the drawing whose response contained this insertDwg
      // item — set by the scan in drawingDataProcessor.js as
      // item.parentDrawingName (= the response's drawing name).
      dm.addInsertedDrawing(
        drawingName,
        xOffset,
        yOffset,
        item.transform || { x: 0, y: 0, scale: 1.0 },
        item.parentDrawingName
      );
      console.log(`[INSERT_DWG] Created placeholder entry for "${drawingName}" with parent "${item.parentDrawingName}"`);
    }

    // Maintain itemRefreshTimes invariant: every entry in dm.drawings has an
    // entry.  Both branches above (cache-hydration via loadDrawingDataFromStorage
    // and addInsertedDrawing) can register the drawing without touching
    // itemRefreshTimes.  null = no response yet (or rate==0); the response
    // stamp in _stampRefreshTimeAfterResponse updates to Date.now() when
    // the rate is > 0.
    if (!this.itemRefreshTimes.has(drawingName)) {
      this.itemRefreshTimes.set(drawingName, null);
    }

    // Always queue a verify request — handleInsertDwg only fires from the
    // scan in processDrawingData, which runs after a parent drawing's
    // response was just received.  Every such scan is effectively a
    // refresh of the children: the parent has new authoritative state, so
    // each insertDwg target must be re-verified to keep the merged tree
    // current.  The version-stamped request is cheap — device replies
    //   {+}            no change at this version
    //   {+|item ...}   partial update at this version (apply items)
    //   {+x`y…Vnew}    new version, full replacement
    // Re-entrancy dedup only: skip when this drawing is already pending or
    // currently in flight (e.g. duplicate insertDwg within one response).
    // Once the in-flight cycle clears, future scans / auto-refresh timers
    // are free to re-verify.
    // Check if a request for this drawing is already pending or in flight.
    // Match on cmd-derived identifier, not request.drawingName:
    //   - drawing-fetch entries (menuItemDwg/insertDwg/refresh/refresh-insertDwg):
    //     cmd token IS the loadCmd, simple compare.
    //   - touch-style entries: cmd token is the menuItemCmd; resolve to loadCmd
    //     via menu-items lookup before comparing.
    const matchesDrawing = (req) => {
      if (!req || !req.cmd) return false;
      const tok = this._extractCmdToken(req.cmd);
      if (tok === drawingName) return true; // drawing-fetch entry
      // touch-style entry: resolve menuItemCmd → loadCmd
      const resolved = this._resolveLoadCmdFromRequest(req);
      return resolved === drawingName;
    };
    const alreadyQueued = this.requestQueue.some(matchesDrawing)
        || (this.sentRequest && matchesDrawing(this.sentRequest));
    if (alreadyQueued) {
      console.log(`[INSERT_DWG] "${drawingName}" already pending or in flight — not duplicating`);
      return {
        drawingName: drawingName,
        dataAvailable: hasState || cacheLoaded,
        alreadyInList: true
      };
    }

    const version = dm.drawingsData[drawingName]?.data?.version || null;
    const cmd = version ? `{${version}:${drawingName}}` : `{${drawingName}}`;

    // If the request that triggered this insertDwg was itself a refresh,
    // tag the child fetch as refresh-insertDwg so refresh-batch logic in the
    // queue treats it as part of the same batch.
    const triggeringType = this.sentRequest ? this.sentRequest.requestType : null;
    const requestType = (triggeringType === 'refresh' || triggeringType === 'refresh-insertDwg')
      ? 'refresh-insertDwg' : 'insertDwg';
    console.warn(`[INSERT_DWG] Queuing verify "${cmd}" (type=${requestType}, cacheLoaded=${cacheLoaded})`);
    this.addToRequestQueue(cmd, null, null, requestType);

    return {
      drawingName: drawingName,
      dataAvailable: cacheLoaded,
      newlyAdded: !cacheLoaded
    };
  },

  // Remove an inserted drawing and its touch zones from the live DrawingManager,
  // then recursively remove any child drawings it inserted.
  // Also cancels any queued or in-flight requests for the drawing.
  //
  // Parameters:
  //   drawingName - name of the inserted drawing to remove
  removeInsertedDrawing(drawingName) {
    if (!drawingName) {
      console.error('No drawing name provided to removeInsertedDrawing');
      return;
    }

    console.log(`[REMOVE_DWG] Removing inserted drawing: ${drawingName}`);

    // Match queue entries against `drawingName` via cmd-derived identifier.
    // For drawing-fetch entries the cmd token IS the loadCmd; for touch-style
    // entries the cmd token is the menuItemCmd, so resolve via menu-items.
    const matchesDrawing = (req) => {
      if (!req || !req.cmd) return false;
      const tok = this._extractCmdToken(req.cmd);
      if (tok === drawingName) return true;
      const resolved = this._resolveLoadCmdFromRequest(req);
      return resolved === drawingName;
    };

    // Remove any pending requests for this drawing from the queue
    const initialQueueLength = this.requestQueue.length;
    console.log(`[QUEUE_MUTATION] removeInsertedDrawing("${drawingName}") - queue before filter (length=${initialQueueLength}):`, JSON.stringify(this.requestQueue.map(r => `${r.cmd}(${r.requestType})`)));
    this.requestQueue = this.requestQueue.filter(request => !matchesDrawing(request));
    let removedCount = initialQueueLength - this.requestQueue.length;
    if (removedCount > 0) {
      console.log(`[QUEUE_MUTATION] removeInsertedDrawing - filtered out ${removedCount} request(s); queue now (length=${this.requestQueue.length}):`, JSON.stringify(this.requestQueue.map(r => `${r.cmd}(${r.requestType})`)));
    }

    // Also check and clear if the currently sent request is for this drawing
    if (this.sentRequest && matchesDrawing(this.sentRequest)) {
      console.log(`[REMOVE_DWG] Clearing in-flight request for ${drawingName}`);
      console.log(`[SENTREQUEST] CLEARED: "${drawingName}" (${this.sentRequest.requestType}) at ${new Date().toISOString()}`);
      this.sentRequest = null;
      removedCount++;
    }

    if (removedCount > 0) {
      console.log(`[REMOVE_DWG] Removed ${removedCount} request(s) for ${drawingName} (${initialQueueLength - this.requestQueue.length} from queue, ${this.sentRequest ? 0 : (removedCount - (initialQueueLength - this.requestQueue.length))} in-flight)`);
    }

    // First identify any child drawings that have this drawing as their parent
    const childDrawings = this.redraw.redrawDrawingManager.getChildDrawings(drawingName);

    // Recursively remove all child drawings first
    childDrawings.forEach(childName => {
      console.log(`[REMOVE_DWG] Removing child drawing ${childName} of ${drawingName}`);
      this.removeInsertedDrawing(childName);
    });

    // Remove associated touchZones (if touchZonesByCmd is available)
    if (typeof this.touchZonesByCmd !== 'undefined') {
      this.removeTouchZonesByDrawing(drawingName);
    }

    // Remove the drawing using the manager
    this.redraw.redrawDrawingManager.removeInsertedDrawing(drawingName);

    console.log(`[REMOVE_DWG] Completed removal of inserted drawing: ${drawingName}`);
  },

  // Remove all touch zones registered under a specific drawing name from touchZonesByCmd.
  //
  // Parameters:
  //   drawingName - parent drawing whose touch zones should be cleared
  removeTouchZonesByDrawing(drawingName) {
    if (!drawingName) {
      console.error('No drawing name provided to removeTouchZonesByDrawing');
      return;
    }

    console.log(`Removing touchZones for drawing: ${drawingName}`);

    // Create a new array of keys to remove
    const keysToRemove = [];

    // Find all touchZones belonging to this drawing
    for (const cmd in this.touchZonesByCmd) {
      const touchZone = this.touchZonesByCmd[cmd];
      if (touchZone.parentDrawingName === drawingName) {
        keysToRemove.push(cmd);
        console.log(`Marked touchZone for removal: cmd=${cmd}, drawing=${drawingName}`);
      }
    }

    // Remove identified touchZones
    keysToRemove.forEach(cmd => {
      delete this.touchZonesByCmd[cmd];
      console.log(`Removed touchZone: cmd=${cmd}`);
    });

    console.log(`Removed ${keysToRemove.length} touchZones for drawing: ${drawingName}`);
  }

});
