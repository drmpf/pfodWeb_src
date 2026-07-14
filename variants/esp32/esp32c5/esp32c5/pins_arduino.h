#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

#define PIN_RGB_LED 27
// BUILTIN_LED can be used in new Arduino API digitalWrite() like in Blink.ino
static const uint8_t LED_BUILTIN = SOC_GPIO_PIN_COUNT + PIN_RGB_LED;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN
// RGB_BUILTIN and RGB_BRIGHTNESS can be used in new Arduino API rgbLedWrite()
#define RGB_BUILTIN    LED_BUILTIN
#define RGB_BRIGHTNESS 64

static const uint8_t TX = 11;
static const uint8_t RX = 12;

// pfodWeb NOTE: the native USB D-/D+ pin aliases for this chip were removed
// entirely during the 2026-07-12 audit (a prior pass had only commented
// them out, which does NOT work: build_boards.js's ESP32 alias parser does
// not strip comments before matching pin declarations, so a commented-out
// declaration of the same shape still gets parsed and leaks the two GPIOs,
// already excluded from chipGpios, back into the routable pin list). See
// boardsDetails/esp32/esp32c5/sparkfun_esp32c5_thing_plus/notes.txt.

static const uint8_t SDA = 0;
static const uint8_t SCL = 1;

static const uint8_t SS = 6;
static const uint8_t MOSI = 8;
static const uint8_t MISO = 9;
static const uint8_t SCK = 10;

static const uint8_t A0 = 1;
static const uint8_t A1 = 2;
static const uint8_t A2 = 3;
static const uint8_t A3 = 4;
static const uint8_t A4 = 5;
static const uint8_t A5 = 6;

// LP I2C Pins are fixed on ESP32-C5
static const uint8_t LP_SDA = 2;
static const uint8_t LP_SCL = 3;
#define WIRE1_PIN_DEFINED
#define SDA1 LP_SDA
#define SCL1 LP_SCL

// LP UART Pins are fixed on ESP32-C5
static const uint8_t LP_RX = 4;
static const uint8_t LP_TX = 5;

#endif /* Pins_Arduino_h */
