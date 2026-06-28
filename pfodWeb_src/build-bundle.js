#!/usr/bin/env node
/**
 * build-bundle.js
 * Combines all pfodWeb files into single standalone HTML files
 *
 * Usage: node build-bundle.js
 *
 * Creates in parent directory:
 *   - pfodWeb.html (combined with inlined JS)
 *
 * Debug logging is now toggled at runtime via the "Enable Debug logging"
 * checkbox in the connection prompt (or the ?debug URL parameter), so the
 * separate pfodWebDebug.html bundle is no longer built.
 *
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 */

const fs = require('fs');
const path = require('path');

/**
 * Discover every per-board data file under designer/boards/<Board>/<Board>.json.
 *
 * Adding a new board only requires running build_boards.js (which writes the
 * <Board>.json) — this build script no longer needs editing for it to be
 * included.  The shared/ subdirectory is skipped (it holds the loader and
 * enums, not a board data file).  Each returned path is the .json's path
 * relative to pfodWeb_src/ so it slots straight into the scripts array
 * alongside the hand-listed .js files.
 *
 * The output is sorted alphabetically by board name so the bundle order
 * stays deterministic from one build to the next.
 *
 * @returns {string[]} e.g. ['designer/boards/ESP32/ESP32.json',
 *                           'designer/boards/Mega/Mega.json',
 *                           'designer/boards/Uno/Uno.json']
 */
function discoverBoardJsonFiles() {
  const boardsDir = path.join(__dirname, 'designer', 'boards');
  if (!fs.existsSync(boardsDir)) return [];
  return fs.readdirSync(boardsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== 'shared')
    .map((d) => 'designer/boards/' + d.name + '/' + d.name + '.json')
    .filter((p) => fs.existsSync(path.join(__dirname, p)))
    .sort();
}

/**
 * Strip JS-style // and /* … *\/ comments out of a JSONC string so it can
 * be parsed with JSON.parse.  Naive but enough for the board.json files
 * (no strings containing comment markers).  Mirrors build_boards.js's
 * stripJsonComments — duplicated rather than imported to keep
 * build-bundle.js standalone.
 */
function _stripJsonComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * Return every {id, name} pair in a boards.txt file whose
 * `<id>.build.variant` equals variantDirName.  Entries without a
 * corresponding `<id>.name=` line (menu sub-options) are skipped.
 * Returns [] when the file cannot be read or there are no matches.
 * Mirrors build_boards.js's _lookupAllBoardsTxt — duplicated to keep
 * build-bundle.js standalone.
 * @param {string} boardsTxtPath
 * @param {string} variantDirName
 * @returns {Array<{id: string, name: string}>}
 */
function _lookupAllBoardsTxt(boardsTxtPath, variantDirName) {
  let text;
  try { text = fs.readFileSync(boardsTxtPath, 'utf8'); } catch (e) { return []; }
  const escaped   = variantDirName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const variantRe = new RegExp('^([\\w.-]+)\\.build\\.variant\\s*=\\s*' + escaped + '[ \\t\\r]*$', 'gm');
  const results   = [];
  let m;
  while ((m = variantRe.exec(text)) !== null) {
    const id    = m[1];
    const idEsc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nm    = text.match(new RegExp('^' + idEsc + '\\.name\\s*=\\s*(.+?)[ \\t\\r]*$', 'm'));
    if (nm) results.push({ id, name: nm[1] });
  }
  return results;
}

/**
 * Build the 3-level board hierarchy purely from the already-generated board
 * JSON files (passed in as boardDataById).  Each board JSON now carries
 * `family`, `chip`, `familyDisplayName` and `familySortOrder` fields
 * written by build_boards.js (the latter two sourced from that family's
 * family.json), so no access to ../variants/ or boards.txt is required.
 *
 *   { family: { name, sortOrder, chips: { chip: { name, boards: [{id, name}] } } } }
 *
 * @param {object} boardDataById   { id → parsed board JSON }
 * @returns {object}               hierarchy as described above
 */
function buildBoardHierarchy(boardDataById) {
  // Pretty-print a chip id like "esp32c3" → "ESP32-C3".
  const _chipDisplayName = (chipId) => {
    const m = chipId.match(/^esp32([a-z]\d+)?$/i);
    if (m) return m[1] ? 'ESP32-' + m[1].toUpperCase() : 'ESP32';
    if (chipId === 'avr') return 'Arduino AVR';
    return chipId;
  };

  const hierarchy = {};
  for (const [id, data] of Object.entries(boardDataById)) {
    const family = data.family || 'unknown';
    const chip   = data.chip   || 'unknown';
    if (!hierarchy[family]) {
      // familyDisplayName is stamped onto every board JSON by
      // build_boards.js, sourced from that family's family.json — no
      // family names are hardcoded here, so a new family directory under
      // ../variants/ needs no change to this file.
      hierarchy[family] = {
        name:      data.familyDisplayName || family,
        sortOrder: typeof data.familySortOrder === 'number' ? data.familySortOrder : 100,
        chips:     {},
      };
    }
    if (!hierarchy[family].chips[chip]) {
      hierarchy[family].chips[chip] = { name: _chipDisplayName(chip), boards: [] };
    }
    hierarchy[family].chips[chip].boards.push({ id, name: data.name || id });
  }
  // Sort boards within each chip alphabetically by display name.
  for (const fam of Object.values(hierarchy)) {
    for (const chip of Object.values(fam.chips)) {
      chip.boards.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    }
  }
  return hierarchy;
}

// Configuration
const config = {
  sourceDir: __dirname,
  outputDir: path.join(__dirname, '..'),

  // Files to bundle
  bundles: [
    {
      name: 'pfodWeb.html',
      template: 'pfodWeb.html',
      embedSound: true,
      commonHtmlReplacements: {
        '{{SETUP_TITLE}}': 'pfodWeb Connection Setup',
        '{{IS_DATA_BUILD}}': 'false'
      },
      scripts: [
        'version.js',
        'connectionManager.js',
        // ── designer/ — in-browser virtual pfod device (transport='designer') ──
        // Declaration order: shared types → BaseBoard → BoardLoader →
        // per-board data (<Board>.json) → state → dispatch → menus → index.
        // connectionManager.js's DesignerVirtualAdapter references
        // BoardLoader / UnoData / DesignerVirtualDevice at adapter-
        // construction time (not load time), so its file can sit above
        // the designer files here.
        //
        // The board data .json entries are discovered automatically from
        // designer/boards/<Board>/<Board>.json — dropping in a new board
        // (typically via build_boards.js) needs no change here.  Each is
        // emitted by inlineScripts() as `const <Board>Data = {...};` so
        // adapter.js / future board selection code can pick from any of
        // them by name.
        'designer/boards/shared/PinType.js',
        'designer/boards/shared/PinCapabilities.js',
        'designer/boards/shared/enums.js',
        'designer/boards/BaseBoard.js',
        'designer/boards/shared/BoardLoader.js',
        ...discoverBoardJsonFiles(),
        'designer/state.js',
        'designer/dispatch.js',
        // Designer menus.  formats.js MUST come before mainMenu.js (it
        // defines DESIGNER_*_FMT + designerSpacing used by every menu);
        // mainMenu.js MUST come before any handler that calls
        // DesignerMainMenu.send to re-emit the main menu after mutation.
        'designer/menus/formats.js',
        'designer/menus/mainMenu.js',
        'designer/menus/mainMenuHelp.js',
        // editConnection.js owns the 'z' and 'y' cmd bytes for the
        // Connection / Baud pickers reached from editMenu's
        // "Connection" row.  Must load BEFORE editMenu.js — editMenu's
        // render path calls DesignerEditConnection.summaryForEditMenu()
        // to build the connection-row label.
        'designer/menus/editConnection.js',
        // editMenu.js must precede the menus that call DesignerEditMenu.send
        // (newMenu.js + selectFromMenuList.js both open it after their
        // state mutation).  editMenu has no dispatch byte of its own.
        'designer/menus/editMenu.js',
        'designer/menus/editMenuHelp.js',
        'designer/menus/editMenuName.js',
        // editPromptHelp.js must precede editPrompt.js — editPrompt's
        // send() delegates to DesignerEditPromptHelp.send when the
        // sub-cmd byte is 'w'.  The reference is inside a function so
        // load order matters only for clarity; declaring it first
        // matches the dependency direction.
        // editPrompt.js must precede editPromptText.js — the text-input
        // handler calls DesignerEditPrompt.renderFor() to return to the
        // parent screen after an accept.
        'designer/menus/editPromptHelp.js',
        'designer/menus/editPrompt.js',
        'designer/menus/editPromptText.js',
        'designer/menus/previewMenu.js',
        'designer/menus/refreshInterval.js',
        'designer/menus/addMenuItem.js',
        // editMenuItem.js depends on DesignerEditPrompt.buildPromptScreenFormat
        // (loaded earlier via editPrompt.js) AND DESIGNER_COLOUR_PALETTE /
        // designerColourIndex / designerColourFromIndex (loaded earlier
        // via formats.js).  Both references are inside function bodies
        // so load order matters only for human readability.
        // editMenuItemHelp.js must precede editMenuItem.js — its 'dw'
        // case calls DesignerEditMenuItemHelp.send.  Mirrors the
        // editPromptHelp / editPrompt ordering above.
        'designer/menus/editMenuItemHelp.js',
        // editMenuItemPin.js must precede editMenuItem.js — the 'p'
        // (EMI_IO_PIN_CMD) case in editMenuItem calls
        // DesignerEditMenuItemPin.send, so the symbol must be defined first.
        'designer/menus/editMenuItemPin.js',
        'designer/menus/editMenuItem.js',
        // editChart.js owns the 'R', 'Q', 'P' cmd bytes for the
        // chart item editor.  Must load AFTER editMenuItem.js —
        // the chart case in editMenuItem's _renderBody uses 'R'.
        'designer/menus/editChart.js',
        // formatMenuItem.js owns the 'F' cmd byte for the
        // Format Menu Item sub-screen reached from editMenuItem.
        // Must load AFTER editMenuItem.js — it calls
        // DesignerEditMenuItem.renderItemHeaderAndPreview to share
        // the preview-row layout with the parent screen.
        'designer/menus/formatMenuItem.js',
        // pulseEditor owns the 'O' cmd byte (Java's
        // setOutputPulseCmd) — sub-menu for on/off pulse settings.
        // Reads/writes state.getActiveItem().pulse + pulse_ms.
        'designer/menus/pulseEditor.js',
        // deleteMenuItems must load AFTER editMenu — its handler calls
        // DesignerEditMenu.send after each deletion to return the user
        // to the edit menu (matches deleteEmptyMenuList's pattern of
        // returning a sibling screen to avoid back-nav re-firing the
        // delete cmd against a now-shifted index).
        'designer/menus/deleteMenuItems.js',
        // moveMenuItems also returns DesignerEditMenu.send after each
        // move, same load-order rationale as deleteMenuItems.  Owns
        // both 'u' (select item) and 'v' (pick destination) cmd bytes
        // via the two-step Java workflow.
        'designer/menus/moveMenuItems.js',
        // editMenuItems is the "Edit Menu" picker — `{J}` renders the
        // item list, `{K<idx>}` stashes activeItemIdx and queues `{d}`
        // so the per-item editor (editMenuItem.js) lands on the
        // nav stack with its natural cmd.
        'designer/menus/editMenuItems.js',
        'designer/menus/newMenu.js',
        'designer/menus/selectFromMenuList.js',
        'designer/menus/deleteEmptyMenuList.js',
        // saveToFile.js + loadFromFile.js — JS-port-only buttons
        // (Save on editMenu, Load on main menu) backed by the
        // already-existing state.exportToBlob / state.importFromObject
        // methods.  No dependency on the menu files above other than
        // DesignerDispatch and DesignerState, both loaded earlier.
        'designer/menus/saveToFile.js',
        'designer/menus/loadFromFile.js',
        // zipBuilder.js — ZIP/CRC-32 writer + browser-download trigger
        // shared by both code generators below.  Must load before either.
        'designer/menus/zipBuilder.js',
        'designer/menus/generateCode.js',
        // Raw-text assets for the "Minimal C Code" target's generator —
        // the project's fixed pfodParserC library, inlined verbatim as JS
        // string consts (see inlineScripts()'s '.c'/'.h' branch) so
        // generateCcode.js never has to hand-transcribe ~470 lines of C.
        // pfodParserStream.c is NOT inlined here — sampleCcode's copy is
        // PIC18-specific, so generateCcode.js writes its own generic stub.
        'designer/pfodParserC/pfodParser.c',
        'designer/pfodParserC/pfodParser.h',
        'designer/pfodParserC/pfodParserStream.h',
        'designer/menus/generateCcode.js',
        'designer/index.js',
        // adapter.js depends on PfodConnectionBase (connectionManager.js,
        // loaded earlier) AND DesignerVirtualDevice (index.js above),
        // so it must come last in the designer/ load order.
        'designer/adapter.js',
        // boardSelector.js — "Target" picker overlay for the Designer
        // connection panel.  Pure UI; no dependency on the dispatch /
        // state files above, but listed here so it sits with the other
        // designer/ code.  Currently step 1 (top-level family list only).
        'designer/boardSelector.js',
        'csvCollector.js',
        'rawDataCollector.js',
        'jsfreechart/src/JSFreeChart.js',
        'jsfreechart/src/Module.js',
        'jsfreechart/src/Args.js',
        'jsfreechart/src/Utils.js',
        'jsfreechart/src/graphics/Color.js',
        'jsfreechart/src/Colors.js',
        'jsfreechart/src/graphics/Point2D.js',
        'jsfreechart/src/graphics/Rectangle.js',
        'jsfreechart/src/graphics/Dimension.js',
        'jsfreechart/src/graphics/HAlign.js',
        'jsfreechart/src/graphics/RectangleEdge.js',
        'jsfreechart/src/graphics/Insets.js',
        'jsfreechart/src/graphics/Offset2D.js',
        'jsfreechart/src/graphics/Scale2D.js',
        'jsfreechart/src/graphics/Fit2D.js',
        'jsfreechart/src/graphics/Stroke.js',
        'jsfreechart/src/graphics/TextAnchor.js',
        'jsfreechart/src/graphics/Font.js',
        'jsfreechart/src/graphics/LineCap.js',
        'jsfreechart/src/graphics/LineJoin.js',
        'jsfreechart/src/graphics/RefPt2D.js',
        'jsfreechart/src/graphics/Anchor2D.js',
        'jsfreechart/src/graphics/BaseContext2D.js',
        'jsfreechart/src/graphics/CanvasContext2D.js',
        'jsfreechart/src/data/Map.js',
        'jsfreechart/src/data/Range.js',
        'jsfreechart/src/data/StandardXYDataset.js',
        'jsfreechart/src/data/XYDatasetUtils.js',
        'jsfreechart/src/data/KeyedValues2DDataset.js',
        'jsfreechart/src/table/BaseElement.js',
        'jsfreechart/src/table/TableElement.js',
        'jsfreechart/src/table/TextElement.js',
        'jsfreechart/src/table/StandardRectanglePainter.js',
        'jsfreechart/src/table/FlowElement.js',
        'jsfreechart/src/table/RectangleElement.js',
        'jsfreechart/src/table/GridElement.js',
        'jsfreechart/src/renderer/ColorSource.js',
        'jsfreechart/src/renderer/StrokeSource.js',
        'jsfreechart/src/renderer/XYItemRendererState.js',
        'jsfreechart/src/renderer/BaseXYRenderer.js',
        'jsfreechart/src/renderer/ScatterRenderer.js',
        'jsfreechart/src/renderer/XYLineRenderer.js',
        'jsfreechart/src/renderer/CombinedDomainXYItemRenderer.js',
        'jsfreechart/src/util/Format.js',
        'jsfreechart/src/util/NumberFormat.js',
        'jsfreechart/src/axis/AxisSpace.js',
        'jsfreechart/src/axis/LabelOrientation.js',
        'jsfreechart/src/axis/TickMark.js',
        'jsfreechart/src/axis/NumberTickSelector.js',
        'jsfreechart/src/axis/ValueAxis.js',
        'jsfreechart/src/axis/BaseValueAxis.js',
        'jsfreechart/src/axis/LinearAxis.js',
        'jsfreechart/src/labels/StandardXYLabelGenerator.js',
        'jsfreechart/src/legend/LegendBuilder.js',
        'jsfreechart/src/legend/LegendItemInfo.js',
        'jsfreechart/src/legend/StandardLegendBuilder.js',
        'jsfreechart/src/plot/XYPlot.js',
        'jsfreechart/src/plot/CombinedDomainXYPlot.js',
        'jsfreechart/src/Chart.js',
        'jsfreechart/src/Charts.js',
        'chartDisplay.js',
        'caching.js',
        'messageViewer.js',
        'DrawingManager.js',
        'displayTextUtils.js',
        'redraw.js',
        'drawingMerger.js',
        'webTranslator.js',
        'drawingDataProcessor.js',
        'pfodWebMouse.js',
        'pfodMenuCache.js',
        'pfodMenuParser.js',
        'pfodButtonRenderer.js',
        'pfodMenuDisplay.js',
        'pfodInputDisplay.js',
        'pfodNumericInputDisplay.js',
        'pfodSelectionDisplay.js',
        'pfodWeb.js',
        'resizeAndDimensions.js',
        'toolbarAndMenu.js',
        'navigationAndQueue.js',
        'chartAndRawData.js',
        'drawingProcessing.js',
        'keepAliveAndHttp.js',
        'responseHandlers.js',
        'keepAlive.js',
        'requestQueue.js',
        'connectionSetup.js'
      ]
    }
  ]
};

/**
 * Read file with error handling
 */
function readFile(filePath) {
  try {
    const fullPath = path.join(config.sourceDir, filePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    console.log(`  ✓ Read ${filePath} (${content.length} bytes)`);
    return content;
  } catch (error) {
    console.error(`  ✗ Error reading ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Read binary file and convert to base64
 */
function readBinaryFileAsBase64(filePath) {
  try {
    const fullPath = path.join(config.sourceDir, filePath);
    const buffer = fs.readFileSync(fullPath);
    const base64 = buffer.toString('base64');
    console.log(`  ✓ Read ${filePath} (${buffer.length} bytes, converted to base64)`);
    return base64;
  } catch (error) {
    console.error(`  ✗ Error reading ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Embed the Roboto webfonts into a CSS payload.
 *
 * pfodCommon.css references each woff2 via a placeholder of the form
 *   __ROBOTO_<STYLE>_<SUBSET>__      (e.g. __ROBOTO_NORMAL_LATIN__)
 * inside an `src: url('data:font/woff2;base64,…')` attribute.  This function
 * walks pfodWeb_src/fonts/ for files matching
 *   Roboto-<Style>-<Subset>.woff2
 * base64-encodes each, and replaces the matching placeholder.  (NotoSans-*
 * files are also matched for historical reasons, but none are currently
 * shipped — see fetch-roboto.js.)
 *
 * If any placeholder is left unfilled we throw — shipping the bundle with
 * literal __…__ tokens inside data: URLs would break font loading silently
 * in every browser.
 *
 * @param {string} cssContent CSS source with placeholders
 * @returns {string} CSS with placeholders replaced by base64 woff2 data
 */
function embedRobotoFonts(cssContent) {
  const fontsDir = path.join(config.sourceDir, 'fonts');
  if (!fs.existsSync(fontsDir)) {
    throw new Error(`Fonts directory missing: ${fontsDir}. Run pfodWeb_src/fonts/fetch-roboto.js to download.`);
  }
  const woff2Files = fs.readdirSync(fontsDir).filter((f) => /^(Roboto|NotoSans)-.+\.woff2$/.test(f));
  if (woff2Files.length === 0) {
    throw new Error(`No Roboto-*.woff2 or NotoSans-*.woff2 files in ${fontsDir}. Run pfodWeb_src/fonts/fetch-roboto.js to download.`);
  }
  console.log(`  Embedding ${woff2Files.length} font subset(s)`);
  let result = cssContent;
  for (const fname of woff2Files) {
    // <Family>-<Style>-<Subset>.woff2 → __<FAMILY>_<STYLE>_<SUBSET>__
    const match = fname.match(/^(Roboto|NotoSans)-([A-Za-z]+)-([A-Za-z]+)\.woff2$/);
    if (!match) {
      console.log(`    skipping ${fname} (filename does not match expected pattern)`);
      continue;
    }
    const familyTok = match[1].toUpperCase();  // ROBOTO or NOTOSANS
    const token = `__${familyTok}_${match[2].toUpperCase()}_${match[3].toUpperCase()}__`;
    const buf = fs.readFileSync(path.join(fontsDir, fname));
    const b64 = buf.toString('base64');
    if (!result.includes(token)) {
      console.log(`    WARN: ${fname} → ${token} not found in CSS (orphan file)`);
      continue;
    }
    result = result.split(token).join(b64);
    console.log(`    ✓ ${fname} (${buf.length} bytes) → ${token}`);
  }
  // Verify no placeholders remain — fail loudly rather than ship broken @font-face URLs.
  const leftover = result.match(/__(?:ROBOTO|NOTOSANS)_[A-Z_]+__/g);
  if (leftover) {
    throw new Error(`Unfilled font placeholders in CSS: ${[...new Set(leftover)].join(', ')} — corresponding woff2 file(s) missing in pfodWeb_src/fonts/.`);
  }
  return result;
}

/**
 * Embed favicon into HTML head
 */
function embedFavicon(htmlContent, faviconBase64) {
  // Create favicon link tags with data URI
  // Use both rel="icon" and rel="shortcut icon" for better Safari support
  const faviconLink = `<link rel="shortcut icon" type="image/x-icon" href="data:image/x-icon;base64,${faviconBase64}">\n<link rel="icon" type="image/x-icon" href="data:image/x-icon;base64,${faviconBase64}">`;

  // Find the </head> tag and insert favicon before it
  const headCloseIndex = htmlContent.indexOf('</head>');

  if (headCloseIndex !== -1) {
    // Insert before </head>
    return htmlContent.substring(0, headCloseIndex) + faviconLink + '\n' + htmlContent.substring(headCloseIndex);
  } else {
    // If no </head>, find <body> and insert before it
    const bodyIndex = htmlContent.indexOf('<body');
    if (bodyIndex !== -1) {
      return htmlContent.substring(0, bodyIndex) + faviconLink + '\n' + htmlContent.substring(bodyIndex);
    }
  }

  // Fallback: insert at beginning after <!DOCTYPE or <html
  const htmlTagIndex = htmlContent.indexOf('<html');
  if (htmlTagIndex !== -1) {
    const nextTagIndex = htmlContent.indexOf('>', htmlTagIndex);
    return htmlContent.substring(0, nextTagIndex + 1) + '\n' + faviconLink + '\n' + htmlContent.substring(nextTagIndex + 1);
  }

  // Last resort: prepend to content
  return faviconLink + '\n' + htmlContent;
}

/**
 * Inline JavaScript files into HTML
 */
function inlineScripts(htmlContent, scriptFiles, bundleConfig) {
  let result = htmlContent;

  // First, collect all JavaScript content.  Entries ending in .json are
  // treated as data files: parsed (for validation) then emitted as a top-
  // level `const <basename>Data = {...};` declaration so the rest of the
  // bundle can reference the data by name (e.g. Uno.json → UnoData,
  // Mega.json → MegaData, ESP32.json → ESP32Data).  This is how per-board
  // data files under designer/boards/<Board>/<Board>.json reach the bundle
  // without runtime fetch; the file list is auto-discovered by
  // discoverBoardJsonFiles() so new boards need no edits here.
  //
  // We also collect (boardId, varName) pairs so a runtime registry can be
  // emitted after the per-board consts.  This is the only way to look up
  // a board's data by its directory-name id (the URL param) at runtime —
  // the per-board `const` declarations sit in script scope, not on window,
  // so there's no `window[id+'Data']` fallback available.
  // Find the LAST JSON entry's index so the BOARD_DATA_BY_ID registry can
  // be emitted immediately after it — i.e. AFTER every per-board const is
  // declared but BEFORE any later JS (boardSelector.js, etc.) that
  // references it.  Emitting at the very end would leave consumers in
  // the const's temporal-dead-zone and throw "Cannot access … before
  // initialization" on script load.
  const lastJsonIdx = scriptFiles.reduce(
    (acc, f, i) => (f.endsWith('.json') ? i : acc),
    -1
  );

  const boardRegistry = [];
  const boardDataById = {};   // id → parsed JSON, fed to buildBoardHierarchy
  let scriptsContent = scriptFiles.map((scriptFile, idx) => {
    if (scriptFile.endsWith('.json')) {
      const jsonRaw = readFile(scriptFile);
      let data;
      try {
        data = JSON.parse(jsonRaw);
      } catch (e) {
        throw new Error(`Invalid JSON in ${scriptFile}: ${e.message}`);
      }
      const basename = path.basename(scriptFile, '.json');
      // Sanitize to a valid JS identifier: replace any char outside
      // [A-Za-z0-9_$] with '_', and prefix with '_' if it starts with a
      // digit.  Hyphenated board dirs (e.g. BharatPi-A7672S-4G) would
      // otherwise produce `const BharatPi-A7672S-4GData = {...}`, which
      // the JS parser reads as subtraction and rejects.
      let safeName = basename.replace(/[^A-Za-z0-9_$]/g, '_');
      if (/^[0-9]/.test(safeName)) safeName = '_' + safeName;
      const varName  = safeName + 'Data';
      // Only register board JSONs (those under designer/boards/<id>/<id>.json).
      // Other JSON inlines, if added later, would be registered too — that's
      // fine because the registry is just a name→data lookup with no other
      // semantics attached.
      boardRegistry.push({ id: basename, varName });
      boardDataById[basename] = data;
      let block = `\n/* ========================================\n * Inlined from: ${scriptFile}\n * Wrapped as: const ${varName} = {...};\n * ======================================== */\nconst ${varName} = ${JSON.stringify(data, null, 2)};`;
      // After emitting the LAST board const, append the registry
      // declarations in the same chunk so the next .map() iteration
      // (a .js file) lands AFTER it.
      if (idx === lastJsonIdx) {
        const entries = boardRegistry
          .map(({ id, varName: v }) => `  ${JSON.stringify(id)}: ${v}`)
          .join(',\n');
        block += `\n\n/* ========================================\n * BOARD_DATA_BY_ID — auto-generated registry mapping board ids\n * (directory basenames) to their inlined data consts.  Used by\n * designer/boardSelector.js to resolve the URL ?designer=<id>\n * param back to its displayName + pin map at runtime.\n * Emitted immediately after the last per-board const so any later\n * script can reference it without hitting a TDZ ReferenceError.\n * ======================================== */\nconst BOARD_DATA_BY_ID = Object.freeze({\n${entries}\n});`;

        // BOARD_HIERARCHY — three-level grouping (family → chip → board)
        // computed from variants/.  Used by the Target picker to render
        // the cascading selection screens.  Built at bundle time so the
        // runtime never has to walk variants/ itself.  Empty {} when
        // variants/ is absent (device-only builds with no designer/).
        const hierarchy = buildBoardHierarchy(boardDataById);
        block += `\n\n/* ========================================\n * BOARD_HIERARCHY — auto-generated three-level hierarchy:\n *   { family: { name, chips: { chip: { name, boards: [{id,name}] }}}}\n * Used by designer/boardSelector.js to drive the cascading\n * family → chip → board picker.  Computed from variants/ at bundle\n * time so the runtime never walks the filesystem.\n * ======================================== */\nconst BOARD_HIERARCHY = Object.freeze(${JSON.stringify(hierarchy, null, 2)});`;
      }
      return block;
    }
    if (scriptFile.endsWith('.c') || scriptFile.endsWith('.h')) {
      // Raw C source/header bundled verbatim as a JS string constant —
      // JSON.stringify handles all escaping (quotes, backslashes,
      // backticks) so the file is never hand-transcribed into JS.
      // Var name: pfodParser.c -> PFOD_PARSER_C_TEXT, pfodParser.h ->
      // PFOD_PARSER_H_TEXT, pfodParserStream.h -> PFOD_PARSER_STREAM_H_TEXT.
      const rawText  = readFile(scriptFile);
      const base     = path.basename(scriptFile);
      const ext      = path.extname(base).slice(1).toUpperCase();
      const stem     = path.basename(base, path.extname(base))
                          .replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
      const varName  = stem + '_' + ext + '_TEXT';
      return `\n/* ========================================\n * Inlined verbatim from: ${scriptFile}\n * Wrapped as: const ${varName} = "...";\n * ======================================== */\nconst ${varName} = ${JSON.stringify(rawText)};`;
    }
    const jsContent = readFile(scriptFile);
    return `\n/* ========================================\n * Inlined from: ${scriptFile}\n * ======================================== */\n${jsContent}`;
  }).join('\n\n');

  // Remove ALL external script tags with src attribute
  // Pattern matches: <script...src="..."...></script> with any whitespace
  result = result.replace(/<script[^>]*src\s*=\s*["'][^"']*["'][^>]*>\s*<\/script>/gi, '');

  // Override loadDependencies functions in bundled versions (all code already inlined)
  // IMPORTANT: These are added AFTER the inlined code so they override the original definitions
  const overrideFunctions = `
// Mark this as standalone bundled version
window.pfodweb_standalone = true;

// Override dependency loaders for bundled version - all code is already inlined
async function loadDependencies_noDebug() {
  // All dependencies already inlined - skip dynamic loading
  return;
}

async function loadDependencies() {
  // All dependencies already inlined - skip dynamic loading
  return;
}
`;

  // Find the first inline <script> tag (if any) or fall back to </body>
  // This ensures inlined scripts are loaded BEFORE any existing inline scripts
  const firstScriptIndex = result.indexOf('<script');
  const bodyCloseIndex = result.lastIndexOf('</body>');

  let insertIndex;
  if (firstScriptIndex !== -1 && firstScriptIndex < bodyCloseIndex) {
    // Insert before first inline script tag
    insertIndex = firstScriptIndex;
  } else if (bodyCloseIndex !== -1) {
    // No inline scripts, insert before </body>
    insertIndex = bodyCloseIndex;
  } else {
    // No </body> tag, append at end
    insertIndex = -1;
  }

  // Provide initializeApp for external callers (e.g., pfodWebDesigner)
  // pfodWeb.js will call it via DOMContentLoaded, but external code can also call it
  const initCodeForExternal = `\n// initializeApp is available for external callers like pfodWebDesigner\n// It's also called automatically on DOMContentLoaded by pfodWeb.js\n`;

  const inlinedScript = `\n<!-- All JavaScript files combined inline -->\n<script>\n${scriptsContent}\n\n${overrideFunctions}\n${initCodeForExternal}\n</script>\n`;

  if (insertIndex !== -1) {
    result = result.substring(0, insertIndex) + inlinedScript + result.substring(insertIndex);
  } else {
    result += inlinedScript;
  }

  return result;
}

/**
 * Add banner comment to output file
 */
function addBanner(content, bundleName) {
  const banner = `<!--
================================================================================
  STANDALONE BUNDLE: ${bundleName}
  Generated: ${new Date().toISOString()}

  This file contains all JavaScript inlined for standalone deployment.
  No external files or webserver required - just open in browser!

  For development, edit the separate source files and rebuild.

  Build command: node build-bundle.js

  (c)2025 Forward Computing and Control Pty. Ltd.
  NSW Australia, www.forward.com.au
================================================================================
-->
`;
  return banner + content;
}

/**
 * Create a single bundle
 */
function createBundle(bundleConfig, faviconBase64, soundBase64) {
  console.log(`\nCreating bundle: ${bundleConfig.name}`);
  console.log(`  Template: ${bundleConfig.template}`);
  console.log(`  Scripts: ${bundleConfig.scripts.length} files`);

  // Read template HTML
  const templateContent = readFile(bundleConfig.template);

  // Inline pfodCommon.html: replace <!-- pfodCommon.html --> with expanded common body content
  const commonHtmlPath = path.join(config.sourceDir, 'pfodCommon.html');
  let commonHtml = fs.readFileSync(commonHtmlPath, 'utf8');
  if (bundleConfig.commonHtmlReplacements) {
    for (const [token, value] of Object.entries(bundleConfig.commonHtmlReplacements)) {
      commonHtml = commonHtml.replace(token, value);
    }
  }
  const templateWithBody = templateContent.replace('<!-- pfodCommon.html -->\n', commonHtml);

  // Inline pfodCommon.css: replace <link rel="stylesheet" href="pfodCommon.css"> with <style>...</style>.
  // Roboto webfont placeholders are substituted with base64 woff2 data first so that
  // the inlined CSS already carries fully-embedded fonts (no runtime font fetches).
  const commonCssPath = path.join(config.sourceDir, 'pfodCommon.css');
  const commonCssRaw = fs.readFileSync(commonCssPath, 'utf8');
  const commonCss = embedRobotoFonts(commonCssRaw);
  const templateWithCss = templateWithBody.replace(
    /[ \t]*<link rel="stylesheet" href="pfodCommon\.css">/,
    `    <style>\n${commonCss}\n    </style>`
  );

  // Embed favicon
  let bundledContent = embedFavicon(templateWithCss, faviconBase64);

  // Inline all scripts
  bundledContent = inlineScripts(bundledContent, bundleConfig.scripts, bundleConfig);

  // Embed sound.mp3: replace placeholder inserted by pfodButtonRenderer.js
  // If sound.mp3 was not found, placeholder remains and runtime falls back to generated sound.
  if (bundleConfig.embedSound && soundBase64) {
    bundledContent = bundledContent.replace('__SOUND_MP3_BASE64__', soundBase64);
  }

  // Inline pfodProxyInstructions.html as a JS string literal
  const instructionsPath = path.join(config.sourceDir, 'pfodProxyInstructions.html');
  if (fs.existsSync(instructionsPath)) {
    const instructionsHtml = fs.readFileSync(instructionsPath, 'utf8');
    const instructionsJson = JSON.stringify(instructionsHtml).replace(/<\/script>/gi, '<\\/script>');
    bundledContent = bundledContent.replace('__PFOD_PROXY_INSTRUCTIONS__', instructionsJson);
  }

  // Add banner
  bundledContent = addBanner(bundledContent, bundleConfig.name);

  // Write output file
  const outputPath = path.join(config.outputDir, bundleConfig.name);
  fs.writeFileSync(outputPath, bundledContent, 'utf8');

  const size = (bundledContent.length / 1024).toFixed(2);
  console.log(`  ✓ Created ${bundleConfig.name} (${size} KB)`);

  return outputPath;
}

/**
 * Main build process
 */
function build() {
  console.log('========================================');
  console.log('  pfodWeb Bundle Builder');
  console.log('========================================');

  // Read resources once at the start
  console.log('\nPreparing resources:');
  let faviconBase64;
  try {
    faviconBase64 = readBinaryFileAsBase64('favicon.ico');
  } catch (error) {
    console.error('\n✗ Failed to read favicon.ico:');
    console.error(error.message);
    process.exit(1);
  }

  const warningsFile = path.join(config.sourceDir, 'build_warnings.txt');
  const warnings = [];

  let soundBase64 = null;
  if (config.bundles.some(b => b.embedSound)) {
    try {
      soundBase64 = readBinaryFileAsBase64('sound.mp3');
    } catch (error) {
      warnings.push('WARNING: sound.mp3 not found - bundles will use fallback generated sound');
      console.error('  ' + warnings[warnings.length - 1]);
    }
  }

  // Create each bundle
  const outputs = [];
  for (const bundleConfig of config.bundles) {
    try {
      const outputPath = createBundle(bundleConfig, faviconBase64, soundBase64);
      outputs.push(outputPath);
    } catch (error) {
      console.error(`\n✗ Failed to create ${bundleConfig.name}:`, error.message);
      process.exit(1);
    }
  }

  // extraFonts/ already lives in outputDir (the maintained source of truth,
  // next to the deployed pfodWeb.html) -- nothing to stage here.

  // Summary
  console.log('\n========================================');
  console.log('  Build Complete!');
  console.log('========================================');
  console.log('\nGenerated files:');
  outputs.forEach(file => {
    const stats = fs.statSync(file);
    const size = (stats.size / 1024).toFixed(2);
    console.log(`  • ${path.basename(file)} (${size} KB)`);
  });

  console.log('\nDeployment:');
  console.log('  1. Copy HTML files to deployment location');
  console.log('  2. Double-click pfodWeb.html to launch');
  console.log('  3. No webserver needed - runs from file://');
  console.log('\nNote: Device must have CORS headers enabled for HTTP connections');
  console.log('');

  // Write warnings file so build.bat / build.sh can reprint them at the end.
  // Delete the file when there are no warnings so stale warnings are not shown.
  if (warnings.length > 0) {
    fs.writeFileSync(warningsFile, warnings.join('\n') + '\n', 'utf8');
  } else {
    try { fs.unlinkSync(warningsFile); } catch (e) { /* file may not exist */ }
  }
}

// Run build
if (require.main === module) {
  build();
}

module.exports = { build };
