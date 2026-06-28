#!/usr/bin/env node
/**
 * build_boards.js
 *
 * Walks ../variants/<family>/<variant>/ and processes every directory
 * that holds BOTH a `pins_arduino.h` AND a sibling `board.json`.  The
 * `board.json` is the single source of truth for every board-specific
 * detail the .h file does not itself carry — names, baud rates, parser
 * dialect, and chip-level quirks like the ESP32 input-only GPIO set.
 * The script stays generic: no per-board constants live in this file.
 *
 * Output layout:
 *
 *   pfodWeb_src/designer/boards/<boardName>/<boardName>.json
 *
 * board.json schema (see the existing files under variants/ for
 * concrete examples):
 *
 *   {
 *     "boardName":      "Uno",                  // required, output filename
 *     "displayName":    "Arduino Uno",          // required, shown in UI
 *     "family":         "avr" | "esp32",        // required, picks parser
 *     "defaultBaud":    9600,                   // required
 *     "supportedBauds": [300, ..., 115200],     // required
 *     "inputOnlyGpios": [34, 35, ...],          // optional, ESP32-style
 *     "usableGpios":    [0, 1, 2, ...]          // optional, ESP32-style
 *   }
 *
 * Adding a new board: drop the variant directory in with its `pins_arduino.h`
 * and a `board.json`, then re-run.  No code changes needed here.
 *
 * Usage:
 *   node build_boards.js
 *
 * Two parser dialects are supported:
 *   - AVR-style  (Uno, Mega): #define-based pin maps + PROGMEM arrays with
 *                             USART#_RX/USART#_TX comments.
 *   - ESP32-style:            `static const uint8_t NAME = value;` aliases
 *                             (TX, RX, SDA, SCL, SS, MOSI, MISO, SCK,
 *                              A0..A19, DAC1, DAC2, ...).
 *
 * Pin naming:
 *   - AVR digital pin <p>      -> name "D<p>"
 *   - AVR analog pin (Ax)      -> name "A<x>"   (analog offset taken from
 *                                 analogInputToDigitalPin macro)
 *   - ESP32 GPIO <g>           -> name "GPIO<g>"
 *   - Labels append " (FN)" with one or more function tags.  Multi-serial
 *     boards number them: TX0/RX0/TX1/RX1/... matching Serial/Serial1/...
 *     Single-serial boards use plain TX/RX.
 *
 * Capability ordering follows the existing Uno.json convention:
 *   analog_input, digital_input, digital_output, pwm_output,
 *   then spi/i2c/dac function tags.  serial_rx and serial_tx are emitted
 *   alone on pins dedicated to that USART (no parallel digital role).
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

/// Recursively resolve `#include "relative/path"` directives in a
/// pins_arduino.h source string.  Each matched include line is replaced
/// with the full content of the referenced file so the AVR/ESP32 parsers
/// see a single flat string (e.g. yun includes leonardo, micro includes
/// leonardo).  A visited set prevents infinite loops on circular includes.
function resolveIncludes(src, filePath, visited) {
  if (!visited) visited = new Set();
  if (visited.has(filePath)) return '';
  visited.add(filePath);
  const dir = path.dirname(filePath);
  return src.replace(/#include\s+"([^"]+)"/g, (match, includePath) => {
    const abs = path.resolve(dir, includePath);
    if (!fs.existsSync(abs)) return match;   // leave system-style includes untouched
    return resolveIncludes(fs.readFileSync(abs, 'utf8'), abs, visited);
  });
}

/// The canonical field set every variant's board.json must declare —
/// no missing fields, no extras.  Keeping the schema uniform across
/// variants makes the configs trivially diffable and prevents silent
/// drift when a new field is added (every existing board.json must be
/// updated, not just the one that needs the value).  Boards for which
/// a field is meaningless declare it as an empty array / sentinel
/// rather than omitting it.
///
/// The .h file is the source of truth for which GPIOs the board
/// exposes (AVR via NUM_DIGITAL_PINS, ESP32 via the union of pin
/// aliases / pin-numbered #defines).  Only board-level facts the .h
/// does NOT carry live here.
///
/// boardName and displayName are FALLBACKS only; when a sibling-or-
/// ancestor boards.txt exists, the `<id>` and `<id>.name=` values from
/// the matching `<id>.build.variant=<variantDir>` entry override both
/// fields.  This is what gives each variant under a chip-shared
/// board.json its own unique identity in the output.
const REQUIRED_BOARD_FIELDS = [
  'boardName',
  'displayName',
  'family',
  'defaultBaud',
  'supportedBauds',
  'inputOnlyGpios',
  // List of transports the board can talk pfod over.  Values are the
  // lowercase machine identifiers pfodCommon.html uses on the protocol
  // radios: 'serial', 'ble', 'tcp', 'http'.  AVR boards typically only
  // ship Serial; ESP32 family supports all four (Serial via UART, BLE
  // via Bluetooth LE, TCP via the WiFi stack, HTTP via the WiFi stack
  // with a small server library).
  'connections',
  // Map of GPIO-number-as-string to plain-text note shown under the pin
  // label in the pin picker.  Use {} when a chip family has no boot-time
  // pin restrictions (AVR) or when the notes have not yet been researched.
  'pinNotes',
  // Map of GPIO-number-as-string to {capabilities, note?} describing every
  // GPIO the chip silicon exposes.  GPIOs absent from pins_arduino.h are
  // added as "GPIO<n>" with "Check if available on board" note.  Use {}
  // for AVR boards (no GPIO concept applies).
  'chipGpios',
  // Default PWM output range and Arduino method name.  All current boards
  // use analogWrite with 8-bit resolution: { min: 0, max: 255, method: "analogWrite" }.
  'pwm',
  // Hardware DAC output range, voltage span, and Arduino method name.
  // Use {} for boards without a hardware DAC.
  // With DAC: { min: 0, max: 255, minVolts: "0.0", maxVolts: "3.3", method: "dacWrite" }.
  'dac',
  // ADC resolution and default reference voltage.
  // Shape: { bits, max, defaultRefVolts } — e.g. AVR: { bits:10, max:1023, defaultRefVolts:"5.0" }.
  'adc',
];

/// Parsers known to this script — values that may appear in board.json's
/// `family` field.  Adding support for a new MCU family means writing a
/// build<Family>Board() function and registering its key here.
const SUPPORTED_FAMILIES = new Set(['ccode', 'avr', 'esp32']);

/// Strip JSONC-style `//` line comments and `/* ... */` block comments
/// from a text payload so the result is plain JSON ready for JSON.parse.
/// Quoted strings are passed through untouched (so the literal sequence
/// `"//"` inside a value is not treated as a comment).  Trailing commas
/// are NOT removed — author the JSON without them.
function stripJsonComments(text) {
  let out         = '';
  let i           = 0;
  let inString    = false;
  let stringQuote = '';
  while (i < text.length) {
    const c    = text[i];
    const next = text[i + 1];

    if (inString) {
      out += c;
      if (c === '\\' && i + 1 < text.length) {
        out += text[i + 1];   // preserve escape sequence verbatim
        i   += 2;
        continue;
      }
      if (c === stringQuote) inString = false;
      i++;
      continue;
    }

    if (c === '"' || c === "'") {
      inString    = true;
      stringQuote = c;
      out        += c;
      i++;
      continue;
    }

    if (c === '/' && next === '/') {
      // Line comment — skip up to (but not including) the newline so
      // line numbers in the resulting JSON stay aligned with the source.
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }

    if (c === '/' && next === '*') {
      // Block comment — replace with a single space so adjacent tokens
      // stay separated (e.g. `123/*x*/,456` → `123 ,456`).
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i  += 2;
      out += ' ';
      continue;
    }

    out += c;
    i++;
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// AVR-style parser (Uno, Mega)
// ──────────────────────────────────────────────────────────────────────

/// Pull a numeric value out of a "#define NAME (n)" / "#define NAME n"
/// directive.  Returns null if not found so callers can choose a default.
function extractDefineNumber(src, name) {
  const re = new RegExp('#define\\s+' + name + '\\s+\\(?\\s*(-?\\d+)\\s*\\)?', 'm');
  const m  = src.match(re);
  return m ? parseInt(m[1], 10) : null;
}

/// Return the right-hand-side text of a function-style "#define NAME(args) ..."
/// directive (everything after the closing argument paren, trimmed).  Used
/// to capture predicates like digitalPinHasPWM whose body is a C expression.
/// If the macro is defined more than once (typically inside an #if/#else
/// for legacy MCU variants), the LAST definition wins — pins_arduino.h
/// puts the legacy branch in the #if and the current-default branch in
/// the #else, so picking the last match yields the modern definition.
function extractDefineMacroBody(src, name) {
  const re = new RegExp('#define\\s+' + name + '\\s*\\([^)]*\\)\\s+(.*)', 'g');
  let m, last = null;
  while ((m = re.exec(src)) !== null) last = m[1].trim();
  return last;
}

/// Find the digital-pin offset where the analog inputs begin by parsing
/// "analogInputToDigitalPin(p)  ((p < N) ? (p) + OFFSET : -1)".  Returns
/// null if the macro is not present (board has no analog pins).
/// Fallback: some boards (robot_control, robot_motor) skip the macro and
/// declare `#define PIN_A0 (OFFSET)` directly — accept that too.
function parseAnalogOffset(src) {
  const m = src.match(/analogInputToDigitalPin\(p\)\s+\(\(p\s*<\s*\d+\)\s*\?\s*\(p\)\s*\+\s*(\d+)/);
  if (m) return parseInt(m[1], 10);
  const m2 = src.match(/#define\s+PIN_A0\s+\(\s*(\d+)\s*\)/);
  return m2 ? parseInt(m2[1], 10) : null;
}

/// Build a predicate(pin) -> bool from the digitalPinHasPWM macro body.
/// C operators used (==, >=, <=, &&, ||) are all valid JS, so the body
/// can be evaluated directly after substituting the parameter name.
/// @returns {function(number):boolean}
function buildPwmPredicate(src) {
  const body = extractDefineMacroBody(src, 'digitalPinHasPWM');
  if (!body) return () => false;
  // (p) appears literally in the macro; rename to plain p for clarity.
  const jsExpr = body.replace(/\(\s*p\s*\)/g, 'p');
  try {
    // eslint-disable-next-line no-new-func
    return new Function('p', 'return ' + jsExpr + ';');
  } catch (e) {
    throw new Error('Could not parse digitalPinHasPWM expression "' + body + '": ' + e.message);
  }
}

/// Scan the PROGMEM arrays for USART#_RX / USART#_TX trailing comments.
/// Returns { pinNumber: { unit, dir } } where unit is the USART index
/// (0..3) and dir is 'RX' or 'TX'.
function parseAvrSerialPins(src) {
  const re  = /\*\*\s*(\d+)\s*\*\*\s*USART(\d+)_(RX|TX)/g;
  const out = {};
  let m;
  while ((m = re.exec(src)) !== null) {
    out[parseInt(m[1], 10)] = { unit: parseInt(m[2], 10), dir: m[3] };
  }
  return out;
}

/// Count the distinct hardware serial ports declared.  Mega defines
/// SERIAL_PORT_HARDWARE, _HARDWARE1, _HARDWARE2, _HARDWARE3 (= 4 ports);
/// Uno defines only SERIAL_PORT_HARDWARE (= 1 port).
function countAvrSerials(src) {
  const numbered = src.match(/#define\s+SERIAL_PORT_HARDWARE(\d+)\b/g) || [];
  const nums     = new Set(numbered.map(s => s.match(/(\d+)\b/)[1]));
  const hasBase  = /#define\s+SERIAL_PORT_HARDWARE\b/.test(src);
  return nums.size + (hasBase ? 1 : 0);
}

/// Build the output `connections` block from a board.json's supported-
/// transports list + the chip's serial config.  Returned shape:
///
///   {
///     serial: { availablePorts, defaultPort, defaultBaud, supportedBauds },
///     ble:    {},                  // present iff supported, body for future config
///     tcp:    {},
///     http:   {}
///   }
///
/// The presence of a key indicates the board supports that transport;
/// non-serial values are empty objects today because no per-protocol
/// config has been needed yet (a future change can fill them without
/// touching call sites).  Serial is special-cased because every board
/// has serial and the serial-specific fields (baud rates, port list)
/// live at the top level of the source board.json — they get rolled
/// into the serial entry here.
///
/// @param {object}   cfg            — parsed board.json (must carry
///                                    `connections` array, `defaultBaud`,
///                                    `supportedBauds`)
/// @param {string[]} availablePorts — board-specific serial port list
///                                    (e.g. ['Serial', 'Serial1'] for mega)
/// @returns {object}
function _buildConnectionsBlock(cfg, availablePorts) {
  const out = {};
  for (const proto of cfg.connections) {
    if (proto === 'serial') {
      out.serial = {
        availablePorts,
        defaultPort:    availablePorts[0],
        defaultBaud:    cfg.defaultBaud,
        supportedBauds: cfg.supportedBauds,
      };
    } else {
      out[proto] = {};
    }
  }
  return out;
}

/// Build a board JSON descriptor from an AVR pins_arduino.h source.
function buildAvrBoard(src, cfg) {
  // Most boards define NUM_DIGITAL_PINS directly.  Robot boards (robot_control,
  // robot_motor) skip it and use a PIN_A0+(count of PIN_A<n>) pattern instead.
  let numDigital = extractDefineNumber(src, 'NUM_DIGITAL_PINS');
  if (numDigital === null) {
    const a0       = extractDefineNumber(src, 'PIN_A0');
    const anaCount = (src.match(/#define\s+PIN_A\d+\b/g) || []).length;
    if (a0 !== null && anaCount > 0) numDigital = a0 + anaCount;
  }
  if (numDigital === null) {
    throw new Error('NUM_DIGITAL_PINS not found in ' + cfg.variantPath);
  }
  // Some boards (robot_control, robot_motor) also omit NUM_ANALOG_INPUTS.
  // Fall back to counting #define PIN_A<n> entries.
  let numAnalog = extractDefineNumber(src, 'NUM_ANALOG_INPUTS');
  if (numAnalog === null) {
    numAnalog = (src.match(/#define\s+PIN_A\d+\b/g) || []).length;
  }
  numAnalog = numAnalog || 0;
  const analogOffset = parseAnalogOffset(src);
  const pwmFn        = buildPwmPredicate(src);

  const spiSs   = extractDefineNumber(src, 'PIN_SPI_SS');
  const spiMosi = extractDefineNumber(src, 'PIN_SPI_MOSI');
  const spiMiso = extractDefineNumber(src, 'PIN_SPI_MISO');
  const spiSck  = extractDefineNumber(src, 'PIN_SPI_SCK');
  const wireSda = extractDefineNumber(src, 'PIN_WIRE_SDA');
  const wireScl = extractDefineNumber(src, 'PIN_WIRE_SCL');

  const serialPinMap = parseAvrSerialPins(src);
  let   totalSerials = countAvrSerials(src);

  // standard_uno does not annotate USART pins in comments — fall back to
  // the AVR convention of D0=RX, D1=TX for the single Serial port.
  if (Object.keys(serialPinMap).length === 0 && totalSerials >= 1) {
    serialPinMap[0] = { unit: 0, dir: 'RX' };
    serialPinMap[1] = { unit: 0, dir: 'TX' };
  }

  const pins = [];
  for (let p = 0; p < numDigital; p++) {
    const isAnalog = analogOffset !== null
                  && p >= analogOffset
                  && p < analogOffset + numAnalog;
    const name     = isAnalog ? ('A' + (p - analogOffset)) : ('D' + p);
    // A<n> names are real Arduino constants; D<n> names are not — use the number.
    const codeName = isAnalog ? name : String(p);

    const caps     = [];
    const fnLabels = [];

    const ser = serialPinMap[p];
    if (ser) {
      // USART hardware lines: dedicated, no parallel digital role.
      caps.push(ser.dir === 'RX' ? 'serial_rx' : 'serial_tx');
      const suffix = totalSerials > 1 ? String(ser.unit) : '';
      fnLabels.push(ser.dir + suffix);
    } else {
      if (isAnalog) caps.push('analog_input');
      caps.push('digital_input', 'digital_output');
      if (pwmFn(p)) caps.push('pwm_output');
      if (p === spiSs)   { caps.push('spi_ss');   fnLabels.push('SS');   }
      if (p === spiMosi) { caps.push('spi_mosi'); fnLabels.push('MOSI'); }
      if (p === spiMiso) { caps.push('spi_miso'); fnLabels.push('MISO'); }
      if (p === spiSck)  { caps.push('spi_sck');  fnLabels.push('SCK');  }
      if (p === wireSda) { caps.push('i2c_sda');  fnLabels.push('SDA');  }
      if (p === wireScl) { caps.push('i2c_scl');  fnLabels.push('SCL');  }
    }

    const label = fnLabels.length > 0
                ? (name + ' (' + fnLabels.join(', ') + ')')
                : name;
    pins.push({ name, label, codeName, capabilities: caps });
  }

  // Build the Serial port list: Serial, Serial1, Serial2, ... (one per USART).
  const availablePorts = [];
  for (let i = 0; i < totalSerials; i++) {
    availablePorts.push(i === 0 ? 'Serial' : ('Serial' + i));
  }
  if (availablePorts.length === 0) availablePorts.push('Serial');

  return {
    name:        cfg.displayName,
    connections: _buildConnectionsBlock(cfg, availablePorts),
    pwm:         cfg.pwm,
    dac:         cfg.dac,
    adc:         cfg.adc,
    pins,
  };
}

// ──────────────────────────────────────────────────────────────────────
// ESP32-style parser (esp32/esp32 variant)
// ──────────────────────────────────────────────────────────────────────

/// Parse every pin alias of the form
///   `static const     uint8_t NAME = <int>;`        — numeric literal
///   `static constexpr uint8_t NAME = <int>;`
///   `static const     uint8_t NAME = <OTHER_NAME>;` — alias chain
///   `static constexpr uint8_t NAME = <OTHER_NAME>;`
/// in an ESP32-style pins_arduino.h.  These are the declared pin names
/// (TX, RX, SDA, MISO, A0..A19, DAC1, T0..T14, etc.) and are the source
/// of truth for which GPIOs the board exposes.  Both `const` and
/// `constexpr` are accepted — recent Arduino-ESP32 variants (e.g.
/// arduino_nano_nora) use `static constexpr uint8_t` to allow the
/// declarations inside an #if/#else block to evaluate at compile time.
///
/// Two passes are performed:
///   1. Direct numeric assignments are recorded immediately.  When the
///      same name is assigned multiple numeric values (one per branch
///      of an #if/#else), the LAST occurrence wins — by convention the
///      branch carrying the physical GPIO numbers.
///   2. Alias-to-identifier assignments (e.g. `TX = D1`, `MISO = D12`,
///      `LEDR = LED_RED`) are resolved against the pass-1 map; the
///      resolution loop iterates to a fixed point so transitive chains
///      (A = B; B = C; C = 42) all reduce to the underlying GPIO.
///
/// `#define`-form pin macros are intentionally NOT parsed: they too
/// often coexist with non-pin numeric defines like `NEOPIXEL_NUM 1` or
/// `RGB_BRIGHTNESS 64` that would be mis-attributed to a GPIO.  A board
/// that wants to expose extra pins (board-specific TFT/NeoPixel/etc.)
/// should declare them via `static const uint8_t` or
/// `static constexpr uint8_t`.
function parseEsp32Consts(src) {
  const out     = {};
  const pending = [];   // [aliasName, refName] for pass-2 resolution

  const re = /static\s+(?:const|constexpr)\s+uint8_t\s+(\w+)\s*=\s*(\d+|[A-Za-z_]\w*)\s*;/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1], rhs = m[2];
    if (/^\d+$/.test(rhs)) {
      out[name] = parseInt(rhs, 10);
    } else {
      pending.push([name, rhs]);
    }
  }

  // Fixed-point alias resolution.  Each pass copies any pending alias
  // whose referent is now known; loop until a pass makes no progress.
  // Names already in `out` from a direct numeric assignment win over an
  // alias of the same name (no overwrite).
  let changed;
  do {
    changed = false;
    for (const [name, ref] of pending) {
      if (name in out) continue;
      if (ref in out) {
        out[name] = out[ref];
        changed = true;
      }
    }
  } while (changed);

  return out;
}

/// Build a board JSON descriptor from an ESP32-style pins_arduino.h.
/// The .h file is the source of truth for which GPIOs the board exposes
/// — every pin number referenced by a `static const uint8_t` alias
/// becomes a routable pin.  Pins listed in `cfg.inputOnlyGpios` (chip-
/// level fact in board.json) drop digital_output and pwm_output; all
/// other pins get pwm_output too because the ESP32 LEDC peripheral can
/// drive PWM on any output-capable pad.
///
/// Naming convention (per the .h file declarations):
///   - aliased pin    -> name = "<ALIAS>",  label = "<ALIAS> (GPIO<n>)"
///                       e.g.  MISO = 37    -> "MISO (GPIO37)"
///   - unaliased pin  -> name = "GPIO<n>",  label = "GPIO<n>"
///
/// When a single GPIO carries multiple aliases (e.g. DAC1 and A18 both
/// pointing at GPIO25, or MISO and A5 both at GPIO5), the alias used
/// for the name is chosen by ALIAS_PRIORITY below (comms first, then
/// DAC, then analog, then any remaining).  Touch-sensor aliases
/// (T1, T2, ...) are never used as the pin name: if a GPIO's only
/// alias is a touch number, the pin reverts to "GPIO<n>".  All
/// capabilities are still attached to the pin regardless of which
/// alias won the name.
function buildEsp32Board(src, cfg) {
  const consts       = parseEsp32Consts(src);
  const inputOnlySet = new Set(cfg.inputOnlyGpios);
  const pinNotesMap  = cfg.pinNotes || {};
  const chipGpiosMap = cfg.chipGpios || {};

  // Reverse map: gpio number -> list of aliases declared for it, in
  // declaration order.  Pins that share a GPIO number (DAC1+A18 both
  // pointing at 25) end up sharing this list entry.
  const aliasesByGpio = new Map();
  for (const [aliasName, gpio] of Object.entries(consts)) {
    if (!Number.isInteger(gpio) || gpio < 0) continue;
    if (!aliasesByGpio.has(gpio)) aliasesByGpio.set(gpio, []);
    aliasesByGpio.get(gpio).push(aliasName);
  }

  // Build the union of all GPIO numbers: those declared in pins_arduino.h
  // plus every GPIO the chip silicon exposes (from chipGpios).  Chip-level
  // GPIOs absent from the .h file are added as "GPIO<n>" with the note
  // "Check if available on board".
  const allGpios = new Set(aliasesByGpio.keys());
  for (const key of Object.keys(chipGpiosMap)) {
    const n = parseInt(key, 10);
    if (!isNaN(n) && n >= 0) allGpios.add(n);
  }

  const tx   = consts.TX;
  const rx   = consts.RX;
  const sda  = consts.SDA;
  const scl  = consts.SCL;
  const ss   = consts.SS;
  const mosi = consts.MOSI;
  const miso = consts.MISO;
  const sck  = consts.SCK;
  const dac1 = consts.DAC1;
  const dac2 = consts.DAC2;

  // When a GPIO has multiple aliases, pick the one that best describes
  // the pin to the user.  Higher in this list = wins.  Touch-sensor
  // aliases (T1, T2, ...) are excluded entirely — touch isn't a
  // designer PinType, and a pin whose ONLY alias is a touch number is
  // better surfaced as plain "GPIO<n>" than as a meaningless "T7".
  const ALIAS_PRIORITY = ['TX', 'RX', 'SDA', 'SCL', 'SS', 'MOSI', 'MISO', 'SCK', 'DAC1', 'DAC2'];
  function _primaryAlias(aliases) {
    const named = aliases.filter((a) => !/^T\d+$/.test(a));
    if (named.length === 0) return null;
    for (const cand of ALIAS_PRIORITY) {
      if (named.includes(cand)) return cand;
    }
    const analog = named.find((a) => /^A\d+$/.test(a));
    if (analog) return analog;
    return named[0];
  }

  // Aliases suitable for the combined display name: D<n>, A<n>, DAC<n>.
  // Touch aliases (T<n>) and function aliases (TX, SDA, ...) are excluded
  // because they describe roles, not board pin numbers.
  function _displayAliases(aliases) {
    return aliases.filter((a) => /^D\d+$/.test(a) || /^A\d+$/.test(a) || /^DAC\d+$/.test(a));
  }

  // Best single alias to emit in generated C++ code.
  // Priority: D<n> (board pin number) > A<n> (analog) > DAC<n> > comms aliases
  // > first non-touch alias.  Falls back to the raw GPIO integer when a pin
  // has no aliases at all in pins_arduino.h (i.e. not in the .h file).
  function _codeAlias(aliases, gpio) {
    const nonTouch = aliases.filter((a) => !/^T\d+$/.test(a));
    if (nonTouch.length === 0) return String(gpio);
    const d = nonTouch.find((a) => /^D\d+$/.test(a));
    if (d) return d;
    const a = nonTouch.find((a) => /^A\d+$/.test(a));
    if (a) return a;
    const dac = nonTouch.find((a) => /^DAC\d+$/.test(a));
    if (dac) return dac;
    for (const cand of ALIAS_PRIORITY) {
      if (nonTouch.includes(cand)) return cand;
    }
    return nonTouch[0];
  }

  // Canonical capability emission order for chip-generic capabilities.
  const CAP_ORDER = ['analog_input', 'digital_input', 'digital_output', 'pwm_output', 'dac_output'];

  const pins = [];
  const sortedGpios = [...allGpios].sort((a, b) => a - b);
  for (const g of sortedGpios) {
    const aliases     = aliasesByGpio.get(g) || [];
    const inPinsH     = aliases.length > 0;
    const gpioToken   = 'GPIO' + g;
    const primary     = _primaryAlias(aliases);
    const dispAliases = _displayAliases(aliases);
    let name, label;
    if (dispAliases.length > 0) {
      name  = dispAliases.join('/');
      label = name + ' (' + gpioToken + ')';
    } else {
      name  = primary || gpioToken;
      label = primary ? primary + ' (' + gpioToken + ')' : gpioToken;
    }
    const codeName = _codeAlias(aliases, g);

    // TX/RX pins are treated as dedicated USART lines (parallel-digital
    // re-use is technically possible via the pin matrix but conflicts
    // with the default Serial port — matches the AVR convention).
    if (g === rx) {
      const pinObj = { name, label, codeName, capabilities: ['serial_rx'] };
      const strapNote = pinNotesMap[String(g)];
      if (strapNote) pinObj.notes = strapNote;
      pins.push(pinObj);
      continue;
    }
    if (g === tx) {
      const pinObj = { name, label, codeName, capabilities: ['serial_tx'] };
      const strapNote = pinNotesMap[String(g)];
      if (strapNote) pinObj.notes = strapNote;
      pins.push(pinObj);
      continue;
    }

    // Build base capabilities from chipGpios when available (sourced from
    // datasheets — preferred), else fall back to the old derivation using
    // inputOnlySet and alias analysis.
    const chipEntry = chipGpiosMap[String(g)];
    let caps;
    if (chipEntry && chipEntry.capabilities) {
      const chipSet = new Set(chipEntry.capabilities);
      caps = CAP_ORDER.filter(c => chipSet.has(c));
    } else {
      const inputOnly = inputOnlySet.has(g);
      const hasAdc    = aliases.some(a => /^A\d+$/.test(a));
      caps = [];
      if (hasAdc) caps.push('analog_input');
      caps.push('digital_input');
      if (!inputOnly) {
        caps.push('digital_output');
        caps.push('pwm_output');
      }
      if (g === dac1 || g === dac2) caps.push('dac_output');
    }

    // Board-specific function capabilities from pins_arduino.h aliases.
    if (g === sda)  caps.push('i2c_sda');
    if (g === scl)  caps.push('i2c_scl');
    if (g === ss)   caps.push('spi_ss');
    if (g === mosi) caps.push('spi_mosi');
    if (g === miso) caps.push('spi_miso');
    if (g === sck)  caps.push('spi_sck');

    // Assemble notes.  Order: strapping note (highest priority), then
    // chip-level note (e.g. flash/USB), then "Check if available on board"
    // for GPIOs absent from pins_arduino.h.
    const noteParts = [];
    const strapNote = pinNotesMap[String(g)];
    if (strapNote) noteParts.push(strapNote);
    const chipNote = chipEntry && chipEntry.note;
    if (chipNote) noteParts.push(chipNote);
    if (!inPinsH) noteParts.push('Check if available on board');
    const finalNote = noteParts.join('\n');

    const pinObj = { name, label, codeName, capabilities: caps };
    if (finalNote) pinObj.notes = finalNote;
    pins.push(pinObj);
  }

  // The esp32/esp32 variant exposes a single hardware Serial (TX=1, RX=3);
  // additional UARTs exist on the chip but are not pre-mapped here.
  return {
    name:        cfg.displayName,
    connections: _buildConnectionsBlock(cfg, ['Serial']),
    pwm:         cfg.pwm,
    dac:         cfg.dac,
    adc:         cfg.adc,
    pins,
  };
}

// ──────────────────────────────────────────────────────────────────────
// "Minimal C Code" parser — no Arduino core, no GPIOs
// ──────────────────────────────────────────────────────────────────────

/// Build a board JSON descriptor for the "Minimal C Code" target.  This
/// family has no pin map at all — pins_arduino.h is a stub kept only so
/// variant discovery finds the directory; its contents are not parsed.
/// The board always reports zero pins, so the Designer's I/O-pin picker
/// has nothing to offer and disables itself (see editMenuItem.js).
function buildCcodeBoard(src, cfg) {
  return {
    name:        cfg.displayName,
    connections: _buildConnectionsBlock(cfg, ['Serial']),
    pwm:         cfg.pwm,
    dac:         cfg.dac,
    adc:         cfg.adc,
    pins:        [],
  };
}

// ──────────────────────────────────────────────────────────────────────
// Variant discovery
// ──────────────────────────────────────────────────────────────────────

/// Load and validate one variant's board.json.  The file is JSONC —
/// `//` and `/* */` comments are stripped before parsing.  The field
/// set must EXACTLY match REQUIRED_BOARD_FIELDS: missing fields and
/// extra fields are both reported (catches typos and stale schemas
/// across variants).  Empty arrays are the canonical "not applicable"
/// value for fields like inputOnlyGpios on AVR boards.
///
/// All issues for a single file are collected and printed together in a
/// clean indented format (no Error: prefix, no stack trace) so the user
/// can see every problem at once.  Returns the parsed config on success
/// or `null` if the file had any validation issues.
function _loadBoardConfig(jsonPath) {
  const issues = [];

  let raw;
  try {
    raw = fs.readFileSync(jsonPath, 'utf8');
  } catch (e) {
    _reportConfigIssues(jsonPath, ['cannot read file: ' + e.message]);
    return null;
  }

  let cfg;
  try {
    cfg = JSON.parse(stripJsonComments(raw));
  } catch (e) {
    _reportConfigIssues(jsonPath, ['invalid JSON: ' + e.message]);
    return null;
  }

  const present  = new Set(Object.keys(cfg));
  const required = new Set(REQUIRED_BOARD_FIELDS);
  for (const f of REQUIRED_BOARD_FIELDS) {
    if (!present.has(f)) issues.push('missing field: ' + f);
  }
  for (const f of Object.keys(cfg)) {
    if (!required.has(f)) issues.push('unknown field: ' + f);
  }

  // Type / value checks only run when the field-set check passed, so
  // type messages are not duplicated against a field already flagged
  // as missing.
  if (issues.length === 0) {
    if (!SUPPORTED_FAMILIES.has(cfg.family)) {
      issues.push('unsupported family: "' + cfg.family + '"' +
                  '  (known: ' + [...SUPPORTED_FAMILIES].join(', ') + ')');
    }
    if (!Array.isArray(cfg.supportedBauds)) {
      issues.push('field "supportedBauds" must be an array');
    }
    if (!Array.isArray(cfg.inputOnlyGpios)) {
      issues.push('field "inputOnlyGpios" must be an array (use [] when N/A)');
    }
    if (typeof cfg.chipGpios !== 'object' || Array.isArray(cfg.chipGpios)) {
      issues.push('field "chipGpios" must be a plain object (use {} when N/A)');
    }
    if (typeof cfg.pwm !== 'object' || Array.isArray(cfg.pwm)) {
      issues.push('field "pwm" must be a plain object');
    }
    if (typeof cfg.dac !== 'object' || Array.isArray(cfg.dac)) {
      issues.push('field "dac" must be a plain object (use {} when board has no DAC)');
    }
  }

  if (issues.length > 0) {
    _reportConfigIssues(jsonPath, issues);
    return null;
  }
  return cfg;
}

/// Print every issue for a single board.json under its path, indented.
/// Bumps the module-level error counter so main() can exit non-zero.
let _configErrorCount = 0;
function _reportConfigIssues(jsonPath, issues) {
  console.error(jsonPath + ':');
  for (const i of issues) console.error('  ' + i);
  _configErrorCount += issues.length;
}

/// Look up every Arduino-style boards.txt entry that owns a given variant
/// directory name.  boards.txt format:
///
///   <id>.name=<Display Name>
///   <id>.build.variant=<variantDir>
///
/// Scans for ALL lines matching `<id>.build.variant=<variantDirName>` and
/// returns one {id, name} object per match that also has an `<id>.name=`
/// entry.  Entries without a corresponding .name= line (menu sub-options
/// like `board.menu.Revision.V2.build.variant=...`) are silently skipped.
///
/// Multiple board IDs routinely share the same variant directory — e.g.
/// `esp32`, `esp32wrover`, `esp32cam`, and `kb32` all declare
/// `build.variant=esp32`.  Each gets its own output JSON.
///
/// Returns an empty array when no matching entry is found, in which case
/// the caller should fall back to board.json's boardName / displayName.
///
/// @returns {Array<{id: string, name: string}>}
function _lookupAllBoardsTxt(boardsTxtPath, variantDirName) {
  let text;
  try {
    text = fs.readFileSync(boardsTxtPath, 'utf8');
  } catch (e) {
    return [];
  }
  const escaped = variantDirName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const variantRe = new RegExp('^([\\w.-]+)\\.build\\.variant\\s*=\\s*' + escaped + '[ \\t\\r]*$', 'gm');
  const results = [];
  let m;
  while ((m = variantRe.exec(text)) !== null) {
    const id = m[1];
    const idEsc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRe = new RegExp('^' + idEsc + '\\.name\\s*=\\s*(.+?)[ \\t\\r]*$', 'm');
    const nm = text.match(nameRe);
    if (nm) results.push({ id, name: nm[1] });
  }
  return results;
}

/// Recursively walk ../variants/ and return one descriptor per
/// `pins_arduino.h` found.  Each header is paired with the nearest
/// `board.json` in the same directory or any ancestor, stopping at the
/// variants/ root.  This supports two distinct layouts:
///
///   - Arduino:  variants/arduino/<board>/{pins_arduino.h, board.json}
///               (board.json sits beside the header)
///   - ESP32:    variants/esp32/<chipType>/board.json
///               variants/esp32/<chipType>/<board>/pins_arduino.h
///               (one shared chip-level board.json above each header)
///
/// A pins_arduino.h with no board.json on its ancestor path is reported
/// as a configuration issue.  Shared board.json files are parsed once
/// (cached by absolute path) so a single typo is reported once even when
/// many variants reference the same config.
///
/// @returns {Array<object>} each entry is a shallow clone of the parsed
///                          board.json with an additional `variantPath`
///                          (absolute path to the matching pins_arduino.h).
function discoverVariants() {
  const variantsRoot = path.resolve(__dirname, '..', 'variants');
  const out = [];
  if (!fs.existsSync(variantsRoot)) {
    console.warn('Variants root not found: ' + variantsRoot);
    return out;
  }

  // Cache board.json parses so a shared chip-level config is validated
  // once even when multiple board variants reference it.
  const cfgCache = new Map();
  const loadCfg = (cfgPath) => {
    if (!cfgCache.has(cfgPath)) cfgCache.set(cfgPath, _loadBoardConfig(cfgPath));
    return cfgCache.get(cfgPath);
  };

  // Default position in the Designer's family picker for a family.json
  // that omits `sortOrder` — high enough that any family with an
  // explicit (lower) sortOrder sorts ahead of it.
  const DEFAULT_FAMILY_SORT_ORDER = 100;

  // Cache family.json parses.  One of these sits at the root of each
  // family's directory tree (e.g. variants/arduino/avr/family.json,
  // variants/esp32/family.json, variants/ccode/family.json) and supplies
  // the human-readable name + picker position build-bundle.js /
  // boardSelector.js use for that family (e.g. {"familyDisplayName":
  // "Arduino", "sortOrder": 100}).  Falls back to the raw board.json
  // `family` id / default sort order when no family.json is found on
  // the ancestor path — keeps a brand-new family directory buildable
  // even before its family.json is added.
  const familyConfigCache = new Map();
  const loadFamilyConfig = (dir, fallbackName) => {
    const famPath = nearestAncestorFile(dir, 'family.json');
    if (famPath === null) {
      return { familyDisplayName: fallbackName, familySortOrder: DEFAULT_FAMILY_SORT_ORDER };
    }
    if (!familyConfigCache.has(famPath)) {
      let result = { familyDisplayName: fallbackName, familySortOrder: DEFAULT_FAMILY_SORT_ORDER };
      try {
        const parsed = JSON.parse(stripJsonComments(fs.readFileSync(famPath, 'utf8')));
        if (typeof parsed.familyDisplayName === 'string' && parsed.familyDisplayName) {
          result.familyDisplayName = parsed.familyDisplayName;
        } else {
          _reportConfigIssues(famPath, ['missing or empty field: familyDisplayName']);
        }
        if (parsed.sortOrder !== undefined) {
          if (typeof parsed.sortOrder === 'number') {
            result.familySortOrder = parsed.sortOrder;
          } else {
            _reportConfigIssues(famPath, ['field "sortOrder" must be a number']);
          }
        }
      } catch (e) {
        _reportConfigIssues(famPath, ['invalid JSON: ' + e.message]);
      }
      familyConfigCache.set(famPath, result);
    }
    return familyConfigCache.get(famPath);
  };

  // Search `dir` and each ancestor up to (and including) variantsRoot
  // for a named file.  Returns the absolute path or null if not found.
  const nearestAncestorFile = (dir, fileName) => {
    let cur = dir;
    while (true) {
      const candidate = path.join(cur, fileName);
      if (fs.existsSync(candidate)) return candidate;
      if (cur === variantsRoot) return null;
      const parent = path.dirname(cur);
      if (parent === cur) return null;   // hit filesystem root, give up
      cur = parent;
    }
  };

  // When a variant has no board.json in its ancestry, follow any
  // `#include "relative/pins_arduino.h"` directive in the variant's own
  // header and search for board.json starting from the included file's
  // directory.  This handles:
  //   - eightanaloginputs  →  ../standard   (standard/board.json exists)
  //   - yun / micro        →  ../leonardo   (leonardo/board.json exists)
  // Recursion handles transitive chains; the visited set prevents loops.
  const _findBoardJsonViaInclude = (pinsHPath, visited) => {
    if (!visited) visited = new Set();
    if (visited.has(pinsHPath)) return null;
    visited.add(pinsHPath);
    let src;
    try { src = fs.readFileSync(pinsHPath, 'utf8'); } catch (e) { return null; }
    const m = src.match(/#include\s+"([^"]+)"/);
    if (!m) return null;
    const includedPath = path.resolve(path.dirname(pinsHPath), m[1]);
    if (!fs.existsSync(includedPath)) return null;
    const found = nearestAncestorFile(path.dirname(includedPath), 'board.json');
    if (found) return found;
    return _findBoardJsonViaInclude(includedPath, visited);
  };

  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(p);
      } else if (e.isFile() && e.name === 'pins_arduino.h') {
        let cfgPath = nearestAncestorFile(dir, 'board.json');
        if (cfgPath === null) cfgPath = _findBoardJsonViaInclude(p);
        if (cfgPath === null) {
          _reportConfigIssues(dir, ['no board.json in this directory or any ancestor up to variants/']);
          continue;
        }
        const cfg = loadCfg(cfgPath);
        if (cfg === null) continue;   // issues already reported by _loadBoardConfig

        // Resolve board identity from boards.txt: all entries whose
        // `<id>.build.variant` equals the immediate parent directory of
        // pins_arduino.h each become a separate output JSON.  Multiple
        // board IDs frequently share one variant (e.g. esp32, esp32wrover,
        // esp32cam all declare build.variant=esp32).  board.json's
        // boardName/displayName remain as the fallback when no boards.txt
        // entry is found.
        const boardsTxt = nearestAncestorFile(dir, 'boards.txt');
        const hits = boardsTxt !== null
                   ? _lookupAllBoardsTxt(boardsTxt, path.basename(dir))
                   : [];
        // Prefix = name of the directory that holds boards.txt (e.g. "esp32",
        // "avr").  Falls back to cfg.family when no boards.txt was found.
        const prefix = boardsTxt !== null
                     ? path.basename(path.dirname(boardsTxt))
                     : cfg.family;

        const { familyDisplayName, familySortOrder } = loadFamilyConfig(dir, cfg.family);

        if (hits.length > 0) {
          // Clone so per-board boardName / displayName do not leak across
          // boards sharing the same chip-level board.json.
          for (const hit of hits) {
            out.push(Object.assign({}, cfg, {
              variantPath: p,
              boardName:   hit.id,
              displayName: hit.name,
              prefix,
              familyDisplayName,
              familySortOrder,
            }));
          }
        } else {
          // No boards.txt match — use the board.json fallback values.
          out.push(Object.assign({}, cfg, { variantPath: p, prefix, familyDisplayName, familySortOrder }));
        }
      }
    }
  };
  walk(variantsRoot);

  // Sort by prefixed output name for deterministic build output.
  out.sort((a, b) => {
    const ka = a.prefix + '_' + a.boardName;
    const kb = b.prefix + '_' + b.boardName;
    return ka.localeCompare(kb);
  });
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Entry point
// ──────────────────────────────────────────────────────────────────────

function main() {
  const scriptDir = __dirname;
  const outBase   = path.join(scriptDir, 'designer', 'boards');

  const boards = discoverVariants();
  if (boards.length === 0) {
    console.error('No variant directories with pins_arduino.h + board.json found under ../variants/');
    process.exitCode = 1;
    return;
  }

  for (const cfg of boards) {
    const src = resolveIncludes(fs.readFileSync(cfg.variantPath, 'utf8'), cfg.variantPath);

    const board = (cfg.family === 'esp32') ? buildEsp32Board(src, cfg)
                : (cfg.family === 'ccode') ? buildCcodeBoard(src, cfg)
                : buildAvrBoard(src, cfg);

    // Embed family, chip and the family's display name so build-bundle.js
    // can build the board hierarchy directly from the generated JSONs
    // without reading ../variants/ at all.  chip = the directory two
    // levels above pins_arduino.h (e.g. "esp32c3", "avr").
    board.family            = cfg.family;
    board.chip              = path.basename(path.dirname(path.dirname(cfg.variantPath)));
    board.familyDisplayName = cfg.familyDisplayName;
    board.familySortOrder   = cfg.familySortOrder;

    const outName = cfg.prefix + '_' + cfg.boardName;
    const outDir  = path.join(outBase, outName);
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, outName + '.json');
    fs.writeFileSync(outPath, JSON.stringify(board, null, 2) + '\n', 'utf8');
    const serialPorts = board.connections.serial.availablePorts.length;
    const protoSummary = Object.keys(board.connections).join('+');
    console.log('Wrote ' + path.relative(scriptDir, outPath) +
                '  from ' + path.relative(scriptDir, cfg.variantPath) +
                '  (' + board.pins.length + ' pins, ' +
                serialPorts + ' serial port' + (serialPorts === 1 ? '' : 's') +
                ', transports: ' + protoSummary + ')');
  }

  // Any board.json that failed validation already printed its issues —
  // surface the failure to the shell wrapper so build_boards.{bat,sh}
  // can report "Build Failed" rather than "Build Successful".
  if (_configErrorCount > 0) {
    process.exitCode = 1;
  }
}

// Run main(); any unexpected throw is printed as a single clean line
// (no stack trace) and exits non-zero.
try {
  main();
} catch (e) {
  console.error(e && e.message ? e.message : String(e));
  process.exitCode = 1;
}
