/*
   toolbarAndMenu.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Toolbar button setup, toolbar drop-down menu, and context menu methods
// for the DrawingViewer class.
// Assigned to DrawingViewer.prototype after the class is defined in pfodWeb.js.
//
// State read:    chartOnlyMode, commandStack, menuNavStack, currentRefreshCmd,
//                hasReceivedFirstResponse, currentChartInfo, currentChart
// State written: currentRefreshCmd, currentRefreshCmdType
// Calls:         chartAndRawData:exitChartDisplay, chartAndRawData:displayChart,
//                chartAndRawData:displayChartWithPlotNo,
//                resizeAndDimensions:updateCanvasMessage, resizeAndDimensions:handleResize,
//                navigationAndQueue:clearPendingQueue, navigationAndQueue:addToRequestQueue,
//                navigationAndQueue:versionedMenuCmd
// Called by:     connectionSetup:setupEventListeners (once at startup via setupToolbarButtons)

Object.assign(DrawingViewer.prototype, {

  // Sync the reload/freeze toolbar buttons to match the current display mode.
  // Called whenever the body class changes (entering/leaving chart-mode).
  updateRefreshButtonState() {
    const btnReload = document.getElementById('btn-reload');
    const btnFreeze = document.getElementById('btn-freeze');
    const btnFreezePrev = document.getElementById('btn-freeze-prev');
    const btnFreezeNext = document.getElementById('btn-freeze-next');

    const isChartMode = document.body.className === 'chart-mode';
    if (btnReload) btnReload.disabled = isChartMode;
    console.log('[TOOLBAR] Refresh button state updated: disabled=', isChartMode, 'mode=', document.body.className);

    // Sync freeze button visual state with chartDisplay.frozenStartRow
    const isFrozen = isChartMode && window.chartDisplay && window.chartDisplay.frozenStartRow !== null;
    if (btnFreeze) btnFreeze.classList.toggle('freeze-active', isFrozen);
    if (btnFreezePrev) btnFreezePrev.disabled = !isFrozen;
    if (btnFreezeNext) btnFreezeNext.disabled = !isFrozen;

    if (!isChartMode) {
      console.log('[TOOLBAR] Leaving chart-mode, chart polling will be stopped in exitChartDisplay()');
      window.chartDisplay.stopUpdatePolling();
    }
  },

  // Toggle freeze state: freeze the chart at the current display start row, or unfreeze.
  // While frozen, CSV data continues to accumulate but the chart is not redrawn by polling.
  // Left/right arrow buttons navigate the frozen window by half the current maxPoints.
  // Reachable only via the #btn-freeze click handler below, and that button
  // is CSS-hidden (.chart-only) outside chart-mode — so window.chartDisplay
  // and this.currentChartInfo are always already set by the time this runs.
  toggleFreezeChart() {
    const btnFreeze = document.getElementById('btn-freeze');
    const btnFreezePrev = document.getElementById('btn-freeze-prev');
    const btnFreezeNext = document.getElementById('btn-freeze-next');

    const allLines = window.csvCollector.getFieldCounts().includes(this.currentChartInfo.fieldCount)
      ? window.csvCollector.getCSVLines(this.currentChartInfo.fieldCount) : [];
    console.error('[FREEZE_DBG] toggleFreezeChart: fieldCount=', this.currentChartInfo.fieldCount,
      'allLines.length=', allLines.length, 'maxPoints=', this.currentChartInfo.maxPoints,
      'currently frozen=', window.chartDisplay.frozenStartRow !== null);

    if (window.chartDisplay.frozenStartRow === null) {
      // Freeze: lock start row, stop live updates.
      // Does NOT recreate the chart or touch axis configuration.
      window.chartDisplay.freezeChart(allLines, this.currentChartInfo.maxPoints);
      btnFreeze.classList.add('freeze-active');
      btnFreezePrev.disabled = false;
      btnFreezeNext.disabled = false;
    } else {
      // Unfreeze: reposition display to latest data and resume live updates.
      // Does NOT recreate the chart or touch axis configuration.
      window.chartDisplay.unfreezeChart();
      btnFreeze.classList.remove('freeze-active');
      btnFreezePrev.disabled = true;
      btnFreezeNext.disabled = true;
      // Trigger an immediate redraw at the latest data window.
      // updateMultiSubplotChart only replaces the dataset; it never touches axis constraints.
      window.chartDisplay.updateMultiSubplotChart(allLines);
    }
  },

  // Step the frozen display window by half a maxPoints window, in the given
  // direction (-1 = back, 1 = forward). Shared by the freeze-prev/freeze-next
  // toolbar buttons, which are only enabled while frozen (i.e. only reachable
  // after toggleFreezeChart's freeze branch has already run).
  shiftFrozenWindow(direction) {
    const allLines = window.csvCollector.getFieldCounts().includes(this.currentChartInfo.fieldCount)
      ? window.csvCollector.getCSVLines(this.currentChartInfo.fieldCount) : [];
    console.error('[FREEZE_DBG] shiftFrozenWindow: direction=', direction, 'fieldCount=', this.currentChartInfo.fieldCount,
      'allLines.length=', allLines.length, 'maxPoints=', this.currentChartInfo.maxPoints,
      'frozenStartRow(before)=', window.chartDisplay.frozenStartRow);
    window.chartDisplay.shiftFrozenRow(allLines, this.currentChartInfo.maxPoints, direction);
    window.chartDisplay.lastDataLineCount = 0;
    window.chartDisplay.updateMultiSubplotChart(allLines);
  },

  // Wire up click handlers for all toolbar buttons (back, reload, freeze, menu).
  setupToolbarButtons() {
    // Left arrow button - pop previous command from stack or request main menu if stack is empty
    const btnLeftArrow = document.getElementById('btn-left-arrow');
    if (btnLeftArrow) {
      // Disable button if in chart-only mode
      if (this.chartOnlyMode) {
        btnLeftArrow.disabled = true;
        console.log('[CHART_MODE] Left arrow button disabled in chart-only mode');
      }

      let backBtnDown = false;
      btnLeftArrow.addEventListener('pointerdown', () => { backBtnDown = true; });
      btnLeftArrow.addEventListener('pointercancel', () => { backBtnDown = false; });
      btnLeftArrow.addEventListener('pointerup', () => {
        if (!backBtnDown) return;
        backBtnDown = false;
        console.log('[TOOLBAR] Left arrow pointerup className=', document.body.className);

        // If in chart-only mode, prevent going back (button disabled)
        if (this.chartOnlyMode) {
          console.log('[CHART_MODE] Back button disabled in chart-only mode');
          return;
        }

        // Capture current mode before hide() changes the class
        const wasInMenuMode = document.body.className === 'menu-mode';
        const wasInInputMode = document.body.className === 'input-mode'
          || document.body.className === 'numeric-input-mode'
          || document.body.className === 'selection-mode'
          || document.body.className === 'chart-mode'
          || document.body.className === 'streaming-mode';

        // If in chart mode, stop polling immediately (regardless of back target)
        if (document.body.className === 'chart-mode') {
          console.log('[TOOLBAR] In chart mode - stopping chart polling immediately at', Date.now());
          this.exitChartDisplay();
          console.log('[TOOLBAR] exitChartDisplay completed at', Date.now(), 'className now=', document.body.className);
          // Show "Requesting Menu..." on the canvas while waiting for the back response.
          // exitChartDisplay() already called handleResize() so the canvas is at full message-mode dimensions.
          this.updateCanvasMessage('Requesting Menu ...');
        } else if (wasInMenuMode && window.pfodMenuDisplay) {
          // Exit menu-mode so the canvas is restored before the back response arrives
          console.log('[TOOLBAR] In menu-mode - hiding menu display before back navigation');
          window.pfodMenuDisplay.hide();
          this.redraw.clearMenuCanvases();
          // Resize canvas to full message-mode dimensions before drawing the message.
          this.handleResize();
          // Show "Requesting Menu..." on the canvas while waiting for the back response
          this.updateCanvasMessage('Requesting Menu ...');
        } else if (document.body.className === 'streaming-mode') {
          console.log('[TOOLBAR] In streaming-mode - exiting streaming display before back navigation');
          this.exitStreamingData();
          this.handleResize();
          this.updateCanvasMessage('Requesting Menu ...');
        } else if (document.body.className === 'input-mode' && window.pfodInputDisplay) {
          console.log('[TOOLBAR] In input-mode - hiding input display before back navigation');
          window.pfodInputDisplay.hide();
          this.handleResize();
          this.updateCanvasMessage('Requesting Menu ...');
        } else if (document.body.className === 'numeric-input-mode' && window.pfodNumericInputDisplay) {
          console.log('[TOOLBAR] In numeric-input-mode - hiding numeric input before back navigation');
          window.pfodNumericInputDisplay.hide();
          this.handleResize();
          this.updateCanvasMessage('Requesting Menu ...');
        } else {
          console.log('[TOOLBAR] Not in chart or menu mode, className=', document.body.className);
        }

        let cmdToSend;
        if (wasInInputMode) {
          // Input screen does NOT push to menuNavStack — resend top without popping
          if (this.menuNavStack.length > 0) {
            cmdToSend = this.versionedMenuCmd(this.menuNavStack[this.menuNavStack.length - 1]);
            console.log('[TOOLBAR] Input back - resending menu cmd:', cmdToSend);
          } else if (this.commandStack.length > 0) {
            cmdToSend = this.commandStack[this.commandStack.length - 1];
            console.log('[TOOLBAR] Input back - resending drawing cmd:', cmdToSend);
          } else {
            cmdToSend = '{.}';
            console.log('[TOOLBAR] Input back - no stacks, sending main menu');
          }
          // Stop any pending auto-refresh fire — the back response will
          // re-evaluate scheduleNextUpdate.  itemRefreshTimes entries are
          // preserved (they're per-drawing/menu cached state).
          if (this.updateTimer) { clearTimeout(this.updateTimer); this.updateTimer = null; }
          this.clearPendingQueue();
          this.addToRequestQueue(cmdToSend, null, null, 'back');
          return;
        } else if ((wasInMenuMode || document.body.className === 'message-mode') && this.menuNavStack.length > 0) {
          // Menu back: pop top if more than one entry, then use the new top.
          // If only one entry, keep it and use it for both refresh and back.
          // message-mode is the transient "Requesting Menu" overlay state left
          // by the menu hide() during nav (e.g. after the uncached-{;} error
          // fallback) — still source from menuNavStack here, NOT commandStack,
          // since menuNavStack is the source of truth for menu-nav history.
          if (this.menuNavStack.length > 1) {
            this.menuNavStack.pop();
            console.log('[TOOLBAR] Menu back - popped stack, now:', JSON.stringify(this.menuNavStack));
          } else {
            console.log('[TOOLBAR] Menu back - single entry, not popping:', JSON.stringify(this.menuNavStack));
          }
          cmdToSend = this.menuNavStack[this.menuNavStack.length - 1];
          console.log('[TOOLBAR] Menu back - sending:', cmdToSend);
        } else {
          // Canvas/drawing back: use existing command stack
          if (this.commandStack.length > 0) {
            cmdToSend = this.commandStack.pop();
            console.log('[TOOLBAR] Popped command from stack:', cmdToSend);
          } else {
            cmdToSend = '{.}';
            console.log('[TOOLBAR] Command stack is empty - using main menu command');
          }
          this.currentRefreshCmd = cmdToSend;
          this.currentRefreshCmdType = 'back';
        }

        // Stop any pending auto-refresh fire — the back response will
        // re-evaluate scheduleNextUpdate.  itemRefreshTimes entries are
        // preserved (they're per-drawing/menu cached state).
        if (this.updateTimer) { clearTimeout(this.updateTimer); this.updateTimer = null; }
        this.clearPendingQueue();

        // Show "Requesting Main Menu ..." when the back target is the main
        // menu (cmd is bare {.}).  Replaces the prior "Requesting Menu ..."
        // overlay set when the menu was hidden.  Done before version-stamping
        // so we test the bare cmd, not the {Vx:.} form.
        if (cmdToSend === '{.}') {
          this.updateCanvasMessage('Requesting Main Menu ...');
        }

        // Use versioned cmd for menu back if we have a cached version (like drawing refresh)
        if (wasInMenuMode) {
          cmdToSend = this.versionedMenuCmd(cmdToSend);
        }
        this.addToRequestQueue(cmdToSend, null, null, 'back');
        console.log('[TOOLBAR] Back navigation request queued');
      });
    }

    // Middle button (reload) - resend last command
    const btnReload = document.getElementById('btn-reload');
    if (btnReload) {
      btnReload.addEventListener('click', () => {
        console.log('[TOOLBAR] Reload button clicked');
        // Stop any pending auto-refresh fire — the reload response will
        // re-evaluate scheduleNextUpdate.  itemRefreshTimes entries are
        // preserved (they're per-drawing/menu cached state).
        if (this.updateTimer) { clearTimeout(this.updateTimer); this.updateTimer = null; }
        this.clearPendingQueue();

        let cmdToSend;
        let reqType;
        if (this.menuNavStack.length > 0) {
          // We have menu-nav history — reload the current menu (top of stack).
          // Holds whether the menu is currently visible or we're in transient
          // message-mode after a back-nav error or similar.  Reply will be a
          // menu shape ({,...} or {;...}), so tag as menuRefresh for the
          // response shape validator.
          cmdToSend = this.versionedMenuCmd(this.menuNavStack[this.menuNavStack.length - 1]);
          reqType = 'menuRefresh';
          console.log('[TOOLBAR] Menu refresh - resending menu cmd:', cmdToSend, 'stack:', JSON.stringify(this.menuNavStack));
        } else if (!this.hasReceivedFirstResponse) {
          // No nav history yet (initial connection never returned a menu).
          // Re-issue the main-menu request — reply will be a {,} so tag as
          // mainMenu, NOT refresh, so the shape validator accepts it.
          cmdToSend = '{.}';
          reqType = 'mainMenu';
          console.log('[TOOLBAR] Initial reload - re-requesting main menu:', cmdToSend);
        } else {
          // Drawing / chart / other-display context — re-send the last cmd.
          // currentRefreshCmd MAY be a menu cmd here (menuCmdSet records all
          // cmds that returned a menu shape), in which case the reply will
          // be a menu — tag accordingly so the response shape validator
          // accepts it.  Otherwise it's a drawing refresh.
          cmdToSend = this.currentRefreshCmd !== null ? this.currentRefreshCmd : '{.}';
          const bareCmd = pfodStripMenuCmdVersion(cmdToSend);
          if (this.menuCmdSet && this.menuCmdSet.has(bareCmd)) {
            reqType = 'menuRefresh';
            console.log('[TOOLBAR] Reload (menu cmd) - sending:', cmdToSend);
          } else {
            reqType = 'refresh';
            console.log('[TOOLBAR] Sending refresh command:', cmdToSend);
          }
        }

        // Show the more specific "Requesting Main Menu ..." message whenever
        // the cmd is the bare main-menu request (with or without prior state).
        if (cmdToSend === '{.}') {
          this.updateCanvasMessage('Requesting Main Menu ...');
        }

        this.addToRequestQueue(cmdToSend, null, null, reqType);
      });
    }

    // Freeze button (chart-mode only) - toggle freeze/unfreeze
    const btnFreeze = document.getElementById('btn-freeze');
    if (btnFreeze) {
      btnFreeze.addEventListener('click', () => {
        console.log('[TOOLBAR] Freeze button clicked');
        this.toggleFreezeChart();
      });
    }

    // Freeze prev arrow - step back half a window
    const btnFreezePrev = document.getElementById('btn-freeze-prev');
    if (btnFreezePrev) {
      btnFreezePrev.addEventListener('click', () => this.shiftFrozenWindow(-1));
    }

    // Freeze next arrow - step forward half a window
    const btnFreezeNext = document.getElementById('btn-freeze-next');
    if (btnFreezeNext) {
      btnFreezeNext.addEventListener('click', () => this.shiftFrozenWindow(1));
    }

    // Right button (three dots) - show toolbar menu
    const btnMenu = document.getElementById('btn-menu');
    if (btnMenu) {
      btnMenu.addEventListener('click', (event) => {
        console.log('[TOOLBAR] Menu button clicked');
        this.showToolbarMenu(event);
      });
    }

    console.log('[TOOLBAR] Toolbar button listeners setup complete');
  },

  // Build and display the toolbar drop-down menu above the three-dots button.
  // Menu contents vary by current display mode (chart vs drawing).
  showToolbarMenu(event) {
    const menuTime = Date.now();
    console.log('[TOOLBAR_MENU] showToolbarMenu called at', menuTime, 'className=', document.body.className);

    const btnMenu = document.getElementById('btn-menu');
    if (!btnMenu) {
      console.error('[TOOLBAR_MENU] Menu button not found');
      return;
    }

    // Remove any existing menu
    const existing = document.getElementById('toolbar-menu');
    if (existing) {
      existing.remove();
    }

    // Create menu
    const menu = document.createElement('div');
    menu.id = 'toolbar-menu';
    menu.style.cssText = `
      position: fixed;
      background-color: white;
      border: 2px solid #333;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 999999;
      min-width: 240px;
      padding: 4px 0;
      visibility: hidden;
    `;

    // Add menu item for raw data
    const item = document.createElement('div');
    item.style.cssText = `
      padding: 15px 24px;
      cursor: pointer;
      user-select: none;
      font-family: Arial, sans-serif;
      font-size: 21px;
      color: #000;
      white-space: nowrap;
    `;
    item.textContent = 'Raw Message Viewer';
    item.addEventListener('click', () => {
      console.log('[TOOLBAR_MENU] Raw Message Viewer clicked');
      if (window.rawMessageViewer) {
        window.rawMessageViewer.show();
        console.log('[TOOLBAR_MENU] Opened raw data viewer');
      }
      menu.remove();
    });
    item.addEventListener('mouseover', () => {
      item.style.backgroundColor = '#e8e8e8';
    });
    item.addEventListener('mouseout', () => {
      item.style.backgroundColor = 'transparent';
    });

    menu.appendChild(item);

    // Second menu item depends on current display mode:
    //   chart-mode -> "Open Chart Configuration" (opens the chart config side panel)
    //   any other mode (menu-mode, message-mode, rawdata-mode, etc.) -> "Chart" (switches to chart display)
    const secondItem = document.createElement('div');
    secondItem.style.cssText = `
      padding: 15px 24px;
      cursor: pointer;
      user-select: none;
      font-family: Arial, sans-serif;
      font-size: 21px;
      color: #000;
      white-space: nowrap;
    `;
    secondItem.addEventListener('mouseover', () => {
      secondItem.style.backgroundColor = '#e8e8e8';
    });
    secondItem.addEventListener('mouseout', () => {
      secondItem.style.backgroundColor = 'transparent';
    });

    if (document.body.className === 'chart-mode') {
      // Chart is currently showing - offer to open chart configuration panel
      secondItem.textContent = 'Open Chart Configuration';
      secondItem.addEventListener('click', () => {
        console.log('[TOOLBAR_MENU] Open Chart Configuration clicked');
        if (window.chartConfigViewer) {
          window.chartConfigViewer.show();
        }
        menu.remove();
      });
    } else {
      // Drawing is currently showing - offer to switch to chart display
      secondItem.textContent = 'Chart';
      secondItem.addEventListener('click', () => {
        const clickTime = Date.now();
        console.log('[TOOLBAR_MENU] Chart clicked at', clickTime);
        console.log('[TOOLBAR_MENU] className=', document.body.className);
        console.log('[TOOLBAR_MENU] drawingViewer=', drawingViewer ? 'exists' : 'undefined');

        // Ensure chartDisplay is initialized (in case Chart clicked before initialization completes)
        console.log('[TOOLBAR_MENU] Checking chartDisplay at', Date.now(), 'chartDisplay:', window.chartDisplay ? 'exists' : 'undefined');
        if (!window.chartDisplay) {
          console.log('[TOOLBAR_MENU] chartDisplay not initialized, creating now...');
          try {
            window.chartDisplay = new ChartDisplay();
            console.log('[TOOLBAR_MENU] chartDisplay created successfully');
          } catch (e) {
            console.error('[TOOLBAR_MENU] Failed to create chartDisplay:', e);
            menu.remove();
            return;
          }
        }

        // Cancel any armed auto-refresh timer — chart-mode has nothing to refresh,
        // and the mode-gate in scheduleNextUpdate keeps it disarmed until the user
        // returns to canvas/menu mode.
        if (this.updateTimer) { clearTimeout(this.updateTimer); this.updateTimer = null; }

        // Clear queued commands
        console.log('[TOOLBAR_MENU] Starting to clear queued commands at', Date.now(), 'elapsed:', Date.now() - clickTime, 'ms');
        drawingViewer.clearPendingQueue();
        console.log('[TOOLBAR_MENU] Finished clearing queued commands at', Date.now(), 'elapsed:', Date.now() - clickTime, 'ms');

        // Open chart display
        console.log('[TOOLBAR_MENU] Starting displayChart at', Date.now(), 'elapsed:', Date.now() - clickTime, 'ms');
        document.body.className = 'chart-mode';
        console.log('[CHART] Switched to chart-mode CSS');
        this.displayChart("Chart", "", 500);
        console.log('[TOOLBAR_MENU] Finished displayChart at', Date.now(), 'elapsed:', Date.now() - clickTime, 'ms');
        console.log('[TOOLBAR_MENU] After displayChart, className=', document.body.className);

        menu.remove();
        console.log('[TOOLBAR_MENU] Menu removed at', Date.now(), 'total elapsed:', Date.now() - clickTime, 'ms');
      });
    }

    menu.appendChild(secondItem);

    // Blank spacer item between the two mode-dependent items and Exit
    const spacerItem = document.createElement('div');
    spacerItem.style.cssText = `
      padding: 15px 24px;
      user-select: none;
    `;
    menu.appendChild(spacerItem);

    // Exit item — disconnects and returns to connection setup prompt
    const exitItem = document.createElement('div');
    exitItem.style.cssText = `
      padding: 15px 24px;
      cursor: pointer;
      user-select: none;
      font-family: Arial, sans-serif;
      font-size: 21px;
      color: #000;
      white-space: nowrap;
    `;
    exitItem.textContent = 'Exit';
    exitItem.addEventListener('mouseover', () => { exitItem.style.backgroundColor = '#e8e8e8'; });
    exitItem.addEventListener('mouseout',  () => { exitItem.style.backgroundColor = 'transparent'; });
    exitItem.addEventListener('click', () => {
      menu.remove();
      if (!drawingViewer) return;

      // Immediate visual ack: the queue still has to drain (any in-flight cmd
      // finishes, then {!} fires as a single attempt thanks to the no-retry
      // guard in each adapter's send(), then _exitToConnectionScreen reloads
      // the page).  The overlay tells the user their click was accepted while
      // that happens.  Style + spinner mirror ConnectionManager._showConnectingDialog.
      if (!document.getElementById('toolbar-closing-overlay')) {
        if (!document.getElementById('toolbar-closing-spinner-style')) {
          const style = document.createElement('style');
          style.id = 'toolbar-closing-spinner-style';
          style.textContent =
            '@keyframes toolbarClosingSpin { to { transform: rotate(360deg); } }';
          document.head.appendChild(style);
        }
        const overlay = document.createElement('div');
        overlay.id = 'toolbar-closing-overlay';
        overlay.style.cssText =
          'position:fixed; inset:0; background:rgba(0,0,0,0.4);' +
          ' z-index:10001; display:flex; align-items:center;' +
          ' justify-content:center; font-family:Arial,sans-serif;';
        const panel = document.createElement('div');
        panel.style.cssText =
          'background:white; border-radius:8px;' +
          ' box-shadow:0 8px 32px rgba(0,0,0,0.25);' +
          ' padding:24px 28px; min-width:240px; text-align:center;';
        const spinner = document.createElement('div');
        spinner.style.cssText =
          'width:36px; height:36px; margin:0 auto 14px;' +
          ' border:4px solid #e0e0e0; border-top-color:#4078ff;' +
          ' border-radius:50%;' +
          ' animation: toolbarClosingSpin 0.9s linear infinite;';
        panel.appendChild(spinner);
        const label = document.createElement('div');
        label.style.cssText = 'font-size:18px; font-weight:600; color:#222;';
        label.textContent = 'Closing Down …';
        panel.appendChild(label);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
      }

      if (drawingViewer.stopKeepAlivePolling) {
        drawingViewer.stopKeepAlivePolling();
      }
      // Queue {!} via addToRequestQueue — it clears pending items, sets exitPending,
      // and blocks all further enqueuing. processRequestQueue waits for any in-flight
      // cmd to complete first, then sends {!} (single attempt — see send() guard in
      // connectionManager.js) and transitions to the connection screen via
      // _exitToConnectionScreen, which window.location.replaces the page and so
      // destroys the overlay along with the rest of the in-memory state.
      drawingViewer.addToRequestQueue('{!}', null, null, 'exitAbort');
    });
    menu.appendChild(exitItem);

    document.body.appendChild(menu);

    // Get button position AFTER menu is in DOM
    const rect = btnMenu.getBoundingClientRect();
    console.log('[TOOLBAR_MENU] Button rect:', { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width });

    // Get menu dimensions
    const menuHeight = menu.offsetHeight;
    const menuWidth = menu.offsetWidth;
    console.log('[TOOLBAR_MENU] Menu dimensions:', { width: menuWidth, height: menuHeight });

    // Position menu ABOVE button
    // - Right edge of menu aligned with right edge of button
    // - Bottom of menu just above button top
    const menuLeft = rect.right - menuWidth;
    const menuTop = rect.top - menuHeight - 2;

    menu.style.left = Math.max(0, menuLeft) + 'px';  // Don't go off-screen left
    menu.style.top = Math.max(0, menuTop) + 'px';    // Don't go off-screen top
    menu.style.visibility = 'visible';

    console.log('[TOOLBAR_MENU] Menu positioned at left=' + Math.max(0, menuLeft) + 'px, top=' + Math.max(0, menuTop) + 'px');
    console.log('[TOOLBAR_MENU] Menu z-index: 999999');

    // Close menu on outside click
    const closeMenu = (e) => {
      if (!e.target.closest('#toolbar-menu') && e.target !== btnMenu) {
        console.log('[TOOLBAR_MENU] Closing menu (outside click)');
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };

    // Use slight delay to ensure event listeners are ready
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
      console.log('[TOOLBAR_MENU] Close listener attached');
    }, 50);
  },

  // Create the right-click context menu element and wire up its handlers.
  setupContextMenu() {
    // Create context menu container
    const contextMenu = document.createElement('div');
    contextMenu.id = 'pfod-context-menu';
    contextMenu.style.cssText = `
      display: none;
      position: fixed;
      background-color: #2d2d30;
      border: 1px solid #555;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      z-index: 10000;
      min-width: 200px;
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 12px;
    `;

    contextMenu.innerHTML = `
      <div class="pfod-context-menu-item" data-action="show-messages">
        <span style="color: #ce9178; margin-right: 8px;">📊</span>
        Show Raw Messages
        <span style="color: #858585; margin-left: auto; margin-left: 20px; font-size: 10px;">Ctrl+Shift+M</span>
      </div>
    `;

    // Add styles for menu items
    const style = document.createElement('style');
    style.textContent = `
      .pfod-context-menu-item {
        padding: 8px 12px;
        color: #d4d4d4;
        cursor: pointer;
        display: flex;
        align-items: center;
        user-select: none;
        transition: background-color 0.15s;
      }

      .pfod-context-menu-item:hover {
        background-color: #3e3e42;
      }

      .pfod-context-menu-item:active {
        background-color: #454545;
      }

      .pfod-context-menu-divider {
        height: 1px;
        background-color: #3e3e42;
        margin: 4px 0;
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(contextMenu);

    // Right-click context menu disabled - now only accessible via toolbar menu
    // canvas.addEventListener('contextmenu', (event) => {
    //   event.preventDefault();
    //   this.showContextMenu(event.clientX, event.clientY, contextMenu);
    // });

    // Close menu on document click
    document.addEventListener('click', (event) => {
      if (event.target.closest('#pfod-context-menu')) {
        return; // Don't close if clicking menu
      }
      contextMenu.style.display = 'none';
    });

    // Handle menu item clicks
    contextMenu.addEventListener('click', (event) => {
      const item = event.target.closest('.pfod-context-menu-item');
      if (!item) return;

      const action = item.dataset.action;
      contextMenu.style.display = 'none';

      switch (action) {
        case 'show-messages':
          if (window.rawMessageViewer) {
            window.rawMessageViewer.show();
            console.log('[CONTEXT_MENU] Opened message viewer');
          }
          break;
        case 'clear-messages':
          if (window.messageCollector) {
            window.messageCollector.clear();
            console.log('[CONTEXT_MENU] Cleared all messages');
          }
          break;
        case 'export-json':
          if (window.rawMessageViewer) {
            window.rawMessageViewer.exportJSON();
            console.log('[CONTEXT_MENU] Exported messages as JSON');
          }
          break;
        case 'export-csv':
          if (window.rawMessageViewer) {
            window.rawMessageViewer.exportCSV();
            console.log('[CONTEXT_MENU] Exported messages as CSV');
          }
          break;
      }
    });

    console.log('[CONTEXT_MENU] Context menu setup complete');
  },

  // Position and show the context menu div at screen coordinates (x, y).
  // Adjusts position to prevent the menu from extending off-screen.
  showContextMenu(x, y, menu) {
    menu.style.display = 'block';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    // Adjust if menu goes off-screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = (window.innerHeight - rect.height - 10) + 'px';
    }

    console.log('[CONTEXT_MENU] Showing at', x, y);
  }

});
