/*
 * designer/menus/zipBuilder.js
 *
 * Minimal ZIP (STORE, no compression) writer + browser-download trigger,
 * shared by every "Generate Code" output (Arduino/C++ via generateCode.js,
 * plain C via generateCcode.js). Language-agnostic — just bytes in,
 * a .zip Blob download out — so it lives in its own file rather than
 * being duplicated per generator.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const DesignerZipBuilder = (() => {

  // ── CRC-32 (for ZIP) ────────────────────────────────────────────

  const _CRC32_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();

  function _crc32(data) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
      crc = _CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // ── ZIP STORE writer ────────────────────────────────────────────
  // Builds a minimal ZIP archive (STORE, no compression) from an array
  // of {path: string, data: Uint8Array} entries.

  function _u16le(v) { return [v & 0xFF, (v >> 8) & 0xFF]; }
  function _u32le(v) { return [v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF]; }

  function buildZip(entries) {
    const enc = new TextEncoder();
    const localHeaders = [];
    let offset = 0;

    for (const entry of entries) {
      const nameBytes = enc.encode(entry.path);
      const data      = entry.data;
      const crc       = _crc32(data);
      const size      = data.length;

      const lh = [
        0x50, 0x4B, 0x03, 0x04,    // local file header signature
        ..._u16le(20),              // version needed to extract (2.0)
        ..._u16le(0),               // general purpose bit flag
        ..._u16le(0),               // compression method: STORE
        ..._u16le(0),               // last mod file time
        ..._u16le(0),               // last mod file date
        ..._u32le(crc),
        ..._u32le(size),            // compressed size (= uncompressed for STORE)
        ..._u32le(size),            // uncompressed size
        ..._u16le(nameBytes.length),
        ..._u16le(0),               // extra field length
        ...nameBytes,
      ];

      localHeaders.push({ header: lh, data, crc, size, nameBytes, localOffset: offset });
      offset += lh.length + size;
    }

    // Central directory records
    const centralDirs = [];
    const cdStart = offset;
    for (const e of localHeaders) {
      const cd = [
        0x50, 0x4B, 0x01, 0x02,    // central directory file header signature
        ..._u16le(20),              // version made by
        ..._u16le(20),              // version needed to extract
        ..._u16le(0),               // general purpose bit flag
        ..._u16le(0),               // compression method: STORE
        ..._u16le(0),               // last mod file time
        ..._u16le(0),               // last mod file date
        ..._u32le(e.crc),
        ..._u32le(e.size),          // compressed size
        ..._u32le(e.size),          // uncompressed size
        ..._u16le(e.nameBytes.length),
        ..._u16le(0),               // extra field length
        ..._u16le(0),               // file comment length
        ..._u16le(0),               // disk number start
        ..._u16le(0),               // internal file attributes
        ..._u32le(0),               // external file attributes
        ..._u32le(e.localOffset),   // relative offset of local header
        ...e.nameBytes,
      ];
      centralDirs.push(cd);
      offset += cd.length;
    }

    const cdSize = offset - cdStart;

    // End of central directory record
    const eocd = [
      0x50, 0x4B, 0x05, 0x06,    // end of central directory signature
      ..._u16le(0),               // number of this disk
      ..._u16le(0),               // disk with start of central directory
      ..._u16le(entries.length),  // entries on this disk
      ..._u16le(entries.length),  // total entries
      ..._u32le(cdSize),          // size of central directory
      ..._u32le(cdStart),         // offset of start of central directory
      ..._u16le(0),               // zip file comment length
    ];

    // Assemble all parts into one Uint8Array.
    const totalSize = offset + eocd.length;
    const result    = new Uint8Array(totalSize);
    let pos = 0;
    for (const e of localHeaders) {
      result.set(e.header, pos);  pos += e.header.length;
      result.set(e.data,   pos);  pos += e.data.length;
    }
    for (const cd of centralDirs) {
      result.set(cd, pos);  pos += cd.length;
    }
    result.set(eocd, pos);
    return result;
  }

  // ── ZIP reader ──────────────────────────────────────────────────
  // Parses a ZIP archive back into {path, data: Uint8Array} entries.
  //
  // It reads STORE (0) and DEFLATE (8). The writer above still emits
  // STORE only, and deliberately: a stored zip is read by every tool
  // there is, so nothing is gained by compressing a few hundred bytes of
  // json. Reading is the other way round. pfodWeb is the only thing that
  // writes stored zips; a user who unzips a design, edits a drawing and
  // zips it back up gets DEFLATE from Explorer, from Finder, from the
  // `zip` command — from anything they are likely to reach for. Refusing
  // that made an ordinary edit-and-return look like a corrupt file.
  //
  // So: conservative in what it writes, liberal in what it accepts.
  //
  // Inflating uses DecompressionStream, which is part of the platform —
  // no dependency either direction — but it is async, which is why the
  // reader below is. Both callers were already inside async file-reader
  // callbacks, so that costs them an await and nothing else.

  /// Locate the End Of Central Directory record by scanning backward
  /// from the end of the buffer for its signature — buildZip never
  /// writes a zip comment, so this is normally found immediately, but
  /// scanning (rather than assuming a fixed offset) is more robust
  /// against e.g. a re-zipped/re-saved copy that added one.
  /// @param {DataView} view
  /// @param {number} length
  /// @returns {number} byte offset of the EOCD signature
  function _findEocd(view, length) {
    for (let i = length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === 0x06054b50) return i;
    }
    throw new Error('[DesignerZipBuilder] readZip: not a valid zip (no End Of Central Directory record found)');
  }

  /// Inflate one raw DEFLATE stream — a zip entry's payload has no zlib
  /// header, hence 'deflate-raw' rather than 'deflate'.
  /// @param {Uint8Array} bytes
  /// @returns {Promise<Uint8Array>}
  async function _inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('[DesignerZipBuilder] readZip: this browser cannot decompress zip entries ' +
        '(no DecompressionStream)');
    }
    const stream = new Blob([bytes]).stream()
      .pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /// @param {Uint8Array} bytes
  /// @returns {Promise<Array<{path: string, data: Uint8Array}>>}
  async function readZip(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocdPos       = _findEocd(view, bytes.length);
    const totalEntries  = view.getUint16(eocdPos + 10, true);
    const cdOffset      = view.getUint32(eocdPos + 16, true);

    const dec = new TextDecoder();
    const entries = [];
    let pos = cdOffset;
    for (let i = 0; i < totalEntries; i++) {
      if (view.getUint32(pos, true) !== 0x02014b50) {
        throw new Error('[DesignerZipBuilder] readZip: malformed central directory record at offset ' + pos);
      }
      const method     = view.getUint16(pos + 10, true);
      const compSize   = view.getUint32(pos + 20, true);
      const nameLen    = view.getUint16(pos + 28, true);
      const extraLen   = view.getUint16(pos + 30, true);
      const commentLen = view.getUint16(pos + 32, true);
      const localOffset = view.getUint32(pos + 42, true);
      const path = dec.decode(bytes.subarray(pos + 46, pos + 46 + nameLen));

      if (method !== 0 && method !== 8) {
        throw new Error('[DesignerZipBuilder] readZip: "' + path + '" uses unsupported compression method ' +
          method + ' (only STORE/0 and DEFLATE/8 are supported)');
      }
      if (view.getUint32(localOffset, true) !== 0x04034b50) {
        throw new Error('[DesignerZipBuilder] readZip: malformed local file header for "' + path + '"');
      }
      // Local header's own name/extra lengths are authoritative for the
      // data offset (should match the central directory's own, but
      // reading them directly is the correct zip format contract).
      const localNameLen  = view.getUint16(localOffset + 26, true);
      const localExtraLen = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const raw = bytes.slice(dataStart, dataStart + compSize);
      const data = method === 8 ? await _inflateRaw(raw) : raw;

      entries.push({ path, data });
      pos += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  // ── Download trigger ────────────────────────────────────────────
  // Wraps zipBytes in a Blob, triggers a browser download as
  // `<downloadName>`, and (on Windows) shows a one-time overlay
  // explaining how to clear the Windows Security zone-block on the
  // downloaded .zip.

  function triggerDownload(downloadName, zipBytes) {
    const blob = new Blob([zipBytes], { type: 'application/zip' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (navigator.userAgent.includes('Windows')) {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:99999';
      const box = document.createElement('div');
      box.style.cssText = 'background:#fff;border-radius:6px;padding:24px 28px;max-width:360px;width:90%;box-shadow:0 4px 24px rgba(0,0,0,.35);font-family:sans-serif;font-size:14px;line-height:1.5';
      box.innerHTML =
        '<div style="font-size:16px;font-weight:bold;margin-bottom:12px">Generated Code</div>' +
        '<div><b>' + downloadName + '</b> downloaded.</div>' +
        '<div style="margin-top:12px"><b>To clear Windows Security Block:</b><br>' +
        'Right-click the .zip → Properties<br>→ tick <b>Unblock</b> → OK</div>' +
        '<div style="text-align:right;margin-top:18px"><button style="padding:6px 18px;cursor:pointer">OK</button></div>';
      box.querySelector('button').onclick = () => document.body.removeChild(overlay);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    }
  }

  /// Read a picked zip and return the entries of the DESIGN BUNDLE inside
  /// it, whichever of the two things the user actually handed over:
  ///
  ///   a saved bundle      → its own entries, as they are
  ///   a generated sketch  → the entries of the bundle in its menujson/
  ///                         directory, unwrapped one level
  ///
  /// Only the layouts this app writes are recognised — nothing else:
  ///
  ///   a design bundle       <name>.pfodMenu_json    at the root
  ///                         dwgs/<dwg>.pfodDwg_json
  ///                         (Save Design — saveToFile.js)
  ///
  ///   a drawing bundle      <name>.pfodDwg_json     at the root
  ///                         dwgs/<dwg>.pfodDwg_json
  ///                         (Save Dwg — the drawing and everything it
  ///                         inserts; dwgControlsPanelUI.js)
  ///
  ///   a generated sketch    <name>/menujson/<name>_menuJson.zip
  ///                     or  <name>/menujson/<name>.pfodMenu_json
  ///                         (the bare json when the design links no
  ///                         drawings — see generateCode.js)
  ///
  /// A sketch is unwrapped so the user can hand over the whole thing
  /// without extracting `menujson/` first; a bundle is passed through.
  /// What the caller does with the entries is its own business — the
  /// design loader wants a menu json and fails without one, the drawings
  /// panel takes whatever drawings are there.
  ///
  /// Anything else returns an EMPTY list, and the caller reports that the
  /// zip held nothing it could use. In particular a sketch generated
  /// before the design moved into `menujson/` — its menu json and drawing
  /// jsons flat together in a `json/` directory — is no longer accepted.
  /// Loading it worked only because every entry was matched by file
  /// extension wherever it happened to sit, which quietly accepted any zip
  /// with the right-looking names in it. Re-generate such a sketch, or
  /// load the files out of it individually.
  ///
  /// One wrapping folder is tolerated, whatever it is called, and whatever
  /// else the zip tool left beside it — see _topDirs.
  ///
  /// @param {Uint8Array} bytes — the picked file
  /// @returns {Promise<Array<{path: string, data: Uint8Array}>>} the
  ///          bundle's own entries, or [] when the zip is not one of the
  ///          layouts above
  /// @throws whatever readZip throws on something that is not a zip at all
  async function readBundle(bytes) {
    const all = (await readZip(bytes)).filter((e) => !_isZipNoise(e.path));

    // Try the layouts at the root; if nothing matches, try again inside
    // each top-level directory. ONE level, and no more — that is what a zip
    // tool adds when the FOLDER is selected rather than its contents, and
    // it is as far as this can go without changing what the app accepts.
    //
    // Two levels would quietly reinstate the pre-menujson sketch layout,
    // whose design sat at <name>/json/<name>.pfodMenu_json — exactly two
    // down. That layout was dropped deliberately: it was only ever matched
    // by finding the right-looking extension wherever it happened to sit,
    // which accepted any zip at all with a likely name in it. Searching
    // two deep here would bring it back by the side door, and a user with
    // an old sketch would get a partial load — the design, none of its
    // drawings — instead of being told to re-generate.
    let level = [all];
    for (let depth = 0; depth <= 1; depth++) {
      for (const entries of level) {
        const hit = await _matchLayouts(entries);
        if (hit) return hit;
      }
      const next = [];
      level.forEach((entries) => {
        _topDirs(entries).forEach((dir) => next.push(_under(entries, dir)));
      });
      if (next.length === 0) break;
      level = next;
    }
    return [];
  }

  /// The bundle layouts, tried against one set of paths.
  /// @param {Array<{path: string, data: Uint8Array}>} entries
  /// @returns {Promise<Array|null>} the entries, or null if none matched
  async function _matchLayouts(entries) {
    // A sketch: the design is the one thing in menujson/, in whichever of
    // the two shapes it took.
    const nested = entries.find((e) => /(^|\/)menujson\/[^/]+\.zip$/i.test(e.path));
    if (nested) return readZip(nested.data);
    const bare = entries.filter((e) => /(^|\/)menujson\/[^/]+\.pfodMenu_json$/i.test(e.path));
    if (bare.length > 0) return bare;

    // Otherwise the zip must itself be a bundle: the design at its root,
    // its carried drawings under dwgs/. Matching on POSITION, not just
    // extension, is what makes that a real check rather than a guess about
    // any zip that happens to hold a json.
    const flat = entries.filter((e) => /^[^/]+\.pfodMenu_json$/i.test(e.path) ||
                                       /^dwgs\/[^/]+\.pfodDwg_json$/i.test(e.path));
    return flat.length > 0 ? flat : null;
  }

  /// Distinct first path segments, in the order they appear.
  ///
  /// Candidates rather than one shared prefix: a zip need not have a single
  /// top-level directory even when a wrapping folder is exactly what
  /// happened. macOS puts a __MACOSX/ tree beside whatever was compressed
  /// (filtered out below, but it is not the only such case), and a user who
  /// left a readme next to the folder before zipping has two as well. Every
  /// one of those has a real bundle inside one of its directories, so each
  /// is tried rather than the whole thing rejected for not being tidy.
  ///
  /// Only ever reached when nothing matched at the current level, which is
  /// what keeps this from misfiring: a bundle whose drawings all sit under
  /// `dwgs/` would otherwise be "unwrapped" into root-level files matching
  /// nothing.
  ///
  /// @param {Array<{path: string, data: Uint8Array}>} entries
  /// @returns {string[]} each with its trailing slash
  function _topDirs(entries) {
    const seen = [];
    entries.forEach((e) => {
      const slash = e.path.indexOf('/');
      if (slash < 0) return;
      const dir = e.path.slice(0, slash + 1);
      if (seen.indexOf(dir) === -1) seen.push(dir);
    });
    return seen;
  }

  /// The entries under `dir`, with that prefix removed.
  /// @param {Array<{path: string, data: Uint8Array}>} entries
  /// @param {string} dir — with its trailing slash
  /// @returns {Array<{path: string, data: Uint8Array}>}
  function _under(entries, dir) {
    return entries.filter((e) => e.path.startsWith(dir))
                  .map((e) => ({ path: e.path.slice(dir.length), data: e.data }));
  }

  /// Whether a zip member is packaging debris rather than a file the user
  /// put there.
  ///
  /// macOS Finder writes a `__MACOSX/` tree beside whatever it compressed,
  /// mirroring it with AppleDouble stubs named `._<original>`. Those stubs
  /// are resource-fork metadata, but `._Menu_1.pfodMenu_json` sits at the
  /// same position and carries the same extension as the real thing — so
  /// left in, one could be picked up AS the design and parsed as binary
  /// junk. Directory entries go too: a zero-length member whose name ends
  /// in `/` is not a file, and passing one on as an entry with empty
  /// content helps nobody.
  ///
  /// @param {string} p
  /// @returns {boolean}
  function _isZipNoise(p) {
    if (p.endsWith('/')) return true;                 // directory entry
    if (/(^|\/)__MACOSX\//.test(p)) return true;      // macOS metadata tree
    const base = p.split('/').pop();
    return base.startsWith('._') || base === '.DS_Store' || base === 'Thumbs.db';
  }

  /// Turn a readZip/readBundle failure into something the user can act on.
  ///
  /// STORE and DEFLATE both read now, which covers everything a user is
  /// realistically going to hand over — so what is left here is a genuinely
  /// odd file: bzip2, LZMA, an encrypted entry, or something that is not a
  /// zip at all. There is no repair to suggest for those, only a name for
  /// what happened, which is still better than the module-prefixed text.
  ///
  /// @param {Error} err — what readZip/readBundle threw
  /// @returns {string} one or two lines for a label or notice
  function explainReadFailure(err) {
    const msg = (err && err.message) || String(err);
    if (/unsupported compression method/i.test(msg)) {
      return 'It is compressed in a format pfodWeb cannot read. Stored and ' +
             'deflated zips both work — this is neither.\nRe-zip it with an ' +
             'ordinary zip tool, or re-save it from pfodWeb.';
    }
    // Anything else: the technical text, minus the module prefix nobody
    // outside this file needs.
    return msg.replace(/^\[DesignerZipBuilder\]\s*read(Zip|Bundle):\s*/, '');
  }

  return Object.freeze({ buildZip, readZip, readBundle, triggerDownload,
                         explainReadFailure });
})();
