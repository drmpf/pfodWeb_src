/*
 * designer/boards/shared/PinType.js
 *
 * Enumeration of pin role/function tags used to describe what a board
 * pin can be configured as.  Shared across every board implementation
 * under designer/boards/<BoardName>/ — the values are plain strings so
 * they round-trip through JSON / localStorage cleanly.
 *
 * (c)2026 Forward Computing and Control Pty. Ltd.
 */

// Sentinel pin name/codeName used when a board has no routable I/O pins
// at all (e.g. "Unlisted Board") but the user still wants the generated
// code to wire up a pin anyway -- see editMenuItem.js / editMenuItemPin.js
// / editChart.js for how this is toggled on/off, state.js's
// _clearInvalidPins for how it's preserved/cleared across board switches,
// and generateCode.js for where it's emitted as a literal `?` value the
// user fills in by hand.
const PLACEHOLDER_PIN_NAME = '?';

const PinType = Object.freeze({
  DIGITAL_INPUT:  'digital_input',
  DIGITAL_OUTPUT: 'digital_output',
  PWM_OUTPUT:     'pwm_output',
  ANALOG_INPUT:        'analog_input',
  // Available for analog input only when connection type is Serial (ESP32 ADC2).
  ANALOG_INPUT_SERIAL: 'analog_input_serial',
  DAC_OUTPUT:     'dac_output',
  SERIAL_RX:      'serial_rx',
  SERIAL_TX:      'serial_tx',
  I2C_SDA:        'i2c_sda',
  I2C_SCL:        'i2c_scl',
  SPI_MOSI:       'spi_mosi',
  SPI_MISO:       'spi_miso',
  SPI_SCK:        'spi_sck',
  SPI_SS:         'spi_ss',

  // Board-specific hardware-identity tags.  These are added ALONGSIDE the
  // plain digital_input/digital_output/pwm_output tags above (never
  // instead of) on pins researched and confirmed as a fixed onboard
  // button or LED — they mark *what the pin physically is*, not an
  // additional I/O role.  Populated per-board in that board's
  // variants/<family>/.../board.json chipGpios entry, never inferred
  // automatically from pins_arduino.h alias names (too unreliable).
  BUTTON:         'button',        // fixed onboard button (pull-up/down + switch)
  LED_HIGH:       'led_high',      // fixed onboard single-colour LED, active-high
  LED_LOW:        'led_low',       // fixed onboard single-colour LED, active-low
  LED_NEOPIXEL:   'led_neopixel',  // fixed onboard addressable (WS2812-style) RGB LED data pin
  LED_R_HIGH:     'led_r_high',    // fixed onboard discrete RGB LED, red channel, active-high
  LED_R_LOW:      'led_r_low',     // fixed onboard discrete RGB LED, red channel, active-low
  LED_G_HIGH:     'led_g_high',    // fixed onboard discrete RGB LED, green channel, active-high
  LED_G_LOW:      'led_g_low',     // fixed onboard discrete RGB LED, green channel, active-low
  LED_B_HIGH:     'led_b_high',    // fixed onboard discrete RGB LED, blue channel, active-high
  LED_B_LOW:      'led_b_low',     // fixed onboard discrete RGB LED, blue channel, active-low
});
