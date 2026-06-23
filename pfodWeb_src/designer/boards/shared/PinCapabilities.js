/*
 * designer/boards/shared/PinCapabilities.js
 *
 * Small predicate object listing the PinType values a single board pin
 * can be configured as.  Construct with an array of allowed PinType
 * strings; ask `.supports(pinType)` to test.  Used by board pin maps
 * (e.g. boards/Uno/pins.js) so that the designer UI can offer only the
 * roles each physical pin can actually take.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

class PinCapabilities {
  /// @param {string[]} allowedTypes — array of PinType.* values this pin supports
  constructor(allowedTypes) {
    this.allowedTypes = new Set(allowedTypes);
  }
  /// @returns {boolean} true if this pin can be configured as the given PinType
  supports(pinType) {
    return this.allowedTypes.has(pinType);
  }
}
