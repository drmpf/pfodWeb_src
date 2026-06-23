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

const PinType = Object.freeze({
  DIGITAL_INPUT:  'digital_input',
  DIGITAL_OUTPUT: 'digital_output',
  PWM_OUTPUT:     'pwm_output',
  ANALOG_INPUT:   'analog_input',
  DAC_OUTPUT:     'dac_output',
  SERIAL_RX:      'serial_rx',
  SERIAL_TX:      'serial_tx',
  I2C_SDA:        'i2c_sda',
  I2C_SCL:        'i2c_scl',
  SPI_MOSI:       'spi_mosi',
  SPI_MISO:       'spi_miso',
  SPI_SCK:        'spi_sck',
  SPI_SS:         'spi_ss',
});
