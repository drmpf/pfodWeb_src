#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

static const uint8_t LED_BUILTIN = 3;
static const uint8_t RGB_BUILTIN = 23;
static const uint8_t BUTTON_BUILTIN = 22;

static const uint8_t TX = 16;
static const uint8_t RX = 17;

// pfodWeb NOTE: the vendor's default Wire-bus alias pair was deleted here.
// Both of its pin assignments were simple duplicates of the RGB LED and
// button pin numbers declared above, not a distinct, vendor-confirmed
// onboard I2C device. Left in place, build_boards.js would have
// unconditionally tagged those same two GPIOs with I2C bus capabilities,
// contaminating the confirmed LED/button capability tags set in
// board.json. See board.json and boardsDetails notes.txt for sources.

static const uint8_t SS = 18;
static const uint8_t MOSI = 19;
static const uint8_t MISO = 20;
static const uint8_t SCK = 21;

static const uint8_t A0 = 0;
static const uint8_t A1 = 1;
static const uint8_t A2 = 2;
static const uint8_t A3 = 3;
static const uint8_t A4 = 4;
static const uint8_t A5 = 5;
static const uint8_t A6 = 6;

// LP I2C Pins are fixed on ESP32-C6
#define WIRE1_PIN_DEFINED
static const uint8_t SDA1 = 6;
static const uint8_t SCL1 = 7;

#endif /* Pins_Arduino_h */
