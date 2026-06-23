/*
   pfodMenuParser.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// pfod Menu Parser — parses a pfod menu cmd array into a structured menu object.
//
// Exports:    window.pfodParseMenu(cmdArray) function, window.parsePfodFormatCodes(str) function
// Depends on: pfodColorTagToHex(), PFOD_COLOR_NAME_TO_INDEX from redraw.js (must load first)
// Called by:  responseHandlers.js (processMenuResponse uses window.pfodParseMenu),
//             pfodMenuDisplay.js (show/update use window.pfodParseMenu)

/**
 * Parse pfod format codes from the start of a string.
 * Handles angle-bracket tags: <bg color>, <b>, <i>, <u>, <+N>, <-N>, <colorCode>
 * Also handles bare non-sticky flags after cmd: ! (disable), - (hide), + (flash), @ (sound)
 *
 * @param {string} str - Input string potentially starting with format codes
 * @returns {{bgColor: string|null, textColor: string|null, bold: boolean, italic: boolean,
 *            underline: boolean, fontSize: number, disabled: boolean, hidden: boolean, remaining: string}}
 */
function parsePfodFormatCodes(str) {
    const result = {
        bgColor: null,
        textColor: null,
        bold: false,
        italic: false,
        underline: false,
        fontSize: 0,
        disabled: false,
        hidden: false,
        flash: false,
        sound: false,
        remaining: str
    };

    let s = str;
    let changed = true;
    while (changed && s.length > 0) {
        changed = false;

        if (s.startsWith('<')) {
            // Angle-bracket format code
            const close = s.indexOf('>');
            if (close === -1) break;
            const tag = s.substring(1, close);
            s = s.substring(close + 1);
            changed = true;

            if (tag === 'b') {
                result.bold = true;
            } else if (tag === 'i') {
                result.italic = true;
            } else if (tag === 'u') {
                result.underline = true;
            } else if (tag.startsWith('bg ')) {
                // Background color tag: <bg colorCode>
                const colorStr = tag.substring(3).trim();
                result.bgColor = pfodColorTagToHex(colorStr);
            } else if (/^\+\d+$/.test(tag)) {
                // Font size increase: <+N>
                result.fontSize += parseInt(tag.substring(1), 10);
            } else if (/^-\d+$/.test(tag)) {
                // Font size decrease: <-N>
                result.fontSize -= parseInt(tag.substring(1), 10);
            } else {
                // Try as text color code (named, hex, or palette number)
                const hex = pfodColorTagToHex(tag);
                if (hex) {
                    result.textColor = hex;
                }
                // Unknown tags are silently skipped
            }
        } else if (s.startsWith('!')) {
            // Bare ! after cmd = disabled (non-sticky flag)
            result.disabled = true;
            s = s.substring(1);
            changed = true;
        } else if (s.startsWith('-')) {
            // Bare - after cmd = hidden (non-sticky flag)
            result.hidden = true;
            s = s.substring(1);
            changed = true;
        } else if (s.startsWith('+')) {
            // Bare + after cmd = flash at 1Hz (non-sticky flag)
            result.flash = true;
            s = s.substring(1);
            changed = true;
        } else if (s.startsWith('@')) {
            // Bare @ after cmd = play ping sound on each refresh (non-sticky flag)
            result.sound = true;
            s = s.substring(1);
            changed = true;
        }
    }

    result.remaining = s;
    return result;
}

/**
 * Parse a pfod cmd identifier from the start of a string.
 * A cmd is either '.' or starts with [a-zA-Z_] followed by [a-zA-Z0-9_]*
 *
 * @param {string} str - Input string
 * @returns {{cmd: string, remaining: string}}
 */
function parsePfodCmd(str) {
    if (str.length === 0) {
        return { cmd: '', remaining: str };
    }
    if (str[0] === '.') {
        return { cmd: '.', remaining: str.substring(1) };
    }
    if (!/[a-zA-Z_]/.test(str[0])) {
        return { cmd: '', remaining: str };
    }
    let i = 0;
    while (i < str.length && /[a-zA-Z0-9_]/.test(str[i])) {
        i++;
    }
    return { cmd: str.substring(0, i), remaining: str.substring(i) };
}

/**
 * Parse a single pfod menu item string (must start with '|').
 * Handles all item types: button, label, nav button, drawing item, drawing label,
 * toggle/slider buttons and labels.
 *
 * @param {string} itemStr - Raw item string starting with '|'
 * @returns {object|null} Parsed item object, or null if invalid
 */
function parsePfodMenuItem(itemStr) {
    if (!itemStr || !itemStr.startsWith('|')) {
        return null;
    }
    let str = itemStr.substring(1); // Remove leading '|'

    // Determine item type from type-prefix characters before the cmd
    let itemType = 'button'; // default

    if (str.startsWith('!+') || str.startsWith('+!')) {
        // Drawing label: non-interactive drawing item
        itemType = 'dwg-label';
        str = str.substring(2);
    } else if (str.startsWith('+')) {
        // Drawing menu item
        itemType = 'dwg';
        str = str.substring(1);
    } else if (str.startsWith('!')) {
        // Label (non-interactive)
        itemType = 'label';
        str = str.substring(1);
    } else if (str.startsWith('^')) {
        // Navigation button
        itemType = 'nav';
        str = str.substring(1);
    }

    // Extract the cmd identifier
    const cmdResult = parsePfodCmd(str);
    const cmd = cmdResult.cmd;
    str = cmdResult.remaining;

    // Drawing items have format: [<format codes>]~loadCmd
    // Format codes (e.g. <bg gy>) may appear between the cmd and the ~loadCmd separator.
    if (itemType === 'dwg' || itemType === 'dwg-label') {
        const fmt = parsePfodFormatCodes(str);
        let remaining = fmt.remaining;
        let loadCmd = '';
        if (!remaining.startsWith('~') && remaining.includes('~')) {
            console.error(`[MENU_PARSER] Unrecognised characters before ~ in dwg item "${itemStr}": "${remaining.substring(0, remaining.indexOf('~'))}"`);
            remaining = remaining.substring(remaining.indexOf('~'));
        }
        if (remaining.startsWith('~')) {
            loadCmd = remaining.substring(1).trim();
        }
        return { type: itemType, cmd: cmd, loadCmd: loadCmd, formats: {
            bgColor: fmt.bgColor,
            textColor: fmt.textColor,
            bold: fmt.bold,
            italic: fmt.italic,
            underline: fmt.underline,
            fontSize: fmt.fontSize,
            disabled: fmt.disabled,
            hidden: fmt.hidden,
            flash: fmt.flash,
            sound: fmt.sound
        }};
    }

    // Parse pre-~ format slot: bare flags and <bg ...> go into slot fmt;
    // ALL other angle-bracket codes (font size, text color, bold/italic/underline)
    // are accumulated as inlineFmtPrefix so they are prepended to the first
    // text field.  This matches pfodApp behaviour: <fmt> before ~ applies to
    // the text content, not the element container.  Only <bg ...> stays as a
    // slot attribute because pfodSetFormattedText does not handle it inline.
    const fmt = {
        bgColor: null, textColor: null, bold: false, italic: false,
        underline: false, fontSize: 0,
        disabled: false, hidden: false, flash: false, sound: false
    };
    let inlineFmtPrefix = '';
    while (str.length > 0) {
        if (str[0] === '!') { fmt.disabled = true; str = str.substring(1); }
        else if (str[0] === '-') { fmt.hidden  = true; str = str.substring(1); }
        else if (str[0] === '+') { fmt.flash   = true; str = str.substring(1); }
        else if (str[0] === '@') { fmt.sound   = true; str = str.substring(1); }
        else if (str[0] === '<') {
            const close = str.indexOf('>');
            if (close === -1) break;
            const tag     = str.substring(1, close);
            const fullTag = str.substring(0, close + 1);
            str = str.substring(close + 1);
            if (tag.startsWith('bg ')) {
                fmt.bgColor = pfodColorTagToHex(tag.substring(3).trim());
            } else {
                inlineFmtPrefix += fullTag;
            }
        } else {
            break;
        }
    }

    // Collect backtick (integer) and tilde (text) fields in the order they appear.
    // Text fields are interpreted positionally regardless of whether they appear before
    // or after backtick fields:
    //   textFields[0] = leading
    //   textFields[1] = trailing
    //   textFields[2] = maxScaleStr
    //   textFields[3] = minScaleStr
    // To omit trailing while still specifying maxScale, the device must emit an empty
    // ~ field for trailing so the positional count stays correct.
    const intFields = [];
    const textFields = [];
    while (str.length > 0) {
        // Skip whitespace before each separator.  pfodDesignerV2 emits
        // e.g. `|OB<bg bk> `<setter>~…` (PulseMsgProcessor.java line
        // 261) where a literal space sits between the format slot and
        // the first backtick.  pfodApp tolerates the space; without
        // this skip pfodWeb would never enter the int-field loop and
        // toggle/slider detection would fail.
        while (str.length > 0 && (str[0] === ' ' || str[0] === '\t')) {
            str = str.substring(1);
        }
        if (str.length === 0) break;
        if (str[0] !== '`' && str[0] !== '~') break;
        const isInt = str[0] === '`';
        str = str.substring(1);
        const end = str.search(/[`~]/);
        const fieldEnd = end === -1 ? str.length : end;
        const field = str.substring(0, fieldEnd);
        // Int field contents get trimmed before consumers parseInt
        // them — Java sometimes emits the int with surrounding
        // whitespace (e.g. PulseMsgProcessor pads via the same
        // formatting helpers it uses for text).  parseInt's own
        // whitespace skipping handles leading-space-then-digits but
        // misses cases where the trim should normalise other
        // consumers reading the raw field too.  Text fields are
        // left intact — spaces inside `~ min~9` etc. are meaningful.
        if (isInt) intFields.push(field.trim());
        else       textFields.push(field);
        str = str.substring(fieldEnd);
    }

    // Prepend any pre-~ inline format codes (non-background) to the first text
    // field so they take effect in pfodSetFormattedText, not via CSS on the
    // container element.  For items with no text field yet (no ~ in the item
    // string) the prefix alone becomes the first field; the spacer rule below
    // will then append a space if needed.
    if (inlineFmtPrefix) {
        if (textFields.length > 0) {
            textFields[0] = inlineFmtPrefix + textFields[0];
        } else {
            textFields.push(inlineFmtPrefix);
        }
    }

    // Spacer rule (spacerChanges.txt): a label item with no visible text —
    // covering all six forms:
    //   |!<cmd>|            |!<cmd><fmt>|
    //   |!<cmd>~|           |!<cmd><fmt>~|
    //   |!<cmd>~<fmt>|      |!<cmd><fmt>~<fmts>|
    // In the last two cases textFields[0] contains only format-code tags
    // (e.g. "<bg gy>") with no actual text remaining after stripping them.
    // All are normalised to a single-space so the element is visible.
    // Without any text pfodApp does not show the label at all.
    // Only applied before toggle/slider promotion so toggle-labels and
    // numeric-slider-labels are unaffected.
    if (itemType === 'label') {
        const raw = textFields.length > 0 ? textFields[0] : '';
        const hasVisibleText = raw !== '' && parsePfodFormatCodes(raw).remaining !== '';
        if (!hasVisibleText) {
            // Append a space rather than replacing so that any inline format
            // codes already in the field (e.g. <+14> for a large spacer) are
            // preserved.  For an empty field this simply yields ' '.
            if (textFields.length === 0) textFields.push(raw + ' ');
            else textFields[0] = raw + ' ';
        }
    }

    // Detect numeric slider: 2+ backtick fields (currentValue, maxValue [, minValue]).
    // minValue defaults to 0 if omitted.
    // maxScaleStr defaults to String(maxValue) if omitted.
    // minScaleStr defaults to String(minValue) if omitted.
    // Check this before toggle detection — numeric slider requires >= 2 intFields (toggle has 1).
    let numericSliderData = null;
    let toggleData = null;
    if (intFields.length >= 2) {
        const currentValue = parseInt(intFields[0], 10);
        const maxValue     = parseInt(intFields[1], 10);
        const rawMinValue  = intFields.length >= 3 ? parseInt(intFields[2], 10) : 0;
        const computedMaxValue = isNaN(maxValue)    ? 100 : maxValue;
        const computedMinValue = isNaN(rawMinValue) ? 0   : rawMinValue;
        numericSliderData = {
            currentValue: isNaN(currentValue) ? 0 : currentValue,
            maxValue:     computedMaxValue,
            minValue:     computedMinValue,
            leading:      textFields[0] !== undefined ? textFields[0] : '',
            trailing:     textFields[1] !== undefined ? textFields[1] : '',
            maxScaleStr:  textFields[2] !== undefined ? textFields[2] : String(computedMaxValue),
            minScaleStr:  textFields[3] !== undefined ? textFields[3] : String(computedMinValue),
            // 5th tilde field: 's' = slider only, 't' = text only, '' = both
            format:       textFields[4] !== undefined ? textFields[4].trim() : ''
        };
        if (itemType === 'button') itemType = 'numeric-slider-button';
        else if (itemType === 'label') itemType = 'numeric-slider-label';

    // Detect toggle button/label items: have a backtick-integer index field AND at least
    // 3 tilde-text fields (leading, trailing, options-string [, format]).
    } else if (intFields.length >= 1 && textFields.length >= 3) {
        let optStr = textFields[2];
        // Decode pfod pipe escape (&#124;) so the | split works
        optStr = optStr.replace(/&#124;/g, '|');
        // Split options on | (spec separator, after decoding) or \ (used in practice)
        const options = optStr.includes('|') ? optStr.split('|') : optStr.split('\\');
        // Format field: 't' = text only (no slider), 's' = slider only, else both
        const fmtChar = textFields.length >= 4 ? textFields[3].trim() : '';
        const rawIdx = parseInt(intFields[0], 10);
        toggleData = {
            idx: isNaN(rawIdx) ? 0 : Math.max(0, Math.min(rawIdx, Math.max(0, options.length - 1))),
            options,
            format: fmtChar,
            leading: textFields[0],
            trailing: textFields[1]
        };
        if (itemType === 'button') itemType = 'toggle-button';
        else if (itemType === 'label') itemType = 'toggle-label';
    }

    return {
        type: itemType,
        cmd: cmd,
        formats: {
            bgColor: fmt.bgColor,
            textColor: fmt.textColor,
            bold: fmt.bold,
            italic: fmt.italic,
            underline: fmt.underline,
            fontSize: fmt.fontSize,
            disabled: fmt.disabled,
            hidden: fmt.hidden,
            flash: fmt.flash,
            sound: fmt.sound
        },
        // Primary display text (first text field)
        text: textFields.length > 0 ? textFields[0] : '',
        // Raw integer fields (for toggle/slider current value, max, min)
        intFields: intFields,
        // All text fields (for toggle options, leading/trailing text, etc.)
        textFields: textFields,
        // Parsed toggle data (null for non-toggle items)
        toggleData: toggleData,
        // Parsed numeric slider data (null for non-numeric-slider items)
        numericSliderData: numericSliderData
    };
}

/**
 * Parse the pfod menu header (first element of the cmd array).
 * Header format: {,[<bgColour>][<promptFormat>]~<title>[`<re-requestTime ms>][~<version>]
 *
 * @param {string} headerStr - Header like "{,<bg s><+2><bl>~this is the prompt`0~V1"
 * @returns {{isUpdate: boolean, bgColor: string|null, promptFormat: object,
 *            title: string, reRequestMs: number, version: string}}
 */
function parsePfodMenuHeader(headerStr) {
    let str = headerStr || '';
    const isUpdate = str.startsWith('{;');

    // Remove the leading {, or {; delimiter
    if (str.startsWith('{,') || str.startsWith('{;')) {
        str = str.substring(2);
    }

    // Parse menu-level format codes (before the first '~')
    const fmt = parsePfodFormatCodes(str);
    str = fmt.remaining;

    // Parse title (after '~')
    let title = '';
    let reRequestMs = null; // null = no backtick field present; 0 = explicitly disabled
    let version = '';

    if (str.startsWith('~')) {
        str = str.substring(1);
        const end = str.search(/[`~]/);
        const titleEnd = end === -1 ? str.length : end;
        title = str.substring(0, titleEnd);
        str = str.substring(titleEnd);
    }

    // Extract backtick re-request field from anywhere in the remaining string.
    // The ` delimiter is unique, so it can appear before or after the version ~field.
    const btIdx = str.indexOf('`');
    if (btIdx !== -1) {
        const afterBt = str.substring(btIdx + 1);
        const numEnd = (function() { const e = afterBt.search(/[`~|]/); return e === -1 ? afterBt.length : e; })();
        const ms = parseInt(afterBt.substring(0, numEnd), 10);
        if (!isNaN(ms)) reRequestMs = ms;
        str = str.substring(0, btIdx) + str.substring(btIdx + numEnd + 1);
    }

    // Parse version string (second '~' field, optional — omitted when version is empty).
    // When title is empty the header has '~~V...' — after title extraction str starts with '~~'.
    // Strip one extra leading '~' so '~~V361' yields 'V361' not '~V361'.
    if (str.startsWith('~')) {
        let v = str.substring(1);
        if (v.startsWith('~')) v = v.substring(1);
        version = v.trim();
    }

    return {
        isUpdate: isUpdate,
        bgColor: fmt.bgColor,
        promptFormat: {
            textColor: fmt.textColor,
            bold: fmt.bold,
            italic: fmt.italic,
            underline: fmt.underline,
            fontSize: fmt.fontSize,
            // Non-sticky flags `+` (flash) and `@` (sound) applied to
            // the screen-format prefix.  pfodMenuDisplay uses these:
            // flash → animates the prompt text on/off; sound → plays
            // the ping sound on each menu render.
            flash: fmt.flash,
            sound: fmt.sound
        },
        title: title,
        reRequestMs: reRequestMs,
        version: version
    };
}

/**
 * Parse a complete pfod menu cmd array into a structured menu object.
 * The cmd array is produced by pfodToJson() which splits the raw pfod message on '|' and '}'.
 *
 * Example input (after pfodToJson split):
 *   ["{,<bg s><+2><bl>~this is the prompt`0~V1",
 *    "|A<bg m><b><u><+2><o>~Button one",
 *    "|+D~z",
 *    "}"]
 *
 * @param {string[]} cmdArray - Array of cmd strings (will NOT be modified - uses a copy)
 * @returns {{header: object, items: object[], hasDrawing: boolean, drawingItems: object[]}}
 */
function pfodParseMenu(cmdArray) {
    const arr = cmdArray.slice(); // Work on a copy so original is unchanged

    // First element is the menu header
    const headerStr = arr.shift() || '';
    const header = parsePfodMenuHeader(headerStr);

    const items = [];
    const drawingItems = [];

    // Parse each remaining element as a menu item (skip closing '}')
    while (arr.length > 0) {
        const itemStr = arr.shift();
        if (!itemStr || itemStr === '}' || itemStr.trim() === '') {
            continue;
        }
        if (!itemStr.startsWith('|')) {
            continue;
        }

        const item = parsePfodMenuItem(itemStr);
        if (!item) {
            continue;
        }

        if (item.type === 'dwg' || item.type === 'dwg-label') {
            drawingItems.push(item);
        }
        items.push(item);
    }

    return {
        header: header,
        items: items,
        hasDrawing: drawingItems.length > 0,
        drawingItems: drawingItems
    };
}

// Export all functions globally for use by other modules
window.pfodParseMenu = pfodParseMenu;
window.parsePfodFormatCodes = parsePfodFormatCodes;
window.parsePfodMenuItem = parsePfodMenuItem;
window.parsePfodMenuHeader = parsePfodMenuHeader;
window.parsePfodCmd = parsePfodCmd;
