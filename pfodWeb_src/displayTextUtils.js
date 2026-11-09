/*   
   displayTextUtils.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Utility functions for display text formatting
// Extracted from add-item.js and redraw.js to be reusable across server and client code
//
// Exports:    window.printFloatDecimals, window.addFormattedValueToText,
//             window.generateItemDisplayText, window.getActualFontSizeForDialog,
//             window.convertColorToHex, window.substituteUnsupportedUnitsGlyphs
// Depends on: getColorValue() from redraw.js (optional fallback if absent)
// Called by:  redraw.js (generateItemDisplayText for label/value rendering),
//             pfodWebMouse.js (getActualFontSizeForDialog for touchActionInput dialogs)

// JavaScript implementation of printFloatDecimals based on C++ version
// prints just number rounded to decPlaces, -ve decPlaces round to left of decimal point
function printFloatDecimals(f, decPlaces) {
    if (f === undefined || f === null) {
        return '';
    }
    
    let isNegative = false;
    if (f < 0) {
        f = -f;
        isNegative = true;
    }
    
    let result = '';
    
    if (decPlaces <= 0) {
        let iValue = Math.floor(f);
        if ((f - iValue) !== 0) {
            // round
            iValue = Math.floor(f + 0.5);
        }
        
        if (decPlaces === 0) {
            result = iValue.toString();
        } else {
            // decPlaces < 0
            // limit divider to be < number so always get something
            let divider = 1;
            for (let i = 0; i < (-decPlaces) && (divider < iValue); i++) {
                divider = divider * 10;
            }
            if (divider > iValue) {
                divider = Math.floor(divider / 10);
            }
            let idValue = Math.floor(iValue / divider) * divider;
            if ((idValue - iValue) !== 0) {
                // need to round
                iValue = iValue + Math.floor(divider / 2);
                iValue = Math.floor(iValue / divider);
                idValue = iValue * divider;
            }
            result = idValue.toString();
        }
    } else {
        // decPlaces > 0
        result = f.toFixed(decPlaces);
    }
    
    return isNegative ? '-' + result : result;
}

// Roboto (used for both canvas text and HTML) has no glyphs for U+2103 (℃)
// or U+2109 (℉); Android's pfodApp renders these via their Unicode NFKD
// compatibility decomposition (℃ -> °C, ℉ -> °F) using the surrounding
// font's ordinary Latin glyphs. Substitute the same way here so pfodWeb
// matches pfodApp instead of falling back to a different system font.
function substituteUnsupportedUnitsGlyphs(units) {
    return units.replace(/℃/g, '°C').replace(/℉/g, '°F');
}

// Utility function to add formatted value to text (used by labels)
// Returns the text with formatted value and units appended if value exists
function addFormattedValueToText(text, item) {
    // Device-supplied text may itself contain ℃/℉ (e.g. a static scale label
    // with no attached value), not just the units field, so substitute here too.
    text = substituteUnsupportedUnitsGlyphs(text);
    if (item.value !== undefined && item.value !== null && item.value !== '') {
        const decimals = (item.decimals !== undefined && item.decimals !== null) ? parseInt(item.decimals) : 2;
        const units = substituteUnsupportedUnitsGlyphs(item.units || '');
        const formattedValue = printFloatDecimals(parseFloat(item.value), decimals);
        return text + formattedValue + units;
    }
    return text;
}

function generateItemDisplayText(item) {
    if (item.type === 'label') {
        // Label text generation: text + formatted value + units (if value exists)
        const text = item.text || '';
        return addFormattedValueToText(text, item);
    } else if (item.type === 'value') {
        // Value text generation: text + scaled/formatted intValue + units
        const textPrefix = substituteUnsupportedUnitsGlyphs(item.text || '');
        const intValue = parseFloat(item.intValue || 0);
        const max = parseFloat(item.max || 1);
        const min = parseFloat(item.min || 0);
        const displayMax = parseFloat(item.displayMax || 1.0);
        const displayMin = parseFloat(item.displayMin || 0.0);
        const decimals = (item.decimals !== undefined && item.decimals !== null) ? parseInt(item.decimals) : 2;
        const units = substituteUnsupportedUnitsGlyphs(item.units || '');

        // Scale the value (same logic as pfodWebMouse)
        let maxMin = max - min;
        if (maxMin === 0) maxMin = 1;  // Prevent division by zero
        const scaledValue = (intValue - min) * (displayMax - displayMin) / maxMin + displayMin;
        
        // Format and combine
        const formattedValue = printFloatDecimals(scaledValue, decimals);
        const displayText = textPrefix + formattedValue + units;
        
        return displayText;
    } else {
        // For other item types, just return the basic text
        return substituteUnsupportedUnitsGlyphs(item.text || item.textFormat || '');
    }
}

// Font size calculation for touchActionInput dialogs
// fontSize 0 = 14px for dialog boxes, with baseFontSize = 14
function getActualFontSizeForDialog(relativeFontSize) {
    // Matches Android pfodApp V2_ImageTextUpdate.getRelativeSize():
    //   each +6 step doubles size *linearly*, not exponentially.
    const baseFontSize = 14;
    const FONT_SIZES_PLUS = [1.0, 1.1225, 1.2599, 1.4142, 1.5874, 1.7818];

    const intFontSize = Math.round(relativeFontSize);
    const absSize = Math.abs(intFontSize);
    const multiple2 = Math.floor(absSize / 6);
    let relativeSize = FONT_SIZES_PLUS[absSize % 6];
    if (multiple2 > 0) {
        relativeSize *= 2 * multiple2;
    }
    if (intFontSize < 0) {
        relativeSize = 1.0 / relativeSize;
    }
    return baseFontSize * relativeSize;
}

// Color conversion function for touchActionInput dialogs
// Converts color index to hex color value
function convertColorToHex(colorIndex) {
    // Check if colorUtils is available and has the conversion function
    if (typeof getColorValue === 'function') {
        return getColorValue(colorIndex);
    }
    
    // Fallback color mapping for basic colors
    const colorMap = {
        0: '#000000',   // Black
        1: '#800000',   // Maroon
        2: '#008000',   // Green
        3: '#808000',   // Olive
        4: '#000080',   // Navy
        5: '#800080',   // Purple
        6: '#008080',   // Teal
        7: '#C0C0C0',   // Silver
        8: '#808080',   // Gray
        9: '#FF0000',   // Red
        10: '#00FF00',  // Lime
        11: '#FFFF00',  // Yellow
        12: '#0000FF',  // Blue
        13: '#FF00FF',  // Fuchsia
        14: '#00FFFF',  // Aqua
        15: '#FFFFFF'   // White
    };
    
    return colorMap[colorIndex] || '#000000';
}

/**
 * Java's String.format("%.<digits>E", value): mantissa with `digits` decimals,
 * a capital E, the exponent's sign and at least two exponent digits, e.g.
 * 300000 with 2 digits -> "3.00E+05".  JS toExponential gives "3.00e+5", so
 * the exponent is rewritten.  Used by the two pfodApp value formatters below.
 *
 * @param {number} value - finite number to format
 * @param {number} digits - decimals in the mantissa (0-100)
 * @returns {string} the value in Java %E form
 */
function pfodJavaFormatE(value, digits) {
    const [mantissa, exp] = value.toExponential(digits).split('e');
    const expNum = parseInt(exp, 10);
    const expDigits = String(Math.abs(expNum)).padStart(2, '0');
    return mantissa + 'E' + (expNum < 0 ? '-' : '+') + expDigits;
}

/**
 * Display text for a menu numeric slider / numeric label value, exactly as
 * pfodApp shows it — a port of V2_MenuItem.java's convertScales(),
 * getNoOfDigits(), setTrailingZeros() and formatValue().
 *
 * value shown = (current - minValue) * (dispMax - dispMin) / (maxValue - minValue) + dispMin
 *
 * Decimals:
 *   - Whole numbers only ("no trailing zeros") when both display limits are
 *     whole numbers and each slider step is exactly one display unit
 *     (|dispMax - dispMin| == |maxValue - minValue|).  Zero is then "0".
 *   - Otherwise digits = floor(|log10(step)| + 0.5) + 1, where step is the
 *     display change per slider count.  The value is formatted with that many
 *     decimals and trailing zeros are kept (e.g. "2.50"), except that when
 *     every decimal is zero only one is kept ("2.00" -> "2.0").  Zero is "0.0".
 *   - |value| > 1e5 or < 1e-5 (and not zero) uses Java %E form with `digits`.
 * A result that is only zeros loses any leading '-' ("-0.0" -> "0.0").
 * If either display limit is written with a leading '+', every value that is
 * not negative gets a '+' (including zero: "+0", "+0.0").
 *
 * pfodApp fills a missing display limit with the raw max/min before this
 * runs, as pfodMenuParser does (maxScaleStr/minScaleStr defaults), so both
 * strings are always present here.  If maxValue == minValue the value is
 * dispMin (pfodApp would divide by zero there).
 *
 * @param {number} current - slider value
 * @param {number} minValue - slider raw minimum
 * @param {number} maxValue - slider raw maximum
 * @param {string} minScaleStr - display value for minValue, as sent (may start with '+')
 * @param {string} maxScaleStr - display value for maxValue, as sent (may start with '+')
 * @returns {string} the value text, without leading text or units
 */
function pfodFormatSliderValue(current, minValue, maxValue, minScaleStr, maxScaleStr) {
    const minTrim = minScaleStr.trim();
    const maxTrim = maxScaleStr.trim();
    // NumberParser.parseAsDouble: a leading '+' is skipped and remembered.
    const addPlusSign = minTrim.startsWith('+') || maxTrim.startsWith('+');
    const minScale = parseFloat(minTrim.startsWith('+') ? minTrim.substring(1) : minTrim);
    const maxScale = parseFloat(maxTrim.startsWith('+') ? maxTrim.substring(1) : maxTrim);
    const sliderRange = Math.abs(maxValue - minValue);

    // getNoOfDigits()
    let noOfDigits = 1;
    if (sliderRange !== 0) {
        let log10 = Math.log10(Math.abs(maxScale - minScale) / sliderRange);
        if (log10 < 0) log10 = -log10;
        noOfDigits = Math.floor(log10 + 0.5) + 1;
    }

    // setTrailingZeros()
    let noTrailingZeros = false;
    if ((Math.abs(Math.round(maxScale) - maxScale) < 1e-6) && (Math.abs(Math.round(minScale) - minScale) < 1e-6)) {
        const absRange = Math.abs(maxScale - minScale);
        if (((absRange - 1e-6) < sliderRange) && (sliderRange < (absRange + 1e-6))) {
            noTrailingZeros = true;
        }
    }

    // formatSliderNumeric() scaled number
    const dval = (maxValue === minValue) ? minScale
        : ((current - minValue) * ((maxScale - minScale) / (maxValue - minValue))) + minScale;

    // formatValue()
    if (dval === 0 && noTrailingZeros) {
        return addPlusSign ? '+0' : '0';
    }
    let dvalStr = '0.0';
    if (dval !== 0) {
        const absDVal = Math.abs(dval);
        if ((absDVal > 1e5) || (absDVal < 1e-5)) {
            dvalStr = pfodJavaFormatE(dval, noOfDigits);
        } else {
            dvalStr = dval.toFixed(noTrailingZeros ? 0 : noOfDigits);
            if (dvalStr.includes('.')) {
                // only when every decimal is zero: drop them all (whole
                // numbers) or keep one
                const tempDvalStr = dvalStr.replace(/0+$/, '');
                if (tempDvalStr.endsWith('.')) {
                    dvalStr = noTrailingZeros ? tempDvalStr.slice(0, -1) : tempDvalStr + '0';
                }
            }
        }
    }
    // 0.0 / -0.0 -> 0.0
    if (/^[0.,\-]*$/.test(dvalStr.trim())) {
        dvalStr = dvalStr.trim();
        if (dvalStr.startsWith('-')) dvalStr = dvalStr.substring(1);
    }
    if (addPlusSign && !dvalStr.startsWith('-')) {
        dvalStr = '+' + dvalStr;
    }
    return dvalStr;
}

/**
 * Display text for a numeric input screen value ({#cmd...~units~scale~offset}),
 * exactly as pfodApp shows it — a port of MenuItem.java's getScaledValue() and
 * scaleToValue(), which XSliderViewActivity uses for the value, the edit field
 * and the "Number between ... and ..." range.
 *
 * value shown = (value + offset) * scale, where offset is in raw COUNTS (it
 * removes an ADC's offset, e.g. -5 when 0V reads 5 counts).
 *
 *   - scale 1 and offset 0: the raw value, with '+' if positive and addPlusSign.
 *   - scale and offset both whole numbers: the whole-number result, with '+'
 *     if positive and addPlusSign.
 *   - otherwise (scaleToValue): digits = floor(log10(|value|) + 0.5) + 1 (|value|
 *     taken as 1 when 0), from the RAW value.  If the result is zero
 *     (value == round(-offset)) it is "0.0".  If |result| > 1e5 or < 1e-3 it
 *     is Java %E with digits.  Otherwise, with m = floor(log10(|result|)):
 *       m <  digits: digits - m decimals, trailing zeros trimmed, at least ".0"
 *       m == digits: rounded to a whole number + ".0"
 *       m >  digits: rounded to 10^(m - digits) + ".0"
 *     and '+' if positive and addPlusSign.
 *
 * @param {number} value - raw integer value
 * @param {number} scale - display scale
 * @param {number} offset - in counts, added to the raw value before scaling
 * @param {boolean} addPlusSign - true if the scale field was sent with a leading '+'
 * @returns {string} the value text, without units
 */
function pfodFormatScaledValue(value, scale, offset, addPlusSign) {
    // getScaledValue()
    if (scale === 1.0 && offset === 0.0) {
        return ((value > 0) && addPlusSign) ? '+' + value : String(value);
    }
    if (scale === Math.round(scale) && offset === Math.round(offset)) {
        const ival = (value + offset) * scale;
        return (addPlusSign && ival > 0) ? '+' + ival : String(ival);
    }

    // scaleToValue()
    let dval = (value + offset) * scale;
    const absValue = Math.abs(value) === 0 ? 1 : Math.abs(value);
    let noDigits = Math.floor(Math.log10(absValue) + 0.5) + 1;
    const zero = (value === Math.round(-offset));
    const absDVal = Math.abs(dval);
    let dvalStr = '0.0';
    if (!zero) {
        if ((absDVal > 1e5) || (absDVal < 1e-3)) {
            dvalStr = pfodJavaFormatE(dval, noDigits);
        } else if (absDVal !== 0.0) {
            const roundDvalLog10 = Math.floor(Math.log10(absDVal));
            if (roundDvalLog10 < noDigits) {
                noDigits = noDigits - roundDvalLog10;
                dvalStr = dval.toFixed(noDigits).replace(/0+$/, '');
                if (dvalStr.endsWith('.')) dvalStr += '0';
            } else if (roundDvalLog10 === noDigits) {
                dvalStr = dval.toFixed(0) + '.0';
            } else {
                const roundScale = Math.pow(10, roundDvalLog10 - noDigits);
                dval = Math.floor(dval / roundScale + 0.5) * roundScale;
                dvalStr = dval.toFixed(0) + '.0';
            }
            if ((dval > 0.0) && addPlusSign) {
                dvalStr = '+' + dvalStr;
            }
        }
    }
    return dvalStr;
}

// Export for browser (client-side) - no longer needed server-side
if (typeof window !== 'undefined') {
    window.pfodFormatSliderValue = pfodFormatSliderValue;
    window.pfodFormatScaledValue = pfodFormatScaledValue;
    window.printFloatDecimals = printFloatDecimals;
    window.addFormattedValueToText = addFormattedValueToText;
    window.generateItemDisplayText = generateItemDisplayText;
    window.getActualFontSizeForDialog = getActualFontSizeForDialog;
    window.convertColorToHex = convertColorToHex;
    window.substituteUnsupportedUnitsGlyphs = substituteUnsupportedUnitsGlyphs;
}