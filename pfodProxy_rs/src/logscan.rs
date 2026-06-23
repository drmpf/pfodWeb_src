// logscan.rs
// (c)2026 Forward Computing and Control Pty. Ltd. — see LICENSE.
//
// Per-transport byte-stream log helper.  Sits in each reader task
// alongside the broadcast-channel send; consumes raw chunks and emits
// pretty per-cmd / per-csv-line debug log entries so the verbose log
// is readable rather than a wall of chunk dumps.
//
// Splitting rules (mirror what pfodWeb's `processReadBuffer` does on
// the browser side, but at a coarser granularity since this is
// just for logging):
//
//   * **Not inside a `{...}` block**: scan for the first of `{` or
//     `\n` (whichever comes first):
//       - `\n` first  → bytes up to and including the `\n` are a CSV
//                       line.  Emit as `<< {transport} csv "…"`.
//       - `{` first   → any bytes before it were a partial CSV line
//                       with no terminator (unusual — only happens
//                       if the device interleaves CSV mid-line);
//                       flush as `<< {transport} raw "…"` and enter
//                       pfod mode.
//
//   * **Inside a `{...}` block**: scan for the first `}`.  When
//     found, the block from `{` through `}` is a complete pfod cmd;
//     emit as `<< {transport} recv "{…}"` and leave pfod mode.
//     Embedded `\n` inside a pfod block is fine (pfod prompts can
//     carry newlines) — they're ignored until `}` closes.
//
// Bytes that don't yet form a complete record stay in `buf` until
// the next chunk supplies the missing `\n` or `}`.  Empty CSV lines
// (just `\r\n` or `\n`) are skipped to keep the log clean.

use crate::log;

pub struct LogScanner {
    /// Transport tag inserted into log lines: "serial" / "tcp" / "ble".
    transport: &'static str,
    /// Label that disambiguates the log line (e.g. "COM16" / "10.0.0.1:4989" / a BLE address).
    label: String,
    /// Accumulator across chunks — bytes here haven't completed a
    /// record yet.
    buf: Vec<u8>,
    /// True while we're between a `{` and a matching `}`.
    in_pfod: bool,
}

impl LogScanner {
    pub fn new(transport: &'static str, label: impl Into<String>) -> Self {
        Self {
            transport,
            label: label.into(),
            buf: Vec::with_capacity(1024),
            in_pfod: false,
        }
    }

    /// Append `bytes` to the internal accumulator and drain as many
    /// complete records (pfod blocks, CSV lines) as possible,
    /// emitting one debug log line each.  Anything that doesn't
    /// complete stays in `buf` for the next feed().
    pub fn feed(&mut self, bytes: &[u8]) {
        self.buf.extend_from_slice(bytes);

        loop {
            if self.in_pfod {
                // Look for the closing brace.
                match self.buf.iter().position(|b| *b == b'}') {
                    Some(idx) => {
                        // Bytes 0..=idx are the complete pfod block.
                        let block = &self.buf[..=idx];
                        log::debug(&format!(
                            "<< {} {} recv {:?}",
                            self.transport,
                            self.label,
                            String::from_utf8_lossy(block)
                        ));
                        self.buf.drain(..=idx);
                        self.in_pfod = false;
                    }
                    None => break,  // wait for more bytes
                }
            } else {
                // Find the next interesting byte — `{` opens pfod,
                // `\n` ends a CSV line.  Whichever comes first wins.
                let brace_at   = self.buf.iter().position(|b| *b == b'{');
                let newline_at = self.buf.iter().position(|b| *b == b'\n');

                match (brace_at, newline_at) {
                    // pfod-block boundary, with optional prefix
                    (Some(b), nl_opt) if nl_opt.map_or(true, |nl| b < nl) => {
                        if b > 0 {
                            let prefix = &self.buf[..b];
                            let text   = String::from_utf8_lossy(prefix);
                            let trimmed = text.trim_end_matches(['\r', '\n']);
                            if !trimmed.is_empty() {
                                log::debug(&format!(
                                    "<< {} {} raw {:?}",
                                    self.transport, self.label, trimmed
                                ));
                            }
                        }
                        self.buf.drain(..b);
                        self.in_pfod = true;
                    }
                    // CSV line — newline reached before any `{`
                    (_, Some(nl)) => {
                        let line = &self.buf[..=nl];
                        let text = String::from_utf8_lossy(line);
                        let trimmed = text.trim_end_matches(['\r', '\n']);
                        if !trimmed.is_empty() {
                            log::debug(&format!(
                                "<< {} {} csv {:?}",
                                self.transport, self.label, trimmed
                            ));
                        }
                        self.buf.drain(..=nl);
                    }
                    // No interesting byte yet — wait for more.
                    (None, None) => break,
                    // Unreachable: the first arm covers (Some, *), this
                    // branch matches (None, Some) which the second
                    // arm already handles.  Keeping the compiler happy.
                    _ => break,
                }
            }
        }
    }
}
