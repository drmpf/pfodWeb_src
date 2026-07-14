#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

#define USB_VID          0x303A
#define USB_PID          0x8179
#define USB_MANUFACTURER "Unexpected Maker"
#define USB_PRODUCT      "Nanos3"
#define USB_SERIAL       ""

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t SDA = 8;
static const uint8_t SCL = 9;

// pfodWeb NOTE: the vendor header's SPI-bus aliases for GPIO34-37 (SS,
// MOSI, MISO, SCK, plus the SDO/SDI alternate names for MOSI/MISO on
// the same physical pins) have been removed. Those four GPIOs fall
// inside the GPIO33-37 octal flash/PSRAM range already excluded
// chip-wide in the ESP32-S3 board.json (see that file's chipGpios
// comment). Leaving the aliases in place would cause the board build
// script to re-add those pins as user-selectable digital/PWM/SPI pins
// even though the chip-level config omits them, silently exposing
// internal PSRAM/flash bus lines in the Designer - the same
// alias-leak bug found and fixed on the sibling um_edges3_d board.
// Sources consulted: this board's own header (identical to the
// upstream espressif/arduino-esp32 um_nanos3 variant, confirmed via
// raw.githubusercontent.com), and Espressif's published ESP32-S3
// GPIO33-37 octal PSRAM/flash restriction.

static const uint8_t A0 = 1;
static const uint8_t A1 = 2;
static const uint8_t A2 = 3;
static const uint8_t A3 = 4;
static const uint8_t A4 = 5;
static const uint8_t A5 = 6;
static const uint8_t A6 = 7;
static const uint8_t A7 = 8;
static const uint8_t A8 = 9;

static const uint8_t T1 = 1;
static const uint8_t T2 = 2;
static const uint8_t T3 = 3;
static const uint8_t T4 = 4;
static const uint8_t T5 = 5;
static const uint8_t T6 = 6;
static const uint8_t T7 = 7;
static const uint8_t T8 = 8;
static const uint8_t T9 = 9;

static const uint8_t RGB_DATA = 41;
// RGB_BUILTIN and RGB_BRIGHTNESS can be used in new Arduino API rgbLedWrite()
#define RGB_BUILTIN    (RGB_DATA + SOC_GPIO_PIN_COUNT)
#define RGB_BRIGHTNESS 64
// BUILTIN_LED can be used in new Arduino API digitalWrite() like in Blink.ino
static const uint8_t LED_BUILTIN = RGB_BUILTIN;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

// pfodWeb NOTE: RGB_PWR (GPIO42) deliberately NOT declared - internal
// power-gate for the onboard NeoPixel, not general-purpose.

#endif /* Pins_Arduino_h */
