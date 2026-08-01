/*
   build_data_embed_sound.js
 * (c)2026 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Embed sound.mp3 into a concatenated data-build JS bundle, so the device
// build ships the same real click sound the standalone build does.
//
// Usage:  node build_data_embed_sound.js <bundle-temp-file>
// Called by: build_data.bat and build_data.sh, from bundle_and_gzip / the
//            004-menu block, AFTER the bundle's .js files are concatenated
//            and BEFORE it is gzipped.  Both callers must stay in step —
//            this is the same dual-build-path trap the HTML/font inlining
//            has (build-bundle.js vs build_data_inline_html.js each carry
//            their own copy of that logic).
//
// Why a separate step: the data build's JS bundles are produced by plain
// shell concatenation (`type` / `cat`) with no JS processing at all, so
// there was nowhere for the substitution to happen and the device build
// silently shipped the placeholder — pfodButtonRenderer.js then fell back
// to its generated tone.  The standalone build does the equivalent
// substitution inline in build-bundle.js.
//
// FIRST OCCURRENCE ONLY — this is load-bearing, not laziness.
// pfodButtonRenderer.js writes the placeholder twice, deliberately:
//     const mp3Base64 = '__SOUND_MP3_BASE64__';
//     if (mp3Base64 !== '__SOUND_MP3_BASE64__') {   // was it filled in?
// Substituting only the first leaves the second as the literal it compares
// against, which is how the runtime detects whether a build embedded the
// sound.  Replacing every occurrence would make the two sides equal again
// and permanently select the fallback path — exactly the bug this script
// exists to fix.  build-bundle.js relies on the same semantics.

const fs   = require('fs');
const path = require('path');

const PLACEHOLDER = '__SOUND_MP3_BASE64__';
const SOUND_FILE  = path.join(__dirname, 'sound.mp3');

const target = process.argv[2];
if (!target) {
  console.error('  ERROR: build_data_embed_sound.js requires a bundle file path');
  process.exit(1);
}

// No sound.mp3 in the tree is a supported configuration, not an error: the
// placeholder stays put and pfodButtonRenderer.js generates a tone instead.
// Mirrors build-bundle.js, which skips the substitution the same way.
if (!fs.existsSync(SOUND_FILE)) {
  console.log('  NOTE: sound.mp3 not found — click sound will use the generated fallback');
  process.exit(0);
}

const bundle = fs.readFileSync(target, 'utf8');
const idx    = bundle.indexOf(PLACEHOLDER);

// Placeholder absent means pfodButtonRenderer.js is no longer in this
// bundle (the file lists in build_data.bat / build_data.sh were changed).
// Say so loudly rather than exiting quietly — a silent skip here is
// invisible in the build log and shows up much later as "the sound stopped
// working on the device".  Not fatal: the rest of the build is fine and the
// runtime still has its fallback.
if (idx === -1) {
  console.log('  ERROR: ' + PLACEHOLDER + ' not found in ' + path.basename(target)
            + ' — sound.mp3 NOT embedded (has pfodButtonRenderer.js moved to'
            + ' another bundle?  Move this script\'s caller with it.)');
  process.exit(0);
}

const base64 = fs.readFileSync(SOUND_FILE).toString('base64');

// Spliced rather than String.replace()'d: a replacement string is scanned
// for $-patterns ($&, $', $1 …).  Base64's alphabet has no '$' so replace()
// would be safe today, but splicing states the intent — copy these bytes
// verbatim — and cannot be broken by a future change of encoding.
const patched = bundle.slice(0, idx) + base64 + bundle.slice(idx + PLACEHOLDER.length);
fs.writeFileSync(target, patched, 'utf8');

const mp3KB = Math.round(fs.statSync(SOUND_FILE).size / 1024);
const b64KB = Math.round(base64.length / 1024);
console.log('  OK sound.mp3 embedded into ' + path.basename(target)
          + ' (' + mp3KB + ' KB mp3 -> ' + b64KB + ' KB base64)');
