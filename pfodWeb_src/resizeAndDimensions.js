/*
   resizeAndDimensions.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Resize and dimension-persistence methods for the DrawingViewer class.
// Assigned to DrawingViewer.prototype after the class is defined in pfodWeb.js.
//
// State read:    canvas, ctx, hasReceivedFirstResponse, touchState, redraw.redrawDrawingManager,
//                lastWindowWidth, lastWindowHeight (logical dims no longer
//                tracked here — a menu has zero or more drawing items, no
//                single logical dimension)
// State written: lastWindowWidth, lastWindowHeight
// Calls:         redraw.resizeCanvas(), redraw.performRedraw(), window.chartDisplay.handleResize()
// Called by:     constructor, responseHandlers:handleDwgResponse,
//                chartAndRawData:exitChartDisplay, drawingProcessing:redrawCanvas,
//                toolbarAndMenu:setupToolbarButtons, navigationAndQueue:queueInitialRequest,
//                responseHandlers:processMenuResponse, connectionSetup resize listener

Object.assign(DrawingViewer.prototype, {

  // Return the localStorage key used to save/load canvas dimensions.
  // Uses an iframe-specific key when running inside an iframe, otherwise a fixed main key.
  getDimensionStorageKey() {
    const isIframe = window.self !== window.top;
    const referrer = document.referrer;

    if (isIframe && referrer) {
      // Extract page name from referrer for iframe context
      const referrerPath = new URL(referrer).pathname;
      const pageName = referrerPath.split('/').pop().split('.')[0] || 'unknown';
      return `pfodWeb_dimensions_iframe_${pageName}`;
    } else {
      // Main window context
      return 'pfodWeb_dimensions_main';
    }
  },

  // Load previously saved canvas dimensions from localStorage.
  // Returns the saved dims object {windowWidth, windowHeight}, or null if
  // nothing is stored or the stored value is corrupt.
  loadPreviousDimensions() {
    try {
      const storageKey = this.getDimensionStorageKey();
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const dims = JSON.parse(saved);
        console.log(`[DIMENSIONS] Loaded previous dimensions from ${storageKey}: window=${dims.windowWidth}x${dims.windowHeight}`);
        return dims;
      } else {
        console.log(`[DIMENSIONS] No previous dimensions found for ${storageKey}`);
        return null;
      }
    } catch (e) {
      console.log('[DIMENSIONS] Error loading dimensions:', e);
      return null;
    }
  },

  // Save current canvas dimensions to localStorage for future reloads.
  saveDimensions(windowWidth, windowHeight) {
    try {
      const dims = {
        windowWidth: windowWidth,
        windowHeight: windowHeight
      };
      const storageKey = this.getDimensionStorageKey();
      localStorage.setItem(storageKey, JSON.stringify(dims));
      console.log(`[DIMENSIONS] Saved dimensions to ${storageKey}: window=${windowWidth}x${windowHeight}`);
    } catch (e) {
      console.log('[DIMENSIONS] Error saving dimensions:', e);
    }
  },

  // Central resize dispatcher. Called on window resize events and after any layout change
  // (menu show/hide, chart enter/exit, drawing data arrival).
  // Delegates to the appropriate resize handler based on the current display mode,
  // and persists dimension changes to localStorage for the next session.
  handleResize() {
    console.log('[RESIZE] handleResize() called, className:', document.body.className, 'chartDisplay exists:', !!window.chartDisplay);

    // Check if in chart mode - use different resize handling
    if (document.body.className === 'chart-mode' && window.chartDisplay) {
      console.log('[RESIZE] In chart mode - delegating to ChartDisplay.handleResize()');
      window.chartDisplay.handleResize(this.chartCanvas);
      return;
    }

    console.log('[RESIZE] Not in chart mode - using drawing resize logic');

    // While waiting for the first device response, keep the blue initial screen.
    if (!this.hasReceivedFirstResponse) {
      console.log('[RESIZE] Waiting for first response - repainting initial screen');
      this.updateCanvasMessage('Requesting Main Menu ...');
      return;
    }

    // A menu has zero or more drawing items, each with its own logical
    // dimensions — there is no single "logical width/height" for the
    // screen.  Track only window size for change-detection here; per-item
    // canvas sizing is delegated to pfodMenuDisplay.handleMenuResize.
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight - 40; // Subtract 40px for toolbar

    const windowChanged =
      this.lastWindowWidth !== windowWidth ||
      this.lastWindowHeight !== windowHeight;

    if (windowChanged) {
      console.log(`[DIMENSIONS] Window size changed - saving: window=${windowWidth}x${windowHeight}`);
      this.lastWindowWidth = windowWidth;
      this.lastWindowHeight = windowHeight;
      this.saveDimensions(windowWidth, windowHeight);
    }

    // Delegate resize to menu-mode handler (per-item canvases)
    if (document.body.className === 'menu-mode' && window.pfodMenuDisplay) {
      console.log('[RESIZE] In menu-mode - delegating resize to pfodMenuDisplay.handleMenuResize');
      window.pfodMenuDisplay.handleMenuResize(this.redraw);
    } else {
      console.log('[RESIZE] No resize action for current mode:', document.body.className);
    }
  },

  // Set the text on the blue message div.
  // Used for status messages while waiting for a device response.
  updateCanvasMessage(message) {
    const el = document.getElementById('canvas-message');
    if (el) el.textContent = message;
  },

  // Clear the text on the blue message div.
  clearCanvasMessage() {
    const el = document.getElementById('canvas-message');
    if (el) el.textContent = '';
  }

});
