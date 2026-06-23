/*
 * Copyright (C) 2014 Object Refinery Limited and KNIME.com AG
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Based on XYItemRendererState from AFreeChart (Android port of JFreeChart)
 */

"use strict";

/**
 * Creates a new renderer state object that maintains rendering context
 * across the rendering of a dataset. This object is passed to the renderer's
 * drawItem() method for each data point, providing a persistent context that
 * can be reused and modified across the rendering sequence.
 *
 * @classdesc State object for XY item rendering that maintains context
 * and provides reusable objects (like workingLine) to avoid excessive
 * memory allocations during rendering.
 *
 * @constructor
 * @param {Object} plotRenderingInfo  the plot rendering info (optional).
 * @returns {jsfc.XYItemRendererState}
 */
jsfc.XYItemRendererState = function(plotRenderingInfo) {
    if (!(this instanceof jsfc.XYItemRendererState)) {
        return new jsfc.XYItemRendererState(plotRenderingInfo);
    }

    this.plotRenderingInfo = plotRenderingInfo;

    /**
     * The first item index in the current series pass.
     * @type {number}
     */
    this.firstItemIndex = 0;

    /**
     * The last item index in the current series pass.
     * @type {number}
     */
    this.lastItemIndex = 0;

    /**
     * The local series index in the current series pass.
     * This is used to access the dataset with the correct local index,
     * while the global series index (passed to drawItem) is used for colors.
     * @type {number}
     */
    this.localSeriesIndex = 0;

    /**
     * A reusable line object to avoid creating new line objects for
     * every line segment during rendering. This is an important
     * optimization for rendering large datasets.
     * @type {Object}
     */
    this.workingLine = {
        x0: 0,
        y0: 0,
        x1: 0,
        y1: 0,
        setLine: function(x0, y0, x1, y1) {
            this.x0 = x0;
            this.y0 = y0;
            this.x1 = x1;
            this.y1 = y1;
        }
    };

    /**
     * Flag that controls whether the renderer processes all data items
     * or just the visible ones. Default is true (process visible only).
     * @type {boolean}
     */
    this.processVisibleItemsOnly = true;
};

/**
 * Returns the plot rendering info object.
 *
 * @returns {Object} The plot rendering info (or null).
 */
jsfc.XYItemRendererState.prototype.getPlotRenderingInfo = function() {
    return this.plotRenderingInfo;
};

/**
 * Returns the first item index for the current series pass.
 *
 * @returns {number} The first item index.
 */
jsfc.XYItemRendererState.prototype.getFirstItemIndex = function() {
    return this.firstItemIndex;
};

/**
 * Returns the last item index for the current series pass.
 *
 * @returns {number} The last item index.
 */
jsfc.XYItemRendererState.prototype.getLastItemIndex = function() {
    return this.lastItemIndex;
};

/**
 * Returns the working line object that can be reused for drawing.
 *
 * @returns {jsfc.Line} The working line.
 */
jsfc.XYItemRendererState.prototype.getWorkingLine = function() {
    return this.workingLine;
};

/**
 * Returns the flag that controls whether visible items only are processed.
 *
 * @returns {boolean} The flag.
 */
jsfc.XYItemRendererState.prototype.getProcessVisibleItemsOnly = function() {
    return this.processVisibleItemsOnly;
};

/**
 * Sets the flag that controls whether visible items only are processed.
 *
 * @param {boolean} flag  the flag.
 * @returns {undefined}
 */
jsfc.XYItemRendererState.prototype.setProcessVisibleItemsOnly = function(flag) {
    this.processVisibleItemsOnly = flag;
};

/**
 * This method is called by the plot when it starts rendering a pass
 * through a series. The default implementation records the first and
 * last item indices. Subclasses can override this method to implement
 * custom per-series initialization.
 *
 * @param {jsfc.XYDataset} dataset  the dataset.
 * @param {number} series  the series index.
 * @param {number} firstItem  the index of the first item in the series.
 * @param {number} lastItem  the index of the last item in the series.
 * @param {number} pass  the pass index.
 * @param {number} passCount  the total number of passes.
 * @returns {undefined}
 */
jsfc.XYItemRendererState.prototype.startSeriesPass = function(dataset, series,
        firstItem, lastItem, pass, passCount) {
    this.firstItemIndex = firstItem;
    this.lastItemIndex = lastItem;
    // Hook for subclasses to override for custom behavior
};

/**
 * This method is called by the plot when it ends rendering a pass
 * through a series. The default implementation does nothing, but
 * subclasses can override this method to implement custom per-series
 * cleanup or finalization.
 *
 * @param {jsfc.XYDataset} dataset  the dataset.
 * @param {number} series  the series index.
 * @param {number} firstItem  the index of the first item in the series.
 * @param {number} lastItem  the index of the last item in the series.
 * @param {number} pass  the pass index.
 * @param {number} passCount  the total number of passes.
 * @returns {undefined}
 */
jsfc.XYItemRendererState.prototype.endSeriesPass = function(dataset, series,
        firstItem, lastItem, pass, passCount) {
    // Hook for subclasses to override for custom behavior
};
