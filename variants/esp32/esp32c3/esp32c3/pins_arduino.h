#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

#define PIN_RGB_LED 8
// BUILTIN_LED can be used in new Arduino API digitalWrite() like in Blink.ino
static const uint8_t LED_BUILTIN = SOC_GPIO_PIN_COUNT + PIN_RGB_LED;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN
// RGB_BUILTIN and RGB_BRIGHTNESS can be used in new Arduino API rgbLedWrite()
#define RGB_BUILTIN    LED_BUILTIN
#define RGB_BRIGHTNESS 64

static const uint8_t TX = 21;
static const uint8_t RX = 20;

// pfodWeb: upstream Espressif core aliases the default SDA pin to the same
// GPIO number as PIN_RGB_LED above (the onboard WS2812 NeoPixel on the
// actual ESP32-C3-DevKitM-1/DevKitC-02 reference boards this generic
// variant represents). Set below to -1 (no default Wire pin) rather than
// that GPIO number so build_boards.js doesn't auto-append an i2c_sda
// capability onto the NeoPixel-dedicated pin. See board.json's pfodWeb
// NOTE and boardsDetails/esp32/esp32c3/esp32c3/notes.txt for sources.
// NOTE TO FUTURE EDITORS: do not write the literal original
// "static const uint8_t SDA = <number>;" text in this comment - the
// parser in build_boards.js is comment-blind (plain regex scan) and will
// match ANY text of that exact shape, even inside a // comment, silently
// reintroducing the exact bug this fix prevents.
static const uint8_t SDA = -1;
static const uint8_t SCL = 9;

static const uint8_t SS = 7;
static const uint8_t MOSI = 6;
static const uint8_t MISO = 5;
static const uint8_t SCK = 4;

static const uint8_t A0 = 0;
static const uint8_t A1 = 1;
static const uint8_t A2 = 2;
static const uint8_t A3 = 3;
static const uint8_t A4 = 4;
static const uint8_t A5 = 5;

#endif /* Pins_Arduino_h */
