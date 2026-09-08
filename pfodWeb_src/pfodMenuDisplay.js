/*
   pfodMenuDisplay.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// pfod Menu Display Manager — manages the "menu-mode" display: scrollable list of buttons,
// labels, navigation rows, and an optional drawing canvas with a prompt at the bottom.
//
// Exports:    window.pfodMenuDisplay singleton (PfodMenuDisplay instance)
// Depends on: pfodMenuParser.js (pfodParseMenu, parsePfodFormatCodes),
//             pfodButtonRenderer.js (applyPfodFormats, renderPfodButton, renderPfodLabel,
//                                    renderPfodToggleButton, renderPfodToggleLabel,
//                                    renderPfodNavButtons),
//             redraw.js (getActualFontSize via pfodButtonRenderer)
// Called by:  responseHandlers.js (show, hide, update, isVisible, getMenuCanvas),
//             toolbarAndMenu.js (hide when navigating back from menu-mode)

class PfodMenuDisplay {
    constructor() {
        // DOM element references (created lazily on first use)
        this._menuContainer = null;
        this._scrollArea = null;
        this._promptEl = null;

        // The drawn-by-hand scrollbar, for browsers whose own one is an
        // overlay that fades out.  Stay null on browsers that draw a real
        // one — see _updateScrollIndicator.
        this._scrollTrack = null;
        this._scrollThumb = null;

        // Per drawing-item canvases: drawingName → {canvas, ctx, wrapper}
        this._menuCanvases = {};

        // Current menu state
        this._currentMenu = null;
        this._onItemClick = null;

        // True while any pointer is held down inside the menu scroll area.
        // Covers HTML buttons, sliders, toggles, and dwg canvases — all of which are
        // children of _scrollArea so their pointer events bubble up here.
        // Read by addToRequestQueue to block menuRefresh while user is interacting.
        this.menuMouseDown = false;
    }

    /**
     * Lazily find or create the menu container DOM elements.
     * Prefers elements already present in the HTML (added by pfodWeb.html via pfodCommon.html).
     * Falls back to dynamic creation and insertion into #canvas-wrapper if not found.
     * Subsequent calls are no-ops once the references are established.
     */
    _ensureContainer() {
        if (this._menuContainer) {
            // Throw if the container has been detached from the DOM - this happens if something
            // cleared canvas-wrapper.innerHTML, which destroys #menu-container.
            if (!document.contains(this._menuContainer)) {
                throw new Error('[pfodMenuDisplay] #menu-container was detached from the DOM (canvas-wrapper.innerHTML was cleared). Do not use innerHTML="" on canvas-wrapper.');
            }
            return;
        }

        // Find the existing DOM elements already present in the HTML
        const existing = document.getElementById('menu-container');
        if (!existing) {
            throw new Error('[pfodMenuDisplay] #menu-container not found in DOM');
        }
        this._menuContainer = existing;
        this._scrollArea = document.getElementById('menu-scroll-area');
        if (!this._scrollArea) {
            throw new Error('[pfodMenuDisplay] #menu-scroll-area not found in DOM');
        }

        // Track pointer-down state across all menu item types (HTML and canvas).
        // pointercancel covers cases where the OS cancels the pointer (e.g. scroll gesture).
        this._scrollArea.addEventListener('pointerdown', () => { this.menuMouseDown = true; });
        this._scrollArea.addEventListener('pointerup',   () => { this.menuMouseDown = false; });
        this._scrollArea.addEventListener('pointercancel', () => { this.menuMouseDown = false; });

        // The always-visible scrollbar, for browsers whose own one is an
        // overlay that fades out — see _updateScrollIndicator.  Built here,
        // with the rest of the persistent menu DOM, rather than per menu:
        // #menu-container and #menu-scroll-area both outlive any one menu.
        if (PfodMenuDisplay._usesOverlayScrollbars()) {
            this._scrollTrack = document.createElement('div');
            this._scrollTrack.id = 'menu-scroll-track';
            this._scrollThumb = document.createElement('div');
            this._scrollThumb.id = 'menu-scroll-thumb';
            this._menuContainer.appendChild(this._scrollTrack);
            this._menuContainer.appendChild(this._scrollThumb);
            // passive: the listener only reads geometry, and telling the
            // browser so keeps it off the scrolling critical path.
            this._scrollArea.addEventListener('scroll',
                () => this._updateScrollIndicator(), { passive: true });
        }

        this._promptEl = document.getElementById('menu-prompt');
        if (!this._promptEl) {
            throw new Error('[pfodMenuDisplay] #menu-prompt not found in DOM');
        }
    }

    /**
     * Show the pfod menu.
     * Switches body to 'menu-mode', renders all items in the scroll area,
     * displays the prompt at the bottom, and optionally moves the drawing
     * canvas into the drawing placeholder at the drawing item's scroll position.
     *
     * @param {object} menuData - Structured menu from pfodParseMenu()
     * @param {function} onItemClick - Callback(cmd) invoked when a menu item is clicked
     */
    show(menuData, onItemClick) {
        this._ensureContainer();

        // Re-render of the SAME menu (called from update() with this._currentMenu after
        // a {;} merge): preserve the user's scroll position.  innerHTML='' below resets
        // scrollTop, so capture it first.  Navigation to a NEW menu passes a different
        // menuData reference and resets to top, which is the expected behaviour.
        const isSameMenu = this._currentMenu === menuData && this._scrollArea;
        const savedScrollTop = isSameMenu ? this._scrollArea.scrollTop : 0;

        this._onItemClick = onItemClick;
        this._currentMenu = menuData;
        this._menuCanvases = {};

        // Clear previous content
        this._scrollArea.innerHTML = '';
        this._promptEl.innerHTML = '';
        this._promptEl.removeAttribute('style');
        this._scrollArea.removeAttribute('style');

        // Apply menu background colour to the scroll area and prompt.
        // When the header specifies no background colour, default to black (pfod default).
        const header = menuData.header;
        const menuBgColor = header.bgColor || '#000000';
        this._scrollArea.style.backgroundColor = menuBgColor;
        this._promptEl.style.backgroundColor = menuBgColor;

        // Render each item, grouping consecutive nav buttons into rows
        const items = menuData.items;
        let i = 0;
        while (i < items.length) {
            const item = items[i];

            if (item.type === 'nav') {
                // Collect all consecutive nav items into one row (up to 5)
                const navGroup = [];
                while (i < items.length && items[i].type === 'nav' && navGroup.length < 5) {
                    navGroup.push(items[i]);
                    i++;
                }
                const navEl = renderPfodNavButtons(navGroup, (cmd) => this._handleClick(cmd), menuBgColor);
                this._scrollArea.appendChild(navEl);

            } else if (item.type === 'dwg' || item.type === 'dwg-label') {
                // Drawing item: honour the same non-sticky flags as other menu items.
                // Hidden ('-') skips render entirely; disabled ('!') drops the click handler;
                // flash ('+') pulses the wrapper at 1Hz via the shared .pfod-flash class.
                if (item.formats && item.formats.hidden) {
                    i++;
                    continue;
                }
                // Each dwg/dwg-label item gets its own canvas so all drawings are visible
                // simultaneously (scrollable) and #drawing-canvas is never moved.
                const dwgWrapper = document.createElement('div');
                dwgWrapper.className = 'pfod-menu-dwg-wrapper';
                dwgWrapper.dataset.dwgCmd = item.cmd;
                dwgWrapper.dataset.loadCmd = item.loadCmd;
                dwgWrapper.style.backgroundColor = (item.formats && item.formats.bgColor) || menuBgColor || '#000000';

                // The MARGIN around the drawing is not a control.
                //
                // It used to carry a click listener that sent the item's cmd
                // whenever the press landed on the wrapper rather than the
                // canvas — and that margin is exactly where a finger ends up
                // when reaching past a full-width drawing for the scroll
                // strip, so scrolling regularly pressed the menu item by
                // accident.  The drawing itself is the control: a press on
                // it sends the item's cmd (pfodWebMouse.handleMouseDown,
                // when the dwg defines no touchZones) or works its
                // touchZones.  Nothing outside the canvas does anything.
                if (item.formats && item.formats.flash) {
                    dwgWrapper.classList.add('pfod-flash');
                }

                const menuCanvas = document.createElement('canvas');
                // Start hidden — the loading placeholder below occupies the
                // visible slot until the device response arrives with the
                // drawing's actual dimensions.  handleMenuResize unhides this
                // canvas (and removes the placeholder) once drawingsData[name].data
                // is populated.  This avoids the wide-aspect "Loading Drawing..."
                // rectangle flash that used to appear before the canvas could
                // be sized correctly.
                menuCanvas.style.display = 'none';
                menuCanvas.style.width = '100%';
                menuCanvas.style.height = 'auto';
                // An item that takes no user input takes no pointer events
                // either, and nothing happens when it is pressed: a
                // dwg-label is a picture, not a control, and a DISABLED dwg
                // item is one the device has switched off.  Making the
                // canvas transparent to the pointer is the whole of it —
                // the touch/mouse handlers are wired to the canvas, so with
                // this set they are never reached, whatever the drawing
                // contains.  Without it a disabled item still sent its
                // touchZones' cmds.
                if (item.type === 'dwg-label' || (item.formats && item.formats.disabled)) {
                    menuCanvas.style.pointerEvents = 'none';
                } else {
                    // The cursor belongs on the thing that is actually
                    // pressable, which is the drawing — it was on the
                    // wrapper, whose margin no longer does anything.
                    menuCanvas.style.cursor = 'pointer';
                }
                dwgWrapper.appendChild(menuCanvas);

                // Dummy "Loading drawing ..." placeholder shown until the dwg
                // dimensions arrive (important for slow BLE connections so the
                // user has some feedback that loading is in progress).  It is
                // completely discarded once data exists and the real canvas
                // is unhidden — see handleMenuResize.
                const loadingPlaceholder = document.createElement('div');
                loadingPlaceholder.className = 'pfod-menu-dwg-loading';
                loadingPlaceholder.textContent = 'Loading drawing …';
                dwgWrapper.appendChild(loadingPlaceholder);

                this._scrollArea.appendChild(dwgWrapper);

                const menuCtx = menuCanvas.getContext('2d');
                this._menuCanvases[item.loadCmd] = {
                    canvas: menuCanvas,
                    ctx: menuCtx,
                    wrapper: dwgWrapper,
                    loadingPlaceholder: loadingPlaceholder
                };
                i++;

            } else if (item.type === 'label') {
                if (!(item.formats && item.formats.hidden)) {
                    const el = renderPfodLabel(item, menuBgColor);
                    this._scrollArea.appendChild(el);
                }
                i++;

            } else if (item.type === 'toggle-button') {
                if (!(item.formats && item.formats.hidden)) {
                    const el = renderPfodToggleButton(item, (cmd) => this._handleClick(cmd), menuBgColor);
                    this._scrollArea.appendChild(el);
                }
                i++;

            } else if (item.type === 'toggle-label') {
                if (!(item.formats && item.formats.hidden)) {
                    const el = renderPfodToggleLabel(item, menuBgColor);
                    this._scrollArea.appendChild(el);
                }
                i++;

            } else if (item.type === 'numeric-slider-button') {
                if (!(item.formats && item.formats.hidden)) {
                    const el = renderPfodNumericSlider(item, (cmd) => this._handleClick(cmd), menuBgColor);
                    this._scrollArea.appendChild(el);
                }
                i++;

            } else if (item.type === 'numeric-slider-label') {
                if (!(item.formats && item.formats.hidden)) {
                    const el = renderPfodNumericSliderLabel(item, menuBgColor);
                    this._scrollArea.appendChild(el);
                }
                i++;

            } else {
                // Default: button
                if (!(item.formats && item.formats.hidden)) {
                    const el = renderPfodButton(item, (cmd) => this._handleClick(cmd), menuBgColor);
                    this._scrollArea.appendChild(el);
                }
                i++;
            }
        }

        // Render prompt text at the bottom.
        // Apply <bw> contrast default for prompt text when not explicitly specified.
        if (header.title) {
            const promptContrastHex = xtermColorToHex(getBlackWhite(menuBgColor));
            pfodSetFormattedText(this._promptEl, header.title, promptContrastHex);
            applyPfodFormats(this._promptEl, header.promptFormat);
            if (!header.promptFormat.textColor) {
                this._promptEl.style.color = promptContrastHex;
            }
        }
        // Apply the `+` (flash) non-sticky flag from the prompt format.
        // applyPfodFormats only handles sticky formats; flash is applied
        // here as a class so the CSS animation (#menu-prompt.pfod-flash
        // — see pfodCommon.css) can run on the prompt's content.
        // toggle() rather than add() so a cleared flag reliably removes
        // the animation when the menu re-renders without flash.
        this._promptEl.classList.toggle('pfod-flash',
            !!(header.promptFormat && header.promptFormat.flash));

        // Play a ping sound if any item in this menu has the @ (sound)
        // flag — or if the prompt format itself does (pfod allows the
        // flag on either, matching pfodApp behaviour).
        const promptHasSound = !!(header.promptFormat && header.promptFormat.sound);
        const anyItemSound   = menuData.items.some(item => item.formats && item.formats.sound);
        if (promptHasSound || anyItemSound) {
            pfodPlayPingSound();
        }

        // Mark "empty side" menus so the CSS can hide whichever side
        // (items area or prompt area) has no content and let the other
        // side fill the container.  Without these, a help-style screen
        // (prompt only) reserves the items' flex share and an items-
        // only menu reserves the prompt's padding strip — visually
        // wasting space at the edges.
        const menuContainerEl = document.getElementById('menu-container');
        if (menuContainerEl) {
            menuContainerEl.classList.toggle('no-items', menuData.items.length === 0);
            menuContainerEl.classList.toggle('no-prompt', !header.title);
        }

        // Switch the body class to activate menu-mode CSS
        document.body.className = 'menu-mode';

        // Restore scroll position for same-menu re-renders.  Defer to the next animation
        // frame so the caller's handleMenuResize() has run and sized the per-item canvases —
        // otherwise scrollTop would clamp to a tiny value while content is still 0-height.
        if (isSameMenu && savedScrollTop > 0) {
            const scrollArea = this._scrollArea;
            requestAnimationFrame(() => {
                if (scrollArea) scrollArea.scrollTop = savedScrollTop;
            });
        }
    }

    /**
     * Handle resize events while in menu-mode.
     * For each per-item canvas in _menuCanvases, resizes it to fill its wrapper width
     * while maintaining the drawing's aspect ratio, then redraws.
     * Also syncs the per-item canvas registry into redraw so performRedrawInMode renders
     * to the correct canvas element.
     *
     * @param {Redraw} redraw - The Redraw instance from DrawingViewer
     */
    /**
     * True when this browser draws OVERLAY scrollbars — ones painted over
     * the content that take no layout space (every mobile browser, and
     * macOS by default).
     *
     * It matters because a menu drawing canvas swallows touchstart and
     * touchmove (pfodWebMouse preventDefaults them so a touchZone drag is
     * not read as a page scroll).  With a classic scrollbar the strip it
     * occupies is never covered by a canvas, so there is always somewhere
     * to start a scroll; with an overlay scrollbar there is not, and a menu
     * whose first drawing fills the screen cannot be scrolled at all.
     * #menu-scroll-area.overlay-scrollbars pads a strip in by hand for that
     * case.
     *
     * Measured once, off a throwaway element, rather than sniffing the user
     * agent: Chrome on Android honours the ::-webkit-scrollbar styling and
     * ends up with a classic scrollbar, Firefox on Android does not.
     * @returns {boolean}
     */
    static _usesOverlayScrollbars() {
        if (PfodMenuDisplay._overlayScrollbars === undefined) {
            const probe = document.createElement('div');
            probe.style.cssText =
                'position:absolute;top:-9999px;width:100px;height:100px;overflow-y:scroll;';
            document.body.appendChild(probe);
            // Zero difference => the scrollbar is drawn over the content.
            PfodMenuDisplay._overlayScrollbars = (probe.offsetWidth - probe.clientWidth) === 0;
            probe.remove();
            console.log('[MENU_SCROLL] overlay scrollbars: ' +
                PfodMenuDisplay._overlayScrollbars);
        }
        return PfodMenuDisplay._overlayScrollbars;
    }

    /** Width of the strip .needs-scroll-gutter reserves, in CSS px.
     *  MUST match #menu-scroll-area.overlay-scrollbars.needs-scroll-gutter's
     *  padding-right — the hysteresis below works out how much taller the
     *  drawings get when the strip is released, and a wrong number here
     *  makes that arithmetic wrong. */
    static get SCROLL_GUTTER_PX() { return 40; }

    /**
     * Reserve the scroll strip when, and only when, the menu has content
     * off screen — and never flap between the two states.
     *
     * The naive test oscillates: the strip narrows the wrappers, every
     * drawing is sized from wrapper width, so reserving it makes the
     * content SHORTER, which can put it back under the viewport height,
     * which un-reserves it, which makes the content taller again.  A menu
     * whose content sits near the viewport height would toggle on every
     * resize.
     *
     * So the two directions use different thresholds:
     *
     *   off -> on   content overflows now
     *   on  -> off  content fits now AND still fits once the strip is
     *               given back — `heightGivenBack` is exactly how much
     *               taller the drawings become at the wider width, summed
     *               over the width-constrained ones (a height-constrained
     *               drawing does not change height with width, so it
     *               contributes nothing).
     *
     * Turning it off therefore cannot make it overflow, and turning it on
     * only happens when it already does. Neither edge can re-trigger the
     * other.
     *
     * @param {number} heightGivenBack — px the content would grow by if the
     *        strip were removed, from _sizeMenuDrawings
     * @returns {boolean} true when the class changed, so the caller knows
     *          the wrappers are a different width and the drawings need
     *          sizing again
     */
    _applyScrollGutter(heightGivenBack) {
        const area = this._scrollArea;
        if (!area) return false;
        const on = area.classList.contains('needs-scroll-gutter');
        const overflows = area.scrollHeight > area.clientHeight;
        const want = on
            ? !(area.scrollHeight + heightGivenBack <= area.clientHeight)
            : overflows;
        if (want === on) return false;
        area.classList.toggle('needs-scroll-gutter', want);
        console.log('[MENU_SCROLL] gutter ' + (want ? 'on' : 'off') +
            ' (scrollHeight=' + area.scrollHeight + ' clientHeight=' + area.clientHeight +
            ' givenBack=' + Math.round(heightGivenBack) + ')');
        return true;
    }

    /**
     * Put the scroll position and proportion on screen, permanently.
     *
     * The strip reserved by .needs-scroll-gutter gave the user somewhere to
     * start a scroll, but on a phone it read as nothing more than a black
     * margin: an overlay scrollbar is drawn by the browser only WHILE
     * scrolling, so until you happened to drag in the right place there was
     * no sign the menu continued below.  This draws the bar instead, and
     * leaves it there.
     *
     * Sized and placed against the scroll area's own box, from
     * #menu-container (the scroll area's offsetParent) so it does not
     * scroll away with the content it is describing.  Thumb length is the
     * fraction of the menu on screen, floored at 28px so a very long menu
     * still leaves something visible; its travel is the fraction scrolled.
     *
     * Only ever called on browsers that drew no usable bar of their own —
     * the elements are not even created otherwise.
     */
    _updateScrollIndicator() {
        const area = this._scrollArea;
        if (!area || !this._scrollTrack) return;
        const overflow = area.scrollHeight - area.clientHeight;
        const show = overflow > 0;
        this._scrollTrack.style.display = show ? 'block' : 'none';
        this._scrollThumb.style.display = show ? 'block' : 'none';
        if (!show) return;

        const trackTop = area.offsetTop;
        const trackHeight = area.clientHeight;
        const thumbHeight = Math.max(28,
            Math.round(trackHeight * (area.clientHeight / area.scrollHeight)));
        const travelled = area.scrollTop / overflow;   // 0 .. 1

        this._scrollTrack.style.top = trackTop + 'px';
        this._scrollTrack.style.height = trackHeight + 'px';
        this._scrollThumb.style.top =
            (trackTop + Math.round((trackHeight - thumbHeight) * travelled)) + 'px';
        this._scrollThumb.style.height = thumbHeight + 'px';
    }

    handleMenuResize(redraw) {
        if (!redraw) return;
        // Which KIND of scrollbar this browser has is a property of the
        // browser, so it is settled once and for all; whether the strip is
        // currently reserved is a property of the content, and is decided
        // below once the drawings have been sized.
        if (this._scrollArea && PfodMenuDisplay._usesOverlayScrollbars()) {
            this._scrollArea.classList.add('overlay-scrollbars');
        }
        const givenBack = this._sizeMenuDrawings(redraw);
        // One re-run at most: the hysteresis above guarantees the decision
        // cannot flip back, so this settles rather than looping.
        if (this._applyScrollGutter(givenBack)) {
            this._sizeMenuDrawings(redraw);
        }
        // Last, once the heights are final — the bar describes them.
        this._updateScrollIndicator();
    }

    /**
     * Size and repaint every menu drawing against the wrappers' current
     * width.  Split out of handleMenuResize so it can be run again after
     * the scroll strip is reserved or released, which changes that width.
     *
     * @param {object} redraw
     * @returns {number} how much taller the content would be if the scroll
     *          strip were released — see _applyScrollGutter
     */
    _sizeMenuDrawings(redraw) {
        let heightGivenBack = 0;
        // Maximum displayed height a drawing may occupy: the scroll area's visible height.
        // With CSS width:100%; height:auto, displayed height = wrapperWidth / aspectRatio.
        // When that exceeds viewportHeight we switch to CSS height:viewportHeight; width:auto
        // so the drawing fits completely in the viewport when scrolled into view.
        const viewportHeight = this._scrollArea ? this._scrollArea.clientHeight : 0;
        console.log(`[MENU_RESIZE] viewportHeight=${viewportHeight} scrollArea=${this._scrollArea ? 'ok' : 'null'}`);

        // Re-register all per-item canvases with redraw (handles update() canvas recreation)
        redraw.clearMenuCanvases();
        for (const [drawingName, entry] of Object.entries(this._menuCanvases)) {
            redraw.setMenuCanvas(drawingName, entry.canvas, entry.ctx);
            const drawingDataEntry = redraw.redrawDrawingManager.drawingsData[drawingName];
            const wrapperWidth = entry.wrapper.clientWidth;
            if (wrapperWidth <= 0) continue;
            const availableWidth = Math.max(1, Math.floor(wrapperWidth - 26));

            if (!drawingDataEntry || !drawingDataEntry.data) {
                // No drawing data yet — the wrapper is currently showing its
                // "Loading drawing …" placeholder (created in show()).  Just
                // leave it there: nothing to paint, no canvas to size, and
                // the placeholder gives the user feedback on slow BLE links.
                console.log(`[MENU_RESIZE] ${drawingName}: no data — placeholder still showing`);
                continue;
            }
            // Data exists — drop the loading placeholder and unhide the real
            // canvas.  Removing the placeholder from the DOM (rather than
            // hiding it) keeps the wrapper clean and means future no-data
            // resizes can't accidentally re-show it.
            if (entry.loadingPlaceholder && entry.loadingPlaceholder.parentNode) {
                entry.loadingPlaceholder.parentNode.removeChild(entry.loadingPlaceholder);
                entry.loadingPlaceholder = null;
            }
            if (entry.canvas.style.display === 'none') {
                entry.canvas.style.display = 'block';
            }
            const logicalWidth = Math.min(Math.max(drawingDataEntry.data.x, 1), 255);
            const logicalHeight = Math.min(Math.max(drawingDataEntry.data.y, 1), 255);
            const aspectRatio = logicalWidth / logicalHeight;

            // With CSS width:100%, height:auto the canvas displays at wrapperWidth × wrapperWidth/aspectRatio.
            // If that height exceeds viewportHeight, switch to CSS height:(viewportHeight-20), width:auto.
            // The 20px margin keeps the wrapper border visible above and below the drawing.
            // The wrapper uses display:flex; justify-content:center so the narrower canvas is centred,
            // and the wrapper's bgColor (set per-item in show()) fills the side gaps.
            // displayed width = constrainedHeight × aspectRatio which is guaranteed ≤ wrapperWidth
            // (the two overflow conditions are mutually exclusive).
            const displayedHeightWidthFirst = wrapperWidth / aspectRatio;
            const heightConstrained = viewportHeight > 0 && displayedHeightWidthFirst > viewportHeight;
            const constrainedCssHeight = viewportHeight - 40;

            let canvasWidth, canvasHeight;
            if (heightConstrained) {
                // Set explicit CSS pixel dimensions so the canvas is exactly the right size.
                // The wrapper uses display:flex; justify-content:center so the narrower canvas
                // is centred; the wrapper's bgColor (set in show()) fills the side gaps.
                const cssDwgWidth = Math.floor(constrainedCssHeight * aspectRatio);
                entry.canvas.style.height = constrainedCssHeight + 'px';
                entry.canvas.style.width = cssDwgWidth + 'px';
                canvasHeight = Math.max(1, Math.floor(constrainedCssHeight - 26));
                canvasWidth = Math.max(1, Math.floor(canvasHeight * aspectRatio));
            } else {
                // Restore class-defined CSS (width:100%; height:auto) by clearing inline overrides.
                entry.canvas.style.width = '';
                entry.canvas.style.height = '';
                canvasWidth = availableWidth;
                canvasHeight = Math.max(1, Math.floor(canvasWidth / aspectRatio));
                // Only a WIDTH-constrained drawing grows when the scroll
                // strip is released — its height follows its width.  A
                // height-constrained one is already pinned to the viewport
                // and would not change at all, so it adds nothing here.
                heightGivenBack += PfodMenuDisplay.SCROLL_GUTTER_PX / aspectRatio;
            }
            console.log(`[MENU_RESIZE] ${drawingName}: logical=${logicalWidth}x${logicalHeight} wrapperW=${wrapperWidth} displayedH=${Math.floor(displayedHeightWidthFirst)} cssH=${heightConstrained ? constrainedCssHeight : 'auto'} canvas=${canvasWidth}x${canvasHeight} wrapperBg=${entry.wrapper.style.backgroundColor} constrained=${heightConstrained}`);

            if (entry.canvas.width !== canvasWidth || entry.canvas.height !== canvasHeight) {
                entry.canvas.width = canvasWidth;
                entry.canvas.height = canvasHeight;
            }
            entry.canvas.scaleX = canvasWidth / logicalWidth;
            entry.canvas.scaleY = canvasHeight / logicalHeight;
            redraw.performRedrawInMode('menu-mode', drawingName);
        }
        return heightGivenBack;
    }

    /**
     * Return the canvas registry entry for a menu drawing item, or null.
     * @param {string} drawingName - The loadCmd of the drawing item
     * @returns {{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, wrapper: HTMLElement}|null}
     */
    getMenuCanvas(drawingName) {
        return this._menuCanvases[drawingName] || null;
    }

    /**
     * Hide the menu display and switch to message-mode.
     * Moves the drawing canvas back to #canvas-wrapper and clears the menu content.
     */
    hide() {
        // Per-item canvases are destroyed by clearing the scroll area HTML below.
        // Clear the registry so stale references are not held.
        this._menuCanvases = {};

        // Clear menu content
        if (this._scrollArea) {
            this._scrollArea.innerHTML = '';
        }
        if (this._promptEl) {
            this._promptEl.innerHTML = '';
        }
        this._currentMenu = null;
        this._onItemClick = null;

        // Return to message-mode
        if (document.body.className === 'menu-mode') {
            document.body.className = 'message-mode';
        }
    }

    /**
     * Return true if the menu is currently being shown.
     * @returns {boolean}
     */
    isVisible() {
        return document.body.className === 'menu-mode';
    }

    /**
     * Return true if drawingName is one of the drawing items embedded in the current menu.
     * @param {string} drawingName
     * @returns {boolean}
     */
    isMenuDrawing(drawingName) {
        return drawingName in this._menuCanvases;
    }

    /**
     * Apply a pfod partial menu update ({; ...}) to the currently displayed menu.
     * Merges the update into the stored menu state then re-renders in full.
     *
     * Merge rules per the pfod spec:
     *   Items NOT in the update — left completely unchanged (sticky AND non-sticky).
     *   Items IN the update:
     *     Non-sticky flags (disabled, hidden, flash, sound): replaced by exactly what
     *       the update contains — absence of a flag clears it.
     *     Sticky formats (bgColor, textColor, bold, italic, underline, fontSize):
     *       only applied when non-default in the update; otherwise the existing value persists.
     *     Text / intFields / textFields: only replaced when the update provides non-empty values.
     *
     * @param {object} menuData - Parsed update from pfodParseMenu() where header.isUpdate === true
     */
    update(menuData) {
        this._ensureContainer();
        if (!this._currentMenu) {
            // No existing menu — {;} updates apply only to existing items by cmd
            // match.  With nothing to update, every update item is silently
            // ignored.  Per protocol: do NOT treat the update as a fresh menu.
            console.log('[MENU_DISPLAY] {;} update arrived with no current menu — silently ignored (updates apply only to existing items)');
            return;
        }

        // Build a lookup of updated items by cmd
        const updateMap = {};
        for (const item of menuData.items) {
            if (item.cmd) {
                updateMap[item.cmd] = item;
            }
        }

        // Merge updates into each current menu item
        for (const item of this._currentMenu.items) {
            const updatedItem = updateMap[item.cmd];
            if (!updatedItem) continue; // Not mentioned — leave unchanged

            // Non-sticky flags: replace entirely with what the update says
            // (absence of a flag in the update = flag is cleared)
            item.formats.disabled = updatedItem.formats.disabled;
            item.formats.hidden   = updatedItem.formats.hidden;
            item.formats.flash    = updatedItem.formats.flash;
            item.formats.sound    = updatedItem.formats.sound;

            // Sticky formats: only apply if non-default in the update
            if (updatedItem.formats.bgColor   !== null) item.formats.bgColor   = updatedItem.formats.bgColor;
            if (updatedItem.formats.textColor !== null) item.formats.textColor = updatedItem.formats.textColor;
            if (updatedItem.formats.bold)               item.formats.bold      = true;
            if (updatedItem.formats.italic)             item.formats.italic    = true;
            if (updatedItem.formats.underline)          item.formats.underline = true;
            if (updatedItem.formats.fontSize !== 0)     item.formats.fontSize  = updatedItem.formats.fontSize;

            // Text/intFields/toggleData/numericSliderData merges don't apply to dwg items
            // (they have no text content — only loadCmd and a canvas).
            if (item.type === 'dwg' || item.type === 'dwg-label') continue;

            // Text: only replace when the update provides non-empty values
            if (updatedItem.text !== '')            item.text       = updatedItem.text;
            if (updatedItem.textFields.length > 0)  item.textFields = updatedItem.textFields;
            // Toggle items: refresh leading/trailing/options from the
            // update's parsed toggleData (the parser builds it whenever
            // textFields.length >= 3).  Without this the renderer keeps
            // reading the original toggleData.leading/trailing/options
            // — so format changes the designer emits INSIDE the leading
            // text (e.g. `<-2>Output is `) never show up in the
            // rendered toggle.  Real devices that send partial updates
            // without all 3 text fields leave updatedItem.toggleData
            // null, so the existing toggleData stays untouched.
            if (item.toggleData && updatedItem.toggleData) {
                item.toggleData.leading  = updatedItem.toggleData.leading;
                item.toggleData.trailing = updatedItem.toggleData.trailing;
                item.toggleData.options  = updatedItem.toggleData.options;
                item.toggleData.format   = updatedItem.toggleData.format;
                // idx is synced from intFields[0] below (the
                // pre-existing path).
            }
            // Numeric-slider items: same refresh pattern — without
            // this the renderer keeps reading the original
            // numericSliderData.leading / .trailing / .maxValue /
            // .minValue / .maxScaleStr / .minScaleStr so any edit
            // the designer applies to a PWM/Slider's text or range
            // never propagates to the preview.  Real devices sending
            // partial `{;|<cmd>`<newVal>}` updates leave
            // updatedItem.numericSliderData null (intFields=1,
            // textFields=0 — fails the parser's `>=2 ints` toggle/
            // slider detection), so the existing data stays
            // untouched and only currentValue syncs via the
            // intFields path below.
            if (item.numericSliderData && updatedItem.numericSliderData) {
                const oldNsd = item.numericSliderData;
                const newNsd = updatedItem.numericSliderData;
                oldNsd.leading      = newNsd.leading;
                oldNsd.trailing     = newNsd.trailing;
                oldNsd.maxValue     = newNsd.maxValue;
                oldNsd.minValue     = newNsd.minValue;
                oldNsd.maxScaleStr  = newNsd.maxScaleStr;
                oldNsd.minScaleStr  = newNsd.minScaleStr;
                oldNsd.format       = newNsd.format;
                // currentValue is synced from intFields[0] below.
            }
            if (updatedItem.intFields.length > 0) {
                item.intFields = updatedItem.intFields;
                // Sync toggleData.idx from intFields[0] — update messages like {;|M`1}
                // contain only the cmd + new index, so updatedItem.toggleData is null.
                if (item.toggleData) {
                    const newIdx = parseInt(updatedItem.intFields[0], 10);
                    if (!isNaN(newIdx)) {
                        item.toggleData.idx = Math.max(0, Math.min(newIdx, item.toggleData.options.length - 1));
                    }
                }
                // Sync numericSliderData.currentValue from intFields[0]
                if (item.numericSliderData) {
                    const newValue = parseInt(updatedItem.intFields[0], 10);
                    if (!isNaN(newValue)) {
                        const nsd = item.numericSliderData;
                        nsd.currentValue = Math.max(nsd.minValue, Math.min(newValue, nsd.maxValue));
                    }
                }
            }
        }

        // Header fields: only apply if non-default in the update
        if (menuData.header.bgColor !== null)      this._currentMenu.header.bgColor      = menuData.header.bgColor;
        if (menuData.header.title !== '')           this._currentMenu.header.title        = menuData.header.title;
        if (menuData.header.reRequestMs !== null)   this._currentMenu.header.reRequestMs  = menuData.header.reRequestMs;

        // Prompt-format fields: same sticky-merge semantics as item formats.
        //   Non-sticky flags (flash, sound): replaced entirely — absence clears them.
        //   Sticky formats (textColor, bold, italic, underline, fontSize): only applied
        //   when non-default in the update; otherwise the existing value persists.
        // This ensures a real device's {;} that only updates items (no format codes in
        // the header) does not wipe any bold/italic/size the user has already set.
        // To CLEAR a sticky field the device (or designer) must send a full {,} menu;
        // a {;} that omits e.g. <b> leaves existing bold in place.
        const upFmt = menuData.header.promptFormat;
        const cur   = this._currentMenu.header.promptFormat;
        if (upFmt && cur) {
            // Non-sticky: replace entirely (absence = cleared)
            cur.flash = upFmt.flash;
            cur.sound = upFmt.sound;
            // Sticky: only apply when non-default in the update
            if (upFmt.textColor !== null)  cur.textColor = upFmt.textColor;
            if (upFmt.bold)                cur.bold      = true;
            if (upFmt.italic)              cur.italic    = true;
            if (upFmt.underline)           cur.underline = true;
            if (upFmt.fontSize !== 0)      cur.fontSize  = upFmt.fontSize;
        }

        // Re-render the merged menu state in full (show() creates fresh per-item canvases)
        this.show(this._currentMenu, this._onItemClick);
    }

    /**
     * Forward a menu item click to the registered callback.
     * @param {string} cmd - The pfod command to send
     */
    _handleClick(cmd) {
        if (this._onItemClick) {
            this._onItemClick(cmd);
        }
    }
}

// Singleton instance accessible by pfodWeb.js and other modules
window.pfodMenuDisplay = new PfodMenuDisplay();
