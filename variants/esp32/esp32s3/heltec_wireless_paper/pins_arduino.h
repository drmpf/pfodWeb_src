#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define WIRELESS_PAPER true
#define DISPLAY_HEIGHT 64
#define DISPLAY_WIDTH  128

static const uint8_t LED_BUILTIN = 35;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN

static const uint8_t KEY_BUILTIN = 0;

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t SDA = 21;
static const uint8_t SCL = 22;

static const uint8_t SS = 8;
static const uint8_t MOSI = 10;
static const uint8_t MISO = 11;
static const uint8_t SCK = 9;

static const uint8_t A0 = 1;
static const uint8_t A1 = 2;
static const uint8_t A2 = 3;
static const uint8_t A3 = 4;
static const uint8_t A4 = 5;
static const uint8_t A5 = 6;
static const uint8_t A6 = 7;
static const uint8_t A7 = 8;
static const uint8_t A8 = 9;
static const uint8_t A9 = 10;
static const uint8_t A10 = 11;
static const uint8_t A11 = 12;
static const uint8_t A12 = 13;
static const uint8_t A13 = 14;
static const uint8_t A14 = 15;
static const uint8_t A15 = 16;
// pfodWeb NOTE: A16 (GPIO17) deliberately NOT declared - same GPIO as
// the dedicated onboard OLED SDA_OLED pin below.
static const uint8_t A17 = 18;
static const uint8_t A18 = 19;
static const uint8_t A19 = 20;

static const uint8_t T1 = 1;
static const uint8_t T2 = 2;
static const uint8_t T3 = 3;
static const uint8_t T4 = 4;
static const uint8_t T5 = 5;
static const uint8_t T6 = 6;
static const uint8_t T7 = 7;
static const uint8_t T8 = 8;
static const uint8_t T9 = 9;
static const uint8_t T10 = 10;
static const uint8_t T11 = 11;
static const uint8_t T12 = 12;
static const uint8_t T13 = 13;
static const uint8_t T14 = 14;

static const uint8_t LED = 18;
// pfodWeb NOTE: Vext (power-gate) and RST_OLED/SDA_OLED deliberately NOT
// declared - internal control line and dedicated onboard OLED pins.
// SCL_OLED (GPIO18) stays kept via the LED alias above (same GPIO,
// simple LED indicator takes priority per policy).

#endif /* Pins_Arduino_h */
