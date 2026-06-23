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
 * Based on CombinedDomainXYPlot from AFreeChart (Android port of JFreeChart)
 */

"use strict";

/**
 * Creates a new combined plot that shares a domain (x) axis among multiple
 * subplots, which are stacked vertically.
 *
 * @classdesc A plot that contains multiple XYPlot subplots that share a
 * common domain (x) axis. Each subplot has its own range (y) axis. The
 * subplots are stacked vertically with configurable spacing.
 *
 * @constructor
 * @param {jsfc.ValueAxis} [domainAxis]  the shared domain axis (optional).
 * @returns {jsfc.CombinedDomainXYPlot}
 */
jsfc.CombinedDomainXYPlot = function(domainAxis) {
    if (!(this instanceof jsfc.CombinedDomainXYPlot)) {
        throw new Error("Use 'new' for construction.");
    }

    this._listeners = [];
    this._notify = true;
    this._plotBackground = null;
    this._dataBackground = null;

    /** The shared renderer applied to all subplots */
    this._renderer = null;

    /** The shared domain (x) axis */
    this._xAxis = domainAxis || new jsfc.LinearAxis();
    this._xAxisPosition = jsfc.RectangleEdge.BOTTOM;

    /** Storage for the subplots */
    this._subplots = [];

    /** The gap between subplots in pixels */
    this._gap = 5.0;

    /** Temporary storage for subplot areas (calculated during draw) */
    this._subplotAreas = [];

    /** Axis offsets */
    this._axisOffsets = new jsfc.Insets(0, 0, 0, 0);

    // Set up axis listener
    this._xAxisListener = function(p) {
        var plot = p;
        return function(axis) {
            if (axis.isAutoRange()) {
                axis.configureAsXAxis(plot);
            }
            plot.notifyListeners();
        };
    }(this);
    this._xAxis.addListener(this._xAxisListener);
};

/**
 * Returns the shared domain (x) axis.
 *
 * @returns {jsfc.ValueAxis} The domain axis.
 */
jsfc.CombinedDomainXYPlot.prototype.getXAxis = function() {
    return this._xAxis;
};

/**
 * Sets the shared domain (x) axis.
 *
 * @param {jsfc.ValueAxis} axis  the new domain axis.
 * @param {boolean} [notify]  notify listeners? (default is true).
 * @returns {undefined}
 */
jsfc.CombinedDomainXYPlot.prototype.setXAxis = function(axis, notify) {
    if (this._xAxisListener) {
        this._xAxis.removeListener(this._xAxisListener);
    }
    this._xAxis = axis;
    this._xAxis.addListener(this._xAxisListener);
    if (notify !== false) {
        this.notifyListeners();
    }
};

/**
 * Returns the renderer (if one has been set) that will be applied to all
 * subplots.
 *
 * @returns {jsfc.XYRenderer} The renderer (or null).
 */
jsfc.CombinedDomainXYPlot.prototype.getRenderer = function() {
    return this._renderer;
};

/**
 * Sets the renderer that will be applied to all subplots in the combined
 * plot. This follows the pattern from Java's CombinedDomainXYPlot which
 * applies a single renderer to all subplots for consistent rendering.
 *
 * @param {jsfc.XYRenderer} renderer  the renderer.
 * @param {boolean} [notify]  notify listeners? (default is true).
 * @returns {undefined}
 */
jsfc.CombinedDomainXYPlot.prototype.setRenderer = function(renderer, notify) {
    this._renderer = renderer;
    // Apply the renderer to all existing subplots
    for (var i = 0; i < this._subplots.length; i++) {
        this._subplots[i].setRenderer(renderer);
    }
    if (notify !== false) {
        this.notifyListeners();
    }
};

/**
 * Returns the gap between subplots in pixels.
 *
 * @returns {number} The gap in pixels.
 */
jsfc.CombinedDomainXYPlot.prototype.getGap = function() {
    return this._gap;
};

/**
 * Sets the gap between subplots in pixels.
 *
 * @param {number} gap  the gap in pixels.
 * @param {boolean} [notify]  notify listeners? (default is true).
 * @returns {undefined}
 */
jsfc.CombinedDomainXYPlot.prototype.setGap = function(gap, notify) {
    this._gap = gap;
    if (notify !== false) {
        this.notifyListeners();
    }
};

/**
 * Adds a subplot with default weight of 1.
 *
 * @param {jsfc.XYPlot} subplot  the subplot (null not permitted).
 * @returns {undefined}
 */
jsfc.CombinedDomainXYPlot.prototype.add = function(subplot) {
    this.addWithWeight(subplot, 1);
};

/**
 * Adds a subplot with the specified weight. The weight determines how much
 * vertical space is allocated to the subplot relative to other subplots.
 *
 * @param {jsfc.XYPlot} subplot  the subplot (null not permitted).
 * @param {number} weight  the weight (must be >= 1).
 * @returns {undefined}
 */
jsfc.CombinedDomainXYPlot.prototype.addWithWeight = function(subplot, weight) {
    if (!subplot) {
        throw new Error("Null 'subplot' argument.");
    }
    if (weight < 1) {
        throw new Error("Weight must be >= 1.");
    }

    // Store weight on the subplot
    subplot._weight = weight;

    // Set up listener to propagate changes from subplot
    var subplotListener = function(parentPlot) {
        return function(subplot) {
            parentPlot.notifyListeners();
        };
    }(this);
    subplot._parentListener = subplotListener;
    subplot.addListener(subplotListener);

    // Apply the shared renderer to the new subplot (if one has been set)
    if (this._renderer) {
        subplot.setRenderer(this._renderer);
    }

    this._subplots.push(subplot);

    // Configure the shared axis
    this._xAxis.configureAsXAxis(this);

    this.notifyListeners();
};

/**
 * Removes a subplot from the combined plot.
 *
 * @param {jsfc.XYPlot} subplot  the subplot to remove.
 * @returns {undefined}
 */
jsfc.CombinedDomainXYPlot.prototype.remove = function(subplot) {
    if (!subplot) {
        throw new Error("Null 'subplot' argument.");
    }

    var index = this._subplots.indexOf(subplot);
    if (index !== -1) {
        this._subplots.splice(index, 1);
        if (subplot._parentListener) {
            subplot.removeListener(subplot._parentListener);
        }
        this._xAxis.configureAsXAxis(this);
        this.notifyListeners();
    }
};

/**
 * Returns the list of subplots.
 *
 * @returns {Array} An array of subplots (possibly empty, never null).
 */
jsfc.CombinedDomainXYPlot.prototype.getSubplots = function() {
    return this._subplots.slice(); // return a copy
};

/**
 * Returns the number of subplots.
 *
 * @returns {number} The subplot count.
 */
jsfc.CombinedDomainXYPlot.prototype.getSubplotCount = function() {
    return this._subplots.length;
};

/**
 * Returns the subplot at the specified index.
 *
 * @param {number} index  the subplot index.
 * @returns {jsfc.XYPlot} The subplot.
 */
jsfc.CombinedDomainXYPlot.prototype.getSubplot = function(index) {
    return this._subplots[index];
};

/**
 * Configures the domain axis based on the data from all subplots.
 * This is called internally by the axis when auto-range is enabled.
 *
 * @param {jsfc.ValueAxis} axis  the axis to configure.
 * @returns {undefined}
 */
jsfc.CombinedDomainXYPlot.prototype.configureRangeAxes = function(axis) {
    if (axis === this._xAxis) {
        // Find the combined range from all subplots
        var xmin = Number.POSITIVE_INFINITY;
        var xmax = Number.NEGATIVE_INFINITY;

        for (var i = 0; i < this._subplots.length; i++) {
            var subplot = this._subplots[i];
            var dataset = subplot.getDataset();
            if (dataset) {
                var bounds = jsfc.XYDatasetUtils.bounds(dataset);
                if (bounds) {
                    xmin = Math.min(xmin, bounds.xmin);
                    xmax = Math.max(xmax, bounds.xmax);
                }
            }
        }

        if (xmin < Number.POSITIVE_INFINITY && xmax > Number.NEGATIVE_INFINITY) {
            axis.setAutoRange(xmin, xmax);
        }
    }
};

/**
 * Returns the background painter for the plot.
 *
 * @returns {jsfc.RectanglePainter} The background painter (possibly undefined).
 */
jsfc.CombinedDomainXYPlot.prototype.getBackground = function() {
    return this._plotBackground;
};

/**
 * Sets the background painter for the plot.
 *
 * @param {jsfc.RectanglePainter} painter  the background painter.
 * @param {boolean} [notify]  notify listeners? (default is true).
 * @returns {undefined}
 */
jsfc.CombinedDomainXYPlot.prototype.setBackground = function(painter, notify) {
    this._plotBackground = painter;
    if (notify !== false) {
        this.notifyListeners();
    }
};

/**
 * Draws the combined plot with all subplots.
 *
 * @param {jsfc.Context2D} ctx  the graphics context.
 * @param {jsfc.Rectangle} bounds  the overall bounds.
 * @param {jsfc.Rectangle} plotArea  the plot area.
 * @returns {undefined}
 */
jsfc.CombinedDomainXYPlot.prototype.draw = function(ctx, bounds, plotArea) {

    console.log("=== CombinedDomainXYPlot.draw() START ===");
    console.log("plotArea: x=" + plotArea.x() + ", y=" + plotArea.y() +
                ", w=" + plotArea.width() + ", h=" + plotArea.height());
    console.log("Number of subplots:", this._subplots.length);

    // Fill plot background if defined
    if (this._plotBackground) {
        this._plotBackground.paint(ctx, plotArea);
    }

    if (this._subplots.length === 0) {
        return; // nothing to draw
    }

    // Calculate space needed for the shared x-axis
    var space = new jsfc.AxisSpace(0, 0, 0, 0);
    var edge = jsfc.RectangleEdge.BOTTOM; // shared axis at bottom
    var xspace = this._xAxis.reserveSpace(ctx, this, bounds, plotArea, edge);
    console.log("X-axis reserved space:", xspace);
    space.extend(xspace, edge);
    console.log("After X-axis, space:", "top=" + space.top() + ", left=" + space.left() +
                ", bottom=" + space.bottom() + ", right=" + space.right());

    // Calculate the area available after accounting for x-axis
    var adjustedArea = space.innerRect(plotArea);
    console.log("adjustedArea after X-axis: x=" + adjustedArea.x() + ", y=" + adjustedArea.y() +
                ", w=" + adjustedArea.width() + ", h=" + adjustedArea.height());

    // Calculate space needed for y-axes of all subplots
    var maxLeftSpace = 0;
    var maxRightSpace = 0;
    var maxTopSpace = 0;
    var maxBottomSpace = 0;

    var n = this._subplots.length;
    var totalWeight = 0;
    for (var i = 0; i < n; i++) {
        totalWeight += this._subplots[i]._weight || 1;
    }

    // Calculate subplot areas
    this._subplotAreas = [];
    var usableHeight = adjustedArea.height() - this._gap * (n - 1);
    var y = adjustedArea.y();

    // First pass: configure y-axes, calculate each subplot's area and collect y-axis space requirements
    console.log("\n--- PASS 1: Measuring Y-axis space for each subplot ---");
    for (var i = 0; i < n; i++) {
        var subplot = this._subplots[i];
        var weight = subplot._weight || 1;
        var h = usableHeight * weight / totalWeight;

        var subplotArea = new jsfc.Rectangle(adjustedArea.x(), y,
                adjustedArea.width(), h);
        this._subplotAreas.push(subplotArea);
        console.log("Subplot " + i + " preliminary area: x=" + subplotArea.x() + ", y=" + subplotArea.y() +
                    ", w=" + subplotArea.width() + ", h=" + subplotArea.height());

        // Configure and get space needed for this subplot's y-axis
        var yAxis = subplot.getYAxis();
        if (yAxis) {
            console.log("  Y-axis label:", yAxis.getLabel());
            // Configure the y-axis for auto-ranging
            yAxis.configureAsYAxis(subplot);

            var yEdge = subplot.axisPosition(yAxis);
            console.log("  Y-axis edge:", yEdge);
            var yspace = yAxis.reserveSpace(ctx, subplot, bounds, subplotArea, yEdge);
            console.log("  Y-axis reserved space:", yspace);

            // yspace is a number, not an object - use it directly based on edge
            if (yEdge === jsfc.RectangleEdge.LEFT) {
                maxLeftSpace = Math.max(maxLeftSpace, yspace);
                console.log("  Updated maxLeftSpace:", maxLeftSpace);
            } else if (yEdge === jsfc.RectangleEdge.RIGHT) {
                maxRightSpace = Math.max(maxRightSpace, yspace);
                console.log("  Updated maxRightSpace:", maxRightSpace);
            } else if (yEdge === jsfc.RectangleEdge.TOP) {
                maxTopSpace = Math.max(maxTopSpace, yspace);
                console.log("  Updated maxTopSpace:", maxTopSpace);
            } else if (yEdge === jsfc.RectangleEdge.BOTTOM) {
                maxBottomSpace = Math.max(maxBottomSpace, yspace);
                console.log("  Updated maxBottomSpace:", maxBottomSpace);
            }
        } else {
            console.log("  No Y-axis found!");
        }

        y += h + this._gap;
    }

    // Add the maximum y-axis space to our total space
    console.log("\n--- Applying maximum Y-axis space ---");
    console.log("maxLeftSpace:", maxLeftSpace);
    console.log("maxRightSpace:", maxRightSpace);
    console.log("maxTopSpace:", maxTopSpace);
    console.log("maxBottomSpace:", maxBottomSpace);

    // Use private properties since AxisSpace doesn't have setters
    space._left = Math.max(space.left(), maxLeftSpace);
    space._right = Math.max(space.right(), maxRightSpace);
    space._top = Math.max(space.top(), maxTopSpace);
    space._bottom = Math.max(space.bottom(), maxBottomSpace);

    console.log("Final space:", "top=" + space.top() + ", left=" + space.left() +
                ", bottom=" + space.bottom() + ", right=" + space.right());

    // Calculate the final data area (after accounting for Y-axis space)
    var dataArea = space.innerRect(plotArea);
    console.log("Final dataArea: x=" + dataArea.x() + ", y=" + dataArea.y() +
                ", w=" + dataArea.width() + ", h=" + dataArea.height());

    // Recalculate subplot areas with proper positioning based on final dataArea
    // Now that Y-axis space has been accounted for, recalculate usableHeight
    console.log("\n--- PASS 2: Recalculating subplot positions with alignment ---");
    usableHeight = dataArea.height() - this._gap * (n - 1);
    y = dataArea.y();
    for (var i = 0; i < n; i++) {
        var subplot = this._subplots[i];
        var weight = subplot._weight || 1;
        var h = usableHeight * weight / totalWeight;

        this._subplotAreas[i] = new jsfc.Rectangle(dataArea.x(), y,
                dataArea.width(), h);
        var area = this._subplotAreas[i];
        console.log("Subplot " + i + " final area: x=" + area.x() + ", y=" + area.y() +
                    ", w=" + area.width() + ", h=" + area.height());

        y += h + this._gap;
    }

    // Draw the shared x-axis
    console.log("\n--- Drawing shared X-axis ---");
    var xOffset = this._axisOffsets.value(this._xAxisPosition);
    console.log("X-axis offset:", xOffset);
    this._xAxis.draw(ctx, this, bounds, dataArea, xOffset);

    // Draw each subplot (backgrounds, y-axes, and data)
    console.log("\n--- Drawing subplots ---");
    var globalSeriesIndex = 0;  // Track global series index across all subplots
    for (var i = 0; i < n; i++) {
        var subplot = this._subplots[i];
        var subplotArea = this._subplotAreas[i];
        console.log("Drawing subplot " + i + " in area: x=" + subplotArea.x() + ", y=" + subplotArea.y() +
                    ", w=" + subplotArea.width() + ", h=" + subplotArea.height());

        // Fill subplot background if defined
        if (subplot._dataBackground) {
            subplot._dataBackground.paint(ctx, subplotArea);
        }

        // Draw the subplot's y-axis
        var yAxis = subplot.getYAxis();
        if (yAxis) {
            var yOffset = subplot._axisOffsets.value(subplot.axisPosition(yAxis));
            console.log("  Drawing Y-axis for subplot " + i + ", label:", yAxis.getLabel());
            console.log("  Y-axis offset:", yOffset);
            console.log("  Y-axis drawing area: x=" + subplotArea.x() + ", y=" + subplotArea.y() +
                        ", w=" + subplotArea.width() + ", h=" + subplotArea.height());
            yAxis.draw(ctx, subplot, bounds, subplotArea, yOffset);
        } else {
            console.log("  No Y-axis for subplot " + i);
        }

        // Draw the subplot's data with global series offset for shared renderer
        var seriesCountThisSubplot = this._drawSubplotData(ctx, subplot, subplotArea, globalSeriesIndex);
        globalSeriesIndex += seriesCountThisSubplot;
    }

    // Draw vertical grid lines across all subplots AFTER everything else, so they're on top
    console.log("\n--- Drawing X-axis grid lines across all subplots (on top) ---");
    this._drawXAxisGridLines(ctx, dataArea);
    console.log("=== CombinedDomainXYPlot.draw() END ===\n");
};

/**
 * Draws vertical grid lines from the X-axis across all subplots.
 * This provides visual alignment aids similar to a regular XYPlot.
 *
 * @param {jsfc.Context2D} ctx  the graphics context.
 * @param {jsfc.Rectangle} dataArea  the combined data area for all subplots.
 * @returns {undefined}
 */
jsfc.CombinedDomainXYPlot.prototype._drawXAxisGridLines = function(ctx, dataArea) {
    // Only draw if the X-axis has grid lines enabled
    console.log("_drawXAxisGridLines called");
    console.log("X-axis grid lines visible:", this._xAxis._gridLinesVisible);

    if (!this._xAxis._gridLinesVisible) {
        console.log("Grid lines not visible, returning");
        return;
    }

    // Get the X-axis tick values
    var xAxis = this._xAxis;
    console.log("X-axis:", xAxis);
    console.log("dataArea:", dataArea);

    var tickSize = xAxis._calcTickSize(ctx, dataArea, jsfc.RectangleEdge.BOTTOM);
    console.log("tickSize:", tickSize);

    var ticks = xAxis.ticks(tickSize, ctx, dataArea, jsfc.RectangleEdge.BOTTOM);
    console.log("Number of ticks:", ticks.length);
    console.log("Ticks:", ticks);

    // Calculate the Y coordinates for the grid lines
    // Grid lines should span from top of first subplot to bottom of last subplot
    var topY = this._subplotAreas[0].y();
    var bottomY = this._subplotAreas[this._subplotAreas.length - 1].y() +
                  this._subplotAreas[this._subplotAreas.length - 1].height();

    console.log("Grid line Y range: topY=" + topY + ", bottomY=" + bottomY);
    console.log("Number of subplot areas:", this._subplotAreas.length);

    // Draw vertical grid lines at each tick
    ctx.setLineStroke(xAxis._gridLineStroke);
    console.log("Grid line stroke set:", xAxis._gridLineStroke);

    ctx.setLineColor(xAxis._gridLineColor);
    console.log("Grid line color set:", xAxis._gridLineColor);

    for (var i = 0; i < ticks.length; i++) {
        var tick = ticks[i];
        var xx = xAxis.valueToCoordinate(tick.value, dataArea.x(), dataArea.x() + dataArea.width());
        console.log("Drawing grid line " + i + " at x=" + Math.round(xx) + ", tick value=" + tick.value);
        ctx.drawLine(Math.round(xx), topY, Math.round(xx), bottomY);
    }
    console.log("Grid lines drawing complete");
};

/**
 * Draws the data for a single subplot using proper state management.
 *
 * @param {jsfc.Context2D} ctx  the graphics context.
 * @param {jsfc.XYPlot} subplot  the subplot.
 * @param {jsfc.Rectangle} dataArea  the data area for the subplot.
 * @param {number} [globalSeriesIndex]  the global series index offset for shared renderers.
 * @returns {number} the number of series in this subplot's dataset.
 */
jsfc.CombinedDomainXYPlot.prototype._drawSubplotData = function(ctx, subplot, dataArea, globalSeriesIndex) {
    var dataset = subplot.getDataset();
    if (!dataset) {
        return 0;
    }

    var renderer = subplot.getRenderer();
    if (!renderer) {
        return 0;
    }

    // Use global series index if provided (for shared renderers with global color palette)
    globalSeriesIndex = globalSeriesIndex || 0;

    // Set clipping to the data area
    ctx.setHint("clip", dataArea);
    ctx.setHint("glass", dataArea);
    ctx.beginGroup("subplot-" + this._subplots.indexOf(subplot));
    ctx.save();
    ctx.setClip(dataArea);

    // Temporarily set the subplot's data area (needed for rendering)
    var originalDataArea = subplot._dataArea;
    subplot._dataArea = dataArea;

    // Also temporarily set the subplot's x-axis to use the shared axis
    var originalXAxis = subplot._xAxis;
    subplot._xAxis = this._xAxis;

    // Create a state object for this subplot's rendering session
    // This maintains context across the rendering sequence
    var state = renderer.createState(null);

    // Render all data items with proper state management
    var passCount = renderer.passCount();
    for (var pass = 0; pass < passCount; pass++) {
        for (var s = 0; s < dataset.seriesCount(); s++) {
            // Use global series index if renderer is shared across subplots
            var effectiveSeriesIndex = (this._renderer === renderer) ? globalSeriesIndex + s : s;

            // Store the local series index in state for dataset access
            state.localSeriesIndex = s;

            // Notify renderer of series pass start
            var firstItem = 0;
            var lastItem = dataset.itemCount(s) - 1;
            state.startSeriesPass(dataset, effectiveSeriesIndex, firstItem, lastItem, pass, passCount);

            // Render each item in this series
            for (var i = firstItem; i <= lastItem; i++) {
                renderer.drawItem(ctx, state, dataArea, subplot, dataset,
                    effectiveSeriesIndex, i, pass);
            }

            // Notify renderer of series pass end
            state.endSeriesPass(dataset, effectiveSeriesIndex, firstItem, lastItem, pass, passCount);
        }
    }

    // Restore original values
    subplot._dataArea = originalDataArea;
    subplot._xAxis = originalXAxis;

    ctx.restore();
    ctx.endGroup();

    // Return the number of series in this subplot for global index tracking
    return dataset.seriesCount();
};

/**
 * Returns the edge location of the x-axis.
 *
 * @param {jsfc.ValueAxis} axis  the axis.
 * @returns {string} The axis position (refer to jsfc.RectangleEdge).
 */
jsfc.CombinedDomainXYPlot.prototype.axisPosition = function(axis) {
    if (axis === this._xAxis) {
        return this._xAxisPosition;
    }
    throw new Error("The axis does not belong to this plot.");
};

/**
 * Returns legend items for all subplots.
 *
 * @returns {Array} Array of legend item info objects.
 */
jsfc.CombinedDomainXYPlot.prototype.legendInfo = function() {
    var info = [];

    // If using a shared renderer, use global series indices for consistent colors
    if (this._renderer) {
        var globalSeriesIndex = 0;
        for (var s = 0; s < this._subplots.length; s++) {
            var subplot = this._subplots[s];
            var dataset = subplot.getDataset();
            if (dataset) {
                for (var i = 0; i < dataset.seriesCount(); i++) {
                    var seriesKey = dataset.seriesKey(i);
                    // Use global index with shared renderer to get correct color
                    var color = this._renderer._lineColorSource.getColor(globalSeriesIndex, 0);
                    var item = new jsfc.LegendItemInfo(seriesKey, color);
                    item.label = seriesKey;
                    info.push(item);
                    globalSeriesIndex++;
                }
            }
        }
    } else {
        // Fall back to original behavior if no shared renderer
        for (var i = 0; i < this._subplots.length; i++) {
            var subplotInfo = this._subplots[i].legendInfo();
            info = info.concat(subplotInfo);
        }
    }
    return info;
};

/**
 * Registers a listener to receive notification of changes to the plot.
 *
 * @param {Function} listener  the listener function.
 * @returns {undefined}
 */
jsfc.CombinedDomainXYPlot.prototype.addListener = function(listener) {
    this._listeners.push(listener);
};

/**
 * Removes a listener so that it no longer receives notification of changes
 * to the plot.
 *
 * @param {Function} listener  the listener function.
 * @returns {undefined}
 */
jsfc.CombinedDomainXYPlot.prototype.removeListener = function(listener) {
    var i = this._listeners.indexOf(listener);
    if (i >= 0) {
        this._listeners.splice(i, 1);
    }
};

/**
 * Notifies all registered listeners that the plot has changed.
 *
 * @returns {undefined}
 */
jsfc.CombinedDomainXYPlot.prototype.notifyListeners = function() {
    if (!this._notify) {
        return;
    }
    for (var i = 0; i < this._listeners.length; i++) {
        this._listeners[i](this);
    }
};

/**
 * Returns a composite dataset view that aggregates data from all subplots.
 * This is required for axis configuration compatibility.
 *
 * @returns {Object} A composite dataset object with xbounds() and getProperty() methods.
 */
jsfc.CombinedDomainXYPlot.prototype.getDataset = function() {
    var plot = this;

    return {
        /**
         * Returns the x-axis bounds across all subplot datasets.
         * @returns {Array} Array with [xmin, xmax].
         */
        xbounds: function() {
            var xmin = Number.POSITIVE_INFINITY;
            var xmax = Number.NEGATIVE_INFINITY;

            for (var i = 0; i < plot._subplots.length; i++) {
                var subplot = plot._subplots[i];
                var dataset = subplot.getDataset();
                if (dataset && dataset.xbounds) {
                    var bounds = dataset.xbounds();
                    if (bounds && bounds.length === 2) {
                        xmin = Math.min(xmin, bounds[0]);
                        xmax = Math.max(xmax, bounds[1]);
                    }
                }
            }

            if (xmin === Number.POSITIVE_INFINITY || xmax === Number.NEGATIVE_INFINITY) {
                return [0, 1]; // default range if no data
            }
            return [xmin, xmax];
        },

        /**
         * Returns a property value from the first subplot's dataset that has it.
         * @param {string} key The property key.
         * @returns {*} The property value or undefined.
         */
        getProperty: function(key) {
            for (var i = 0; i < plot._subplots.length; i++) {
                var subplot = plot._subplots[i];
                var dataset = subplot.getDataset();
                if (dataset && dataset.getProperty) {
                    var value = dataset.getProperty(key);
                    if (value !== undefined) {
                        return value;
                    }
                }
            }
            return undefined;
        }
    };
};

/**
 * The configureAsXAxis function for compatibility with axis configuration.
 * This gathers data range from all subplots.
 *
 * @returns {Object} An object with xmin, xmax, ymin, ymax properties.
 */
jsfc.CombinedDomainXYPlot.prototype.getDataBounds = function() {
    var xmin = Number.POSITIVE_INFINITY;
    var xmax = Number.NEGATIVE_INFINITY;
    var ymin = Number.POSITIVE_INFINITY;
    var ymax = Number.NEGATIVE_INFINITY;

    for (var i = 0; i < this._subplots.length; i++) {
        var subplot = this._subplots[i];
        var dataset = subplot.getDataset();
        if (dataset) {
            var bounds = jsfc.XYDatasetUtils.bounds(dataset);
            if (bounds) {
                xmin = Math.min(xmin, bounds.xmin);
                xmax = Math.max(xmax, bounds.xmax);
                ymin = Math.min(ymin, bounds.ymin);
                ymax = Math.max(ymax, bounds.ymax);
            }
        }
    }

    return { xmin: xmin, xmax: xmax, ymin: ymin, ymax: ymax };
};
