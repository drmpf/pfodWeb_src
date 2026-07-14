#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

#define WIRELESS_MINI_SHELL true

static const uint8_t LED_BUILTIN = SOC_GPIO_PIN_COUNT + 8;
#define BUILTIN_LED    LED_BUILTIN  // backward compatibility
#define LED_BUILTIN    LED_BUILTIN
#define RGB_BUILTIN    LED_BUILTIN
#define RGB_BRIGHTNESS 64

static const uint8_t TX = 21;
static const uint8_t RX = 20;

// pfodWeb NOTE: this board is the HT-CT62 LoRa module (Heltec Arduino IDE
// board name "Wireless Mini Shell"). Its default Wire SDA pin coincides
// with the onboard LoRa radio's chip-select line - the official module
// datasheet's pin table shows no I2C device on that pin, so the default
// SDA choice below is set to -1 (no default Wire pin) rather than the
// GPIO number that would otherwise contaminate the radio's dedicated pin
// with an i2c_sda capability. See boardsDetails/esp32/esp32c3/
// heltec_wireless_mini_shell/notes.txt for sources.
// NOTE TO FUTURE EDITORS: do not write the literal original SDA
// assignment text in this comment - the parser in build_boards.js is
// comment-blind (plain regex scan) and will match ANY text of that exact
// shape, even inside a // comment, silently reintroducing the exact bug
// this fix prevents.
static const uint8_t SDA = -1;
static const uint8_t SCL = 9;

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - the official
// HT-CT62 module datasheet's pin table shows the onboard LoRa SX1262
// transceiver occupies a dedicated SPI bus on different GPIO numbers than
// this file's original generic values, so no general-purpose SPI bus
// exists on this board.

// pfodWeb NOTE: A3/A4/A5 deliberately NOT declared - those GPIO numbers
// are dedicated onboard LoRa radio control/SPI lines per the module
// datasheet, not general-purpose analog inputs on this board. A0-A2
// remain, since their GPIO numbers are free/general-purpose.
static const uint8_t A0 = 0;
static const uint8_t A1 = 1;
static const uint8_t A2 = 2;

#endif /* Pins_Arduino_h */
