/*
   csvCollector.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Exports:    window.CSVCollector class
// Depends on: nothing (pure data collector, no DOM or other module dependencies)
// Called by:  connectionManager.js feeds characters via processCharacters();
//             keepAliveAndHttp.js creates window.csvCollector instance;
//             chartDisplay.js and chartAndRawData.js read data via window.csvCollector

/**
 * CSVCollector - Processes raw character stream to extract CSV data
 * Operates independently from message fragmentation
 *
 * CSV Data Detection:
 * - Starts after } (closing brace of pfod command) or after line terminator
 * - Ends at line terminator (\r, \n, or \r\n)
 * - Ignored inside {} (pfod commands)
 *
 * Organization:
 * - Separated into files by field count (# of commas + 1)
 * - Each CSV line stored with UTC arrival timestamp (ms since epoch)
 * - Timestamps NOT included in default export, available in 3 timestamp formats:
 *   * ms values (milliseconds since epoch)
 *   * Z timestamps (UTC ISO 8601)
 *   * Local time (browser local timezone)
 */
class CSVCollector {
  constructor() {
    this.csvByFieldCount = {}; // { fieldCount: [{line: "...", timestampMs: 1731693045123}, ...], ... }
    this.currentLine = '';     // Buffer for the current CSV line being built
                               // (only OUTSIDE bytes reach here; the
                               // connection layer owns {..} framing).

    // Per-fieldCount time anchor used by chartDisplay's TimeFormatUtil to
    // turn relative (< 2^40 ms) timestamps into wall-clock dates in place
    // of the pfod {@} response (which pfodWeb does not send).
    //
    // Each entry pairs:
    //   firstLineMs    — parsed numeric value of field[0] of the first
    //                    PARSEABLE line of this fieldCount.  field[0] is
    //                    assumed to be the X-axis (the typical layout for
    //                    streaming time-series CSVs).  Header rows that
    //                    don't parse as numeric / date are skipped.
    //   firstLineTimeMs — Date.now() when that same parseable line arrived.
    //
    // chartDisplay computes baseTimeMs = firstLineTimeMs - firstLineMs
    // and passes it to TimeFormatUtil; adding any later line's ms then
    // gives that line's wall-clock time, with the first parseable line
    // mapping exactly to its arrival instant.
    //
    // Cleared by clear() on reconnect so each session captures its own.
    this.firstAnchors = {};    // { fieldCount: {firstLineMs, firstLineTimeMs} }
    // console.log('[CSV_COLLECTOR Created - character-stream CSV extraction');
  }

  /**
   * Process a string character-by-character from raw device data
   * Called from SerialConnection.startReading() and BLEConnection.handleCharacteristicChange()
   * BEFORE message fragmentation for { } extraction
   * @param {string} text - Raw text from device
   */
  processCharacters(text) {
    for (let i = 0; i < text.length; i++) {
      this.processChar(text[i]);
    }
  }

  /**
   * Process a single character from the raw stream
   * @param {string} char - Single character
   */
  processChar(char) {
    // The connection-layer OUTSIDE/INSIDE byte state machine now owns all
    // {..} command framing — this collector is only ever handed OUTSIDE
    // (raw) bytes, never command bytes.  So no brace tracking here: a CSV
    // line is just text terminated by \r/\n.  The connection layer calls
    // resetLine() at every OUTSIDE->INSIDE boundary so a partial line
    // interrupted by a {..} command is discarded (raw-only), never glued to
    // the post-command bytes.
    if (char === '\r' || char === '\n') {
      if (this.currentLine.trim().length > 0) {
        this.addCSVLine(this.currentLine.trim());
      }
      this.currentLine = '';
      return;
    }
    this.currentLine += char;
  }

  /**
   * Discard the in-progress (non-newline-terminated) CSV line WITHOUT
   * emitting it.  Called by the connection-layer byte machine at every
   * OUTSIDE->INSIDE transition: bytes accumulated before a {..} command are
   * raw data only (already sent to rawData/messageCollector) and must never
   * become a CSV line nor concatenate with the bytes that follow the command.
   */
  resetLine() {
    this.currentLine = '';
  }

  /**
   * Add a complete CSV line to the appropriate bucket based on field count
   * Captures UTC arrival timestamp (ms since epoch)
   * @param {string} line - The complete CSV line (trimmed)
   */
  addCSVLine(line) {
    // Count fields: # of commas + 1
    const fields = line.split(',');
    const fieldCount = fields.length;

    // Initialize bucket if needed
    if (!this.csvByFieldCount[fieldCount]) {
      this.csvByFieldCount[fieldCount] = [];
      // console.log('[CSV_COLLECTOR New CSV format detected: ${fieldCount} fields`);
    }

    // Store line with arrival timestamp (ms since epoch)
    const timestampMs = Date.now();
    this.csvByFieldCount[fieldCount].push({
      line: line,
      timestampMs: timestampMs
    });

    // Capture this fieldCount's time anchor on the first parseable line.
    // Header rows whose first field doesn't parse (e.g. "date") are
    // skipped — the next line that parses sets the anchor.  Once set
    // for a given fieldCount, the anchor is sticky for the session.
    if (this.firstAnchors[fieldCount] === undefined) {
      const firstLineMs = this._parseAnchorValue(fields[0]);
      if (!isNaN(firstLineMs)) {
        this.firstAnchors[fieldCount] = {
          firstLineMs: firstLineMs,
          firstLineTimeMs: timestampMs
        };
      }
    }
    // console.log('[CSV_COLLECTOR Added line (${fieldCount} fields): ${line.substring(0, 60)}${line.length > 60 ? '...' : ''}`);
  }

  /**
   * Parse a CSV X-field (field[0]) for the time-anchor calculation.
   * Mirrors chartDisplay's TimeFormatUtil.parseValue() — kept inline so
   * CSVCollector doesn't depend on chartDisplay's bundle-load order.
   *
   * Returns NaN for unparseable input.  Numeric strings → parseFloat.
   * yyyy/MM/dd[ HH:mm[:ss[.SSS]]] / ISO-8601 → ms since epoch.
   *
   * @private
   */
  _parseAnchorValue(str) {
    if (str === null || str === undefined) return NaN;
    const trimmed = String(str).trim();
    if (trimmed === '') return NaN;
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return parseFloat(trimmed);
    const m = trimmed.match(
      /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,3}))?)?)?$/
    );
    if (m) {
      const y  = parseInt(m[1], 10);
      const mo = parseInt(m[2], 10) - 1;
      const d  = parseInt(m[3], 10);
      const h  = m[4] !== undefined ? parseInt(m[4], 10) : 0;
      const mi = m[5] !== undefined ? parseInt(m[5], 10) : 0;
      const s  = m[6] !== undefined ? parseInt(m[6], 10) : 0;
      const ms = m[7] !== undefined ? parseInt((m[7] + '000').substring(0, 3), 10) : 0;
      return new Date(y, mo, d, h, mi, s, ms).getTime();
    }
    const native = Date.parse(trimmed);
    if (!isNaN(native)) return native;
    return NaN;
  }

  /**
   * Get all field counts that have been collected
   * @returns {array} - Sorted array of field counts
   */
  getFieldCounts() {
    return Object.keys(this.csvByFieldCount)
      .map(k => parseInt(k))
      .sort((a, b) => a - b);
  }

  /**
   * Get CSV lines for a specific field count
   * @param {number} fieldCount - Number of fields
   * @returns {array} - Array of CSV line strings
   */
  getCSVLines(fieldCount) {
    if (!(fieldCount in this.csvByFieldCount)) {
      throw new Error(`[CSV_COLLECTOR] getCSVLines: no data collected for fieldCount ${fieldCount}`);
    }
    return this.csvByFieldCount[fieldCount].map(entry => entry.line);
  }

  /**
   * Get CSV entries (line + timestamp) for a specific field count
   * @param {number} fieldCount - Number of fields
   * @returns {array} - Array of {line, timestampMs} objects
   */
  getCSVEntriesWithTimestamps(fieldCount) {
    if (!(fieldCount in this.csvByFieldCount)) {
      throw new Error(`[CSV_COLLECTOR] getCSVEntriesWithTimestamps: no data collected for fieldCount ${fieldCount}`);
    }
    return this.csvByFieldCount[fieldCount];
  }

  /**
   * Get number of lines for a specific field count
   * @param {number} fieldCount - Number of fields
   * @returns {number} - Line count
   */
  getLineCount(fieldCount) {
    return this.getCSVLines(fieldCount).length;
  }

  /**
   * Export CSV data for a specific field count as plain text (DEFAULT - no timestamps)
   * Format: Line1\nLine2\nLine3...
   * NO timestamps, headers, or other metadata - just CSV lines
   * @param {number} fieldCount - Number of fields
   * @returns {string} - Plain text CSV data without timestamps
   */
  exportAsText(fieldCount) {
    const lines = this.getCSVLines(fieldCount);
    return lines.length > 0 ? lines.join('\n') : '';
  }

  /**
   * Export CSV data with ms timestamps prepended
   * Format: timestampMs,field1,field2...\ntimestampMs,field1,field2...
   * @param {number} fieldCount - Number of fields
   * @returns {string} - CSV data with ms timestamps as first column
   */
  exportAsTextWithMs(fieldCount) {
    const entries = this.getCSVEntriesWithTimestamps(fieldCount);
    if (entries.length === 0) return '';
    return entries.map(entry => {
      return `${entry.timestampMs},${entry.line}`;
    }).join('\n');
  }

  /**
   * Export CSV data with UTC Z timestamps prepended
   * Format: 2025-11-15T14:30:45.123Z,field1,field2...\n...
   * @param {number} fieldCount - Number of fields
   * @returns {string} - CSV data with Z timestamps (UTC) as first column
   */
  exportAsTextWithZTimestamps(fieldCount) {
    const entries = this.getCSVEntriesWithTimestamps(fieldCount);
    if (entries.length === 0) return '';
    return entries.map(entry => {
      const timestamp = new Date(entry.timestampMs).toISOString();
      return `${timestamp},${entry.line}`;
    }).join('\n');
  }

  /**
   * Export CSV data with local time timestamps prepended
   * Format: 2025-11-15 14:30:45.123,field1,field2...\n...
   * @param {number} fieldCount - Number of fields
   * @returns {string} - CSV data with local time timestamps as first column
   */
  exportAsTextWithLocalTimestamps(fieldCount) {
    const entries = this.getCSVEntriesWithTimestamps(fieldCount);
    if (entries.length === 0) return '';
    return entries.map(entry => {
      const date = new Date(entry.timestampMs);
      // Format: YYYY-MM-DD HH:MM:SS.mmm (local time)
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      const ms = String(date.getMilliseconds()).padStart(3, '0');
      const localTimestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
      return `${localTimestamp},${entry.line}`;
    }).join('\n');
  }

  /**
   * Export all CSV data organized by field count
   * @returns {object} - { fieldCount: "line1\nline2\n...", ... }
   */
  exportAll() {
    const result = {};
    for (const fieldCount of this.getFieldCounts()) {
      const text = this.exportAsText(fieldCount);
      if (text.length > 0) {
        result[fieldCount] = text;
      }
    }
    return result;
  }

  /**
   * Get statistics about collected CSV data
   * @returns {object} - Stats by field count
   */
  getStats() {
    const stats = {};
    for (const fieldCount of this.getFieldCounts()) {
      const lines = this.getCSVLines(fieldCount);
      stats[fieldCount] = {
        fieldCount: fieldCount,
        lineCount: lines.length,
        totalBytes: lines.reduce((sum, line) => sum + line.length, 0)
      };
    }
    return stats;
  }

  /**
   * Get total statistics
   * @returns {object} - Total counts
   */
  getTotalStats() {
    const stats = this.getStats();
    let totalLines = 0;
    let totalBytes = 0;
    for (const fieldCount of this.getFieldCounts()) {
      totalLines += stats[fieldCount].lineCount;
      totalBytes += stats[fieldCount].totalBytes;
    }
    return {
      totalLines: totalLines,
      totalBytes: totalBytes,
      formatCount: Object.keys(stats).length
    };
  }

  /**
   * Clear all collected CSV data
   */
  clear() {
    this.csvByFieldCount = {};
    this.currentLine = '';
    // Reset per-fieldCount anchors so a fresh session captures its own.
    this.firstAnchors = {};
    // console.log('[CSV_COLLECTOR Cleared all CSV data');
  }
}

// Make class available globally for browser use
window.CSVCollector = CSVCollector;
