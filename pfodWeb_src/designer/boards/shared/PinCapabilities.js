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

// Human-readable labels for the bus-role PinType tags — informational
// only, since no designer item type consumes these capabilities yet (see
// PinCapabilities.busTags() below).
const BUS_TAG_LABEL = Object.freeze({
  [PinType.I2C_SDA]:  'I2C SDA',
  [PinType.I2C_SCL]:  'I2C SCL',
  [PinType.SPI_MOSI]: 'SPI MOSI',
  [PinType.SPI_MISO]: 'SPI MISO',
  [PinType.SPI_SCK]:  'SPI SCK',
  [PinType.SPI_SS]:   'SPI SS',
});

class PinCapabilities {
  /// @param {string[]} allowedTypes — array of PinType.* values this pin supports
  constructor(allowedTypes) {
    this.allowedTypes = new Set(allowedTypes);
  }
  /// @returns {boolean} true if this pin can be configured as the given PinType
  ///
  /// BUTTON implies DIGITAL_INPUT, and any LED_* hardware-identity tag
  /// implies DIGITAL_OUTPUT.  A board.json chipGpios entry for a confirmed
  /// button/LED pin lists only the identity tag itself (e.g. ["button"] or
  /// ["led_high"]), not the base capability alongside it — see the board
  /// variant audit playbook — so that implication is resolved here rather
  /// than duplicated in every board's data.
  supports(pinType) {
    if (this.allowedTypes.has(pinType)) return true;
    if (pinType === PinType.DIGITAL_INPUT && this.allowedTypes.has(PinType.BUTTON)) return true;
    if (pinType === PinType.DIGITAL_OUTPUT) {
      for (const t of this.allowedTypes) {
        if (t.indexOf('led_') === 0) return true;
      }
    }
    return false;
  }
  /// @returns {string[]} human-readable labels for any I2C/SPI bus-role
  /// tags this pin carries (e.g. ["I2C SDA"], ["SPI MOSI","SPI SCK"]).
  /// Purely informational: no designer item type is gated on these today,
  /// this just lets a user planning their own external wiring see which
  /// pins the board's default I2C/SPI bus already uses.
  busTags() {
    const tags = [];
    for (const t of Object.keys(BUS_TAG_LABEL)) {
      if (this.allowedTypes.has(t)) tags.push(BUS_TAG_LABEL[t]);
    }
    return tags;
  }
}
