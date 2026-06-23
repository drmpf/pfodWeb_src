/*
 * designer/boards/shared/BoardLoader.js
 *
 * Generic reader that hydrates a per-board data object (loaded from
 * boards/<Board>/<Board>.json by the build) into a runtime BaseBoard
 * instance.  Adding a new board means: drop in <Board>.json, list it
 * in build-bundle.js's `scripts` array (the build wraps it as
 * `const <Board>Data = {...};`), and call `BoardLoader.load(<Board>Data)`.
 *
 * The data file format (see boards/Uno/Uno.json for an example).  All
 * fields are REQUIRED — the loader rejects incomplete data at the
 * boundary instead of papering over missing values with defaults.
 *
 *   {
 *     "name": "...",                                  // human-readable
 *     "connection": {
 *       "grouping":       "Serial"|"BLE"|"WiFi",      // ConnectionGroupingEnum
 *       "availablePorts": ["Serial", ...],            // for Serial; [] otherwise
 *       "defaultPort":    "Serial",                   // for Serial; "" otherwise
 *       "defaultBaud":    9600,                       // for Serial; 0 otherwise
 *       "supportedBauds": [300, ..., 115200]          // required, even for non-serial ([])
 *     },
 *     "pins": [
 *       { "name": "D0", "label": "D0 (RX)", "capabilities": ["serial_rx", ...] }
 *     ]
 *   }
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

const BoardLoader = (() => {

  /// Validate one pin capability against the PinType enum.  Throws on
  /// unknown values so per-board data files fail loudly at startup
  /// rather than silently producing an unusable board.
  function _validateCapability(cap, pinName) {
    const validValues = new Set(Object.values(PinType));
    if (!validValues.has(cap)) {
      throw new Error(
        '[BoardLoader] Unknown capability "' + cap + '" on pin "' + pinName +
        '". Valid PinType values: ' + [...validValues].join(', ')
      );
    }
  }

  /// Convert a JSON pin descriptor into the runtime shape used by the
  /// rest of the designer:  { name, label, capabilities: PinCapabilities }.
  /// Every field is required; missing fields throw at the boundary so
  /// the broken data file fails at load time, not at first use.
  function _hydratePin(p) {
    if (!p.name)  throw new Error('[BoardLoader] pin missing required "name" field');
    if (!p.label) throw new Error('[BoardLoader] pin "' + p.name + '" missing required "label" field');
    if (!Array.isArray(p.capabilities)) {
      throw new Error('[BoardLoader] pin "' + p.name + '" missing required "capabilities" array');
    }
    p.capabilities.forEach((c) => _validateCapability(c, p.name));
    const pin = {
      name:         p.name,
      label:        p.label,
      codeName:     p.codeName,
      capabilities: new PinCapabilities(p.capabilities),
    };
    if (typeof p.notes === 'string' && p.notes.length > 0) pin.notes = p.notes;
    return pin;
  }

  /// Validate the connections block at the boundary.  Shape:
  ///   { serial: { availablePorts, defaultPort, defaultBaud, supportedBauds },
  ///     ble?:   {}, tcp?: {}, http?: {} }
  /// The presence of a key indicates that transport is supported; the
  /// value carries per-transport config (only serial has real config
  /// today — the others reserve a slot for future fields).  Every board
  /// MUST have a serial entry because Serial is the universal fallback
  /// (USB cable always works, even on radio-equipped boards).
  function _validateConnections(connections) {
    if (!connections || typeof connections !== 'object') {
      throw new Error('[BoardLoader] board data missing "connections" object');
    }
    const ser = connections.serial;
    if (!ser || typeof ser !== 'object') {
      throw new Error('[BoardLoader] connections.serial missing — every board must declare a serial transport');
    }
    if (!Array.isArray(ser.availablePorts)) throw new Error('[BoardLoader] connections.serial.availablePorts must be an array');
    if (typeof ser.defaultPort !== 'string') throw new Error('[BoardLoader] connections.serial.defaultPort must be a string');
    if (typeof ser.defaultBaud !== 'number') throw new Error('[BoardLoader] connections.serial.defaultBaud must be a number');
    if (!Array.isArray(ser.supportedBauds)) throw new Error('[BoardLoader] connections.serial.supportedBauds must be an array');
  }

  /// Public entry point.  Given a board-data object (parsed from JSON
  /// by the build), return a populated BaseBoard instance ready for the
  /// designer message processor.  Throws on any missing required field.
  /// @param {object} data — the board data object (e.g. UnoData)
  /// @returns {BaseBoard}
  function load(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('[BoardLoader] load() requires a board data object');
    }
    if (!data.name) throw new Error('[BoardLoader] board data missing "name"');
    if (!Array.isArray(data.pins)) {
      throw new Error('[BoardLoader] board data missing "pins" array');
    }
    _validateConnections(data.connections);

    const board     = new BaseBoard(data.name);
    board.pins      = data.pins.map(_hydratePin);
    // Deep-freeze each per-transport sub-object so editMenu / future
    // protocol-switch UI can pass them around without defensive cloning.
    const conns = {};
    for (const proto of Object.keys(data.connections)) {
      conns[proto] = Object.freeze(Object.assign({}, data.connections[proto]));
    }
    board.connections = Object.freeze(conns);
    board.adc         = Object.freeze(Object.assign({}, data.adc || {}));
    return board;
  }

  return Object.freeze({ load });
})();
