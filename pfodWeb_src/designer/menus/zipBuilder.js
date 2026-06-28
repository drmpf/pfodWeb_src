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

  return Object.freeze({ buildZip, triggerDownload });
})();
