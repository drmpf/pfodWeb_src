// pfodWebServer.js — local test server that mimics how the ESP32 serves
// the build_data.bat / build_data.sh output (everything in ../data/ as .gz
// files, requested by the browser without the .gz extension).
//
// Run from this directory:
//   node pfodWebServer.js
//   → http://localhost:8080/                    (serves ../data/index.html uncompressed, which redirects to pfodWeb.html)
//   → http://localhost:8080/pfodWeb.html        (serves ../data/pfodWeb.html.gz)
//
// Each request first looks for <url>.gz in ../data/.  If found, the raw .gz
// bytes are returned with Content-Encoding: gzip so the browser decompresses
// transparently.  If no .gz exists (favicon.ico, version.js), the file is
// served plain.

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app      = express();
const PORT     = process.env.PORT || 8080;
const DATA_DIR = path.resolve(__dirname, '..', 'data');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js'  : 'application/javascript; charset=utf-8',
  '.css' : 'text/css; charset=utf-8',
  '.ico' : 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt' : 'text/plain; charset=utf-8'
};

app.get(/.*/, (req, res, next) => {
  const urlPath  = req.path === '/' ? '/index.html' : req.path;
  const filePath = path.join(DATA_DIR, urlPath);
  const gzPath   = filePath + '.gz';

  if (fs.existsSync(gzPath)) {
    const ext = path.extname(urlPath).toLowerCase();
    res.setHeader('Content-Type',     MIME[ext] || 'application/octet-stream');
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Cache-Control',    'no-cache');
    fs.createReadStream(gzPath).pipe(res);
    return;
  }
  next();
});

// Fallback: plain (uncompressed) files in ../data/ — favicon.ico, version.js
app.use(express.static(DATA_DIR));

app.listen(PORT, () => {
  console.log(`pfodWebServer serving ${DATA_DIR} on http://localhost:${PORT}`);
  console.log(`  http://localhost:${PORT}/                    → data/index.html (uncompressed, redirects to pfodWeb.html)`);
  console.log(`  http://localhost:${PORT}/pfodWeb.html        → data/pfodWeb.html.gz`);
});