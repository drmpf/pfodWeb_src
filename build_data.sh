#!/bin/bash
# build_data.sh - Create gzipped data files for ESP32 deployment.
#
# Splits all JavaScript source into 5 gzipped bundles of roughly equal size
# (~50 KB each compressed), while preserving the dependency order from
# build-bundle.js.  All 5 bundles are loaded by pfodWeb.js's startBootstrap()
# AFTER the DrawingViewer class has been declared, so bundle 5 can extend
# DrawingViewer.prototype safely.
#
# HTML template pfodWeb.html is first inlined with pfodCommon.css and
# pfodCommon.html (via build_data_inline_html.js) so the gzipped page is
# self-contained.  Debug logging is toggled at runtime via the connection
# prompt's checkbox / ?debug URL parameter, so there is no longer a
# separate pfodWebDebug.html template.
#
# (c)2025 Forward Computing and Control Pty. Ltd.

# This script lives at the project root, but all the source JS/HTML it
# reads live in pfodWeb_src/, so cd there first -- same relative file lists
# and "../data"/"../extraFonts" paths as when this script used to live
# inside pfodWeb_src/ itself.
cd "$(dirname "$0")/pfodWeb_src" || exit 1
DATA_DIR="../data"

echo "=========================================="
echo "  Creating Gzipped Data Files"
echo "=========================================="
echo ""

# Create data directory if it doesn't exist
if [ ! -d "$DATA_DIR" ]; then
    mkdir -p "$DATA_DIR"
fi

# Check required tools
if ! command -v gzip >/dev/null 2>&1; then
    echo "Error: gzip command not found!"
    exit 1
fi
if ! command -v node >/dev/null 2>&1; then
    echo "Error: node command not found! (used to inline pfodCommon.css/html)"
    exit 1
fi

echo "Bundling and gzipping JavaScript files..."
echo ""

# Concatenate the listed files and produce <bundle_name>.js.gz in $DATA_DIR.
bundle_and_gzip() {
    local bundle_name=$1
    shift
    local files=("$@")

    # Concatenate into a temp DIRECTORY, under the bundle's own name, so gzip
    # records "<bundle_name>" as the archive's stored filename.  A bare
    # mktemp file would make that a random "tmp.XXXXXXXX", which is opaque in
    # `gzip -l`/`7z l` output and also used to break build_data.bat: a gzip
    # holds exactly one file and 7z's `a` UPDATES rather than replaces, so
    # adding "<bundle_name>" to an archive storing a random name failed and
    # (with 7z's output suppressed) silently left the stale bundle in place.
    local temp_dir
    temp_dir=$(mktemp -d)
    local temp_file="$temp_dir/$bundle_name"
    : > "$temp_file"   # create it, so an all-missing file list still gzips

    for file in "${files[@]}"; do
        if [ -f "$file" ]; then
            cat "$file" >> "$temp_file"
        else
            echo "  WARNING: ${file} missing — skipping"
        fi
    done

    # Embed sound.mp3 into pfodButtonRenderer.js's placeholder BEFORE gzipping,
    # so the device build ships the real click sound instead of falling back to
    # the generated tone.  The standalone build does the equivalent inline in
    # build-bundle.js.  Named for the 004 bundle because that is the one
    # holding pfodButtonRenderer.js -- if that file moves, move this test with
    # it (the script prints a loud ERROR if the placeholder is not in the file
    # it is given).  MUST stay in step with the matching call in build_data.bat.
    if [ "$bundle_name" = "pfodweb-004-menu" ]; then
        node build_data_embed_sound.js "$temp_file"
    fi

    gzip -9 "$temp_file"
    mv -f "${temp_file}.gz" "$DATA_DIR/${bundle_name}.js.gz"
    rm -rf "$temp_dir"
    echo "  OK ${bundle_name}.js.gz created"
}

bundle_count=0

# ---------------------------------------------------------------------------
# 5 consolidated bundles, ~50 KB each gzipped, in dependency order.
# All loaded by pfodWeb.js's startBootstrap() after DrawingViewer is declared.
# ---------------------------------------------------------------------------

# Bundle 001-base — core + jsfreechart base/graphics/data (~44 KB gz)
# Note: version.js is NOT in this bundle — it's served as a separate
# uncompressed file (copied below) and loaded by a <script src> tag in
# pfodWeb.html BEFORE pfodWeb.js, so JS_VERSION is defined before the
# DOMContentLoaded handler runs.
bundle_and_gzip "pfodweb-001-base" \
    "connectionManager.js" "csvCollector.js" "rawDataCollector.js" \
    "jsfreechart/src/JSFreeChart.js" "jsfreechart/src/Module.js" \
    "jsfreechart/src/Args.js"        "jsfreechart/src/Utils.js" \
    "jsfreechart/src/graphics/Color.js" "jsfreechart/src/Colors.js" \
    "jsfreechart/src/graphics/Point2D.js"      "jsfreechart/src/graphics/Rectangle.js" \
    "jsfreechart/src/graphics/Dimension.js"    "jsfreechart/src/graphics/HAlign.js" \
    "jsfreechart/src/graphics/RectangleEdge.js" "jsfreechart/src/graphics/Insets.js" \
    "jsfreechart/src/graphics/Offset2D.js"     "jsfreechart/src/graphics/Scale2D.js" \
    "jsfreechart/src/graphics/Fit2D.js"        "jsfreechart/src/graphics/Stroke.js" \
    "jsfreechart/src/graphics/TextAnchor.js"   "jsfreechart/src/graphics/Font.js" \
    "jsfreechart/src/graphics/LineCap.js"      "jsfreechart/src/graphics/LineJoin.js" \
    "jsfreechart/src/graphics/RefPt2D.js"      "jsfreechart/src/graphics/Anchor2D.js" \
    "jsfreechart/src/graphics/BaseContext2D.js" "jsfreechart/src/graphics/CanvasContext2D.js" \
    "jsfreechart/src/data/Map.js"              "jsfreechart/src/data/Range.js" \
    "jsfreechart/src/data/StandardXYDataset.js" "jsfreechart/src/data/XYDatasetUtils.js" \
    "jsfreechart/src/data/KeyedValues2DDataset.js" \
    && ((bundle_count++))

# Bundle 002-charts — jsfreechart table/renderer/util/axis/labels/legend + plot/chart + chartDisplay (~55 KB gz)
bundle_and_gzip "pfodweb-002-charts" \
    "jsfreechart/src/table/BaseElement.js"    "jsfreechart/src/table/TableElement.js" \
    "jsfreechart/src/table/TextElement.js"    "jsfreechart/src/table/StandardRectanglePainter.js" \
    "jsfreechart/src/table/FlowElement.js"    "jsfreechart/src/table/RectangleElement.js" \
    "jsfreechart/src/table/GridElement.js" \
    "jsfreechart/src/renderer/ColorSource.js" "jsfreechart/src/renderer/StrokeSource.js" \
    "jsfreechart/src/renderer/XYItemRendererState.js" "jsfreechart/src/renderer/BaseXYRenderer.js" \
    "jsfreechart/src/renderer/ScatterRenderer.js"     "jsfreechart/src/renderer/XYLineRenderer.js" \
    "jsfreechart/src/renderer/CombinedDomainXYItemRenderer.js" \
    "jsfreechart/src/util/Format.js"          "jsfreechart/src/util/NumberFormat.js" \
    "jsfreechart/src/axis/AxisSpace.js"       "jsfreechart/src/axis/LabelOrientation.js" \
    "jsfreechart/src/axis/TickMark.js"        "jsfreechart/src/axis/NumberTickSelector.js" \
    "jsfreechart/src/axis/ValueAxis.js"       "jsfreechart/src/axis/BaseValueAxis.js" \
    "jsfreechart/src/axis/LinearAxis.js" \
    "jsfreechart/src/labels/StandardXYLabelGenerator.js" \
    "jsfreechart/src/legend/LegendBuilder.js" \
    "jsfreechart/src/legend/LegendItemInfo.js" \
    "jsfreechart/src/legend/StandardLegendBuilder.js" \
    "jsfreechart/src/plot/XYPlot.js"          "jsfreechart/src/plot/CombinedDomainXYPlot.js" \
    "jsfreechart/src/Chart.js"                "jsfreechart/src/Charts.js" \
    "chartDisplay.js" \
    && ((bundle_count++))

# Bundle 003-render — app messaging + drawing managers + render engine + merger + menu cache (~51 KB gz)
bundle_and_gzip "pfodweb-003-render" \
    "caching.js" "messageViewer.js" "DrawingManager.js" "displayTextUtils.js" \
    "redraw.js" "drawingMerger.js" "pfodMenuCache.js" \
    && ((bundle_count++))

# Bundle 004-menu — web translator + drawing data processor + mouse + menu/button renderers + input displays (~58 KB gz)
bundle_and_gzip "pfodweb-004-menu" \
    "webTranslator.js" "drawingDataProcessor.js" \
    "pfodWebMouse.js" \
    "pfodMenuParser.js" "pfodButtonRenderer.js" "pfodMenuDisplay.js" \
    "pfodInputDisplay.js" "pfodNumericInputDisplay.js" "pfodSelectionDisplay.js" \
    && ((bundle_count++))

# Bundle 005-proto — all DrawingViewer.prototype extensions (~60 KB gz)
# These files do Object.assign(DrawingViewer.prototype, …); the prototype
# target exists because pfodWeb.js declares the class before bootstrap.
bundle_and_gzip "pfodweb-005-proto" \
    "resizeAndDimensions.js" "toolbarAndMenu.js" "navigationAndQueue.js" \
    "chartAndRawData.js" "drawingProcessing.js" "keepAliveAndHttp.js" \
    "responseHandlers.js" "keepAlive.js" \
    "requestQueue.js" "connectionSetup.js" \
    && ((bundle_count++))

# NOTE: pfodWeb.js is NOT in any of the 5 bundles — it is served directly
# via <script src="pfodWeb.js">.  It declares the DrawingViewer class and
# kicks off the bundle bootstrap that loads 001-005 sequentially.

echo ""
echo "Inlining pfodCommon.css and pfodCommon.html into HTML templates..."
echo ""

node build_data_inline_html.js
if [ $? -ne 0 ]; then
    echo "  ERROR: build_data_inline_html.js failed"
    exit 1
fi

echo ""
echo "Gzipping HTML template files..."
echo ""

html_count=0
for file in pfodWeb.html; do
    if [ -f "$DATA_DIR/$file" ]; then
        echo "  Compressing $file..."
        gzip -9 -f "$DATA_DIR/$file"
        ((html_count++))
        echo "  OK $file.gz created"
    else
        echo "  WARNING: $DATA_DIR/$file not found"
    fi
done

echo ""
echo "Gzipping pfodWeb.js..."
echo ""

# Gzip pfodWeb.js for data directory
if [ -f "pfodWeb.js" ]; then
    echo "  Compressing pfodWeb.js..."
    cp "pfodWeb.js" "$DATA_DIR/pfodWeb.js"
    gzip -9 -f "$DATA_DIR/pfodWeb.js"
    echo "  OK pfodWeb.js.gz created"
fi

echo ""
echo "Cleaning up non-compressed files in $DATA_DIR..."

# Remove anything left in data/ that isn't .gz or favicon.ico
cleanup_count=0
for f in "$DATA_DIR"/*; do
    [ -f "$f" ] || continue
    name=$(basename "$f")
    case "$name" in
        *.gz|favicon.ico) ;;
        *)
            echo "  Removing $name"
            rm -f "$f"
            ((cleanup_count++))
            ;;
    esac
done

echo "Removed $cleanup_count non-compressed files"

echo ""
echo "Copying favicon.ico to data directory..."
if [ -f "favicon.ico" ]; then
    cp "favicon.ico" "$DATA_DIR/favicon.ico"
    echo "  OK favicon.ico copied"
fi

echo ""
echo "Copying version.js to data directory..."
if [ -f "version.js" ]; then
    cp "version.js" "$DATA_DIR/version.js"
    echo "  OK version.js copied"
fi

echo ""
echo "Copying extraFonts to data directory..."
# Copy extraFonts/ (optional extra Roboto subsets + their CSS) to data
# directory, uncompressed (woff2 is already compressed; placed after the
# cleanup pass above so it isn't immediately deleted, same as favicon.ico
# and version.js). Source of truth is ../extraFonts (next to pfodWeb.html)
# -- not a local pfodWeb_src copy.
if [ -d "../extraFonts" ]; then
    # Clear the destination first so fonts removed from the source don't
    # linger forever (cp only adds/overwrites, never deletes).
    rm -rf "$DATA_DIR/extraFonts"
    mkdir -p "$DATA_DIR/extraFonts"
    cp -f ../extraFonts/* "$DATA_DIR/extraFonts/"
    echo "  OK extraFonts copied"
else
    echo "  WARNING: extraFonts not found - skipping (optional)"
fi

echo ""
echo "=========================================="
echo "  Gzip Complete!"
echo "=========================================="
echo ""
echo "Summary:"
echo "  - $bundle_count JavaScript bundles created (5 expected)"
echo "  - $html_count HTML template files gzipped (with pfodCommon.css/html inlined)"
echo "  - pfodWeb.js.gz created in data directory"
echo "  - version.js and favicon.ico copied to data directory (uncompressed)"
echo ""
read -n 1 -s -r -p "Press any key to continue..."
echo ""
