/*
   drawingMerger.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// DrawingMerger — recursively expands `insertDwg` references into their target
// drawing's items, with composed transforms, into PER-MENUDWG MERGED sets on
// the DrawingManager.  There is no single "main drawing" global view; every
// menu drawing item has its own canvas and its own merged set rooted at that
// drawing.  The merged collections are spread across five DrawingManager
// fields keyed by menuDwg name:
//
//     drawingManager.allTouchZonesByCmd[menuDwg]        = {cmd: item}
//     drawingManager.allTouchActionsByCmd[menuDwg]      = {cmd: actions[]}
//     drawingManager.allTouchActionInputsByCmd[menuDwg] = {cmd: input}
//     drawingManager.allUnindexedItems[menuDwg]         = [items]
//     drawingManager.allIndexedItemsByNumber[menuDwg]   = {idx: item}
//
// These are derived views — rebuilt from scratch each merge from the
// per-drawing RAW collections (drawingManager.unindexedItems[name] etc.).
// The "last received wins, never remove" semantics live at the per-drawing
// raw layer in DrawingManager.addItem; this merger just walks that data.
//
// Exports:    window.DrawingMerger class
// Depends on: DrawingManager instance (passed to constructor),
//             DrawingManager.addUnindexedLastWins static helper
// Called by:  requestQueue.js processRequestQueue (after each dwg response)
//             drawingProcessing.js processPendingResponses (after pending batch drains)
class DrawingMerger {
    constructor(drawingManager) {
        this.drawingManager = drawingManager;
    }

    // Build per-menuDwg merged sets for every drawing currently registered
    // on the drawing manager.  Drawings whose data hasn't arrived yet are
    // skipped (they'll be picked up on a later merge once their data is in).
    mergeAllDrawings() {
        // Always start with fresh containers — the allXXX maps are derived
        // views, so any stale entry would just survive longer than its
        // source; better to wipe and rebuild from current state.
        this.drawingManager.allTouchZonesByCmd        = {};
        this.drawingManager.allTouchActionsByCmd      = {};
        this.drawingManager.allTouchActionInputsByCmd = {};
        this.drawingManager.allUnindexedItems         = {};
        this.drawingManager.allIndexedItemsByNumber   = {};

        for (const drawingName of (this.drawingManager.drawings || [])) {
            this.mergeForDrawing(drawingName);
        }
    }

    // Build the merged set rooted at one drawing.  Initialises empty entries
    // for that drawing in each of the five allXXX maps, then walks the tree
    // via mergeDrawingItems with those entries as the output targets.
    mergeForDrawing(drawingName) {
        const drawingData = this.drawingManager.drawingsData[drawingName];
        if (!drawingData || !drawingData.data) {
            // Data hasn't arrived yet — leave allXXX[name] absent; the renderer
            // will show the placeholder until a later merge runs.
            return;
        }

        const dm = this.drawingManager;
        dm.allTouchZonesByCmd[drawingName]        = {};
        dm.allTouchActionsByCmd[drawingName]      = {};
        dm.allTouchActionInputsByCmd[drawingName] = {};
        dm.allUnindexedItems[drawingName]         = [];
        dm.allIndexedItemsByNumber[drawingName]   = {};

        const rootDwg = {
            type: 'insertDwg',
            xOffset: 0,
            yOffset: 0,
            color: drawingData.color,
            parentDrawingName: drawingName,
            drawingName: drawingName,
            transform: { x: 0, y: 0, scale: 1.0 }
        };

        const processedDrawings = new Set();
        this.mergeDrawingItems(rootDwg,
            dm.allUnindexedItems[drawingName],
            dm.allIndexedItemsByNumber[drawingName],
            dm.allTouchZonesByCmd[drawingName],
            dm.allTouchActionsByCmd[drawingName],
            dm.allTouchActionInputsByCmd[drawingName],
            processedDrawings, /*parentClipRegion*/ null, drawingData.data.x);

        console.log(`[DRAWING_MERGER] Merged "${drawingName}": ${dm.allUnindexedItems[drawingName].length} unindexed, ${Object.keys(dm.allIndexedItemsByNumber[drawingName]).length} indices, ${Object.keys(dm.allTouchZonesByCmd[drawingName]).length} touchZones, ${Object.keys(dm.allTouchActionsByCmd[drawingName]).length} touchActions, ${Object.keys(dm.allTouchActionInputsByCmd[drawingName]).length} touchActionInputs`);
    }

    getDrawingResponseStatus(drawingName) {
        // An insertDwg can reference a child that is not yet registered — its
        // {cX} fetch is still queued/in-flight, or it was de-registered by a
        // version change while the parent still lists the insertDwg item.
        // That is the normal progressive-load case: return false so
        // mergeDrawingItems skips this insertDwg and picks it up on the later
        // re-merge once the child arrives.  No log here — the caller already
        // logs the skip — and it must NOT throw (throwing aborted the entire
        // parent-drawing render: "error loading dwg").
        if (!(drawingName in this.drawingManager.drawingResponseStatus)) {
            return false;
        }
        return this.drawingManager.drawingResponseStatus[drawingName];
    }

    // Calculate clipping region for a drawing
    calculateItemClipRegion(transform, drawingWidth, drawingHeight, parentClipRegion) {
        return parentClipRegion; // do not limit insertDwgs
    }

    /**
    transform calculations
    each items has a base offset and a scale and a clip region
    when the item is drawn, first the item's offset x scale is added to the base to the the position
    then the size is scaled by scale and the item drawn
    insertDwg's offset are different they do not change the position of the the background rectangle
    rather they move the insertDwg's items up and to left by offset * scale (for +ve offsets)
    clip regions are only updated when insertDwg processed

    the insertDwg arg contains the current transformation offset and scale
    the insertDwg xOffset,yOffset move the dwg items up and left by offset * scale (for +ve offsets)
    scale insertDwg by ratio of cols i.e. a 20xh inserted in a 40xhh will be scaled down by 2 i.e. x 20/40
    **/
    // Recursively merge a drawing tree rooted at `insertDwg` into the supplied
    // per-drawing output collections.  Output args are objects/arrays owned
    // by mergeForDrawing — this function never touches the global all*
    // (those have been removed).
    mergeDrawingItems(insertDwg,
                      outUnindexed, outIndexed, outTouchZones,
                      outTouchActions, outTouchActionInputs,
                      processedDrawings, parentClipRegion, parentDrawingWidth) {
        let drawingName = insertDwg.drawingName;
        console.warn(`[MERGE_DWG] Merging Drawing "${drawingName}".`);
        console.log(`[MERGE_DWG] Beginning merge process for drawing "${drawingName}" ${JSON.stringify(insertDwg)}`);

        const drawingData = this.drawingManager.drawingsData[drawingName];
        if (!drawingData || !drawingData.data) {
            console.log(`[DRAWING_MERGER] Drawing "${drawingName}" data not available.`);
            return;
        }

        let clipRegion = parentClipRegion;
        if (parentClipRegion) {
            console.log(`[DRAWING_MERGER] Using parent clip region: (${parentClipRegion.x}, ${parentClipRegion.y}, width:${parentClipRegion.width}, height:${parentClipRegion.height})`);
        } else {
            console.log(`[DRAWING_MERGER] No parent clip region provided, using drawing bounds for clipping`);
            clipRegion = {
                x: 0, y: 0,
                width: drawingData.data.x, height: drawingData.data.y
            };
        }
        parentClipRegion = clipRegion;

        const drawingWidth  = drawingData.data.x || 50;
        const drawingHeight = drawingData.data.y || 50;
        const backgroundColor = drawingData.data.color || 'white';

        console.log(`[DRAWING_MERGER] Drawing "${drawingName}" has dimensions ${drawingWidth}x${drawingHeight}, color: ${backgroundColor}`);

        const parentTransform = insertDwg.transform || { x: 0, y: 0, scale: 1.0 };
        console.log(`[SCALE_MERGE_DWG]  parentTransform transform: ${JSON.stringify(parentTransform)}`);

        const drawingUnindexedItems = this.drawingManager.unindexedItems[drawingName]   || [];
        const drawingIndexedItems   = this.drawingManager.indexedItems[drawingName]     || {};
        const touchZoneItems        = this.drawingManager.touchZonesByCmd[drawingName]  || {};
        const touchActionItems      = this.drawingManager.touchActionsByCmd[drawingName]|| {};
        const touchActionInputItems = this.drawingManager.touchActionInputsByCmd[drawingName] || {};

        console.log(`[DRAWING_MERGER] Processing ${drawingUnindexedItems.length} unindexed items, ${Object.keys(drawingIndexedItems).length} indexed items, ${Object.keys(touchZoneItems).length} touchZones from "${drawingName}"`);

        if (drawingUnindexedItems.length === 0 && Object.keys(drawingIndexedItems).length === 0) {
            console.log(`[DRAWING_MERGER] Drawing "${drawingName}" has no items, but will still be drawn as a rectangle with background color.`);
            if (Object.keys(touchZoneItems).length !== 0) {
                console.log(`[DRAWING_MERGER] Drawing "${drawingName}" has touchZones which will be drawn in debug mode.`);
            }
        }

        let dwgTransform = {...insertDwg.transform};
        console.log(`[SCALE_MERGE_DWG]  insertDwg transform: ${JSON.stringify(dwgTransform)}`);
        console.log(`[DRAWING_MERGER] For drawing: Raw dimensions: ${drawingWidth}x${drawingHeight}`);

        const dwgClipRegion = this.calculateItemClipRegion(dwgTransform, drawingWidth, drawingHeight, parentClipRegion);
        console.log(`[DRAWING_MERGER] Calculated nested drawing clip region: (${dwgClipRegion.x}, ${dwgClipRegion.y}, width:${dwgClipRegion.width}, height:${dwgClipRegion.height})`);

        // Apply insertDwg offset move (in scaled space)
        const dwg_xOffset = parseFloat(insertDwg.xOffset || 0);
        const dwg_yOffset = parseFloat(insertDwg.yOffset || 0);
        dwgTransform.x += (-dwg_xOffset) * dwgTransform.scale;
        dwgTransform.y += (-dwg_yOffset) * dwgTransform.scale;
        console.log(`[DRAWING_MERGER] Using item transform for nested drawing items: (${dwgTransform.x}, ${dwgTransform.y}, ${dwgTransform.scale})`);

        // ----- Process touchZones -----
        // Per-cmd assign into the per-drawing merged outTouchZones map.
        // Last-received-wins per cmd; map keys not touched by this walk
        // remain from earlier insertDwgs in the same merge call.
        for (const cmd in touchZoneItems) {
            const touchZone = touchZoneItems[cmd];
            const processedItem = {...touchZone};
            processedItem.clipRegion = dwgClipRegion;
            const itemTransform = {...processedItem.transform};
            itemTransform.x = itemTransform.x * dwgTransform.scale + dwgTransform.x;
            itemTransform.y = itemTransform.y * dwgTransform.scale + dwgTransform.y;
            itemTransform.scale = itemTransform.scale * dwgTransform.scale;
            processedItem.transform = itemTransform;

            console.log(`[DRAWING_MERGER] Found touchzone item for drawing "${drawingName}" at offsets (${touchZone.xOffset || 0}, ${touchZone.yOffset || 0})`);
            const touchZoneCmd = touchZone.cmd || '';
            if (touchZoneCmd.trim().length === 0) {
                console.warn(`[DRAWING_MERGER] Error empty touchzone cmd in drawing "${drawingName}" ${JSON.stringify(processedItem)}`);
                continue;
            }
            if (outTouchZones[touchZoneCmd]) {
                const currentItem = outTouchZones[touchZoneCmd];
                if (currentItem.parentDrawingName !== processedItem.parentDrawingName) {
                    console.warn(`[DRAWING_MERGER] Error: Updating existing touchZone with cmd ${touchZoneCmd} in "${processedItem.parentDrawingName}" with item from different drawing, "${currentItem.parentDrawingName}"`);
                }
                processedItem.transform  = {...currentItem.transform};
                processedItem.clipRegion = {...currentItem.clipRegion};
                console.log(`[DRAWING_MERGERG_UPDATE] Update existing touchZone with cmd ${touchZoneCmd} to ${JSON.stringify(processedItem)}`);
            }
            console.warn(`[DRAWING_MERGER] Added touchZone to outTouchZones  ${JSON.stringify(processedItem)}`);
            outTouchZones[touchZoneCmd] = processedItem;
        }

        // ----- Process touchActions / touchActionInputs -----
        // These now flow into the PER-DRAWING merged set (not a global),
        // keyed by cmd.  Per-cmd assign — last received wins per cmd.
        for (const cmd in touchActionItems) {
            const touchActions = touchActionItems[cmd];
            if (touchActions && touchActions.length > 0) {
                outTouchActions[cmd] = [...touchActions];
                console.log(`[DRAWING_MERGER] Added ${touchActions.length} touchActions for cmd="${cmd}" to merged set`);
            }
        }
        for (const cmd in touchActionInputItems) {
            const touchActionInput = touchActionInputItems[cmd];
            if (touchActionInput) {
                outTouchActionInputs[cmd] = {...touchActionInput};
                console.log(`[DRAWING_MERGER] Added touchActionInput for cmd="${cmd}" to merged set`);
            }
        }

        // ----- Process unindexed items -----
        for (let i = 0; i < drawingUnindexedItems.length; i++) {
            const item = drawingUnindexedItems[i];
            item.clipRegion = dwgClipRegion;

            console.log(`[MERGE_DWG] Processing unindexed item ${i} of type '${item.type}' in drawing "${drawingName}"`);

            if (item.type && item.type === 'insertDwg') {
                if (item.visible === false) {
                    console.log(`[MERGE_DWG] Skipping hidden insertDwg for drawing "${item.drawingName}"`);
                    continue;
                }
                const nestedDrawingName = item.drawingName;
                console.log(`[MERGE_DWG] Found nested insertDwg item for drawing "${nestedDrawingName}" at offsets (${item.xOffset || 0}, ${item.yOffset || 0})`);

                const hasResponse = this.getDrawingResponseStatus(nestedDrawingName);
                if (!hasResponse) {
                    console.warn(`[MERGE_DWG] No response received for drawing "${nestedDrawingName}" - skipping this insertDwg`);
                    continue;
                }

                if (nestedDrawingName && !processedDrawings.has(nestedDrawingName)) {
                    processedDrawings.add(nestedDrawingName);

                    // Compose the nested insertDwg's transform with the current parent transform.
                    const composedItem = {...item};
                    const composedTransform = {...item.transform};
                    composedTransform.x     = composedTransform.x     * dwgTransform.scale + dwgTransform.x;
                    composedTransform.y     = composedTransform.y     * dwgTransform.scale + dwgTransform.y;
                    composedTransform.scale = composedTransform.scale * dwgTransform.scale;
                    composedItem.transform  = composedTransform;

                    console.log(`[MERGE_DWG_NESTED] Composed transform for nested drawing "${nestedDrawingName}": parent=${JSON.stringify(dwgTransform)}, local=${JSON.stringify(item.transform)}, composed=${JSON.stringify(composedTransform)}`);

                    this.mergeDrawingItems(composedItem,
                        outUnindexed, outIndexed, outTouchZones,
                        outTouchActions, outTouchActionInputs,
                        processedDrawings, dwgClipRegion, drawingWidth);
                } else if (nestedDrawingName) {
                    // Drawing already encountered in this merge walk — either
                    // a circular inclusion (e.g. c3 → c4 → c3) or a duplicate
                    // reference of the same drawing within one tree.  Per the
                    // data model "every merged-tree key is unique", neither
                    // is valid pfod.  Short-circuit (already done by this
                    // branch) and surface as an error so the device-side
                    // misconfiguration is visible.
                    console.error(`[MERGE_DWG] Circular / duplicate insertDwg: drawing "${nestedDrawingName}" already in the merge chain (currently merging into "${drawingName}"). Skipping to prevent infinite recursion. Chain so far: [${[...processedDrawings].join(', ')}]`);
                }
            } else {
                // Regular drawing item (line, rectangle, label, …)
                const processedItem = {...item};
                processedItem.clipRegion = dwgClipRegion;
                const itemTransform = {...(processedItem.transform || { x: 0, y: 0, scale: 1 })};
                itemTransform.x     = itemTransform.x     * dwgTransform.scale + dwgTransform.x;
                itemTransform.y     = itemTransform.y     * dwgTransform.scale + dwgTransform.y;
                itemTransform.scale = itemTransform.scale * dwgTransform.scale;
                processedItem.transform = itemTransform;
                console.warn(`[MERGE_DWG] Added unindexed Item  ${JSON.stringify(processedItem)}`);
                // Use last-received-wins helper so re-receiving the same item
                // (same attribute fingerprint) doesn't pile up duplicates.
                DrawingManager.addUnindexedLastWins(outUnindexed, processedItem);
            }
        }

        // ----- Process indexed items -----
        for (const idx in drawingIndexedItems) {
            const item = drawingIndexedItems[idx];

            console.log(`[MERGE_DWG] Processing indexed item idx=${idx}, type='${item.type}' in drawing "${drawingName}"`);
            const processedItem = {...item};
            processedItem.clipRegion = dwgClipRegion;
            const itemTransform = {...processedItem.transform};
            itemTransform.x     = itemTransform.x     * dwgTransform.scale + dwgTransform.x;
            itemTransform.y     = itemTransform.y     * dwgTransform.scale + dwgTransform.y;
            itemTransform.scale = itemTransform.scale * dwgTransform.scale;
            processedItem.transform = itemTransform;

            const numericIdx = parseInt(idx);
            if (outIndexed[numericIdx]) {
                const currentItem = outIndexed[numericIdx];
                // Preserve previously-merged transform / clipRegion / visibility
                // for the same idx coming from a different drawing in the tree.
                processedItem.transform  = {...currentItem.transform};
                processedItem.clipRegion = {...currentItem.clipRegion};
                processedItem.visible    = {...currentItem.visible};
                console.log(`[MERGE_DWG_UPDATE] Update existing item with index ${numericIdx} to ${JSON.stringify(processedItem)}`);
            }
            console.warn(`[MERGE_DWG] Added indexed Item  ${JSON.stringify(processedItem)}`);
            outIndexed[numericIdx] = processedItem;
        }

        console.log(`[MERGE_DWG] Completed merging items from "${drawingName}" at ${new Date().toISOString()}`);
        console.log(`[MERGE_DWG] Current status: ${outUnindexed.length} unindexed items, ${Object.keys(outIndexed).length} different indices, ${Object.keys(outTouchZones).length} touchZones `);
    }
}

// Export as global for browser compatibility
window.DrawingMerger = DrawingMerger;
