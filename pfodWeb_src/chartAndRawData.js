/*
   chartAndRawData.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Chart display, raw-data text display, and their enter/exit helpers for the DrawingViewer class.
// Assigned to DrawingViewer.prototype after the class is defined in pfodWeb.js.
//
// State read:    chartCommand, canvas, currentChartInfo, currentChart,
//                rawDataScrollLocked, rawDataPollingInterval, connectionManager,
//                sentRequest, csvLoaded
// State written: rawDataScrollLocked, rawDataPollingInterval, currentChart, currentChartInfo,
//                sentRequest
// Calls:         navigationAndQueue:scheduleDataRefresh, navigationAndQueue:addToRequestQueue,
//                toolbarAndMenu:updateRefreshButtonState, resizeAndDimensions:handleResize,
//                requestQueue:processRequestQueue [via setTimeout after exitChartDisplay]
// Called by:     navigationAndQueue:queueInitialRequest, toolbarAndMenu:setupToolbarButtons,
//                responseHandlers:handleNonDwgResponse

// currentChartInfo has no storage of its own on DrawingViewer — see the
// window.currentChartInfo holder and matching ChartDisplay.prototype accessor
// defined at the end of chartDisplay.js. This alias makes
// `this.currentChartInfo` / `drawingViewer.currentChartInfo` reads and writes
// transparently forward to that single holder, so the two classes'
// currentChartInfo can no longer drift apart the way they used to (one
// updating while the other stayed stale, e.g. on the touchZone->chart-response
// path).
Object.defineProperty(DrawingViewer.prototype, 'currentChartInfo', {
  get() { return window.currentChartInfo; },
  set(value) { window.currentChartInfo = value; }
});

// Same treatment for the rendered jsfc.Chart object — see the matching
// window.currentChart holder and ChartDisplay.prototype accessor at the end
// of chartDisplay.js.
Object.defineProperty(DrawingViewer.prototype, 'currentChart', {
  get() { return window.currentChart; },
  set(value) { window.currentChart = value; }
});

Object.assign(DrawingViewer.prototype, {

  // Open chart display directly without requesting main menu.
  // Used in chart-only mode (?chartOnly URL param).
  // Applies a ?chart= URL command if present, otherwise opens an empty chart.
  openChartDirectly() {
    console.log('[CHART_MODE] Opening chart display directly');
    // If a chart command was passed via URL ?chart= param, apply it via messageViewer
    if (this.chartCommand && window.chartConfigViewer) {
      try {
        console.log('[CHART_MODE] Applying chart command from URL:', this.chartCommand);
        window.chartConfigViewer.applyChartCommand(this.chartCommand);
        this.scheduleDataRefresh();
        return;
      } catch (e) {
        console.error('[CHART_MODE] Failed to apply chart command from URL, using default:', e);
      }
    }
    // Default: open empty chart
    this.displayChart("Chart", "", 500);
    // Start HTTP data-refresh polling to collect streaming CSV data
    this.scheduleDataRefresh();
  },

  // Switch to rawdata-mode CSS, create (or reuse) the raw-data display panel,
  // append rawData text, auto-scroll, and start polling for new data.
  //
  // Parameters:
  //   chartTitle - title shown in the panel header
  //   rawData    - text string to append to the display
  displayRawDataText(chartTitle, rawData) {
    // console.log('[RAW_DATA] displayRawDataText called - title:', chartTitle, 'data length:', rawData.length);

    // Switch to raw data display CSS mode
    document.body.className = 'rawdata-mode';
    // console.log('[RAW_DATA] Switched to rawdata-mode CSS');

    // Update refresh button state (disabled in chart-mode)
    this.updateRefreshButtonState();

    // Get canvas wrapper (contains just the canvas)
    const canvasWrapper = document.getElementById('canvas-wrapper');
    if (!canvasWrapper) {
      console.error('[RAW_DATA] Canvas wrapper not found');
      return;
    }

    // Create or get raw data display element
    let rawDataDisplay = document.getElementById('raw-data-text-display');
    if (!rawDataDisplay) {
      // console.log('[RAW_DATA] Creating new raw data display');
      rawDataDisplay = document.createElement('div');
      rawDataDisplay.id = 'raw-data-text-display';
      rawDataDisplay.style.cssText = `
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        background-color: white;
        overflow: hidden;
        box-sizing: border-box;
      `;

      // Create title bar with lock scroll button
      const titleBar = document.createElement('div');
      titleBar.id = 'raw-data-title-bar';
      titleBar.style.cssText = `
        background-color: #333;
        color: white;
        padding: 8px 10px;
        font-weight: bold;
        flex-shrink: 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        height: 32px;
        box-sizing: border-box;
      `;

      const titleText = document.createElement('span');
      titleText.textContent = chartTitle || 'Raw Data';

      const lockButton = document.createElement('button');
      lockButton.id = 'raw-data-lock-scroll-btn';
      lockButton.textContent = '🔓 Scroll';
      lockButton.style.cssText = `
        background-color: #555;
        color: white;
        border: 1px solid #777;
        padding: 4px 8px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 12px;
      `;

      let scrollLocked = false;
      lockButton.addEventListener('click', () => {
        scrollLocked = !scrollLocked;
        lockButton.textContent = scrollLocked ? '🔒 Locked' : '🔓 Scroll';
        lockButton.style.backgroundColor = scrollLocked ? '#a00' : '#555';
        this.rawDataScrollLocked = scrollLocked;
      });

      const saveButton = document.createElement('button');
      saveButton.id = 'raw-data-save-btn';
      saveButton.textContent = '💾 Save';
      saveButton.style.cssText = `
        background-color: #0066cc;
        color: white;
        border: 1px solid #0044aa;
        padding: 4px 8px;
        margin-left: 8px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 12px;
      `;

      saveButton.addEventListener('click', () => {
        // Get all raw data
        const textContent = document.getElementById('raw-data-text-content');
        if (!textContent) {
          console.error('[RAW_DATA] Text content element not found for save');
          return;
        }

        const rawDataText = textContent.textContent;

        // Create blob and download
        const blob = new Blob([rawDataText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `rawdata_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        console.log('[RAW_DATA] Saved raw data to file:', link.download);
      });

      titleBar.appendChild(titleText);
      titleBar.appendChild(lockButton);
      titleBar.appendChild(saveButton);

      // Create scrolling text area - THIS is where scrollbar appears
      const textArea = document.createElement('div');
      textArea.id = 'raw-data-text-content';
      textArea.style.cssText = `
        flex: 1;
        overflow-y: auto;
        overflow-x: auto;
        padding: 10px;
        font-family: monospace;
        white-space: pre;
        background-color: white;
        color: #333;
        box-sizing: border-box;
        min-height: 0;
      `;

      rawDataDisplay.appendChild(titleBar);
      rawDataDisplay.appendChild(textArea);

      // console.log('[RAW_DATA] Raw data display structure created - layout: titleBar + scrollable textArea');

      // Initialize scroll lock state
      this.rawDataScrollLocked = false;
    } else {
      // Display already exists - update the title
      const titleBar = rawDataDisplay.querySelector('#raw-data-title-bar');
      if (titleBar) {
        const titleText = titleBar.querySelector('span');
        if (titleText) {
          titleText.textContent = chartTitle || 'Raw Data';
        }
      }
    }

    // Insert raw data display - do not use innerHTML='' which would destroy #menu-container
    if (rawDataDisplay.parentNode !== canvasWrapper) {
      canvasWrapper.insertBefore(rawDataDisplay, document.getElementById('menu-container'));
    }

    // Append new data to text content (not replace)
    const textContent = document.getElementById('raw-data-text-content');
    if (textContent) {
      // console.log('[RAW_DATA] Found text content element, appending', rawData.length, 'chars');
      // Append new data directly without adding separator newline
      textContent.textContent += rawData;
      // console.log('[RAW_DATA] Data appended, new length:', textContent.textContent.length);

      // Mark that we've displayed data up to this point
      if (window.rawDataCollector) {
        window.rawDataCollector.markDisplayedUpTo();
      }

      // Auto-scroll to bottom unless scroll is locked
      if (!this.rawDataScrollLocked) {
        textContent.scrollTop = textContent.scrollHeight;
        // console.log('[RAW_DATA] Auto-scrolled to bottom');
      } else {
        // console.log('[RAW_DATA] Scroll is locked, not auto-scrolling');
      }

      // Start polling for new data to append continuously
      this.startRawDataPolling();
    } else {
      console.error('[RAW_DATA] Text content element not found!');
    }
  },

  /**
   * Exit raw data display and restore canvas
   */
  exitRawDataDisplay() {
    // console.log('[RAW_DATA] Exiting raw data display');

    // Switch back to message display CSS mode
    document.body.className = 'message-mode';

    // Update refresh button state
    this.updateRefreshButtonState();

    const canvasWrapper = document.getElementById('canvas-wrapper');
    const rawDataDisplay = document.getElementById('raw-data-text-display');
    if (rawDataDisplay) {
      // Remove only the raw data display element - do not use innerHTML='' which would destroy #menu-container
      canvasWrapper.removeChild(rawDataDisplay);
    }
    // Do NOT redraw here - drawing data not ready yet
    // The drawing will be redrawn when the queued drawing request response arrives

    // Stop polling for new data
    this.stopRawDataPolling();

    // Don't clear raw data collector - it must continue collecting independently
  },

  /**
   * Start polling for new raw data and appending to display
   */
  startRawDataPolling() {
    // Stop any existing polling
    this.stopRawDataPolling();

    // console.log('[RAW_DATA] Starting data polling');
    this.rawDataPollingInterval = setInterval(() => {
      // Check if raw data display still exists
      const textContent = document.getElementById('raw-data-text-content');
      if (!textContent) {
        // console.log('[RAW_DATA] Raw data display no longer exists, stopping polling');
        this.stopRawDataPolling();
        return;
      }

      // Get new data from collector
      if (window.rawDataCollector) {
        const newData = window.rawDataCollector.getNewData();
        if (newData.length > 0) {
          // console.log('[RAW_DATA] Polling found', newData.length, 'new chars, appending to display');
          textContent.textContent += newData;

          // Mark that we've displayed this data
          window.rawDataCollector.markDisplayedUpTo();

          // Auto-scroll to bottom unless scroll is locked
          if (!this.rawDataScrollLocked) {
            textContent.scrollTop = textContent.scrollHeight;
          }
        }
      }
    }, 100); // Poll every 100ms for new data
  },

  /**
   * Stop polling for new raw data
   */
  stopRawDataPolling() {
    if (this.rawDataPollingInterval) {
      clearInterval(this.rawDataPollingInterval);
      this.rawDataPollingInterval = null;
      // console.log('[RAW_DATA] Stopped data polling');
    }
  },

  /**
   * Open the Section 9 streaming raw data screen ({=[title]} response).
   * Shows all data accumulated in rawDataCollector so far, then polls for more.
   * Uses streaming-mode CSS and its own DOM element, independent of rawdata-mode.
   *
   * @param {string} title     - Optional title from the {= response
   * @param {string} initialData - Raw data collected up to this point
   */
  displayStreamingData(title, initialData) {
    document.body.className = 'streaming-mode';
    this.updateRefreshButtonState();

    const canvasWrapper = document.getElementById('canvas-wrapper');
    if (!canvasWrapper) return;

    // Extract only <bg …> tags for background colour; leave all other format codes
    // (colour, size, bold…) in the text so pfodSetFormattedText can render them inline.
    // Using parsePfodFormatCodes on the whole string strips <+N> from the leading codes
    // but leaves the matching </+N> closing tag orphaned, which then renders as literal text.
    const rawTitle = title || '';
    let promptBgColor = '#000000';
    const promptText = rawTitle.replace(/<bg ([^>]*)>/g, (match) => {
      const hex = window.parsePfodFormatCodes ? window.parsePfodFormatCodes(match).bgColor : null;
      if (hex) promptBgColor = hex;
      return '';
    });

    let panel = document.getElementById('streaming-data-display');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'streaming-data-display';
      panel.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;background-color:white;overflow:hidden;box-sizing:border-box;';

      // Controls bar at top (Scroll/Save buttons)
      const controlsBar = document.createElement('div');
      controlsBar.id = 'streaming-data-controls';
      controlsBar.style.cssText = 'background-color:#333;padding:4px 8px;flex-shrink:0;display:flex;justify-content:flex-end;align-items:center;height:30px;box-sizing:border-box;';

      const lockButton = document.createElement('button');
      lockButton.id = 'streaming-lock-btn';
      lockButton.textContent = 'Scrolling';
      lockButton.style.cssText = 'background-color:#007700;color:white;border:1px solid #005500;padding:3px 8px;border-radius:3px;cursor:pointer;font-size:12px;';
      let scrollLocked = false;
      lockButton.addEventListener('click', () => {
        scrollLocked = !scrollLocked;
        lockButton.textContent = scrollLocked ? 'Locked' : 'Scrolling';
        lockButton.style.backgroundColor = scrollLocked ? '#a00' : '#007700';
        this.streamingScrollLocked = scrollLocked;
      });

      const saveButton = document.createElement('button');
      saveButton.textContent = 'Save';
      saveButton.style.cssText = 'background-color:#0066cc;color:white;border:1px solid #0044aa;padding:3px 8px;margin-left:6px;border-radius:3px;cursor:pointer;font-size:12px;';
      saveButton.addEventListener('click', () => {
        const content = document.getElementById('streaming-data-content');
        if (!content) return;
        const blob = new Blob([content.textContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'streaming_' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      });

      controlsBar.appendChild(lockButton);
      controlsBar.appendChild(saveButton);

      // Layout/sizing for #streaming-data-content lives in pfodCommon.css
      const content = document.createElement('div');
      content.id = 'streaming-data-content';

      // Prompt bar at bottom — sizing in pfodCommon.css (matches #menu-prompt)
      const promptEl = document.createElement('div');
      promptEl.id = 'streaming-data-prompt';

      panel.appendChild(controlsBar);
      panel.appendChild(content);
      panel.appendChild(promptEl);
      this.streamingScrollLocked = false;
    }

    // Insert panel into DOM before formatting so getElementById works on first open
    if (panel.parentNode !== canvasWrapper) {
      canvasWrapper.insertBefore(panel, document.getElementById('menu-container'));
    }

    // Apply/update prompt and content formatting every time (title may change on re-open)
    const contrastHex = xtermColorToHex(getBlackWhite(promptBgColor));
    const promptEl = document.getElementById('streaming-data-prompt');
    if (promptEl) {
      promptEl.innerHTML = '';
      promptEl.removeAttribute('style');
      promptEl.style.backgroundColor = promptBgColor;
      if (promptText) {
        if (window.pfodSetFormattedText) {
          window.pfodSetFormattedText(promptEl, promptText, contrastHex);
        } else {
          promptEl.textContent = promptText;
        }
        promptEl.style.color = contrastHex;
      }
    }

    // Content area always black background with white text; only the prompt area is coloured
    const content = document.getElementById('streaming-data-content');
    if (content) {
      content.style.backgroundColor = 'black';
      content.style.color = 'white';
      content.textContent = initialData;
      if (window.rawDataCollector) window.rawDataCollector.markDisplayedUpTo();
      if (!this.streamingScrollLocked) content.scrollTop = content.scrollHeight;
      this.startStreamingPolling();
    }
  },

  /**
   * Exit streaming raw data display and restore message-mode.
   */
  exitStreamingData() {
    // Idempotent cleanup: always remove the panel if present and stop polling,
    // but only flip CSS back to message-mode when we're leaving streaming-mode
    // (callers may invoke this defensively from chart-mode/menu-mode/etc to
    //  scrub any leftover panel without disturbing the current display class).
    this.stopStreamingPolling();
    const canvasWrapper = document.getElementById('canvas-wrapper');
    const panel = document.getElementById('streaming-data-display');
    if (panel && canvasWrapper) canvasWrapper.removeChild(panel);
    if (document.body.className === 'streaming-mode') {
      document.body.className = 'message-mode';
      this.updateRefreshButtonState();
    }
  },

  /**
   * Start polling rawDataCollector for new data and appending to the streaming screen.
   */
  startStreamingPolling() {
    this.stopStreamingPolling();
    this.streamingPollingInterval = setInterval(() => {
      const content = document.getElementById('streaming-data-content');
      if (!content) { this.stopStreamingPolling(); return; }
      if (window.rawDataCollector) {
        const newData = window.rawDataCollector.getNewData();
        if (newData.length > 0) {
          content.textContent += newData;
          window.rawDataCollector.markDisplayedUpTo();
          if (!this.streamingScrollLocked) content.scrollTop = content.scrollHeight;
        }
      }
    }, 100);
  },

  /**
   * Stop the streaming data polling interval.
   */
  stopStreamingPolling() {
    if (this.streamingPollingInterval) {
      clearInterval(this.streamingPollingInterval);
      this.streamingPollingInterval = null;
    }
  },

  /**
   * Display chart using CSV data with the largest field count.
   * Used by toolbar menu and initial timeout fallback.
   * Creates chartInfo compatible with displayChartWithPlotNo.
   *
   * @param {string} title  - Chart title
   * @param {string} unused - Unused parameter (kept for compatibility)
   * @param {number} limit  - Maximum CSV lines to display
   */
  displayChart(title, unused, limit = 500) {
    if (!window.csvCollector) {
      console.error('[CHART] CSV collector not available');
      return;
    }

    // Get all available field counts and pick the largest
    const fieldCounts = window.csvCollector.getFieldCounts();
    let maxFieldCount;
    let isDummy;

    if (!fieldCounts || fieldCounts.length === 0) {
      // No CSV data available yet - create a default single field to display empty chart
      console.warn('[CHART] No CSV data available, creating default single-field chart');
      maxFieldCount = 1;
      isDummy = true; // Mark as dummy since no real data
    } else {
      maxFieldCount = Math.max(...fieldCounts.map(f => parseInt(f)));
      console.log('[CHART] displayChart - available field counts:', fieldCounts, 'using max:', maxFieldCount);
      isDummy = false; // Real data from csvCollector
    }

    // Create generic field labels (field1, field2, etc.) based on CSV field count
    // These will be used as fallback when no explicit labels from chart response
    const allLabels = Array.from({length: maxFieldCount}, (_, i) => `field${i + 1}`);
    const nonBlankLabels = allLabels; // All are non-blank in this case

    // Determine if we're using count as X-axis (single field case)
    const useCountFlag = maxFieldCount === 1;
    const xAxisFieldLabel = useCountFlag ? 'Count' : allLabels[0];

    // Create fieldSpecs for all fields except first (which is X-axis)
    // For single-field case: X-axis is count, so Y-fields include field1
    // For multi-field case: X-axis is field1, so Y-fields are field2, field3, etc.
    let yFieldLabels;
    let fieldSpecs;

    if (useCountFlag) {
      // Single field: use it as Y-axis (count is implicit X-axis)
      yFieldLabels = allLabels; // All fields are Y-series when using count
      fieldSpecs = allLabels.map((label, idx) => ({
        label: label,
        plotNo: null,
        index: idx
      }));
    } else {
      // Multiple fields: first is X-axis, rest are Y-series
      yFieldLabels = allLabels.slice(1);
      fieldSpecs = allLabels.slice(1).map((label, idx) => ({
        label: label,
        plotNo: null,
        index: idx + 1
      }));
    }

    // Create chartInfo in legacy mode format (no plotNo specified)
    // This matches what parseChartLabelsWithPlotNo returns for legacy single-subplot mode
    // isDummy=true if no field counts available, false if data exists
    window.currentChartInfo = {
      title: title,
      maxPoints: limit,
      allLabels: allLabels,
      nonBlankLabels: nonBlankLabels,
      fieldCount: maxFieldCount,
      hasPlotNo: false,
      useCountFlag: useCountFlag,
      useCountAsXAxis: useCountFlag, // Use count as X-axis for single-field case
      xAxisFieldIndex: useCountFlag ? -1 : 0, // -1 means use count
      xAxisFieldLabel: xAxisFieldLabel,
      isDummy, // true if default chart (no data), false if real data from csvCollector
      subplots: [{
        plotNo: 1,
        fieldSpecs: fieldSpecs,
        fieldLabels: yFieldLabels
      }]
    };

    this.displayChartWithPlotNo();
  },

  /**
   * Display chart with optional plotNo support for multi-subplot mode.
   * Handles both multi-subplot mode (hasPlotNo=true) and legacy single-subplot mode (hasPlotNo=false).
   * Always uses the multi-subplot infrastructure even for single-subplot charts.
   *
   * Reads the chart to display from window.currentChartInfo (the single
   * holder for the currently displayed chart) — callers set that before
   * calling this, rather than threading the same chartInfo through as an
   * argument as well.
   */
  displayChartWithPlotNo() {
    const startTime = Date.now();
    const chartInfo = this.currentChartInfo;
    const limit = chartInfo.maxPoints;
    console.log('[CHART] displayChartWithPlotNo called - title:', chartInfo.title, 'hasPlotNo:', chartInfo.hasPlotNo, 'limit:', limit);

    if (!window.chartDisplay) {
      console.error('[CHART] ChartDisplay not available');
      return;
    }

    // If we're entering the chart from the streaming raw-data screen (toolbar
    // "..." → Chart), tear down the streaming panel first so it isn't left
    // orphaned in canvas-wrapper to bleed through after we leave chart-mode.
    if (document.getElementById('streaming-data-display')) {
      this.exitStreamingData();
    }

    // Switch to chart display CSS mode
    console.log('[CHART] Switching to chart-mode CSS');
    document.body.className = 'chart-mode';

    // Update refresh button state
    this.updateRefreshButtonState();

    const canvasWrapper = document.getElementById('canvas-wrapper');
    if (!canvasWrapper) {
      console.error('[CHART] Canvas wrapper not found');
      return;
    }

    try {
      const fieldCount = chartInfo.fieldCount;
      console.log('[CHART] fieldCount=', fieldCount, 'hasPlotNo=', chartInfo.hasPlotNo);

      // Load CSV data
      const csvLines = window.chartDisplay.loadCSVData(fieldCount);
      console.log('[CHART] Loaded', csvLines.length, 'CSV lines for', fieldCount, 'fields');

      // Always reset chartDisplay's canvas-size cache on every chart entry —
      // a fresh canvas defaults to 300×150 and resizeCanvasToFitSpace will
      // short-circuit ("dimensions unchanged, skipping") if the cache still
      // holds the previous chart's wrapper-matched dimensions.  Must run
      // before the resize call further down, regardless of whether the
      // previous chartCanvas reference survived.
      if (window.chartDisplay) {
        window.chartDisplay.lastCanvasWidth = 0;
        window.chartDisplay.lastCanvasHeight = 0;
      }

      // Remove ALL orphan canvas children from canvas-wrapper, not just
      // this.chartCanvas — when chart is opened via touchZone-response from a
      // dwg, this.chartCanvas can lose reference to the actual rendered canvas
      // (the dwg's canvas-wrapper layout differs from menu-mode layout) and a
      // single `this.chartCanvas.remove()` then leaves a sibling canvas behind
      // that double-renders on re-render (e.g. Freeze).
      const existingCanvases = canvasWrapper.querySelectorAll(':scope > canvas');
      if (existingCanvases.length > 0) {
        console.log('[CHART] Removing', existingCanvases.length, 'orphan canvas(es) from canvas-wrapper');
        existingCanvases.forEach(c => c.remove());
      }
      this.chartCanvas = null;

      // Create a fresh canvas for this chart session and insert into canvas-wrapper
      this.chartCanvas = document.createElement('canvas');
      canvasWrapper.insertBefore(this.chartCanvas, document.getElementById('menu-container'));

      // Resize canvas BEFORE creating chart
      console.log('[CHART] Resizing canvas');
      window.chartDisplay.resizeCanvasToFitSpace(this.chartCanvas);

      let parseResult = null;

      // Parse CSV data only if we have data
      if (csvLines.length > 0) {
        console.log('[CHART] Parsing CSV data with parseCSVToDatasetWithPlotNo');
        parseResult = window.chartDisplay.parseCSVToDatasetWithPlotNo(csvLines, chartInfo, limit);

        if (!parseResult) {
          console.warn('[CHART] Failed to parse CSV data, will display as empty chart');
          parseResult = null; // Fall through to empty chart creation
        }
      } else {
        console.warn('[CHART] No CSV data available, will display empty chart');
      }

      // Create chart with or without data
      // createAndDisplayMultiSubplotChart handles both: parseResult=null for empty, or populated parseResult
      console.log('[CHART] Creating chart with createAndDisplayMultiSubplotChart (hasData:', parseResult !== null, ')');
      const chart = window.chartDisplay.createAndDisplayMultiSubplotChart(chartInfo.title, chartInfo, parseResult, this.chartCanvas);

      if (!chart) {
        console.error('[CHART] Failed to create chart');
        return;
      }

      // If Chart Config panel is open, refresh it to reflect the new chart
      if (window.chartConfigViewer && window.chartConfigViewer.isVisible) {
        window.chartConfigViewer.populate();
      }

      // Auto-open Chart Config if flagged (e.g. by Load CSV to Plot)
      if (window._autoOpenChartConfig && window.chartConfigViewer) {
        window._autoOpenChartConfig = false;
        window.chartConfigViewer.show();
      }

      // Start polling for chart updates - even if chart is empty, so new data gets displayed when available
      console.log('[CHART] Starting update polling');
      window.chartDisplay.startMultiSubplotUpdatePolling();

      console.log('[CHART] Chart display complete, total elapsed:', Date.now() - startTime, 'ms');

    } catch (error) {
      console.error('[CHART] Error displaying chart:', error);
    }
  },

  /**
   * Exit chart display and restore canvas.
   * Stops polling, clears chart state, restores message-mode CSS,
   * and re-inserts the drawing canvas before #menu-container.
   */
  exitChartDisplay() {
    const exitTime = Date.now();
    console.log('[CHART] Exiting chart display at', exitTime, 'current className=', document.body.className);

    // NOTE: we deliberately do NOT clear this.sentRequest here.
    //
    // Every queued request is sent via `await connectionManager.send()`, and
    // each send is bounded by an AbortController response-timeout + retry
    // budget — so the await ALWAYS settles (resolves with a response, or
    // rejects after retries are exhausted).  Both the success path and the
    // catch path clear sentRequest through the normal queue flow.  There is
    // therefore no such thing as a permanently "stuck" sentRequest.
    //
    // The old "clear stuck sentRequest" hack here nulled sentRequest while a
    // fetch was still in flight.  On back-from-chart that let the queued
    // {V1:.} fire a SECOND concurrent fetch before the in-flight one's
    // response arrived — two HTTP requests racing broke the pfod
    // request/response pairing and intermittently lost the menu redisplay
    // on Chrome/Android.  Leaving sentRequest alone keeps the queue's
    // one-request-at-a-time invariant: the in-flight request drains
    // naturally, then processRequestQueue sends the queued back cmd.

    // Stop chart polling and clear chart state. Reachable only while
    // body.className === 'chart-mode' (every caller gates on that), which
    // guarantees window.chartDisplay exists. clear() resets currentChart
    // (the canvas it was bound to is about to be torn down) but deliberately
    // leaves currentChartInfo alone — that's the chart's parsed spec (data),
    // not display state, so it should still reflect the last-displayed chart
    // if the user reopens Chart Config or the chart itself from outside
    // chart-mode.
    console.log('[CHART] Stopping chart polling and clearing...');
    window.chartDisplay.clear(); // This calls stopUpdatePolling() internally
    console.log('[CHART] Chart cleared');

    // Close Chart Config panel — it is only valid while in chart mode
    if (window.chartConfigViewer && window.chartConfigViewer.isVisible) {
      window.chartConfigViewer.hide();
    }

    // Remove ALL canvas children of #canvas-wrapper BEFORE switching modes.
    // this.chartCanvas can lose its reference to the actual rendered canvas
    // (same pattern as displayChartWithPlotNo's orphan-canvas issue) so a
    // single `this.chartCanvas.remove()` is not enough — a sibling canvas
    // can survive and show through under the now-visible #canvas-message
    // ("Requesting Menu ..."), producing the half-blue / half-plot split.
    const canvasWrapper = document.getElementById('canvas-wrapper');
    if (canvasWrapper) {
      const existingCanvases = canvasWrapper.querySelectorAll(':scope > canvas');
      if (existingCanvases.length > 0) {
        console.log('[CHART] exitChartDisplay: removing', existingCanvases.length, 'canvas(es) from canvas-wrapper');
        existingCanvases.forEach(c => c.remove());
      }
    }
    this.chartCanvas = null;

    // Switch back to message display CSS mode
    console.log('[CHART] Switching back to message-mode CSS');
    document.body.className = 'message-mode';
    console.log('[CHART] Switched back to message-mode CSS');

    // Update refresh button state
    this.updateRefreshButtonState();

    // Resize canvas to recalculate all coordinates for the restored drawing
    console.log('[CHART] Starting handleResize after restore at', Date.now(), 'elapsed:', Date.now() - exitTime, 'ms');
    this.handleResize();
    console.log('[CHART] Finished handleResize after restore at', Date.now(), 'elapsed:', Date.now() - exitTime, 'ms');

    // Force re-engage serial connection if it's disconnected
    if (this.connectionManager && this.connectionManager.protocol === 'serial') {
      const isConnected = this.connectionManager.isConnected();
      if (!isConnected) {
        console.log('[CHART] Serial connection lost - attempting force re-engage');
        // Use setTimeout to allow async operation without blocking
        setTimeout(async () => {
          const reengaged = await this.connectionManager.forceReengageSerial();
          if (reengaged) {
            console.log('[CHART] Serial port successfully re-engaged');
          } else {
            console.warn('[CHART] Failed to re-engage serial port');
          }
        }, 10);
      }
    }

    // Trigger queue processing in case {.} was added to queue while in chart mode
    console.log('[CHART] Triggering processRequestQueue after chart exit');
    setTimeout(() => {
      this.processRequestQueue();
    }, 20);

    console.log('[CHART] Canvas restored, exitChartDisplay complete at', Date.now(), 'elapsed:', Date.now() - exitTime, 'ms');
    console.log('[CHART] className after exit=', document.body.className);
  }

});
