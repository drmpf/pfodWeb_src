/*   
   drawingDataProcessor.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Drawing Data Processor — parses incoming pfod JSON drawing responses and populates
// a DrawingManager with items, touchZones, touchActions, and metadata.
//
// Exports:    window.DrawingDataProcessor class, window.TouchZoneFilters constants
// Depends on: webTranslator.js (translateRawRectangle and other item translators),
//             DrawingManager (passed via DrawingViewer.redraw.redrawDrawingManager)
// Called by:  pfodWeb.js constructor (new window.DrawingDataProcessor(this)),
//             drawingProcessing.js processDrawingData (delegates to this.drawingDataProcessor)

// TouchZone filter constants
const TouchZoneFilters = {
    TOUCH: 0,           // Touches blocked if pfodApp busy waiting for response
    DOWN: 1,            // Queued if pfodApp busy waiting for response
    DRAG: 2,            // Queued if pfodApp busy waiting for response
    UP: 4,              // Queued if pfodApp busy waiting for response
    CLICK: 8,           // Queued if pfodApp busy waiting for response
    PRESS: 16,          // Long press - queued if pfodApp busy waiting for response
    ENTRY: 32,          // NEVER sent to pfodApp
    EXIT: 64,           // NEVER sent to pfodApp
    DOWN_DRAG_UP: 256,       // Msg not sent until finger removed (UP) but updates touchAction alias for DOWN_UP
    TOUCH_DISABLED: 512 // Capture touch to prevent scroll but do not send msg
};

// Decode method to convert filter numbers to array of filter names
TouchZoneFilters.decode = function(filterNumber) {
    // Handle TOUCH (value 0) first
    if (filterNumber === 0) {
        return ['TOUCH'];
    }
    
    // TOUCH_DISABLED has special handling - only return itself, no other values
    if (filterNumber === 512) {
        return ['TOUCH_DISABLED'];
    }
    
    const result = [];
    
    // Check each filter value (excluding TOUCH and TOUCH_DISABLED which are handled above)
    for (const [name, value] of Object.entries(TouchZoneFilters)) {
        if (name !== 'decode' && value !== 0 && value !== 512 && (filterNumber & value) === value) {
            result.push(name);
        }
    }
    
    return result;
};

// make all cmd: array
class DrawingDataProcessor {
    constructor(pfodWebInstance) {
        this.pfodWeb = pfodWebInstance;
    }
    
    isEmptyCmd(cmd) {
      if (!cmd) {
        return false
      }
      if (cmd.length < 2) {
        return false;
      }
      let cmd0 = cmd[0].trim();
      let cmd1 = cmd[1].trim();
      if ((cmd0 == '{') && (cmd1 == '}')){
        console.log(`[DRAWING_DATA] Received empty cmd response `);
        return true; // Successfully handled - no drawing data to process
      }
      return false;
    }
      
    // Main processing function for drawing data
    processDrawingData(data, drawingManager, savedData, requestType = 'unknown') {
        // Handle empty cmd responses (e.g., from touchZone requests)
        let cmd = data.cmd;
        if (cmd) {
          if (cmd.length < 2) {
            console.log(`[DRAWING_DATA] Received response with less than 2 elements of cmds (requestType: ${requestType})`);
            return; // Successfully handled - no drawing data to process
          }
          if (this.isEmptyCmd(cmd)) {
            console.log(`[DRAWING_DATA] Received empty cmd response - no action needed (requestType: ${requestType})`);
            // need to restore from touchaction
            return; // Successfully handled - no drawing data to process
          }            
          let msgType = cmd[0]; // take top on
          let result = null;
          if (msgType.startsWith("{+")) {
              result = window.translateDwgResponse(cmd);
              result.raw_items = cmd; // the rest of the commands are the raw_items for processing below
              result.name = data.name;
          }
          // Menu shapes ({,/{;}) never reach this path — they're routed to
          // handleNonDwgResponse → processMenuResponse (which calls pfodParseMenu)
          // by the dwg-vs-non-dwg classifier in requestQueue.processRequestQueue.
          // Only {+...} dwg responses arrive here.
          console.log(`[DRAWING_DATA] After tranlation::`, JSON.stringify(result, null, 2));

          // Merge translation output into the original data object rather
          // than reassigning the local variable.  Reassigning would make
          // subsequent writes (e.g. data._pendingInserts further down)
          // invisible to the caller, which still holds the original data
          // reference — Object.assign mutates in place so any later field
          // we set on `data` is visible in requestQueue.processRequestQueue
          // / processPendingResponses for the deferred-insertDwg drain.
          if (result) {
            Object.assign(data, result);
          }
        }
        // then continue to handle json version
         
        // need to handle {"cmd":["{+...", ... ]
        
        console.log(`Processing drawing data: ${data.pfodDrawing} command for ${data.name} (requestType: ${requestType})`);

        const drawingName = data.name;
        // Merged-update flag — set on 'update' responses whose items use the
        // menuDwg's merged idx/cmd space rather than a component drawing's
        // per-drawing-raw collections.  Only touch-style requests
        // (touch/drag/partialSlider) WITHOUT a source dwg take this path now
        // (e.g. touchActionInput submits).  Source-routed touch responses
        // (data._sourceDwgRouted, set in handleDwgResponse) are applied to
        // the source dwg's per-drawing-raw collections like a refresh update
        // and re-merged, so the new state survives later re-merges.
        // The four drawing-fetch types (menuItemDwg/insertDwg/refresh/
        // refresh-insertDwg) write to per-drawing-raw and re-merge.  'start'
        // commands are always per-drawing-raw — they replace a whole drawing
        // rather than patch the merged view.
        const isMergedUpdate =
            (data.pfodDrawing === 'update') &&
            (requestType === 'touch' || requestType === 'drag' || requestType === 'partialSlider') &&
            !data._sourceDwgRouted;
        
        // Check if this is a touch-triggered request that should replace a drawing
        // Only touch-triggered requests can cause complete drawing replacement when data.pfodDrawing === 'start'
        if (requestType === 'touch' && data.pfodDrawing === 'start') {
            console.log(`[TOUCH_REPLACEMENT] Touch request returned start response for "${drawingName}"`);
            
            // Check if drawingName matches any current drawing (main or inserted)
            const drawingIndex = drawingManager.drawings.indexOf(drawingName);
            
            if (drawingIndex >= 0) {
                // Drawing found in current drawings - completely replace that specific drawing
                console.log(`[TOUCH_REPLACEMENT] Found "${drawingName}" at index ${drawingIndex} - completely replacing it`);
                // The drawing data will be updated in the normal processing flow below
            } else {
                // Drawing not found - completely replace main drawing and clear all inserted drawings
                console.log(`[TOUCH_REPLACEMENT] "${drawingName}" not found in current drawings - completely starting fresh`);
                
                // Clear tracking + per-drawing/per-menuDwg cache entries
                // for every drawing in the old tree.  The touch caused the
                // device to switch to a brand-new drawing context, so the
                // old tree's cached state is no longer relevant — leaving
                // the localStorage entries behind would leak quota over
                // long sessions and resurrect stale state if a future
                // navigation happens to reuse one of these drawing names.
                const connId = (typeof getConnectionIdentifier === 'function')
                    ? getConnectionIdentifier(this.pfodWeb.connectionManager) : null;
                drawingManager.drawings.forEach(dwgName => {
                    this.pfodWeb.requestTracker.touchRequests.delete(dwgName);
                    this.pfodWeb.requestTracker.insertDwgRequests.delete(dwgName);
                    if (connId) {
                        localStorage.removeItem(`pfodWeb_dwg_${connId}_${dwgName}`);
                        localStorage.removeItem(`pfodWeb_menuDwg_${connId}_${dwgName}`);
                        console.log(`[TOUCH_REPLACEMENT] Cleared per-drawing + per-menuDwg cache for "${dwgName}" (conn=${connId})`);
                    }
                });
                
                // Wipe the live DrawingManager in place — caller passes the
                // viewer's redraw.redrawDrawingManager, which can't be replaced
                // by reassignment from inside this function.
                console.log(`[TOUCH_REPLACEMENT] Resetting DrawingManager in place`);
                drawingManager.reset();
                drawingManager.initialize(drawingName);

                // Update page title with new main drawing name
                document.title = `pfodWeb ${drawingName}`;

                console.log(`[TOUCH_REPLACEMENT] Started completely fresh with main drawing "${drawingName}"`);
            }
        }
        // Handle error responses first
        if (data.pfodDrawing === 'error') {
            console.log(`[ERROR] Drawing error received for "${drawingName}": ${data.error} - ${data.message}`);
            
            // If drawing not found, clear any saved version to prevent future requests with invalid version
            if (data.error === 'drawing_not_found') {
                console.log(`[ERROR] Clearing saved version for non-existent drawing "${drawingName}"`);
                localStorage.removeItem(`${drawingName}_version`);
                localStorage.removeItem(`${drawingName}_data`);
            }
            
            // Delegate to error handler
            this.pfodWeb.handleDrawingError(data);
            return;
        }
        
        // If this is a start command, initialize with new data
        if (data.pfodDrawing === 'start') {

            // A 'start' response must have a drawingName.  Without one,
            // setDrawingData would push null into drawings[] and corrupt
            // the refresh loop into sending '{null}' on every cycle.
            // This typically signals that a menu-refresh request
            // ({V1:.}) was answered with an unexpected drawing-start
            // payload — drop it rather than silently corrupting state.
            if (!drawingName) {
                console.error(`[DRAWING_DATA] 'start' response with null drawingName — dropping; data=`, JSON.stringify(data).slice(0, 300));
                return;
            }

            // Ensure x and y are within valid range (1-255)
            const x = Math.min(Math.max(data.x || 50, 1), 255);
            const y = Math.min(Math.max(data.y || 50, 1), 255);
        
            // Handle color validation - accept both numbers and string numbers
            let colorValue = data.color;
            if (typeof colorValue === 'string' && !isNaN(colorValue)) {
                console.log(`[COLOR_CONVERSION] Converting string color "${colorValue}" to number ${parseInt(colorValue)}`);
                colorValue = isNaN(parseInt(colorValue))? 0 : parseInt(colorValue);
            }
            const validColor = (typeof colorValue === 'number' && ((colorValue >= 0 && colorValue <= 255) || colorValue === -1)) ? colorValue : 0;
            console.log(`[COLOR_VALIDATION] Original color: ${data.color} (${typeof data.color}) -> Final color: ${validColor}`);

            const drawingData = {
                name: data.name,
                version: data.version,
                x: x,
                y: y,
                color: validColor, // Default to white (15) if invalid
                // Ensure refresh value is properly handled - 0 is a valid value
                refresh: data.refresh !== undefined ? data.refresh : 0
            };
            
            // Set the drawing data in the manager
            drawingManager.setDrawingData(drawingName, drawingData);

            // For touch/drag/partialSlider/unknown, error-log when the menu
            // item identified by the request cmd has no loadCmd — receiving a
            // drawing-shape response for a non-dwg menu item is a device error.
            if (requestType === 'touch' || requestType === 'drag'
             || requestType === 'partialSlider' || requestType === 'unknown') {
                const resolvedLoadCmd = this.pfodWeb._resolveLoadCmdFromRequest(
                    this.pfodWeb.sentRequest);
                if (!resolvedLoadCmd) {
                    console.error(`[QUEUE_MISMATCH] ${requestType} returned a {+ drawing-shape start but the menu item identified by the cmd has no loadCmd — drawingName="${drawingName}"`);
                }
            }

            // Stamp itemRefreshTimes — 'start' responses carry the refresh
            // field in drawingData.refresh.  rate>0 → Date.now(); rate==0 → null.
            this.pfodWeb.itemRefreshTimes.set(
                drawingName,
                drawingData.refresh > 0 ? Date.now() : null);

            console.log(`[REFRESH] Initialized drawing: ${data.name}, size=${x}x${y}, refresh=${drawingData.refresh}ms, version=${data.version}`);
            
            // 'start' replaces the drawing entirely.  Cascade-remove every
            // drawing whose parent is this one — they belonged to the prior
            // version of the drawing and the new version may not reference
            // them.  Iterate a snapshot since removal mutates dm.drawings.
            const childDrawings = drawingManager.drawings.filter(name =>
                drawingManager.drawingsData[name]?.parentDrawing === drawingName);
            for (const insertedDrawingName of childDrawings) {
                console.log(`Removing previously inserted drawing ${insertedDrawingName} as part of start command for ${drawingName}`);
                this.pfodWeb.removeInsertedDrawing(insertedDrawingName);
            }
            
            
            // Initialize or reset arrays for this drawing
            drawingManager.clearItems(drawingName);
            
        // Save the version and data - handle empty/blank/undefined versions
            // If version is undefined, empty or all blanks, set to empty string
            console.log(`[VERSION_DEBUG] Processing start data for ${data.name}:`, data);
            console.log(`[VERSION_DEBUG] data.version = "${data.version}", type = ${typeof data.version}`);
            // Per-drawing cache write happens at the end of this function
            // (after items have been processed into the per-drawing raw
            // collections), so the cache reflects the full populated state.
        }
       // If this is an update, apply changes to existing data
        else if (data.pfodDrawing === 'update') {
            let drawingData;

            if (isMergedUpdate) {
                // Build a virtual drawingData carrying the menuItemDwg's
                // bounds/color so the rest of the update path has
                // dimensions to work with.
                if (!drawingName) {
                  throw new Error('[MERGED_UPDATE] merged update needs an owner drawingName but got none — request must name the menuItemDwg whose merged collections receive the update');
                }
                const ownerForBounds = drawingName;
                console.log(`[MERGED_UPDATE] Getting merged data for ${requestType} update (owner=${ownerForBounds})`);
                drawingData = {
                    items: [], // Will be populated from update
                    x: drawingManager.drawingsData[ownerForBounds].data.x,
                    y: drawingManager.drawingsData[ownerForBounds].data.y,
                    color: drawingManager.drawingsData[ownerForBounds].data.color
                };
            } else {
                // Normal drawing request - get individual drawing data
                drawingData = drawingManager.getDrawingData(drawingName);
            }
            
            if (!drawingData) {
                // If we have saved data, try to use it
                if (savedData) {
                    console.log('No active drawing data, using saved data from localStorage');
                    drawingData = JSON.parse(savedData);
                
                    // Ensure saved data also respects the 1-255 limit
                    drawingData.x = Math.min(Math.max(drawingData.x, 1), 255);
                    drawingData.y = Math.min(Math.max(drawingData.y, 1), 255);
                    console.log(`Restored drawing from localStorage: ${drawingData.name}, size=${drawingData.x}x${drawingData.y}`);
                
                    // Set the loaded data in the manager
                    drawingManager.setDrawingData(drawingName, drawingData);
                } else {                
                    console.error('Received update without initial data');
                    throw new Error('Received update without initial data');
                }
            }  
            // Store original dimensions and color before processing update
            const originalX = drawingData.x;
            const originalY = drawingData.y;
            const originalColor = drawingData.color;
            const originalVer = drawingData.version;
            
            // Create updated drawing data
            const updatedData = { ...drawingData };
            
            // Update refresh interval if provided
            if (data.refresh !== undefined) {
                console.log(`[REFRESH] Updating refresh rate for ${drawingName}: ${updatedData.refresh}ms -> ${data.refresh}ms`);
                updatedData.refresh = data.refresh;
            }
            
            // Preserve dimensions and color
            console.log(`Preserving dimensions (${originalX}x${originalY}) and color (${originalColor}) from previous data`);
            updatedData.x = originalX;
            updatedData.y = originalY;
            updatedData.color = originalColor;
            
            // Handle version updates - preserve existing version if not provided
            console.log(`[VERSION_DEBUG] Processing update data for ${data.name}:`, data);
            console.log(`[VERSION_DEBUG] data.version = "${data.version}", type = ${typeof data.version}`);
            if (data.version !== undefined && data.version !== null) {
                const normalizedVersion = data.version.trim() ? data.version : '';
                console.log(`Updating version from "${originalVer}" to "${normalizedVersion}"`);
                updatedData.version = normalizedVersion;
            } else {
                console.log(`Version not provided in update - keeping existing version "${originalVer}"`);
                updatedData.version = originalVer;
            }
            
            if (isMergedUpdate) {
                // Items have been written straight into the menuDwg's merged
                // collections (allXXX[name]) above.  No individual-drawing
                // update or re-merge needed.
                console.log(`[MERGED_UPDATE] Updated menuDwg merged collections directly, no individual drawing updates, no merge needed`);
            } else {
                // Normal drawing request - update individual drawing data.
                // Per-drawing cache write fires at the end of this function
                // after all items are processed into the raw collections.
                drawingManager.setDrawingData(drawingName, updatedData);
            }

            // Stamp itemRefreshTimes — {+|... and {+} update bodies carry NO
            // refresh field, but DO count as "we got a response".  Use the
            // preserved rate (drawingsData[drawingName].data.refresh, set by
            // the prior 'start') so auto-refresh keeps ticking off the most
            // recent response.  rate>0 → Date.now(); rate==0 → null.
            //
            // For touch/drag/partialSlider, also error-log when the menu item
            // identified by the request cmd has no loadCmd — receiving a
            // drawing-shape response for a non-dwg menu item is a device error.
            if (drawingName) {
                if (requestType === 'touch' || requestType === 'drag'
                 || requestType === 'partialSlider' || requestType === 'unknown') {
                    const resolvedLoadCmd = this.pfodWeb._resolveLoadCmdFromRequest(
                        this.pfodWeb.sentRequest);
                    if (!resolvedLoadCmd) {
                        console.error(`[QUEUE_MISMATCH] ${requestType} returned a {+ drawing-shape update but the menu item identified by the cmd has no loadCmd — drawingName="${drawingName}"`);
                    }
                }
                const preservedRate = drawingManager.drawingsData[drawingName]?.data?.refresh || 0;
                this.pfodWeb.itemRefreshTimes.set(
                    drawingName,
                    preservedRate > 0 ? Date.now() : null);
            }
        }
        else {
           this.pfodWeb.handleDrawingError({
                  error: 'response_invalid',
                  message: `Response to load drawing "${drawingName}" returned neither start or update, returned ${data.pfodDrawing}`,
                  pfodDrawing: 'error'
            });
           return;
       }
       // end if start else update
        
        // Reset the transformation state based on command type
        // Initialize local transform stack
        let transformStack = [];
        let currentTransform; //

        // Set up local collection variables based on request type
        let targetIndexedItems, targetTouchZones, targetTouchActions, targetTouchActionInputs, targetUnindexedItems;

        if (isMergedUpdate) {
            // Merged-update writes go into the menuItemDwg's merged
            // collections (the allXXX[menuItemDwg] entries).  Per the
            // data model, every idx / loadCmd / touchZone cmd key in the
            // merged view is unique across the whole merged tree, so
            // partial updates apply cleanly without needing to know which
            // component drawing each item came from.  Owner = request
            // .drawingName (the menuItemDwg explicitly named on the
            // touch request) — REQUIRED, no fallback.
            if (!drawingName) {
                throw new Error('[drawingDataProcessor] merged update requires an owner drawingName (the menuItemDwg whose allXXX collections receive the merged write)');
            }
            const ownerDrawing = drawingName;
            // Lazy-init each allXXX entry for this menuDwg if the merger hasn't
            // run yet — the merged write must have something to land on.
            if (!drawingManager.allUnindexedItems[ownerDrawing])         drawingManager.allUnindexedItems[ownerDrawing]         = [];
            if (!drawingManager.allIndexedItemsByNumber[ownerDrawing])   drawingManager.allIndexedItemsByNumber[ownerDrawing]   = {};
            if (!drawingManager.allTouchZonesByCmd[ownerDrawing])        drawingManager.allTouchZonesByCmd[ownerDrawing]        = {};
            if (!drawingManager.allTouchActionsByCmd[ownerDrawing])      drawingManager.allTouchActionsByCmd[ownerDrawing]      = {};
            if (!drawingManager.allTouchActionInputsByCmd[ownerDrawing]) drawingManager.allTouchActionInputsByCmd[ownerDrawing] = {};

            console.log(`[MERGED_UPDATE] Routing merged writes to menuDwg "${ownerDrawing}" (requestType=${requestType})`);
            targetIndexedItems      = drawingManager.allIndexedItemsByNumber[ownerDrawing];
            targetTouchZones        = drawingManager.allTouchZonesByCmd[ownerDrawing];
            targetTouchActions      = drawingManager.allTouchActionsByCmd[ownerDrawing];
            targetTouchActionInputs = drawingManager.allTouchActionInputsByCmd[ownerDrawing];
            targetUnindexedItems    = drawingManager.allUnindexedItems[ownerDrawing];
        } else {
            // Normal request - use individual drawing collections
            console.log(`[NORMAL_UPDATE] Using individual drawing collections for drawing: ${drawingName}`);
            if (!drawingManager.unindexedItems[drawingName]) {
                throw new Error(`[drawingDataProcessor] drawing "${drawingName}" not initialized in drawingManager`);
            }
            targetIndexedItems = drawingManager.indexedItems[drawingName];
            targetTouchZones = drawingManager.touchZonesByCmd[drawingName];
            targetTouchActions = drawingManager.touchActionsByCmd[drawingName];
            targetTouchActionInputs = drawingManager.touchActionInputsByCmd[drawingName];
            targetUnindexedItems = drawingManager.unindexedItems[drawingName];
        }

        // Set the initial transform
        if (data.pfodDrawing === 'start') {
            // For 'start' commands, reset to initial state
            currentTransform = { x: 0, y: 0, scale: 1.0 };
            console.log(`[TRANSFORM] Using initial transform (0,0,1.0) for drawing start: ${drawingName}`);
        } else if (data.pfodDrawing === 'update' && drawingManager.savedTransforms[drawingName]) {
            // For 'update' commands, use the saved transform if available
            currentTransform = {...drawingManager.savedTransforms[drawingName]};
            console.log(`[TRANSFORM] Using saved transform for update: x=${currentTransform.x}, y=${currentTransform.y}, scale=${currentTransform.scale}`);
        } else {
            // Default fallback
            currentTransform = { x: 0, y: 0, scale: 1.0 };
            console.log(`[TRANSFORM] No saved transform found, using default (0,0,1.0)`);
        }
                
        // Process drawing items if they exist (either items or raw_items)
        let itemsToProcess = [];
        
        if (data.raw_items && Array.isArray(data.raw_items)) {
            console.log(`Processing ${data.raw_items.length} raw drawing items - translating to items format`);
            // Translate raw_items to items format using translator
            try {
                const translatedData = window.translateRawItemsToItemArray(data);
                itemsToProcess = translatedData.items;
                console.log(`Successfully translated ${data.raw_items.length} raw items to ${itemsToProcess.length} processed items`);
            } catch (error) {
                console.error('Failed to translate raw_items:', error.message);
                throw new Error(`Failed to translate raw_items: ${error.message}`);
            }
        } else if (data.items && Array.isArray(data.items)) {
            console.log(`Processing ${data.items.length} drawing items`);
            itemsToProcess = data.items;
        }
        
        if (itemsToProcess.length > 0) {
            
            // For update commands, if items array is empty, don't process anything (no changes)
            // but still need to redraw to show the restored state
            if (data.pfodDrawing === 'update' && itemsToProcess.length === 0) {
                console.log(`Update command has empty items array - no changes to apply, but triggering redraw`);
                // Still need to trigger redraw and continue with normal flow
            }
            

            itemsToProcess.forEach(item => {
            // Validate and normalize item color to integer (0-255)
            if (item.color !== undefined) {
                let colorValue = item.color;
                
// Handle string numbers (like "9", "82" from ESP32)
                if (typeof colorValue === 'string' && !isNaN(colorValue)) {
                  console.log(`[COLOR_CONVERSION] Converting string color "${colorValue}" to number ${parseInt(colorValue)}`);
                  colorValue = isNaN(parseInt(colorValue))? 0 : parseInt(colorValue);
                }                                   
               
                if (typeof colorValue === 'number' && ((colorValue >= 0 && colorValue <= 255) || colorValue === -1)) {
                    item.color = Math.floor(colorValue); // Ensure integer (-1 for Black/White mode, 0-255 for regular colors)
                } else {
                    item.color = 0; // Default to black for invalid colors
                }
            }
            
            // Add a processing flag to each item (assume valid by default)
            let skipProcessing = false;
                
            // Validate item
            if (!item.type) {
                console.error('Item missing type property:', item);
                skipProcessing = true;
            }
                
            // Debug log for each item
            console.log(`Processing item: type=${item.type}, properties:`, JSON.stringify(item));
            // Check if hide, unhide, or erase has valid idx or cmd
            if ((item.type === 'hide' || item.type === 'unhide' || item.type === 'erase')) {
                // For erase, allow either idx or cmd
                    if (!item.idx && !item.cmd) {
                        console.error(`Error: ${item.type} item has neither idx nor cmd, ignoring item:`, JSON.stringify(item));
                        skipProcessing = true;
                    } else if (item.idx && (item.idx < 1)) {
                        console.error(`Error: ${item.type} item has idx < 1, ignoring item:`, JSON.stringify(item));
                        skipProcessing = true;
                    }
            }
            
            // Handle push and pop first to maintain transformation state (all local)
                
            // Store a copy of the current transform with the item
            item.transform = {...currentTransform};
            // Set visible property to true by default
            if (item.visible === undefined) {
                item.visible = true;
            }

                
                if (item.type === 'pushZero') {
                // Save current transform to stack
                transformStack.push({...currentTransform});
                    
                 // Default missing properties
                 const x = item.x !== undefined ? parseFloat(item.x) : 0;
                 const y = item.y !== undefined ? parseFloat(item.y) : 0;
                 const scale = item.scale !== undefined ? parseFloat(item.scale) : 1.0;
                    
                 // Apply the push transform to current transform
                 currentTransform.x += x * currentTransform.scale;
                 currentTransform.y += y * currentTransform.scale;
                 currentTransform.scale *= scale;
                    
                 console.log(`[TRANSFORM] Push for ${drawingName}: New transform (${currentTransform.x}, ${currentTransform.y}, ${currentTransform.scale})`);
                    
                 // Skip adding push items to any collection
                 skipProcessing = true;
                 } else if (item.type === 'popZero') {
                 // Get previous transform from stack
                 if (transformStack.length > 0) {
                     const oldTransform = {...currentTransform};
                     currentTransform = transformStack.pop();
                     console.log(`[TRANSFORM] Pop for ${drawingName}: Restored from (${oldTransform.x}, ${oldTransform.y}, ${oldTransform.scale}) to (${currentTransform.x}, ${currentTransform.y}, ${currentTransform.scale})`);
                 } else {
                     // If stack is empty, reset to initial state
                     const oldTransform = {...currentTransform};
                     currentTransform = { x: 0, y: 0, scale: 1.0 };
                     console.warn(`[TRANSFORM] Pop for ${drawingName}: Stack empty, reset to default (0,0,1.0)`);
                 }
                    
                 // Skip adding pop items to any collection
                 skipProcessing = true;
             } // end push pop
                
             // Apply default values based on item type
             if (item.type === 'rectangle') {
                 // Default missing properties
                 item.xOffset = item.xOffset !== undefined ? item.xOffset : 0;
                 item.yOffset = item.yOffset !== undefined ? item.yOffset : 0;
                 item.xSize = item.xSize !== undefined ? item.xSize : 1;
                 item.ySize = item.ySize !== undefined ? item.ySize : 1;
                 item.filled = item.filled === 'true' || item.filled === true;
                 item.rounded = item.rounded === 'true' || item.rounded === true;
                 console.log('Processed rectangle with defaults:', JSON.stringify(item));
                
            } else if (item.type === 'line') {
                // Default missing properties
                item.xOffset = item.xOffset !== undefined ? item.xOffset : 0;
                item.yOffset = item.yOffset !== undefined ? item.yOffset : 0;
                item.xSize = item.xSize !== undefined ? item.xSize : 1;
                item.ySize = item.ySize !== undefined ? item.ySize : 1;
                console.log('Processed line with defaults:', JSON.stringify(item));
                
            } else if (item.type === 'insertDwg' ) { //|| item.type.toLowerCase() === 'insertdwg') {
                // Always ensure insertDwg items have null index - they should NEVER be indexed
                if (item.idx && item.idx !== 'null') {
                    console.warn(`Warning: insertDwg item for "${item.drawingName}" has idx=${item.idx}, nulling it as insertDwg should never be indexed`);
                    item.idx = 'null';
                }                
                // Normalize the type to insertDwg for consistency
                item.type = 'insertDwg';
                
            } else if (item.type === 'touchZone') {
                // Default missing properties
                item.xOffset = item.xOffset !== undefined ? item.xOffset : 0;
                item.yOffset = item.yOffset !== undefined ? item.yOffset : 0;
                item.xSize = item.xSize !== undefined ? item.xSize : 1;
                item.ySize = item.ySize !== undefined ? item.ySize : 1;
                item.filter = item.filter !== undefined ? parseInt(item.filter) : TouchZoneFilters.TOUCH;
                item.centered = item.centered !== undefined ? item.centered : 'false';
                // idx is handled in the touchZone processing logic below, not here
                if (!item.cmd || item.cmd.trim().length === 0) {
                    throw new Error(`[drawingDataProcessor] touchZone has empty or missing cmd in drawing "${data.name}": ${JSON.stringify(item)}`);
                }
                console.log('Processed touchZone with defaults:', JSON.stringify(item));
                
            } else if (item.type === 'touchAction') {
                // Default missing properties
                item.action = item.action !== undefined ? item.action : [];

                if (!item.cmd || item.cmd.trim().length === 0) {
                    throw new Error(`[drawingDataProcessor] touchAction has empty or missing cmd in drawing "${data.name}": ${JSON.stringify(item)}`);
                }
                console.log('Processed touchAction with defaults:', JSON.stringify(item));
                
            } else if (item.type === 'label') {
                // Default missing properties for label
                item.xOffset = item.xOffset !== undefined ? item.xOffset : 0;
                item.yOffset = item.yOffset !== undefined ? item.yOffset : 0;
                item.text = item.text !== undefined ? item.text : '';
                item.fontSize = item.fontSize !== undefined ? item.fontSize : 0;
                item.bold = item.bold === 'true' || item.bold === true;
                item.italic = item.italic === 'true' || item.italic === true;
                item.underline = item.underline === 'true' || item.underline === true;
                item.align = item.align !== undefined ? item.align : 'left'; // default alignment when not specified
                // Handle new optional properties (value, units, decimals) - no defaults needed as they're optional
                if (item.value !== undefined && item.value !== null && item.value !== '') {
                    item.value = parseFloat(item.value);
                }
                if (item.decimals !== undefined && item.decimals !== null && item.decimals !== '') {
                    item.decimals = parseInt(item.decimals);
                }
                // item.units stays as-is (string) - no conversion needed
                console.log('Processed label with defaults:', JSON.stringify(item));
                
            } else if (item.type === 'value') {
                // Default missing properties for value
                item.xOffset = item.xOffset !== undefined ? item.xOffset : 0;
                item.yOffset = item.yOffset !== undefined ? item.yOffset : 0;
                item.text = item.text !== undefined ? item.text : '';
                item.fontSize = item.fontSize !== undefined ? item.fontSize : 0;
                item.bold = item.bold === 'true' || item.bold === true;
                item.italic = item.italic === 'true' || item.italic === true;
                item.underline = item.underline === 'true' || item.underline === true;
                item.align = item.align !== undefined ? item.align : 'left'; // default alignment when not specified
                item.intValue = item.intValue !== undefined ? item.intValue : 0;
                item.max = item.max !== undefined ? item.max : 1;
                item.min = item.min !== undefined ? item.min : 0;
                item.displayMax = item.displayMax !== undefined ? item.displayMax : 1.0;
                item.displayMin = item.displayMin !== undefined ? item.displayMin : 0.0;
                item.decimals = (item.decimals !== undefined && item.decimals !== null && item.decimals !== '') ? parseInt(item.decimals) : 2;
                item.units = item.units !== undefined ? item.units : '';
                console.log('Processed value with defaults:', JSON.stringify(item));
                
            } else if (item.type === 'circle') {
                // Default missing properties for circle
                item.xOffset = item.xOffset !== undefined ? item.xOffset : 0;
                item.yOffset = item.yOffset !== undefined ? item.yOffset : 0;
                item.radius = item.radius !== undefined ? item.radius : 1;
                item.filled = item.filled === 'true' || item.filled === true;
                console.log('Processed circle with defaults:', JSON.stringify(item));
                
            } else if (item.type === 'arc') {
                // Default missing properties for arc
                item.xOffset = item.xOffset !== undefined ? item.xOffset : 0;
                item.yOffset = item.yOffset !== undefined ? item.yOffset : 0;
                item.radius = item.radius !== undefined ? item.radius : 1;
                item.filled = item.filled === 'true' || item.filled === true;
                item.start = item.start !== undefined ? item.start : 0;
                item.angle = item.angle !== undefined ? item.angle : 90;
                
                // Normalize start and angle to be within -360 to +360 range
                item.start = item.start % 360;
                if (item.start > 360) item.start -= 360;
                if (item.start < -360) item.start += 360;
                
                item.angle = item.angle % 360;
                if (item.angle > 360) item.angle -= 360;
                if (item.angle < -360) item.angle += 360;
                
                console.log('Processed arc with defaults:', JSON.stringify(item));
                
            } else if (item.type === 'index') {
                // Check if idx is less than 1 (invalid)
                if (item.idx < 1) {
                    console.error('Error: Index item has idx < 1, ignoring item:', JSON.stringify(item));
                    skipProcessing = true; // Flag to skip adding this item to collections
                } else {
                    const idx = item.idx;
                    const indexedItems = drawingManager.getIndexedItems(drawingName);
                    if (indexedItems[idx]) {
                      console.log(`Processing index item with idx=${item.idx} - already have item with that idx so skip processing this`);
                      skipProcessing = true; // Flag to skip adding this item to collections
                    } else {
                      // For valid index items, save transform data
                      console.log(`Processing index item with idx=${item.idx} - saving transform/clipping data for later use`);
                    }
                }
                // Handle index items with cmdName (touchZone items)  
                if (item.cmdName && item.cmdName.trim() !== '') {
                    const cmd = item.cmd || '';
                    if (cmd.trim().length > 0) {
                        // Check if there's already a touchZone with this cmd
                        const existingTouchZone = drawingManager.touchZonesByCmd[drawingName] && 
                                                drawingManager.touchZonesByCmd[drawingName][cmd];
                        if (existingTouchZone) {
                            console.log(`Processing index item with cmdName="${item.cmdName}" cmd="${cmd}" - already exists, skipping`);
                            skipProcessing = true;
                        } else {
                            console.log(`Processing index item with cmdName="${item.cmdName}" cmd="${cmd}" - will be added as touchZone placeholder`);
                        }
                    }
                }
            } // end not hide / unhide / erase
            
            // Process control items (hide, unhide, erase, push, pop) BEFORE checking skipProcessing
            // These should always be processed but never added to item collections
            if (item.type === 'hide' || item.type === 'unhide' || item.type === 'erase') {
                
                if (item.type === 'erase') {
                    // For erase items, handle both idx and cmd
                    if (item.idx) {
                        // Erase by index
                        const idx = item.idx;
                        const indexedItems = drawingManager.getIndexedItems(drawingName);
                        
                        if (indexedItems[idx]) {
                            delete drawingManager.indexedItems[drawingName][idx];
                            console.log(`Erased item with index ${idx}`);
                        } else {
                            console.warn(`Erase operation: No item found with idx=${idx} to erase`);
                        }
                    } else if (item.cmd) {
                        if (item.drawingName !== undefined) {
                         drawingManager.eraseByCmd(drawingName, item.cmd, item.drawingName);
                         console.log(`Erased insertDwg and actions with cmd="${item.cmd}"`);
                       } else {
                        // Erase by cmd - removes touchZone and all associated actions
                        drawingManager.eraseByCmd(drawingName, item.cmd);
                        console.log(`Erased touchZone and actions with cmd="${item.cmd}"`);
                       }
                    }
                    // Skip adding erase items to any collection
                    skipProcessing = true;
                } else {
                    // For hide/unhide, handle both idx and cmd
                    if (item.idx) {
                        // Hide/unhide by index - affects indexed items only (ignore touchZones)
                        const idx = item.idx;
                        const indexedItems = drawingManager.getIndexedItems(drawingName);
                        const targetItem = indexedItems[idx];
                        
                        if (targetItem) {
                            // Set the visible property based on hide/unhide type
                            targetItem.visible = item.type === 'unhide';
                            console.log(`${item.type === 'unhide' ? 'Unhiding' : 'Hiding'} item with index ${idx}`);
                        } else {
                            console.warn(`${item.type} operation: No item found with idx=${idx} to ${item.type === 'unhide' ? 'unhide' : 'hide'}`);
                        }
                    } else if (item.cmd) {
                        // Hide/unhide by cmd - affects touchZones and insertDwg items only
                        if (item.type === 'hide') {
                            if (item.drawingName !== undefined) {
                            drawingManager.hideByCmd(drawingName, item.cmd,item.drawingName);
                            console.log(`Hidden touchZone and insertDwg items with cmd="${item.cmd}"`);
                            } else {
                            drawingManager.hideByCmd(drawingName, item.cmd);
                            console.log(`Hidden touchZone and insertDwg items with cmd="${item.cmd}"`);
                            }
                        } else if (item.type === 'unhide') {
                            if (item.drawingName !== undefined) {
                            drawingManager.unhideByCmd(drawingName, item.cmd,item.drawingName);
                            console.log(`Unhidden touchZone and insertDwg items with cmd="${item.cmd}"`);
                            } else {
                            drawingManager.unhideByCmd(drawingName, item.cmd);
                            console.log(`Unhidden touchZone and insertDwg items with cmd="${item.cmd}"`);
                            }
                        }
                    }
                    // Skip adding hide/unhide items to any collection
                    skipProcessing = true;
                }
            }
                
           // Only proceed with normal item processing if not already marked to skip
           if (!skipProcessing) {
              // The drawing this item belongs to is data.name — the drawing
              // whose response we are processing.  insertDwg items in
              // particular store their entry on this drawing's unindexed
              // items list (the parent), not on the inserted target drawing.
              const itemDrawingName = data.name;
              item.parentDrawingName = itemDrawingName;
              drawingManager.ensureItemCollections(itemDrawingName);

              // Special handling for insertDwg items
              if (item.type === 'insertDwg') { // || (item.type && item.type.toLowerCase() === 'insertdwg')) {
                    // For insertDwg items, we MUST use the current drawing name
                    // NOT the drawingName specified in the item (which is the target drawing to insert)
                    const currentDrawing = data.name;
                    
                    // Ensure the collections exist for the current drawing
                    drawingManager.ensureItemCollections(currentDrawing);
                    
                    // Normalize type to camelCase for consistency
                    item.type = 'insertDwg';                    
                                        
                    // Add to the current drawing's unindexed items
                    targetUnindexedItems.push(item);
                    console.log(`Added insertDwg item for "${item.drawingName}" with transform (${item.transform.x},${item.transform.y},${item.transform.scale}) to drawing=${currentDrawing}, visible=${item.visible}`);
              // Check if this is a touchZone or index item with cmdName
              } else if (item.type === 'touchZone' || (item.type === 'index' && item.cmdName && item.cmdName.trim() !== '')) {
                    // Only process filter for actual touchZone items, not index items
                    if (item.type === 'touchZone') {
                        // Check if there's an associated touchActionInput for this cmd
                        if (item.cmd && item.cmd.trim().length > 0) {
                            const existingTouchActionInput = targetTouchActionInputs[item.cmd];
                            if (existingTouchActionInput) {
                                // If touchActionInput exists, filter can only be TOUCH or TOUCH_DISABLED
                                if (item.filter !== TouchZoneFilters.TOUCH && item.filter !== TouchZoneFilters.TOUCH_DISABLED) {
                                    console.log(`[TOUCH_ZONE] Constraining updated touchZone filter from ${item.filter} to TOUCH for cmd=${item.cmd} due to existing touchActionInput`);
                                    item.filter = TouchZoneFilters.TOUCH;
                                }
                            }
                        }
                    }
                    
                    // Add the touchZone to the target collection.
                    // If a touchZone with this cmd already exists, carry over its transform,
                    // parentDrawingName and clipRegion — the incoming item has no pushZero context
                    // (touch updates never have it; regular {+ updates omit it when the full
                    // drawing was originally loaded with pushZero positioning).
                    const existingTZ = targetTouchZones[item.cmd];
                    if (existingTZ) {
                        item.transform = existingTZ.transform;
                        item.parentDrawingName = existingTZ.parentDrawingName;
                        item.clipRegion = existingTZ.clipRegion;
                    }
                    targetTouchZones[item.cmd] = item;
                    console.log(`Added touchZone: cmd=${item.cmd}, filter=${item.filter}, idx=${item.idx || 0}, drawing=${itemDrawingName}`);
                   // this.drawingManager.unindexedItems[itemDrawingName].push(item);
                   // console.log(`Added unindexed item: type=${item.type}, drawing=${itemDrawingName}, visible=${item.visible !== false}`);
                    
              // Check if this is a touchAction
              } else if (item.type === 'touchAction') {
                    // Add the touchAction to the target collection
                    // Initialize actions array if it doesn't exist for this cmd
                    if (!targetTouchActions[item.cmd]) {
                        targetTouchActions[item.cmd] = [];
                    }
                    // Append the action items to existing actions array instead of replacing
                    if (item.action && Array.isArray(item.action)) {
                        targetTouchActions[item.cmd].push(...item.action);
                    }
                    console.log(`Added touchAction: cmd=${item.cmd}, actions=${(item.action || []).length}, drawing=${itemDrawingName}`);
                    // touchActions are not added to unindexed/indexed items - they're stored separately
                    
              // Check if this is a touchActionInput
              } else if (item.type === 'touchActionInput') {
                    // Add the touchActionInput to the target collection
                    targetTouchActionInputs[item.cmd] = item;
                    console.log(`Added touchActionInput: cmd=${item.cmd}, prompt="${item.prompt}", textIdx=${item.textIdx}, drawing=${itemDrawingName}`);
                    // touchActionInputs are not added to unindexed/indexed items - they're stored separately
                    
              // Normal processing for other items
              } else if (item.idx && item.idx !== 'null') {
                  // For non-touchZone items, handle as regular indexed items
                  const idx = item.idx;                        
                  // Get the current indexed items for this drawing
                  const isUpdate = targetIndexedItems[idx] !== undefined;
                  // Add the item to the target indexed items collection
                  if (isUpdate) {
                   item.transform = targetIndexedItems[idx].transform;// || { x: 0, y: 0, scale: 1 };
                   item.clipRegion = targetIndexedItems[idx].clipRegion;// || { x: 0, y: 0, width: 100, height: 20 };
                   // Preserve visibility state from existing item
                   item.visible = targetIndexedItems[idx].visible;
                  }

                  targetIndexedItems[idx] = item;

                  console.log(`${isUpdate ? 'Updated' : 'Added'} indexed item: type=${item.type}, drawing=${itemDrawingName}, idx=${idx}, visible=${item.visible !== false}`);
              } else {
                  // Unindexed items
                  // For non-touchZone items, add to the drawing's unindexed items array
                  // Ensure the collections exist for the drawing before adding the item
                  // This is especially important for insertDwg items which refer to other drawings
                  // Add to target unindexed items collection
                  targetUnindexedItems.push(item);
                  console.log(`Added unindexed item: type=${item.type}, drawing=${itemDrawingName}, visible=${item.visible !== false}`);
               }
            } // if (!skipProcessing)
        });
        // Log summary of items
        console.log(`Drawing ${data.name} now has ${targetUnindexedItems.length} unindexed items, ${Object.keys(targetIndexedItems).length} indexed items,  ${Object.keys(targetTouchZones).length} touchZones`);
        if (targetUnindexedItems.length > 0) {
            console.log('Unindexed item types:', targetUnindexedItems.map(i => i.type).join(', '));
        }
        if (Object.keys(targetIndexedItems).length > 0) {
            console.log('Indexed item types:', Object.values(targetIndexedItems).map(i => i.type).join(', '));
        }
    } // if (data.items && Array.isArray(data.items))

    if (drawingName !== null) {
        console.log(`Set response status to TRUE for "${drawingName}"`);
        drawingManager.drawingResponseStatus[drawingName] = true;
    } else {
        console.log(`Skipping response status update for touchAction request (null drawingName)`);
    }
        
    // Check for insertDwg items and add them to the request queue
    console.log(`Scanning for insertDwg items in ${targetUnindexedItems.length} unindexed items of drawing ${data.name}`);
    // Debug: full dump of unindexed items array for this drawing
    console.log(`[DEBUG] Raw unindexed items array for ${data.name}:`, JSON.stringify(targetUnindexedItems));
    // Find insertDwg items in unindexed items
    const insertDwgItems = targetUnindexedItems.filter(item =>
        item.type && (
            //item.type.toLowerCase() === 'insertdwg' ||
            item.type === 'insertDwg'
        ));

        // Debugging detailed info about each unindexed item
    console.log(`[DEBUG] Detailed unindexed items for drawing ${data.name}:`);
    targetUnindexedItems.forEach((item, index) => {
        console.log(`- Item ${index}: type=${item.type}, drawingName=${item.drawingName || 'none'}, would match insertDwg filter: ${(item.type === 'insertDwg' || (item.type && item.type.toLowerCase() === 'insertdwg'))}`);
        // Print full item for better debugging
        console.log(`  Full item ${index}:`, JSON.stringify(item));
    });

    const indices = Object.keys(targetIndexedItems);
    indices.forEach(idx => {
        const itemWithIndex = targetIndexedItems[idx];
        const drawingSource = itemWithIndex.parentDrawingName || 'unknown';
        console.log(`[PROCESS_DATA] Drawing indexed item ${idx} of type ${itemWithIndex.type} from ${drawingSource}`);
        if (itemWithIndex.transform) {
            console.log(`[PROCESS_DATA] Indexed item transform: x=${itemWithIndex.transform.x}, y=${itemWithIndex.transform.y}, scale=${itemWithIndex.transform.scale}`);
        } else {
            console.log(`[PROCESS_DATA] Indexed item has no transform!`);
        }
    });
    
    let foundInsertDwgItems = false;

    // Collect THIS response's insertDwg items here — DO NOT call
    // handleInsertDwg inline.
    //
    // Calling handleInsertDwg → addToRequestQueue → processRequestQueue
    // synchronously while we're still mid-response-processing creates a
    // re-entrant path that can pull a child request from the queue and
    // assign it as a new sentRequest while the original response is still
    // being processed.  When the original response's COMPLETED handler
    // subsequently runs `this.sentRequest = null` it then clobbers the
    // child's reference and the queue gets stuck.
    //
    // Stash items on data._pendingInserts.  The caller — requestQueue's
    // processRequestQueue or drawingProcessing.processPendingResponses —
    // drains them via handleInsertDwg AFTER this response's processing is
    // fully finished but BEFORE clearing sentRequest, so each
    // addToRequestQueue's internal processRequestQueue call early-skips
    // (sentRequest still points at the current request) and items pile
    // into the queue without firing timer schedules.  Then sentRequest is
    // cleared and processRequestQueue runs once at the tail to drive the
    // next request.
    //
    // Each response only collects its OWN direct insertDwgs.  Nesting is
    // not expanded here — when c2's response arrives, c2's scan collects
    // c2's own inserts (if any) the same way.
    data._pendingInserts = [];
    if (insertDwgItems.length > 0) {
        foundInsertDwgItems = true;
        console.log(`Collected ${insertDwgItems.length} insertDwg items from drawing ${data.name} for deferred queueing`);
        insertDwgItems.forEach(item => {
            // Check for and null any idx on insertDwg items
            if (item.idx && item.idx !== 'null') {
                console.log(`Warning: insertDwg item for "${item.drawingName}" has idx=${item.idx}, nulling it as insertDwg should not have an idx.`);
                item.idx = 'null';
            }
            console.log(`Deferred insertDwg item for drawing "${item.drawingName}" at offsets (${item.xOffset || 0}, ${item.yOffset || 0})`);
            data._pendingInserts.push(item);
        });
    } else {
        console.log(`No insertDwg items found in unindexed items of drawing ${data.name}`);
    }
        
    // Save the current transform for this drawing at the end of processing
    // This will be used as the starting transform for updates
    if (drawingName !== null) {
        drawingManager.saveTransform(drawingName, currentTransform);
        console.log(`[TRANSFORM] Saved transform for drawing "${data.name}": x=${currentTransform.x}, y=${currentTransform.y}, scale=${currentTransform.scale}`);
    } else {
        console.log(`[TRANSFORM] TouchAction request - no transform save needed for merged data update`);
    }

    // Persist this drawing's per-drawing raw + data + version to the
    // per-drawing cache.  Skipped on merged-update path (touch / null
    // drawingName) — those don't change per-drawing raw, so the per-drawing
    // cache for the involved component drawings is unaffected.
    if (!isMergedUpdate && drawingName) {
        try {
            const connectionId = (typeof getConnectionIdentifier === 'function')
                ? getConnectionIdentifier(this.pfodWeb.connectionManager) : null;
            if (connectionId) {
                drawingManager.saveDrawingDataToStorage(drawingName, connectionId);
            }
        } catch (e) {
            console.warn(`[DRAWING_DATA_PROCESSOR] Could not save per-drawing cache for "${drawingName}":`, e.message);
        }
    }

        // DrawingDataProcessor populates the live redrawDrawingManager's
        // per-drawing raw collections.  The caller (requestQueue or
        // processPendingResponses) runs DrawingMerger + redraw.performRedraw
        // once the response batch settles.

        // If we found insertDwg items, we'll let the queue process them and do the redraw
        // when all items are processed. Otherwise, redraw immediately.
        const _sr = this.pfodWeb.sentRequest;
        const _srDesc = _sr ? `${_sr.cmd}(${_sr.requestType})#${_sr._id}` : 'none';
        console.log(`[REDRAW_DECISION] foundInsertDwgItems=${foundInsertDwgItems}, requestQueue.length=${this.pfodWeb.requestQueue.length}, isProcessingQueue=${this.pfodWeb.isProcessingQueue()}, sentRequest=${_srDesc}, drawingName=${drawingName}`);
        // Defer redraw if there are pending requests in the queue OR if we're actively processing a request OR if there's a sent request
        // This ensures all drawings are processed before attempting a final redraw
        if (this.pfodWeb.requestQueue.length > 0 || this.pfodWeb.isProcessingQueue() || this.pfodWeb.sentRequest) {
            console.log(`[REDRAW_DECISION] Deferring redraw for ${drawingName} - queue length: ${this.pfodWeb.requestQueue.length}, processing: ${this.pfodWeb.isProcessingQueue()}, sentRequest: ${_srDesc}`);
            // We'll still update the state, but defer redraw to the queue completion
        } else {
            // Queue is empty, not processing, and no sent request - redraw now
            console.log(`[REDRAW_DECISION] Queue empty, not processing, no sent request after ${drawingName}, redrawing immediately`);
            drawingManager.allDrawingsReceived = true; // this is not actually used!!
        }

        // Enable updates and start update loop only after complete processing.
        this.pfodWeb.isUpdating = true;
    }
}

// Export for use in other modules
// Make classes available globally for class definition access
// IMPORTANT: Only pfodWeb should create instances of these classes
// Other modules should use the instances provided by pfodWeb
window.DrawingDataProcessor = DrawingDataProcessor;
window.TouchZoneFilters = TouchZoneFilters;