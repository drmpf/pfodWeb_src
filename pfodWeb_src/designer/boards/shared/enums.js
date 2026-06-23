/*
 * designer/boards/shared/enums.js
 *
 * Cross-board value lists used by the designer UI to populate dropdowns
 * (baud rate, refresh interval, pulse mode, connection grouping).
 * Each list is frozen so per-board configs and the message processor
 * can hold references without risk of mutation.
 *
 * Origin: pfodDesignerV2/designerSupport/{BaudRateEnum, RefreshIntervalEnum,
 *         PulseEnum, ConnectionGroupingEnum}.java
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

// Standard async-serial baud rates offered to the user.  Each board's
// serial.js picks a default and may further restrict this list if the
// underlying hardware can't sustain the upper rates.
const BaudRateEnum = Object.freeze([
  300, 600, 1200, 2400, 4800, 9600, 14400, 19200,
  28800, 38400, 57600, 115200, 230400, 250000,
]);

// Plot / chart refresh intervals in seconds.  0 = never (one-shot).
const RefreshIntervalEnum = Object.freeze([
  0, 1, 2, 5, 10, 30, 60, 300, 600, 1800, 3600,
]);

// Output pulse mode for digital-output pins.
const PulseEnum = Object.freeze(['none', 'single', 'repeat']);

// Concrete connection categories a board can be configured against in the
// designer.  Each board's connection config (e.g. boards/Uno/serial.js)
// will declare which of these it belongs to.
const ConnectionGroupingEnum = Object.freeze(['Serial', 'BLE', 'WiFi']);
