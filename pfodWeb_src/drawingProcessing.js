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
    console.info(`[QUEUE] redrawCanvas isDown: ${this.touchState.isDown}`);
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
      console.info(`[QUEUE] No pending responses to process - ensuring refresh timer is restarted`);
      this.scheduleNextUpdate();
      return;
    }

    console.info(`[QUEUE] Processing ${this.pendingResponseQueue.length} pending responses after mouse release`);
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

      console.info(`[QUEUE] Processing queued response for "${request.cmd}"`);

      // Restore-on-response (touch only): clean up the optimistic
      // touchAction edit FIRST, then process the response as normal below —
      // whatever it turns out to be (empty, dwg update, new menu, ...).
      // Calls the exact same _restoreTouchActionForRequest()
      // (requestQueue.js) processRequestQueue's own "mouse is up" branch
      // calls — not a re-implementation — so there is exactly one place
      // that decides whether/what to restore. A response that arrives
      // while the mouse is STILL down takes processRequestQueue's OTHER
      // branch instead — queued into pendingResponseQueue rather than
      // processed immediately — and is drained here once mouse-up calls
      // processPendingResponses(). This loop was previously missing this
      // call entirely, so any touch whose response arrives before the
      // physical mouse-up (routine for a fast/local connection, rare but
      // possible for a real device) never got undone.
      this._restoreTouchActionForRequest(request);

      // Check for empty command response {} - skip processing
      const isEmptyResponse = this.isEmptyCmd(data.cmd);
      if (isEmptyResponse) {
        console.info(`[QUEUE] Pending response is empty command {} - skipping processing`);
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
        console.info(`[QUEUE] Pending response is NOT a current dwg update (${responseType}) - handling as non-dwg response (isFullOrPartial=${isFullOrPartialDwgUpdate})`);
        // Handle the non-dwg response (checks flag, restores backup, redraws, and processes based on type)
        this.handleNonDwgResponse(data, request, request.requestType);
        // Skip normal processing for non-dwg responses
        continue;
      }

      // Handle valid dwg response through dedicated method
      if (this.handleDwgResponse(data, request)) {
        console.info(`[QUEUE] Successfully processed dwg response from pending queue`);
        // Drain insertDwg items collected during this response's scan, the
        // same way requestQueue.processRequestQueue does for the live path.
        // Mouse is still down here so sentRequest is whatever the live
        // queue has (or null between requests); either way, queueing
        // synchronously through handleInsertDwg lands items in the queue
        // before the post-batch redraw and tail processRequestQueue.
        const pendingInserts = (data && data._pendingInserts) || [];
        if (pendingInserts.length > 0) {
          console.info(`[QUEUE] Queueing ${pendingInserts.length} deferred insertDwg item(s) from pending response for "${request.cmd}"`);
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
        console.info(`[QUEUE] Failed to process dwg response from pending queue`);
      }
    }

    console.info(`[QUEUE] Finished processing all pending responses`);

    // Re-merge (only if any response targeted per-drawing raw) and redraw
    // once for the whole batch.
    if (hadPendingResponses) {
      if (!this.touchState.isDown) {
        // Clear sentRequest if still set so queue can continue processing insertDwg requests
        if (this.sentRequest) {
          console.info(`[QUEUE] Clearing sentRequest "${this.sentRequest.cmd}" to allow queue processing`);
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
            console.info('[QUEUE] Could not save menuDwg merged cache (pending batch):', e.message);
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

    // parentDrawing must be recorded no matter HOW this drawing came to be
    // registered.  addInsertedDrawing() above is the only place that sets it,
    // and it is skipped whenever the drawing is already in dm.drawings —
    // which is exactly what loadDrawingDataFromStorage does when it hydrates
    // from the per-drawing cache, registering the drawing with
    // parentDrawing: null (DrawingManager.js's own "Restore drawingsData"
    // block).  Left null, a cached inserted dwg looks like its own tree root,
    // and two things downstream go wrong:
    //   - findIndexOwnerDrawing (drawingDataProcessor.js) confines its search
    //     to the requesting drawing's tree, so an update routed to this child
    //     but carrying an idx owned by the PARENT finds no owner, is treated
    //     as a brand-new idx, and captures a fresh transform instead of the
    //     one caught when the idx was first seen — the item jumps position.
    //   - the 'start' cascade-remove and pruneDrawingsNotInMenu both identify
    //     children/roots through parentDrawing, so a cached child reads as a
    //     root there too.
    if (item.parentDrawingName && dm.drawingsData[drawingName]
        && dm.drawingsData[drawingName].parentDrawing !== item.parentDrawingName) {
      console.log(`[INSERT_DWG] Setting parent of "${drawingName}" to "${item.parentDrawingName}" (was ${JSON.stringify(dm.drawingsData[drawingName].parentDrawing)})`);
      dm.drawingsData[drawingName].parentDrawing = item.parentDrawingName;
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

  // Drop every registered drawing tree the menu now being shown does not
  // reference.  A menu's dwg items are the only entry points into the live
  // DrawingManager: each one's loadCmd roots a tree, and every other
  // registered drawing is an insertDwg descendant of one of those roots
  // (parentDrawing chain).  Navigating to a different menu therefore orphans
  // whole trees, and nothing else removed them — DrawingManager.reset() only
  // runs on the [TOUCH_REPLACEMENT] path (a touch answering with a start for
  // an unknown drawing), so plain menu navigation left the previous menu's
  // roots registered forever.  Two concrete consequences:
  //   - each orphaned root kept its indexedItems, and idx numbering restarts
  //     at 1 per tree, so a stale root could be reported as the holder of an
  //     idx belonging to the tree now on screen (drawingDataProcessor.js's
  //     findIndexOwnerDrawing, which is now tree-scoped for the same reason);
  //   - the auto-refresh scan walks dm.drawings, so an orphaned root with a
  //     non-zero refresh kept re-requesting a drawing nothing displays.
  //
  // Only ROOTS are passed to removeInsertedDrawing() — it cascades to their
  // children itself, so each stale tree goes whole.  Drawings that survive
  // into the new menu are left completely untouched: they keep their
  // drawingsData so handleMenuResize still finds real canvas dimensions
  // instead of the placeholder size (see _navigateToMenu's own note).
  //
  // Parameters:
  //   drawingItems - menuData.drawingItems of the menu being shown (may be empty)
  pruneDrawingsNotInMenu(drawingItems) {
    const dm = this.redraw.redrawDrawingManager;
    const liveRoots = new Set((drawingItems || []).map(item => item.loadCmd).filter(Boolean));

    // Snapshot first — removeInsertedDrawing() mutates dm.drawings.
    const staleRoots = dm.drawings.filter(name =>
      !dm.drawingsData[name]?.parentDrawing && !liveRoots.has(name));

    // removeInsertedDrawing() cancels queued AND in-flight requests for what
    // it removes.  Dropping the old menu's queued drawing fetches is exactly
    // what's wanted here, but the in-flight request is the MENU response
    // currently being processed — and it can match a stale root: on a touch
    // that navigated here, _resolveLoadCmdFromRequest resolves the touched cmd
    // against _currentMenu, which is still the OLD menu (show() runs after
    // this).  requestQueue.js clears sentRequest itself once the menu response
    // finishes; until then it must stay set, or the drawing fetches queued
    // straight after this stop early-skipping in processRequestQueue and pull
    // a request mid-stream.  Restore it after the sweep.
    const inFlightRequest = this.sentRequest;

    for (const rootName of staleRoots) {
      console.log(`[MENU_PRUNE] Dropping drawing tree "${rootName}" - not referenced by the current menu`);
      // The five merged (per-menuDwg) collections are keyed by ROOT name and
      // hold the fully-expanded tree, so they belong to the root and are not
      // reached by removeInsertedDrawing()'s per-drawing cleanup.
      delete dm.allTouchZonesByCmd[rootName];
      delete dm.allTouchActionsByCmd[rootName];
      delete dm.allTouchActionInputsByCmd[rootName];
      delete dm.allUnindexedItems[rootName];
      delete dm.allIndexedItemsByNumber[rootName];
      this.removeInsertedDrawing(rootName);
    }

    this.sentRequest = inFlightRequest;

    // Restore the itemRefreshTimes invariant in the other direction: an entry
    // exists for every drawing in dm.drawings, and for nothing else.  Leaving
    // a removed drawing's stamp behind is exactly what kept the auto-refresh
    // scan polling it.
    for (const name of [...this.itemRefreshTimes.keys()]) {
      if (name !== 'menu' && !dm.drawings.includes(name)) {
        console.log(`[MENU_PRUNE] Dropping refresh stamp for removed drawing "${name}"`);
        this.itemRefreshTimes.delete(name);
      }
    }

    // Same sweep for the three per-drawing touch maps.  DrawingManager's own
    // removeInsertedDrawing() drops unindexedItems/indexedItems but not these,
    // and the cascade means the child names it removed aren't in staleRoots to
    // delete directly.  Every read of these maps keys off a drawing reached
    // through the live tree, so a key absent from dm.drawings is unreachable.
    for (const map of [dm.touchZonesByCmd, dm.touchActionsByCmd, dm.touchActionInputsByCmd]) {
      for (const name of Object.keys(map)) {
        if (!dm.drawings.includes(name)) delete map[name];
      }
    }
  },

  // Drop every client-side trace of the dwg designer's preview namespace, so
  // the preview render cycle about to start begins from nothing.  Called by
  // dwgControlsPanelUI.js's _renderPreview() immediately before it hands the
  // new selection to DwgDesignerVirtualDevice.setPreviewDwg().
  //
  // setPreviewDwg() calls _resetAutoAssignments() (dwgDesignerAdapter.js):
  // every cycle it remints each item's cmd/idx from a counter that restarts at
  // 1 and drops every cached wire version, so the SAME dwg legitimately
  // carries different idx numbers in different composites — popUpHelp is idx
  // 1-6 previewed on its own, idx 7-12 nested under SliderWithHelp.  A real
  // device never does that: pfodAutoIdx fixes a dwg's indices on its first
  // call and they stay fixed wherever that dwg is used, top-level or inserted.
  // The client models a real device, so it has to be told explicitly that
  // everything it holds under these names is void.
  //
  // Left in place, the previous cycle's idx map gets hydrated back out of the
  // per-drawing cache by handleInsertDwg and claims idx numbers that now
  // belong to a SIBLING.  findIndexOwnerDrawing (drawingDataProcessor.js) is
  // tree-scoped and both drawings are in the same tree, so the sibling's own
  // items are redirected to the stale holder and dropped as duplicates — the
  // sibling silently loses every indexed item it owns (its labels, values and
  // indexed shapes just don't appear).
  //
  // Nothing is lost by clearing: the device drops its versions in the same
  // breath, so every preview drawing is resent as a full "start" this cycle
  // and no cached entry could have been reused anyway.
  //
  // Parameters:
  //   prefix - drawing-name prefix marking the preview namespace
  //            (window.DWG_PREVIEW_KEY_PREFIX, i.e. "__dcpPreview__")
  clearPreviewDrawings(prefix) {
    const dm = this.redraw.redrawDrawingManager;

    // Snapshot first — removeInsertedDrawing() mutates dm.drawings and cascades
    // to children, so names can disappear part way through the loop.
    const previewNames = dm.drawings.filter(name => name.startsWith(prefix));

    // Same in-flight guard pruneDrawingsNotInMenu documents: removeInsertedDrawing()
    // clears sentRequest when it matches, but requestQueue.js owns clearing the
    // request currently being processed.  Restore it after the sweep.
    const inFlightRequest = this.sentRequest;

    for (const name of previewNames) {
      // The five merged (per-menuDwg) collections are keyed by ROOT name and hold
      // the fully-expanded tree, so they are not reached by removeInsertedDrawing()'s
      // per-drawing cleanup.
      delete dm.allTouchZonesByCmd[name];
      delete dm.allTouchActionsByCmd[name];
      delete dm.allTouchActionInputsByCmd[name];
      delete dm.allUnindexedItems[name];
      delete dm.allIndexedItemsByNumber[name];
      // A child already taken by an earlier name's cascade is gone from dm.drawings.
      if (dm.drawings.includes(name)) {
        console.log(`[PREVIEW_CLEAR] Dropping preview drawing "${name}"`);
        this.removeInsertedDrawing(name);
      }
    }

    this.sentRequest = inFlightRequest;

    // The two sweeps pruneDrawingsNotInMenu ends with, for the same reasons it
    // gives: refresh stamps exist for exactly the drawings in dm.drawings, and
    // the three per-drawing touch maps are unreachable once the name is gone.
    for (const name of [...this.itemRefreshTimes.keys()]) {
      if (name !== 'menu' && !dm.drawings.includes(name)) {
        this.itemRefreshTimes.delete(name);
      }
    }
    for (const map of [dm.touchZonesByCmd, dm.touchActionsByCmd, dm.touchActionInputsByCmd]) {
      for (const name of Object.keys(map)) {
        if (!dm.drawings.includes(name)) delete map[name];
      }
    }

    // The three localStorage cache families are the other half of the state, and
    // the per-drawing one is what actually re-supplied the stale idx map:
    //   pfodWeb_dwg_<conn>_<dwg>         handleInsertDwg hydrates from this
    //   pfodWeb_menuDwg_<conn>_<menuDwg> the merged tree
    //   pfodWeb_cache_<conn>_<cmd>       the raw dwgStart response
    // Swept by name pattern rather than per connection id: a key carrying the
    // preview prefix is a preview key whatever connection minted it.
    const staleKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (/^pfodWeb_(dwg|menuDwg|cache)_/.test(key) && key.includes(prefix)) {
        staleKeys.push(key);
      }
    }
    staleKeys.forEach(key => localStorage.removeItem(key));

    console.log(`[PREVIEW_CLEAR] Cleared ${previewNames.length} preview drawing(s) and ${staleKeys.length} cache entries for prefix "${prefix}"`);
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
