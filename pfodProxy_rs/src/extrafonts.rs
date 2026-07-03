// extrafonts.rs
// (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
//
// Serves files (the CSS itself, and its font files) from a
// caller-specified extraFonts/ directory so pfodWeb.html opened via
// file:// can still load the optional Cyrillic/Greek/etc. font subsets
// described in docs/pfodWeb-extraFonts-guide.html -- @font-face src
// url() fetches are always CORS-mode per the Font Loading spec, and
// file: isn't an allowed scheme for CORS-mode fetches, so a file://
// page can never load them directly from disk (the CSS file itself
// loads fine over file:// via a plain <link>, but reading/rewriting
// its parsed @font-face rules via the CSSOM throws a SecurityError in
// Chromium for this subdirectory case -- confirmed by testing -- so
// pfodWeb.html's JS instead just swaps the <link>'s href to point here
// for the whole CSS file, letting the browser do its own normal
// http:// fetch + parse + relative-URL resolution for the @font-face
// references inside, same as it would for any other stylesheet).
// extraFonts/ and pfodweb-extra-fonts.css on disk are never modified.
//
// Reached via two route shapes in main.rs:
//   GET /extraFonts/:dir/:filename
//   GET /extraFonts_pw/:pw/:dir/:filename
//
// The caller-supplied `dir` is inherently untrusted -- pfodProxy has no
// other way to know where a given pfodWeb.html's extraFonts/ folder
// lives, since they're distributed independently. Validation below
// narrows what that trust can be abused for:
//   - `dir` must be an absolute path
//   - `dir`'s final path component must be exactly "extraFonts"
//   - no ".." segments in `dir`, and `filename` may not contain a path
//     separator at all
//   - `filename`'s extension must be a known font extension, or .css
//   - font files' content must start with that format's magic bytes.
//     Plain text has no such signature, so .css is instead restricted
//     to the one exact filename this feature actually needs
//     (pfodweb-extra-fonts.css) -- not a secret (it's named in the
//     public extraFonts guide), just narrowing what can be requested
//     to exactly the one legitimate file rather than any arbitrary
//     name, since "is this valid UTF-8" alone doesn't meaningfully
//     distinguish a real CSS file from any other text file someone
//     might rename to end in .css.
// Even in the worst case (a forged request pointed at an unrelated
// directory that happens to be named "extraFonts"), those checks mean
// only genuine font-shaped bytes, or that one specific CSS file, can
// ever be returned -- never arbitrary file content with a spoofed
// extension.

use axum::{
    http::{HeaderMap, HeaderValue, StatusCode},
    response::IntoResponse,
};
use std::path::Path;

/// The only filename ever served for the .css case -- see the module
/// doc comment above for why this is restricted rather than accepting
/// any *.css name.
const EXPECTED_CSS_FILENAME: &str = "pfodweb-extra-fonts.css";

/// Extension (lowercased, no dot) -> (Content-Type, expected magic
/// bytes). `None` magic bytes means "no universal signature to check"
/// (currently just .css, restricted instead to EXPECTED_CSS_FILENAME).
fn file_type(ext: &str) -> Option<(&'static str, Option<&'static [u8]>)> {
    match ext {
        "css"   => Some(("text/css; charset=utf-8", None)),
        "woff2" => Some(("font/woff2", Some(b"wOF2"))),
        "woff"  => Some(("font/woff",  Some(b"wOFF"))),
        "otf"   => Some(("font/otf",   Some(b"OTTO"))),
        "ttf"   => Some(("font/ttf",   Some(&[0x00, 0x01, 0x00, 0x00]))),
        _ => None,
    }
}

pub async fn handle(dir: &str, file: &str) -> axum::response::Response {
    if dir.is_empty() || file.is_empty() {
        return crate::validate::hang_silently("extraFonts: missing dir or file").await;
    }
    if dir.split(['/', '\\']).any(|seg| seg == "..") || file.contains(['/', '\\']) {
        return crate::validate::hang_silently("extraFonts: path traversal attempt").await;
    }

    let dir_path = Path::new(dir);
    if !dir_path.is_absolute() {
        return crate::validate::hang_silently("extraFonts: dir must be absolute").await;
    }
    if dir_path.file_name().and_then(|n| n.to_str()) != Some("extraFonts") {
        return crate::validate::hang_silently("extraFonts: dir must be named 'extraFonts'").await;
    }

    let ext = Path::new(file)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if ext == "css" && file != EXPECTED_CSS_FILENAME {
        return crate::validate::hang_silently(
            &format!("extraFonts: .css requests must be exactly {EXPECTED_CSS_FILENAME:?}")
        ).await;
    }
    let Some((content_type, magic)) = file_type(&ext) else {
        return crate::validate::hang_silently(&format!("extraFonts: unsupported extension {ext:?}")).await;
    };

    // Unlike every other rejection in this function, a missing file
    // here is a normal, expected, documented outcome -- deleting
    // extraFonts/ entirely is an explicitly supported way to opt out
    // of these fonts (see the extraFonts guide) -- not a sign of a
    // malformed/forged request. A plain fast 404 matches the
    // pre-existing "missing file falls back to system font, no fuss"
    // behaviour; hang_silently()'s 2-minute stall here was starving
    // the browser's limited per-origin connection pool and made
    // pfodWeb wrongly report pfodProxy as unreachable.
    let bytes = match tokio::fs::read(dir_path.join(file)).await {
        Ok(b) => b,
        Err(_) => {
            crate::log::debug(&format!("[pfodProxy] extraFonts: file not found: {}", dir_path.join(file).display()));
            return (StatusCode::NOT_FOUND, "not found").into_response();
        }
    };

    let content_ok = match magic {
        Some(sig) => bytes.starts_with(sig),
        None => std::str::from_utf8(&bytes).is_ok(),
    };
    if !content_ok {
        return crate::validate::hang_silently(
            "extraFonts: file content doesn't match expected format"
        ).await;
    }

    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", HeaderValue::from_static(content_type));
    (StatusCode::OK, headers, bytes).into_response()
}
