/*
   chartDisplay.js
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

// Exports:    window.ChartDisplay class
// Depends on: jsfreechart library (JSFreeChart, Charts, LinearAxis, XYPlot, etc. — loaded before
//             this file in bundle), window.csvCollector (loadCSVData reads CSV lines)
// Called by:  keepAliveAndHttp.js initializeMessageViewer (new ChartDisplay() → window.chartDisplay),
//             chartAndRawData.js (all chart display operations via window.chartDisplay),
//             messageViewer.js ChartConfigViewer (applyChartCommand, populate)

/**
 * TimeFormatter - Implements jsfc.Format interface for time values
 * Wraps TimeFormatUtil to provide format() method compatible with jsfreechart
 */
class TimeFormatter {
  constructor(timeFormatUtil) {
    this.timeFormatter = timeFormatUtil;
  }

  format(value) {
    return this.timeFormatter.format(value);
  }
}

/**
 * TimeFormatUtil - Formats millisecond timestamps according to specified formats
 * Supports elapsed time formats (ss, mm:ss, HH:mm:ss, d HH:mm:ss)
 * and Java SimpleDateFormat patterns (yyyy/MM/dd, etc)
 */
class TimeFormatUtil {
  /**
   * @param {string} formatString  Java SimpleDateFormat or elapsed-time pattern,
   *                               optionally suffixed with " UTC" or " DATE".
   * @param {number} [baseTimeMs]  Local-time anchor used for relative-ms
   *                               timestamps (< 2^40 ms).  Replaces the {@}
   *                               reference, which pfodWeb does not send.
   *                               Caller should pass csvCollector.firstLineTimeMs.
   *                               If null/undefined, format() falls back to
   *                               Date.now() at render time (legacy behaviour).
   */
  constructor(formatString, baseTimeMs = null) {
    this.formatString = formatString;
    this.baseTimeMs = baseTimeMs;
    this.isUTC = false;
    // Set when "UTC" or "DATE" trailing suffix forces an otherwise-elapsed
    // pattern (e.g. "HH:mm:ss") to be reinterpreted as a Java SimpleDateFormat
    // pattern rendering a wall-clock time.  Per pfod spec.
    this.forceDateFormat = false;

    let workingFormat = formatString;
    if (workingFormat) {
      const upper = workingFormat.toUpperCase();
      if (upper.endsWith('UTC')) {
        this.isUTC = true;
        this.forceDateFormat = true;
        workingFormat = workingFormat.substring(0, workingFormat.length - 3).trim();
      } else if (upper.endsWith('DATE')) {
        this.forceDateFormat = true;
        workingFormat = workingFormat.substring(0, workingFormat.length - 4).trim();
      }
    }

    // Extract decimal places before normalizing the format
    this.decimalPlaces = 0;
    const decimalMatch = workingFormat && workingFormat.match(/\.S+$/);
    if (decimalMatch) {
      this.decimalPlaces = decimalMatch[0].length - 1; // Count S's
      // Remove decimal specification for base format matching
      workingFormat = workingFormat.substring(0, workingFormat.length - decimalMatch[0].length).trim();
    }

    this.baseFormat = workingFormat;
    this.isSpecialFormat = this.checkIsSpecialFormat(this.baseFormat);
    // forceDateFormat (UTC / DATE suffix) overrides elapsed-pattern detection
    // so e.g. "HH:mm:ss UTC" renders as wall-clock UTC, not elapsed time.
    this.isElapsedFormat = !this.forceDateFormat
                        && !this.isSpecialFormat
                        && this.isElapsedTimeFormat(this.baseFormat);
    this.dateFormatter = (!this.isElapsedFormat && !this.isSpecialFormat)
                        ? this.createDateFormatter(this.baseFormat) : null;
  }

  /**
   * Check if format is an elapsed time format (ss, mm:ss, HH:mm:ss, d HH:mm:ss)
   */
  isElapsedTimeFormat(format) {
    if (!format) throw new Error(`[CHART_DISPLAY] isElapsedTimeFormat: format is required`);
    const normalized = format.replace(/\.S+$/, ''); // Remove decimal places
    return /^(ss|mm:ss|HH:mm:ss|d\s+HH:mm:ss)$/.test(normalized);
  }

  /**
   * Check if format is a special display format handled before pattern matching:
   *   ms          - display raw value as integer milliseconds
   *   unix-dt     - unix timestamp (ms) → "YYYY Mon DD HH:mm:ss"
   *   unix-ddd-hm - unix timestamp (ms) → "DDD HH:mm"
   *   unix-ddd-hms- unix timestamp (ms) → "DDD HH:mm:ss"
   */
  checkIsSpecialFormat(format) {
    return format === 'ms' || format === 'unix-dt' || format === 'unix-ddd-hm' || format === 'unix-ddd-hms';
  }

  /**
   * Create a date formatter from Java SimpleDateFormat pattern
   */
  createDateFormatter(format) {
    if (!format) throw new Error(`[CHART_DISPLAY] createDateFormatter: format is required`);
    return {
      pattern: format,
      // Map common patterns to methods
      formatDate: (ms) => this.formatDateByPattern(ms, format)
    };
  }

  /**
   * Parse a CSV X-axis value string into a numeric value.
   *
   * Behaviour matches pfodApp's raw-data interpretation:
   *   - Plain numeric strings ("1234", "1234.5") → returned via parseFloat.
   *     For elapsed-time formats these are seconds; for absolute date/time
   *     formats they are millisecond timestamps (interpreted by format()
   *     against the 2^40 ms threshold to decide relative vs absolute).
   *   - Absolute date/time strings using Java SimpleDateFormat-like patterns
   *     are auto-detected and converted to milliseconds since 1970-01-01:
   *       "2019/03/31"
   *       "2019/03/31 00:35:01"
   *       "2019-03-31T00:35:01"          (ISO 8601 separator)
   *       "2019-03-31T00:35:01.123"      (with millis)
   *
   * If the chart's format string ends with "UTC" the absolute date is
   * interpreted as UTC (matching the DISPLAY side); otherwise local time.
   *
   * Returns NaN for unparseable input.
   *
   * @param {string} str           - CSV field value
   * @param {string} [formatString] - Chart time format (used only to detect UTC suffix)
   * @returns {number} numeric value (ms since epoch for absolute dates, else raw number)
   */
  /**
   * Quick check — does the string look like an absolute date (yyyy/MM/dd
   * or yyyy-MM-dd, optionally with time)?  Used by chart-display callers
   * to detect when the X-axis column contains date strings so a default
   * date formatter can be installed even if the chart cmd omits a
   * ~timeFormat plot option.  Same regex as parseValue() uses to
   * detect absolute dates.
   *
   * @param {string} str
   * @returns {boolean}
   */
  static isDateLikeString(str) {
    if (str === null || str === undefined) return false;
    const trimmed = String(str).trim();
    if (trimmed === '') return false;
    return /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,3}))?)?)?$/
      .test(trimmed);
  }

  static parseValue(str, formatString) {
    if (str === null || str === undefined) return NaN;
    const trimmed = String(str).trim();
    if (trimmed === '') return NaN;

    // Plain numeric (millisecond timestamp or elapsed seconds — caller decides)
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      return parseFloat(trimmed);
    }

    // Absolute date/time: yyyy{/-}MM{/-}dd[ T HH:mm[:ss[.SSS]]]
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
      const isUTC = !!formatString && formatString.toUpperCase().endsWith('UTC');
      return isUTC ? Date.UTC(y, mo, d, h, mi, s, ms)
                   : new Date(y, mo, d, h, mi, s, ms).getTime();
    }

    // Native Date.parse fallback (handles full ISO 8601 with timezone, RFC 2822 etc)
    const native = Date.parse(trimmed);
    if (!isNaN(native)) return native;

    // Last resort — leading numeric prefix (preserves prior behaviour for partly-numeric strings)
    return parseFloat(trimmed);
  }

  /**
   * Format millisecond timestamp according to the specified format
   */
  format(ms) {
    if (ms === null || ms === undefined) return '';

    const timestamp = parseFloat(ms);
    if (isNaN(timestamp)) return String(ms);

    // 'ms' format: raw integer milliseconds, no conversion.
    if (this.baseFormat === 'ms') {
      return String(Math.round(timestamp));
    }

    // Elapsed-time patterns: render the ms value directly as a duration.
    if (this.isElapsedFormat) {
      return this.formatElapsedTime(timestamp);
    }

    // Calendar paths (unix-* presets and Java SimpleDateFormat patterns)
    // share the relative-time anchor.
    //
    //   THRESHOLD: < 2^40 ms ≈ Nov 2004 UTC.  Values below it are treated
    //   as relative offsets (typical device-uptime / since-stream-start).
    //   Values >= 2^40 are absolute ms-since-epoch and rendered as-is.
    //
    //   For relative values, this.baseTimeMs is precomputed by chartDisplay
    //   as
    //       firstLineTimeMs - firstLineMs
    //   where firstLineMs and firstLineTimeMs are captured from the first
    //   parseable CSV line — its X-field value and its arrival Date.now()
    //   respectively.  Adding lineMs gives back firstLineTimeMs for the
    //   first line (so it maps to its arrival instant) and shifts every
    //   subsequent line by (lineMs - firstLineMs) from that anchor.
    //
    //   No fallback: if baseTimeMs isn't set we leave the timestamp
    //   unmodified.  Small ms values then render as 1970-era dates,
    //   which is a clear signal that the anchor wasn't plumbed through —
    //   better than silently shifting against today's clock and looking
    //   correct.
    const THRESHOLD = Math.pow(2, 40);
    const isRelativeTime = Math.abs(timestamp) < THRESHOLD;
    let actualTime = timestamp;
    if (isRelativeTime
     && this.baseTimeMs !== null
     && this.baseTimeMs !== undefined) {
      actualTime = this.baseTimeMs + timestamp;
    }

    // unix-* presets: render via day-of-week / month / etc helper.
    if (this.baseFormat === 'unix-dt'
     || this.baseFormat === 'unix-ddd-hm'
     || this.baseFormat === 'unix-ddd-hms') {
      return this.formatUnixMs(actualTime, this.baseFormat);
    }

    // Java SimpleDateFormat pattern.
    if (this.dateFormatter) {
      return this.dateFormatter.formatDate(actualTime);
    }

    // No format specified — return raw value.
    return String(timestamp);
  }

  /**
   * Format elapsed time in various formats
   */
  formatElapsedTime(ms) {
    const absMs = Math.abs(ms);
    const sign = ms < 0 ? '-' : '';

    // Convert to seconds and extract components
    let totalSeconds = absMs / 1000;
    let days = Math.floor(totalSeconds / 86400);
    let hours = Math.floor((totalSeconds % 86400) / 3600);
    let minutes = Math.floor((totalSeconds % 3600) / 60);
    let seconds = totalSeconds % 60;

    // Format based on pattern
    switch (this.baseFormat) {
      case 'ss':
        return sign + this.formatNumber(totalSeconds, this.decimalPlaces);

      case 'mm:ss': {
        const totalMins = Math.floor(totalSeconds / 60);
        const secsStr = this.decimalPlaces > 0
          ? (() => { const s = seconds.toFixed(this.decimalPlaces); const d = s.indexOf('.'); return s.substring(0, d).padStart(2, '0') + s.substring(d); })()
          : this.padZero(seconds);
        return sign + totalMins + ':' + secsStr;
      }

      case 'HH:mm:ss': {
        const totalHours = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secsStr2 = this.decimalPlaces > 0
          ? (() => { const s = seconds.toFixed(this.decimalPlaces); const d = s.indexOf('.'); return s.substring(0, d).padStart(2, '0') + s.substring(d); })()
          : this.padZero(seconds);
        return sign + totalHours + ':' + this.padZero(mins) + ':' + secsStr2;
      }

      case 'd HH:mm:ss': {
        const hoursPart = Math.floor((totalSeconds % 86400) / 3600);
        const minsPart = Math.floor((totalSeconds % 3600) / 60);
        const secsStr3 = this.decimalPlaces > 0
          ? (() => { const s = seconds.toFixed(this.decimalPlaces); const d = s.indexOf('.'); return s.substring(0, d).padStart(2, '0') + s.substring(d); })()
          : this.padZero(seconds);
        return sign + days + 'd ' + this.padZero(hoursPart) + ':' + this.padZero(minsPart) + ':' + secsStr3;
      }

      default:
        return String(ms);
    }
  }

  /**
   * Format a unix timestamp (milliseconds since epoch) into a human-readable
   * date/time string.  Matches the rest of the pfodWeb chart pipeline —
   * everything else also operates on ms — so the value is fed straight into
   * the Date constructor without a seconds-to-ms conversion.
   *
   * @param {number} epochMs - Unix timestamp in milliseconds
   * @param {string} format - 'unix-dt', 'unix-ddd-hm', or 'unix-ddd-hms'
   * @returns {string} - Formatted date/time label
   */
  formatUnixMs(epochMs, format) {
    const date = new Date(epochMs);
    const DAYS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const ddd = DAYS[date.getDay()];
    const mon = MONTHS[date.getMonth()];
    const yyyy = date.getFullYear();
    const dd   = this.padZero(date.getDate());
    const HH   = this.padZero(date.getHours());
    const mm   = this.padZero(date.getMinutes());
    const ss   = this.padZero(date.getSeconds());
    switch (format) {
      case 'unix-dt':      return `${yyyy} ${mon} ${dd} ${HH}:${mm}:${ss}`;
      case 'unix-ddd-hm':  return `${ddd} ${HH}:${mm}`;
      case 'unix-ddd-hms': return `${ddd} ${HH}:${mm}:${ss}`;
      default:             return String(date);
    }
  }

  /**
   * Format a millisecond timestamp using a Java SimpleDateFormat-style pattern.
   *
   * Supported tokens (consecutive letters of the same kind form one token):
   *   y, yy, yyyy           — year (last 2 digits / 4 digits)
   *   M, MM                 — month number (no pad / zero-padded)
   *   MMM                   — month abbreviation ("Jan")
   *   MMMM                  — full month name ("January")
   *   d, dd                 — day-of-month
   *   E, EE, EEE            — day-of-week abbreviation ("Mon")
   *   EEEE                  — full day-of-week name ("Monday")
   *   H, HH                 — hour 0-23
   *   h, hh                 — hour 1-12
   *   m, mm                 — minute
   *   s, ss                 — second
   *   S, SS, SSS            — millisecond (truncated to width)
   *   a                     — AM / PM
   *
   * Single-quoted runs are emitted literally; '' is an escaped single quote.
   * Unrecognized letter tokens pass through unchanged.
   * UTC vs local time follows this.isUTC (set from the trailing "UTC" suffix
   * on the format string).
   */
  formatDateByPattern(ms, pattern) {
    const date = new Date(ms);
    const utc  = this.isUTC;

    const year   = utc ? date.getUTCFullYear()      : date.getFullYear();
    const month  = utc ? date.getUTCMonth()         : date.getMonth();      // 0-11
    const day    = utc ? date.getUTCDate()          : date.getDate();
    const dow    = utc ? date.getUTCDay()           : date.getDay();        // 0=Sun
    const hour24 = utc ? date.getUTCHours()         : date.getHours();
    const minute = utc ? date.getUTCMinutes()       : date.getMinutes();
    const second = utc ? date.getUTCSeconds()       : date.getSeconds();
    const millis = utc ? date.getUTCMilliseconds()  : date.getMilliseconds();

    const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const MONTHS_LONG  = ['January','February','March','April','May','June',
                          'July','August','September','October','November','December'];
    const DAYS_SHORT   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const DAYS_LONG    = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

    const pad = (n, w) => String(n).padStart(w, '0');

    const renderToken = (ch, len) => {
      switch (ch) {
        case 'y':
          if (len === 2) return pad(year % 100, 2);
          return pad(year, len);                    // y / yyyy / longer
        case 'M':
          if (len === 1) return String(month + 1);
          if (len === 2) return pad(month + 1, 2);
          if (len === 3) return MONTHS_SHORT[month];
          return MONTHS_LONG[month];                // 4+
        case 'd':
          return pad(day, len);
        case 'E':
          return len >= 4 ? DAYS_LONG[dow] : DAYS_SHORT[dow];
        case 'H':
          return pad(hour24, len);
        case 'h': {
          const h12 = ((hour24 + 11) % 12) + 1;     // 1..12
          return pad(h12, len);
        }
        case 'm':
          return pad(minute, len);
        case 's':
          return pad(second, len);
        case 'S':
          return pad(millis, 3).substring(0, len);  // truncate to width
        case 'a':
          return hour24 < 12 ? 'AM' : 'PM';
        default:
          return ch.repeat(len);                    // unknown — pass through
      }
    };

    // Walk the pattern, grouping runs of the same letter and honouring '...' quoted literals.
    let out = '';
    let i = 0;
    while (i < pattern.length) {
      const c = pattern.charAt(i);

      if (c === "'") {
        // Quoted literal.  '' inside a quoted run = literal ', and '' alone = literal '
        if (i + 1 < pattern.length && pattern.charAt(i + 1) === "'") {
          out += "'";
          i += 2;
          continue;
        }
        i++; // skip opening quote
        while (i < pattern.length) {
          const q = pattern.charAt(i);
          if (q === "'") {
            if (i + 1 < pattern.length && pattern.charAt(i + 1) === "'") {
              out += "'";        // escaped quote inside quoted run
              i += 2;
              continue;
            }
            i++;                 // closing quote
            break;
          }
          out += q;
          i++;
        }
        continue;
      }

      if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')) {
        // Pattern letter — count run length
        let j = i + 1;
        while (j < pattern.length && pattern.charAt(j) === c) j++;
        out += renderToken(c, j - i);
        i = j;
        continue;
      }

      out += c;
      i++;
    }
    return out;
  }

  /**
   * Format number with specified decimal places
   */
  formatNumber(num, decimalPlaces) {
    if (decimalPlaces === 0) {
      return Math.floor(num).toString();
    }
    return num.toFixed(decimalPlaces);
  }

  /**
   * Pad number with leading zero
   */
  padZero(num) {
    return String(Math.floor(num)).padStart(2, '0');
  }
}

/**
 * ChartDisplay - Handles chart creation, rendering, and updates
 * Works with JSFreeChart library for XY plotting
 * Supports limiting displayed data points to manageable dataset size
 */
class ChartDisplay {
  constructor() {
    this.currentChart = null;           // Current chart instance
    this.currentDataset = null;         // Current dataset
    this.currentLabels = null;          // Current field labels
    this.dataPointLimit = 500;          // Default limit for displayed points
    this.lastDataLineCount = 0;         // Track processed CSV lines
    this.frozenStartRow = null;         // null = live, number = frozen at this CSV row index
    this.multiSubplotUpdateInterval = null; // Multi-subplot polling interval handle
    this.currentCanvas = null;          // Reference to active chart canvas
    this.lastCanvasWidth = 0;           // Track previous canvas width for resize detection
    this.lastCanvasHeight = 0;          // Track previous canvas height for resize detection
    this.currentTimeFormatter = null;   // TimeFormatUtil for X-axis labels
    console.log('[CHART_DISPLAY] ChartDisplay instance created');
  }

  /**
   * Parse chart labels from response message format
   * Handles JSON parser array format where pipes split the response:
   * {=Test Data|count|l1|l2} becomes ["{=Test Data", "|count", "|l1", "|l2"]
   *
   * Supports:
   * a) {=Title|field1|field2|...} - Charts data with field labels
   * b) {=Title| | } - Empty labels between pipes, treated as raw data
   * c) {=Title} - No pipes at all, treated as raw data
   *
   * Output: {title: "Title", labels: ["field1", "field2"], fieldCount: 3, limit: 500}
   *         or null for raw data display
   *
   * @param {array} cmdArray - The cmd array from JSON-parsed response
   * @returns {object|null} - Chart info object or null for raw data display
   */
  parseChartLabels(cmdArray) {
    console.log('[CHART_DISPLAY] parseChartLabels called with array:', cmdArray);

    if (!Array.isArray(cmdArray) || cmdArray.length === 0) {
      throw new Error(`[CHART_DISPLAY] parseChartLabels: cmdArray must be a non-empty array`);
    }

    // Parse first element to extract title
    // Format: {=Title
    const firstElem = cmdArray[0];
    const eqIdx = firstElem.indexOf('=');
    if (eqIdx === -1) {
      console.log('[CHART_DISPLAY] No "=" found in first element, returning null');
      return null;
    }

    const title = firstElem.substring(eqIdx + 1).trim();
    console.log('[CHART_DISPLAY] Extracted title:', title);

    // If only first element, no fields - this is raw data
    if (cmdArray.length === 1) {
      console.log('[CHART_DISPLAY] Only title, no fields - this is raw data');
      return null;
    }

    // Extract field labels from remaining array elements
    // Only elements with | prefix are field labels: "|count", "|l1", "|l2"
    // Elements without | (like closing "}") are not field labels

    // IMPORTANT: Count pipe-delimited elements to match CSV field count
    const pipeElements = cmdArray.slice(1).filter(elem => typeof elem === 'string' && elem.startsWith('|'));
    console.log('[CHART_DISPLAY] Found', pipeElements.length, 'pipe-delimited elements');

    // Extract ALL labels including empty ones to preserve field positions
    // For example: {=Plot|time|temperature|  |humidity} gives ["time", "temperature", "", "humidity"]
    const allLabels = pipeElements
      .map(elem => elem.substring(1).trim());

    console.log('[CHART_DISPLAY] Extracted all field labels (including blanks):', allLabels);

    // Get list of non-blank labels for display
    const nonBlankLabels = allLabels.filter(label => label.length > 0);
    console.log('[CHART_DISPLAY] Non-blank labels:', nonBlankLabels);

    // Check for empty labels between pipes: {=Title| | } case
    // If we have pipe elements but all labels are empty, treat as raw data
    if (pipeElements.length > 0 && nonBlankLabels.length === 0) {
      console.log('[CHART_DISPLAY] Pipe elements found but all labels are empty (e.g., {=Title| | }) - treating as raw data');
      return null;
    }

    if (nonBlankLabels.length === 0) {
      // No non-blank fields - treat as raw data
      console.log('[CHART_DISPLAY] No non-blank field labels found, returning null');
      return null;
    }

    // fieldCount is based on ALL labels (including blanks) to match CSV field count
    const fieldCount = allLabels.length;
    const limit = 500; // Default limit (500 CSV lines)

    // Check if there's only one non-blank label
    const useCountFlag = nonBlankLabels.length === 1;
    if (useCountFlag) {
      console.log('[CHART_DISPLAY] Single non-blank label detected: "' + nonBlankLabels[0] + '", setting useCountFlag=true');
      console.log('[CHART_DISPLAY] X-axis will be "Count", Y-axis will be "' + nonBlankLabels[0] + '"');
    }

    console.log('[CHART_DISPLAY] Parsed chart - title:', title, 'allLabels:', allLabels, 'nonBlankLabels:', nonBlankLabels, 'fieldCount:', fieldCount, 'limit:', limit, 'CSV lines, useCountFlag:', useCountFlag);
    return {
      title: title,
      allLabels: allLabels,           // All labels including blanks: ["time", "temp", "", "humidity"]
      nonBlankLabels: nonBlankLabels, // Only non-blank: ["time", "temp", "humidity"]
      fieldCount: fieldCount,         // 4 (for CSV matching based on pipe count)
      limit: limit,
      useCountFlag: useCountFlag      // true if single non-blank field (x-axis will be "Count", y-axis will be the field)
    };
  }

  /**
   * Parse a single field specification to extract label, plotNo, max, min, and unit
   * Format: fieldName[~max][~min][~unit][`plotNo] or other combinations
   * Examples:
   *   - temp
   *   - temp`2
   *   - temp~100~-10
   *   - temp`2~100~-10
   *   - temp~100~-10`2
   *   - temp~100~~DegC
   *   - temp~~-10
   *
   * @param {string} content - The field specification content
   * @returns {object} - {label, plotNo, max, min, unit}
   */
  parseFieldSpec(content) {
    let label = '';
    let plotNo = null;
    let max = null;
    let min = null;
    let unit = null;

    // Find first tilde to split label from values
    const tildeIdx = content.indexOf('~');
    const backtickIdx = content.indexOf('`');

    // Find first delimiter
    const firstDelimIdx = Math.min(
      tildeIdx >= 0 ? tildeIdx : Infinity,
      backtickIdx >= 0 ? backtickIdx : Infinity
    );

    // Extract label and initial plotNo
    if (firstDelimIdx === Infinity) {
      // No special characters
      label = content.trim();
    } else {
      label = content.substring(0, firstDelimIdx).trim();

      // If backtick comes first and before tilde, extract plotNo
      if (backtickIdx >= 0 && (tildeIdx < 0 || backtickIdx < tildeIdx)) {
        const endIdx = tildeIdx >= 0 ? tildeIdx : content.length;
        const plotNoStr = content.substring(backtickIdx + 1, endIdx).trim();
        const plotNoNum = parseInt(plotNoStr);
        if (!isNaN(plotNoNum)) {
          plotNo = Math.abs(plotNoNum);
        }
      }
    }

    // Parse tilde-separated values (max, min, unit)
    if (tildeIdx >= 0) {
      const valueStr = content.substring(tildeIdx); // Starts with ~
      const parts = valueStr.split('~').slice(1); // Skip first empty element

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];

        // Check if this part contains backtick (plotNo at end)
        const backtickInPart = part.indexOf('`');
        let value = part;

        if (backtickInPart >= 0) {
          value = part.substring(0, backtickInPart).trim();
          // Only extract plotNo from constraints if not already set by label`plotNo
          if (plotNo === null) {
            const plotNoStr = part.substring(backtickInPart + 1).trim();
            const plotNoNum = parseInt(plotNoStr);
            if (!isNaN(plotNoNum)) {
              plotNo = Math.abs(plotNoNum);
            }
          }
        } else {
          value = value.trim();
        }

        if (value.length === 0) continue; // Skip empty values (e.g., ~~)

        if (i === 0) {
          const maxNum = parseFloat(value);
          if (!isNaN(maxNum)) max = maxNum;
        } else if (i === 1) {
          const minNum = parseFloat(value);
          if (!isNaN(minNum)) min = minNum;
        } else if (i === 2) {
          unit = value;
        }
      }
    }

    return { label, plotNo, max, min, unit };
  }

  /**
   * Parse chart labels with plotNo parameters for multi-subplot support
   * Extended format with optional plotNo:
   * {=Title| [fieldName][ `plotNo] [ | [fieldName][ `plotNo] ]* }
   *
   * Examples:
   * 1. {=Weather|time`0|temp`1|pressure`1|humidity`2}
   *    → X-axis: "time" (plotNo 0)
   *    → Subplot 1: temp, pressure (plotNo 1)
   *    → Subplot 2: humidity (plotNo 2)
   *
   * 2. {=Data|count`0|a|b`1|c}
   *    → X-axis: "count" (plotNo 0)
   *    → Subplot [unassigned]: a, c (no plotNo, fields without plotNo plotted together)
   *    → Subplot 1: b (plotNo 1)
   *
   * 3. {=Mixed|count|a`0|b|c`0|d`5|e`5}
   *    → X-axis: a (first plotNo 0)
   *    → Subplot [unassigned]: b, c (no plotNo or repeated plotNo 0)
   *    → Subplot 5: d, e (plotNo 5)
   *
   * 4. {=Mixed| `1|`0| |}
   *    → No field names, all blank labels → ignore plotNo, treat as raw data
   *
   * @param {array} cmdArray - The cmd array from JSON-parsed response
   * @returns {object|null} - Subplot info with organization by plotNo, or null for raw data
   */
  parseChartLabelsWithPlotNo(cmdArray) {
    console.log('[CHART_DISPLAY] parseChartLabelsWithPlotNo called with array:', cmdArray);

    if (!Array.isArray(cmdArray) || cmdArray.length === 0) {
      throw new Error(`[CHART_DISPLAY] parseChartLabelsWithPlotNo: cmdArray must be a non-empty array`);
    }

    // Parse first element to extract title and maxPoints
    const firstElem = cmdArray[0];
    const eqIdx = firstElem.indexOf('=');
    if (eqIdx === -1) {
      console.log('[CHART_DISPLAY] No "=" found in first element, returning null');
      return null;
    }

    const titleWithMaxPoints = firstElem.substring(eqIdx + 1).trim();

    // Extract maxPoints and optional time format from the header element after '='.
    // Both maxPoints (backtick-prefixed) and plotOptions (tilde-prefixed) are optional
    // and may appear in either order relative to each other:
    //   "name`maxPoints~timeFormat"  e.g. "Chart`500~mm:ss"
    //   "name~timeFormat`maxPoints"  e.g. "Chart~mm:ss`500"
    //   "name`maxPoints"             e.g. "Chart`500"
    //   "name~timeFormat"            e.g. "Chart~mm:ss"
    //   "name"                       e.g. "Chart"
    // The title ends at whichever of '`' or '~' appears first.
    let title = titleWithMaxPoints;
    let maxPoints = 500; // Default when no backtick present
    let timeFormat = null;
    let clearData = false; // ~C : clear CSV/raw collectors before display
    let sortData  = false; // ~S : sort X-axis data before display

    // Scan a list of '~'-separated plot-option parts.  Single-letter options
    // are flags ("C" → clearData, "S" → sortData, others ignored).  The first
    // non-single-letter part is the date/time or elapsed-time format.
    const scanPlotOptions = (parts) => {
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.length === 1) {
          if (trimmed === 'C') clearData = true;
          else if (trimmed === 'S') sortData = true;
          // any other single-letter option is silently ignored per spec
        } else if (trimmed.length > 1 && timeFormat === null) {
          timeFormat = trimmed;
        }
      }
    };

    const backtickIdx = titleWithMaxPoints.indexOf('`');
    const tildeIdx    = titleWithMaxPoints.indexOf('~');

    if (backtickIdx === -1 && tildeIdx === -1) {
      // Plain title, no maxPoints or plotOptions
      title = titleWithMaxPoints.trim();
    } else if (backtickIdx !== -1 && (tildeIdx === -1 || backtickIdx < tildeIdx)) {
      // Backtick comes first: "name`maxPoints[~plotOption...]"
      title = titleWithMaxPoints.substring(0, backtickIdx).trim();
      const afterBacktick = titleWithMaxPoints.substring(backtickIdx + 1);

      const tildeInRest = afterBacktick.indexOf('~');
      if (tildeInRest !== -1) {
        // maxPoints before tilde, plotOptions after
        const maxPointsNum = parseInt(afterBacktick.substring(0, tildeInRest).trim());
        if (!isNaN(maxPointsNum) && maxPointsNum > 0) maxPoints = maxPointsNum;
        scanPlotOptions(afterBacktick.substring(tildeInRest + 1).split('~'));
      } else {
        // maxPoints only, no plotOptions
        const maxPointsNum = parseInt(afterBacktick.trim());
        if (!isNaN(maxPointsNum) && maxPointsNum > 0) maxPoints = maxPointsNum;
      }
    } else {
      // Tilde comes first (or no backtick): "name~plotOption[`maxPoints]"
      // e.g. "Chart Label~mm:ss`500" or "Chart Label~mm:ss"
      title = titleWithMaxPoints.substring(0, tildeIdx).trim();
      const afterTilde = titleWithMaxPoints.substring(tildeIdx + 1);

      const backtickInRest = afterTilde.indexOf('`');
      const plotOptionStr = backtickInRest !== -1
        ? afterTilde.substring(0, backtickInRest)
        : afterTilde;

      scanPlotOptions(plotOptionStr.split('~'));

      // Extract maxPoints after backtick if present
      if (backtickInRest !== -1) {
        const maxPointsNum = parseInt(afterTilde.substring(backtickInRest + 1).trim());
        if (!isNaN(maxPointsNum) && maxPointsNum > 0) maxPoints = maxPointsNum;
      }
    }

    console.log('[CHART_DISPLAY] Extracted title:', title, 'maxPoints:', maxPoints, 'timeFormat:', timeFormat);

    if (cmdArray.length === 1) {
      console.log('[CHART_DISPLAY] Only title, no fields - this is raw data');
      return null;
    }

    // Extract pipe-delimited elements
    const pipeElements = cmdArray.slice(1).filter(elem => typeof elem === 'string' && elem.startsWith('|'));
    console.log('[CHART_DISPLAY] Found', pipeElements.length, 'pipe-delimited elements');

    if (pipeElements.length === 0) {
      console.log('[CHART_DISPLAY] No pipe elements found, treating as raw data');
      return null;
    }

    // Parse each field label and extract plotNo, max, min, unit if present
    // Format: |fieldName[~max][~min][~unit][`plotNo] or variants
    const fieldCount = pipeElements.length;
    const fieldSpecs = []; // Array of {label, plotNo, max, min, unit, index}

    for (let i = 0; i < pipeElements.length; i++) {
      const elem = pipeElements[i];
      const content = elem.substring(1); // Remove leading |

      // Use helper function to parse field specification
      const spec = this.parseFieldSpec(content);

      console.log('[CHART_DISPLAY] parseFieldSpec result - Field', i, ': label="' + spec.label + '" plotNo=' + spec.plotNo + ' max=' + spec.max + ' min=' + spec.min + ' unit="' + spec.unit + '" from content="' + content + '"');

      // Skip blank fields (empty labels) - they are padding in the format
      if (spec.label.length === 0) {
        console.log('[CHART_DISPLAY] Skipping blank field at index', i);
        continue;
      }

      fieldSpecs.push({
        label: spec.label,
        plotNo: spec.plotNo,
        max: spec.max,
        min: spec.min,
        unit: spec.unit,
        index: i
      });
    }

    // Check if any field has a non-zero plotNo specified
    // If all plotNo's are null or 0, use legacy single-subplot mode
    const hasNonZeroPlotNo = fieldSpecs.some(spec => spec.plotNo !== null && spec.plotNo !== 0);
    console.log('[CHART_DISPLAY] hasNonZeroPlotNo:', hasNonZeroPlotNo);

    // DEFAULT MODE: No plot numbers specified — one subplot per Y-field
    // (first field is X-axis, each remaining field gets its own subplot)
    if (!hasNonZeroPlotNo) {
      console.log('[CHART_DISPLAY] No plotNo specified, assigning one subplot per Y-field');
      const allLabels = fieldSpecs.map(spec => spec.label);
      const nonBlankLabels = allLabels.filter(label => label.length > 0);

      if (nonBlankLabels.length === 0) {
        console.log('[CHART_DISPLAY] No non-blank labels, treating as raw data');
        return null;
      }

      const useCountFlag = nonBlankLabels.length === 1;

      // First non-blank field is the X-axis; each remaining field is its own subplot
      const nonBlankSpecs = fieldSpecs.filter(spec => spec.label.length > 0);
      const ySpecs = nonBlankSpecs.slice(1);

      return {
        title: title,
        maxPoints: maxPoints,
        timeFormat: timeFormat,
        clearData: clearData,
        sortData: sortData,
        allLabels: allLabels,
        nonBlankLabels: nonBlankLabels,
        fieldCount: fieldCount,
        hasPlotNo: false,
        useCountFlag: useCountFlag,
        xAxisFieldIndex: 0,
        xAxisFieldLabel: nonBlankSpecs[0].label,
        subplots: ySpecs.map((spec, i) => ({
          plotNo: i + 1,
          fieldSpecs: [spec],
          fieldLabels: [spec.label]
        }))
      };
    }

    // MULTI-SUBPLOT MODE: At least one non-zero plotNo is specified
    console.log('[CHART_DISPLAY] Multi-subplot mode detected');

    // Find X-axis field (first field with plotNo 0, or use data count if none)
    // Use spec.index (pipe position = CSV column index), not i (position in filtered array)
    let xAxisFieldIndex = -1;
    for (let i = 0; i < fieldSpecs.length; i++) {
      if (fieldSpecs[i].plotNo === 0) {
        xAxisFieldIndex = fieldSpecs[i].index;
        console.log('[CHART_DISPLAY] Found X-axis field at pipe index', xAxisFieldIndex, ':', fieldSpecs[i].label);
        break; // Use first plotNo 0 if multiple
      }
    }

    // If no plotNo 0, use data count as X-axis
    const useCountAsXAxis = (xAxisFieldIndex === -1);
    console.log('[CHART_DISPLAY] useCountAsXAxis:', useCountAsXAxis);

    // Organize fields into subplots by plotNo
    // Fields without plotNo or with plotNo 0 (non-first) get grouped together
    const subplotMap = {}; // {plotNo: [fieldSpec, ...]}
    const unassignedFields = []; // Fields without plotNo or repeated plotNo 0

    for (let i = 0; i < fieldSpecs.length; i++) {
      const spec = fieldSpecs[i];

      // Skip X-axis field — compare pipe position (spec.index) not fieldSpecs array index
      if (spec.index === xAxisFieldIndex) {
        console.log('[CHART_DISPLAY] Skipping X-axis field at pipe index', spec.index);
        continue;
      }

      if (spec.plotNo === null || spec.plotNo === 0) {
        // Unassigned or secondary zero - goes to unassigned group
        unassignedFields.push(spec);
      } else {
        // Assign to subplot by plotNo (already Math.abs'd during parsing)
        const plotNo = spec.plotNo;
        if (!subplotMap[plotNo]) {
          subplotMap[plotNo] = [];
        }
        subplotMap[plotNo].push(spec);
        console.log('[CHART_DISPLAY] Assigned field', spec.label, 'to subplot', plotNo);
      }
    }

    // Add unassigned fields as their own subplot if any exist
    if (unassignedFields.length > 0) {
      // Use -1 for unassigned group (displayed before numbered subplots)
      subplotMap[-1] = unassignedFields;
      console.log('[CHART_DISPLAY] Added', unassignedFields.length, 'unassigned fields to subplot -1');
    }

    // Create subplot array, sorted by plotNo for consistent ordering
    // Unassigned (-1) comes first, then numbered subplots in numeric order
    const subplots = [];
    const sortedPlotNos = Object.keys(subplotMap).map(Number).sort((a, b) => {
      if (a === -1) return -1; // Unassigned goes first
      if (b === -1) return 1;
      return a - b; // Numbered subplots in numeric order
    });

    for (const plotNo of sortedPlotNos) {
      const fields = subplotMap[plotNo];
      const displayPlotNo = plotNo === -1 ? '[unassigned]' : plotNo;

      subplots.push({
        plotNo: plotNo,
        fieldSpecs: fields,
        fieldLabels: fields.filter(spec => spec.label.length > 0).map(spec => spec.label)
      });

      console.log('[CHART_DISPLAY] Subplot', displayPlotNo, ':',
        fields.map(f => f.label).join(', '));
    }

    const xAxisSpec = fieldSpecs.find(spec => spec.index === xAxisFieldIndex);
    const xAxisFieldLabel = useCountAsXAxis ? "Count" : (xAxisSpec ? xAxisSpec.label : '');

    console.log('[CHART_DISPLAY] Parsed multi-subplot chart:',
      'title:', title,
      'X-axis:', xAxisFieldLabel,
      'subplots:', subplots.length,
      'fieldCount:', fieldCount);

    return {
      title: title,
      maxPoints: maxPoints,
      timeFormat: timeFormat,
      clearData: clearData, // ~C : caller should clear collectors before display
      sortData: sortData,   // ~S : caller should sort by X before display
      allLabels: fieldSpecs.map(spec => spec.label),
      fieldCount: fieldCount,
      hasPlotNo: true,
      useCountAsXAxis: useCountAsXAxis,
      xAxisFieldIndex: xAxisFieldIndex,
      xAxisFieldLabel: xAxisFieldLabel,
      fieldSpecs: fieldSpecs,
      subplots: subplots,
      useCountFlag: false // Not used in multi-subplot mode
    };
  }

  /**
   * Parse CSV data for multi-subplot mode
   * Creates separate datasets for each subplot based on plotNo assignments
   *
   * @param {array} csvLines - Array of CSV line strings
   * @param {object} chartInfo - Result from parseChartLabelsWithPlotNo
   * @param {number} limit - Maximum number of CSV lines to include
   * @returns {object} - {datasets: [dataset1, dataset2, ...], subplotInfo: [...]} or null
   */
  parseCSVToDatasetWithPlotNo(csvLines, chartInfo, limit = 500) {
    if (!csvLines) throw new Error('[CHART_DISPLAY] parseCSVToDatasetWithPlotNo: csvLines is required');
    if (!chartInfo) throw new Error('[CHART_DISPLAY] parseCSVToDatasetWithPlotNo: chartInfo is required');
    if (csvLines.length === 0) {
      return null;
    }

    console.log('[CHART_DISPLAY] parseCSVToDatasetWithPlotNo called with', csvLines.length, 'CSV lines');

    // Use maxPoints from chartInfo if available, otherwise use limit parameter
    const maxPoints = chartInfo.maxPoints !== undefined ? chartInfo.maxPoints : limit;
    console.log('[CHART_DISPLAY] Using maxPoints:', maxPoints);

    // Get X-axis data source
    const useCountAsXAxis = chartInfo.useCountAsXAxis;
    const xAxisFieldIndex = chartInfo.xAxisFieldIndex;

    // xIsDate: set when ANY row's X-field is an absolute date string (e.g.
    // "2019/04/02 17:23:01").  Lets createAndDisplayMultiSubplotChart
    // install a default date formatter even when the chart cmd omits a
    // ~timeFormat plot option — so devices streaming yyyy/MM/dd HH:mm:ss
    // values don't render as raw 1.55e12 millisecond ticks on the axis.
    let xIsDate = false;
    let parsedRows = [];

    if (chartInfo.sortData && !useCountAsXAxis) {
      // ~S: parse ALL collected lines, sort ascending by x-value (oldest→newest),
      // then keep only the last maxPoints — so the displayed window always
      // contains the most-recent maxPoints data points in chronological order.
      // This is correct even when the device sends data newest-first (e.g. a
      // history buffer dump) or interleaves multiple interval streams, where
      // "last N rows by buffer position" would select the wrong (oldest) window.
      for (const line of csvLines) {
        const fields = line.split(',').map(f => f.trim());
        if (fields.length < chartInfo.allLabels.length) continue;
        const xField = fields[xAxisFieldIndex];
        if (!xIsDate && TimeFormatUtil.isDateLikeString(xField)) xIsDate = true;
        const xValue = TimeFormatUtil.parseValue(xField, chartInfo.timeFormat);
        if (isNaN(xValue)) continue;
        parsedRows.push({ xValue, fields });
      }
      parsedRows.sort((a, b) => a.xValue - b.xValue);
      if (parsedRows.length > maxPoints) {
        parsedRows = parsedRows.slice(-maxPoints);
      }
      console.log('[CHART_DISPLAY] ~S sort: showing', parsedRows.length, 'most-recent of', csvLines.length, 'collected points');
      if (parsedRows.length > 0) {
        console.error('[FREEZE_DBG] displayed block X range (sorted): first ms=', parsedRows[0].xValue,
          'first raw=', parsedRows[0].fields[xAxisFieldIndex],
          '| last ms=', parsedRows[parsedRows.length - 1].xValue,
          'last raw=', parsedRows[parsedRows.length - 1].fields[xAxisFieldIndex]);
      }
    } else {
      // No sort: limit to last N rows by buffer arrival order, then parse.
      const limitedLines = this.getLimitedLines(csvLines, maxPoints);
      console.log('[CHART_DISPLAY] Using', limitedLines.length, 'of', csvLines.length, 'CSV lines (maxPoints:', maxPoints, ')');

      // Line number offset used for count-as-x-axis mode so the first
      // displayed line gets the correct 1-based sequence number. Must be the
      // actual window-start index getLimitedLines used (this.lastLimitedLinesStart),
      // not csvLines.length - limitedLines.length — that formula only matches
      // the true start when the window is at the live/latest position; once
      // frozen and shifted away from there, it would stay stuck reporting the
      // latest-window's label range regardless of where the window actually is.
      const lineNumberOffset = this.lastLimitedLinesStart;
      console.error('[FREEZE_DBG] Line number offset:', lineNumberOffset,
        '-> count labels', lineNumberOffset + 1, 'to', lineNumberOffset + limitedLines.length);

      // Show the displayed row-number range next to the freeze prev/next
      // arrows, updated on every redraw — lets the user see exactly which
      // rows are on screen as they navigate, independent of axis labelling.
      const freezeRowMinEl = document.getElementById('freeze-row-min');
      const freezeRowMaxEl = document.getElementById('freeze-row-max');
      const rowMinText = limitedLines.length > 0 ? String(lineNumberOffset + 1) : '';
      const rowMaxText = limitedLines.length > 0 ? String(lineNumberOffset + limitedLines.length) : '';
      if (freezeRowMinEl) freezeRowMinEl.textContent = rowMinText;
      if (freezeRowMaxEl) freezeRowMaxEl.textContent = rowMaxText;

      if (limitedLines.length > 0 && !useCountAsXAxis) {
        const firstField = limitedLines[0].split(',').map(f => f.trim())[xAxisFieldIndex];
        const lastField = limitedLines[limitedLines.length - 1].split(',').map(f => f.trim())[xAxisFieldIndex];
        console.error('[FREEZE_DBG] displayed block X range (no sort, buffer order): first raw=', firstField,
          'parsed ms=', TimeFormatUtil.parseValue(firstField, chartInfo.timeFormat),
          '| last raw=', lastField,
          'parsed ms=', TimeFormatUtil.parseValue(lastField, chartInfo.timeFormat));
      }

      for (let i = 0; i < limitedLines.length; i++) {
        const line = limitedLines[i];
        const fields = line.split(',').map(f => f.trim());
        if (fields.length < chartInfo.allLabels.length) {
          console.warn('[CHART_DISPLAY] Line has fewer fields than expected, skipping:', line);
          continue;
        }
        let xValue;
        if (useCountAsXAxis) {
          xValue = lineNumberOffset + (i + 1); // 1-indexed line number in csv file
        } else {
          const xField = fields[xAxisFieldIndex];
          if (!xIsDate && TimeFormatUtil.isDateLikeString(xField)) {
            xIsDate = true;
          }
          xValue = TimeFormatUtil.parseValue(xField, chartInfo.timeFormat);
          if (isNaN(xValue)) {
            console.warn('[CHART_DISPLAY] Invalid X value:', xField);
            continue;
          }
        }
        parsedRows.push({ xValue, fields });
      }
    }

    // Create a dataset for each subplot
    const datasets = [];
    const subplotInfo = [];

    for (const subplot of chartInfo.subplots) {
      console.log('[CHART_DISPLAY] Creating dataset for subplot', subplot.plotNo);

      const dataset = new jsfc.StandardXYDataset();
      const fieldSpecs = subplot.fieldSpecs;

      // Filter to non-blank fields for this subplot
      const nonBlankSpecs = fieldSpecs.filter(spec => spec.label.length > 0);
      console.log('[CHART_DISPLAY] Subplot', subplot.plotNo, 'has', nonBlankSpecs.length, 'non-blank fields');

      if (nonBlankSpecs.length === 0) {
        console.log('[CHART_DISPLAY] Subplot has no non-blank fields, skipping');
        continue;
      }

      // Add Y values for each row (already sorted if ~S was set)
      for (const row of parsedRows) {
        for (const spec of nonBlankSpecs) {
          const yValue = parseFloat(row.fields[spec.index]);
          if (!isNaN(yValue)) {
            dataset.add(spec.label, row.xValue, yValue);
          }
        }
      }

      console.log('[CHART_DISPLAY] Subplot', subplot.plotNo, 'dataset created with series:', dataset.seriesCount());

      datasets.push(dataset);
      subplotInfo.push({
        plotNo: subplot.plotNo,
        dataset: dataset,
        fieldLabels: nonBlankSpecs.map(spec => spec.label),
        yAxisLabel: nonBlankSpecs.map(spec => spec.label).join(', ')
      });
    }

    console.log('[CHART_DISPLAY] Created', datasets.length, 'datasets for', chartInfo.subplots.length, 'subplots');

    return {
      datasets: datasets,
      subplotInfo: subplotInfo,
      xAxisLabel: chartInfo.xAxisFieldLabel,
      useCountAsXAxis: useCountAsXAxis,
      xIsDate: xIsDate
    };
  }

  /**
   * Calculate minimum value from a dataset series
   * Used to determine axis ranges for charting
   * @param {object} dataset - jsfc.StandardXYDataset
   * @param {number} seriesIndex - Series index to analyze
   * @returns {number} - Minimum x-value or undefined if no data
   */
  calculateMinValue(dataset, seriesIndex) {
    if (!dataset) throw new Error('[CHART_DISPLAY] calculateMinValue: dataset is required');
    if (dataset.itemCount(seriesIndex) === 0) {
      return undefined;
    }
    let min = Number.MAX_VALUE;
    for (let i = 0; i < dataset.itemCount(seriesIndex); i++) {
      const val = dataset.x(seriesIndex, i);
      if (val !== null && !isNaN(val)) {
        min = Math.min(min, val);
      }
    }
    return min === Number.MAX_VALUE ? undefined : min;
  }

  /**
   * Calculate maximum value from a dataset series
   * Used to determine axis ranges for charting
   * @param {object} dataset - jsfc.StandardXYDataset
   * @param {number} seriesIndex - Series index to analyze
   * @returns {number} - Maximum x-value or undefined if no data
   */
  calculateMaxValue(dataset, seriesIndex) {
    if (!dataset) throw new Error('[CHART_DISPLAY] calculateMaxValue: dataset is required');
    if (dataset.itemCount(seriesIndex) === 0) {
      return undefined;
    }
    let max = Number.MIN_VALUE;
    for (let i = 0; i < dataset.itemCount(seriesIndex); i++) {
      const val = dataset.x(seriesIndex, i);
      if (val !== null && !isNaN(val)) {
        max = Math.max(max, val);
      }
    }
    return max === Number.MIN_VALUE ? undefined : max;
  }

  /**
   * Load CSV data from collector for specified field count
   * @param {number} fieldCount - Number of fields to match
   * @returns {array} - Array of CSV line strings (each line terminated by newline in original)
   */
  loadCSVData(fieldCount) {
    if (!window.csvCollector) {
      throw new Error('[CHART_DISPLAY] loadCSVData: csvCollector not available');
    }
    if (!window.csvCollector.getFieldCounts().includes(fieldCount)) {
      return [];
    }
    const csvLines = window.csvCollector.getCSVLines(fieldCount);
    console.log('[CHART_DISPLAY] Loaded', csvLines.length, 'CSV lines for field count', fieldCount);
    return csvLines;
  }

  /**
   * Get limited subset of CSV lines (last N lines)
   * Keeps only the most recent N lines (last N newline-terminated records)
   * @param {array} csvLines - Full array of CSV lines
   * @param {number} limit - Maximum number of lines to return
   * @returns {array} - Limited array (last N lines)
   */
  getLimitedLines(csvLines, limit) {
    if (this.frozenStartRow !== null) {
      // Frozen: show `limit` lines starting from the frozen row
      const start = Math.min(this.frozenStartRow, Math.max(0, csvLines.length - limit));
      console.error('[FREEZE_DBG] getLimitedLines: csvLines.length=', csvLines.length,
        'limit=', limit, 'frozenStartRow=', this.frozenStartRow, '-> start=', start,
        'slice=[', start, ',', start + limit, ')');
      // Expose the actual window-start index (0-based) so callers building
      // 1-based row/count labels (e.g. useCountAsXAxis) reflect where the
      // frozen window really is, not just "as if live at the latest window".
      this.lastLimitedLinesStart = start;
      return csvLines.slice(start, start + limit);
    }
    if (csvLines.length <= limit) {
      this.lastLimitedLinesStart = 0;
      return csvLines;
    }
    const startIdx = csvLines.length - limit;
    this.lastLimitedLinesStart = startIdx;
    return csvLines.slice(startIdx);
  }

  /**
   * Freeze the chart at the current display start row.
   * @param {array} allLines - All CSV lines currently collected.
   * @param {number} maxPoints - Current display window size.
   */
  freezeChart(allLines, maxPoints) {
    this.frozenStartRow = Math.max(0, allLines.length - maxPoints);
    console.error('[FREEZE_DBG] freezeChart: allLines.length=', allLines.length,
      'maxPoints=', maxPoints, '-> frozenStartRow=', this.frozenStartRow);
  }

  /**
   * Unfreeze the chart and resume live updates.
   */
  unfreezeChart() {
    console.error('[FREEZE_DBG] unfreezeChart: was frozenStartRow=', this.frozenStartRow);
    this.frozenStartRow = null;
    this.lastDataLineCount = 0; // Force immediate redraw from current data
  }

  /**
   * Shift the frozen start row by half the display window.
   * @param {array} allLines - All CSV lines currently collected.
   * @param {number} maxPoints - Current display window size.
   * @param {number} direction - -1 to move back, +1 to move forward.
   */
  shiftFrozenRow(allLines, maxPoints, direction) {
    const shift = Math.max(1, Math.floor(maxPoints * 0.4));
    const maxStart = Math.max(0, allLines.length - maxPoints);
    const before = this.frozenStartRow;
    this.frozenStartRow = Math.max(0, Math.min(this.frozenStartRow + direction * shift, maxStart));
    console.error('[FREEZE_DBG] shiftFrozenRow: allLines.length=', allLines.length,
      'maxPoints=', maxPoints, 'direction=', direction, 'shift=', shift, 'maxStart=', maxStart,
      'frozenStartRow', before, '->', this.frozenStartRow);
  }


  /**
   * Parse CSV data and create StandardXYDataset
   * First field becomes X-axis data, remaining fields become Y-axis series
   * Only uses last N CSV lines based on limit
   * @param {array} csvLines - Array of CSV line strings
   * @param {array} labels - Field labels [xFieldName, yField1Name, yField2Name, ...]
   * @param {number} limit - Maximum number of CSV lines to include
   * @returns {object} - jsfc.StandardXYDataset with data
   */
  parseCSVToDataset(csvLines, labels, limit = 500) {
    if (!csvLines) throw new Error('[CHART_DISPLAY] parseCSVToDataset: csvLines is required');
    if (csvLines.length === 0) {
      return null;
    }

    // Limit to last N CSV lines (newline-terminated records)
    const limitedLines = this.getLimitedLines(csvLines, limit);
    console.log('[CHART_DISPLAY] Using', limitedLines.length, 'of', csvLines.length, 'CSV lines (limit:', limit, ')');

    const dataset = new jsfc.StandardXYDataset();
    const xFieldName = labels[0];
    const yFieldNames = labels.slice(1);

    console.log('[CHART_DISPLAY] Creating dataset with X-axis:', xFieldName, 'Y-series:', yFieldNames);

    // Parse each CSV line
    for (const line of limitedLines) {
      const fields = line.split(',').map(f => f.trim());

      if (fields.length < labels.length) {
        console.warn('[CHART_DISPLAY] Line has fewer fields than labels, skipping:', line);
        continue;
      }

      // First field is X value
      const xValue = parseFloat(fields[0]);
      if (isNaN(xValue)) {
        console.warn('[CHART_DISPLAY] Invalid X value:', fields[0]);
        continue;
      }

      // Remaining fields are Y values for each series
      for (let i = 0; i < yFieldNames.length; i++) {
        const yValue = parseFloat(fields[i + 1]);
        if (!isNaN(yValue)) {
          dataset.add(yFieldNames[i], xValue, yValue);
        }
      }
    }

    console.log('[CHART_DISPLAY] Dataset created with', limitedLines.length, 'data points');
    console.log('[CHART_DISPLAY] Dataset series count:', dataset.seriesCount());
    for (let s = 0; s < dataset.seriesCount(); s++) {
      console.log('[CHART_DISPLAY] Series', s, ':', dataset.seriesKey(s));
    }
    return dataset;
  }

  /**
   * Create and display chart with multiple subplots based on plotNo assignments
   * Creates CombinedDomainXYPlot with separate subplots for each plotNo group
   * Handles both cases: with data (parseResult provided) and without data (parseResult null)
   *
   * @param {string} title - Chart title
   * @param {object} chartInfo - Result from parseChartLabelsWithPlotNo
   * @param {object} parseResult - Result from parseCSVToDatasetWithPlotNo, or null for empty chart
   * @param {HTMLCanvasElement} canvas - Target canvas element
   * @returns {object} - Chart instance
   */
  createAndDisplayMultiSubplotChart(title, chartInfo, parseResult, canvas) {
    if (!canvas) throw new Error('[CHART_DISPLAY] createAndDisplayMultiSubplotChart: canvas element not provided');
    if (!chartInfo) throw new Error('[CHART_DISPLAY] createAndDisplayMultiSubplotChart: chartInfo not provided');

    const hasData = parseResult !== null;
    console.log('[CHART_DISPLAY] Creating multi-subplot chart:', title, '(hasData:', hasData, ')');

    try {
      // Store canvas reference
      this.currentCanvas = canvas;
      this.resizeCanvasToFitSpace(canvas);

      // Defensive: ensure no stale pixels carry over from a previous chart
      // session.  jsfreechart's chart.draw() does not issue a clearRect.
      const ctx2d = canvas.getContext('2d');
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);

      const ctx = new jsfc.CanvasContext2D(canvas);
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      console.log('[CHART_DISPLAY] Canvas dimensions:', canvasWidth, 'x', canvasHeight);

      // Create shared X-axis (use chartInfo for structure, parseResult only for data)
      const xAxisLabel = chartInfo.xAxisFieldLabel;
      console.log('[CHART_DISPLAY] Creating shared X axis with label:', xAxisLabel);
      const xAxis = new jsfc.LinearAxis(xAxisLabel);
      xAxis.setAutoRange(true);

      // Set up time formatter for X-axis.
      //
      // 1. If the chart cmd specified ~timeFormat, use it.
      // 2. Otherwise, if parseCSVToDatasetWithPlotNo detected that the
      //    X-axis column contains absolute date strings (e.g.
      //    "2019/04/02 17:23:01"), default to "yyyy/MM/dd HH:mm:ss" so
      //    the axis renders as readable dates instead of raw 1.55e12 ms
      //    ticks.  Otherwise leave the axis on JSFreeChart's NumberFormat.
      let effectiveTimeFormat = chartInfo.timeFormat;
      if (!effectiveTimeFormat && parseResult && parseResult.xIsDate) {
        effectiveTimeFormat = 'yyyy/MM/dd HH:mm:ss';
        console.log('[CHART_DISPLAY] No timeFormat in chart cmd but X-axis values are date strings — defaulting to:',
                    effectiveTimeFormat);
        // Persist the auto-default back onto chartInfo so the Chart Config
        // dropdown shows the format actually being displayed.  The cmd
        // emitter (Apply button) re-uses chartInfo.timeFormat, so an
        // unedited Apply round-trips the same default into the new chart
        // cmd — making the implicit default explicit in the next request.
        chartInfo.timeFormat = effectiveTimeFormat;
      }
      if (effectiveTimeFormat) {
        // Pull the per-fieldCount time anchor off the CSV collector and
        // derive baseTimeMs = firstLineTimeMs - firstLineMs.  Adding any
        // line's ms to baseTimeMs then gives that line's wall-clock time,
        // with the first parseable CSV line of this fieldCount mapping
        // exactly to its arrival instant.  Only applied when firstLineMs
        // is itself relative (< 2^40 ms); for absolute timestamps the
        // values render as-is so we leave baseTimeMs null.
        const anchor = (window.csvCollector && window.csvCollector.firstAnchors)
                     ? window.csvCollector.firstAnchors[chartInfo.fieldCount]
                     : null;
        const THRESHOLD = Math.pow(2, 40);
        let baseTimeMs = null;
        if (anchor && Math.abs(anchor.firstLineMs) < THRESHOLD) {
          baseTimeMs = anchor.firstLineTimeMs - anchor.firstLineMs;
        }
        console.log('[CHART_DISPLAY] Setting X-axis time format:', effectiveTimeFormat,
                    'fieldCount:', chartInfo.fieldCount,
                    'anchor:', anchor,
                    'baseTimeMs:', baseTimeMs);
        const timeFormatUtil = new TimeFormatUtil(effectiveTimeFormat, baseTimeMs);
        this.currentTimeFormatter = timeFormatUtil;

        // Create formatter that implements jsfc.Format interface
        const formatter = new TimeFormatter(timeFormatUtil);
        xAxis.setTickLabelFormatOverride(formatter);
      }

      // Create CombinedDomainXYPlot with shared x-axis
      console.log('[CHART_DISPLAY] Creating CombinedDomainXYPlot for multi-subplot mode');
      const combinedPlot = new jsfc.CombinedDomainXYPlot(xAxis);
      combinedPlot.setGap(10); // 10 pixel gap between subplots

      // Base palette indexed by CSV field index (spec.index) so colors stay fixed
      // as fields move between subplots.  Black is reserved for the X-axis label in Chart Config.
      const palette = [
        new jsfc.Color(0, 0, 255),      // Blue
        new jsfc.Color(255, 0, 0),      // Red
        new jsfc.Color(0, 128, 0),      // Green
        new jsfc.Color(255, 128, 0),    // Orange
        new jsfc.Color(128, 0, 128),    // Purple
        new jsfc.Color(0, 128, 128),    // Teal
        new jsfc.Color(255, 105, 180),  // Hot Pink
        new jsfc.Color(165, 42, 42),    // Brown
        new jsfc.Color(255, 127, 80),   // Coral
        new jsfc.Color(255, 255, 0)     // Yellow
      ];
      // Build orderedColors in global-series order but keyed by spec.index
      const orderedColors = [];
      for (const subplot of chartInfo.subplots) {
        for (const spec of subplot.fieldSpecs) {
          orderedColors.push(palette[spec.index % palette.length]);
        }
      }

      // Create special renderer for CombinedDomainXYPlot
      const renderer = new jsfc.CombinedDomainXYItemRenderer();
      const colorSource = new jsfc.ColorSource(orderedColors);
      renderer.setLineColorSource(colorSource);
      combinedPlot.setRenderer(renderer);

      console.log('[CHART_DISPLAY] Creating', chartInfo.subplots.length, 'subplots (hasData:', hasData, ')');

      // Create a subplot for each subplot defined in chartInfo
      // Use chartInfo for structure, parseResult only for datasets
      for (let i = 0; i < chartInfo.subplots.length; i++) {
        const subplotInfo = chartInfo.subplots[i];

        // Get dataset: from parseResult if available, otherwise empty
        let dataset;
        if (hasData && parseResult.subplotInfo && i < parseResult.subplotInfo.length) {
          // Use dataset from parseResult (same index order)
          dataset = parseResult.subplotInfo[i].dataset;
        } else {
          // Create empty dataset for this subplot
          dataset = new jsfc.StandardXYDataset();
        }

        console.log('[CHART_DISPLAY] Creating subplot', i, 'with', dataset.seriesCount(), 'data series (plotNo:', subplotInfo.plotNo, ')');

        // Create XYPlot for this subplot
        const subplot = new jsfc.XYPlot(dataset);

        // Extract unit and range constraints from field specs
        // Use first field's unit (if multiple fields share a subplot)
        let yAxisLabel = subplotInfo.fieldLabels.join(', ') || 'Y';
        let minRange = null;
        let maxRange = null;
        let unit = null;

        if (subplotInfo.fieldSpecs && subplotInfo.fieldSpecs.length > 0) {
          // Get unit from first field that has one
          for (const fieldSpec of subplotInfo.fieldSpecs) {
            if (fieldSpec.unit) {
              unit = fieldSpec.unit;
              break;
            }
          }

          // Get min/max constraints from fields
          // When multiple fields share a subplot, combine constraints to show all fields
          for (const fieldSpec of subplotInfo.fieldSpecs) {
            console.log('[CHART_DISPLAY] Subplot', i, 'processing field "' + fieldSpec.label + '" with max=' + fieldSpec.max + ' min=' + fieldSpec.min);
            if (fieldSpec.max !== null && fieldSpec.max !== undefined) {
              if (maxRange === null) {
                maxRange = fieldSpec.max;
                console.log('[CHART_DISPLAY] Subplot', i, 'set maxRange=' + maxRange);
              } else {
                // Use the larger max value to accommodate all fields
                maxRange = Math.max(maxRange, fieldSpec.max);
                console.log('[CHART_DISPLAY] Subplot', i, 'updated maxRange to ' + maxRange);
              }
            }
            if (fieldSpec.min !== null && fieldSpec.min !== undefined) {
              if (minRange === null) {
                minRange = fieldSpec.min;
                console.log('[CHART_DISPLAY] Subplot', i, 'set minRange=' + minRange);
              } else {
                // Use the smaller min value to accommodate all fields
                minRange = Math.min(minRange, fieldSpec.min);
                console.log('[CHART_DISPLAY] Subplot', i, 'updated minRange to ' + minRange);
              }
            }
          }
        }

        // Add unit to y-axis label if present
        if (unit) {
          yAxisLabel = yAxisLabel + ' (' + unit + ')';
        }

        console.log('[CHART_DISPLAY] Subplot', i, 'Y-axis label:', yAxisLabel, 'min:', minRange, 'max:', maxRange);
        const yAxis = new jsfc.LinearAxis(yAxisLabel);

        // Y-axis constraint mode:
        //   applyHardConstraints true  → fixed at spec min/max (set by APPLY
        //                                in Chart Config); data outside the
        //                                spec range is clipped off-axis.
        //   applyHardConstraints false → soft constraints; spec min/max acts
        //                                as a minimum visible range but the
        //                                axis auto-expands to include data.
        //
        // Freeze alone does NOT enable hard constraints — see chart docstring
        // Hard mode: Y-axis is fixed at the Max/Min values set in Chart Config.
        // Controlled solely by the per-field autoScale checkbox — unchecking it
        // enables hard constraints; checking it keeps the axis soft. Freeze/unfreeze
        // has no effect on this setting.
        const subplotAllAutoScale = !subplotInfo.fieldSpecs ||
          subplotInfo.fieldSpecs.every(fs => fs.autoScale !== false);
        const hardMode = !subplotAllAutoScale;
        let hardMax = null;
        let hardMin = null;
        if (hardMode && subplotInfo.fieldSpecs) {
          for (const fieldSpec of subplotInfo.fieldSpecs) {
            if (fieldSpec.max !== null && fieldSpec.max !== undefined) {
              hardMax = hardMax === null ? fieldSpec.max : Math.max(hardMax, fieldSpec.max);
            }
            if (fieldSpec.min !== null && fieldSpec.min !== undefined) {
              hardMin = hardMin === null ? fieldSpec.min : Math.min(hardMin, fieldSpec.min);
            }
          }
          // Ensure hardMin < hardMax; swap if user entered them the wrong way around
          if (hardMin !== null && hardMax !== null && hardMin > hardMax) {
            const tmp = hardMin; hardMin = hardMax; hardMax = tmp;
          }

          // When only one bound is specified, fill the other from the actual
          // data range so the single hard limit is reliably honored.
          if (hardMax !== null && hardMin === null) {
            const dataRange = subplot.getRenderer().calcYRange(subplot.getDataset());
            if (dataRange) hardMin = dataRange.lowerBound();
          } else if (hardMin !== null && hardMax === null) {
            const dataRange = subplot.getRenderer().calcYRange(subplot.getDataset());
            if (dataRange) hardMax = dataRange.upperBound();
          }
        }
        yAxis.setAutoRange(true);
        subplot.setYAxis(yAxis);
        subplot._yAxisConstraintHard = hardMode;
        subplot.setYAxisConstraints(
          hardMode ? hardMin : minRange,
          hardMode ? hardMax : maxRange,
          false
        );

        // Set axis offsets
        subplot.setAxisOffsets(new jsfc.Insets(4, 4, 4, 4));

        // Add subplot to combined plot
        combinedPlot.add(subplot);
        console.log('[CHART_DISPLAY] Subplot', i, 'added to CombinedDomainXYPlot');
      }

      // Create chart
      console.log('[CHART_DISPLAY] Creating Chart instance with CombinedDomainXYPlot');
      const chart = new jsfc.Chart(combinedPlot);
      chart.setTitle(title);

      // Store chart reference
      this.currentChart = chart;
      this.currentChartInfo = chartInfo;
      console.log('[CHART_DISPLAY] Chart stored in this.currentChart');

      // Set chart size and draw
      console.log('[CHART_DISPLAY] Setting chart size and drawing');
      chart.setSize(canvasWidth-10, canvasHeight);

      const bounds = new jsfc.Rectangle(0, 0, canvasWidth, canvasHeight);
      chart.draw(ctx, bounds);

      console.log('[CHART_DISPLAY] Multi-subplot chart rendered successfully');
      return chart;

    } catch (error) {
      console.error('[CHART_DISPLAY] Error creating multi-subplot chart:', error);
      console.error('[CHART_DISPLAY] Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * Update multi-subplot chart with new CSV data
   * Updates all subplots with new data and rescales shared X-axis
   * Uses this.currentChart, this.currentChartInfo and this.currentCanvas for rendering
   *
   * @param {array} allCSVLines - All CSV lines (including new ones)
   */
  updateMultiSubplotChart(allCSVLines) {
    // Safety check
    if (document.body.className !== 'chart-mode') {
      return;
    }

    const chart = this.currentChart;
    const chartInfo = this.currentChartInfo;

    // Check if we have new data
    if (allCSVLines.length <= this.lastDataLineCount) {
      return; // No new data
    }

    console.log('[CHART_DISPLAY] Updating multi-subplot chart with new data. Previous:', this.lastDataLineCount, 'Current:', allCSVLines.length);
    console.log('[CHART_DISPLAY] Current chart isDummy:', chartInfo.isDummy, 'fieldCount:', chartInfo.fieldCount);

    const maxPoints = chartInfo.maxPoints;

    // Check if this is a dummy chart and data has different field count
    if (chartInfo.isDummy) {
      // Get actual field counts from csvCollector (data files)
      const fieldCounts = window.csvCollector ? window.csvCollector.getFieldCounts() : [];
      if (!fieldCounts || fieldCounts.length === 0) {
        console.log('[CHART_DISPLAY] Dummy chart: no field counts available from csvCollector');
        return;
      }

      const maxFieldCount = Math.max(...fieldCounts.map(f => parseInt(f)));

      console.log('[CHART_DISPLAY] Dummy chart detected. Chart fieldCount:', chartInfo.fieldCount, 'csvCollector fieldCounts:', fieldCounts, 'maxFieldCount:', maxFieldCount);

      if (maxFieldCount !== chartInfo.fieldCount) {
        // Field count mismatch - recreate chart with actual data structure
        console.log('[CHART_DISPLAY] Field count mismatch! Recreating chart with fieldCount:', maxFieldCount);

        // Create new chartInfo matching actual data
        const useCountFlag = maxFieldCount === 1;
        const allLabels = Array.from({length: maxFieldCount}, (_, i) => `field${i + 1}`);
        const xAxisFieldLabel = useCountFlag ? 'Count' : allLabels[0];

        let yFieldLabels;
        let fieldSpecs;
        if (useCountFlag) {
          yFieldLabels = allLabels;
          fieldSpecs = allLabels.map((label, idx) => ({
            label: label,
            plotNo: null,
            index: idx
          }));
        } else {
          yFieldLabels = allLabels.slice(1);
          fieldSpecs = allLabels.slice(1).map((label, idx) => ({
            label: label,
            plotNo: null,
            index: idx + 1
          }));
        }

        const newChartInfo = {
          title: chartInfo.title,
          maxPoints: limit,
          allLabels: allLabels,
          nonBlankLabels: allLabels,
          fieldCount: maxFieldCount,
          hasPlotNo: false,
          useCountFlag: useCountFlag,
          useCountAsXAxis: useCountFlag,
          xAxisFieldIndex: useCountFlag ? -1 : 0,
          xAxisFieldLabel: xAxisFieldLabel,
          isDummy: false, // Now it's real data
          subplots: [{
            plotNo: 1,
            fieldSpecs: fieldSpecs,
            fieldLabels: yFieldLabels
          }]
        };

        // Reparse with new chartInfo
        const parseResult = this.parseCSVToDatasetWithPlotNo(allCSVLines, newChartInfo, maxPoints);
        if (parseResult) {
          // Recreate chart with new structure
          const newChart = this.createAndDisplayMultiSubplotChart(chartInfo.title, newChartInfo, parseResult, this.currentCanvas);
          if (newChart) {
            this.currentChart = newChart;
            this.currentChartInfo = newChartInfo;
            this.lastDataLineCount = allCSVLines.length;
            console.log('[CHART_DISPLAY] Dummy chart replaced with real chart structure');
            return;
          }
        }
        console.warn('[CHART_DISPLAY] Failed to recreate chart with new field count');
        return;
      }
    }

    // Normal update: parse CSV data with current chartInfo
    const parseResult = this.parseCSVToDatasetWithPlotNo(allCSVLines, chartInfo, maxPoints);
    if (!parseResult) {
      console.warn('[CHART_DISPLAY] parseCSVToDatasetWithPlotNo returned null');
      return;
    }

    // Get the plot - always a CombinedDomainXYPlot with our unified architecture
    const combinedPlot = chart.getPlot();
    const subplots = combinedPlot.getSubplots();
    if (!subplots || subplots.length === 0) {
      console.warn('[CHART_DISPLAY] No subplots found');
      return;
    }

    // Update each subplot with new data
    for (let i = 0; i < Math.min(subplots.length, parseResult.subplotInfo.length); i++) {
      const subplot = subplots[i];
      const subplotInfo = parseResult.subplotInfo[i];

      console.log('[CHART_DISPLAY] Updating subplot', i, 'with new dataset');
      subplot.setDataset(subplotInfo.dataset);
    }

    // Update shared X-axis range based on new data
    // Get X-axis data bounds from first subplot's first series
    if (subplots.length > 0 && parseResult.subplotInfo.length > 0) {
      const firstSubplot = subplots[0];
      const firstDataset = firstSubplot.getDataset();

      if (firstDataset && firstDataset.seriesCount() > 0) {
        const xMin = this.calculateMinValue(firstDataset, 0);
        const xMax = this.calculateMaxValue(firstDataset, 0);

        if (xMin !== undefined && xMax !== undefined) {
          console.log('[CHART_DISPLAY] X-axis data range: min=', xMin, 'max=', xMax);

          const xAxis = combinedPlot.getXAxis();
          if (xAxis) {
            // Ensure upper > lower (add small padding if equal)
            let boundsMin = xMin;
            let boundsMax = xMax;
            if (boundsMin === boundsMax) {
              const padding = Math.abs(boundsMin) * 0.1 || 1;
              boundsMin -= padding;
              boundsMax += padding;
            }
            xAxis.setBounds(boundsMin, boundsMax);
            console.log('[CHART_DISPLAY] Updated X-axis bounds: min=', boundsMin, 'max=', boundsMax);
          }
        }
      }
    }

    // Redraw chart.  Clear the pixel buffer first so polling-tick redraws
    // don't accumulate stale plot ink over time.
    this.currentCanvas.getContext('2d').clearRect(0, 0, this.currentCanvas.width, this.currentCanvas.height);
    const ctx = new jsfc.CanvasContext2D(this.currentCanvas);
    chart.setSize(this.currentCanvas.width-10, this.currentCanvas.height);
    const bounds = new jsfc.Rectangle(0, 0, this.currentCanvas.width, this.currentCanvas.height);
    chart.draw(ctx, bounds);

    this.lastDataLineCount = allCSVLines.length;
    const limitedLines = this.getLimitedLines(allCSVLines, maxPoints);
    console.log('[CHART_DISPLAY] Multi-subplot chart updated - showing', limitedLines.length, 'of', allCSVLines.length, 'CSV lines (maxPoints:', maxPoints, ')');
  }

  /**
   * Start polling for multi-subplot chart updates.
   * Reads the chart to update from this.currentChartInfo on every tick.
   * @param {number} interval - Polling interval in milliseconds (default 500)
   */
  startMultiSubplotUpdatePolling(interval = 500) {
    if (this.multiSubplotUpdateInterval) {
      clearInterval(this.multiSubplotUpdateInterval);
    }

    console.log('[CHART_DISPLAY] Starting multi-subplot update polling with interval:', interval, 'ms, isDummy:', this.currentChartInfo.isDummy);

    this.multiSubplotUpdateInterval = setInterval(() => {
      // Check if still in chart mode
      if (document.body.className !== 'chart-mode') {
        return;
      }

      if (!window.csvCollector) {
        return;
      }

      const chartInfo = this.currentChartInfo;
      let allLines;

      // For dummy charts, check ALL field counts from csvCollector, not just the dummy's fieldCount
      // This allows dummy charts to detect and adopt data with different field counts
      if (chartInfo.isDummy) {
        // Get all available field counts
        const fieldCounts = window.csvCollector.getFieldCounts();
        if (fieldCounts && fieldCounts.length > 0) {
          // Get max field count and load its data
          const maxFieldCount = Math.max(...fieldCounts.map(f => parseInt(f)));
          allLines = window.csvCollector.getCSVLines(maxFieldCount);
        } else {
          allLines = [];
        }
      } else {
        // For non-dummy charts, load data for the specific fieldCount
        allLines = window.csvCollector.getFieldCounts().includes(chartInfo.fieldCount)
          ? window.csvCollector.getCSVLines(chartInfo.fieldCount) : [];
      }

      // Update "Display Points of N" label with current total line count —
      // do this even while frozen, since CSV data keeps accumulating in the
      // background while frozen; only the chart redraw below is skipped.
      const lbl = document.getElementById('ccv-maxpoints-label');
      if (lbl) lbl.textContent = 'Display Points of ' + allLines.length;

      // Frozen: CSV is still stored but chart display does not update
      if (this.frozenStartRow !== null) {
        return;
      }

      this.updateMultiSubplotChart(allLines);
    }, interval);
  }

  /**
   * Stop multi-subplot update polling
   */
  stopUpdatePolling() {
    if (this.multiSubplotUpdateInterval) {
      clearInterval(this.multiSubplotUpdateInterval);
      this.multiSubplotUpdateInterval = null;
      console.log('[CHART_DISPLAY] Stopped multi-subplot update polling');
    }
  }


  /**
   * Resize canvas to fill available space (accounting for layout and divider)
   * @param {HTMLCanvasElement} canvas - Canvas element to resize
   * @returns {boolean} - True if canvas was resized, false otherwise
   */
  resizeCanvasToFitSpace(canvas) {
    if (!canvas) {
      console.log('[CHART_DISPLAY] resizeCanvasToFitSpace: canvas is null/undefined');
      return false;
    }

    // Get the canvas wrapper's actual visible dimensions
    const wrapper = canvas.parentElement; // canvas-wrapper
    if (!wrapper) {
      console.log('[CHART_DISPLAY] resizeCanvasToFitSpace: parent wrapper not found');
      return false;
    }

    // Use getBoundingClientRect to get actual available dimensions
    const rect = wrapper.getBoundingClientRect();
    console.log('[CHART_DISPLAY] resizeCanvasToFitSpace: wrapper rect =', {
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top
    });

    // Calculate new dimensions (accounting for small margin)
    const newWidth = Math.max(Math.floor(rect.width - 2), 200);
    const newHeight = Math.max(Math.floor(rect.height - 2), 200);

    console.log('[CHART_DISPLAY] resizeCanvasToFitSpace: calculated dimensions =', {
      newWidth,
      newHeight,
      lastWidth: this.lastCanvasWidth,
      lastHeight: this.lastCanvasHeight
    });

    // Check if dimensions actually changed
    if (this.lastCanvasWidth === newWidth && this.lastCanvasHeight === newHeight) {
      console.log('[CHART_DISPLAY] resizeCanvasToFitSpace: dimensions unchanged, skipping');
      return false; // No resize needed
    }

    // Update canvas pixel dimensions
    canvas.width = newWidth;
    canvas.height = newHeight;

    // Track new dimensions
    this.lastCanvasWidth = newWidth;
    this.lastCanvasHeight = newHeight;

    console.log('[CHART_DISPLAY] Canvas resized to:', newWidth, 'x', newHeight);
    return true; // Canvas was resized
  }

  /**
   * Handle window resize event for chart display
   * Resizes canvas and redraws chart if dimensions changed
   * Calls chart.setSize() to inform chart of new dimensions (like LineChartDemo)
   * @param {HTMLCanvasElement} canvas - Canvas element
   */
  handleResize(canvas) {
    console.log('[CHART_DISPLAY] handleResize() called, canvas exists:', !!canvas, 'chart exists:', !!this.currentChart);

    if (!canvas || !this.currentChart) {
      console.log('[CHART_DISPLAY] handleResize: early return - canvas or chart missing');
      return;
    }

    // Attempt to resize canvas to fit available space
    const wasResized = this.resizeCanvasToFitSpace(canvas);
    console.log('[CHART_DISPLAY] handleResize: canvas was resized:', wasResized);

    if (wasResized) {
      // Canvas dimensions changed, tell chart about new size and redraw
      console.log('[CHART_DISPLAY] Redrawing chart after resize, new size:', canvas.width, 'x', canvas.height);
      try {
        // CRITICAL: Call chart.setSize() to recalculate chart internal layout
        // This tells JSFreeChart to recalculate axes, legend, plot area, etc.
        // without this, the chart won't visually resize even though canvas dimensions change
        this.currentChart.setSize(canvas.width-10, canvas.height);
        console.log('[CHART_DISPLAY] Called chart.setSize(' + (canvas.width-10) + ', ' + (canvas.height) + ')');

        // Clear the pixel buffer first — canvas resize already does this for
        // dimension changes, but be explicit so any future change that calls
        // handleResize without a dimension change still gets a clean draw.
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        const ctx = new jsfc.CanvasContext2D(canvas);
        const bounds = new jsfc.Rectangle(0, 0, canvas.width-0, canvas.height-0);
        this.currentChart.draw(ctx, bounds);
        console.log('[CHART_DISPLAY] Chart redrawn successfully after resize');
      } catch (error) {
        console.error('[CHART_DISPLAY] Error redrawing chart after resize:', error);
        throw error;
      }
    }
  }


  /**
   * Clear current chart state
   * Stops polling and resets all chart-related state
   */
  clear() {
    this.stopUpdatePolling();
    this.currentChart = null;
    this.currentDataset = null;
    this.currentLabels = null;
    this.currentCanvas = null;
    this.lastDataLineCount = 0;
    this.frozenStartRow = null;
    this.lastCanvasWidth = 0;
    this.lastCanvasHeight = 0;
    console.log('[CHART_DISPLAY] Cleared chart state');
  }
}

// Single, always-available holder for the currently displayed chart's parsed
// info. A plain property on the real window global (not on any lazily
// constructed instance like chartDisplay/drawingViewer/csvCollector), so
// this accessor and DrawingViewer's matching one in chartAndRawData.js never
// need an existence guard, and the two classes' `currentChartInfo` can no
// longer drift apart the way they used to.
window.currentChartInfo = null;
Object.defineProperty(ChartDisplay.prototype, 'currentChartInfo', {
  get() { return window.currentChartInfo; },
  set(value) { window.currentChartInfo = value; }
});

// Same single-holder treatment for the rendered jsfc.Chart object — it had
// the identical drift problem (chartDisplay's copy updating on redraw while
// drawingViewer's separate copy went stale, worked around with `||` fallback
// reads in toolbarAndMenu.js).
window.currentChart = null;
Object.defineProperty(ChartDisplay.prototype, 'currentChart', {
  get() { return window.currentChart; },
  set(value) { window.currentChart = value; }
});

// Make class available globally for browser use
window.ChartDisplay = ChartDisplay;
