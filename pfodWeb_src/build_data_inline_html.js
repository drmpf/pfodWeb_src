#!/usr/bin/env node
/*
 * build_data_inline_html.js — Inline pfodCommon.css and pfodCommon.html into
 * pfodWeb.html so the gzipped HTML deployed to the device is self-contained
 * (single CSS+HTML payload, no extra requests for pfodCommon.css /
 * pfodCommon.html).
 *
 * Called by build_data.bat / build_data.sh before gzipping.
 *
 * Substitutions performed:
 *   <link rel="stylesheet" href="pfodCommon.css">  →  <style>...</style>
 *   <!-- pfodCommon.html -->                       →  contents of pfodCommon.html
 *   {{SETUP_TITLE}}                                →  per-template title
 *
 * Inputs:  pfodWeb_src/{pfodWeb.html, pfodCommon.css, pfodCommon.html}
 * Outputs: data/{pfodWeb.html}                    (inlined, ready to gzip)
 *
 * (c)2025 Forward Computing and Control Pty. Ltd.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SRC  = __dirname;
const DATA = path.resolve(SRC, '..', 'data');

if (!fs.existsSync(DATA)) {
  fs.mkdirSync(DATA, { recursive: true });
}

const cssRaw = fs.readFileSync(path.join(SRC, 'pfodCommon.css'),  'utf8');
const common = fs.readFileSync(path.join(SRC, 'pfodCommon.html'), 'utf8');
const css    = embedRobotoFonts(cssRaw);

const builds = [
  {
    name: 'pfodWeb.html',
    setupTitle: 'pfodWeb Connection Setup',
  },
];

// Plain-string replace (NOT regex) so CSS / HTML literals don't need escaping.
function replaceAll(src, find, repl) {
  return src.split(find).join(repl);
}

// Embed Roboto webfont woff2 files into the CSS payload by
// substituting placeholders with base64-encoded woff2 contents.
//   __ROBOTO_<STYLE>_<SUBSET>__      ← Roboto-<Style>-<Subset>.woff2
// Mirrors the same step in build-bundle.js so both the standalone HTML build
// and the .gz server build produce CSS with fully-embedded fonts.  Fails
// loudly if any expected woff2 file is missing — shipping a CSS bundle with
// literal placeholders inside data: URLs would silently break font loading.
function embedRobotoFonts(cssContent) {
  const fontsDir = path.join(SRC, 'fonts');
  if (!fs.existsSync(fontsDir)) {
    throw new Error(`Fonts directory missing: ${fontsDir}. Run pfodWeb_src/fonts/fetch-roboto.js to download.`);
  }
  const woff2Files = fs.readdirSync(fontsDir).filter((f) => /^(Roboto|NotoSans)-.+\.woff2$/.test(f));
  if (woff2Files.length === 0) {
    throw new Error(`No Roboto-*.woff2 or NotoSans-*.woff2 files in ${fontsDir}. Run pfodWeb_src/fonts/fetch-roboto.js to download.`);
  }
  let result = cssContent;
  for (const fname of woff2Files) {
    const match = fname.match(/^(Roboto|NotoSans)-([A-Za-z]+)-([A-Za-z]+)\.woff2$/);
    if (!match) continue;
    const familyTok = match[1].toUpperCase();  // ROBOTO or NOTOSANS
    const token = `__${familyTok}_${match[2].toUpperCase()}_${match[3].toUpperCase()}__`;
    const buf = fs.readFileSync(path.join(fontsDir, fname));
    if (!result.includes(token)) continue;
    result = result.split(token).join(buf.toString('base64'));
  }
  const leftover = result.match(/__(?:ROBOTO|NOTOSANS)_[A-Z_]+__/g);
  if (leftover) {
    throw new Error(`Unfilled font placeholders: ${[...new Set(leftover)].join(', ')} — corresponding woff2 file(s) missing in pfodWeb_src/fonts/.`);
  }
  return result;
}

for (const b of builds) {
  const tmplPath = path.join(SRC, b.name);
  if (!fs.existsSync(tmplPath)) {
    console.warn(`  WARNING: ${tmplPath} missing — skipping`);
    continue;
  }

  let html = fs.readFileSync(tmplPath, 'utf8');

  html = replaceAll(
    html,
    '<link rel="stylesheet" href="pfodCommon.css">',
    `<style>\n${css}\n</style>`
  );
  html = replaceAll(html, '<!-- pfodCommon.html -->', common);
  html = replaceAll(html, '{{SETUP_TITLE}}', b.setupTitle);
  // Data build: served directly by the device, no pfodProxy exists --
  // see PFODWEB_DATA_BUILD usage in pfodCommon.html (hideUnavailableProtocols()).
  html = replaceAll(html, '{{IS_DATA_BUILD}}', 'true');

  // Inline pfodProxyInstructions.html as a JS string literal
  const instructionsPath = path.join(SRC, 'pfodProxyInstructions.html');
  if (fs.existsSync(instructionsPath)) {
    const instructionsHtml = fs.readFileSync(instructionsPath, 'utf8');
    const instructionsJson = JSON.stringify(instructionsHtml).replace(/<\/script>/gi, '<\\/script>');
    html = html.replace('__PFOD_PROXY_INSTRUCTIONS__', instructionsJson);
  }

  const outPath = path.join(DATA, b.name);
  fs.writeFileSync(outPath, html, 'utf8');
  console.log(`  OK ${b.name} written (${html.length.toLocaleString()} chars)`);
}
