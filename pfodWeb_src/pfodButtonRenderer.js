/*
   pfodButtonRenderer.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// pfod Button/Label Renderer — renders pfod menu items as HTML DOM elements.
//
// Exports:    window.applyPfodFormats, window.pfodSetFormattedText,
//             window.renderPfodButton, window.renderPfodLabel,
//             window.renderPfodNavButtons (and other renderPfod* functions)
// Depends on: getActualFontSize(), pfodColorTagToHex() from redraw.js (must load first),
//             parsePfodFormatCodes() from pfodMenuParser.js (must load first)
// Called by:  pfodMenuDisplay.js (uses all renderPfod* functions to build menu DOM)

// Scale factor converting pfod font size units (from getActualFontSize) to
// CSS container-query inline-size units (cqi).  getActualFontSize(0) ≈ 2.832
// (58 × 50 / 1024).  At 1.5 cqi/unit → 2.832 * 1.5 ≈ 4.248 cqi.  Inside
// #menu-container (which sets container-type: inline-size), this resolves
// against the menu's own width (capped 500px) so menu text stops growing
// once the window exceeds the cap.  Outside any container-type ancestor,
// cqi falls back to the small viewport per the CSS Containment spec —
// equivalent to the previous vw behaviour — so chart/input/dialog callers
// render at the same size as before.
const PFOD_FONT_VW_SCALE = 1.5;

/**
 * Apply pfod format styles to an HTML element.
 * Sets background colour, text colour, font weight, style, decoration and size
 * based on the parsed format object from parsePfodFormatCodes().
 *
 * @param {HTMLElement} el - Element to style
 * @param {object} formats - {bgColor, textColor, bold, italic, underline, fontSize}
 */
function applyPfodFormats(el, formats) {
    if (!formats) throw new Error('[pfodButtonRenderer] applyPfodFormats: formats is required');
    if (formats.bgColor) {
        el.style.backgroundColor = formats.bgColor;
    }
    if (formats.textColor) {
        el.style.color = formats.textColor;
    }
    if (formats.bold) {
        el.style.fontWeight = 'bold';
    }
    if (formats.italic) {
        el.style.fontStyle = 'italic';
    }
    if (formats.underline) {
        el.style.textDecoration = 'underline';
    }
    // Only apply non-zero relative font sizes; zero means use the default CSS size
    if (formats.fontSize !== 0) {
        const actualSize = getActualFontSize(formats.fontSize);
        el.style.fontSize = (actualSize * PFOD_FONT_VW_SCALE) + 'cqi';
    }
}

/**
 * Populate a container element with pfod inline-formatted text.
 * Parses <b>, <i>, <u>, <+N>, <-N>, <colorCode>, </tag> tags within the text string.
 * Closing tags terminate their matching open tag and all tags enclosed within it (stack-based).
 * Unrecognised tags (including <bg ...>) are rendered as literal text.
 * All open tags auto-terminate at end of string.
 * Decodes pfod escape sequences in output text: &#96; &#123; &#124; &#125; &#126;
 *   &lt; &#92; &amp; (decoded in that order so &amp;lt; renders as &lt; not <).
 *
 * @param {HTMLElement} container - Element to populate (existing children are cleared first)
 * @param {string} text - Raw text potentially containing inline format tags and escape sequences
 * @param {string} contrastHex - Auto-contrast colour used when an inline <bw> tag is encountered
 * @param {function} [fontResolver] - Optional function(deltaSize) → CSS size string for
 *        rendering inline <+N>/<-N> tags.  When omitted, defaults to container-query
 *        inline-size scaling (getActualFontSize × PFOD_FONT_VW_SCALE in cqi units), which
 *        falls back to viewport sizing when no container-type ancestor is present.
 *        Dialogs override this to use getActualFontSizeForDialog (base 14 px) so inline
 *        sizes match the dialog's fixed-pixel layout.
 */
function pfodSetFormattedText(container, text, contrastHex, fontResolver) {
    // Default font size resolver: container-query inline-size scaling.  Inside
    // #menu-container this resolves against the menu width (capped 500px); elsewhere
    // it falls back to viewport sizing, matching the previous vw behaviour.
    const resolveFontSize = fontResolver || function(deltaSize) {
        return (getActualFontSize(deltaSize) * PFOD_FONT_VW_SCALE) + 'cqi';
    };
    container.textContent = '';
    if (!text) return;

    // Roboto has no glyphs for U+2103 (℃) / U+2109 (℉); substitute their
    // Unicode NFKD decomposition (°C / °F) so this matches pfodApp's
    // Android rendering instead of falling back to a different system font.
    text = substituteUnsupportedUnitsGlyphs(text);

    // Pick the actual rendering target.  pfodSetFormattedText is the
    // universal pfod-text renderer used for EVERY formatted-text site
    // (button text, menu-prompt, input/numeric/selection prompts,
    // labels, dialog titles, chart titles, message-log entries — any
    // caller passing a container into here).  When the container is
    // itself a flex/grid layout (e.g. #menu-prompt is column-flex for
    // bottom alignment), text appended directly would have its
    // anonymous text-node / span children promoted to flex items
    // with unpredictable line-break behaviour.  Wrap in an inner
    // <div> so the text lives in normal block-inside-flex context.
    // For non-flex containers (the common case — inline spans,
    // block divs) we render directly; an inner wrapper there would
    // either introduce block-inside-inline or add a pointless layer.
    //
    // EXCEPT when the container is currently `display:none` — that
    // happens transiently during back-nav out of input mode for the
    // menu prompt, and getComputedStyle() returns 'none' so the
    // flex-check fails.  Skipping the wrapper there breaks the
    // post-show layout: each styled span / text node becomes a flex
    // item of the (later-shown) flex container, putting "italic
    // phrase" and "the rest of the line" on separate rows.  Treat
    // 'none' as "unknown" and wrap defensively — an extra div in a
    // block/inline parent is harmless, but skipping it in a flex
    // parent is silently broken.  See pfod-messages
    // 2026-05-29T04-35-49.187Z.csv for the original repro.
    let target = container;
    if (container.isConnected) {
        const display = getComputedStyle(container).display;
        if (display === 'flex'  || display === 'inline-flex' ||
            display === 'grid'  || display === 'inline-grid' ||
            display === 'none') {
            target = document.createElement('div');
            container.appendChild(target);
        }
    }

    // `white-space: pre-wrap` on the rendering target makes every
    // `\n` in the source text render as a visible line break —
    // including trailing `\n`s, which the old `<br>`-based mechanism
    // couldn't anchor (browsers collapse a trailing `<br>` to zero
    // visible space).  Spaces and runs of whitespace are also
    // preserved.  Each `\n` sits inside whichever styled span was
    // open at that point in the text, so font-size / colour / bold
    // / italic / underline carry through to the blank line that
    // follows (per the user-stated rule: any tag still open at the
    // END of the text auto-closes there, so trailing `\n`s belong
    // to the last open span).  Applies universally because this
    // is the universal renderer.
    target.style.whiteSpace = 'pre-wrap';

    // Normalise line endings to LF so newline handling is uniform throughout
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Decode pfod escape sequences in a text segment before inserting into the DOM.
    // &amp; is decoded last so &amp;lt; produces &lt; (literal) not < (tag opener).
    function decodeEscapes(str) {
        if (str.indexOf('&') === -1) return str;
        return str
            .replace(/&#96;/g,  '`')
            .replace(/&#123;/g, '{')
            .replace(/&#124;/g, '|')
            .replace(/&#125;/g, '}')
            .replace(/&#126;/g, '~')
            .replace(/&lt;/g,   '<')
            .replace(/&#92;/g,  '\\')
            .replace(/&amp;/g,  '&');
    }

    // Stack of active open tags — each entry describes the style delta that tag contributes.
    // {tag: string, bold: bool, italic: bool, underline: bool, deltaSize: number, textColor: string}
    const stack = [];

    // Used to detect whether ALL rendered content ended up in font-size-changed spans,
    // with no segment left at the base (unsized) font size.  When true, renderPfodLabel
    // collapses the block container's line-height strut so line spacing scales with the
    // small font.  hasUnsizedText tracks font-size only (not bold/italic/colour) — a
    // segment can be fully styled (e.g. coloured/bold) and still be "unsized", and a
    // multi-line label can have some lines at the base size and others font-sized (e.g.
    // `<g><b>Title</b>\n<y><-1>subtitle`); collapsing the strut in that mixed case would
    // zero out line spacing for the base-size lines too, making them overlap.
    let hasFontSizeSpan = false;
    let hasUnsizedText  = false;

    // Compute cumulative style from all active stack entries.
    function getCurrentStyle() {
        let bold = false, italic = false, underline = false, fontSize = 0, textColor = null;
        for (const e of stack) {
            if (e.bold)                    bold      = true;
            if (e.italic)                  italic    = true;
            if (e.underline)               underline = true;
            if (e.deltaSize !== undefined) fontSize += e.deltaSize;
            if (e.textColor !== undefined) textColor = e.textColor;
        }
        return { bold, italic, underline, fontSize, textColor };
    }

    // Append a text segment to the target, wrapping in a styled span
    // when any style is active.  `\n` characters in `txt` are
    // preserved verbatim in the text node; the target's
    // `white-space: pre-wrap` (set above) renders them as visible
    // line breaks \u2014 including trailing `\n`s, which belong to the
    // styled span that was open over this segment (so the trailing
    // blank line inherits the current font-size / colour / b/i/u).
    // No <br> emission.  U+0080 (pfod spacer) is still rendered as
    // a visibility:hidden space that occupies width and scales with
    // the current font size, so sized empty-label spacers keep
    // working.
    function appendSegment(txt) {
        if (!txt) return;
        const style = getCurrentStyle();
        const hasStyle = style.bold || style.italic || style.underline
                      || style.fontSize !== 0 || style.textColor;

        function appendRun(run) {
            if (!run) return;
            if (style.fontSize === 0) hasUnsizedText = true;
            if (!hasStyle) {
                target.appendChild(document.createTextNode(decodeEscapes(run)));
            } else {
                const span = document.createElement('span');
                span.textContent = decodeEscapes(run);
                if (style.bold)      span.style.fontWeight     = 'bold';
                if (style.italic)    span.style.fontStyle      = 'italic';
                if (style.underline) span.style.textDecoration = 'underline';
                if (style.fontSize !== 0) {
                    span.style.fontSize   = resolveFontSize(style.fontSize);
                    span.style.lineHeight = 'normal'; // proportional to span's own font-size
                    hasFontSizeSpan = true;
                }
                if (style.textColor) span.style.color = style.textColor;
                target.appendChild(span);
            }
        }

        // Split only on the U+0080 sized-spacer character \u2014 newlines
        // are left in the run text and rendered by pre-wrap.
        const parts = txt.split('\u0080');
        for (let pi = 0; pi < parts.length; pi++) {
            if (pi > 0) {
                const spacer = document.createElement('span');
                spacer.style.visibility = 'hidden';
                if (style.bold)   spacer.style.fontWeight = 'bold';
                if (style.italic) spacer.style.fontStyle  = 'italic';
                if (style.fontSize !== 0) {
                    spacer.style.fontSize = resolveFontSize(style.fontSize);
                }
                spacer.textContent = ' ';
                target.appendChild(spacer);
            }
            appendRun(parts[pi]);
        }
    }

    // Parse an opening tag's content (without angle brackets).
    // Returns a style-delta object for recognised inline format tags, null for unrecognised ones.
    function parseOpenTag(tagContent) {
        if (tagContent === 'b')  return { bold: true };
        if (tagContent === 'i')  return { italic: true };
        if (tagContent === 'u')  return { underline: true };
        if (/^\+\d+$/.test(tagContent)) return { deltaSize:  parseInt(tagContent.substring(1), 10) };
        if (/^-\d+$/.test(tagContent))  return { deltaSize: -parseInt(tagContent.substring(1), 10) };
        if (tagContent.startsWith('bg ')) return null; // background colour only valid before ~
        if (tagContent === 'bw') return { textColor: contrastHex };
        const hex = pfodColorTagToHex(tagContent);
        if (hex) return { textColor: hex };
        return null;
    }

    let i = 0;
    let segStart = 0;

    while (i < text.length) {
        if (text[i] !== '<') { i++; continue; }

        const closeIdx = text.indexOf('>', i + 1);
        if (closeIdx === -1) { i++; continue; } // unclosed '<' — treat as literal

        const tagContent = text.substring(i + 1, closeIdx);

        if (tagContent.startsWith('/')) {
            // Closing tag: find the innermost matching open tag and pop it plus everything after it
            const closingName = tagContent.substring(1).trim();
            let foundIdx = -1;
            for (let j = stack.length - 1; j >= 0; j--) {
                if (stack[j].tag === closingName) { foundIdx = j; break; }
            }
            if (foundIdx !== -1) {
                appendSegment(text.substring(segStart, i));
                segStart = closeIdx + 1;
                stack.splice(foundIdx);
            }
            // no matching open tag: leave the closing tag text in the current literal segment
            i = closeIdx + 1;
        } else {
            // Opening tag
            const parsed = parseOpenTag(tagContent);
            if (parsed !== null) {
                appendSegment(text.substring(segStart, i));
                segStart = closeIdx + 1;
                parsed.tag = tagContent;
                stack.push(parsed);
            }
            // unrecognised tag: leave it in the current literal segment
            i = closeIdx + 1;
        }
    }

    // Flush any remaining text after the last recognised tag boundary
    appendSegment(text.substring(segStart));
    // Return true when all rendered content is in font-size-changed spans (no segment
    // left at the base font size), so renderPfodLabel can collapse the container's
    // line-height strut.
    return hasFontSizeSpan && !hasUnsizedText;
}

/**
 * Render a pfod plain button menu item as an HTML button element.
 * Clicking sends the item's cmd string to the provided onClick callback.
 * Disabled items render as visually distinct non-clickable buttons.
 *
 * Text colour and border colour default to <bw> (black or white for best contrast)
 * against the effective background when not explicitly specified by the item's formats.
 *
 * @param {object} item - Parsed menu item (type = 'button')
 * @param {function} onClick - Callback(cmd) invoked when the button is clicked
 * @param {string} [menuBgColor='#000000'] - Menu background colour (hex) used when the
 *        item has no explicit bgColor, to determine the <bw> contrast default.
 * @returns {HTMLButtonElement}
 */
function renderPfodButton(item, onClick, menuBgColor) {
    const btn = document.createElement('button');
    btn.className = 'pfod-menu-button';
    btn.style.whiteSpace = 'pre-wrap';
    // Compute contrast colour first so pfodSetFormattedText can resolve inline <bw> tags.
    // Effective background: item bgColor → menu bg → pfod default black.
    const effectiveBg = item.formats.bgColor || menuBgColor || '#000000';
    const contrastHex = xtermColorToHex(getBlackWhite(effectiveBg));

    // Wrap text in a span so flash animation can target only the text,
    // leaving the button border and background permanently visible.
    const textSpan = document.createElement('span');
    textSpan.className = 'pfod-button-text';
    pfodSetFormattedText(textSpan, item.text, contrastHex);
    btn.appendChild(textSpan);
    applyPfodFormats(btn, item.formats);

    // Apply <bw> defaults: text and border colour contrast against the effective background.
    if (!item.formats.textColor && !(item.formats && item.formats.disabled)) {
        btn.style.color = contrastHex;
    }
    btn.style.borderColor = contrastHex;

    if (item.formats && item.formats.disabled) {
        btn.disabled = true;
    } else {
        btn.addEventListener('click', function() { onClick(item.cmd); });
    }
    if (item.formats && item.formats.flash) {
        btn.classList.add('pfod-flash');
    }
    return btn;
}

/**
 * Render a pfod label (non-interactive) menu item as an HTML div element.
 * Labels look similar to buttons but do not respond to clicks and have no border.
 *
 * Text colour and border colour default to <bw> (black or white for best contrast)
 * against the effective background when not explicitly specified by the item's formats.
 *
 * @param {object} item - Parsed menu item (type = 'label')
 * @param {string} [menuBgColor='#000000'] - Menu background colour (hex) used when the
 *        item has no explicit bgColor, to determine the <bw> contrast default.
 * @returns {HTMLDivElement}
 */
function renderPfodLabel(item, menuBgColor) {
    const div = document.createElement('div');
    div.className = 'pfod-menu-label';
    // Empty-text label: collapse padding + line-height so it
    // renders as a thin separator line proportional to its
    // font-size (matches pfodDesignerV2's designerSpacing
    // convention — empty text + small font = thin spacer).
    // Class drives the collapse via the matching .pfod-menu-
    // label.pfod-empty-label rule in pfodCommon.css.
    if (!item.text) div.classList.add('pfod-empty-label');
    div.style.whiteSpace = 'pre-wrap';
    // Compute contrast colour first so pfodSetFormattedText can resolve inline <bw> tags.
    const effectiveBg = item.formats.bgColor || menuBgColor || '#000000';
    const contrastHex = xtermColorToHex(getBlackWhite(effectiveBg));

    const textSpan = document.createElement('span');
    textSpan.className = 'pfod-button-text';
    const allFontSized = pfodSetFormattedText(textSpan, item.text, contrastHex);
    // When every rendered segment is in an explicit font-size span (no bare text
    // nodes), collapse the block container's strut to 0 so line spacing is
    // governed by each span's own font-size rather than the div's default.
    // Without this, `<-5>line1\nline2` renders with the div's full strut
    // (1.2 × default-font) between lines instead of the small font's spacing.
    if (allFontSized) div.style.lineHeight = '0';
    div.appendChild(textSpan);
    applyPfodFormats(div, item.formats);

    // Apply <bw> default for text colour.
    if (!item.formats.textColor) {
        div.style.color = contrastHex;
    }

    if (item.formats && item.formats.flash) {
        div.classList.add('pfod-flash');
    }
    return div;
}

/**
 * Build the 2-option switch row (opt-label / pill-track+thumb / opt-label).
 * Used when td.options.length === 2.
 *
 * @param {object} td - toggleData from the parsed item
 * @param {boolean} disabled - true for labels and disabled buttons
 * @param {string} contrastHex - colour for opt labels
 * @returns {HTMLDivElement}
 */
function _buildToggleSwitchRow(td, disabled, contrastHex) {
    const row = document.createElement('div');
    row.className = 'pfod-toggle-slider-row';
    row.style.color = contrastHex; // opt labels always use contrast colour

    const leftLbl = document.createElement('span');
    leftLbl.className = 'pfod-toggle-opt-label';
    leftLbl.textContent = substituteUnsupportedUnitsGlyphs(td.options[0] || '');

    const track = document.createElement('div');
    track.className = disabled ? 'pfod-toggle-track pfod-toggle-track-disabled'
                               : 'pfod-toggle-track';
    track.style.background = contrastHex;

    const thumb = document.createElement('div');
    // pfod-toggle-thumb-right positions the thumb at the right end (idx != 0)
    thumb.className = td.idx !== 0 ? 'pfod-toggle-thumb pfod-toggle-thumb-right'
                                   : 'pfod-toggle-thumb';
    thumb.style.background = contrastHex;
    thumb.style.border = '2px solid ' + (contrastHex.toLowerCase() === '#ffffff' ? '#000000' : '#ffffff');
    track.appendChild(thumb);

    const rightLbl = document.createElement('span');
    rightLbl.className = 'pfod-toggle-opt-label';
    rightLbl.textContent = substituteUnsupportedUnitsGlyphs(td.options[td.options.length - 1] || '');

    row.appendChild(leftLbl);
    row.appendChild(track);
    row.appendChild(rightLbl);
    return row;
}

/**
 * Build a full-width slider row for items with more than 2 options.
 * Layout: thin track with proportionally positioned thumb, then a label row
 * below showing the first and last option at each end.
 *
 * Thumb position formula: left = calc(-2px + pct * (100% - 28px))
 *   Thumb overhangs -2px at pct=0 and +2px at pct=1, covering both rounded ends.
 *   and interpolates linearly for intermediate indices.
 *
 * @param {object} td - toggleData from the parsed item
 * @param {boolean} disabled - true for labels and disabled buttons
 * @param {string} contrastHex - colour for opt labels
 * @returns {{container: HTMLDivElement, track: HTMLDivElement, thumb: HTMLDivElement}}
 */
function _buildSliderRow(td, disabled, contrastHex) {
    const pct = td.options.length > 1 ? td.idx / (td.options.length - 1) : 0;

    const container = document.createElement('div');
    container.className = 'pfod-slider-container';

    // hitArea is a tall transparent div (track height + 2×thumb-diameter above and below)
    // that provides a large click target without altering the visual track size.
    const hitArea = document.createElement('div');
    hitArea.className = disabled ? 'pfod-slider-hit-area pfod-slider-hit-area-disabled'
                                 : 'pfod-slider-hit-area';

    const track = document.createElement('div');
    track.className = 'pfod-slider-track';
    track.style.background = contrastHex;

    const thumb = document.createElement('div');
    thumb.className = 'pfod-slider-thumb';
    thumb.style.left = 'calc(-2px + ' + pct + ' * (100% - 28px))';
    thumb.style.background = contrastHex;
    thumb.style.border = '2px solid ' + (contrastHex.toLowerCase() === '#ffffff' ? '#000000' : '#ffffff');
    track.appendChild(thumb);
    hitArea.appendChild(track);
    container.appendChild(hitArea);

    const labelsRow = document.createElement('div');
    labelsRow.className = 'pfod-slider-opt-labels-row';
    labelsRow.style.color = contrastHex;

    const leftLbl = document.createElement('span');
    leftLbl.textContent = substituteUnsupportedUnitsGlyphs(td.options[0] || '');
    const rightLbl = document.createElement('span');
    rightLbl.textContent = substituteUnsupportedUnitsGlyphs(td.options[td.options.length - 1] || '');

    labelsRow.appendChild(leftLbl);
    labelsRow.appendChild(rightLbl);
    container.appendChild(labelsRow);

    return { container, hitArea, track, thumb };
}

/**
 * Render a pfod toggle/slider button (interactive) as an HTML div element.
 *
 * 2-option toggle: clicking anywhere toggles idx 0↔1 and sends {<cmd>`<newIdx>}.
 * Multi-option slider (>2 options): clicking on the track maps click position to
 *   the nearest option index and sends {<cmd>`<newIdx>}.
 *
 * In both cases the display updates optimistically before the server responds.
 *
 * toggleData.format controls layout:
 *   '' or ' '  text display above and switch/slider below (default)
 *   't'        text display only (no switch/slider)
 *   's'        switch/slider only (no text display)
 *
 * Disabled items have no border (unlike disabled plain buttons).
 *
 * @param {object} item - Parsed menu item (type = 'toggle-button')
 * @param {function} onClick - Callback(cmd) invoked when state changes
 * @param {string} [menuBgColor='#000000'] - Menu background colour (hex)
 * @returns {HTMLDivElement}
 */
function renderPfodToggleButton(item, onClick, menuBgColor) {
    const td = item.toggleData;
    const isMultiOption = td.options.length > 2;
    const div = document.createElement('div');
    div.className = 'pfod-toggle-button';

    // Apply only backgroundColor to the outer div so that text formats (underline, bold,
    // italic, color, fontSize) do not leak into the switch/slider row via CSS inheritance.
    // Text formats are applied to the text span only.
    if (item.formats.bgColor) div.style.backgroundColor = item.formats.bgColor;

    const effectiveBg = item.formats.bgColor || menuBgColor || '#000000';
    const contrastHex = xtermColorToHex(getBlackWhite(effectiveBg));

    const isDisabled = !!(item.formats && item.formats.disabled);
    if (isDisabled) {
        div.style.border = '2px dashed ' + contrastHex;
        div.style.cursor = 'default';
    } else {
        div.style.borderColor = contrastHex;
    }

    const showText   = (td.format !== 's');
    const showSwitch = (td.format !== 't');

    // Hoist references so click handlers can perform optimistic UI updates
    let textSpan = null;
    let thumb = null;

    if (showText) {
        textSpan = document.createElement('span');
        textSpan.className = 'pfod-button-text pfod-toggle-text';
        pfodSetFormattedText(textSpan, td.leading + (td.options[td.idx] || '') + td.trailing, contrastHex);
        // Apply text formats (color, bold, italic, underline, fontSize) only to this span
        applyPfodFormats(textSpan, item.formats);
        textSpan.style.backgroundColor = ''; // bgColor belongs to outer div only
        if (!item.formats.textColor) textSpan.style.color = contrastHex;
        div.appendChild(textSpan);
    }

    if (showSwitch) {
        if (isMultiOption) {
            const slider = _buildSliderRow(td, isDisabled, contrastHex);
            thumb = slider.thumb;
            div.appendChild(slider.container);
            if (!isDisabled) {
                // Mousedown+drag: thumb follows mouse smoothly; text updates when
                // entering a new option zone; mouseup snaps thumb to nearest option.
                slider.hitArea.addEventListener('mousedown', function(e) {
                    let hoveredIdx = td.idx;
                    function smooth(clientX) {
                        const rect = slider.track.getBoundingClientRect();
                        const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                        // Move thumb smoothly at raw position
                        thumb.style.left = 'calc(-2px + ' + pct + ' * (100% - 28px))';
                        // Update text only when crossing into a new option zone
                        const newHoveredIdx = Math.round(pct * (td.options.length - 1));
                        if (newHoveredIdx !== hoveredIdx) {
                            hoveredIdx = newHoveredIdx;
                            if (textSpan) {
                                pfodSetFormattedText(textSpan, td.leading + (td.options[hoveredIdx] || '') + td.trailing, contrastHex);
                            }
                        }
                    }
                    smooth(e.clientX);
                    e.preventDefault();
                    function onMove(e) { smooth(e.clientX); }
                    function onUp() {
                        document.removeEventListener('mousemove', onMove);
                        document.removeEventListener('mouseup', onUp);
                        // Snap thumb to nearest option on release
                        td.idx = hoveredIdx;
                        const snappedPct = td.options.length > 1 ? td.idx / (td.options.length - 1) : 0;
                        thumb.style.left = 'calc(-2px + ' + snappedPct + ' * (100% - 28px))';
                        onClick(item.cmd + '`' + td.idx);
                    }
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                });
            }
        } else {
            const switchRow = _buildToggleSwitchRow(td, isDisabled, contrastHex);
            thumb = switchRow.querySelector('.pfod-toggle-thumb');
            div.appendChild(switchRow);
        }
    }

    if (!isDisabled && !isMultiOption) {
        // 2-option toggle: click anywhere in the div toggles 0↔1 with optimistic update
        div.addEventListener('click', function() {
            const newIdx = td.idx === 0 ? 1 : 0;
            td.idx = newIdx;
            if (textSpan) {
                pfodSetFormattedText(textSpan, td.leading + (td.options[td.idx] || '') + td.trailing, contrastHex);
            }
            if (thumb) {
                if (newIdx !== 0) {
                    thumb.classList.add('pfod-toggle-thumb-right');
                } else {
                    thumb.classList.remove('pfod-toggle-thumb-right');
                }
            }
            onClick(item.cmd + '`' + newIdx);
        });
    } else if (!isDisabled && isMultiOption && !showSwitch) {
        // Multi-option text-only toggle (format='t', no slider).
        // The slider-track click handler above sits inside the
        // `if (showSwitch)` block so it's missing here — without
        // this branch the row would render but not respond to
        // taps.  Click anywhere advances to the next option,
        // wrapping around at the end.  Same optimistic-update
        // pattern: cycle locally + send `<cmd>`<newIdx>`.
        div.addEventListener('click', function() {
            const newIdx = (td.idx + 1) % td.options.length;
            td.idx = newIdx;
            if (textSpan) {
                pfodSetFormattedText(textSpan, td.leading + (td.options[td.idx] || '') + td.trailing, contrastHex);
            }
            onClick(item.cmd + '`' + newIdx);
        });
    }

    if (item.formats && item.formats.flash) {
        div.classList.add('pfod-flash');
    }
    return div;
}

/**
 * Render a pfod toggle/slider label (non-interactive) as an HTML div element.
 * Same layout as renderPfodToggleButton but no click handler, disabled switch/slider, no border.
 *
 * @param {object} item - Parsed menu item (type = 'toggle-label')
 * @param {string} [menuBgColor='#000000'] - Menu background colour (hex)
 * @returns {HTMLDivElement}
 */
function renderPfodToggleLabel(item, menuBgColor) {
    const td = item.toggleData;
    const isMultiOption = td.options.length > 2;
    const div = document.createElement('div');
    div.className = 'pfod-toggle-label';

    // Apply only backgroundColor to the outer div so text formats do not leak into the switch/slider row.
    if (item.formats.bgColor) div.style.backgroundColor = item.formats.bgColor;

    const effectiveBg = item.formats.bgColor || menuBgColor || '#000000';
    const contrastHex = xtermColorToHex(getBlackWhite(effectiveBg));
    // No border — toggle labels are non-interactive, like plain labels

    const showText   = (td.format !== 's');
    const showSwitch = (td.format !== 't');

    if (showText) {
        const textSpan = document.createElement('span');
        textSpan.className = 'pfod-button-text pfod-toggle-text';
        pfodSetFormattedText(textSpan, td.leading + (td.options[td.idx] || '') + td.trailing, contrastHex);
        // Apply text formats only to this span, not the outer div
        applyPfodFormats(textSpan, item.formats);
        textSpan.style.backgroundColor = '';
        if (!item.formats.textColor) textSpan.style.color = contrastHex;
        div.appendChild(textSpan);
    }

    if (showSwitch) {
        if (isMultiOption) {
            div.appendChild(_buildSliderRow(td, true, contrastHex).container);
        } else {
            div.appendChild(_buildToggleSwitchRow(td, true, contrastHex));
        }
    }

    if (item.formats && item.formats.flash) {
        div.classList.add('pfod-flash');
    }
    return div;
}

/**
 * Render a group of consecutive pfod navigation button items as a D-pad cross.
 *
 * Grid column assignments (fixed): Left=col1, Right=col3, Up/Home/Down=col2.
 * Grid ROW numbers are assigned dynamically so only visible items consume a row:
 *
 *   upRow        — Up cell (flex-col: label/button), only if Up is visible
 *   leftLabelRow — thin row for Left text label,     only if Left is visible
 *   buttonRow    — Left button(col1) + Home(col2) + Right button(col3),
 *                  only if at least one of Left/Right/Home is visible
 *   rightLabelRow— thin row for Right text label,    only if Right is visible
 *   downRow      — Down cell (flex-col: button/label),only if Down is visible
 *
 * Because row numbers are only allocated for visible items, hidden Left/Right/Home
 * produce no gap between Up and Down (upRow and downRow become adjacent rows).
 * Hidden Left/Right/Home still get a zero-height column-width placeholder in the
 * button row so visible neighbours stay in their correct column positions.
 *
 * Text/border colour defaults to <bw> contrast against the effective background.
 *
 * @param {object[]} navItems - Parsed menu items (type='nav'), up to 5
 * @param {function} onClick  - Callback(cmd) on button click
 * @param {string} [menuBgColor='#000000'] - Menu background colour (hex)
 * @returns {HTMLDivElement}
 */
function renderPfodNavButtons(navItems, onClick, menuBgColor) {
    const container = document.createElement('div');
    container.className = 'pfod-menu-nav-row';
    const menuContrastHex = xtermColorToHex(getBlackWhite(menuBgColor || '#000000'));

    function _isHidden(idx) {
        return navItems.length > idx && navItems[idx].formats && navItems[idx].formats.hidden;
    }
    function _isVisible(idx) { return navItems.length > idx && !_isHidden(idx); }

    const leftVisible  = _isVisible(0);
    const rightVisible = _isVisible(1);
    const homeVisible  = _isVisible(4);
    const anyMiddleVisible = leftVisible || rightVisible || homeVisible;

    // Allocate row numbers only for visible items so empty rows never appear.
    let rowCtr = 0;
    const upRow         = _isVisible(2)     ? ++rowCtr : null;
    const leftLabelRow  = (leftVisible || homeVisible)  ? ++rowCtr : null;
    const buttonRow     = anyMiddleVisible               ? ++rowCtr : null;
    const rightLabelRow = (rightVisible || homeVisible)  ? ++rowCtr : null;
    const downRow       = _isVisible(3)     ? ++rowCtr : null;

    // Apply colour formats to a nav button.
    // Button fill: item.formats.bgColor || menuBgColor (never <bw>).
    // Arrow/Home text: <bw> against button fill colour.
    // Border: <bw> against menu background (menuContrastHex).
    function _styleBtn(btn, item) {
        applyPfodFormats(btn, item.formats);
        if (!item.formats.textColor) {
            btn.style.color = xtermColorToHex(getBlackWhite(item.formats.bgColor || menuBgColor));
        }
        btn.style.borderColor = menuContrastHex;
    }

    // Create a text label span.
    // item: the nav item whose formats (textColor, bgColor, etc.) are applied to the label.
    //       Omit for invisible spacer placeholders — no formatting applied.
    // contrastHex passed to pfodSetFormattedText is the DEFAULT color; inline tags can override it.
    function _makeLabel(text, item) {
        const lbl = document.createElement('span');
        lbl.className = 'pfod-menu-nav-label';
        if (item) {
            const contrastHex = xtermColorToHex(getBlackWhite(item.formats.bgColor || menuBgColor));
            pfodSetFormattedText(lbl, text, contrastHex);
            applyPfodFormats(lbl, item.formats);
            lbl.style.backgroundColor = '';
            if (!item.formats.textColor) lbl.style.color = menuContrastHex;
        }
        return lbl;
    }

    // --- UP (index 2): flex-column wrapper — label above button ---
    if (upRow !== null) {
        const item = navItems[2];
        const w = document.createElement('div');
        w.style.display = 'flex';
        w.style.flexDirection = 'column';
        w.style.alignItems = 'center';
        w.style.gridRow = String(upRow);
        w.style.gridColumn = '2';
        const btn = document.createElement('button');
        btn.className = 'pfod-menu-nav-button';
        btn.textContent = '∧';
        _styleBtn(btn, item);
        btn.style.color = xtermColorToHex(getBlackWhite(item.formats.bgColor || menuBgColor));
        btn.addEventListener('click', function() { onClick(item.cmd); });
        w.appendChild(_makeLabel(item.text, item));
        w.appendChild(btn);
        container.appendChild(w);
    }

    // --- LEFT (index 0): thin label row above button row ---
    if (navItems.length > 0) {
        if (!_isHidden(0)) {
            const item = navItems[0];
            const lblDiv = document.createElement('div');
            lblDiv.style.display = 'flex';
            lblDiv.style.justifyContent = 'center';
            lblDiv.style.gridRow = String(leftLabelRow);
            lblDiv.style.gridColumn = '1';
            lblDiv.appendChild(_makeLabel(item.text, item));
            container.appendChild(lblDiv);
            const btn = document.createElement('button');
            btn.className = 'pfod-menu-nav-button';
            btn.textContent = '❮';
            btn.style.gridRow = String(buttonRow);
            btn.style.gridColumn = '1';
            _styleBtn(btn, item);
            btn.style.color = xtermColorToHex(getBlackWhite(item.formats.bgColor || menuBgColor));
            btn.addEventListener('click', function() { onClick(item.cmd); });
            container.appendChild(btn);
        }
    }

    // --- HOME (index 4): button with text inside ---
    if (navItems.length > 4 && !_isHidden(4)) {
        const item = navItems[4];
        const btn = document.createElement('button');
        btn.className = 'pfod-menu-nav-button';
        btn.style.fontSize = '2.1vw';
        btn.style.gridRow = String(buttonRow);
        btn.style.gridColumn = '2';
        _styleBtn(btn, item);
        pfodSetFormattedText(btn, item.text,
            xtermColorToHex(getBlackWhite(item.formats.bgColor || menuBgColor)));
        btn.addEventListener('click', function() { onClick(item.cmd); });
        container.appendChild(btn);
    } else if (buttonRow !== null) {
        // Home absent or hidden: hold col 2 space with an invisible placeholder.
        const ph = document.createElement('button');
        ph.className = 'pfod-menu-nav-button';
        ph.style.visibility = 'hidden';
        ph.style.gridRow = String(buttonRow);
        ph.style.gridColumn = '2';
        container.appendChild(ph);
    }

    // --- RIGHT (index 1): thin label row below button row ---
    if (navItems.length > 1) {
        if (!_isHidden(1)) {
            const item = navItems[1];
            const btn = document.createElement('button');
            btn.className = 'pfod-menu-nav-button';
            btn.textContent = '❯';
            btn.style.gridRow = String(buttonRow);
            btn.style.gridColumn = '3';
            _styleBtn(btn, item);
            btn.style.color = xtermColorToHex(getBlackWhite(item.formats.bgColor || menuBgColor));
            btn.addEventListener('click', function() { onClick(item.cmd); });
            container.appendChild(btn);
            const lblDiv = document.createElement('div');
            lblDiv.style.display = 'flex';
            lblDiv.style.justifyContent = 'center';
            lblDiv.style.gridRow = String(rightLabelRow);
            lblDiv.style.gridColumn = '3';
            lblDiv.appendChild(_makeLabel(item.text, item));
            container.appendChild(lblDiv);
        }
    }

    // --- DOWN (index 3): flex-column wrapper — button above label ---
    if (downRow !== null) {
        const item = navItems[3];
        const w = document.createElement('div');
        w.style.display = 'flex';
        w.style.flexDirection = 'column';
        w.style.alignItems = 'center';
        w.style.gridRow = String(downRow);
        w.style.gridColumn = '2';
        if (!anyMiddleVisible && upRow !== null) {
            w.style.marginTop = '4vw';
        }
        const btn = document.createElement('button');
        btn.className = 'pfod-menu-nav-button';
        btn.textContent = '∨';
        _styleBtn(btn, item);
        btn.style.color = xtermColorToHex(getBlackWhite(item.formats.bgColor || menuBgColor));
        btn.addEventListener('click', function() { onClick(item.cmd); });
        w.appendChild(btn);
        w.appendChild(_makeLabel(item.text, item));
        container.appendChild(w);
    }

    // When Home is visible without Left/Right, add invisible label-height spacers so the
    // button row has the same vertical padding as when Left/Right labels are present.
    if (homeVisible) {
        if (!leftVisible && leftLabelRow !== null) {
            const sp = document.createElement('div');
            sp.style.gridRow = String(leftLabelRow);
            sp.style.gridColumn = '2';
            sp.style.visibility = 'hidden';
            sp.appendChild(_makeLabel(' '));
            container.appendChild(sp);
        }
        if (!rightVisible && rightLabelRow !== null) {
            const sp = document.createElement('div');
            sp.style.gridRow = String(rightLabelRow);
            sp.style.gridColumn = '2';
            sp.style.visibility = 'hidden';
            sp.appendChild(_makeLabel(' '));
            container.appendChild(sp);
        }
    }

    return container;
}

/**
 * Compute the display string for a numeric slider item.
 * Formula: minScale + (currentValue - minValue) * (maxScale - minScale) / (maxValue - minValue)
 * Decimal places: max of the precision in each scale string, minimum 1.
 * Prepends '+' when showPlus is active (either scale string starts with '+') and value > 0.
 *
 * @param {object} nsd - numericSliderData from the parsed item
 * @returns {string}
 */
function computeNumericDisplayText(nsd) {
    const range = nsd.maxValue - nsd.minValue;
    const scaleMin = parseFloat(nsd.minScaleStr);
    const scaleMax = parseFloat(nsd.maxScaleStr);
    const val = range === 0 ? scaleMin
              : scaleMin + (nsd.currentValue - nsd.minValue) * (scaleMax - scaleMin) / range;
    const dec = (!isNaN(scaleMin) && !isNaN(scaleMax))
        ? calcDisplayDecimalPlaces(range, scaleMax - scaleMin)
        : 0;
    let formatted = val.toFixed(dec).replace(/\.?0+$/, ''); // trim trailing zeros
    const showPlus = nsd.maxScaleStr.startsWith('+') || nsd.minScaleStr.startsWith('+');
    if (showPlus && val > 0) formatted = '+' + formatted;
    return formatted;
}

/**
 * Build a full-width slider row for a numeric slider item.
 * Reuses all existing .pfod-slider-* CSS classes.
 * Thumb is positioned proportionally: calc(-2px + pct * (100% - 28px)).
 * Labels below show minScaleStr (left) and maxScaleStr (right).
 *
 * @param {object} nsd - numericSliderData from the parsed item
 * @param {boolean} disabled - true for labels and disabled buttons
 * @param {string} contrastHex - colour for scale labels
 * @returns {{container: HTMLDivElement, hitArea: HTMLDivElement, track: HTMLDivElement, thumb: HTMLDivElement}}
 */
function _buildNumericSliderRow(nsd, disabled, contrastHex) {
    const range = nsd.maxValue - nsd.minValue;
    const pct = range === 0 ? 0 : (nsd.currentValue - nsd.minValue) / range;

    const container = document.createElement('div');
    container.className = 'pfod-slider-container';

    const hitArea = document.createElement('div');
    hitArea.className = disabled ? 'pfod-slider-hit-area pfod-slider-hit-area-disabled'
                                 : 'pfod-slider-hit-area';

    const track = document.createElement('div');
    track.className = 'pfod-slider-track';
    track.style.background = contrastHex;

    const thumb = document.createElement('div');
    thumb.className = 'pfod-slider-thumb';
    thumb.style.left = 'calc(-2px + ' + pct + ' * (100% - 28px))';
    thumb.style.background = contrastHex;
    thumb.style.border = '2px solid ' + (contrastHex.toLowerCase() === '#ffffff' ? '#000000' : '#ffffff');
    track.appendChild(thumb);
    hitArea.appendChild(track);
    container.appendChild(hitArea);

    const labelsRow = document.createElement('div');
    labelsRow.className = 'pfod-slider-opt-labels-row';
    labelsRow.style.color = contrastHex;

    const leftLbl = document.createElement('span');
    leftLbl.textContent = substituteUnsupportedUnitsGlyphs(nsd.minScaleStr);
    const rightLbl = document.createElement('span');
    rightLbl.textContent = substituteUnsupportedUnitsGlyphs(nsd.maxScaleStr);

    labelsRow.appendChild(leftLbl);
    labelsRow.appendChild(rightLbl);
    container.appendChild(labelsRow);

    return { container, hitArea, track, thumb };
}

/**
 * Render a pfod numeric slider button (interactive) as an HTML div element.
 * Clicking on the slider hit area maps click x-position to the nearest integer
 * value in [minValue, maxValue] and sends {<cmd>`<newValue>} via onClick.
 * Display text and thumb update optimistically before the server responds.
 *
 * @param {object} item - Parsed menu item (type = 'numeric-slider-button')
 * @param {function} onClick - Callback(cmd) invoked when value changes
 * @param {string} [menuBgColor='#000000'] - Menu background colour (hex)
 * @returns {HTMLDivElement}
 */
function renderPfodNumericSlider(item, onClick, menuBgColor) {
    const nsd = item.numericSliderData;
    const div = document.createElement('div');
    div.className = 'pfod-toggle-button';

    if (item.formats.bgColor) div.style.backgroundColor = item.formats.bgColor;

    const effectiveBg = item.formats.bgColor || menuBgColor || '#000000';
    const contrastHex = xtermColorToHex(getBlackWhite(effectiveBg));

    const isDisabled = !!(item.formats && item.formats.disabled);
    if (isDisabled) {
        div.style.border = '2px dashed ' + contrastHex;
        div.style.cursor = 'default';
    } else {
        div.style.borderColor = contrastHex;
    }

    const showText   = nsd.format !== 's';
    const showSlider = nsd.format !== 't';

    let textSpan;
    if (showText) {
        textSpan = document.createElement('span');
        textSpan.className = 'pfod-button-text pfod-toggle-text';
        pfodSetFormattedText(textSpan, nsd.leading + computeNumericDisplayText(nsd) + nsd.trailing, contrastHex);
        applyPfodFormats(textSpan, item.formats);
        textSpan.style.backgroundColor = '';
        if (!item.formats.textColor) textSpan.style.color = contrastHex;
        div.appendChild(textSpan);
    }

    let slider;
    if (showSlider) {
        slider = _buildNumericSliderRow(nsd, isDisabled, contrastHex);
        div.appendChild(slider.container);
    }

    if (!isDisabled && showSlider) {
        // smooth: move thumb at raw pixel position; update text only when crossing
        // into a new integer value zone (mirrors multi-option toggle slider behaviour).
        function smooth(clientX) {
            const rect = slider.track.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            slider.thumb.style.left = 'calc(-2px + ' + pct + ' * (100% - 28px))';
            const range = nsd.maxValue - nsd.minValue;
            const newValue = Math.max(nsd.minValue, Math.min(nsd.maxValue,
                             Math.round(nsd.minValue + pct * range)));
            if (newValue !== nsd.currentValue) {
                nsd.currentValue = newValue;
                if (textSpan) pfodSetFormattedText(textSpan, nsd.leading + computeNumericDisplayText(nsd) + nsd.trailing, contrastHex);
            }
        }

        // mousedown starts a drag; mousemove updates live; mouseup snaps thumb to the
        // final integer position and sends the command.
        // Listeners are added to document so dragging outside the hit area still works,
        // and are removed immediately when the drag ends to avoid leaking.
        slider.hitArea.addEventListener('mousedown', function(e) {
            smooth(e.clientX);
            e.preventDefault(); // prevent text selection while dragging

            function onMove(e) { smooth(e.clientX); }
            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                // Snap thumb to the exact integer position on release
                const range = nsd.maxValue - nsd.minValue;
                const snappedPct = range === 0 ? 0 : (nsd.currentValue - nsd.minValue) / range;
                slider.thumb.style.left = 'calc(-2px + ' + snappedPct + ' * (100% - 28px))';
                onClick(item.cmd + '`' + nsd.currentValue);
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    if (item.formats && item.formats.flash) {
        div.classList.add('pfod-flash');
    }
    return div;
}

/**
 * Render a pfod numeric slider label (non-interactive) as an HTML div element.
 * Same layout as renderPfodNumericSlider but no click handler, disabled slider, no border.
 *
 * @param {object} item - Parsed menu item (type = 'numeric-slider-label')
 * @param {string} [menuBgColor='#000000'] - Menu background colour (hex)
 * @returns {HTMLDivElement}
 */
function renderPfodNumericSliderLabel(item, menuBgColor) {
    const nsd = item.numericSliderData;
    const div = document.createElement('div');
    div.className = 'pfod-toggle-label';

    if (item.formats.bgColor) div.style.backgroundColor = item.formats.bgColor;

    const effectiveBg = item.formats.bgColor || menuBgColor || '#000000';
    const contrastHex = xtermColorToHex(getBlackWhite(effectiveBg));

    const showText   = nsd.format !== 's';
    const showSlider = nsd.format !== 't';

    if (showText) {
        const textSpan = document.createElement('span');
        textSpan.className = 'pfod-button-text pfod-toggle-text';
        pfodSetFormattedText(textSpan, nsd.leading + computeNumericDisplayText(nsd) + nsd.trailing, contrastHex);
        applyPfodFormats(textSpan, item.formats);
        textSpan.style.backgroundColor = '';
        if (!item.formats.textColor) textSpan.style.color = contrastHex;
        div.appendChild(textSpan);
    }

    if (showSlider) {
        div.appendChild(_buildNumericSliderRow(nsd, true, contrastHex).container);
    }

    if (item.formats && item.formats.flash) {
        div.classList.add('pfod-flash');
    }
    return div;
}

// Ping sound: sound.mp3 is embedded as a base64 data URI by the build process.
// The placeholder below is replaced with the actual base64 string by build-bundle.js.
// If the placeholder was not replaced (sound.mp3 missing at build time, or running from
// source without a build), fall back to a programmatically generated WAV tone.
(function() {
    const mp3Base64 = '__SOUND_MP3_BASE64__';
    if (mp3Base64 !== '__SOUND_MP3_BASE64__') {
        // Placeholder was replaced by the build — use the embedded MP3
        window._pfodPingAudio = new Audio('data:audio/mpeg;base64,' + mp3Base64);
        return;
    }
    // Fallback: generate an 880 Hz ping with two echo repeats as a WAV data URI.
    // 8-bit unsigned PCM mono at 8000 Hz, 300 ms total duration.
    const sampleRate = 8000;
    const numSamples = 2400;
    const freq = 880;
    const decay = 15;
    const buf = new Uint8Array(44 + numSamples);
    const view = new DataView(buf.buffer);
    buf.set([82,73,70,70], 0);
    view.setUint32(4, 36 + numSamples, true);
    buf.set([87,65,86,69], 8);
    buf.set([102,109,116,32], 12);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true);
    buf.set([100,97,116,97], 36);
    view.setUint32(40, numSamples, true);
    for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        let s = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * decay) * 0.80;
        if (t >= 0.110) { const te = t - 0.110; s += Math.sin(2 * Math.PI * freq * te) * Math.exp(-te * decay) * 0.40; }
        if (t >= 0.210) { const te = t - 0.210; s += Math.sin(2 * Math.PI * freq * te) * Math.exp(-te * decay) * 0.20; }
        buf[44 + i] = Math.round((Math.max(-1, Math.min(1, s)) + 1) * 127.5);
    }
    let binary = '';
    for (let i = 0; i < buf.length; i++) { binary += String.fromCharCode(buf[i]); }
    window._pfodPingAudio = new Audio('data:audio/wav;base64,' + btoa(binary));
})();

/**
 * Play the cached ping sound.
 * Resets playback position before playing so rapid calls each produce a full tone.
 * The .play() promise rejection (e.g. blocked before first user gesture) is silently ignored.
 */
function pfodPlayPingSound() {
    if (!window._pfodPingAudio) return;
    window._pfodPingAudio.currentTime = 0;
    window._pfodPingAudio.play().catch(function() {});
}

// Export globally for use by pfodMenuDisplay.js and any other consumers
window.applyPfodFormats = applyPfodFormats;
window.pfodSetFormattedText = pfodSetFormattedText;
window.renderPfodButton = renderPfodButton;
window.renderPfodLabel = renderPfodLabel;
window.renderPfodToggleButton = renderPfodToggleButton;
window.renderPfodToggleLabel = renderPfodToggleLabel;
window.renderPfodNavButtons = renderPfodNavButtons;
window.renderPfodNumericSlider = renderPfodNumericSlider;
window.renderPfodNumericSliderLabel = renderPfodNumericSliderLabel;
window.pfodPlayPingSound = pfodPlayPingSound;
