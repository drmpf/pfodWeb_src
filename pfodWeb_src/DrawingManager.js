/*   
   DrawingManager.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// DrawingManager — centralized per-drawing data store: items, touchZones, touchActions,
// metadata, and the ordered drawings array for inserted-drawing support.
//
// Exports:    window.DrawingManager class
// Depends on: nothing (standalone, no external dependencies)
// Called by:  redraw.js (has its own this.redrawDrawingManager instance — the
//                        single live drawing-state instance for the viewer),
//             drawingMerger.js (reads all drawing collections),
//             drawingDataProcessor.js (populates collections)



class DrawingManager {
    constructor() {
        // Per-drawing RAW collections — these are the merger's INPUTS, where
        // drawingDataProcessor lands incoming items.  Last-received-wins
        // semantics for unindexed are enforced by addUnindexedLastWins below;
        // keyed maps (indexed by idx, touchZones/touchActions/touchActionInputs
        // by cmd) accumulate per-key-assign naturally.
        this.touchZonesByCmd        = {}; // {drawingName: {cmd: item}}
        this.touchActionsByCmd      = {}; // {drawingName: {cmd: actionArray}}
        this.touchActionInputsByCmd = {}; // {drawingName: {cmd: {prompt, textIdx}}}
        this.unindexedItems         = {}; // {drawingName: [items]}
        this.indexedItems           = {}; // {drawingName: {idx: item}}

        // Per-menuDwg MERGED items, produced by DrawingMerger.mergeAllDrawings()
        // and consumed by redraw.performRedrawInMode() in menu-mode.  Each
        // entry is the result of merging the drawing tree rooted at the named
        // menuDwg — every `insertDwg` reference recursively expanded into the
        // target drawing's items, transforms composed.  This is what redraw
        // displays for each menu canvas; the raw per-drawing collections
        // above are the merger's INPUTS only.
        //
        // For a menu item rooted at c1 that contains insertDwgs c2 and c3,
        // there will be one entry (key "c1") in each of the five maps below
        // holding the fully-expanded merge of c1+c2+c3.
        //
        // Format for each: {menuDwgName: <collection>}
        this.allTouchZonesByCmd        = {}; // {menuDwg: {cmd: item}}
        this.allTouchActionsByCmd      = {}; // {menuDwg: {cmd: actions[]}}
        this.allTouchActionInputsByCmd = {}; // {menuDwg: {cmd: input}}
        this.allUnindexedItems         = {}; // {menuDwg: [items]}
        this.allIndexedItemsByNumber   = {}; // {menuDwg: {idx: item}}
        
        // Track all drawings including main and inserted ones
        this.drawings = []; // Array of drawing names in order, with main drawing first
        this.drawingsData = {}; // Format: {drawingName: {xOffset, yOffset, transform, data, parentDrawing}}
        
        // Flag to track if all drawings have been received
        this.allDrawingsReceived = false; // this is not actually used!!
        
        // Only store the last transform for drawing updates
        this.savedTransforms = {}; // Format: {drawingName: {x, y, scale}}
        
        // Track response status for each drawing
        this.drawingResponseStatus = {}; // Format: {drawingName: boolean} - true if response received, false if pending

        // Global display transform for merged canvas; set by setGlobalTransform() before use
        this.globalTransform = { x: 0, y: 0, scale: 1.0 };

        // No auto-load on construction.  The cache uses connectionId-keyed
        // entries (pfodWeb_dwg_<conn>_<dwg> and pfodWeb_menuDwg_<conn>_<menuDwg>)
        // so callers explicitly hydrate per-drawing/per-menuDwg state via
        // loadDrawingDataFromStorage / loadMenuDwgMergedFromStorage with the
        // active connectionId.
    }
    
    // Initialize the manager with a drawing name
    initialize(drawingName) {
        // Add the main drawing as the first entry in the drawings array
        if (!this.drawings.includes(drawingName)) {
            this.drawings.unshift(drawingName);
        }
        
        if (!this.touchZonesByCmd[drawingName]) {
            this.touchZonesByCmd[drawingName] = {};
        }
        if (!this.touchActionsByCmd[drawingName]) {
            this.touchActionsByCmd[drawingName] = {};
        }
        if (!this.touchActionInputsByCmd[drawingName]) {
            this.touchActionInputsByCmd[drawingName] = {};
        }
        // Initialize collections for the drawing if they don't exist
        if (!this.unindexedItems[drawingName]) {
            this.unindexedItems[drawingName] = [];
        }
        if (!this.indexedItems[drawingName]) {
            this.indexedItems[drawingName] = {};
        }
        
        // Initialize saved transform to identity so getTransform() never needs a fallback
        if (!this.savedTransforms[drawingName]) {
            this.savedTransforms[drawingName] = { x: 0, y: 0, scale: 1.0 };
        }

        console.log(`DrawingManager initialized with drawing: ${drawingName}`);
        return this;
    }
    
    // Get the saved transform for a drawing
    // This is only used for restoring the last saved transform for updates
    getSavedTransform(drawingName) {
        if (!this.savedTransforms[drawingName]) {
            throw new Error(`[DRAWING_MANAGER] getSavedTransform: no saved transform for drawing "${drawingName}"`);
        }
        return this.savedTransforms[drawingName];
    }
    
    // Save the current transform for a drawing
    // This is used only to store the final transform for the next update
    saveTransform(drawingName, transform) {
        this.savedTransforms[drawingName] = { ...transform };
        return this;
    }
    
    // Get the drawing data for a specific drawing
    getDrawingData(drawingName) {
        return this.drawingsData[drawingName]?.data;
    }
    
    // Set drawing data for a drawing
    setDrawingData(drawingName, data) {
        // Ensure drawingsData entry exists
        if (!this.drawingsData[drawingName]) {
            this.drawingsData[drawingName] = {
                xOffset: 0,
                yOffset: 0,
                transform: { x: 0, y: 0, scale: 1.0 },
                data: null,
                parentDrawing: null
            };
            
            // If this is a new drawing, add it to the drawings array
            if (!this.drawings.includes(drawingName)) {
                this.drawings.push(drawingName);
            }
        }
        
        // Update the data
        this.drawingsData[drawingName].data = data;
        this.drawingsData[drawingName].name = drawingName;
        this.drawingResponseStatus[drawingName] = true;
        
        // Ensure there are item collections for this drawing
        this.ensureItemCollections(drawingName);
        
        console.log(`DrawingManager: Set data for drawing ${drawingName}`);
        return this;
    }
    
    // Update drawing data (partial update)
    updateDrawingData(drawingName, updates) {
        if (!this.drawingsData[drawingName]) {
            this.drawingsData[drawingName] = {
                xOffset: 0,
                yOffset: 0,
                transform: { x: 0, y: 0, scale: 1.0 },
                data: {},
                parentDrawing: null
            };
            
            // If this is a new drawing, add it to the drawings array
            if (!this.drawings.includes(drawingName)) {
                this.drawings.push(drawingName);
            }
        }
        
        const currentData = this.drawingsData[drawingName].data;
        this.drawingsData[drawingName].data = { ...currentData, ...updates };
        this.drawingResponseStatus[drawingName] = true;
        
        console.log(`DrawingManager: Updated data for drawing ${drawingName}`);
        return this;
    }
    
    // Add an item to a drawing
    addItem(drawingName, item) {
        // Ensure the item collections exist
        this.ensureItemCollections(drawingName);

        // Apply current transform to the item
        if (!item.transform) {
            item.transform = {...this.getTransform(drawingName)};
        }

        // Handle indexed vs. unindexed items
        if (item.idx && item.idx !== 'null') {
            const idx = item.idx;
            // Per-idx assign already gives "last received wins" — overwrites
            // any prior item with the same idx, leaves untouched indices alone.
            this.indexedItems[drawingName][idx] = item;
            return this;
        }

        // Non-indexed items go through the dedup helper so re-receiving the
        // same item (same loadcmd for insertDwg, or same attribute fingerprint
        // for everything else) doesn't accumulate duplicates.
        DrawingManager.addUnindexedLastWins(this.unindexedItems[drawingName], item);
        return this;
    }

    // Identity key used to dedupe unindexed items.  insertDwg items collide
    // on their loadcmd (cmd) regardless of transform/offset; all other types
    // collide on a stable JSON of their attributes (excluding transient
    // render fields like clipRegion / parentDrawingName which are added
    // later by the merger and would otherwise prevent a stable match).
    static unindexedKey(item) {
        if (item && item.type === 'insertDwg') {
            return 'insertDwg:' + (item.cmd || item.drawingName || '');
        }
        const stripped = {};
        for (const k in item) {
            if (k === 'clipRegion' || k === 'parentDrawingName') continue;
            stripped[k] = item[k];
        }
        return 'attrs:' + JSON.stringify(stripped);
    }

    // "Last received wins" insert into an unindexed list:
    //   * insertDwg with matching loadcmd → REPLACE the old one IN PLACE
    //     (preserves draw order so re-receiving an insertDwg with a new
    //     transform doesn't reshuffle surrounding shapes).
    //   * Any other type with matching attribute fingerprint → REMOVE the
    //     old entries and APPEND the new one at end (so the latest copy
    //     draws last and overlays earlier matches).
    //   * No matching entry → APPEND at end.
    //
    // Static so DrawingMerger can use the same canonical implementation
    // when populating allUnindexedItems[menuDwg].
    static addUnindexedLastWins(list, item) {
        const isInsertDwg = item && item.type === 'insertDwg';
        const key = DrawingManager.unindexedKey(item);

        if (isInsertDwg) {
            for (let i = 0; i < list.length; i++) {
                if (DrawingManager.unindexedKey(list[i]) === key) {
                    list[i] = item;          // in-place replace, position preserved
                    return;
                }
            }
            list.push(item);                  // first time → append
            return;
        }

        // Non-insertDwg: drop existing matches, append the newcomer at end.
        for (let i = list.length - 1; i >= 0; i--) {
            if (DrawingManager.unindexedKey(list[i]) === key) {
                list.splice(i, 1);
            }
        }
        list.push(item);
    }
    
    // Process a touchZone item
    addTouchZone(drawingName, touchZone) {
        // Ensure the item has a drawing name
        touchZone.drawingName = drawingName;
        const cmd = touchZone.cmd;
        if (!cmd || cmd.trim().length === 0) {
            throw new Error(`[DRAWING_MANAGER] addTouchZone: empty or missing cmd in drawing "${drawingName}": ${JSON.stringify(touchZone)}`);
        }
 
        // Check if there's already an existing item (could be index item) with this cmd
        const existingItem = this.touchZonesByCmd[drawingName] && this.touchZonesByCmd[drawingName][cmd];
        
        if (existingItem) {
            // Preserve transform and visibility state from existing item (likely an index item)
            touchZone.transform = existingItem.transform;
            touchZone.visible = existingItem.visible !== undefined ? existingItem.visible : touchZone.visible;
            console.log(`[DRAWING_MANAGER] Preserving state from existing item for cmd="${cmd}": visible=${touchZone.visible}, transform=(${touchZone.transform.x},${touchZone.transform.y},${touchZone.transform.scale})`);
        } else {
            // Apply current transform if not already set
            if (!touchZone.transform) {
                touchZone.transform = {...this.getTransform(drawingName)};
            }
        }
        
        // Add to the touchZones map - cmd is unique reference
        this.touchZonesByCmd[drawingName][touchZone.cmd] = touchZone;
        
        return this;
    }

    // Process a touchAction item
    addTouchAction(drawingName, touchAction) {
        const cmd = touchAction.cmd;
        if (!cmd || cmd.trim().length === 0) {
            throw new Error(`[DRAWING_MANAGER] addTouchAction: empty or missing cmd in drawing "${drawingName}": ${JSON.stringify(touchAction)}`);
        }
        console.log(`[DRAWING_MANAGER] Adding touchAction: cmd=${cmd}, drawingName=${drawingName}`);

        // Check if there's a touchZone with the same cmd in this drawing
        if (!this.touchZonesByCmd[drawingName] || !this.touchZonesByCmd[drawingName][cmd]) {
            throw new Error(`[DRAWING_MANAGER] addTouchAction: cmd="${cmd}" has no corresponding touchZone in drawing "${drawingName}". TouchActions must be positioned AFTER their touchZone.`);
        }
        
        // Ensure the collections exist
        this.ensureItemCollections(drawingName);
        
        // Initialize actions array if it doesn't exist for this cmd
        if (!this.touchActionsByCmd[drawingName][cmd]) {
            this.touchActionsByCmd[drawingName][cmd] = [];
        }
        
        // Append the action items to existing actions array instead of replacing
        if (touchAction.action && Array.isArray(touchAction.action)) {
            this.touchActionsByCmd[drawingName][cmd].push(...touchAction.action);
        }
        
        console.log(`[DRAWING_MANAGER] TouchAction added successfully: cmd=${cmd}, actions=${touchAction.action.length}, drawingName=${drawingName}`);
        return true;
    }

    // Get touchActions for a specific cmd
    getTouchAction(drawingName, cmd) {
        if (!this.touchActionsByCmd[drawingName]) {
            throw new Error(`[DRAWING_MANAGER] getTouchAction: drawing "${drawingName}" not initialized`);
        }
        if (!this.touchActionsByCmd[drawingName][cmd]) {
            throw new Error(`[DRAWING_MANAGER] getTouchAction: no touchActions for cmd "${cmd}" in drawing "${drawingName}"`);
        }
        return this.touchActionsByCmd[drawingName][cmd];
    }

    // Add touchActionInput for a specific cmd
    addTouchActionInput(drawingName, touchActionInput) {
        const cmd = touchActionInput.cmd;
        if (!cmd || cmd.trim().length === 0) {
            throw new Error(`[DRAWING_MANAGER] addTouchActionInput: empty or missing cmd in drawing "${drawingName}": ${JSON.stringify(touchActionInput)}`);
        }
        console.log(`[DRAWING_MANAGER] Adding touchActionInput: cmd=${cmd}, drawingName=${drawingName}`);

        // Check if there's a touchZone with the same cmd in this drawing
        if (!this.touchZonesByCmd[drawingName] || !this.touchZonesByCmd[drawingName][cmd]) {
            throw new Error(`[DRAWING_MANAGER] addTouchActionInput: cmd="${cmd}" has no corresponding touchZone in drawing "${drawingName}". TouchActionInputs must be positioned AFTER their touchZone.`);
        }
        
        // Ensure the collections exist
        this.ensureItemCollections(drawingName);
        
        // Store the touchActionInput - overwrites any existing touchActionInput with same cmd
        this.touchActionInputsByCmd[drawingName][cmd] = {
            prompt: touchActionInput.prompt,
            textIdx: touchActionInput.textIdx,
            fontSize: touchActionInput.fontSize !== undefined ? touchActionInput.fontSize : 0,
            color: touchActionInput.color !== undefined ? touchActionInput.color : 0,
            backgroundColor: touchActionInput.backgroundColor !== undefined ? touchActionInput.backgroundColor : 0
        };
        
        // Force touchZone filter to TOUCH when touchActionInput is present, but only if not TOUCH_DISABLED
        const touchZone = this.touchZonesByCmd[drawingName][cmd];
        if (touchZone && touchZone.filter !== TouchZoneFilters.TOUCH && touchZone.filter !== TouchZoneFilters.TOUCH_DISABLED) {
            console.log(`[DRAWING_MANAGER] Forcing touchZone filter from ${touchZone.filter} to TOUCH for cmd=${cmd} due to touchActionInput`);
            touchZone.filter = TouchZoneFilters.TOUCH;
        }
        
        console.log(`[DRAWING_MANAGER] TouchActionInput added successfully: cmd=${cmd}, prompt="${touchActionInput.prompt}", textIdx=${touchActionInput.textIdx}, drawingName=${drawingName}`);
        return true;
    }

    // Get touchActionInput for a specific cmd
    getTouchActionInput(drawingName, cmd) {
        if (!this.touchActionInputsByCmd[drawingName]) {
            throw new Error(`[DRAWING_MANAGER] getTouchActionInput: drawing "${drawingName}" not initialized`);
        }
        if (!this.touchActionInputsByCmd[drawingName][cmd]) {
            throw new Error(`[DRAWING_MANAGER] getTouchActionInput: no touchActionInput for cmd "${cmd}" in drawing "${drawingName}"`);
        }
        return this.touchActionInputsByCmd[drawingName][cmd];
    }
    
    // Get touchZones dict for a drawing
    getTouchZonesByCmd(drawingName) {
        if (!this.touchZonesByCmd[drawingName]) {
            throw new Error(`[DRAWING_MANAGER] getTouchZonesByCmd: drawing "${drawingName}" not initialized`);
        }
        return this.touchZonesByCmd[drawingName];
    }
    
    // Clear items for a drawing
    clearItems(drawingName) {
        this.unindexedItems[drawingName] = [];
        this.indexedItems[drawingName] = {};
        this.touchZonesByCmd[drawingName] = {};
        this.touchActionsByCmd[drawingName] = {};
        this.touchActionInputsByCmd[drawingName] = {};
        return this;
    }
    
    // Get all unindexed items for a drawing
    getUnindexedItems(drawingName) {
        if (!this.unindexedItems[drawingName]) {
            throw new Error(`[DRAWING_MANAGER] getUnindexedItems: drawing "${drawingName}" not initialized`);
        }
        return this.unindexedItems[drawingName];
    }

    // Get all indexed items for a drawing
    getIndexedItems(drawingName) {
        if (!this.indexedItems[drawingName]) {
            throw new Error(`[DRAWING_MANAGER] getIndexedItems: drawing "${drawingName}" not initialized`);
        }
        return this.indexedItems[drawingName];
    }
    
    // Add an inserted drawing
    addInsertedDrawing(drawingName, xOffset, yOffset, transform, parentDrawing) {
        // Add to tracking array if not already present
        if (!this.drawings.includes(drawingName)) {
            this.drawings.push(drawingName);
        }
        
        // Initialize data structure for the inserted drawing
        if (!transform) {
            throw new Error(`[DRAWING_MANAGER] addInsertedDrawing: transform is required for drawing "${drawingName}"`);
        }
        this.drawingsData[drawingName] = {
            xOffset: xOffset,
            yOffset: yOffset,
            transform: transform,
            data: null,
            parentDrawing: parentDrawing
        };
        
        // Initialize saved transform
        this.savedTransforms[drawingName] = { x: 0, y: 0, scale: 1.0 };
        
        // Set response status to false (pending) when request is queued
        this.drawingResponseStatus[drawingName] = false;
        
        // Ensure the item collections exist for this drawing
        this.ensureItemCollections(drawingName);
        
        return this;
    }
 /**   
    // Set data for an inserted drawing
    setInsertedDrawingData(drawingName, data) {
        if (this.drawingsData[drawingName]) {
            this.drawingsData[drawingName].data = data;
            
            // Set response status to true when response is received
            this.drawingResponseStatus[drawingName] = true;
            console.log(`[DRAWING_MANAGER] Set response status to TRUE for "${drawingName}"`);
        } else {
            console.warn(`[DRAWING_MANAGER] Cannot set data for "${drawingName}" - not found in drawingsData`);
        }
        return this;
    }
 **/   
    // Remove an inserted drawing
    removeInsertedDrawing(drawingName) {
         console.log(`[DRAWING_MANAGER] Remove inserted drawing: "${drawingName}" `);
        // (No "cannot remove main drawing" guard — there is no privileged
        // drawing.  Callers should not call this with a drawingName they
        // still need; if they do, the drawing is gone and any access errors
        // will surface naturally.)

        // Remove from drawings array
        const index = this.drawings.indexOf(drawingName);
        if (index !== -1) {
            this.drawings.splice(index, 1);
        }
        
        // Remove the drawing data
        delete this.drawingsData[drawingName];
        
        // Remove the drawing's item collections
        delete this.unindexedItems[drawingName];
        delete this.indexedItems[drawingName];
        
        // Remove saved transform
        delete this.savedTransforms[drawingName];
        
        // Remove response status
        delete this.drawingResponseStatus[drawingName];
        
        return this;
    }
    
    // Remove touchZone and associated touchActions by cmd, and also erase insertDwg items
    eraseByCmd(drawingName, cmd, dwgName = null) {
        console.log(`[DRAWING_MANAGER] Erasing touchZone and associated actions for cmd="${cmd}" in drawing="${drawingName}"`);
        if (!dwgName) {
        // Remove touchZone
        if (this.touchZonesByCmd[drawingName] && this.touchZonesByCmd[drawingName][cmd]) {
            delete this.touchZonesByCmd[drawingName][cmd];
            console.log(`[DRAWING_MANAGER] Removed touchZone for cmd="${cmd}"`);
        }
        
        // Remove associated touchActions
        if (this.touchActionsByCmd[drawingName] && this.touchActionsByCmd[drawingName][cmd]) {
            delete this.touchActionsByCmd[drawingName][cmd];
            console.log(`[DRAWING_MANAGER] Removed touchActions for cmd="${cmd}"`);
        }
        
        // Remove associated touchActionInputs
        if (this.touchActionInputsByCmd[drawingName] && this.touchActionInputsByCmd[drawingName][cmd]) {
            delete this.touchActionInputsByCmd[drawingName][cmd];
            console.log(`[DRAWING_MANAGER] Removed touchActionInput for cmd="${cmd}"`);
        }
        } else {
          // Also erase any insertDwg items with drawingName matching the cmd
          this.eraseInsertDwgByCmd(drawingName, cmd);
        }
        
        return this;
    }
    
    // Remove insertDwg items and recursively cleanup associated data
    eraseInsertDwgByCmd(parentDrawingName, targetDrawingName) {
        console.log(`[DRAWING_MANAGER] Erasing insertDwg for drawing="${targetDrawingName}" from parent="${parentDrawingName}"`);
        
        // Remove insertDwg items from unindexed items where drawingName matches cmd
        if (this.unindexedItems[parentDrawingName]) {
            const originalLength = this.unindexedItems[parentDrawingName].length;
            this.unindexedItems[parentDrawingName] = this.unindexedItems[parentDrawingName].filter(item => {
                if (item.type === 'insertDwg' && item.drawingName === targetDrawingName) {
                    console.log(`[DRAWING_MANAGER] Removing insertDwg item for "${targetDrawingName}" from unindexed items`);
                    return false; // Remove this item
                }
                return true; // Keep this item
            });
            const newLength = this.unindexedItems[parentDrawingName].length;
            if (originalLength !== newLength) {
                console.log(`[DRAWING_MANAGER] Removed ${originalLength - newLength} insertDwg items from unindexed items`);
            }
        }
        
        // Recursively remove all drawings that were inserted by the target drawing
        if (this.unindexedItems[targetDrawingName]) {
            const insertDwgItems = this.unindexedItems[targetDrawingName].filter(item => 
                item.type === 'insertDwg'
            );
            
            insertDwgItems.forEach(item => {
                console.log(`[DRAWING_MANAGER] Recursively removing nested insertDwg: "${item.drawingName}"`);
                this.eraseInsertDwgByCmd(targetDrawingName, item.drawingName);
            });
        }
        
        // Remove the inserted drawing from our tracking and cleanup all associated data
        if (this.drawings.includes(targetDrawingName)) {
            this.removeInsertedDrawing(targetDrawingName);
            console.log(`[DRAWING_MANAGER] Removed inserted drawing "${targetDrawingName}" from drawings array and cleaned up data`);
        }
        
        // Clear localStorage for the erased drawing
        try {
            localStorage.removeItem(`${targetDrawingName}_version`);
            localStorage.removeItem(`${targetDrawingName}_data`);
            console.log(`[DRAWING_MANAGER] Cleared localStorage for "${targetDrawingName}"`);
        } catch (error) {
            console.error(`[DRAWING_MANAGER] Error clearing localStorage for "${targetDrawingName}":`, error);
            throw error;
        }
        
        return this;
    }
    
    // Hide touchZone and insertDwg items by cmd
    hideByCmd(drawingName, cmd, dwgName = null) {
        console.log(`[DRAWING_MANAGER] Hiding items with cmd="${cmd}" in drawing="${drawingName}"`);
        if (!dwgName) {
        // Hide touchZone
        if (this.touchZonesByCmd[drawingName] && this.touchZonesByCmd[drawingName][cmd]) {
            this.touchZonesByCmd[drawingName][cmd].visible = false;
            console.log(`[DRAWING_MANAGER] Hidden touchZone for cmd="${cmd}"`);
        }
        } else {
        // Hide insertDwg items with cmd matching the hide command
        if (this.unindexedItems[drawingName]) {
            console.log(`[DRAWING_MANAGER] Checking ${this.unindexedItems[drawingName].length} unindexed items for insertDwg to hide with cmd="${cmd}"`);
            this.unindexedItems[drawingName].forEach((item, index) => {
                if (item.type === 'insertDwg') {
                    console.log(`[DRAWING_MANAGER] Found insertDwg item ${index}: cmd="${item.cmd}", target cmd="${cmd}", match=${item.cmd === cmd}`);
                    if (item.cmd === cmd) {
                        item.visible = false;
                        console.log(`[DRAWING_MANAGER] Hidden insertDwg item with cmd="${cmd}"`);
                    }
                }
            });
        }
        }
        
        return this;
    }
    
    // Unhide touchZone and insertDwg items by cmd
    unhideByCmd(drawingName, cmd, dwgName = null) {
        console.log(`[DRAWING_MANAGER] Unhiding items with cmd="${cmd}" in drawing="${drawingName}"`);
        if (!dwgName) {
        // Unhide touchZone
        if (this.touchZonesByCmd[drawingName] && this.touchZonesByCmd[drawingName][cmd]) {
            this.touchZonesByCmd[drawingName][cmd].visible = true;
            console.log(`[DRAWING_MANAGER] Unhidden touchZone for cmd="${cmd}"`);
        }
        } else {
        // Unhide insertDwg items with cmd matching the unhide command
        if (this.unindexedItems[drawingName]) {
            this.unindexedItems[drawingName].forEach(item => {
                if (item.type === 'insertDwg' && item.cmd === cmd) {
                    item.visible = true;
                    console.log(`[DRAWING_MANAGER] Unhidden insertDwg item with cmd="${cmd}"`);
                }
            });
        }
        }
        return this;
    }
    
    // Get all child drawings for a parent drawing
    getChildDrawings(parentDrawingName) {
        const childDrawings = [];
        
        for (const childName in this.drawingsData) {
            if (this.drawingsData[childName].parentDrawing === parentDrawingName) {
                childDrawings.push(childName);
            }
        }
        
        return childDrawings;
    }
    
    // Save the current transform for a drawing
    saveTransform(drawingName, transform) {
        this.savedTransforms[drawingName] = { ...transform };
        return this;
    }
    
    // Get the saved transform for a drawing
    getTransform(drawingName) {
        if (!this.savedTransforms[drawingName]) {
            throw new Error(`[DRAWING_MANAGER] getTransform: no saved transform for drawing "${drawingName}"`);
        }
        return this.savedTransforms[drawingName];
    }
    
    // Wipe every collection and lifecycle scalar in place, returning this
    // manager to its constructor-state.  Used by drawingDataProcessor's
    // touch-replacement path to restart fresh while keeping the same
    // DrawingManager instance (the caller — redraw.redrawDrawingManager —
    // can't be reassigned externally).
    reset() {
        this.touchZonesByCmd        = {};
        this.touchActionsByCmd      = {};
        this.touchActionInputsByCmd = {};
        this.unindexedItems         = {};
        this.indexedItems           = {};

        this.allTouchZonesByCmd        = {};
        this.allTouchActionsByCmd      = {};
        this.allTouchActionInputsByCmd = {};
        this.allUnindexedItems         = {};
        this.allIndexedItemsByNumber   = {};

        this.drawings              = [];
        this.drawingsData          = {};
        this.savedTransforms       = {};
        this.drawingResponseStatus = {};
        this.allDrawingsReceived   = false;
        this.globalTransform       = { x: 0, y: 0, scale: 1.0 };
        return this;
    }

    // Get all data needed for the mergeAndRedraw module
    getMergeAndRedrawState() {
        return {
            unindexedItems: this.unindexedItems,
            indexedItems: this.indexedItems,
            touchZonesByCmd: this.touchZonesByCmd,
            touchActionsByCmd: this.touchActionsByCmd,
            touchActionInputsByCmd: this.touchActionInputsByCmd,
            // Per-menuDwg merged collections — re-derivable from the per-drawing
            // raw collections via DrawingMerger.mergeAllDrawings(), so persisting
            // them is purely an optimisation.
            allTouchZonesByCmd:        this.allTouchZonesByCmd,
            allTouchActionsByCmd:      this.allTouchActionsByCmd,
            allTouchActionInputsByCmd: this.allTouchActionInputsByCmd,
            allUnindexedItems:         this.allUnindexedItems,
            allIndexedItemsByNumber:   this.allIndexedItemsByNumber,
            drawings: this.drawings,
            drawingsData: this.drawingsData,
            allDrawingsReceived: this.allDrawingsReceived, // this is not actually used!!
            drawingResponseStatus: this.drawingResponseStatus
        };
    }
    
    // Return initial transform state based on command type
    // This doesn't store any state, just returns the appropriate initial transform
    getInitialTransform(drawingName, command) {
        const name = drawingName;
        
        if (command === 'start') {
            // For 'start' commands, always use initial state
            console.log(`[TRANSFORM] Using initial transform (0,0,1.0) for drawing start: ${name}`);
            return { x: 0, y: 0, scale: 1.0 };
        } else if (command === 'update' && this.savedTransforms[name]) {
            // For 'update' commands, use the saved transform if available
            const savedTransform = {...this.savedTransforms[name]};
            console.log(`[TRANSFORM] Using saved transform for update: x=${savedTransform.x}, y=${savedTransform.y}, scale=${savedTransform.scale}`);
            return savedTransform;
        } else {
            // Default fallback
            console.log(`[TRANSFORM] No saved transform found, using default (0,0,1.0)`);
            return { x: 0, y: 0, scale: 1.0 };
        }
    }
    
    // Load drawing data from localStorage (if available)
    loadFromLocalStorage(drawingName) {
        try {
            const savedVersion = localStorage.getItem(`${drawingName}_version`);
            const savedData = localStorage.getItem(`${drawingName}_data`);
            
            if (savedData) {
                const drawingData = JSON.parse(savedData);
                
                // Ensure the drawing is in the drawings array
                if (!this.drawings.includes(drawingName)) {
                        this.drawings.push(drawingName);
                }
                
                // Create or update drawingsData entry
                if (!this.drawingsData[drawingName]) {
                    this.drawingsData[drawingName] = {
                        xOffset: 0,
                        yOffset: 0,
                        transform: { x: 0, y: 0, scale: 1.0 },
                        data: null,
                        parentDrawing: null
                    };
                }
                
                // Update the data
                this.drawingsData[drawingName].data = drawingData;
                this.drawingResponseStatus[drawingName] = true;
                
                console.log(`DrawingManager: Loaded drawing ${drawingName} from localStorage (version: ${savedVersion})`);
                return drawingData;
            }
        } catch (error) {
            console.error(`Error loading drawing ${drawingName} from localStorage:`, error);
            throw error;
        }
    }

    // ---- Per-drawing cache (pfodWeb_dwg_<conn>_<drawingName>) ----
    //
    // Stores ONE drawing's data + version + per-drawing raw collections,
    // independently of which menu(s) reference it.  The cache key is
    // per-(connection, drawing) so the same drawing reused across multiple
    // menu items has a single cache entry, and connections to different
    // devices keep separate state.
    //
    // The five raw collections are saved/loaded TOGETHER with .data, so a
    // non-null drawingsData[name].data always implies the raw collections
    // are populated (and vice versa).  Callers can rely on the ?.data
    // signal to mean "fully loaded".
    saveDrawingDataToStorage(drawingName, connectionId) {
        if (!drawingName || !connectionId) return this;
        const data = this.drawingsData[drawingName]?.data;
        if (!data) {
            console.warn(`[DRAWING_MANAGER] saveDrawingDataToStorage: no data for "${drawingName}", skipping`);
            return this;
        }
        const key = `pfodWeb_dwg_${connectionId}_${drawingName}`;
        // Don't cache unversioned drawings — without a version the next
        // session has no way to verify staleness, so persisting would mask
        // a fresh fetch.  Also evict any prior cached entry so the next
        // start request goes out unversioned and the device replies with
        // current state.
        if (!data.version) {
            try {
                localStorage.removeItem(key);
                console.log(`[DRAWING_MANAGER] saveDrawingDataToStorage: "${drawingName}" is unversioned — not cached, evicted any prior entry at ${key}`);
            } catch (error) {
                console.error(`[DRAWING_MANAGER] saveDrawingDataToStorage error evicting unversioned "${drawingName}":`, error);
            }
            return this;
        }
        try {
            const entry = {
                data: data,
                version: data.version,
                touchZonesByCmd:        this.touchZonesByCmd[drawingName]        || {},
                touchActionsByCmd:      this.touchActionsByCmd[drawingName]      || {},
                touchActionInputsByCmd: this.touchActionInputsByCmd[drawingName] || {},
                unindexedItems:         this.unindexedItems[drawingName]         || [],
                indexedItems:           this.indexedItems[drawingName]           || {}
            };
            localStorage.setItem(key, JSON.stringify(entry));
            console.log(`[DRAWING_MANAGER] Saved per-drawing cache "${drawingName}" version="${entry.version}" key=${key}`);
        } catch (error) {
            console.error(`[DRAWING_MANAGER] saveDrawingDataToStorage error for "${drawingName}":`, error);
            throw error;
        }
        return this;
    }

    // Load a single drawing from per-drawing cache.  Returns the cached
    // entry on hit (with .version), null on miss.  On hit, populates the
    // 5 per-drawing raw collections and drawingsData[name].data atomically,
    // ensures the drawing is registered in this.drawings, and seeds
    // savedTransforms / drawingResponseStatus.
    loadDrawingDataFromStorage(drawingName, connectionId) {
        if (!drawingName || !connectionId) return null;
        try {
            const key = `pfodWeb_dwg_${connectionId}_${drawingName}`;
            const stored = localStorage.getItem(key);
            if (!stored) return null;
            const entry = JSON.parse(stored);
            // Restore raw atomically with .data so the (data set <=> raw populated) invariant holds.
            this.touchZonesByCmd[drawingName]        = entry.touchZonesByCmd        || {};
            this.touchActionsByCmd[drawingName]      = entry.touchActionsByCmd      || {};
            this.touchActionInputsByCmd[drawingName] = entry.touchActionInputsByCmd || {};
            this.unindexedItems[drawingName]         = entry.unindexedItems         || [];
            this.indexedItems[drawingName]           = entry.indexedItems           || {};
            // Restore drawingsData; preserve xOffset/yOffset/transform/parentDrawing
            // if a prior addInsertedDrawing has already populated them.
            if (!this.drawingsData[drawingName]) {
                this.drawingsData[drawingName] = {
                    xOffset: 0, yOffset: 0,
                    transform: { x: 0, y: 0, scale: 1.0 },
                    data: entry.data,
                    parentDrawing: null
                };
            } else {
                this.drawingsData[drawingName].data = entry.data;
            }
            this.drawingResponseStatus[drawingName] = true;
            if (!this.savedTransforms[drawingName]) {
                this.savedTransforms[drawingName] = { x: 0, y: 0, scale: 1.0 };
            }
            if (!this.drawings.includes(drawingName)) {
                this.drawings.push(drawingName);
            }
            console.log(`[DRAWING_MANAGER] Loaded per-drawing cache "${drawingName}" version="${entry.version}" key=${key}`);
            return entry;
        } catch (error) {
            console.error(`[DRAWING_MANAGER] loadDrawingDataFromStorage error for "${drawingName}":`, error);
            return null;
        }
    }

    // ---- Per-menuDwg merged cache (pfodWeb_menuDwg_<conn>_<menuDwgName>) ----
    //
    // Stores the merged tree (allXXX[menuDwg]) for a menuDwg — the rendered
    // result of the merger walking the menuDwg's insertDwg tree.  Separate
    // from the per-drawing cache: the same component drawing may appear in
    // multiple menuDwg trees and each menuDwg owns its own merged result
    // (with composed transforms etc.).
    //
    // Versioning rule mirrors saveDrawingDataToStorage: only persist when the
    // top-level menuDwg has a version.  Without one, the next session has no
    // way to verify staleness, so caching would mask a fresh fetch.  Evict any
    // prior entry so a stale merge from an earlier (versioned) firmware does
    // not leak into the new run.
    saveMenuDwgMergedToStorage(menuDwgName, connectionId) {
        if (!menuDwgName || !connectionId) return this;
        const key = `pfodWeb_menuDwg_${connectionId}_${menuDwgName}`;
        const version = this.drawingsData[menuDwgName]?.data?.version;
        if (!version) {
            try {
                localStorage.removeItem(key);
                console.log(`[DRAWING_MANAGER] saveMenuDwgMergedToStorage: "${menuDwgName}" is unversioned — not cached, evicted any prior entry at ${key}`);
            } catch (error) {
                console.error(`[DRAWING_MANAGER] saveMenuDwgMergedToStorage error evicting unversioned "${menuDwgName}":`, error);
            }
            return this;
        }
        try {
            const entry = {
                allTouchZonesByCmd:        this.allTouchZonesByCmd[menuDwgName]        || {},
                allTouchActionsByCmd:      this.allTouchActionsByCmd[menuDwgName]      || {},
                allTouchActionInputsByCmd: this.allTouchActionInputsByCmd[menuDwgName] || {},
                allUnindexedItems:         this.allUnindexedItems[menuDwgName]         || [],
                allIndexedItemsByNumber:   this.allIndexedItemsByNumber[menuDwgName]   || {}
            };
            localStorage.setItem(key, JSON.stringify(entry));
            console.log(`[DRAWING_MANAGER] Saved menuDwg merged cache "${menuDwgName}" version="${version}" key=${key}`);
        } catch (error) {
            console.error(`[DRAWING_MANAGER] saveMenuDwgMergedToStorage error for "${menuDwgName}":`, error);
            throw error;
        }
        return this;
    }

    loadMenuDwgMergedFromStorage(menuDwgName, connectionId) {
        if (!menuDwgName || !connectionId) return null;
        try {
            const key = `pfodWeb_menuDwg_${connectionId}_${menuDwgName}`;
            const stored = localStorage.getItem(key);
            if (!stored) return null;
            const entry = JSON.parse(stored);
            this.allTouchZonesByCmd[menuDwgName]        = entry.allTouchZonesByCmd        || {};
            this.allTouchActionsByCmd[menuDwgName]      = entry.allTouchActionsByCmd      || {};
            this.allTouchActionInputsByCmd[menuDwgName] = entry.allTouchActionInputsByCmd || {};
            this.allUnindexedItems[menuDwgName]         = entry.allUnindexedItems         || [];
            this.allIndexedItemsByNumber[menuDwgName]   = entry.allIndexedItemsByNumber   || {};
            console.log(`[DRAWING_MANAGER] Loaded menuDwg merged cache "${menuDwgName}" key=${key}`);
            return entry;
        } catch (error) {
            console.error(`[DRAWING_MANAGER] loadMenuDwgMergedFromStorage error for "${menuDwgName}":`, error);
            return null;
        }
    }


    // Helper method to ensure item collections exist for a drawing
    ensureItemCollections(drawingName) {
        if (!this.unindexedItems[drawingName]) {
            this.unindexedItems[drawingName] = [];
        }
        if (!this.indexedItems[drawingName]) {
            this.indexedItems[drawingName] = {};
        }
        if (!this.touchZonesByCmd[drawingName]) {
            this.touchZonesByCmd[drawingName] = {};
        }
        if (!this.touchActionsByCmd[drawingName]) {
            this.touchActionsByCmd[drawingName] = {};
        }
        if (!this.touchActionInputsByCmd[drawingName]) {
            this.touchActionInputsByCmd[drawingName] = {};
        }
    }
    
    // (Removed: getMainDrawingName / getCurrentDrawingName / getCurrentDrawingData.
    // A menu has zero or more drawing items, no privileged "main" drawing.
    // Callers must pass an explicit drawingName.)

    // Create a structured response for sharing state with other modules
    getState() {
        return {
            drawings: this.drawings,
            drawingsData: this.drawingsData,
            unindexedItems: this.unindexedItems,
            indexedItems: this.indexedItems,
            allDrawingsReceived: this.allDrawingsReceived,
            savedTransforms: this.savedTransforms,
            drawingResponseStatus: this.drawingResponseStatus
        };
    }
    
    // Get the response status for a drawing
    getDrawingResponseStatus(drawingName) {
        // Add debug logging to help troubleshoot
        console.log(`[DRAWING_MANAGER] Checking response status for "${drawingName}": ${this.drawingResponseStatus[drawingName]}`);
        
        // If it's undefined, treat as false - if it's truthy, treat as true
        return !!this.drawingResponseStatus[drawingName];
    }
    
    // Get the version stored for a drawing.  Returns the in-memory version
    // when loaded; falls back to peeking at the per-drawing cache (without
    // populating any other state).  Callers wanting full restore should use
    // loadDrawingDataFromStorage which returns the same version plus the
    // raw collections and data.
    getStoredVersion(drawingName, connectionId) {
        if (!drawingName) return null;
        const memVersion = this.drawingsData[drawingName]?.data?.version;
        if (memVersion) return memVersion;
        if (!connectionId) return null;
        try {
            const key = `pfodWeb_dwg_${connectionId}_${drawingName}`;
            const stored = localStorage.getItem(key);
            if (!stored) return null;
            return JSON.parse(stored).version || null;
        } catch (error) {
            console.error(`[DRAWING_MANAGER] getStoredVersion error for "${drawingName}":`, error);
            return null;
        }
    }
}

// Make DrawingManager available globally for class definition access
// IMPORTANT: Only pfodWeb should create instances of DrawingManager
// Other modules should use the instance provided by pfodWeb
window.DrawingManager = DrawingManager;