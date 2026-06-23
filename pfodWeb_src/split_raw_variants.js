#!/usr/bin/env node
/**
 * split_raw_variants.js
 *
 * One-off tool to dispatch every per-board variant directory currently
 * sitting under ../rawVariants/ into its correct chip-family slot under
 * ../variants/esp32/<mcu>/<variantDirName>/.
 *
 * Chip family for each variant is read from boards.txt:
 *
 *   <id>.build.variant=<variantDirName>     <-- maps dir name to a board id
 *   <id>.build.mcu=<mcu>                    <-- mcu for that id  (e.g. esp32c6)
 *
 * Boards without a matching `<id>.build.variant=` entry in boards.txt are
 * left in place and reported so they can be handled manually.  Existing
 * destinations are never overwritten — collisions are reported, not
 * resolved silently.
 *
 * Usage:
 *   node split_raw_variants.js
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const rawDir      = path.join(projectRoot, 'rawVariants');
const boardsTxt   = path.join(projectRoot, 'variants', 'esp32', 'boards.txt');
const destBase    = path.join(projectRoot, 'variants', 'esp32');

if (!fs.existsSync(rawDir)) {
  console.error('rawVariants directory not found: ' + rawDir);
  process.exit(1);
}
if (!fs.existsSync(boardsTxt)) {
  console.error('boards.txt not found: ' + boardsTxt);
  process.exit(1);
}

// ── Index boards.txt ────────────────────────────────────────────────
// Two indexes built in a single pass through the file:
//   variantToIds[variantDirName] -> [id1, id2, ...]  (multiple boards
//                                                     can share a variant)
//   idToMcu[id]                  -> mcu string
const text = fs.readFileSync(boardsTxt, 'utf8');

const variantToIds = {};
const idToMcu      = {};

const variantRe = /^([\w.-]+)\.build\.variant\s*=\s*(\S+)\s*$/gm;
let m;
while ((m = variantRe.exec(text)) !== null) {
  const id = m[1], variant = m[2];
  if (!variantToIds[variant]) variantToIds[variant] = [];
  variantToIds[variant].push(id);
}

const mcuRe = /^([\w.-]+)\.build\.mcu\s*=\s*(\S+)\s*$/gm;
while ((m = mcuRe.exec(text)) !== null) {
  idToMcu[m[1]] = m[2];
}

// ── Walk rawVariants/ ───────────────────────────────────────────────
const entries = fs.readdirSync(rawDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

console.log('Scanning ' + entries.length + ' variant director' +
            (entries.length === 1 ? 'y' : 'ies') + ' in rawVariants/');

const movedByMcu = {};
const unmapped   = [];   // dir name has no <id>.build.variant=<dir> entry
const noMcu      = [];   // matched id has no build.mcu= line
const ambiguous  = [];   // multiple ids match with conflicting mcus
const conflicts  = [];   // destination already exists

for (const dirName of entries) {
  const ids = variantToIds[dirName];
  if (!ids || ids.length === 0) {
    unmapped.push(dirName);
    continue;
  }

  // Collect mcus for every matching id, then verify they agree.
  // For menu-based ids of the form "<parent>.menu.<key>.<value>" the
  // build.mcu line lives on the parent (top-level board), not on the
  // menu sub-id — fall back to that when the direct lookup fails.
  const mcus = new Set();
  for (const id of ids) {
    let mcu = idToMcu[id];
    if (!mcu) {
      const parentMatch = id.match(/^(.+?)\.menu\./);
      if (parentMatch) mcu = idToMcu[parentMatch[1]];
    }
    if (mcu) mcus.add(mcu);
  }
  if (mcus.size === 0) {
    noMcu.push(dirName + ' (ids: ' + ids.join(', ') + ')');
    continue;
  }
  if (mcus.size > 1) {
    ambiguous.push(dirName + ' (ids: ' + ids.join(', ') +
                   ', mcus: ' + [...mcus].join(', ') + ')');
    continue;
  }
  const mcu = [...mcus][0];

  const src     = path.join(rawDir, dirName);
  const destDir = path.join(destBase, mcu);
  const dest    = path.join(destDir, dirName);

  if (fs.existsSync(dest)) {
    conflicts.push(dirName + ' -> variants/esp32/' + mcu + '/' + dirName + '  (already exists)');
    continue;
  }

  fs.mkdirSync(destDir, { recursive: true });
  fs.renameSync(src, dest);
  if (!movedByMcu[mcu]) movedByMcu[mcu] = 0;
  movedByMcu[mcu]++;
}

// ── Report ──────────────────────────────────────────────────────────
const total = Object.values(movedByMcu).reduce((a, b) => a + b, 0);
console.log('\nMoved ' + total + ' board director' +
            (total === 1 ? 'y' : 'ies') + ':');
for (const mcu of Object.keys(movedByMcu).sort()) {
  console.log('  ' + mcu.padEnd(12) + movedByMcu[mcu]);
}

if (unmapped.length > 0) {
  console.log('\nUnmapped (no boards.txt entry whose build.variant matches the dir name) — ' +
              unmapped.length + ':');
  for (const u of unmapped) console.log('  ' + u);
}
if (noMcu.length > 0) {
  console.log('\nMatched but no build.mcu — ' + noMcu.length + ':');
  for (const e of noMcu) console.log('  ' + e);
}
if (ambiguous.length > 0) {
  console.log('\nAmbiguous (multiple matching ids with different mcus) — ' +
              ambiguous.length + ':');
  for (const a of ambiguous) console.log('  ' + a);
}
if (conflicts.length > 0) {
  console.log('\nConflicts (destination already exists, left in rawVariants/) — ' +
              conflicts.length + ':');
  for (const c of conflicts) console.log('  ' + c);
}

if (unmapped.length + noMcu.length + ambiguous.length + conflicts.length > 0) {
  process.exitCode = 1;
}
