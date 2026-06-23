/*
 * designer/boards/BaseBoard.js
 *
 * Abstract base for every board implementation under
 * designer/boards/<BoardName>/index.js.  Documents the contract that
 * the message processor and the menus rely on; per-board subclasses
 * populate `pins` and `connection` and set a human-readable `name`.
 *
 * Origin: pfodDesignerV2/boards/BaseBoard.java (Java abstract base).
 * This JS port deliberately drops code-generation responsibilities;
 * code-gen lives in a separate stub for now.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

class BaseBoard {
  /// @param {string} name — human-readable board name shown in the designer
  ///                        UI (e.g. 'Arduino Uno', 'ESP32 BLE').
  constructor(name) {
    this.name        = name;
    this.pins        = [];   // array of { name, label, capabilities: PinCapabilities }
    this.connections = null; // populated by BoardLoader.load — keyed by transport id
                             // (serial / ble / tcp / http); each value is a per-
                             // transport config object (serial carries availablePorts,
                             // defaultPort, defaultBaud, supportedBauds).
  }

  /// Subclasses may override to expose board-specific feature flags
  /// (e.g. hasBLE, hasWiFi).  Default: no special features.
  features() {
    return {};
  }
}
