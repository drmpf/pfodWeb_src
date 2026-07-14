#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

static const uint8_t LED_BUILTIN = 8;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

static const uint8_t BUT_BUILTIN = 9;
#define BUILTIN_BUT BUT_BUILTIN  // backward compatibility
#define BUT_BUILTIN BUT_BUILTIN  // allow testing #ifdef BUT_BUILTIN

static const uint8_t TX = 21;
static const uint8_t RX = 20;

// define I2C pins
// pfodWeb NOTE: SCL alias (was GPIO9) deleted - this is generic ESP32-C3
// template boilerplate (matches espressif/arduino-esp32's generic
// variants/esp32c3/pins_arduino.h SDA=8/SCL=9 default), never
// vendor-confirmed as a real onboard I2C bus on this Olimex board. The
// official OLIMEX ESP32-C3-DevKit-Lipo Rev C KiCad schematic instead
// bus-aliases GPIO7\I2C_SDA and GPIO3\I2C_SCK (neither is GPIO8 or GPIO9),
// and separately labels GPIO9 "GPIO9\USER_BUT" with a "USER Button" text
// callout - so the boilerplate SCL=9 line was silently contaminating the
// confirmed onboard USER_BUT button's capability list with "i2c_scl"
// (build_boards.js appends i2c_scl to any GPIO matching the SCL alias,
// unconditionally). SDA (GPIO8) left as-is - it collides only with
// LED_BUILTIN, which is out of scope for this button-only audit; see
// boardsDetails/esp32/esp32c3/esp32c3-devkit-lipo/notes.txt.
static const uint8_t SDA = 8;
// define SPI pins
static const uint8_t SS = 7;
static const uint8_t MOSI = 6;
static const uint8_t MISO = 5;
static const uint8_t SCK = 4;

// external power sense - disabled by default - check the schematic
//static const uint8_t PWR_SENSE = 4;
// battery measurement - disabled by default - check the schematic
//static const uint8_t BAT_SENSE = 3;
// #define BAT_VOLT_PIN BAT_SENSE
static const uint8_t A0 = 0;
static const uint8_t A1 = 1;
static const uint8_t A2 = 2;
static const uint8_t A3 = 3;
static const uint8_t A4 = 4;
static const uint8_t A5 = 5;

#endif /* Pins_Arduino_h */
