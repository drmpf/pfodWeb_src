/*
   keepAliveAndHttp.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Message-viewer / collector initialisation and the drawing auto-refresh timer.
// Assigned to DrawingViewer.prototype after the class is defined in pfodWeb.js.
//
// State read:    touchState, requestQueue, sentRequest, isUpdating,
//                redraw.redrawDrawingManager
// State written: isUpdating
// Calls:         navigationAndQueue:scheduleNextUpdate, navigationAndQueue:addToRequestQueue
// Called by:     constructor [initializeMessageViewer],
//                navigationAndQueue:scheduleNextUpdate [via updateTimer → fetchRefresh],
//                chartAndRawData:openChartDirectly [via scheduleDataRefresh]

Object.assign(DrawingViewer.prototype, {

  // Create and wire up all data-collector singletons (MessageCollector, CSVCollector,
  // RawDataCollector, ChartDisplay) and the UI panels that consume them
  // (RawMessageViewer, ChartConfigViewer).
  initializeMessageViewer() {
    try {
      // Create message collector if not already created
      if (!window.messageCollector) {
        window.messageCollector = new MessageCollector(500);
        ConnectionManager.setMessageCollector(window.messageCollector);
        console.log('[PFODWEB_DEBUG] Message collector created and set on ConnectionManager');
      }

      // Create CSV collector if not already created
      if (!window.csvCollector) {
        window.csvCollector = new CSVCollector();
        ConnectionManager.setCSVCollector(window.csvCollector);
        console.log('[PFODWEB_DEBUG] CSV collector created and set on ConnectionManager');
      }

      // Create raw data collector if not already created
      console.log('[PFODWEB_DEBUG] Checking rawDataCollector - exists?', !!window.rawDataCollector, 'RawDataCollector class exists?', typeof RawDataCollector);
      if (!window.rawDataCollector) {
        try {
          console.log('[PFODWEB_DEBUG] Creating RawDataCollector instance...');
          window.rawDataCollector = new RawDataCollector();
          console.log('[PFODWEB_DEBUG] RawDataCollector instance created successfully');
          ConnectionManager.setRawDataCollector(window.rawDataCollector);
          console.log('[PFODWEB_DEBUG] Raw data collector created and set on ConnectionManager');
        } catch (e) {
          console.error('[PFODWEB_DEBUG] Error creating RawDataCollector:', e);
        }
      } else {
        console.log('[PFODWEB_DEBUG] RawDataCollector already exists, not creating new instance');
      }

      // Create chart display if not already created
      if (!window.chartDisplay) {
        try {
          console.log('[PFODWEB_DEBUG] Creating ChartDisplay instance...');
          window.chartDisplay = new ChartDisplay();
          console.log('[PFODWEB_DEBUG] ChartDisplay instance created successfully');
        } catch (e) {
          console.error('[PFODWEB_DEBUG] Error creating ChartDisplay:', e);
        }
      } else {
        console.log('[PFODWEB_DEBUG] ChartDisplay already exists, not creating new instance');
      }

      // Create raw message viewer
      window.rawMessageViewer = new RawMessageViewer(window.messageCollector, 'side-panel');
      window.rawMessageViewer.initialize();
      console.log('[PFODWEB_DEBUG] Raw message viewer initialized');

      // Create chart config viewer (shares the same side-panel container)
      window.chartConfigViewer = new ChartConfigViewer('side-panel');
      window.chartConfigViewer.initialize();
      console.log('[PFODWEB_DEBUG] Chart config viewer initialized');

      // Keyboard shortcut disabled - now only accessible via toolbar menu
      // // Add a keyboard shortcut to toggle the viewer (Ctrl+Shift+M)
      // document.addEventListener('keydown', (event) => {
      //   if (event.ctrlKey && event.shiftKey && event.key === 'M') {
      //     event.preventDefault();
      //     if (window.rawMessageViewer) {
      //       window.rawMessageViewer.toggle();
      //     }
      //   }
      // });
      console.log('[PFODWEB_DEBUG] Keyboard shortcut Ctrl+Shift+M disabled - access via toolbar menu');
    } catch (error) {
      console.error('[PFODWEB_DEBUG] Error initializing message viewer:', error);
    }
  },

  // Drive the periodic drawing auto-refresh cycle.
  // Called by the refresh timer (set in scheduleNextUpdate). Checks all guard conditions
  // before queueing the drawing update request(s), then re-arms the timer.
  async fetchRefresh() {
    console.log(`[REFRESH] Refresh timer fired at ${new Date().toISOString()}`);

    // Check if a touchActionInput dialog is currently open
    if (window.pfodWebMouse.touchActionInputOpen) {
      console.log(`[REFRESH] Blocking refresh cycle - touchActionInput dialog is open`);
      this.scheduleNextUpdate(); // Reschedule for later
      return;
    }

    // Bypass list: types that should NOT defer the timer-fired refresh.
    //   menuRefresh / refresh / refresh-insertDwg — already part of an
    //     ongoing refresh batch; firing the next timer alongside is fine.
    //   dataRefresh — passive empty-cmd poll that completes in ~tens of ms;
    //     queueing the menuRefresh behind it is correct.  Without this,
    //     dataRefresh and a same-cadence menuRefresh race every cycle and
    //     dataRefresh tends to win, starving menu refreshes.
    // Bare `insertDwg` is *not* on the list — it is queued only by a non-
    // refresh parent (drawingProcessing tags refresh-context cascades as
    // `refresh-insertDwg` instead), so seeing one in flight means a user
    // cascade is mid-flight and the timer refresh should defer.
    const isRefreshType = (t) => t === 'menuRefresh' || t === 'refresh'
                              || t === 'refresh-insertDwg' || t === 'dataRefresh';
    const hasUserRequests = this.requestQueue.some(req => !isRefreshType(req.requestType));
    if (hasUserRequests) {
      console.log(`[REFRESH] Blocking refresh cycle - user requests in queue`);
      this.scheduleNextUpdate(); // Reschedule for later
      return;
    }

    if (this.sentRequest && !isRefreshType(this.sentRequest.requestType)) {
      console.log(`[REFRESH] Blocking refresh cycle - user request in flight (${this.sentRequest.requestType})`);
      this.scheduleNextUpdate(); // Reschedule for later
      return;
    }

    // Refreshes only apply in menu-mode.  Defense-in-depth match for the
    // gate in scheduleNextUpdate — even if a stale timer fires in chart /
    // rawdata / streaming / input mode, queue nothing.  Reschedule (gated)
    // so the timer re-arms once the user returns to menu-mode.
    if (document.body.className !== 'menu-mode') {
      console.log(`[REFRESH] Skipping refresh cycle - mode is "${document.body.className}", not menu-mode`);
      this.scheduleNextUpdate();
      return;
    }

    try {
      console.log(`[UPDATE] Starting update cycle at ${new Date().toISOString()}`);
      const now = Date.now();

      // Queue menu re-request if due (itemRefreshTimes['menu'] updated when menu response received)
      const menuRate = window.pfodMenuDisplay?._currentMenu?.header?.reRequestMs;
      if (menuRate > 0) {
        const nextDue = (this.itemRefreshTimes.get('menu') ?? 0) + menuRate;
        if (nextDue <= now) {
          const menuCmd = this.menuNavStack.length > 0
            ? this.versionedMenuCmd(this.menuNavStack[this.menuNavStack.length - 1])
            : '{.}';
          console.log(`[UPDATE] Menu due for refresh - queueing "${menuCmd}"`);
          this.addToRequestQueue(menuCmd, null, null, 'menuRefresh');
        }
      }

      // Queue per-drawing re-requests if due (itemRefreshTimes[dwgName] updated when each response is processed)
      for (const dwgName of this.redraw.redrawDrawingManager.drawings) {
        const rate = this.redraw.redrawDrawingManager.drawingsData[dwgName]?.data?.refresh;
        if (rate > 0) {
          const nextDue = (this.itemRefreshTimes.get(dwgName) ?? 0) + rate;
          if (nextDue <= now) {
            console.log(`[UPDATE] Drawing "${dwgName}" due for refresh`);
            await this.queueDrawingUpdate(dwgName);
          }
        }
      }

      this.scheduleNextUpdate();
      console.log(`[UPDATE] Update cycle queued at ${new Date().toISOString()}`);
    } catch (error) {
      console.error('[UPDATE] Failed to update:', error);
      this.scheduleNextUpdate();
    }
  },

  // Queue a versioned refresh request for a single drawing (main or inserted).
  // Uses the cached version from localStorage when available.
  async queueDrawingUpdate(drawingName) {
    try {
      console.log(`[QUEUE_DWG] Preparing fetch for drawing "${drawingName}" at ${new Date().toISOString()}`);

      // Defend against null/empty drawingName — would otherwise build the
      // garbage cmd '{null}' or '{}' and send it to the device.  If this
      // fires, the upstream cause is a null entry in
      // redrawDrawingManager.drawings (likely a 'start' response with a null
      // routing key derived from the request cmd — see handleDwgResponse).
      if (!drawingName) {
        console.error(`[QUEUE_DWG] Refusing to queue update for null/empty drawingName`);
        return;
      }

      // Use the per-connection per-drawing cache via getStoredVersion.
      // The legacy `${drawingName}_version` localStorage key no longer
      // exists — the cache is now keyed `pfodWeb_dwg_<connId>_<drawingName>`.
      const connectionId = (typeof getConnectionIdentifier === 'function')
        ? getConnectionIdentifier(this.connectionManager) : null;
      const storedVersion = this.redraw.redrawDrawingManager.getStoredVersion(drawingName, connectionId);
      const cmd = storedVersion
        ? '{' + storedVersion + ':' + drawingName + '}'
        : '{' + drawingName + '}';
      if (storedVersion) {
        console.log(`[QUEUE_DWG] Using stored version "${storedVersion}" for "${drawingName}"`);
      } else {
        console.log(`[QUEUE_DWG] No stored version for "${drawingName}" - requesting fresh data (dwg:start)`);
      }

      console.log(`[QUEUE_DWG] Constructed command: "${cmd}"`);

      /**
      // Use /pfodWeb endpoint with cmd parameter in {drawingName} format
      let endpoint = `/pfodWeb?cmd=${encodeURIComponent('{' + drawingName + '}')}`;

      // Add version query parameter if available and valid AND there's corresponding data
      if (savedVersion !== null && savedData) {
        endpoint += `&version=${encodeURIComponent(savedVersion)}`;
        console.log(`[QUEUE_DWG] Using saved version "${savedVersion}" for "${drawingName}"`);
      } else {
        if (savedVersion !== null && !savedData) {
          console.log(`[QUEUE_DWG] Found valid version "${savedVersion}" without data for "${drawingName}" - keeping version but requesting full drawing data`);
          // Don't remove the version - it's valid (including empty string), just request fresh data
        } else {
          console.log(`[QUEUE_DWG] No saved version for "${drawingName}", requesting full drawing data`);
        }
      }
      **/
      // Add to the request queue
      this.addToRequestQueue(cmd, null, null, 'refresh');
      console.log(`[QUEUE_DWG] Added "${drawingName}" to request queue`);
    } catch (error) {
      console.error(`[QUEUE_DWG] Failed to queue drawing "${drawingName}":`, error);
    }
  }

});
