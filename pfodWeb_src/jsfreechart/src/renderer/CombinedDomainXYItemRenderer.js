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
 * Special renderer for CombinedDomainXYPlot that uses XYItemRendererState
 * to maintain proper rendering context across multiple subplots.
 */

"use strict";

/**
 * Creates a new special renderer for CombinedDomainXYPlot that properly
 * manages rendering state across multiple subplots with a shared domain axis.
 *
 * This renderer uses XYItemRendererState to maintain context and is designed
 * specifically for rendering series with a global color palette that doesn't
 * repeat across subplots.
 *
 * @constructor
 * @returns {jsfc.CombinedDomainXYItemRenderer}
 */
jsfc.CombinedDomainXYItemRenderer = function() {
    if (!(this instanceof jsfc.CombinedDomainXYItemRenderer)) {
        return new jsfc.CombinedDomainXYItemRenderer();
    }
    jsfc.BaseXYRenderer.init(this);
    this._drawSeriesAsPath = true;
};

jsfc.CombinedDomainXYItemRenderer.prototype = new jsfc.BaseXYRenderer();

/**
 * Returns the number of passes required to render the data. Two passes are
 * required: first for lines, second for shapes/markers.
 *
 * @returns {number}
 */
jsfc.CombinedDomainXYItemRenderer.prototype.passCount = function() {
    return 2;
};

/**
 * Draws a path for one series to the specified graphics context.
 * Uses the state object to access series boundary information.
 *
 * @param {jsfc.Context2D} ctx  the graphics context.
 * @param {jsfc.XYItemRendererState} state  the renderer state.
 * @param {jsfc.Rectangle} dataArea  the data area.
 * @param {jsfc.XYPlot} plot  the plot.
 * @param {jsfc.XYDataset} dataset  the dataset.
 * @param {number} seriesIndex  the series index (potentially global).
 * @returns {undefined}
 */
jsfc.CombinedDomainXYItemRenderer.prototype.drawSeries = function(ctx, state,
        dataArea, plot, dataset, seriesIndex) {
    // Use local series index for dataset access, but global index for colors
    var localSeriesIndex = state.localSeriesIndex;
    var itemCount = dataset.itemCount(localSeriesIndex);
    if (itemCount === 0) {
        return;
    }
    var connect = false;
    ctx.beginPath();
    for (var i = 0; i < itemCount; i++) {
        var x = dataset.x(localSeriesIndex, i);
        var y = dataset.y(localSeriesIndex, i);
        if (y === null) {
            connect = false;
            continue;
        }

        // convert these to target coordinates using the plot's axes
        var xx = plot.getXAxis().valueToCoordinate(x, dataArea.x(),
                dataArea.x() + dataArea.width());
        var yy = plot.getYAxis().valueToCoordinate(y, dataArea.y()
                + dataArea.height(), dataArea.y());
        if (!connect) {
            ctx.moveTo(xx, yy);
            connect = true;
        } else {
            ctx.lineTo(xx, yy);
        }
    }
    // Use global seriesIndex for color lookup (colors don't repeat across subplots)
    // Access color source directly using global index (avoids dataset.seriesKey call)
    ctx.setLineColor(this._lineColorSource.getColor(seriesIndex, itemCount - 1));
    ctx.setLineStroke(this._strokeSource.getStroke(seriesIndex, 0));
    ctx.stroke();
};

/**
 * Draws one data item to the specified graphics context using proper
 * state management.
 *
 * This is the main drawItem method that respects XYItemRendererState
 * for proper context management across subplots.
 *
 * @param {jsfc.Context2D} ctx  the graphics context.
 * @param {jsfc.XYItemRendererState} state  the renderer state.
 * @param {jsfc.Rectangle} dataArea  the data area.
 * @param {jsfc.XYPlot} plot  the plot.
 * @param {jsfc.XYDataset} dataset  the dataset.
 * @param {number} seriesIndex  the series index (potentially global).
 * @param {number} itemIndex  the item index.
 * @param {number} pass  the render pass.
 * @returns {undefined}
 */
jsfc.CombinedDomainXYItemRenderer.prototype.drawItem = function(ctx, state,
        dataArea, plot, dataset, seriesIndex, itemIndex, pass) {

    // Use local series index for dataset access, but global index for colors
    var localSeriesIndex = state.localSeriesIndex;

    if (pass === 0 && this._drawSeriesAsPath) {
        // Draw entire series as path in first pass if enabled
        var lastItem = state.getLastItemIndex();
        if (itemIndex === lastItem) {
            this.drawSeries(ctx, state, dataArea, plot, dataset, seriesIndex);
        }
        return;
    }

    var x = dataset.x(localSeriesIndex, itemIndex);
    var y = dataset.y(localSeriesIndex, itemIndex);

    // convert these to target coordinates using the plot's axes
    var xx = plot.getXAxis().valueToCoordinate(x, dataArea.x(),
            dataArea.x() + dataArea.width());
    var yy = plot.getYAxis().valueToCoordinate(y, dataArea.y()
            + dataArea.height(), dataArea.y());

    if (pass === 0) { // FIRST pass: draw lines
        var firstItem = state.getFirstItemIndex();
        if (itemIndex > firstItem) {
            // get the previous item using LOCAL series index
            var x0 = dataset.x(localSeriesIndex, itemIndex - 1);
            var y0 = dataset.y(localSeriesIndex, itemIndex - 1);
            var xx0 = plot.getXAxis().valueToCoordinate(x0, dataArea.x(),
                    dataArea.x() + dataArea.width());
            var yy0 = plot.getYAxis().valueToCoordinate(y0, dataArea.y()
                    + dataArea.height(), dataArea.y());

            // Use the state's working line object (memory optimization)
            state.workingLine.setLine(xx0, yy0, xx, yy);

            // connect with a line using the GLOBAL series index for color lookup
            // Access color source directly using global index (avoids dataset.seriesKey call)
            ctx.setLineColor(this._lineColorSource.getColor(seriesIndex,
                    itemIndex));
            ctx.setLineStroke(this._strokeSource.getStroke(seriesIndex,
                    itemIndex));
            ctx.drawLine(xx0, yy0, xx, yy);
        }
    } else if (pass === 1) { // SECOND pass: draw shapes/markers if any
        // Currently not drawing shapes, but hook is available
    }
};
