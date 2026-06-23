/*   
   webTranslator.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Translates pfod wire-format strings into internal drawing/menu objects.
//
// Exports:    window.translateRawItemsToItemArray(items, parentDwg), translate* helpers
//             used internally and via drawingDataProcessor.translateDwgResponse.
// Depends on: window.JS_VERSION from version.js
// Called by:  drawingDataProcessor.js (translateDwgResponse + translateRaw* item helpers).
//             Menu-shape parsing lives in pfodMenuParser.js (pfodParseMenu) — not here.

 /**
   from Android App these can be 'c' or 'r'
     public void updateColRows(int colPixel, int rowPixel) { // , int rc, int rr) {
        colOffset = setFromVar(colOffset, colOffsetVar, colPixel, rowPixel);// , rc, rr);
        rowOffset = setFromVar(rowOffset, rowOffsetVar, colPixel, rowPixel);// , rc, rr);
        vWidth = setFromVar(vWidth, vWidthVar, colPixel, rowPixel);// , rc, rr);
        vHeight = setFromVar(vHeight, vHeightVar, colPixel, rowPixel);// , rc, rr);
        value = (int) setFromVar((float) value, vValueVar, colPixel, rowPixel);// , rc, rr);
        // sortRect(); // resort after setting
    }
**/

// JS_VERSION is available globally via window.JS_VERSION from pfodWeb.js

function translateRawRectangle(rawRectString,isTouchAction=false) {
    // Parse rectangle type from prefix
    let rectType = '';
    let content = '';
    
    if (rawRectString.startsWith('|RRc')) {
        rectType = 'RRc';
        content = rawRectString.substring(4);
    } else if (rawRectString.startsWith('|RR')) {
        rectType = 'RR';
        content = rawRectString.substring(3);
    } else if (rawRectString.startsWith('|Rc')) {
        rectType = 'Rc';
        content = rawRectString.substring(3);
    } else if (rawRectString.startsWith('|R')) {
        rectType = 'R';
        content = rawRectString.substring(2);
    } else if (rawRectString.startsWith('|rrc')) {
        rectType = 'rrc';
        content = rawRectString.substring(4);
    } else if (rawRectString.startsWith('|rr')) {
        rectType = 'rr';
        content = rawRectString.substring(3);
    } else if (rawRectString.startsWith('|rc')) {
        rectType = 'rc';
        content = rawRectString.substring(3);
    } else if (rawRectString.startsWith('|r')) {
        rectType = 'r';
        content = rawRectString.substring(2);
    } else {
        throw new Error('Invalid rectangle format: must start with |r, |rc, |rr, |rrc, |R, |Rc, |RR, or |RRc');
    }
    
    let idx = 0; // default value
    let parts;
    
    // Check if idx is specified (starts with `)
    if (content.startsWith('`')) {
        // Extract idx and split remaining by ~
        const idxEnd = content.indexOf('~');
        idx = parseInt(content.substring(1, idxEnd));
        parts = content.substring(idxEnd + 1).split('~');
    } else {
        // No idx, split all by ~ and drop leading empty string
        parts = content.split('~');
        if (parts[0] === '') {
            parts = parts.slice(1);
        }
    }
    
    // Parse parts: [colour]~width~height[~colOffset[~rowOffset]]
    const colour = parts[0] === '' ? undefined : parseInt(parts[0]);
    let xSize = 1;
    let ySize = 1;
    // Handle isTouchAction transformations and invalid inputs
    if (parts.length > 1 && parts[1] !== '') {
        if (isTouchAction && parts[1] === 'c') {
            xSize = 'COL';
        } else if (isTouchAction && parts[1] === 'r') {
            xSize = 'ROW';
        } else if (!isNaN(parseFloat(parts[1]))) {
            xSize = parseFloat(parts[1]);
        } else {
            xSize = 1;
        }
    }
    
    if (parts.length > 2 && parts[2] !== '') {
        if (isTouchAction && parts[2] === 'c') {
            ySize = 'COL';
        } else if (isTouchAction && parts[2] === 'r') {
            ySize = 'ROW';
        } else if (!isNaN(parseFloat(parts[2]))) {
            ySize = parseFloat(parts[2]);
        } else {
            ySize = 1;
        }
    }
    
    
    let xOffset = 0;
    let yOffset = 0;
    
    // Handle isTouchAction transformations and invalid inputs
    if (parts.length > 3 && parts[3] !== '') {
        if (isTouchAction && parts[3] === 'c') {
            xOffset = 'COL';
        } else if (isTouchAction && parts[3] === 'r') {
            xOffset = 'ROW';
        } else if (!isNaN(parseFloat(parts[3]))) {
            xOffset = parseFloat(parts[3]);
        } else {
            xOffset = 0;
        }
    }
    
    if (parts.length > 4 && parts[4] !== '') {
        if (isTouchAction && parts[4] === 'c') {
            yOffset = 'COL';
        } else if (isTouchAction && parts[4] === 'r') {
            yOffset = 'ROW';
        } else if (!isNaN(parseFloat(parts[4]))) {
            yOffset = parseFloat(parts[4]);
        } else {
            yOffset = 0;
        }
    }
    
    // Create rectangle object
    const rectObject = {
        type: "rectangle",
        idx: idx
    };
    
    // Add colour if specified
    if (colour !== undefined && !isNaN(colour)) {
        rectObject.color = colour;
    } else {
      rectObject.color = -1;
    }
    
    // Add dimensions
    rectObject.xSize = xSize;
    rectObject.ySize = ySize;
    
    // Add offsets
    rectObject.xOffset = xOffset;
    rectObject.yOffset = yOffset;
    
    // Add rectangle properties based on type
    if (rectType.includes('R') || rectType.includes('r')) {
        if (rectType.includes('R')) {
            rectObject.filled = "true";
        }
        if (rectType.includes('c')) {
            rectObject.centered = "true";
        }
        if (rectType.includes('r') && !rectType.includes('R')) {
            // lowercase r in rr or rrc means rounded
            if (rectType.includes('rr')) {
                rectObject.rounded = "true";
            }
        } else if (rectType.includes('R')) {
            // uppercase R with additional r means rounded
            if (rectType.includes('RR')) {
                rectObject.rounded = "true";
            }
        }
    }
    
    return rectObject;
}

  
function translateRawLine(rawLineString,isTouchAction=false) {
    // Check if this is a line item
    if (!rawLineString.startsWith('|l')) {
        throw new Error('Invalid line format: must start with |l');
    }
    
    // Remove the |l prefix
    const content = rawLineString.substring(2);
    
    let idx = 0; // default value
    let parts;
    
    // Check if idx is specified (starts with `)
    if (content.startsWith('`')) {
        // Extract idx and split remaining by ~
        const idxEnd = content.indexOf('~');
        idx = parseInt(content.substring(1, idxEnd));
        parts = content.substring(idxEnd + 1).split('~');
    } else {
        // No idx, split all by ~ and drop leading empty string
        parts = content.split('~');
        if (parts[0] === '') {
            parts = parts.slice(1);
        }
    }
    
    // Parse parts: [colour]~colDelta~rowDelta[~colOffset[~rowOffset]]
    const colour = parts[0] === '' ? undefined : parseInt(parts[0]);
    const xSize = parseFloat(parts[1]); // colDelta
    const ySize = parseFloat(parts[2]); // rowDelta
    
    let xOffset = 0;
    let yOffset = 0;
    
    // Handle isTouchAction transformations and invalid inputs
    if (parts.length > 3 && parts[3] !== '') {
        if (isTouchAction && parts[3] === 'c') {
            xOffset = 'COL';
        } else if (isTouchAction && parts[3] === 'r') {
            xOffset = 'ROW';
        } else if (!isNaN(parseFloat(parts[3]))) {
            xOffset = parseFloat(parts[3]);
        } else {
            xOffset = 0;
        }
    }
    
    if (parts.length > 4 && parts[4] !== '') {
        if (isTouchAction && parts[4] === 'c') {
            yOffset = 'COL';
        } else if (isTouchAction && parts[4] === 'r') {
            yOffset = 'ROW';
        } else if (!isNaN(parseFloat(parts[4]))) {
            yOffset = parseFloat(parts[4]);
        } else {
            yOffset = 0;
        }
    }
    
    // Create line object
    const lineObject = {
        type: "line",
        idx: idx
    };
    
    // Add colour if specified
    if (colour !== undefined && !isNaN(colour)) {
        lineObject.color = colour;
     } else {
      lineObject.color = -1;
     }
    
    // Add coordinates
    lineObject.xSize = xSize;
    lineObject.ySize = ySize;
    
    // Add offsets
    lineObject.xOffset = xOffset;
    lineObject.yOffset = yOffset;
    
    return lineObject;
}

function translateRawCircle(rawCircleString,isTouchAction=false) {
    // Parse circle type from prefix
    let circleType = '';
    let content = '';
    
    if (rawCircleString.startsWith('|C')) {
        circleType = 'C';
        content = rawCircleString.substring(2);
    } else if (rawCircleString.startsWith('|c')) {
        circleType = 'c';
        content = rawCircleString.substring(2);
    } else {
        throw new Error('Invalid circle format: must start with |c or |C');
    }
    
    let idx = 0; // default value
    let parts;
    
    // Check if idx is specified (starts with `)
    if (content.startsWith('`')) {
        // Extract idx and split remaining by ~
        const idxEnd = content.indexOf('~');
        idx = parseInt(content.substring(1, idxEnd));
        parts = content.substring(idxEnd + 1).split('~');
    } else {
        // No idx, split all by ~ and drop leading empty string
        parts = content.split('~');
        if (parts[0] === '') {
            parts = parts.slice(1);
        }
    }
    
    // Parse parts: [colour]~dRadius[~colOffset[~rowOffset]]
    const colour = parts[0] === '' ? undefined : parseInt(parts[0]);
    const radius = parseFloat(parts[1]); // dRadius
    
    let xOffset = 0;
    let yOffset = 0;
    
    // Handle isTouchAction transformations and invalid inputs
    if (parts.length > 2 && parts[2] !== '') {
        if (isTouchAction && parts[2] === 'c') {
            xOffset = 'COL';
        } else if (isTouchAction && parts[2] === 'r') {
            xOffset = 'ROW';
        } else if (!isNaN(parseFloat(parts[2]))) {
            xOffset = parseFloat(parts[2]);
        } else {
            xOffset = 0;
        }
    }
    
    if (parts.length > 3 && parts[3] !== '') {
        if (isTouchAction && parts[3] === 'c') {
            yOffset = 'COL';
        } else if (isTouchAction && parts[3] === 'r') {
            yOffset = 'ROW';
        } else if (!isNaN(parseFloat(parts[3]))) {
            yOffset = parseFloat(parts[3]);
        } else {
            yOffset = 0;
        }
    }
    
    // Create circle object
    const circleObject = {
        type: "circle",
        idx: idx
    };
    
    // Add colour if specified
    if (colour !== undefined && !isNaN(colour)) {
        circleObject.color = colour;
     } else {
      circleObject.color = -1;
    }
    
    // Add offsets
    circleObject.xOffset = xOffset;
    circleObject.yOffset = yOffset;
    
    // Add radius
    circleObject.radius = radius;
    
    // Add filled property if it's a filled circle
    if (circleType === 'C') {
        circleObject.filled = "true";
    }
    
    return circleObject;
}

function translateRawArc(rawArcString,isTouchAction=false) {
    // Parse arc type from prefix
    let arcType = '';
    let content = '';
    
    if (rawArcString.startsWith('|A')) {
        arcType = 'A';
        content = rawArcString.substring(2);
    } else if (rawArcString.startsWith('|a')) {
        arcType = 'a';
        content = rawArcString.substring(2);
    } else {
        throw new Error('Invalid arc format: must start with |a or |A');
    }
    
    let idx = 0; // default value
    let parts;
    
    // Check if idx is specified (starts with `)
    if (content.startsWith('`')) {
        // Extract idx and split remaining by ~
        const idxEnd = content.indexOf('~');
        idx = parseInt(content.substring(1, idxEnd));
        parts = content.substring(idxEnd + 1).split('~');
    } else {
        // No idx, split all by ~ and drop leading empty string
        parts = content.split('~');
        if (parts[0] === '') {
            parts = parts.slice(1);
        }
    }
    
    // Parse parts: [colour]~dArcAngle~dStartAngle~dRadius[~colOffset[~rowOffset]]
    const colour = parts[0] === '' ? undefined : parseInt(parts[0]);
    const angle = parseFloat(parts[1]); // dArcAngle
    const start = parseFloat(parts[2]); // dStartAngle
    const radius = parseFloat(parts[3]); // dRadius
    
    let xOffset = 0;
    let yOffset = 0;
    
    // Handle isTouchAction transformations and invalid inputs
    if (parts.length > 4 && parts[4] !== '') {
        if (isTouchAction && parts[4] === 'c') {
            xOffset = 'COL';
        } else if (isTouchAction && parts[4] === 'r') {
            xOffset = 'ROW';
        } else if (!isNaN(parseFloat(parts[4]))) {
            xOffset = parseFloat(parts[4]);
        } else {
            xOffset = 0;
        }
    }
    
    if (parts.length > 5 && parts[5] !== '') {
        if (isTouchAction && parts[5] === 'c') {
            yOffset = 'COL';
        } else if (isTouchAction && parts[5] === 'r') {
            yOffset = 'ROW';
        } else if (!isNaN(parseFloat(parts[5]))) {
            yOffset = parseFloat(parts[5]);
        } else {
            yOffset = 0;
        }
    }
    
    // Create arc object
    const arcObject = {
        type: "arc",
        idx: idx
    };
    
    // Add colour if specified
    if (colour !== undefined && !isNaN(colour)) {
        arcObject.color = colour;
     } else {
      arcObject.color = -1;
    }
    
    // Add offsets
    arcObject.xOffset = xOffset;
    arcObject.yOffset = yOffset;
    
    // Add arc properties
    arcObject.radius = radius;
    arcObject.start = start;
    arcObject.angle = angle;
    
    // Add filled property if it's a filled arc
    if (arcType === 'A') {
        arcObject.filled = "true";
    }
    
    return arcObject;
}

function translateRawText(rawTextString,isTouchAction=false) {
    // Check if this is a text item
    if (!rawTextString.startsWith('|t')) {
        throw new Error('Invalid text format: must start with |t');
    }
    
    // Remove the |t prefix
    const content = rawTextString.substring(2);
    
    let idx = 0; // default value
    let parts;
    
    // Check if idx is specified (starts with `)
    if (content.startsWith('`')) {
        // Extract idx and split remaining by ~
        const idxEnd = content.indexOf('~');
        idx = parseInt(content.substring(1, idxEnd));
        parts = content.substring(idxEnd + 1).split('~');
    } else {
        // No idx, split all by ~ and drop leading empty string
        parts = content.split('~');
        if (parts[0] === '') {
            parts = parts.slice(1);
        }
    }
    
    // Parse parts: [colour]~text[~colOffset[~rowOffset[~alignment]]]
    const colour = parts[0] === '' ? undefined : parseInt(parts[0]);
    const rawText = parts[1]; // text with HTML tags
    
    let xOffset = 0;
    let yOffset = 0;
    
    // Handle isTouchAction transformations and invalid inputs
    if (parts.length > 2 && parts[2] !== '') {
        if (isTouchAction && parts[2] === 'c') {
            xOffset = 'COL';
        } else if (isTouchAction && parts[2] === 'r') {
            xOffset = 'ROW';
        } else if (!isNaN(parseFloat(parts[2]))) {
            xOffset = parseFloat(parts[2]);
        } else {
            xOffset = 0;
        }
    }
    
    if (parts.length > 3 && parts[3] !== '') {
        if (isTouchAction && parts[3] === 'c') {
            yOffset = 'COL';
        } else if (isTouchAction && parts[3] === 'r') {
            yOffset = 'ROW';
        } else if (!isNaN(parseFloat(parts[3]))) {
            yOffset = parseFloat(parts[3]);
        } else {
            yOffset = 0;
        }
    }
    
    const alignment = parts.length > 4 && parts[4] !== '' ? parts[4] : 'center';
    
    // Tags are left in the text so the canvas renderer (parsePfodInlineSegments
    // in redraw.js) can apply them inline per segment.
    function parseTextFormatting(text) { return { text: text }; }

    const textInfo = parseTextFormatting(rawText);
    
    // Create text object
    const textObject = {
        type: "label",
        idx: idx
    };
    
    // Add colour if specified
    if (colour !== undefined && !isNaN(colour)) {
        textObject.color = colour;
     } else {
      textObject.color = -1;
    }
    
    // Add offsets
    textObject.xOffset = xOffset;
    textObject.yOffset = yOffset;
    
    // Add text content
    textObject.text = textInfo.text;
    
    // Add formatting properties if they exist
    if (textInfo.fontSize !== undefined) {
        textObject.fontSize = textInfo.fontSize;
    }
    if (textInfo.bold) {
        textObject.bold = "true";
    }
    if (textInfo.italic) {
        textObject.italic = "true";
    }
    if (textInfo.underline) {
        textObject.underline = "true";
    }
    
    // Add alignment if specified
    if (alignment) {
        const alignMap = { 'L': 'left', 'C': 'center', 'R': 'right' };
        textObject.align = alignMap[alignment] || 'center';
    }
    
    return textObject;
}

function translateRawValue(rawValueString,isTouchAction=false) {
    // Check if this is a value item
    if (!rawValueString.startsWith('|v')) {
        throw new Error('Invalid value format: must start with |v');
    }
    
    // Remove the |v prefix
    const content = rawValueString.substring(2);
    
    let idx = 0; // default value
    let parts;
    
    // Check if idx is specified (starts with `)
    if (content.startsWith('`')) {
        // Extract idx and split remaining by ~
        const idxEnd = content.indexOf('~');
        idx = parseInt(content.substring(1, idxEnd));
        parts = content.substring(idxEnd + 1).split('~');
    } else {
        // No idx, split all by ~ and drop leading empty string
        parts = content.split('~');
        if (parts[0] === '') {
            parts = parts.slice(1);
        }
    }
    
    // Rejoin parts and split by backtick to handle the ` separators properly
    const rejoined = parts.join('~');
    const backTickParts = rejoined.split('`');
    
    // Parse initial parts: [colour]~text~colOffset~rowOffset
    const initialParts = backTickParts[0].split('~');
    const colour = initialParts[0] === '' ? undefined : parseInt(initialParts[0]);
    const rawText = initialParts[1]; // text with HTML tags
    
    let xOffset = 0; // colOffset - required for values
    let yOffset = 0; // rowOffset - required for values
    
    // Handle isTouchAction transformations and invalid inputs for xOffset
    if (initialParts[2] !== undefined) {
        if (isTouchAction && initialParts[2] === 'c') {
            xOffset = 'COL';
        } else if (isTouchAction && initialParts[2] === 'r') {
            xOffset = 'ROW';
        } else if (!isNaN(parseFloat(initialParts[2]))) {
            xOffset = parseFloat(initialParts[2]);
        } else {
            xOffset = 0;
        }
    }
    
    // Handle isTouchAction transformations and invalid inputs for yOffset
    if (initialParts[3] !== undefined) {
        if (isTouchAction && initialParts[3] === 'c') {
            yOffset = 'COL';
        } else if (isTouchAction && initialParts[3] === 'r') {
            yOffset = 'ROW';
        } else if (!isNaN(parseFloat(initialParts[3]))) {
            yOffset = parseFloat(initialParts[3]);
        } else {
            yOffset = 0;
        }
    }
    
    // Parse value and units: value~units
    const valueAndUnits = backTickParts[1].split('~');

    let intValue = 0;
    if (valueAndUnits[0] !== undefined) {
        if (isTouchAction && valueAndUnits[0] === 'c') {
            intValue = 'COL';
        } else if (isTouchAction && valueAndUnits[0] === 'r') {
            intValue = 'ROW';
        } else if (!isNaN(parseFloat(valueAndUnits[0]))) {
            intValue = parseFloat(valueAndUnits[0]);
        } else {
            intValue = 0;
        }
    }
    
    const units = valueAndUnits[1];

    // Parse max value
    const maxValue = parseInt(backTickParts[2]);

    // Parse min and display range: min~displaymax~displaymin
    const minAndDisplay = backTickParts[3].split('~');
    const minValue = parseInt(minAndDisplay[0]);
    const displayMax = parseFloat(minAndDisplay[1]);
    const displayMin = parseFloat(minAndDisplay[2]);
    
    // Parse decimals and optional alignment: decimals~alignment
    const decimalsAndAlign = backTickParts[4].split('~');
    const decimals = parseInt(decimalsAndAlign[0]);
    const alignment = decimalsAndAlign.length > 1 ? decimalsAndAlign[1] : 'center';
    
    // Tags are left in the text so the canvas renderer (parsePfodInlineSegments
    // in redraw.js) can apply them inline per segment.
    function parseTextFormatting(text) { return { text: text }; }

    const textInfo = parseTextFormatting(rawText);
    
    // Create value object
    const valueObject = {
        type: "value",
        idx: idx
    };
    
    // Add colour if specified
    if (colour !== undefined && !isNaN(colour)) {
        valueObject.color = colour;
     } else {
      valueObject.color = -1;
    }
    
    // Add offsets
    valueObject.xOffset = xOffset;
    valueObject.yOffset = yOffset;
    
    // Add text content
    valueObject.text = textInfo.text;
    
    // Add formatting properties if they exist
    if (textInfo.fontSize !== undefined) {
        valueObject.fontSize = textInfo.fontSize;
    }
    if (textInfo.bold) {
        valueObject.bold = "true";
    }
    if (textInfo.italic) {
        valueObject.italic = "true";
    }
    if (textInfo.underline) {
        valueObject.underline = "true";
    }
    
    // Add value-specific properties
    valueObject.intValue = intValue;
    valueObject.min = minValue;
    valueObject.max = maxValue;
    valueObject.displayMin = displayMin;
    valueObject.displayMax = displayMax;
    valueObject.decimals = decimals;
    valueObject.units = units;
    
    // Add alignment if specified
    if (alignment) {
        const alignMap = { 'L': 'left', 'C': 'center', 'R': 'right' };
        valueObject.align = alignMap[alignment] || 'center';
    }
    
    return valueObject;
}

function translateRawHide(rawHideString) {
    // Check if this is a hide item
    if (!rawHideString.startsWith('|h')) {
        throw new Error('Invalid hide format: must start with |h');
    }
    
    // Remove the |h prefix
    const content = rawHideString.substring(2);
    
    // Create hide object
    const hideObject = {
        type: "hide"
    };
    
    // Check if idx is specified (starts with `) or cmd is specified (starts with ~)
    if (content.startsWith('`')) {
        // Extract idx
        const idx = parseInt(content.substring(1));
        hideObject.idx = idx;
    } else if (content.startsWith('~')) {
        // Extract cmd
        const cmd = content.substring(1);
        hideObject.cmd = cmd;
    } else {
        throw new Error('Invalid hide format: must specify either `idx or ~cmd');
    }
    
    return hideObject;
}

function translateRawUnhide(rawUnhideString) {
    // Check if this is an unhide item
    if (!rawUnhideString.startsWith('|uh')) {
        throw new Error('Invalid unhide format: must start with |uh');
    }
    
    // Remove the |uh prefix
    const content = rawUnhideString.substring(3);
    
    // Create unhide object
    const unhideObject = {
        type: "unhide"
    };
    
    // Check if idx is specified (starts with `) or cmd is specified (starts with ~)
    if (content.startsWith('`')) {
        // Extract idx
        const idx = parseInt(content.substring(1));
        unhideObject.idx = idx;
    } else if (content.startsWith('~')) {
        // Extract cmd
        const cmd = content.substring(1);
        unhideObject.cmd = cmd;
    } else {
        throw new Error('Invalid unhide format: must specify either `idx or ~cmd');
    }
    
    return unhideObject;
}

function translateRawErase(rawEraseString) {
    // Check if this is an erase item
    if (!rawEraseString.startsWith('|e')) {
        throw new Error('Invalid erase format: must start with |e');
    }
    
    // Remove the |e prefix
    const content = rawEraseString.substring(2);
    
    // Create erase object
    const eraseObject = {
        type: "erase"
    };
    
    // Check if idx is specified (starts with `) or cmd is specified (starts with ~)
    if (content.startsWith('`')) {
        // Extract idx
        const idx = parseInt(content.substring(1));
        eraseObject.idx = idx;
    } else if (content.startsWith('~')) {
        // Extract cmd
        const cmd = content.substring(1);
        eraseObject.cmd = cmd;
    } else {
        throw new Error('Invalid erase format: must specify either `idx or ~cmd');
    }
    
    return eraseObject;
}

function translateRawHideDwg(rawHideString) {
    // Check if this is a hide item
    if (!rawHideString.startsWith('|hd')) {
        throw new Error('Invalid hide dwg format: must start with |hd');
    }
    
    // Remove the |h prefix
    const content = rawHideString.substring(3);
    
    // Create hide object
    const hideObject = {
        type: "hide"
    };
    
    // Check if  cmd is specified (starts with ~)
    if (content.startsWith('~')) {
        // Extract cmd
        const cmd = content.substring(1);
        hideObject.cmd = cmd;
        hideObject.drawingName = cmd;
    } else {
        throw new Error('Invalid hide dwg format: must specify ~loadCmd');
    }
    
    return hideObject;
}

function translateRawUnhideDwg(rawUnhideString) {
    // Check if this is an unhide item
    if (!rawUnhideString.startsWith('|uhd')) {
        throw new Error('Invalid unhide dwg format: must start with |uhd');
    }
    
    // Remove the |uh prefix
    const content = rawUnhideString.substring(4);
    
    // Create unhide object
    const unhideObject = {
        type: "unhide"
    };
    
    // Check if cmd is specified (starts with ~)
    if (content.startsWith('~')) {
        // Extract cmd
        const cmd = content.substring(1);
        unhideObject.cmd = cmd;
        unhideObject.drawingName = cmd;
    } else {
        throw new Error('Invalid unhide dwg format: must specify ~loadCmd');
    }
    
    return unhideObject;
}

function translateRawEraseDwg(rawEraseString) {
    // Check if this is an erase item
    if (!rawEraseString.startsWith('|ed')) {
        throw new Error('Invalid erase dwg format: must start with |ed');
    }
    
    // Remove the |e prefix
    const content = rawEraseString.substring(3);
    
    // Create erase object
    const eraseObject = {
        type: "erase"
    };
    
    // Check if cmd is specified (starts with ~)
    if (content.startsWith('~')) {
        // Extract cmd
        const cmd = content.substring(1);
        eraseObject.cmd = cmd;
        eraseObject.drawingName = cmd;
    } else {
        throw new Error('Invalid erase format: must specify ~loadCmd');
    }
    
    return eraseObject;
}


function translateRawZero(rawZeroString) {
    // Check if this is a zero item
    if (!rawZeroString.startsWith('|z')) {
        throw new Error('Invalid zero format: must start with |z');
    }
    
    // Remove the |z prefix
    const content = rawZeroString.substring(2);
    
    // Check if this is a pop (no content) or push (has content)
    if (content === '') {
        // This is a pop operation
        return {
            type: "popZero"
        };
    } else {
        // This is a push operation - parse the parameters
        // Format: ~ col ~ row ~ scaling
        let x = 0;
        let y = 0;
        let scale = 1.0;
        
        if (content.startsWith('~')) {
           //throw new Error('Invalid pushZero format: must start with ~ after |z'); 
          // Split by ~ and remove empty first element
          const parts = content.split('~').slice(1);
          if (parts.length >= 1) { 
            x = parseFloat(parts[0]); // col
          }
          if (parts.length >= 2) { 
            y = parseFloat(parts[1]); // row
          }
          if (parts.length >= 3) { 
            scale = parseFloat(parts[2]); // scaling
          }
          if (parts.length > 3) {
            throw new Error('Invalid pushZero format: must have no more then 3 parameters (col, row, scaling)');
          }
        }
        return {
            type: "pushZero",
            x: x,
            y: y,
            scale: scale
        };
    }
}


function translateRawIndex(rawIndexString) {
    // Check if this is an index item
    if (!rawIndexString.startsWith('|i')) {
        throw new Error('Invalid index format: must start with |i');
    }
    
    // Remove the |i prefix
    const content = rawIndexString.substring(2);
    
    // Create index object
    const indexObject = {
        type: "index"
    };
    
    // Check if idx is specified (must start with `)
    if (content.startsWith('`')) {
        // Extract idx
        const idx = parseInt(content.substring(1));
        indexObject.idx = idx;
    } else {
        throw new Error('Invalid index format: must specify `idx');
    }
    
    return indexObject;
}

function translateRawTouchZone(rawTouchZoneString) {
    // Parse touchZone type from prefix
    let touchZoneType = '';
    let content = '';
    
    if (rawTouchZoneString.startsWith('|xc')) {
        touchZoneType = 'xc';
        content = rawTouchZoneString.substring(3);
    } else if (rawTouchZoneString.startsWith('|x')) {
        touchZoneType = 'x';
        content = rawTouchZoneString.substring(2);
    } else {
        throw new Error('Invalid touchZone format: must start with |x or |xc');
    }
    
    let idx = 0; // default value
    let parts;
    
    // Check if idx is specified (starts with `)
    if (content.startsWith('`')) {
        // Extract idx and split remaining by ~
        const idxEnd = content.indexOf('~');
        idx = parseInt(content.substring(1, idxEnd));
        parts = content.substring(idxEnd + 1).split('~');
    } else {
        // No idx, split all by ~ and drop leading empty string
        parts = content.split('~');
        if (parts[0] === '') {
            parts = parts.slice(1);
        }
    }
    
    // Handle the case where filter is specified with backtick
    // Format: cmd ~ width ~ height [ ~ colOffset [ ~ rowOffset ]] [`filter]
    let filterPart = '';
    const lastPart = parts[parts.length - 1];
    if (lastPart && lastPart.includes('`')) {
        // Extract filter from last part
        const backTickIndex = lastPart.indexOf('`');
        filterPart = lastPart.substring(backTickIndex + 1);
        parts[parts.length - 1] = lastPart.substring(0, backTickIndex);
    }
    
    // Parse parts: cmd~width~height[~colOffset[~rowOffset]]
    const cmd = parts[0]; // cmd
    const xSize = parseFloat(parts[1]); // width
    const ySize = parseFloat(parts[2]); // height
    const xOffset = parts.length > 3 && parts[3] !== '' ? parseFloat(parts[3]) : undefined;
    const yOffset = parts.length > 4 && parts[4] !== '' ? parseFloat(parts[4]) : undefined;
    
    // Create touchZone object
    const touchZoneObject = {
        type: "touchZone",
        xSize: xSize,
        ySize: ySize,
        cmd: cmd,
        idx: idx
    };
    
    // Add offsets if they exist
    if (xOffset !== undefined) {
        touchZoneObject.xOffset = xOffset;
    }
    if (yOffset !== undefined) {
        touchZoneObject.yOffset = yOffset;
    }
    
    // Add filter if specified
    if (filterPart !== '') {
        touchZoneObject.filter = parseInt(filterPart);
    }
    
    // Add centered property if it's a centered touchZone
    if (touchZoneType === 'xc') {
        touchZoneObject.centered = "true";
    }
    
    return touchZoneObject;
}

function translateRawInsertDwg(rawInsertDwgString) {
    // Check if this is an insertDwg item
    if (!rawInsertDwgString.startsWith('|d')) {
        throw new Error('Invalid insertDwg format: must start with |d');
    }
    
    // Remove the |d prefix
    const content = rawInsertDwgString.substring(2);
    
    // InsertDwg format: |d ~ loadcmd ~ ~ colOffset ~ rowOffset
    // Note: there's an empty field between loadcmd and colOffset
    if (!content.startsWith('~')) {
        throw new Error('Invalid insertDwg format: must start with ~ after |d');
    }
    
    // Split by ~ and remove empty first element
    const parts = content.split('~').slice(1);
    
    if (parts.length !== 4) {
        throw new Error('Invalid insertDwg format: must have exactly 4 parameters (loadcmd, empty, colOffset, rowOffset)');
    }
    
    // Parse parts: loadcmd ~ ~ colOffset ~ rowOffset
    const drawingName = parts[0]; // loadcmd (drawing name)
    // parts[1] is empty (intentional gap in format)
    const xOffset = parts[2] === '' ? 0 : parseFloat(parts[2]); // colOffset
    const yOffset = parts[3] === '' ? 0 : parseFloat(parts[3]); // rowOffset
    
    // Create insertDwg object
    const insertDwgObject = {
        type: "insertDwg",
        drawingName: drawingName,
        cmd: drawingName,
        cmdName: drawingName,
        xOffset: xOffset,
        yOffset: yOffset
    };
    
    return insertDwgObject;
}

function translateRawTouchActionInput(rawTouchActionInputString) {
    // Check if this is a touchActionInput item
    if (!rawTouchActionInputString.startsWith('|XI')) {
        throw new Error('Invalid touchActionInput format: must start with |XI');
    }
    
    // Remove the |XI prefix
    const content = rawTouchActionInputString.substring(3);
    
    // TouchActionInput format: |XI ~ cmd ~ prompt [`idxOfTextItem]
    if (!content.startsWith('~')) {
        throw new Error('Invalid touchActionInput format: must start with ~ after |XI');
    }
    
    // Split by ~ to get cmd and prompt, then handle backtick separation for textIdx
    const parts = content.split('~').slice(1); // Remove empty first element
    
    if (parts.length < 2) {
        throw new Error('Invalid touchActionInput format: must have at least cmd and prompt');
    }
    
    const cmd = parts[0];
    const promptWithIdx = parts[1]; // This may contain `textIdx at the end
    
    // Check if textIdx is specified (contains `)
    let prompt = promptWithIdx;
    let textIdx = undefined;
    
    if (promptWithIdx.includes('`')) {
        const backTickIndex = promptWithIdx.lastIndexOf('`');
        prompt = promptWithIdx.substring(0, backTickIndex);
        textIdx = parseInt(promptWithIdx.substring(backTickIndex + 1));
    }
    
    // Parse HTML-style formatting tags from prompt.
    //
    // Only <bg N> is extracted here because it controls the dialog title's *element*
    // background — it cannot be rendered inline as a text span.  All other format tags
    // (<b>, <i>, <u>, <+N>, <-N>, <colorCode>, <bw>) are intentionally left in the
    // prompt text and are parsed inline by pfodSetFormattedText() when the dialog
    // renders the prompt, so embedded tags like "A <+3>Large Text" produce mixed-size
    // text rather than re-sizing the whole prompt.
    function parsePromptFormatting(text) {
        const result = {
            text: text,
            backgroundColor: undefined
        };

        const bgColorMatch = text.match(/<bg\s+(\d+)>/);
        if (bgColorMatch) {
            result.backgroundColor = parseInt(bgColorMatch[1]);
            result.text = result.text.replace(/<bg\s+\d+>/g, '').replace(/<\\bg\s+\d+>/g, '');
        }

        return result;
    }

    const promptInfo = parsePromptFormatting(prompt);

    // Create touchActionInput object
    const touchActionInputObject = {
        type: "touchActionInput",
        cmd: cmd,
        prompt: promptInfo.text
    };

    // Add textIdx if specified
    if (textIdx !== undefined) {
        touchActionInputObject.textIdx = textIdx;
    }

    if (promptInfo.backgroundColor !== undefined) {
        touchActionInputObject.backgroundColor = promptInfo.backgroundColor;
    }

    return touchActionInputObject;
}

function translateRawTouchAction(rawTouchActionString) {
    // Check if this is a touchAction item
    if (!rawTouchActionString.startsWith('|X')) {
        throw new Error('Invalid touchAction format: must start with |X');
    }
    
    // Remove the |X prefix
    const content = rawTouchActionString.substring(2);
    
    // TouchAction format: |X ~ cmd ~ DrawingPrimitive
    if (!content.startsWith('~')) {
        throw new Error('Invalid touchAction format: must start with ~ after |X');
    }
    
    // Split by ~ and get cmd and the rest
    const firstTildeIndex = content.indexOf('~');
    const secondTildeIndex = content.indexOf('~', firstTildeIndex + 1);
    
    if (secondTildeIndex === -1) {
        throw new Error('Invalid touchAction format: must have cmd and primitive');
    }
    
    const cmd = content.substring(1, secondTildeIndex); // Extract cmd between first ~ and second ~
    const primitiveRaw = '|' + content.substring(secondTildeIndex + 1); // Reconstruct primitive with | prefix
    
    // Use existing translators to parse the drawing primitive
    let drawingPrimitive;
    
    try {
        // Remove the idx from the primitive if it exists, since touchAction primitives don't use idx
        let cleanPrimitiveRaw = primitiveRaw;        
        drawingPrimitive = translateRawItem(cleanPrimitiveRaw,true); // true if touchAction else default false
                
    } catch (error) {
        throw new Error(`Failed to parse touchAction primitive: ${error.message}`);
    }
    
    // Create touchAction object
    const touchActionObject = {
        type: "touchAction",
        cmd: cmd,
        action: [drawingPrimitive]
    };
    
    return touchActionObject;
}

function translateRawItem(rawItemString, isTouchAction = false) {
    // Determine the item type and call appropriate function
    if (rawItemString.startsWith('|l')) {
        return translateRawLine(rawItemString,isTouchAction);
    } else if (rawItemString.startsWith('|r') || rawItemString.startsWith('|R')) {
        return translateRawRectangle(rawItemString,isTouchAction);
    } else if (rawItemString.startsWith('|c') || rawItemString.startsWith('|C')) {
        return translateRawCircle(rawItemString,isTouchAction);
    } else if (rawItemString.startsWith('|a') || rawItemString.startsWith('|A')) {
        return translateRawArc(rawItemString,isTouchAction);
    } else if (rawItemString.startsWith('|t')) {
        return translateRawText(rawItemString,isTouchAction);
    } else if (rawItemString.startsWith('|v')) {
        return translateRawValue(rawItemString,isTouchAction);
// check these first        
    } else if (rawItemString.startsWith('|uhd')) {
        return translateRawUnhideDwg(rawItemString,isTouchAction);
    } else if (rawItemString.startsWith('|hd')) {
        return translateRawHideDwg(rawItemString,isTouchAction);
    } else if (rawItemString.startsWith('|ed')) {
        return translateRawEraseDwg(rawItemString);
// then check these        
    } else if (rawItemString.startsWith('|uh')) {
        return translateRawUnhide(rawItemString,isTouchAction);
    } else if (rawItemString.startsWith('|h')) {
        return translateRawHide(rawItemString,isTouchAction);
    } else if (rawItemString.startsWith('|e')) {
        return translateRawErase(rawItemString);

        
    } else if (rawItemString.startsWith('|z')) {
        return translateRawZero(rawItemString);
    } else if (rawItemString.startsWith('|xc') || rawItemString.startsWith('|x')) {
        return translateRawTouchZone(rawItemString);
    } else if (rawItemString.startsWith('|i')) {
        return translateRawIndex(rawItemString);
    } else if (rawItemString.startsWith('|d')) {
        return translateRawInsertDwg(rawItemString);
    } else if (rawItemString.startsWith('|XI')) {
        return translateRawTouchActionInput(rawItemString);
    } else if (rawItemString.startsWith('|X')) {
        return translateRawTouchAction(rawItemString);
    } else {
        throw new Error('Unknown item type: must start with |l (line), |r/|R (rectangle), |c/|C (circle), |a/|A (arc), |t (text), |v (value), |h (hide), |uh (unhide), |z (push/pop), |x/|xc (touchZone), |e (erase), |i (index), |d (insertDwg), |XI (touchActionInput), or |X (touchAction)');
    }
}


// returns null no not match else returns either start or update with empty itmes
function translateDwgResponse(cmd) {
  let cmdString = cmd.shift();
  if (!cmdString || typeof cmdString !== 'string' || !cmdString.startsWith("{+")) {
      console.error(`Error translating dwg response : "${cmdString}"`);
      const result = {
         error: 'msgType_invalid',
         message: `Expected dwg but received "${cmdString}"`,
         pfodDrawing: 'error'
       };
      return result;
  }
    cmdString.trim();
    
    const updatePattern = /^\{\+(~(m)?)?$/;
    const matchUpdate = cmdString.match(updatePattern);
    if (matchUpdate) {
        return {
            pfodDrawing: "update",
            js_ver: window.JS_VERSION,
            more: matchUpdate[2] === 'm' ? true : false,
            raw_items: []
        };
    }
    // else
    const regex = /^\{\+(?:(\d+)`(\d+)`(\d+))?(~(m)?)?(`?(\d+)?~(.*))?$/;
    const match = cmdString.match(regex);

    if (!match) {
        console.error(`Error match failed for dwg response : "${cmdString}"`);
         const result = {
         error: 'dwg_invalid',
         message: `Expected dwg response but received "${cmdString}"`,
         pfodDrawing: 'error'
       };
      return result;
    }

    const [, colorNo, cols, rows, , more, , refreshMs, version] = match;

    return {
        pfodDrawing: "start",
        js_ver: window.JS_VERSION,
        version: version || "",
        x: cols ? parseInt(cols, 10) : undefined,
        y: rows ? parseInt(rows, 10) : undefined,
        color: colorNo ? parseInt(colorNo, 10) : 0,
        refresh: refreshMs ? parseInt(refreshMs, 10) : 0,
        more: more === 'm',
        raw_items: []
    };
}

    
function translateRawItemsToItemArray(rawData) {
    console.log(`Called translateRawItemsToItemArray with `, JSON.stringify(rawData, null, 2));

    const result = {
        pfodDrawing: rawData.pfodDrawing,
        //js_ver: rawData.js_ver,  // rawData does not have js_ver
        js_ver: window.JS_VERSION,  // use pfodWeb.js version
        name: rawData.name,
        version: rawData.version,
        x: rawData.x,
        y: rawData.y,
        color: rawData.color,
        refresh: rawData.refresh,
        items: []
    };

    // Process each raw item
    // upto first }
    let skipRest = false;
    rawData.raw_items.forEach((rawItem, index) => {
        // stop when rawItem is "}" end of pfod cmd
        if (rawItem == '}') {
          if (!skipRest) {
           skipRest = true;
           console.log(`End of cmd "}" at line  ${index + 2}`);
          } else {
           console.log(`Skipping raw_items after "}",  ${index + 2}: "${rawItem}":`);
          }           
        } else {
         if (!skipRest) {
          // Ignore empty items.  A trailing '|' immediately before the closing
          // '}' (e.g. "...|C`41~12~1~~|}") splits into a lone "|" segment — a
          // pipe with no type char.  That is a valid/empty pfod item (pfodApp
          // tolerates it); treat it the same as a blank segment instead of
          // throwing "Unknown item type" and aborting the whole drawing.
          if (rawItem && rawItem.trim() !== '' && rawItem.trim() !== '|') {
            try {
                const translatedItem = translateRawItem(rawItem);
                result.items.push(translatedItem);
            } catch (itemError) {
                console.error(`Error translating raw_items at line ${index + 2}: "${rawItem}":`, itemError.message);
                throw new Error(`Translation failed at line ${index + 2}: ${itemError.message}`);
            }
          }
         } else {
           console.log(`Skipping raw_items after "}",  ${index + 2}: "${rawItem}":`);
         }
        }
    });
    console.log(`Translated JSON:\n`, JSON.stringify(result,null,2));
    
    return result;
}

    // Browser environment
window.translateRawItemsToItemArray = translateRawItemsToItemArray;
