#!/usr/bin/env node
/*
 * fetch-roboto.js
 *
 * One-shot helper to download Roboto webfont subsets used by pfodWeb.
 *
 * What it does:
 *   1. Fetches Google Fonts' Roboto CSS for the four weight/style combinations
 *      pfodWeb uses (normal-400, normal-700, italic-400, italic-700).
 *   2. Filters to just the subsets in KEEP_SUBSETS below — currently latin
 *      and latin-ext, the only two still embedded as base64 in
 *      pfodCommon.css (always needed, so no benefit to externalizing).
 *   3. Dedupes woff2 URLs (Google serves the same variable-font woff2 for both
 *      400 and 700 weights of the same subset/style; therefore the 4 weight×style
 *      combinations collapse to 2 unique URLs per subset → 4 files total for
 *      the 2 subsets we keep).
 *   4. Downloads each unique woff2 into fonts/ with the semantic filename
 *      "Roboto-<Style>-<Subset>.woff2" where Style ∈ {Normal, Italic} and
 *      Subset ∈ {Latin, LatinExt}.
 *
 * cyrillic, cyrillic-ext, greek, greek-ext are commented out of
 * KEEP_SUBSETS below — those subsets were moved out of pfodCommon.css and are
 * now external, on-demand @font-face rules in
 * pfodWeb_src/extraFonts/pfodweb-extra-fonts.css, with their woff2 files
 * living alongside it in pfodWeb_src/extraFonts/.  This script no longer
 * fetches them; re-enable the lines below (and re-run) only if those subsets
 * need refreshing from Google Fonts, then move the resulting files into
 * extraFonts/ by hand.
 *
 * The matching @font-face placeholders embedded in pfodCommon.css have the
 * form __ROBOTO_<STYLE>_<SUBSET>__ and are substituted with base64 file
 * contents at build time by build-bundle.js / build_data.bat.
 *
 * Run once whenever the embedded font version needs refreshing.  The build
 * pipeline does not invoke this file.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const FONTS_DIR = __dirname;

// Subsets to keep — order matches the placeholder list documented in pfodCommon.css.
// cyrillic/cyrillic-ext/greek/greek-ext are commented out: those
// subsets now live externally in pfodWeb_src/extraFonts/ instead of being
// inlined into pfodCommon.css — see the file header comment above.
const KEEP_SUBSETS = [
  'latin', 'latin-ext',
  // 'cyrillic', 'cyrillic-ext',
  // 'greek', 'greek-ext'
];
const KEEP_SET = new Set(KEEP_SUBSETS);

// Map subset slug → PascalCase token used in filenames and placeholders.
const SUBSET_TOKEN = {
  'latin':        'Latin',
  'latin-ext':    'LatinExt',
  'cyrillic':     'Cyrillic',
  'cyrillic-ext': 'CyrillicExt',
  'greek':        'Greek',
  'greek-ext':    'GreekExt'
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
           'AppleWebKit/537.36 (KHTML, like Gecko) ' +
           'Chrome/120.0 Safari/537.36';
const CSS_URL =
  'https://fonts.googleapis.com/css2?family=Roboto:ital,wght@' +
  '0,400;0,700;1,400;1,700&display=swap&subset=' +
  KEEP_SUBSETS.join(',');

/**
 * Promise-wrapped https GET that follows redirects.  Returns a Buffer.
 */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return httpsGet(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data',  (c) => chunks.push(c));
      res.on('end',   () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

/**
 * Extract {subset, url, style, weight} entries from a Google Fonts CSS payload.
 * The CSS uses "/* <subset> *\/" comments immediately before each @font-face block.
 */
function parseGoogleFontsCss(css) {
  const entries = [];
  const rx = /\/\*\s*(\S+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g;
  let m;
  while ((m = rx.exec(css)) !== null) {
    const subset = m[1];
    const block  = m[2];
    const url    = (block.match(/url\((https:\/\/[^)]+\.woff2)\)/) || [])[1];
    const style  = (block.match(/font-style:\s*(\w+);/)            || [])[1];
    const weight = (block.match(/font-weight:\s*(\d+);/)           || [])[1];
    if (url && style && weight) {
      entries.push({ subset, url, style, weight });
    }
  }
  return entries;
}

async function main() {
  console.log('Fetching Google Fonts CSS …');
  const cssBuf = await httpsGet(CSS_URL);
  const cssRaw = cssBuf.toString('utf8');
  fs.writeFileSync(path.join(FONTS_DIR, 'roboto-google.css.txt'), cssRaw);

  const allEntries = parseGoogleFontsCss(cssRaw);
  const entries    = allEntries.filter((e) => KEEP_SET.has(e.subset));
  console.log(`Parsed ${allEntries.length} blocks → kept ${entries.length} after subset filter`);

  // Build the (style, subset) → URL map.  Google serves the same woff2 for
  // both 400 and 700 weights of a given style+subset, so we only need one
  // URL per (style, subset) pair.
  const targetFiles = new Map(); // key "Normal:latin" → {url, fileName}
  for (const e of entries) {
    const styleTok  = (e.style === 'italic') ? 'Italic' : 'Normal';
    const subsetTok = SUBSET_TOKEN[e.subset];
    const key       = `${styleTok}:${e.subset}`;
    if (!targetFiles.has(key)) {
      targetFiles.set(key, {
        url:      e.url,
        fileName: `Roboto-${styleTok}-${subsetTok}.woff2`,
        styleTok,
        subsetTok
      });
    } else if (targetFiles.get(key).url !== e.url) {
      console.warn(`  WARN: ${key} has differing URLs for weight 400 vs 700 — using first.`);
    }
  }
  console.log(`Unique woff2 files to download: ${targetFiles.size}`);

  for (const [key, info] of targetFiles) {
    const outFile = path.join(FONTS_DIR, info.fileName);
    if (fs.existsSync(outFile)) {
      console.log(`  already have ${info.fileName}`);
      continue;
    }
    process.stdout.write(`  downloading ${info.fileName} … `);
    const buf = await httpsGet(info.url);
    fs.writeFileSync(outFile, buf);
    console.log(`${buf.length} bytes`);
  }

  console.log('\nDone.');
  console.log('Each woff2 maps to the placeholder __ROBOTO_<STYLE>_<SUBSET>__');
  console.log('referenced from pfodCommon.css.  Now run build.bat to inline them.');
}

main().catch((err) => { console.error(err); process.exit(1); });
