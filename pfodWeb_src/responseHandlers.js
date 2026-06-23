/*
   responseHandlers.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Response handler methods for the DrawingViewer class.
// Assigned to DrawingViewer.prototype after the class is defined in pfodWeb.js.
// Depends on global functions: pfodStripMenuCmdVersion (pfodMenuCache.js),
//   pfodParseMenu (pfodMenuParser.js), TouchZoneFilters (pfodWebMouse.js).
// Exports: _exitToConnectionScreen (shared exit flow, also called by requestQueue.js)
//
// State read:    redraw.redrawDrawingManager, menuCmdSet, menuCache, sentRequest, requestQueue,
//                touchState, currentIdentifier, canvas,
//                canvasContainer, isUpdating, updateTimer
// State written: currentIdentifier, menuCmdSet, isUpdating, updateTimer,
//                redraw.redrawDrawingManager (via processDrawingData)
// Calls:         resizeAndDimensions:handleResize, drawingProcessing:redrawCanvas,
//                drawingProcessing:processDrawingData,
//                navigationAndQueue:addToRequestQueue, navigationAndQueue:pushMenuNavCmd,
//                navigationAndQueue:updateNavigationStack,
//                chartAndRawData:exitChartDisplay, chartAndRawData:exitRawDataDisplay,
//                chartAndRawData:displayChartWithPlotNo, chartAndRawData:displayRawDataText,
//                connectionSetup:showNoConnectionAlert
// Called by:     requestQueue:processRequestQueue,
//                drawingProcessing:processPendingResponses

// ============================================================================
// Response shape classification and validation
// ----------------------------------------------------------------------------
// Each pfod response carries a leading shape token in data.cmd[0]:
//   {,...   full menu       {;...  menu update
//   {+...   drawing start    {+|... drawing update
//   {=...   raw / chart data
//   {?...   single select    {*...  multi  select
//   {!...   text input       {#...  numeric input
//   {}      empty ack (any whitespace between braces is treated identically)
//
// classifyResponseShape(data) returns one of those tokens.
// AllowedResponseShapes maps each requestType to the response shapes it
// can legitimately produce.  If a response shape isn't in the allow-list
// for the request that's currently sentRequest, it almost certainly
// means a stale response from a prior (lost / replaced) cmd is being
// matched to the wrong request — log [QUEUE_MISMATCH] and drop instead
// of corrupting state (e.g. pushing null into drawings[]).
// requestTypes marked 'any' (touch/drag/partialSlider/etc.) can validly
// return any shape so are not constrained.
// ============================================================================

function classifyResponseShape(data) {
  if (!data || !data.cmd || !data.cmd[0]) return 'unknown';
  const head = data.cmd[0];
  const cmd  = data.cmd;
  // Empty: '{' followed by optional whitespace then '}' — {}, { }, {  }, etc.
  // Two delivery shapes:
  //   single element: cmd[0] = "{}" / "{ }" / "{   }"
  //   split on the trailing '}' delimiter: cmd[0] = "{" (or "{ "), cmd[1] = "}"
  if (/^\{\s*\}\s*$/.test(head)) return 'empty';
  if (cmd.length >= 2 && /^\{\s*$/.test(head) && /^\s*\}/.test(cmd[1])) return 'empty';
  if (head.startsWith('{,'))  return 'menu-full';
  if (head.startsWith('{;'))  return 'menu-update';
  if (head.startsWith('{+|')) return 'dwg-update';
  if (head.startsWith('{+'))  return 'dwg-start';
  if (head.startsWith('{='))  return 'data';
  if (head.startsWith('{!'))  return 'text-input';
  if (head.startsWith('{#'))  return 'numeric-input';
  if (head.startsWith('{?'))  return 'single-select';
  if (head.startsWith('{*'))  return 'multi-select';
  return 'unknown';
}

const AllowedResponseShapes = {
  // mainMenu / back / menuRefresh: must return a menu (or empty).  A drawing
  // payload here is the misattribution case (stale {+...} from a previous
  // lost/replaced cmd).
  mainMenu:           ['menu-full', 'menu-update', 'empty'],
  back:               ['menu-full', 'menu-update', 'empty'],
  menuRefresh:        ['menu-full', 'menu-update', 'empty'],

  // Drawing fetches: drawing payloads only.
  menuItemDwg:        ['dwg-start', 'dwg-update', 'empty'],
  refresh:            ['dwg-start', 'dwg-update', 'empty'],
  'refresh-insertDwg':['dwg-start', 'dwg-update', 'empty'],
  insertDwg:          ['dwg-start', 'dwg-update', 'empty'],

  // keepAlive / dataRefresh: empty ack only.
  keepAlive:          ['empty'],
  dataRefresh:        ['empty'],

  // Open: device may legitimately respond with anything to a touch /
  // partialSlider / drag / authentication / exitAbort / unknown request.
  authentication:     'any',
  exitAbort:          'any',
  touch:              'any',
  input:              'any',
  drag:               'any',
  partialSlider:      'any',
  unknown:            'any',
};

function isResponseShapeValidFor(request, data) {
  const shape = classifyResponseShape(data);
  const allowed = AllowedResponseShapes[request.requestType];
  if (allowed === 'any' || !allowed) return { ok: true, shape, allowed: 'any' };
  return { ok: allowed.includes(shape), shape, allowed };
}

// Apply the `~C` ("clear collected data") plot option.  Called SYNCHRONOUSLY
// by the connection-layer byte boundary (via the queue-bound Option-B
// callback) the instant a {=..~C..} command that IS a valid response to the
// pending request is consumed — BEFORE the OUTSIDE bytes that follow it are
// fed to the collectors — so the clear drops only data that preceded the
// marker, never the new plot/stream data that arrives right after it.
//
// Reuses the authoritative parsers (chartDisplay.parseChartLabelsWithPlotNo
// for the field-spec chart form, and the streaming-title `~C` scan that the
// streaming branch below uses) — no second, drift-prone parser.  `data` is
// the parsed { cmd:[...] } object.
function applyClearOption(data) {
  if (!data || !data.cmd || !data.cmd.length ||
      typeof data.cmd[0] !== 'string' || !data.cmd[0].startsWith('{=')) return;
  let chartInfo = null;
  if (window.chartDisplay && typeof window.chartDisplay.parseChartLabelsWithPlotNo === 'function') {
    try { chartInfo = window.chartDisplay.parseChartLabelsWithPlotNo(data.cmd); }
    catch (e) { chartInfo = null; }
  }
  if (chartInfo) {
    if (chartInfo.clearData && window.csvCollector) {
      console.log('[STREAM] {=..~C..} chart marker — clearing csvCollector at the command boundary');
      window.csvCollector.clear();
    }
    return;
  }
  // Section-9 streaming raw-data form {=[title][~C]} — same title `~C` scan
  // as the streaming branch in handleNonDwgResponse.
  const m = data.cmd[0];
  const s = m.indexOf('=');
  let e = m.indexOf('}');
  if (e === -1) e = m.length;
  const parts = (s !== -1 ? m.substring(s + 1, e) : '').split('~');
  let clear = false;
  for (let i = 1; i < parts.length; i++) { if (parts[i].trim() === 'C') clear = true; }
  if (clear && window.rawDataCollector) {
    console.log('[STREAM] {=..~C..} streaming marker — clearing rawDataCollector at the command boundary');
    window.rawDataCollector.clear();
  }
}

Object.assign(DrawingViewer.prototype, {

  // Validate an incoming response against the in-flight request.
  // Returns true when the response should continue normal processing.
  // Returns false (after logging an error) when it must be dropped.
  //
  // Two gates:
  //   1. in-flight check: any {...} response received when sentRequest is
  //      null is unsolicited (or stale after a timeout) and is dropped.
  //   2. shape check: data.cmd[0] is classified and compared against
  //      AllowedResponseShapes[request.requestType].  Mismatch → drop as
  //      QUEUE_MISMATCH.
  validateResponseAgainstRequest(data, request) {
    if (!this.sentRequest) {
      console.error(`[QUEUE_MISMATCH] Response received with no in-flight cmd (sentRequest=null) — ignoring.  Raw head: ${(data && data.cmd && data.cmd[0]) || '<empty>'}`);
      return false;
    }
    const shapeCheck = isResponseShapeValidFor(request, data);
    if (!shapeCheck.ok) {
      console.error(`[QUEUE_MISMATCH] Response shape "${shapeCheck.shape}" does not match request type "${request.requestType}" (cmd="${request.cmd}"); allowed=${JSON.stringify(shapeCheck.allowed)}`);
      console.error(`[QUEUE_MISMATCH] Dropping response. Raw head: ${(data && data.cmd && data.cmd[0]) || '<empty>'}`);
      return false;
    }
    return true;
  },

  // Extract the leading [A-Za-z_]\w* token from a request cmd, after stripping
  // "{" and any "V<n>:" version prefix.  This is the cmd's leading identifier:
  //   - For drawing-fetch types (menuItemDwg/insertDwg/refresh/refresh-insertDwg)
  //     the cmd is "{<loadCmd>}" or "{V<n>:<loadCmd>}" — token IS the loadCmd.
  //   - For touch-style cmds the cmd is "{<menuItemCmd>~..." — token is the
  //     menuItemCmd (NOT the loadCmd; use _resolveLoadCmdFromRequest for that).
  // Returns "" if the cmd has no leading-alpha identifier (e.g. "{.}", "{ }").
  _extractCmdToken(cmd) {
    if (!cmd || cmd[0] !== '{') return '';
    let body = cmd.slice(1);
    const colon = body.indexOf(':');
    if (colon > 0 && /^[A-Za-z0-9_]+$/.test(body.slice(0, colon))) {
      body = body.slice(colon + 1);
    }
    const m = body.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
    return m ? m[1] : '';
  },

  // Resolve the dwg loadCmd from a request's cmd by parsing the leading
  // identifier (the menuItemCmd) and looking up the matching dwg/dwg-label
  // menu item in _currentMenu.items.  Returns null if the cmd has no
  // identifier or no matching dwg item is found (e.g. menu button click
  // or input submit, where the cmd targets a non-dwg item).
  _resolveLoadCmdFromRequest(request) {
    const menuItemCmd = this._extractCmdToken(request && request.cmd);
    if (!menuItemCmd) return null;
    const items = window.pfodMenuDisplay?._currentMenu?.items || [];
    const item = items.find(i => i.cmd === menuItemCmd
                              && (i.type === 'dwg' || i.type === 'dwg-label'));
    return item ? item.loadCmd : null;
  },

  // The source dwg of a touch-style request — the drawing that owns the
  // touched zone, carried on the request as touchZoneInfo.sourceDwgName by
  // handleTouchZoneActivation.  The response's dwg update is applied to this
  // drawing's per-drawing-raw collections and re-merged, so the new state
  // survives later re-merges.  Returns null for requests with no zone behind
  // them (touchActionInput submits, menu item presses) — those keep the
  // legacy direct-to-merged write.
  _touchSourceDwg(request) {
    return (request && request.touchZoneInfo && request.touchZoneInfo.sourceDwgName) || null;
  },

  // Handle an empty {} response.  Empty replies carry no payload but DO
  // count as "we got a response" — stamp itemRefreshTimes for the target
  // (menu, drawing, or — for touch/drag/partialSlider — resolved via menu
  // item lookup).  Also re-attach mouse listeners on the visible menu's
  // drawing canvases since empty replies skip the normal dwg re-render
  // path that re-registers listeners.
  //
  // Stamp targets by cmd type:
  //   mainMenu / back / menuRefresh           → STAMP 'menu' from header.reRequestMs
  //   menuItemDwg / insertDwg /
  //     refresh / refresh-insertDwg           → STAMP loadCmd from cmd token in
  //                                             drawingsData[loadCmd].data.refresh
  //   touch / drag / partialSlider            → STAMP loadCmd resolved from cmd's
  //                                             menuItem if the item has a loadCmd,
  //                                             else STAMP 'menu'
  //   keepAlive / dataRefresh                 → no stamp (no item to track)
  handleEmptyResponse(request, data) {
    console.log(`[QUEUE] Received empty command response {} - acknowledging without processing`);

    const reqType = request.requestType;

    // Input screen submission (text/numeric/selection) with {} response:
    // device says "no change" — re-request nav-stack top (same as Java's onBackPressed()).
    // Only input screens do this; menu {} stays on current screen.
    if (reqType === 'input') {
      const navCmd = this.menuNavStack.length > 0
        ? this.versionedMenuCmd(this.menuNavStack[this.menuNavStack.length - 1])
        : '{.}';
      if (this.updateTimer) { clearTimeout(this.updateTimer); this.updateTimer = null; }
      this.clearPendingQueue();
      this.addToRequestQueue(navCmd, null, null, 'back');
      return;
    }

    const isMenuCmd     = (reqType === 'mainMenu' || reqType === 'back' || reqType === 'menuRefresh');
    const isDrawingCmd  = (reqType === 'menuItemDwg' || reqType === 'insertDwg'
                        || reqType === 'refresh'    || reqType === 'refresh-insertDwg');
    const isTouchLike   = (reqType === 'touch' || reqType === 'drag'
                        || reqType === 'partialSlider' || reqType === 'unknown');

    if (isMenuCmd) {
      const menuRate = window.pfodMenuDisplay?._currentMenu?.header?.reRequestMs || 0;
      this.itemRefreshTimes.set('menu', menuRate > 0 ? Date.now() : null);
    } else if (isDrawingCmd) {
      // Drawing-fetch cmd: cmd token IS the loadCmd (e.g. "{V1:c2}" → "c2").
      const loadCmd = this._extractCmdToken(request.cmd);
      if (loadCmd) {
        const rate = this.redraw.redrawDrawingManager.drawingsData[loadCmd]?.data?.refresh || 0;
        this.itemRefreshTimes.set(loadCmd, rate > 0 ? Date.now() : null);
      }
    } else if (isTouchLike) {
      const loadCmd = this._resolveLoadCmdFromRequest(request);
      if (loadCmd) {
        const rate = this.redraw.redrawDrawingManager.drawingsData[loadCmd]?.data?.refresh || 0;
        this.itemRefreshTimes.set(loadCmd, rate > 0 ? Date.now() : null);
      } else {
        const menuRate = window.pfodMenuDisplay?._currentMenu?.header?.reRequestMs || 0;
        this.itemRefreshTimes.set('menu', menuRate > 0 ? Date.now() : null);
      }
    }
    // keepAlive / dataRefresh: no stamp.

    // Re-attach mouse listeners for drawing canvases in the current menu.
    // {} responses skip the normal response path that re-registers listeners
    // after a drawing refresh, so we must do it here.
    if (document.body.className === 'menu-mode'
        && window.pfodMenuDisplay
        && window.pfodMenuDisplay._currentMenu
        && window.pfodWebMouse) {
      for (const dwgItem of (window.pfodMenuDisplay._currentMenu.drawingItems || [])) {
        const entry = window.pfodMenuDisplay.getMenuCanvas(dwgItem.loadCmd);
        if (entry) {
          window.pfodWebMouse.setupMenuCanvasListeners(entry.canvas, dwgItem.loadCmd, dwgItem.cmd, this);
        }
      }
    }
  },

  // Process a pfod menu response: {,} new menu or {;} update.
  // For {;}: load cached base, apply update on top, display.
  // For {,}: cache the menu and display it.
  processMenuResponse(data, request) {
    let cmd;
    if (data.cmd) {
      cmd = data.cmd;
    } else {
      console.log('[QUEUE] No cmd field in server response ', JSON.stringify(data));
      return false;
    }
    const msgType = cmd[0];
    if (!(msgType.startsWith("{,") || msgType.startsWith("{;"))) {
      console.log('[QUEUE] Not a menu response ', JSON.stringify(data));
      return false;
    }

    const menuData = window.pfodParseMenu ? window.pfodParseMenu(cmd.slice()) : null;
    if (!menuData) return false;

    const reqCmd = pfodStripMenuCmdVersion(request ? request.cmd : '{.}');
    const bareCmd = reqCmd.slice(1, -1);
    const reqType = request ? request.requestType : 'menuItemDwg';
    const self = this;

    if (menuData.header.isUpdate) {
      // {;} update.  Three routes — pick by whether reqCmd targets a
      // *different* cached menu than the currently-displayed one:
      //   (a) Navigate forward to a cached submenu.  Fires when the user
      //       clicks a menu button whose cmd is cached (versioned-hit) and
      //       the device replies with {;} — reqCmd != currentMenuCmd AND
      //       there's a cached parsed menu for reqCmd.  Display switches
      //       to that cached menu with the update applied on top.
      //   (b) In-place update to the displayed menu.  Fires for refreshes
      //       (reqCmd == currentMenuCmd) and for touch-on-dwg responses
      //       where reqCmd is a touch sub-cmd with no cache entry of its
      //       own — the {;} update is for the menu the user is looking at.
      //   (c) Navigate from cache (back arrow case).  Toolbar pre-pops the
      //       nav stack and pre-hides the menu before sending {V:l}, so by
      //       the time we get the {;} reply currentMenuCmd already equals
      //       reqCmd and isVisible() is false.  Fall through to render the
      //       cached menu with the update applied.
      const currentMenuCmd = this.menuNavStack.length > 0
          ? this.menuNavStack[this.menuNavStack.length - 1] : '{.}';
      const currentBareCmd = currentMenuCmd.slice(1, -1);
      const baseMenuDataForReqCmd = this.menuCache ? this.menuCache.getParsedMenu(bareCmd) : null;
      const isForwardNavigation = baseMenuDataForReqCmd && (reqCmd !== currentMenuCmd);

      if (isForwardNavigation) {
        console.log('[MENU_CACHE] {;} response is forward-nav to cached submenu "' + bareCmd + '" - showing from cache with update applied');
        this._navigateToMenu(baseMenuDataForReqCmd, menuData, reqCmd, reqType, request, self);
      } else if (window.pfodMenuDisplay.isVisible()) {
        console.log('[QUEUE] {;} in-place update to visible menu - merging');
        window.pfodMenuDisplay.update(menuData);
        // Stamp 'menu' last-response.  {; can update header.reRequestMs
        // (pfodMenuDisplay.update applies non-null values); read the merged
        // effective rate from _currentMenu.  rate>0 → Date.now(); rate==0 → null.
        {
          const menuRate = window.pfodMenuDisplay?._currentMenu?.header?.reRequestMs || 0;
          this.itemRefreshTimes.set('menu', menuRate > 0 ? Date.now() : null);
        }
        // Keep cache in sync with the latest merged state so back-navigation shows current values
        if (this.menuCache) {
          this.menuCache.updateParsedMenu(currentBareCmd, window.pfodMenuDisplay._currentMenu);
        }
        this.handleResize();
        // Re-attach mouse listeners to the fresh canvases created by update()/show()
        if (window.pfodMenuDisplay._currentMenu && window.pfodMenuDisplay._currentMenu.hasDrawing && window.pfodWebMouse) {
          for (const dwgItem of window.pfodMenuDisplay._currentMenu.drawingItems) {
            const entry = window.pfodMenuDisplay.getMenuCanvas(dwgItem.loadCmd);
            if (entry) {
              window.pfodWebMouse.setupMenuCanvasListeners(entry.canvas, dwgItem.loadCmd, dwgItem.cmd, self);
            }
          }
        }
        // Re-request drawing items so drawings stay in sync with the {;} update.
        // Fires for every in-place menu update (menuRefresh, refresh, touch sub-cmd
        // returning {;}) — matching the back-arrow path in _navigateToMenu, which
        // queues drawing fetches unconditionally.  Driven only by whether the
        // current menu has drawings, not by reqType.
        if (window.pfodMenuDisplay._currentMenu && window.pfodMenuDisplay._currentMenu.hasDrawing) {
          const connectionId = (typeof getConnectionIdentifier === 'function')
            ? getConnectionIdentifier(this.connectionManager) : null;
          for (const dwgItem of window.pfodMenuDisplay._currentMenu.drawingItems) {
            const drawingName = dwgItem.loadCmd;
            this.currentIdentifier = dwgItem.cmd;
            // Hydrate per-drawing state from cache (if any) before building
            // the verify cmd so its version reflects the cached entry.
            if (connectionId && !this.redraw.redrawDrawingManager.drawingsData[drawingName]?.data) {
              this.redraw.redrawDrawingManager.loadDrawingDataFromStorage(drawingName, connectionId);
            }
            const storedVersion = this.redraw.redrawDrawingManager.getStoredVersion(drawingName, connectionId);
            const drawingCmd = storedVersion
              ? '{' + storedVersion + ':' + drawingName + '}'
              : '{' + drawingName + '}';
            if (!this.redraw.redrawDrawingManager.drawings.includes(drawingName)) {
              this.redraw.redrawDrawingManager.drawings.push(drawingName);
            }
            // Maintain itemRefreshTimes invariant: every entry in dm.drawings
            // has an entry.  null = no response yet (or rate==0); the response
            // stamp in _stampRefreshTimeAfterResponse updates to Date.now()
            // when the rate is > 0.
            if (!this.itemRefreshTimes.has(drawingName)) {
              this.itemRefreshTimes.set(drawingName, null);
            }
            console.log('[QUEUE] Refresh: re-requesting drawing "' + drawingName + '" cmd=' + drawingCmd);
            this.addToRequestQueue(drawingCmd, request.options, null, 'refresh');
          }
        }
      } else if (baseMenuDataForReqCmd) {
        // Menu hidden + reqCmd matches currentMenuCmd (back-arrow case).
        // Toolbar pre-popped the nav stack and pre-hid the visible menu
        // before sending the request; render the cached menu with the
        // update applied.
        console.log('[MENU_CACHE] {;} response (back navigation) - showing cached menu "' + bareCmd + '" with update applied');
        this._navigateToMenu(baseMenuDataForReqCmd, menuData, reqCmd, reqType, request, self);
      } else {
        // Back-nav arrived for a menu the toolbar pre-hid, but we have no
        // cached parsed copy of it (typical cause: that menu's prior {,}
        // response was unversioned and therefore not persisted).  Pop the
        // failed back target off menuNavStack so the next back / reload
        // targets the menu BEFORE it, and surface the error.  Stay in the
        // transient message-mode (the "Requesting Menu" overlay) — user
        // retries via toolbar back/reload.
        console.error(`[QUEUE] {;} response for "${reqCmd}" but no cached parsed menu — popping nav stack and showing error`);
        if (this.menuNavStack.length > 1) {
          const popped = this.menuNavStack.pop();
          console.log(`[MENU_NAV] Popped failed back target "${popped}" — stack now: ${JSON.stringify(this.menuNavStack)}`);
        }
        const newTop = this.menuNavStack.length > 0
          ? this.menuNavStack[this.menuNavStack.length - 1]
          : '{.}';
        pfodAlert(
          `Cannot navigate back to "${reqCmd}"\nthe device returned an update for a menu that was not cached.\n\n` +
          `Use the toolbar's back arrow or reload button to retry\nthey now target "${newTop}".`,
          () => {} // no-op; pfodAlert needs a non-null callback to render the Close button
        );
      }
      return true;
    }

    // {,} full new menu — record cmd, cache it, and display
    this.menuCmdSet.add(reqCmd);
    console.log('[MENU_NAV] Recorded menu cmd:', reqCmd, '- known set:', JSON.stringify([...this.menuCmdSet]));
    if (this.menuCache) {
      if (!menuData.header.version) {
        // Unversioned {,} response — evict only this menu's entry.
        // Versioning is per-menu (the device decides per response), so an
        // unversioned response for one cmd doesn't imply the other cached
        // menus are stale; leave them alone.  Next cycle re-requests this
        // menu unversioned.
        this.menuCache.removeMenu(bareCmd);
        console.log('[MENU_CACHE] {, response has no version - evicted "' + bareCmd + '" from cache');
      } else {
        this.menuCache.storeMenu(bareCmd, cmd.slice(), menuData.header.version);
        this.menuCache.updateParsedMenu(bareCmd, menuData);
      }
    }
    this._navigateToMenu(menuData, null, reqCmd, reqType, request, self);
    return true;
  },

  // Show a menu (or navigate to one from cache), optionally applying a pending {;} update after show.
  // Handles nav stack push, mode transition out of menu-mode, canvas registration, and drawing requests.
  _navigateToMenu(menuData, pendingUpdate, reqCmd, reqType, request, self) {
    // Push onto navigation stack unless this is a refresh or back navigation
    if (reqType !== 'refresh' && reqType !== 'back' && this.menuCmdSet.has(reqCmd)) {
      this.pushMenuNavCmd(reqCmd);
    }

    // Exit menu-mode first so the old menu's canvases are restored before show() creates new ones
    if (document.body.className === 'menu-mode' && window.pfodMenuDisplay) {
      window.pfodMenuDisplay.hide();
      this.redraw.clearMenuCanvases();
    }

    // Cancel pending refresh timer for the menu we're leaving.  keepAliveTimer
    // (raw-data polling) stays untouched — it's on a separate timer chain in
    // keepAlive.js, gated by protocol not mode.
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    // Don't remove existing drawings here: a {;} menu update can't remove
    // items (only hide/disable them), and a {,} full menu re-uses any dwg
    // items that survive into the new menu.  Drawings in dm.drawings keep
    // their drawingsData / per-drawing-raw collections so handleMenuResize
    // (called below after show()) finds existing canvas dimensions instead
    // of falling back to the placeholder size — that's what caused the
    // per-refresh size flash.  A drawing's dimensions only change when a
    // fresh {+`w`h start arrives for it; until then the previous size is
    // displayed.

    // Pre-load per-drawing caches BEFORE show()/handleResize so the very first
    // handleMenuResize call finds drawingsData and sizes canvases with the
    // correct aspect ratio.  Without this pre-load, the first paint runs with
    // the wide placeholder canvas dimensions while the cached drawing's items
    // get rendered at distorted non-uniform scale, producing a "jumbled"
    // flash before the next resize snaps to the correct size.  Lines below
    // (in the drawingItems loop after show()) still call loadDrawingDataFromStorage
    // defensively but become no-ops once data is already present.
    if (menuData.hasDrawing) {
      const preloadConnId = (typeof getConnectionIdentifier === 'function')
        ? getConnectionIdentifier(this.connectionManager) : null;
      if (preloadConnId) {
        for (const dwgItem of menuData.drawingItems) {
          const drawingName = dwgItem && dwgItem.loadCmd;
          if (!drawingName) continue;
          if (!this.redraw.redrawDrawingManager.drawingsData[drawingName]?.data) {
            this.redraw.redrawDrawingManager.loadDrawingDataFromStorage(drawingName, preloadConnId);
          }
          this.redraw.redrawDrawingManager.loadMenuDwgMergedFromStorage(drawingName, preloadConnId);
        }
      }
    }

    window.pfodMenuDisplay.show(menuData, function(clickedCmd) {
      // Send versioned request if this is a known menu cmd with a cached version
      let fullCmd = '{' + clickedCmd + '}';
      if (self.menuCache && self.menuCmdSet.has(fullCmd)) {
        const ver = self.menuCache.getMenuVersion(clickedCmd);
        if (ver) {
          fullCmd = '{' + ver + ':' + clickedCmd + '}';
          console.log('[MENU_CACHE] Using versioned cmd for button click:', fullCmd);
        }
      }
      console.log(`[MENU] Item clicked: cmd="${clickedCmd}" sending="${fullCmd}"`);
      self.addToRequestQueue(fullCmd, null, null, 'touch');
    });
    this.handleResize();

    // Apply any pending {;} flag/header update on top of the freshly shown menu
    if (pendingUpdate) {
      window.pfodMenuDisplay.update(pendingUpdate);
      this.handleResize();
    }

    // Register per-item canvases with redraw so drawings render into menu wrappers,
    // and wire mouse/touch events so touch zones on menu drawings send commands.
    if (window.pfodMenuDisplay) {
      this.redraw.clearMenuCanvases();
      for (const dwgItem of (menuData.drawingItems || [])) {
        const entry = window.pfodMenuDisplay.getMenuCanvas(dwgItem.loadCmd);
        if (entry) {
          this.redraw.setMenuCanvas(dwgItem.loadCmd, entry.canvas, entry.ctx);
          if (window.pfodWebMouse) {
            window.pfodWebMouse.setupMenuCanvasListeners(entry.canvas, dwgItem.loadCmd, dwgItem.cmd, this);
          }
        }
      }
    }

    // Stamp 'menu' last-response.  Read the effective rate from _currentMenu
    // (post-show / post-update) so we honour the "missing rate in an update
    // means no change" rule — pfodMenuDisplay.update() preserves the previous
    // reRequestMs when the new menuData carries null.  rate>0 → Date.now();
    // rate==0 → null (no auto-refresh for this menu).
    {
      const menuRate = window.pfodMenuDisplay?._currentMenu?.header?.reRequestMs || 0;
      this.itemRefreshTimes.set('menu', menuRate > 0 ? Date.now() : null);
    }

    // A menu can contain zero or more drawing items.  Each drawing item
    // references its own drawing — there is no single "main" drawing
    // for a menu.  Queue one menuItemDwg fetch per drawing item, hydrating
    // per-drawing state and per-menuDwg merged state from cache (if any)
    // so the canvas can render the cached merged tree immediately while
    // the verify request is in flight.
    if (menuData.hasDrawing) {
      const connectionId = (typeof getConnectionIdentifier === 'function')
        ? getConnectionIdentifier(this.connectionManager) : null;
      for (const dwgItem of menuData.drawingItems) {
        if (!dwgItem.loadCmd) {
          throw new Error(`[QUEUE] Menu drawing item has no loadCmd — cannot determine drawing to fetch. dwgItem=${JSON.stringify(dwgItem)}`);
        }
        const drawingName = dwgItem.loadCmd;
        this.currentIdentifier = dwgItem.cmd;
        console.log(`[QUEUE] Menu contains drawing item - queuing drawing request for "${drawingName}", identifier="${this.currentIdentifier}"`);

        if (connectionId && !this.redraw.redrawDrawingManager.drawingsData[drawingName]?.data) {
          this.redraw.redrawDrawingManager.loadDrawingDataFromStorage(drawingName, connectionId);
        }
        if (connectionId) {
          this.redraw.redrawDrawingManager.loadMenuDwgMergedFromStorage(drawingName, connectionId);
        }

        const storedVersion = this.redraw.redrawDrawingManager.getStoredVersion(drawingName, connectionId);
        const drawingCmd = storedVersion
          ? '{' + storedVersion + ':' + drawingName + '}'
          : '{' + drawingName + '}';
        if (!this.redraw.redrawDrawingManager.drawings.includes(drawingName)) {
          this.redraw.redrawDrawingManager.drawings.push(drawingName);
        }
        // Maintain itemRefreshTimes invariant: every entry in dm.drawings
        // has an entry.  null = no response yet (or rate==0); the response
        // stamp updates to Date.now() when rate is > 0.
        if (!this.itemRefreshTimes.has(drawingName)) {
          this.itemRefreshTimes.set(drawingName, null);
        }
        this.addToRequestQueue(drawingCmd, request ? request.options : null, null, 'menuItemDwg');
      }
    }
  },

  /**
   * Handle valid dwg update responses ({+...}, or partial updates).
   * Updates the live redrawDrawingManager's per-drawing raw collections in
   * place.  The caller (requestQueue.processRequestQueue or
   * drawingProcessing.processPendingResponses) is responsible for running
   * the merger and performRedraw once the batch settles, so multi-response
   * batches don't trigger N redraws.
   */
  handleDwgResponse(data, request) {
    console.log('[QUEUE] Handling dwg response');

    // Check if this DRAG response should be discarded due to newer drag requests in queue
    if (request.touchZoneInfo && request.touchZoneInfo.filter === TouchZoneFilters.DRAG) {
      const cmd = request.touchZoneInfo.cmd;
      const hasNewerDragRequest = this.requestQueue.some(queuedRequest =>
        queuedRequest.touchZoneInfo &&
        queuedRequest.touchZoneInfo.filter === TouchZoneFilters.DRAG &&
        queuedRequest.touchZoneInfo.cmd === cmd
      );

      if (hasNewerDragRequest) {
        console.log(`[QUEUE] Discarding DRAG response for cmd="${cmd}" - newer request exists in queue`);
        return false; // Discard this response
      }
    }

    try {
      if (document.body.className === 'input-mode' && window.pfodInputDisplay) {
        console.log('[QUEUE] Exiting input-mode before processing drawing response');
        window.pfodInputDisplay.hide();
      }
      if (document.body.className === 'numeric-input-mode' && window.pfodNumericInputDisplay) {
        console.log('[QUEUE] Exiting numeric-input-mode before processing drawing response');
        window.pfodNumericInputDisplay.hide();
      }
      if (document.body.className === 'selection-mode' && window.pfodSelectionDisplay) {
        console.log('[QUEUE] Exiting selection-mode before processing drawing response');
        window.pfodSelectionDisplay.hide();
      }
      console.log(`[QUEUE] Processing ${request.requestType} response for "${request.cmd}"`);

      // Derive data.name (the routing key for processDrawingData →
      // drawingsData[name] / unindexedItems[name] / etc.) from the request cmd.
      // The cmd is the authoritative source:
      //   - drawing-fetch types (menuItemDwg/insertDwg/refresh/refresh-insertDwg):
      //     cmd is "{<loadCmd>}" or "{V<n>:<loadCmd>}" — extract token directly.
      //   - touch-style types (touch/drag/partialSlider/unknown): cmd is
      //     "{<menuItemCmd>~..." — look up menu item to get its loadCmd.
      //     A {+ response targets allXXX[loadCmd] so the menu-items lookup is
      //     mandatory; for non-dwg menu items (e.g. menu button click) the
      //     lookup returns null and the resulting null data.name signals the
      //     merged-update path or is handled by downstream guards.
      //   - menu types (mainMenu/back/menuRefresh) shouldn't reach here at all
      //     (handleNonDwgResponse path) so leave the fall-back as null.
      const reqType = request.requestType;
      if (reqType === 'menuItemDwg' || reqType === 'insertDwg'
       || reqType === 'refresh'    || reqType === 'refresh-insertDwg') {
        data.name = this._extractCmdToken(request.cmd) || null;
      } else if (reqType === 'touch' || reqType === 'drag'
              || reqType === 'partialSlider' || reqType === 'unknown') {
        // Apply the response to the source dwg (the drawing owning the
        // touched zone, carried on the request) so the update lands in that
        // drawing's per-drawing-raw collections and survives later
        // re-merges.  Requests without a source dwg fall back to the
        // menuItemDwg and the legacy direct-to-merged write.
        const sourceDwg = this._touchSourceDwg(request);
        data.name = sourceDwg || this._resolveLoadCmdFromRequest(request);
        data._sourceDwgRouted = !!sourceDwg;
      } else {
        data.name = null;
      }

      this.processDrawingData(data, null, request.requestType);
      return true;
    } catch (error) {
      console.error(`[QUEUE] Error processing dwg response:`, error);
      console.error(`[QUEUE] Error stack:`, error.stack);

      // Additional diagnostics for debugging — derive the loadCmd from the
      // request cmd via the same helpers the response router uses.
      const dwgName = this._resolveLoadCmdFromRequest(request)
                   || this._extractCmdToken(request.cmd)
                   || " ";
      const dm = this.redraw.redrawDrawingManager;
      console.log(`[QUEUE] Debugging state for "${dwgName}":`);
      console.log(`- Registered drawings: ${JSON.stringify(dm.drawings)}`);
      console.log(`- Drawing in drawings array: ${dm.drawings.includes(dwgName)}`);
      console.log(`- Drawing in drawingsData: ${dm.drawingsData[dwgName] ? 'yes' : 'no'}`);
      console.log(`- unindexedItems collection exists: ${dm.unindexedItems[dwgName] ? 'yes' : 'no'}`);
      console.log(`- indexedItems collection exists: ${dm.indexedItems[dwgName] ? 'yes' : 'no'}`);
      console.log(`- touchZonesByCmd collection exists: ${dm.touchZonesByCmd[dwgName] ? 'yes' : 'no'}`);

      // Try to fix any missing collections
      if (dwgName !== " " && (!dm.unindexedItems[dwgName] || !dm.indexedItems[dwgName])) {
        console.log(`[QUEUE] Attempting to fix missing collections for "${dwgName}"`);
        dm.ensureItemCollections(dwgName);
      }

      // Show the no-connection alert when the failure is on the very
      // first request after connection (request.isInitial is set in
      // queueInitialRequest) — at that point there's nothing on screen
      // to keep, so the alert is the right user feedback.  For inserted
      // / refresh / later requests, just log and continue.
      const isInitial = request.isInitial === true;

      if (isInitial) {
        // Show alert dialog with Close button that reloads page
        console.log(`[ALERT] Triggering No Connection alert for initial request "${request.cmd}"`);
        console.log(`[ALERT] Error message: ${error.message}`);
        console.log(`[ALERT] Error name: ${error.name}`);
        this.showNoConnectionAlert();
      } else {
        // For inserted drawings, just log the error but continue processing
        console.warn(`[QUEUE] ERROR: Failed to load inserted drawing "${dwgName}" - continuing without it`);
      }
      return false;
    }
  },

  /**
   * Handle non-dwg update responses (responses that are not {}, {+...}, or partial updates)
   * Only restores from backup if currently displaying dwg, then clears flag
   * Processes based on response type
   */
  handleNonDwgResponse(data, request, requestType) {
    console.log('[QUEUE] Handling non-dwg response');

    // Handle menu responses
    if (data.cmd && data.cmd[0] && (data.cmd[0].startsWith('{,') || data.cmd[0].startsWith('{;'))) {
      console.log('[QUEUE] Processing menu response');

      // Exit other display modes before processing a new menu response
      if (document.body.className === 'chart-mode') {
        console.log('[QUEUE] Exiting chart display before processing menu response');
        this.exitChartDisplay();
      }
      if (document.body.className === 'rawdata-mode') {
        console.log('[QUEUE] Exiting raw data display before processing menu response');
        this.exitRawDataDisplay();
      }
      // exitStreamingData is idempotent — call it whenever a streaming panel exists,
      // not only when className==='streaming-mode'.  This catches the case where the
      // panel was left in the DOM by an intermediate chart-mode (toolbar "..."→Chart
      // from streaming) and is still visible when the menu tries to show.
      if (document.getElementById('streaming-data-display')) {
        console.log('[QUEUE] Cleaning up leftover streaming panel before processing menu response');
        this.exitStreamingData();
      }
      if (document.body.className === 'input-mode' && window.pfodInputDisplay) {
        console.log('[QUEUE] Exiting input-mode before processing menu response');
        window.pfodInputDisplay.hide();
      }
      if (document.body.className === 'numeric-input-mode' && window.pfodNumericInputDisplay) {
        console.log('[QUEUE] Exiting numeric-input-mode before processing menu response');
        window.pfodNumericInputDisplay.hide();
      }
      if (document.body.className === 'selection-mode' && window.pfodSelectionDisplay) {
        console.log('[QUEUE] Exiting selection-mode before processing menu response');
        window.pfodSelectionDisplay.hide();
      }
      // For {,} responses, hide the current menu before processMenuResponse shows the new one.
      // For {;} responses, _navigateToMenu handles the hide when needed (cache-valid path).
      const isMenuUpdate = data.cmd[0].startsWith('{;');
      if (document.body.className === 'menu-mode' && window.pfodMenuDisplay && !isMenuUpdate) {
        console.log('[QUEUE] Exiting previous menu-mode before processing new menu response');
        window.pfodMenuDisplay.hide();
        this.redraw.clearMenuCanvases();
      }

      var result = this.processMenuResponse(data, request);
      if (result) {
        // Menu responses represent navigation to a new display
        // updateNavigationStack will skip refresh, refresh-insertDwg, and back requests internally
        this.updateNavigationStack(this.sentRequest);
        return; // menu was handled
      }
    }

    // Handle specific response types
    if (data.cmd && data.cmd[0] && data.cmd[0].startsWith('{=')) {
      // Exit menu-mode before switching to chart/rawdata display so the canvas is
      // restored to #canvas-wrapper before chartDisplay tries to resize and render it.
      if (document.body.className === 'menu-mode' && window.pfodMenuDisplay) {
        console.log('[QUEUE] Exiting menu-mode before processing chart/rawdata response');
        window.pfodMenuDisplay.hide();
        this.redraw.clearMenuCanvases();
      }
      console.log('[QUEUE] Processing response - checking for chart vs raw data');
      console.log('[QUEUE] Full data.cmd array:', data.cmd);
      console.log('[QUEUE] window.chartDisplay exists:', !!window.chartDisplay);

      // Try to parse as chart format (with pipe-delimited labels and optional plotNo)
      let chartInfo = null;
      if (window.chartDisplay) {
        console.log('[QUEUE] Calling parseChartLabelsWithPlotNo with entire cmd array');
        chartInfo = window.chartDisplay.parseChartLabelsWithPlotNo(data.cmd);
        console.log('[QUEUE] parseChartLabelsWithPlotNo returned:', chartInfo);
      } else {
        console.log('[QUEUE] WARNING: window.chartDisplay is not defined! Type:', typeof window.chartDisplay);
      }

      if (chartInfo) {
        // This is a chart response
        console.log('[QUEUE] Processing chart response:', chartInfo);

        // ~C clear is applied SYNCHRONOUSLY at the connection-layer byte
        // boundary (applyClearOption, via the Option-B callback) the moment
        // this {=..~C..} command is consumed — BEFORE the CSV that follows it
        // in the same stream is collected.  Doing it here (async, after the
        // whole response was already collected) is what wiped the new data.

        this.updateNavigationStack(this.sentRequest);
        window.currentChartInfo = chartInfo;
        this.displayChartWithPlotNo();
      } else {
        // Section 9 streaming raw data response: {=[<title>]}
        console.log('[QUEUE] Processing streaming raw data response');

        // Title is between '=' and '}'.  Tilde-separated trailing parts are
        // plot options (single-letter flags).  We support ~C (clear) here;
        // others are silently ignored to match the chart-format behaviour.
        const msgType = data.cmd[0];
        const startIdx = msgType.indexOf('=');
        let endIdx = msgType.indexOf('}');
        if (endIdx === -1) endIdx = msgType.length;
        const fullTitle = startIdx !== -1 ? msgType.substring(startIdx + 1, endIdx) : '';
        const titleParts = fullTitle.split('~');
        const streamTitle = (titleParts[0] || '').trim();
        let streamClearData = false;
        for (let i = 1; i < titleParts.length; i++) {
          const part = titleParts[i].trim();
          if (part === 'C') streamClearData = true;
          // any other single-letter or multi-letter option is silently ignored
        }

        // ~C clear is applied SYNCHRONOUSLY at the connection-layer byte
        // boundary (applyClearOption, via the Option-B callback) the moment
        // this {=..~C..} command is consumed — BEFORE the raw data that
        // follows it in the same stream is collected.  (streamClearData is
        // still parsed above for any future display use.)

        // Show all raw data accumulated so far; polling appends new data as it arrives
        const initialData = window.rawDataCollector ? window.rawDataCollector.getRawDataWithoutClearing() : '';
        this.updateNavigationStack(this.sentRequest);
        this.displayStreamingData(streamTitle, initialData);
      }
      return true;
    }

    // Add handlers for other non-dwg response types here as needed

    // Handle string input screen (Section 10: {'cmd[`maxLen][~prompt][|initialText]})
    if (data.cmd && data.cmd[0] && data.cmd[0].startsWith("{'")) {
      console.log('[QUEUE] Processing string input response');
      const inputData = PfodInputDisplay.parse(data.cmd);
      window.pfodInputDisplay.show(
        inputData,
        (cmd, text) => {
          // onSubmit: send the text cmd — device response determines next screen.
          this.clearPendingQueue();
          this.addToRequestQueue('{' + cmd + '~' + text + '}', null, null, 'input');
          window.pfodInputDisplay.hide();
          this.handleResize();
          this.updateCanvasMessage('Requesting ...');
        }
      );
      return true;
    }

    // Handle numeric input screen (Section 11: {#cmd[~prompt]`current[`max[`min]][~units[~scale[~offset]]})
    if (data.cmd && data.cmd[0] && data.cmd[0].startsWith('{#')) {
      console.log('[QUEUE] Processing numeric input response');
      const inputData = PfodNumericInputDisplay.parse(data.cmd);
      window.pfodNumericInputDisplay.show(
        inputData,
        (cmd, intValue) => {
          // onSubmit: send the numeric cmd — device response determines next screen.
          this.clearPendingQueue();
          this.addToRequestQueue('{' + cmd + '`' + intValue + '}', null, null, 'input');
          window.pfodNumericInputDisplay.hide();
          this.handleResize();
          this.updateCanvasMessage('Requesting ...');
        }
      );
      return true;
    }

    // Handle single/multi selection screens (Sections 12 & 13)
    const _isSingle = data.cmd && data.cmd[0] && data.cmd[0].startsWith('{?');
    const _isMulti  = data.cmd && data.cmd[0] && data.cmd[0].startsWith('{*');
    if (_isSingle || _isMulti) {
      console.log('[QUEUE] Processing', _isMulti ? 'multi' : 'single', 'selection response');
      const inputData = _isMulti
        ? PfodSelectionDisplay.parseMulti(data.cmd)
        : PfodSelectionDisplay.parseSingle(data.cmd);
      window.pfodSelectionDisplay.show(
        inputData,
        (cmd, isMulti, sortedIndices) => {
          // Build response string per pfod spec — device response determines next screen.
          let response;
          if (!isMulti) {
            response = '{' + cmd + '`' + sortedIndices[0] + '}';
          } else if (sortedIndices.length === 0) {
            response = '{' + cmd + '}';
          } else {
            response = '{' + cmd;
            for (let i = 0; i < sortedIndices.length; i++) response += '`' + sortedIndices[i];
            response += '}';
          }
          this.clearPendingQueue();
          this.addToRequestQueue(response, null, null, 'input');
          window.pfodSelectionDisplay.hide();
          this.handleResize();
          this.updateCanvasMessage('Requesting ...');
        }
      );
      return true;
    }

    // {!msg} — device forces connection close and shows a message to the user.
    // Displays the message then runs the shared exit flow on dismiss.
    if (data.cmd && data.cmd[0] && data.cmd[0].startsWith('{!')) {
      const msg = data.cmd[0].slice(2);
      console.log('[QUEUE] Close-connection response received:', msg);
      document.body.className = 'message-mode';
      pfodAlert(msg, () => {
        this._exitToConnectionScreen();
      });
      return true;
    }

    // {<} — device requests back navigation (same as toolbar back button)
    if (data.cmd && data.cmd[0] === '{<') {
      console.log('[RESPONSE] Received {<} - navigating back');
      const wasInMenuMode = document.body.className === 'menu-mode';

      if (wasInMenuMode && window.pfodMenuDisplay) {
        window.pfodMenuDisplay.hide();
        this.redraw.clearMenuCanvases();
      } else if (document.body.className === 'input-mode' && window.pfodInputDisplay) {
        window.pfodInputDisplay.hide();
      } else if (document.body.className === 'numeric-input-mode' && window.pfodNumericInputDisplay) {
        window.pfodNumericInputDisplay.hide();
      } else if (document.body.className === 'selection-mode' && window.pfodSelectionDisplay) {
        window.pfodSelectionDisplay.hide();
      } else if (document.body.className === 'chart-mode') {
        this.exitChartDisplay();
      }
      this.handleResize();
      this.updateCanvasMessage('Requesting Menu ...');

      let cmdToSend;
      if (wasInMenuMode && this.menuNavStack.length > 0) {
        if (this.menuNavStack.length > 1) {
          this.menuNavStack.pop();
        }
        cmdToSend = this.versionedMenuCmd(this.menuNavStack[this.menuNavStack.length - 1]);
      } else if (this.commandStack.length > 0) {
        cmdToSend = this.commandStack.pop();
      } else {
        cmdToSend = '{.}';
      }
      // Stop any pending auto-refresh fire — the back response will
      // re-evaluate scheduleNextUpdate.  itemRefreshTimes entries are
      // preserved (they're per-drawing/menu cached state).
      if (this.updateTimer) { clearTimeout(this.updateTimer); this.updateTimer = null; }
      this.clearPendingQueue();
      this.addToRequestQueue(cmdToSend, null, null, 'back');
      return true;
    }

    // {<<} — device requests home navigation (clear stacks, send {.})
    if (data.cmd && data.cmd[0] === '{<<') {
      console.log('[RESPONSE] Received {<<} - navigating to main menu');

      if (document.body.className === 'menu-mode' && window.pfodMenuDisplay) {
        window.pfodMenuDisplay.hide();
        this.redraw.clearMenuCanvases();
      } else if (document.body.className === 'input-mode' && window.pfodInputDisplay) {
        window.pfodInputDisplay.hide();
      } else if (document.body.className === 'numeric-input-mode' && window.pfodNumericInputDisplay) {
        window.pfodNumericInputDisplay.hide();
      } else if (document.body.className === 'selection-mode' && window.pfodSelectionDisplay) {
        window.pfodSelectionDisplay.hide();
      } else if (document.body.className === 'chart-mode') {
        this.exitChartDisplay();
      }
      this.handleResize();
      this.updateCanvasMessage('Requesting Main Menu ...');

      this.menuNavStack = [];
      this.commandStack = [];
      // Stop any pending auto-refresh fire — the mainMenu response will
      // re-evaluate scheduleNextUpdate.  itemRefreshTimes entries are
      // preserved (they're per-drawing/menu cached state).
      if (this.updateTimer) { clearTimeout(this.updateTimer); this.updateTimer = null; }
      this.clearPendingQueue();
      // Use the versioned form when the cache has a stored version for the
      // main menu — same as back-arrow / reload / queueInitialRequest paths.
      // Plain {.} would force the device to resend the full menu unnecessarily.
      this.addToRequestQueue(this.versionedMenuCmd('{.}'), null, null, 'mainMenu');
      return true;
    }

    // Add handlers for other non-dwg response types here as needed
    return false;
  },

  // Handle drawing error (not found, etc) - instance method for multi-viewer support
  handleDrawingError(errorData) {
    console.error(`Drawing error: ${errorData.error} - ${errorData.message}`);

    // Completely remove any canvas container that might interfere
    if (this.canvasContainer) {
      this.canvasContainer.style.display = 'none';
    }

    // Create a brand new error message div directly in the body
    // First, remove any existing error message
    const existingError = document.getElementById('error-message');
    if (existingError) {
      document.body.removeChild(existingError);
    }

    // Create the new error element
    const errorMessageElement = document.createElement('div');
    errorMessageElement.id = 'error-message';

    // Apply inline styles directly
    errorMessageElement.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: white;
            z-index: 999999;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: 20px;
            box-sizing: border-box;
            font-family: Arial, sans-serif;
            color: #333;
            text-align: center;
        `;

    // Set the HTML content
    errorMessageElement.innerHTML = `
            <div style="
                background-color: white;
                padding: 30px;
                border-radius: 10px;
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                max-width: 80%;
                margin: 0 auto;
                text-align: center;
            ">
                <h2 style="
                    color: #d32f2f;
                    margin-bottom: 20px;
                    font-size: 28px;
                    font-weight: bold;
                ">Drawing Error</h2>
                <p style="
                    font-size: 20px;
                    margin-bottom: 20px;
                    color: #333;
                ">${errorData.message}</p>
                <p style="
                    font-size: 18px;
                    margin-bottom: 30px;
                    color: #666;
                ">Please check the drawing name and try again.</p>
            </div>
        `;

    // Add to the document body
    document.body.appendChild(errorMessageElement);

    // For debugging
    console.log('Error message created and added to body');

    // Disable updates
    this.isUpdating = false;
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }

    // Log to console
    console.warn("ERROR DISPLAYED TO USER:", errorData.message);

    // Try to adjust the page title to indicate the error
    document.title = "Error: Drawing Not Found";
  },

  // Shared exit flow used by both Path A ({!} sent by user) and Path B ({!<message>} from device).
  // Stops polling, clears the queue, disconnects, and returns to the connection screen.
  _exitToConnectionScreen() {
    this.stopKeepAlivePolling();
    this.clearPendingQueue();
    if (this.connectionManager) {
      this.connectionManager.disconnect().catch(() => {});
      // The reload below (window.location.replace) fires beforeunload,
      // which would otherwise call connectionManager.disconnect() again —
      // resending {!} a second time for no reason since it was just sent
      // on the line above. Flag so beforeunload skips its own disconnect()
      // call (connectionSetup.js) for this reload specifically — the
      // alert's Close-button reload doesn't set this, since it does NOT
      // disconnect() ahead of time the way this function does, and still
      // needs beforeunload's disconnect() to run for it.
      window._pfodAlreadyDisconnected = true;
    }
    // Full page reload — clears all JS state, DOM, and accumulated event listeners.
    // Keep ?targetIP in the URL so the connection prompt's prefillFormFromURL()
    // fills the IP on reload (auto-connect is opt-in via ?autoConnect, which
    // is stripped below so exit always returns to the prompt for cache-clear /
    // chart-only choice / IP edit).
    const url = new URL(window.location.href);
    // Strip 'autoConnect' so reload shows the prompt instead of immediately
    // re-connecting.  autoConnect is a one-shot opt-in for the current
    // session — once the user has exited, they're back to manual confirm.
    url.searchParams.delete('autoConnect');
    // Strip 'chart' unless we're in chart-only mode — outside chart-only the
    // user may have been on any menu/drawing when they hit Exit, and persisting
    // a stale chart= would re-open the chart-only flow on next reconnect.  In
    // chart-only mode chart= is the entire point of the URL; keep it so reload
    // reopens it.
    if (!this.chartOnlyMode) {
      url.searchParams.delete('chart');
    }

    // The reload re-requests this exact origin.  Only check pfodProxy
    // first when it's actually serving this page (_pageServedByProxy()) —
    // a file:// (or other static-server) load reloads straight from disk/
    // that server regardless of pfodProxy, so there's nothing to check.
    // When it IS serving this page and isn't actually there any more
    // (pfodProxy only ever stops when the user closes it directly — see
    // spawn_idle_logger() in main.rs, which just logs idleness rather than
    // acting on it), the browser would otherwise show its own unfriendly
    // "can't connect" error instead of landing back on the connection
    // prompt; fail soft with our own message instead.
    if (!_pageServedByProxy()) {
      window.location.replace(url.toString());
      return;
    }
    const port = window.location.port;
    _pingProxy(port).then((available) => {
      if (available) {
        window.location.replace(url.toString());
      } else {
        // The reload that would normally clear toolbarAndMenu.js's
        // "Closing Down …" spinner (toolbar-closing-overlay) isn't
        // happening — remove it directly so the page doesn't sit frozen
        // behind the alert with no way back.
        const closingOverlay = document.getElementById('toolbar-closing-overlay');
        if (closingOverlay) closingOverlay.remove();
        // The reload that would normally land on `url` (stripped of
        // autoConnect/chart, reflecting the connection just exited) isn't
        // happening either — update just the address bar to match, with no
        // navigation, so it doesn't keep showing whatever was there before
        // Exit was clicked (e.g. a stale HTTP ?targetIP= from an earlier
        // connection in this same tab, when the one just exited was Serial).
        history.replaceState(null, '', url.toString());
        pfodAlert(_proxyUnreachableMsg('127.0.0.1:' + port));
      }
    });
  }

});
