/*   
   pfodWebMouse.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Touch and mouse event handling for the drawing canvas.
// Interprets pointer events as pfod touchZone interactions and feeds commands
// to the request queue. Also manages touchAction overlay rendering.
//
// Exports:    window.pfodWebMouse singleton object, window.TouchZoneSpecialValues constants
// Depends on: DrawingViewer instance (drawingViewer global from connectionSetup.js),
//             TouchZoneFilters from drawingDataProcessor.js,
//             redraw.js (pfodWebMouse.redraw set by setupEventListeners)
// Called by:  connectionSetup.js setupEventListeners (wires canvas pointer events),
//             drawingProcessing.js processPendingResponses (calls processPendingResponses
//             indirectly via mouse-up → pfodWebMouse.handleMouseUp),
//             navigationAndQueue.js scheduleNextUpdate (reads touchActionInputOpen),
//             keepAliveAndHttp.js fetchRefresh (reads touchActionInputOpen)

// Sentinel values used when a touch zone's coordinate field refers to the
// pixel row or column of the touch point rather than a fixed offset.
const TouchZoneSpecialValues = {
  TOUCHED_COL: 65534, // Only used in touchZone actions to specify touched col value
  TOUCHED_ROW: 65532, // Only used in touchZone actions to specify touched row value
};

// Make pfodWebMouse available globally for browser use
window.pfodWebMouse = {
  // Flag to track if touchActionInput dialog is currently open
  touchActionInputOpen: false,

  // Helper method to calculate scale factors based on actual rendered canvas size
  // This handles layout changes (like raw message view) that affect canvas display
  getCanvasScale: function() {
    const rect = this.canvas.getBoundingClientRect();
    if (!this.redraw) throw new Error('[pfodWebMouse] getCanvasScale: redraw not set');
    // _menuDrawingName is set on the proxy context used for per-item menu canvases
    const currentDrawingName = this._menuDrawingName;
    const drawingData = this.redraw.redrawDrawingManager.drawingsData[currentDrawingName];
    if (!drawingData) throw new Error(`[pfodWebMouse] getCanvasScale: no drawing data for "${currentDrawingName}"`);
    const logicalWidth = drawingData.data.x;
    const logicalHeight = drawingData.data.y;
    return {
      scaleX: rect.width / logicalWidth,
      scaleY: rect.height / logicalHeight,
      rect: rect
    };
  },

  // Wire mouse/touch event listeners on a per-item menu canvas.
  // Creates a proxy context that redirects this.canvas to the per-item canvas and
  // scopes makeBackup() to return only that drawing's touch zones / actions so that
  // findTouchZoneAt and handleTouchZoneActivation operate on the correct drawing.
  // menuItemCmd is the menu item's cmd character (e.g. 'D' for |+D~z) used as the
  // identifier in touch zone commands so each drawing sends its own cmd, not the
  // last one set on the shared drawingViewer.currentIdentifier.
  setupMenuCanvasListeners: function(canvas, drawingName, menuItemCmd, drawingViewer) {
    const self = this;

    // Proxy extends drawingViewer but overrides canvas and drawing name
    const proxy = Object.create(drawingViewer);
    proxy.canvas = canvas;
    proxy._menuDrawingName = drawingName;
    proxy.currentIdentifier = menuItemCmd;

    // Proxy redraw overrides makeBackup to scope to the per-drawing collections
    const origRedraw = drawingViewer.redraw;
    const proxyRedraw = Object.create(origRedraw);
    proxyRedraw.makeBackup = function() {
      const backup = origRedraw.makeBackup.call(origRedraw);
      if (!backup) return null;
      const dm = origRedraw.redrawDrawingManager;
      // No backup.drawingName field — the menuDwg loadCmd is recovered from
      // the request cmd in the response handler via _resolveLoadCmdFromRequest,
      // and from this.<menuDrawingName> in pfodWebMouse handlers.  Snapshot
      // ONLY the touched menuDwg's merged collections (the data that touchAction
      // processing mutates), keyed under [drawingName] so the structure mirrors
      // DrawingManager.allXXX.
      backup.allTouchZonesByCmd[drawingName]        = JSON.parse(JSON.stringify(dm.allTouchZonesByCmd[drawingName]        || {}));
      backup.allTouchActionsByCmd[drawingName]      = JSON.parse(JSON.stringify(dm.allTouchActionsByCmd[drawingName]      || {}));
      backup.allTouchActionInputsByCmd[drawingName] = JSON.parse(JSON.stringify(dm.allTouchActionInputsByCmd[drawingName] || {}));
      backup.allUnindexedItems[drawingName]         = JSON.parse(JSON.stringify(dm.allUnindexedItems[drawingName]         || []));
      backup.allIndexedItemsByNumber[drawingName]   = JSON.parse(JSON.stringify(dm.allIndexedItemsByNumber[drawingName]   || {}));
      return backup;
    };
    proxy.redraw = proxyRedraw;

    canvas.addEventListener('mousedown',  (e) => self.handleMouseDown.call(proxy, e));
    canvas.addEventListener('mouseup',    (e) => self.handleMouseUp.call(proxy, e));
    canvas.addEventListener('mousemove',  (e) => self.handleMouseMove.call(proxy, e));
    canvas.addEventListener('mouseleave', (e) => self.handleMouseLeave.call(proxy, e));
    canvas.addEventListener('click',      (e) => self.handleClick.call(proxy, e));
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); self.handleMouseDown.call(proxy, e.touches[0]); }, { passive: false });
    canvas.addEventListener('touchmove',  (e) => { e.preventDefault(); self.handleMouseMove.call(proxy, e.touches[0]); }, { passive: false });
    canvas.addEventListener('touchend',   (e) => self.handleMouseUp.call(proxy, e.changedTouches[0]));
  },

  setupEventListeners: function(drawingViewer) {
    // Initialize touchActionBackups on global object only if it doesn't exist to preserve existing backups
    if (window.pfodWebMouse.touchActionBackups === undefined) {
      window.pfodWebMouse.touchActionBackups = null;
    }
    // Mouse/touch events for drawings are wired per-item via setupMenuCanvasListeners()
  },

  // Mouse and touch event handlers
  handleMouseDown: function(e) {
    console.warn(`[MOUSE_DOWN] called handleMouseDown`);

    // Get canvas-relative coordinates and scale factors
    const scale = window.pfodWebMouse.getCanvasScale.call(this);
    const x = (e.clientX - scale.rect.left) / scale.scaleX;
    const y = (e.clientY - scale.rect.top) / scale.scaleY;

    let minTouch_mm = 9;
    let minPercent = 2 / 100;
    let colPixelsHalf9mm = (96 * minTouch_mm) / (2 * 25.4); // half 9mm to add to both sides
    let rowPixelsHalf9mm = (96 * minTouch_mm) / (2 * 25.4);
    if ((scale.rect.width * minPercent) > colPixelsHalf9mm) {
      colPixelsHalf9mm = scale.rect.width * minPercent;
    }
    if ((scale.rect.height * minPercent) > rowPixelsHalf9mm) {
      rowPixelsHalf9mm = scale.rect.height * minPercent;
    }
    console.log(`DOWN in touchZone: enlarge by ${colPixelsHalf9mm} x ${rowPixelsHalf9mm}`);
    colPixelsHalf9mm = colPixelsHalf9mm / scale.scaleX;
    rowPixelsHalf9mm = rowPixelsHalf9mm / scale.scaleX;
    console.log(`DOWN in touchZone: canvas ${scale.rect.width} x ${scale.rect.height}`);
    console.log(`DOWN in touchZone: enlarge by dwg coords ${colPixelsHalf9mm} x ${rowPixelsHalf9mm}`);

    // Update touch state
    console.log(`[MOUSE_DOWN] Setting touchState.isDown = true`);
    this.touchState.wasDown = this.touchState.isDown;
    this.touchState.isDown = true;

    // Cancel any existing refresh timer to prevent interruption during user interaction
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
      console.log(`[MOUSE_DOWN] Cancelled refresh timer`);
    }

    this.touchState.startX = x;
    this.touchState.startY = y;
    this.touchState.lastX = x;
    this.touchState.lastY = y;
    this.touchState.startTime = Date.now();
    this.touchState.hasDragged = false;
    this.touchState.hasEnteredZones.clear();


      // Create backup using redraw's makeBackup method
      console.log(`[TOUCH_ACTION] Creating backup using redraw.makeBackup()`);
      window.pfodWebMouse.touchActionBackups = this.redraw.makeBackup();

      if (!window.pfodWebMouse.touchActionBackups) {
        console.error(`[TOUCH_ACTION] Failed to create backup - makeBackup() returned null`);
        return;
      }


    // Find the touchZone at this position
    const foundTouchZone = window.pfodWebMouse.findTouchZoneAt.call(this, x, y, colPixelsHalf9mm, rowPixelsHalf9mm);
    this.touchState.targetTouchZone = foundTouchZone;

    // Handle basic TOUCH filter (default if no filter specified)
    if (foundTouchZone && (foundTouchZone.filter === TouchZoneFilters.TOUCH || foundTouchZone.filter === 0)) {
      console.log(`TOUCH in touchZone: cmd=${foundTouchZone.cmd}`);
      window.pfodWebMouse.handleTouchZoneActivation.call(this, foundTouchZone, TouchZoneFilters.TOUCH, x, y);
    } 

    // If we found a touchZone with a DOWN filter, handle it
    if (foundTouchZone && (foundTouchZone.filter & TouchZoneFilters.DOWN)) {
      console.log(`Mouse DOWN in touchZone: cmd=${foundTouchZone.cmd}, filter=${foundTouchZone.filter}`);
      window.pfodWebMouse.handleTouchZoneActivation.call(this, foundTouchZone, TouchZoneFilters.DOWN, x, y);
    }
    // If we found a touchZone with a DOWN_UP / DOWN_DRAG_UP filter, handle it show touchActions but no msg yet
    if (foundTouchZone && (foundTouchZone.filter & TouchZoneFilters.DOWN_DRAG_UP)) {
      console.log(`Mouse DOWN in touchZone: cmd=${foundTouchZone.cmd}, filter=${foundTouchZone.filter}`);
      window.pfodWebMouse.handleTouchZoneActivation.call(this, foundTouchZone, TouchZoneFilters.DOWN, x, y, false);
    }

    // If we found a touchZone with a CLICK filter, handle it
//    if (foundTouchZone && (foundTouchZone.filter & TouchZoneFilters.CLICK)) {
//      console.log(`Mouse DOWN in touchZone: cmd=${foundTouchZone.cmd}, filter=${foundTouchZone.filter}`);
//      window.pfodWebMouse.handleTouchZoneActivation.call(this, foundTouchZone, TouchZoneFilters.DOWN, x, y, false); // show touchActions but no msg
//    }
    
    // If the touchZone supports PRESS (long press), set up a timer
    if (foundTouchZone && (foundTouchZone.filter & TouchZoneFilters.PRESS)) {
      if (this.touchState.longPressTimer) {
        clearTimeout(this.touchState.longPressTimer);
      }

      // Set a timer for long press (700ms is standard)
      this.touchState.longPressTimer = setTimeout(() => {
        if (this.touchState.isDown && this.touchState.targetTouchZone === foundTouchZone) {
          console.log(`Long PRESS in touchZone: cmd=${foundTouchZone.cmd}`);
          window.pfodWebMouse.handleTouchZoneActivation.call(this, foundTouchZone, TouchZoneFilters.PRESS, this.touchState.lastX, this.touchState.lastY);
        }
      }, 700);
    }
  },

  handleMouseMove: function(e) {
    if (!this.touchState.isDown) {
      // console.log(`[MOUSE_MOVE] Ignoring - mouse not down`);
      return;
    }
    // console.log(`[MOUSE_MOVE] Processing mouse move event`);

    // Get canvas-relative coordinates and scale factors
    const scale = window.pfodWebMouse.getCanvasScale.call(this);
    const x = (e.clientX - scale.rect.left) / scale.scaleX;
    const y = (e.clientY - scale.rect.top) / scale.scaleY;

    let minTouch_mm = 9;
    let minPercent = 2 / 100;
    let colPixelsHalf9mm = (96 * minTouch_mm) / (2 * 25.4); // half 9mm to add to both sides
    let rowPixelsHalf9mm = (96 * minTouch_mm) / (2 * 25.4);
    if ((scale.rect.width * minPercent) > colPixelsHalf9mm) {
      colPixelsHalf9mm = scale.rect.width * minPercent;
    }
    if ((scale.rect.height * minPercent) > rowPixelsHalf9mm) {
      rowPixelsHalf9mm = scale.rect.height * minPercent;
    }
    console.log(`DRAG in touchZone enlarge by ${colPixelsHalf9mm} x ${rowPixelsHalf9mm}`);
    colPixelsHalf9mm = colPixelsHalf9mm / scale.scaleX;
    rowPixelsHalf9mm = rowPixelsHalf9mm / scale.scaleX;
    console.log(`DRAG in touchZone canvas ${scale.rect.width} x ${scale.rect.height}`);
    console.log(`DRAG in touchZone enlarge by dwg coords ${colPixelsHalf9mm} x ${rowPixelsHalf9mm}`);

    // Update current position
    this.touchState.lastX = x;
    this.touchState.lastY = y;

    // Calculate distance moved from start point
    const dx = x - this.touchState.startX;
    const dy = y - this.touchState.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Only consider as drag if moved more than a small threshold
    if (distance > 0) {
      console.log(`[MOUSE_DRAG] Distance moved: ${distance.toFixed(2)}, setting hasDragged = true`);
      this.touchState.hasDragged = true;

      // Find touchZone at current position
      const currentTouchZone = window.pfodWebMouse.findTouchZoneAt.call(this, x, y, colPixelsHalf9mm, rowPixelsHalf9mm);
      console.log(`[MOUSE_DRAG] CurrentTouchZone:`, currentTouchZone ? `cmd=${currentTouchZone.cmd}, filter=${currentTouchZone.filter}` : 'null');

      // Handle ENTRY/EXIT events
      if (currentTouchZone !== this.touchState.targetTouchZone) {
        // Handle EXIT from previous touchZone
        if (this.touchState.targetTouchZone && (this.touchState.targetTouchZone.filter & TouchZoneFilters.EXIT)) {
          console.log(`EXIT from touchZone: cmd=${this.touchState.targetTouchZone.cmd}`);
          window.pfodWebMouse.handleTouchZoneActivation.call(this, this.touchState.targetTouchZone, TouchZoneFilters.EXIT, x, y, false);
        }

        // Handle ENTRY to new touchZone
        if (currentTouchZone && (currentTouchZone.filter & TouchZoneFilters.ENTRY)) {
          // Only trigger ENTRY once per touch sequence for this zone
          if (!this.touchState.hasEnteredZones.has(currentTouchZone)) {
            console.log(`ENTRY to touchZone: cmd=${currentTouchZone.cmd}`);
            window.pfodWebMouse.handleTouchZoneActivation.call(this, currentTouchZone, TouchZoneFilters.ENTRY, x, y, false);
            this.touchState.hasEnteredZones.add(currentTouchZone);
          }
        }

        this.touchState.targetTouchZone = currentTouchZone;
      }

      // Handle DRAG events for current touchZone
      if (currentTouchZone && (currentTouchZone.filter & TouchZoneFilters.DRAG)) {
        console.warn(`[MOUSE_DRAG] DRAG filter detected - calling handleTouchZoneActivation for cmd=${currentTouchZone.cmd}`);
        window.pfodWebMouse.handleTouchZoneActivation.call(this, currentTouchZone, TouchZoneFilters.DRAG, x, y);
      } else if (currentTouchZone) {
        console.log(`[MOUSE_DRAG] TouchZone found but no DRAG filter - filter=${currentTouchZone.filter}, DRAG=${TouchZoneFilters.DRAG}`);
        console.log(`[MOUSE_DRAG] Binary check: (${currentTouchZone.filter} & ${TouchZoneFilters.DRAG}) = ${currentTouchZone.filter & TouchZoneFilters.DRAG}`);
      }
      // Handle DRAG events for current touchZone
      if (currentTouchZone && (currentTouchZone.filter & TouchZoneFilters.DOWN_DRAG_UP)) {
        console.log(`[MOUSE_DRAG] DOWN_DRAG_UP filter detected - calling handleTouchZoneActivation for cmd=${currentTouchZone.cmd}`);
        window.pfodWebMouse.handleTouchZoneActivation.call(this, currentTouchZone, TouchZoneFilters.DRAG, x, y,false); // show but not send
      } else if (currentTouchZone) {
        console.log(`[MOUSE_DRAG] TouchZone found but no DOWN_DRAG_UP filter - filter=${currentTouchZone.filter}, DOWN_DRAG_UP=${TouchZoneFilters.DOWN_DRAG_UP}`);
        console.log(`[MOUSE_DRAG] Binary check: (${currentTouchZone.filter} & ${TouchZoneFilters.DOWN_DRAG_UP}) = ${currentTouchZone.filter & TouchZoneFilters.DOWN_DRAG_UP}`);
      }

      // Check if we've left the original touchzone that started the drag
      if (this.touchState.targetTouchZone && !currentTouchZone) {
        console.warn('[MOUSE_DRAG] Left original touchzone area - restoring touchActions and processing pending responses');

        // Restore from any active touchActions FIRST to get back to basic state

        // THEN process any pending responses
        if (this.pendingResponseQueue.length > 0) {
          this.processPendingResponses();
        }

        // Reset mouse state since we've left the drag area
        this.touchState.wasDown = this.touchState.isDown;
        this.touchState.isDown = false;
        this.touchState.targetTouchZone = null;
        this.touchState.hasEnteredZones.clear();
      }
    }
  },

  handleMouseUp: function(e) {
    if (!this.touchState.isDown) return;

    // Get canvas-relative coordinates and scale factors
    const scale = window.pfodWebMouse.getCanvasScale.call(this);
    const x = (e.clientX - scale.rect.left) / scale.scaleX;
    const y = (e.clientY - scale.rect.top) / scale.scaleY;

    // Cancel long press timer if active
    if (this.touchState.longPressTimer) {
      clearTimeout(this.touchState.longPressTimer);
      this.touchState.longPressTimer = null;
    }

    // Handle UP and DOWN_DRAG_UP events for current touchZone
    if (this.touchState.targetTouchZone) {
      // Handle UP filter - Works
      if (this.touchState.targetTouchZone.filter & TouchZoneFilters.UP) {
        console.log(`Mouse UP in touchZone: cmd=${this.touchState.targetTouchZone.cmd}`);
        window.pfodWebMouse.handleTouchZoneActivation.call(this, this.touchState.targetTouchZone, TouchZoneFilters.UP, x, y);
      }

      // Handle DOWN_DRAG_UP filter - only sends on finger up - Works
      if (this.touchState.targetTouchZone.filter & TouchZoneFilters.DOWN_DRAG_UP) {
        console.log(`DOWN_UP in touchZone: cmd=${this.touchState.targetTouchZone.cmd}`);
        window.pfodWebMouse.handleTouchZoneActivation.call(this, this.touchState.targetTouchZone, TouchZoneFilters.DOWN_DRAG_UP, x, y);
      }
    }

    // Reset touch state FIRST to allow final redraw
    console.log(`[MOUSE_UP] Setting touchState.isDown = false`);
    this.touchState.wasDown = this.touchState.isDown;
    this.touchState.isDown = false;

    // Note: touchAction backup is restored on RESPONSE RECEIPT (see
    // requestQueue.js [TOUCH_RESTORE]).  Touch-up itself does not restore.
    if (window.pfodWebMouse.touchActionBackups) {
      const backup = window.pfodWebMouse.touchActionBackups;
      const dwg = this._menuDrawingName;
      console.log(`[MOUSE_UP] TouchAction backup exists for "${dwg}" — restore deferred until response receipt`);
      console.log(`[MOUSE_UP] Backup contains: unindexed=${backup.allUnindexedItems?.[dwg]?.length || 0}, indexed=${Object.keys(backup.allIndexedItemsByNumber?.[dwg] || {}).length}`);
    } else {
      console.log(`[MOUSE_UP] No touchAction backup exists`);
    }

    // THEN process any pending responses that were queued while mouse was down
    this.processPendingResponses();
    this.touchState.targetTouchZone = null;
    this.touchState.hasEnteredZones.clear();
  },

  handleMouseLeave: function(e) {
    console.log('[MOUSE_LEAVE] Mouse left canvas area');
    if (this.touchState.isDown) {
      console.log('[MOUSE_LEAVE] Mouse was down - restoring touchActions and processing pending responses');


      // THEN process any pending responses
      if (this.pendingResponseQueue.length > 0) {
        this.processPendingResponses();
      }

      // Reset touch state
      this.touchState.wasDown = this.touchState.isDown;
      this.touchState.isDown = false;
      this.touchState.targetTouchZone = null;
      this.touchState.hasEnteredZones.clear();
    }
  },

  handleClick: function(e) {
    // Check if mouse was held down for longer than PRESS timeout (700ms)
    // If so, ignore this click as it was a long press
    const currentTime = Date.now();
    const pressDuration = currentTime - this.touchState.startTime;
    if (pressDuration >= 700) {
      console.log(`Ignoring click - mouse was held down for ${pressDuration}ms (long press)`);
      this.touchState.hasDragged = false;
      return;
    }

    // Get canvas-relative coordinates and scale factors
    const scale = window.pfodWebMouse.getCanvasScale.call(this);
    const x = (e.clientX - scale.rect.left) / scale.scaleX;
    const y = (e.clientY - scale.rect.top) / scale.scaleY;

    let minTouch_mm = 9;
    let minPercent = 2 / 100;
    let colPixelsHalf9mm = (96 * minTouch_mm) / (2 * 25.4); // half 9mm to add to both sides
    let rowPixelsHalf9mm = (96 * minTouch_mm) / (2 * 25.4);
    if ((scale.rect.width * minPercent) > colPixelsHalf9mm) {
      colPixelsHalf9mm = scale.rect.width * minPercent;
    }
    if ((scale.rect.height * minPercent) > rowPixelsHalf9mm) {
      rowPixelsHalf9mm = scale.rect.height * minPercent;
    }
    console.log(`CLICK in touchZone: enlarge by ${colPixelsHalf9mm} x ${rowPixelsHalf9mm}`);
    colPixelsHalf9mm = colPixelsHalf9mm / scale.scaleX;
    rowPixelsHalf9mm = rowPixelsHalf9mm / scale.scaleX;
    console.log(`CLICK in touchZone: canvas ${scale.rect.width} x ${scale.rect.height}`);
    console.log(`CLICK in touchZone: enlarge by dwg coords ${colPixelsHalf9mm} x ${rowPixelsHalf9mm}`);

    // Find touchZone at click position
    const touchZone = window.pfodWebMouse.findTouchZoneAt.call(this, x, y, colPixelsHalf9mm, rowPixelsHalf9mm);

    // Handle basic CLICK event without drag
    if (!this.touchState.hasDragged) {
      if (touchZone) {
        // Handle CLICK filter
        if (touchZone && (touchZone.filter & TouchZoneFilters.CLICK)) {
          console.log(`CLICK in touchZone: cmd=${touchZone.cmd}`);
          window.pfodWebMouse.handleTouchZoneActivation.call(this, touchZone, TouchZoneFilters.CLICK, x, y, false);
          if (this.touchState.clickTimer) {
           clearTimeout(this.touchState.clickTimer);
          }

          // Set a timer for display of click touchActions (100ms is standard)
          this.touchState.clickTimer = setTimeout(() => {
            window.pfodWebMouse.handleTouchZoneActivation.call(this, touchZone, TouchZoneFilters.CLICK, this.touchState.lastX, this.touchState.lastY);
          }, 100);
          return;
        } 
      } else {
        // Special case: no touchZones defined or clicked outside all touchZones
        // Only send update request if no touchZones are defined
        const backup = window.pfodWebMouse.touchActionBackups;
        const dwg = this._menuDrawingName;
        const hasTouchZones = Object.keys(backup.allTouchZonesByCmd[dwg] || {}).length > 0;

        if (!hasTouchZones) {
          // No touchZones defined, so queue a general update request
          console.log("No touchZones defined - requesting general update on click");

          // Queue a general update request
          this.queueDrawingUpdate(dwg);
        } else {
          console.log("Touch outside defined touchZones - ignoring");
        }
      }
    }

    // Safety net: Restore touchActions and process any pending responses if mouse state got out of sync

    if (this.pendingResponseQueue.length > 0) {
      console.log(`[QUEUE] Safety net: Processing ${this.pendingResponseQueue.length} pending responses in handleClick`);
      this.processPendingResponses();
    }

    // Reset drag state
    this.touchState.hasDragged = false;
  },

  // Find touchZone containing specified coordinates (instance method)
  // touchZone object
  //    touchZoneObject = {
  //        type: "touchZone",
  //        xSize: xSize,
  //        ySize: ySize,
  //        cmd: cmd,
  //        idx: idx
  //        xOffset: xOffset,
  //        yOffset: yOffset,
  //        filter: filter,
  //        centered: "true"
  //    }
  
  // row col extra in dwg coords
  findTouchZoneAt: function(x, y, colExtra, rowExtra) { 
    console.warn(`[FIND_TOUCH_ZONE] findTouchZoneAt called with x:${x} y:${y} colExtra:${colExtra} rowExtra:${rowExtra}`);

    // Collect all visible touchZones
    let visibleTouchZones = [];

    //always use touchActionBackups
    
    // Create array from touchZonesByCmd values
    // Debug check for undefined issues during drag
//    if (!this.redraw) {
//        console.error(`[FIND_TOUCH_ZONE] this.redraw is undefined`);
//        return null;
 //   }
    
    const backup = window.pfodWebMouse.touchActionBackups;
    const dwg = this._menuDrawingName;
    const allTouchZones = (backup && dwg) ? backup.allTouchZonesByCmd[dwg] : undefined;
    console.log(`[FIND_TOUCH_ZONE] DEBUG allTouchZonesByCmd["${dwg}"] returned ${Object.keys(allTouchZones || {}).length} touchZones:`, Object.keys(allTouchZones || {}));
    if (allTouchZones === undefined) {
        console.error(`[FIND_TOUCH_ZONE] allTouchZonesByCmd["${dwg}"] returned undefined during ${this.touchState?.isDown ? 'DRAG' : 'NORMAL'} operation`);
        return null;
    }
    for (const cmd in allTouchZones) {
      const zone = allTouchZones[cmd];

      // Only include visible and non-disabled zones
      if (zone.visible !== false && zone.filter !== TouchZoneFilters.TOUCH_DISABLED) {
        visibleTouchZones.push(zone);
      }
    }
    console.warn(`[FIND_TOUCH_ZONE] number of visible touchZones ${visibleTouchZones.length}`);

    // Sort by idx (high idx first) last one wins if it over lays earlier one
    //visibleTouchZones.sort((a, b) => (b.idx || 0) - (a.idx || 0));

    // returns -ve if outside rect else min (x-x_middle,y-y_middle)
    // Check if point is inside any touchZone
    let currentZone = null;
    let currentBounds = null;
    let current_colMin = 0;
    let current_rowMin = 0;
    for (const zone of visibleTouchZones) {
      // Calculate touchZone bounds in dwg coords
      let bounds = window.pfodWebMouse.calculateTouchZoneBounds.call(this, zone);
      // apply min extra
      bounds.left -= colExtra;
      bounds.right += colExtra;
      bounds.top -= rowExtra;
      bounds.bottom += rowExtra;
      bounds.width = bounds.right - bounds.left;
      bounds.height = bounds.bottom - bounds.top;
      console.warn(`[FIND_TOUCH_ZONE] TouchZone: cmd=${zone.cmd}, left:${bounds.left} right:${bounds.right} top:${bounds.top} bottom:${bounds.bottom}`);
      // Check if point is inside bounds
      let insideZone = (x >= bounds.left && x <= bounds.left + bounds.width &&
        y >= bounds.top && y <= bounds.top + bounds.height);
      if (!insideZone) {
        continue;
      }
      colMin = Math.min(x - bounds.left, bounds.right - x); // closest col to edge
      rowMin = Math.min(y - bounds.top, bounds.bottom - y); // closest row to edge
      if (currentZone == null) {
        // make sure these are set for rect compare on next call
        currentZone = zone;
        current_colMin = colMin;
        current_rowMin = rowMin;
        currentBounds = bounds;
         console.warn(`[FIND_TOUCH_ZONE] TouchZone: cmd=${currentZone.cmd}, colMin:${colMin} rowMin:${rowMin})`);
        continue;
      } else { // have current
        let currentIdx = currentZone.idx;
        let thisIdx = zone.idx;
        if (currentIdx != thisIdx) {
          if (currentIdx > thisIdx) {
            // currentZone; // wins
            continue;
          } else if (thisIdx > currentIdx) {
            currentZone = zone;
            current_colMin = colMin;
            current_rowMin = rowMin;
            currentBounds = bounds;
            continue;
          }
        } else { // same idx so compare overlaps  
           console.warn(`[FIND_TOUCH_ZONE] TouchZone: cmd=${zone.cmd}, colMin:${colMin} rowMin:${rowMin})`);

          // else // continue to check overlaps
          // Returns true if `a` contains `b`
          // if current contains this return current
          // i.e. larger rect sits over smaller one but only if it completely covers it.
          // used for dragging
          // normally touchZones do not have/need indices
          // this approach allows you to put a whole dwg touchZone over other dwgs and
          // then click and drag them (identified by their position on the dwg)
          // without triggering the underlying dwgs own touchZones.
          //
          // touchZones ordered in the order they (first) arrived
          // if a late touchZone exactly overlays an earlier on the later (higher) touchZone is the active one!!
          // NOTE: rectf can have -ve values It is not limited to screen
          const contains = (a, b) => a.left <= b.left && a.top <= b.top && a.right >= b.right && a.bottom >= b.bottom;
          if (contains(zone, currentZone)) { // later zone contains earlier
            currentZone = zone;
            current_colMin = colMin;
            current_rowMin = rowMin;
            currentBounds = bounds;
            continue;
          } else if (contains(currentZone, zone)) {
            // no change
            continue;
          } else {
            // check overlap for best fit
            // else compare based on min overlap dimension
            // x_overlap = Math.max(0, Math.min(x12,x22) - Math.max(x11,x21));
            // y_overlap = Math.max(0, Math.min(y12,y22) - Math.max(y11,y21));
            // x11 = left y11 = top x12 = right, y12 = bottom
            // MUST overlap since point in both so can skip Math.max(0...
            let colOverlap = Math.min(bounds.right, currentBounds.right) - Math.max(bounds.left, currentBounds.left);
            let rowOverlap = Math.min(bounds.bottom, currentBounds.bottom) - Math.max(bounds.top, currentBounds.top);
            // console.warn(`[FIND_TOUCH_ZONE] colOverlap:${colOverlap} rowOverlap:${rowOverlap})`);

            let compareCol = true;
            // need this for long rectangles
            if (colOverlap == rowOverlap) {
              // check both dimensions point in col dimension
              let col_min = Math.min(current_colMin, colMin);
              let row_min = Math.min(current_rowMin, rowMin);
              // console.warn(`[FIND_TOUCH_ZONE] col_min:${col_min} row_min:${row_min})`);
              if (col_min < row_min) {
                // since overlap equal then this also implies col_max > row_max
                // closest to col boundry
                // compareCol == true;
              } else {
                compareCol = false;
              }
            } else if (colOverlap < rowOverlap) {
              // compareCol == true;
            } else {
              compareCol = false;
            }
            if (compareCol) {
              // check point in col dimension
              if (current_colMin <= colMin) {
                // nearer edge of current so choose this
                // if equal later ones take precedence
                currentZone = zone;
                current_colMin = colMin;
                current_rowMin = rowMin;
                currentBounds = bounds;
              } else {
                // return current;
              }
            } else {
              // check point in row dimension
              if (current_rowMin <= rowMin) {
                // nearer edge of current so choose this
                currentZone = zone;
                current_colMin = colMin;
                current_rowMin = rowMin;
                currentBounds = bounds;
              } else {
                // return current;
              }
            }
          }
        }
      }
    }
    if (currentZone) {
      console.warn(`[FIND_TOUCH_ZONE] returning TouchZone: cmd=${currentZone.cmd}`);
    } else {
      console.warn(`[FIND_TOUCH_ZONE] returning TouchZone: null`);
    }
    return currentZone; // the one found
  },

  // Calculate the bounds of a touchZone in canvas coordinates (instance method)
  // left, right, top, bottom
  calculateTouchZoneBounds: function(zone) {
    // Get the transform
    if (!zone.transform) throw new Error(`[pfodWebMouse] calculateTouchZoneBounds: transform missing on zone cmd="${zone.cmd}"`);
    const transform = zone.transform;

    // Get properties with defaults
    const xOffset = parseFloat(zone.xOffset);
    const yOffset = parseFloat(zone.yOffset || 0);
    const xSize = parseFloat(zone.xSize || 1); // min size is 1
    const ySize = parseFloat(zone.ySize || 1);
    const centered = zone.centered === 'true' || zone.centered === true;

    // Apply transform scale
    const scaledXOffset = xOffset * transform.scale;
    const scaledYOffset = yOffset * transform.scale;
    const scaledXSize = xSize * transform.scale;
    const scaledYSize = ySize * transform.scale;

    // Calculate bounds based on centered property
    let x, y, width, height;

    if (centered) {
      // For centered zones, center point is at the offset
      x = transform.x + scaledXOffset - Math.abs(scaledXSize) / 2;
      y = transform.y + scaledYOffset - Math.abs(scaledYSize) / 2;
      width = Math.abs(scaledXSize);
      height = Math.abs(scaledYSize);
    } else {
      // For non-centered zones, handle negative sizes
      if (scaledXSize >= 0) {
        x = transform.x + scaledXOffset;
        width = scaledXSize;
      } else {
        x = transform.x + scaledXOffset + scaledXSize; // Move start point left
        width = Math.abs(scaledXSize);
      }

      if (scaledYSize >= 0) {
        y = transform.y + scaledYOffset;
        height = scaledYSize;
      } else {
        y = transform.y + scaledYOffset + scaledYSize; // Move start point up
        height = Math.abs(scaledYSize);
      }
    }

    //        return { x, y, width, height };
    let left = x;
    let right = x + width;
    let top = y;
    let bottom = y + height;
    return {
      left,
      right,
      top,
      bottom,
      width,
      height
    };
  },

  // Handle touchZone activation by queueing a request (instance method)
  handleTouchZoneActivation: function(touchZone, touchType, x, y, sendMsg = true) {
    if (!touchZone.cmd) throw new Error('[pfodWebMouse] handleTouchZoneActivation: touchZone.cmd is missing or empty');

    // Skip disabled touchZones
    if (touchZone.filter & TouchZoneFilters.TOUCH_DISABLED) return;

    // Calculate touchZone bounds in canvas coordinates left, rigth, top, bottom, width, height
    const bounds = window.pfodWebMouse.calculateTouchZoneBounds.call(this, touchZone);
    // apply min extra
    //    bounds.left -= colHalf9mm;
    //    bounds.right += colHalf9mm;
    //    bounds.top -= rowHalf9mm;
    //    bounds.bottom += rowHalf9mm;
    //    bounds.width = bounds.right - bounds.left;
    //    bounds.height = bounds.bottom - bounds.top;

    // Get the original touchZone dimensions (unscaled)
    const xSize = parseFloat(touchZone.xSize || 1);
    const ySize = parseFloat(touchZone.ySize || 1);

    // Convert global coordinates to touchZone-relative coordinates
    // First, get the position within the rendered (scaled) touchZone
    const relativeX = x - bounds.left;
    const relativeY = y - bounds.top;

    // Scale to original touchZone coordinate system.
    // For negative sizes the zone extends in the negative direction, so the
    // screen-top of the rendered zone maps to the most-negative drawing coord.
    const scaledCol = (relativeX / bounds.width) * Math.abs(xSize);
    const scaledRow = (relativeY / bounds.height) * Math.abs(ySize);

    let col = xSize < 0 ? Math.floor(xSize + scaledCol) : Math.floor(scaledCol);
    let row = ySize < 0 ? Math.floor(ySize + scaledRow) : Math.floor(scaledRow);

    // Clamp to [min, max] where min/max depend on the sign of each size.
    const colMin = Math.min(0, xSize);
    const colMax = Math.max(0, xSize);
    const rowMin = Math.min(0, ySize);
    const rowMax = Math.max(0, ySize);
    if (col < colMin) col = colMin;
    if (col > colMax) col = colMax;
    if (row < rowMin) row = rowMin;
    if (row > rowMax) row = rowMax;

    console.log(`[TOUCH_ZONE} TouchZone activated: cmd=${touchZone.cmd}, touchType=${touchType}`);
    console.log(`Global coords: (${x}, ${y}), TouchZone bounds: (${bounds.left}, ${bounds.top}, ${bounds.width}, ${bounds.height})`);
    console.log(`Original size: ${xSize}x${ySize}, Displayed size: ${bounds.width}x${bounds.height}`);
    console.log(`Relative coords: (${relativeX}, ${relativeY}), Scaled: (${scaledCol}, ${scaledRow})`);
    console.log(`[TOUCH_ZONE]  Cell index: col=${col}, row=${row} (range 0,0 to ${xSize},${ySize})`);

    // Get the drawing name (the menuDwg this touch belongs to) — set on the
    // per-item canvas proxy by setupMenuCanvasListeners.  The backup object
    // deliberately carries no drawingName field (see redraw.makeBackup).
    const drawingName = this._menuDrawingName;

    // Check for touchActionInput first - it runs before other touchActions
    const touchActionInput = (window.pfodWebMouse.touchActionBackups.allTouchActionInputsByCmd[drawingName] || {})[touchZone.cmd];
    if (touchActionInput) {
      console.log(`[TOUCH_ACTION_INPUT] Found touchActionInput for cmd=${touchZone.cmd}`);
      window.pfodWebMouse.executeTouchActionInput.call(this, drawingName, touchZone.cmd, touchActionInput, col, row, touchType);
      return; // touchActionInput handles its own execution flow
    }

    // Execute touchAction if it exists for this cmd clears before starting
    window.pfodWebMouse.executeTouchAction.call(this, drawingName, touchZone.cmd, col, row, touchType);
    if (sendMsg) {
      // Build the command for the touchZone event
      // For touchZone actions, include col, row, touchType inside the command
      // Use dynamic identifier from calling context (this.currentIdentifier)
      const identifier = this.currentIdentifier;
      let touchZoneCmd = `{${identifier}~${touchZone.cmd}\`${col}\`${row}\`${touchType}}`;

      // Add version to command if available
      const savedVersion = localStorage.getItem(`${drawingName}_version`);
      console.log(`[TOUCH_ACTION_QUEUE] drawingName: ${drawingName}, savedVersion: "${savedVersion}"`);
      if (savedVersion !== null) {
        touchZoneCmd = '{' + savedVersion + ':' + touchZoneCmd.substring(1);
        console.log(`[TOUCH_ACTION_QUEUE] Added version to command: ${touchZoneCmd}`);
      }

      console.log(`[TOUCH_ACTION_QUEUE] command: ${touchZoneCmd}`);

      // Set up request options - will be corrected by addToRequestQueue for cross-origin
      const options = {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        mode: 'same-origin',
        credentials: 'same-origin',
        cache: 'no-cache'
      };

      // Add to the request queue with touchZone info for drag optimization.
      // sourceDwgName is the drawing the touched zone belongs to (stamped as
      // parentDrawingName when its drawing's response was processed).  The
      // response's dwg update carries no drawing identity and the cmd only
      // names the menu item, so the request carries the source dwg for the
      // response to be applied to.
      this.addToRequestQueue(touchZoneCmd, options, {
        cmd: touchZone.cmd,
        filter: touchType,
        sourceDwgName: touchZone.parentDrawingName
      }, 'touch');
    }
  },

  // Execute touchAction when touchZone is activated
  executeTouchAction: function(drawingName, cmd, col, row, touchType) {
    console.log(`[TOUCH_ACTION] executeTouchAction Checking for touchAction: drawing=${drawingName}, cmd=${cmd} touchType=${touchType}`);

    // REQUIREMENT: Always start from basic (untouched) drawing
    // Only make backup once - don't restore during drag operations

    // Get the touchAction for this cmd from merged data
    const touchActionsByCmdForDwg = window.pfodWebMouse.touchActionBackups.allTouchActionsByCmd[drawingName] || {};
    console.log(`[TOUCH_ACTION] Available touchActions for "${drawingName}":`, Object.keys(touchActionsByCmdForDwg));
    const touchActions = touchActionsByCmdForDwg[cmd];

    if (!touchActions || touchActions.length === 0) {
      console.log(`[TOUCH_ACTION] No touchAction found for cmd=${cmd}, drawing=${drawingName}`);
      return;
    }

    console.log(`[TOUCH_ACTION] Found touchAction with ${touchActions.length} actions for cmd=${cmd}, touchType=${touchType}`);
    console.log(`[TOUCH_ACTION] TouchActions for cmd=${cmd}:`, touchActions);

    

    // Get the backup before creating the pseudo response
    const backup = window.pfodWebMouse.touchActionBackups;
    console.log(`[TOUCH_ACTION] Backup exists:`, !!backup);
    if (backup) {
      const dwg = drawingName;
      console.log(`[TOUCH_ACTION] Backup contains for "${dwg}": unindexed=${backup.allUnindexedItems?.[dwg]?.length || 0}, indexed=${Object.keys(backup.allIndexedItemsByNumber?.[dwg] || {}).length}, touchZones=${Object.keys(backup.allTouchZonesByCmd?.[dwg] || {}).length}`);
    }
    
    // Create a pseudo update response with the touchAction items
    const backupIndexedForDwg = backup.allIndexedItemsByNumber[drawingName] || {};
    const pseudoUpdateResponse = {
      pfodDrawing: 'update',
      name: drawingName,
      items: touchActions.map(actionItem => {
        const item = JSON.parse(JSON.stringify(actionItem));

        if (item.idx !== undefined) {
          const backupIndexedItem = backupIndexedForDwg[item.idx];
          if (!backupIndexedItem) {
            console.error(`[TOUCH_ACTION] Processing touchAction but no dwg item for this index`, JSON.stringify(item,null,2));
            return null; // Return null for invalid items, they'll be filtered out
          }
          console.warn(`[TOUCH_ACTION] Processing touchAction to update `, JSON.stringify(backupIndexedItem,null,2));
          
          // Apply special touchZone values if they exist (support both string and numeric formats)
          if (item.xOffset === 'COL' || item.xOffset === TouchZoneSpecialValues.TOUCHED_COL) {
            item.xOffset = col;
            console.log(`[TOUCH_ACTION] Replaced xOffset COL with ${col}`);
          } else if (item.xOffset === 'ROW' || item.xOffset === TouchZoneSpecialValues.TOUCHED_ROW) {
            item.xOffset = row;
            console.log(`[TOUCH_ACTION] Replaced xOffset ROW with ${row}`);
          }
          if (item.yOffset === 'ROW' || item.yOffset === TouchZoneSpecialValues.TOUCHED_ROW) {
            item.yOffset = row;
            console.log(`[TOUCH_ACTION] Replaced yOffset ROW with ${row}`);
          } else if (item.yOffset === 'COL' || item.yOffset === TouchZoneSpecialValues.TOUCHED_COL) {
            item.yOffset = col;
            console.log(`[TOUCH_ACTION] Replaced yOffset COL with ${col}`);
          }

                    // Apply special touchZone values if they exist (support both string and numeric formats)
          if (item.xSize === 'COL' || item.xSize === TouchZoneSpecialValues.TOUCHED_COL) {
            item.xSize = col;
            console.log(`[TOUCH_ACTION] Replaced xSize COL with ${col}`);
          } else if (item.xSize === 'ROW' || item.xSize === TouchZoneSpecialValues.TOUCHED_ROW) {
            item.xSize = row;
            console.log(`[TOUCH_ACTION] Replaced xSize ROW with ${row}`);
          }
          if (item.ySize === 'ROW' || item.ySize === TouchZoneSpecialValues.TOUCHED_ROW) {
            item.ySize = row;
            console.log(`[TOUCH_ACTION] Replaced ySize ROW with ${row}`);
          } else if (item.ySize === 'COL' || item.ySize === TouchZoneSpecialValues.TOUCHED_COL) {
            item.ySize = col;
            console.log(`[TOUCH_ACTION] Replaced ySize COL with ${col}`);
          }

          // Apply special touchZone values for intValue if item is a value type
          if (item.type === 'value' && item.intValue !== undefined) {
            if (item.intValue === 'COL' || item.intValue === TouchZoneSpecialValues.TOUCHED_COL) {
              item.intValue = col;
              console.log(`[TOUCH_ACTION] Replaced intValue COL with ${col}`);
            } else if (item.intValue === 'ROW' || item.intValue === TouchZoneSpecialValues.TOUCHED_ROW) {
              item.intValue = row;
              console.log(`[TOUCH_ACTION] Replaced intValue ROW with ${row}`);
            }
          }

          // Add transform and clipRegion from backup
          item.transform = backupIndexedItem.transform;// || { x: 0, y: 0, scale: 1 };
          item.clipRegion = backupIndexedItem.clipRegion;// || { x: 0, y: 0, width: 100, height: 20 };
          
          console.log(`[TOUCH_ACTION] Processing touchAction as pseudo update `, JSON.stringify(item,null,2));
          return item;
          
        } else {
          console.error(`[TOUCH_ACTION] Processing touchAction but it has no index`, JSON.stringify(item,null,2));
          return null; // Return null for items without index
        }
      }).filter(item => item !== null)
    };

    console.log(`[TOUCH_ACTION] Processing touchAction as pseudo update with ${pseudoUpdateResponse.items.length} items`);

    // Create a working copy of the menuDwg's merged backup to apply touchAction
    // changes, then hand it to the renderer.  Field names match what
    // Redraw.redrawWithWorkingCopy expects (flat allXXX, single drawing).
    const workingCopy = {
      allUnindexedItems:       JSON.parse(JSON.stringify(backup.allUnindexedItems[drawingName]         || [])),
      allIndexedItemsByNumber: JSON.parse(JSON.stringify(backup.allIndexedItemsByNumber[drawingName]   || {})),
      allTouchZonesByCmd:      JSON.parse(JSON.stringify(backup.allTouchZonesByCmd[drawingName]        || {}))
    };
    console.log(`[TOUCH_ACTION_DEBUG] Created working copy for "${drawingName}" - unindexed: ${workingCopy.allUnindexedItems.length}, indexed keys: [${Object.keys(workingCopy.allIndexedItemsByNumber).join(', ')}], touchZones: [${Object.keys(workingCopy.allTouchZonesByCmd).join(', ')}]`);


    // Apply touchAction changes to the working copy using the processed items from pseudoUpdateResponse
    pseudoUpdateResponse.items.forEach(processedItem => {
      console.log(`[TOUCH_ACTION] Applying processed item to working copy:`, JSON.stringify(processedItem, null, 2));

      // Handle hide/unhide items specially - they modify target item visibility instead of replacing the item
      if (processedItem.idx !== undefined) {
        if (processedItem.type === 'hide' || processedItem.type === 'unhide') {
          const targetItem = workingCopy.allIndexedItemsByNumber[processedItem.idx];
          if (targetItem) {
            const newVisible = (processedItem.type === 'unhide');
            console.log(`[TOUCH_ACTION] ${processedItem.type === 'unhide' ? 'Unhiding' : 'Hiding'} item ${processedItem.idx}: setting visible from ${targetItem.visible} to ${newVisible}`);
            targetItem.visible = newVisible;
          } else {
            console.warn(`[TOUCH_ACTION] ${processedItem.type} operation: No item found with idx=${processedItem.idx} to ${processedItem.type === 'unhide' ? 'unhide' : 'hide'}`);
          }
        } else {
          // Normal item replacement for non-hide/unhide items
          workingCopy.allIndexedItemsByNumber[processedItem.idx] = processedItem;
          console.log(`[TOUCH_ACTION] Updated working copy indexed item ${processedItem.idx} with processed touchAction item`);
          console.log(`[TOUCH_ACTION_DEBUG] Working copy item ${processedItem.idx} after update:`, JSON.stringify(workingCopy.allIndexedItemsByNumber[processedItem.idx], null, 2));
        }
      }
    });


    // Trigger a redraw to show the touchAction effects using the new direct redraw method
    console.log(`[TOUCH_ACTION] Triggering redraw to display touchAction effects using working copy`);
    console.log(`[TOUCH_ACTION] Working copy contains: unindexed=${workingCopy.allUnindexedItems.length}, indexed=${Object.keys(workingCopy.allIndexedItemsByNumber).length}, touchZones=${Object.keys(workingCopy.allTouchZonesByCmd).length}`);
    this.redraw.redrawWithWorkingCopy(workingCopy, drawingName);
    console.log(`[TOUCH_ACTION] Redraw completed`);
  },

  // Execute touchActionInput - opens text dialog and handles response
  executeTouchActionInput: function(drawingName, cmd, touchActionInput, col, row, touchType) {
    console.log(`[TOUCH_ACTION_INPUT] Executing touchActionInput: cmd=${cmd}, prompt="${touchActionInput.prompt}", textIdx=${touchActionInput.textIdx}`);

    // Get initial text from textIdx if specified
    let initialText = '';
    if (touchActionInput.textIdx !== undefined && touchActionInput.textIdx !== null) {
      const indexedItems = window.pfodWebMouse.touchActionBackups.allIndexedItemsByNumber[drawingName] || {};
      const item = indexedItems[touchActionInput.textIdx];
      if (item && (item.type === 'label' || item.type === 'value')) {
        if (item.type === 'label') {
          // Generate label text using same utility as drawLabel and displayTextUtils
          initialText = addFormattedValueToText(item.text || '', item);
        } else if (item.type === 'value') {
          // For value items, get the displayed text (prefix + scaled value + units)
          const prefix = substituteUnsupportedUnitsGlyphs(item.text || '');
          const intValue = parseFloat(item.intValue || 0);
          const min = parseFloat(item.min || 0);
          const max = parseFloat(item.max || 1);
          const displayMin = parseFloat(item.displayMin || 0.0);
          const displayMax = parseFloat(item.displayMax || 1.0);
          const decimals = parseInt(item.decimals || 2);
          const units = substituteUnsupportedUnitsGlyphs(item.units || '');

          // Calculate scaled value using same logic as drawValue
          let maxMin = max - min;
          if (maxMin === 0) maxMin = 1;
          const scaledValue = (intValue - min) * (displayMax - displayMin) / maxMin + displayMin;

          initialText = prefix + printFloatDecimals(scaledValue, decimals) + units;
        }
        console.log(`[TOUCH_ACTION_INPUT] Retrieved initial text from textIdx ${touchActionInput.textIdx} (${item.type}): "${initialText}"`);
      } else {
        console.log(`[TOUCH_ACTION_INPUT] textIdx ${touchActionInput.textIdx} not found or not label/value, using blank text`);
      }
    }

    // Create and show text input dialog with formatting options
    const formatOptions = {
      fontSize: touchActionInput.fontSize,
      color: touchActionInput.color,
      backgroundColor: touchActionInput.backgroundColor
    };
    console.log(`[TOUCH_ACTION_INPUT] Format options:`, formatOptions);

    // Set flag to indicate touchActionInput dialog is open
    window.pfodWebMouse.touchActionInputOpen = true;
    console.log(`[TOUCH_ACTION_INPUT] Set touchActionInputOpen flag to true`);

    window.pfodWebMouse.showTextInputDialog.call(this, touchActionInput.prompt, initialText, formatOptions, (result, text) => {
      console.log(`[TOUCH_ACTION_INPUT] Dialog result: ${result}, text: "${text}"`);

      // Clear the dialog flag now that dialog has closed and we're processing the result
      window.pfodWebMouse.touchActionInputOpen = false;
      console.log(`[TOUCH_ACTION_INPUT] Cleared touchActionInputOpen flag`);

      if (result === 'ok') {
        // Build command with the edited text included
        // For touchActionInput, include col, row, touchType, and editedText inside the command
        // Use dynamic identifier from calling context (this.currentIdentifier)
        const identifier = this.currentIdentifier;
        let touchZoneCmd = `{${identifier}~${cmd}\`${col}\`${row}\`${touchType}~${text}}`;

        // Add version to command if available
        const savedVersion = localStorage.getItem(`${drawingName}_version`);
        console.log(`[TOUCH_ACTION_INPUT] drawingName: ${drawingName}, savedVersion: ${savedVersion}`);
        if (savedVersion !== null) {
          touchZoneCmd = '{' + savedVersion + ':' + touchZoneCmd.substring(1);
          console.log(`[TOUCH_ACTION_INPUT] Added version to command: ${touchZoneCmd}`);
        }

        console.log(`[TOUCH_ACTION_INPUT] command: ${touchZoneCmd}`);
        console.log(`[TOUCH_ACTION_INPUT] Sending request with edited text: ${touchZoneCmd}`);

        // Queue the request with proper headers
        const options = {
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          mode: 'same-origin',
          credentials: 'same-origin',
          cache: 'no-cache'
        };
        this.addToRequestQueue(touchZoneCmd, options, {
          cmd: cmd,
          filter: touchType
        }, 'touch');

        // After the text input is confirmed, run any other touchActions for this cmd
        // clears before starting to show actions
        window.pfodWebMouse.executeTouchAction.call(this, drawingName, cmd, col, row, touchType);
      } else {
        console.log(`[TOUCH_ACTION_INPUT] User cancelled text input, no request sent`);
        // Resume refresh after dialog closes if mouse is not down
        // The dialog closure does not trigger a mouse event, so we need to manually resume
        if (!this.touchState.isDown) {
          console.log(`[TOUCH_ACTION_INPUT] Resuming refresh after cancel (mouse not down)`);
          this.scheduleNextUpdate();
        } else {
          console.log(`[TOUCH_ACTION_INPUT] Mouse still down after cancel - refresh will resume on mouse up`);
        }
      }
    });
  },

  // Show text input dialog within canvas bounds
  showTextInputDialog: function(prompt, initialText, formatOptions, callback) {
    // Handle the case where formatOptions is actually the callback (backward compatibility)
    if (typeof formatOptions === 'function') {
      callback = formatOptions;
      formatOptions = {};
    }
    console.log(`[DIALOG] showTextInputDialog called with prompt="${prompt}", formatOptions:`, formatOptions);
    // Remove any existing dialog
    window.pfodWebMouse.hideTextInputDialog.call(this);

    // Get canvas bounds for positioning
    const canvasRect = this.canvas.getBoundingClientRect();

    // Calculate dialog position within canvas bounds - reduced width by half
    const dialogWidth = Math.min(250, canvasRect.width * 0.4);
    const dialogHeight = 'auto'; // Let content determine height
    const dialogX = canvasRect.left + (canvasRect.width - Math.min(250, canvasRect.width * 0.4)) / 2;
    const dialogY = canvasRect.top + (canvasRect.height * 0.3); // Position higher for better visibility

    // Create dialog container
    const dialog = document.createElement('div');
    dialog.style.position = 'fixed';
    dialog.style.left = dialogX + 'px';
    dialog.style.top = dialogY + 'px';
    dialog.style.width = dialogWidth + 'px';
    dialog.style.minWidth = '150px';
    dialog.style.maxWidth = '250px';
    dialog.style.height = 'auto';
    dialog.style.minHeight = '150px';
    dialog.style.backgroundColor = '#f0f0f0';
    dialog.style.border = '2px solid #666';
    dialog.style.borderRadius = '8px';
    dialog.style.padding = '15px';
    dialog.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
    dialog.style.zIndex = '1000';
    dialog.style.fontFamily = "'Roboto', Arial, sans-serif";
    dialog.style.fontSize = '14px';

    // Create title with formatting — inline pfod tags (<b>, <i>, <u>, <+N>, <-N>,
    // <colour>, <bw>) embedded in the prompt are parsed by pfodSetFormattedText so a
    // prompt like "A <+3>Large Text" renders mixed-size text.  Only <bg N> is parsed
    // up-front by webTranslator (it sets the title's element background, which has no
    // inline equivalent) and arrives here as formatOptions.backgroundColor.
    const title = document.createElement('div');
    title.style.padding = '10px';
    title.style.marginBottom = '10px';
    title.style.borderRadius = '4px';
    title.style.wordWrap = 'break-word';
    title.style.color = '#000';

    console.log(`[DIALOG] Applying formatting options:`, formatOptions);

    // Resolve title background — default white when no <bg N> was supplied
    let titleBgHex = '#ffffff';
    if (formatOptions.backgroundColor !== undefined) {
      try {
        titleBgHex = convertColorToHex(formatOptions.backgroundColor);
        console.log(`[DIALOG] Setting backgroundColor to ${titleBgHex} (from ${formatOptions.backgroundColor})`);
      } catch (error) {
        console.error(`[DIALOG] Error getting backgroundColor hex for ${formatOptions.backgroundColor}:`, error);
      }
    }
    title.style.backgroundColor = titleBgHex;

    // Contrast colour used by any inline <bw> tag in the prompt — chosen against
    // the title's background so <bw> text remains readable.
    const contrastHex = xtermColorToHex(getBlackWhite(titleBgHex));

    // Dialog font-size resolver: pixel-based, matching the dialog's fixed 14 px chrome.
    // (Buttons use the default vw-scaling resolver inside pfodSetFormattedText.)
    const dialogFontResolver = function(deltaSize) {
      return getActualFontSizeForDialog(deltaSize) + 'px';
    };

    // Render prompt with inline format tag support.  An empty / missing prompt is
    // tolerated — pfodSetFormattedText short-circuits on falsy input.
    pfodSetFormattedText(title, prompt, contrastHex, dialogFontResolver);

    dialog.appendChild(title);

    // Create text input
    const input = document.createElement('input');
    input.type = 'text';
    input.value = initialText;
    input.maxLength = 255;
    input.style.width = '100%';
    input.style.padding = '6px';
    input.style.fontSize = '14px';
    input.style.border = '1px solid #ccc';
    input.style.borderRadius = '4px';
    input.style.marginBottom = '10px';
    input.style.boxSizing = 'border-box';
    dialog.appendChild(input);

    // Create button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '10px';
    buttonContainer.style.justifyContent = 'space-between';

    // Create cancel button
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.padding = '8px 16px';
    cancelButton.style.border = '1px solid #666';
    cancelButton.style.borderRadius = '4px';
    cancelButton.style.backgroundColor = 'white';
    cancelButton.style.color = '#000';
    cancelButton.style.cursor = 'pointer';
    cancelButton.style.fontSize = '10px';

    // Create OK button with tick and blue background
    const okButton = document.createElement('button');
    okButton.textContent = '✓ OK';
    okButton.style.padding = '8px 16px';
    okButton.style.border = '1px solid #0066cc';
    okButton.style.borderRadius = '4px';
    okButton.style.backgroundColor = '#0066cc';
    okButton.style.color = 'white';
    okButton.style.cursor = 'pointer';
    okButton.style.fontSize = '10px';

    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(okButton);
    dialog.appendChild(buttonContainer);

    // Event handlers
    const handleOk = () => {
      const text = input.value;
      window.pfodWebMouse.hideTextInputDialog.call(this);
      callback('ok', text);
    };

    const handleCancel = () => {
      window.pfodWebMouse.hideTextInputDialog.call(this);
      callback('cancel', '');
    };

    okButton.addEventListener('click', handleOk);
    cancelButton.addEventListener('click', handleCancel);

    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleOk();
      }
    });

    // Add to page and focus
    document.body.appendChild(dialog);
    input.focus();
    input.select();

    // Store reference
    this.textInputDialog = dialog;
  },

  // Hide text input dialog
  hideTextInputDialog: function() {
    if (this.textInputDialog) {
      document.body.removeChild(this.textInputDialog);
      this.textInputDialog = null;
    }
    // DO NOT clear touchActionInputOpen flag here - it will be cleared in the callback handler
    // This allows flag to remain true while switching between dialogs
  },


};