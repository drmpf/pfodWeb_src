#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t TX = 21;
static const uint8_t RX = 20;

static const uint8_t BOOT_BTN = 9;
static const uint8_t PIR = 5;

// pfodWeb NOTE: SCL alias (was GPIO9) deleted - this is generic
// ESP32-C3 template boilerplate, never vendor-confirmed as a real onboard
// I2C header, and it silently contaminated the confirmed BOOT_BTN
// button's capability list with "i2c_scl" (build_boards.js appends
// i2c_scl to any GPIO matching the SCL alias, unconditionally, the same
// mechanism as the TX/RX hard-reservation bug). SDA (GPIO8) left as-is -
// it doesn't collide with any tagged pin.
static const uint8_t SDA = 8;

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
