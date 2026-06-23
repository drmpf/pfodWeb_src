@echo off
REM build_data.bat - Create gzipped data files for ESP32 deployment.
REM
REM Splits all JavaScript source into 5 gzipped bundles of roughly equal
REM size (~50 KB each compressed), while preserving the dependency order
REM from build-bundle.js.  All 5 bundles are loaded by pfodWeb.js's
REM startBootstrap() AFTER the DrawingViewer class has been declared, so
REM bundle 5 can extend DrawingViewer.prototype safely.
REM
REM HTML template pfodWeb.html is first inlined with pfodCommon.css and
REM pfodCommon.html (via build_data_inline_html.js) so the gzipped page is
REM self-contained.  Debug logging is toggled at runtime via the connection
REM prompt's checkbox / ?debug URL parameter, so there is no longer a
REM separate pfodWebDebug.html template.
REM
REM (c)2025 Forward Computing and Control Pty. Ltd.

setlocal enabledelayedexpansion
REM This script lives at the project root, but all the source JS/HTML it
REM reads live in pfodWeb_src\, so cd there first -- same relative `type
REM x.js` and `..\data`/`..\extraFonts` paths as when this script used to
REM live inside pfodWeb_src\ itself.
cd /d "%~dp0pfodWeb_src"
set "DATA_DIR=..\data"

echo ==========================================
echo   Creating Gzipped Data Files
echo ==========================================
echo.

REM Create data directory if it doesn't exist
if not exist "!DATA_DIR!" (
    mkdir "!DATA_DIR!"
)

REM Check if 7z.exe is available
where 7z.exe >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: 7z.exe not found in PATH
    echo Please install 7-Zip and ensure it's in your system PATH
    echo.
    pause
    exit /b 1
)

REM Check if node is available (used to inline pfodCommon.css/html)
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: node not found in PATH
    echo Please install Node.js and ensure it's in your system PATH
    echo.
    pause
    exit /b 1
)

echo Bundling and gzipping JavaScript files...
echo.

set /a bundle_count=0

REM ----------------------------------------------------------------------
REM 5 consolidated bundles, ~50 KB each gzipped, in dependency order.
REM Names reflect content groupings; numeric prefix preserves load order.
REM ----------------------------------------------------------------------

REM Bundle 001-base — core + jsfreechart base/graphics/data (~44 KB gz)
REM Note: version.js is NOT in this bundle — it's served as a separate
REM uncompressed file (copied below) and loaded by a <script src> tag in
REM pfodWeb.html BEFORE pfodWeb.js, so JS_VERSION is defined before the
REM DOMContentLoaded handler runs.
(
    type connectionManager.js
    type csvCollector.js
    type rawDataCollector.js
    type jsfreechart\src\JSFreeChart.js
    type jsfreechart\src\Module.js
    type jsfreechart\src\Args.js
    type jsfreechart\src\Utils.js
    type jsfreechart\src\graphics\Color.js
    type jsfreechart\src\Colors.js
    type jsfreechart\src\graphics\Point2D.js
    type jsfreechart\src\graphics\Rectangle.js
    type jsfreechart\src\graphics\Dimension.js
    type jsfreechart\src\graphics\HAlign.js
    type jsfreechart\src\graphics\RectangleEdge.js
    type jsfreechart\src\graphics\Insets.js
    type jsfreechart\src\graphics\Offset2D.js
    type jsfreechart\src\graphics\Scale2D.js
    type jsfreechart\src\graphics\Fit2D.js
    type jsfreechart\src\graphics\Stroke.js
    type jsfreechart\src\graphics\TextAnchor.js
    type jsfreechart\src\graphics\Font.js
    type jsfreechart\src\graphics\LineCap.js
    type jsfreechart\src\graphics\LineJoin.js
    type jsfreechart\src\graphics\RefPt2D.js
    type jsfreechart\src\graphics\Anchor2D.js
    type jsfreechart\src\graphics\BaseContext2D.js
    type jsfreechart\src\graphics\CanvasContext2D.js
    type jsfreechart\src\data\Map.js
    type jsfreechart\src\data\Range.js
    type jsfreechart\src\data\StandardXYDataset.js
    type jsfreechart\src\data\XYDatasetUtils.js
    type jsfreechart\src\data\KeyedValues2DDataset.js
) > "%TEMP%\pfodweb-001-base"
7z.exe a -tgzip -mx9 "!DATA_DIR!\pfodweb-001-base.js.gz" "%TEMP%\pfodweb-001-base" >nul 2>&1
if %errorlevel% equ 0 (del "%TEMP%\pfodweb-001-base" & echo   OK pfodweb-001-base.js.gz created & set /a bundle_count+=1)

REM Bundle 002-charts — jsfreechart table/renderer/util/axis/labels/legend + plot/chart + chartDisplay (~55 KB gz)
(
    type jsfreechart\src\table\BaseElement.js
    type jsfreechart\src\table\TableElement.js
    type jsfreechart\src\table\TextElement.js
    type jsfreechart\src\table\StandardRectanglePainter.js
    type jsfreechart\src\table\FlowElement.js
    type jsfreechart\src\table\RectangleElement.js
    type jsfreechart\src\table\GridElement.js
    type jsfreechart\src\renderer\ColorSource.js
    type jsfreechart\src\renderer\StrokeSource.js
    type jsfreechart\src\renderer\XYItemRendererState.js
    type jsfreechart\src\renderer\BaseXYRenderer.js
    type jsfreechart\src\renderer\ScatterRenderer.js
    type jsfreechart\src\renderer\XYLineRenderer.js
    type jsfreechart\src\renderer\CombinedDomainXYItemRenderer.js
    type jsfreechart\src\util\Format.js
    type jsfreechart\src\util\NumberFormat.js
    type jsfreechart\src\axis\AxisSpace.js
    type jsfreechart\src\axis\LabelOrientation.js
    type jsfreechart\src\axis\TickMark.js
    type jsfreechart\src\axis\NumberTickSelector.js
    type jsfreechart\src\axis\ValueAxis.js
    type jsfreechart\src\axis\BaseValueAxis.js
    type jsfreechart\src\axis\LinearAxis.js
    type jsfreechart\src\labels\StandardXYLabelGenerator.js
    type jsfreechart\src\legend\LegendBuilder.js
    type jsfreechart\src\legend\LegendItemInfo.js
    type jsfreechart\src\legend\StandardLegendBuilder.js
    type jsfreechart\src\plot\XYPlot.js
    type jsfreechart\src\plot\CombinedDomainXYPlot.js
    type jsfreechart\src\Chart.js
    type jsfreechart\src\Charts.js
    type chartDisplay.js
) > "%TEMP%\pfodweb-002-charts"
7z.exe a -tgzip -mx9 "!DATA_DIR!\pfodweb-002-charts.js.gz" "%TEMP%\pfodweb-002-charts" >nul 2>&1
if %errorlevel% equ 0 (del "%TEMP%\pfodweb-002-charts" & echo   OK pfodweb-002-charts.js.gz created & set /a bundle_count+=1)

REM Bundle 003-render — app messaging + drawing managers + render engine + merger + menu cache (~51 KB gz)
(
    type caching.js
    type messageViewer.js
    type DrawingManager.js
    type displayTextUtils.js
    type redraw.js
    type drawingMerger.js
    type pfodMenuCache.js
) > "%TEMP%\pfodweb-003-render"
7z.exe a -tgzip -mx9 "!DATA_DIR!\pfodweb-003-render.js.gz" "%TEMP%\pfodweb-003-render" >nul 2>&1
if %errorlevel% equ 0 (del "%TEMP%\pfodweb-003-render" & echo   OK pfodweb-003-render.js.gz created & set /a bundle_count+=1)

REM Bundle 004-menu — web translator + drawing data processor + mouse + menu/button renderers + input displays (~58 KB gz)
(
    type webTranslator.js
    type drawingDataProcessor.js
    type pfodWebMouse.js
    type pfodMenuParser.js
    type pfodButtonRenderer.js
    type pfodMenuDisplay.js
    type pfodInputDisplay.js
    type pfodNumericInputDisplay.js
    type pfodSelectionDisplay.js
) > "%TEMP%\pfodweb-004-menu"
7z.exe a -tgzip -mx9 "!DATA_DIR!\pfodweb-004-menu.js.gz" "%TEMP%\pfodweb-004-menu" >nul 2>&1
if %errorlevel% equ 0 (del "%TEMP%\pfodweb-004-menu" & echo   OK pfodweb-004-menu.js.gz created & set /a bundle_count+=1)

REM Bundle 005-proto — DrawingViewer.prototype extensions (~60 KB gz)
REM These files do Object.assign(DrawingViewer.prototype, …); the prototype
REM target exists by the time this bundle runs because pfodWeb.js's
REM startBootstrap() declares DrawingViewer before loading any bundle.
(
    type resizeAndDimensions.js
    type toolbarAndMenu.js
    type navigationAndQueue.js
    type chartAndRawData.js
    type drawingProcessing.js
    type keepAliveAndHttp.js
    type responseHandlers.js
    type keepAlive.js
    type requestQueue.js
    type connectionSetup.js
) > "%TEMP%\pfodweb-005-proto"
7z.exe a -tgzip -mx9 "!DATA_DIR!\pfodweb-005-proto.js.gz" "%TEMP%\pfodweb-005-proto" >nul 2>&1
if %errorlevel% equ 0 (del "%TEMP%\pfodweb-005-proto" & echo   OK pfodweb-005-proto.js.gz created & set /a bundle_count+=1)

REM NOTE: pfodWeb.js is NOT in any of the 5 bundles — it is served directly
REM via <script src="pfodWeb.js">.  It declares the DrawingViewer class and
REM kicks off the bundle bootstrap that loads 001-005 sequentially.

echo.
echo Inlining pfodCommon.css and pfodCommon.html into HTML templates...
echo.

node build_data_inline_html.js
if %errorlevel% neq 0 (
    echo   ERROR: build_data_inline_html.js failed
    exit /b 1
)

echo.
echo Gzipping HTML template files...
echo.

REM Gzip the inlined HTML that build_data_inline_html.js wrote into !DATA_DIR!.
set /a html_count=0

for %%f in (pfodWeb.html) do (
    if exist "!DATA_DIR!\%%f" (
        echo   Compressing %%f...
        7z.exe a -tgzip -mx9 "!DATA_DIR!\%%f.gz" "!DATA_DIR!\%%f" >nul 2>&1
        if !errorlevel! equ 0 (
            del "!DATA_DIR!\%%f" >nul 2>&1
            echo   OK %%f.gz created
            set /a html_count+=1
        ) else (
            echo   ERROR: Failed to compress %%f
        )
    ) else (
        echo   WARNING: !DATA_DIR!\%%f not found
    )
)

echo.
echo Gzipping pfodWeb.js...
echo.

REM Gzip pfodWeb.js for data directory
if exist "pfodWeb.js" (
    echo   Compressing pfodWeb.js...
    copy "pfodWeb.js" "!DATA_DIR!\pfodWeb.js" >nul 2>&1
    7z.exe a -tgzip -mx9 "!DATA_DIR!\pfodWeb.js.gz" "!DATA_DIR!\pfodWeb.js" >nul 2>&1
    if !errorlevel! equ 0 (
        del "!DATA_DIR!\pfodWeb.js" >nul 2>&1
        echo   OK pfodWeb.js.gz created
    ) else (
        echo   ERROR: 7z failed to compress pfodWeb.js
    )
) else (
    echo   WARNING: pfodWeb.js source file not found
)

echo.
echo Cleaning up non-compressed files in !DATA_DIR!...
set /a cleanup_count=0

REM Delete all non-.gz and non-favicon files from data directory
for /r "!DATA_DIR!" %%f in (*) do (
    if /i not "%%~xf"==".gz" (
        if /i not "%%~nxf"=="favicon.ico" (
            if not exist "%%f\" (
                echo   Removing %%~nxf
                del "%%f" >nul 2>&1
                set /a cleanup_count+=1
            )
        )
    )
)

echo Removed !cleanup_count! non-compressed files
echo.

REM Copy favicon.ico to data directory (after cleanup)
if exist "favicon.ico" (
    echo Copying favicon.ico to data directory...
    copy "favicon.ico" "!DATA_DIR!\favicon.ico" >nul 2>&1
    echo OK favicon.ico copied
)

echo.
echo Copying version.js to data directory...

REM Copy version.js to data directory (uncompressed)
if exist "version.js" (
    echo   Copying version.js...
    copy "version.js" "!DATA_DIR!\version.js" >nul 2>&1
    echo   OK version.js copied
)

echo.
echo Copying extraFonts to data directory...

REM Copy extraFonts/ (optional extra Roboto subsets + their CSS) to data
REM directory, uncompressed (woff2 is already compressed; placed after the
REM cleanup pass above so it isn't immediately deleted, same as favicon.ico
REM and version.js). Source of truth is ..\extraFonts (next to pfodWeb.html)
REM -- not a local pfodWeb_src copy.
if exist "..\extraFonts" (
    REM Clear the destination first so fonts removed from the source don't
    REM linger forever (xcopy only adds/overwrites, never deletes).
    if exist "!DATA_DIR!\extraFonts" rd /s /q "!DATA_DIR!\extraFonts"
    xcopy "..\extraFonts" "!DATA_DIR!\extraFonts\" /Y /I /E >nul 2>&1
    echo   OK extraFonts copied
) else (
    echo   WARNING: extraFonts not found - skipping ^(optional^)
)

echo.
echo ==========================================
echo   Gzip Complete!
echo ==========================================
echo.
echo Summary:
echo   - !bundle_count! JavaScript bundles created (5 expected)
echo   - !html_count! HTML template files gzipped (with pfodCommon.css/html inlined)
echo   - pfodWeb.js.gz created in data directory
echo   - version.js and favicon.ico copied to data directory (uncompressed)
echo.

echo Generated files in !DATA_DIR! (actual sizes):
set /a total_bytes=0
for %%f in ("!DATA_DIR!\*") do (
    set /a fkb=%%~zf/1024
    set /a total_bytes+=%%~zf
    echo   - %%~nxf ^(!fkb! KB^)
)
set /a total_kb=!total_bytes!/1024
echo   ----------------------------------------
echo   Total: !total_kb! KB
echo.

endlocal
pause
