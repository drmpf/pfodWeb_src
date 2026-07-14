#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define WIFI_Kit_32_V3 true
#define DISPLAY_HEIGHT 64
#define DISPLAY_WIDTH  128

static const uint8_t LED_BUILTIN = 35;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

static const uint8_t KEY_BUILTIN = 0;

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t SDA = 41;
static const uint8_t SCL = 42;

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - dedicated
// onboard radio SPI bus (DIO0 below confirms a radio chip is present;
// no other SPI peripheral on this board).

// pfodWeb NOTE: A7-A10/A13/A16/A17 and T8-T11/T14 deliberately NOT
// declared - dedicated onboard OLED I2C, radio+SPI bus, and Vext
// power-gate (see below).
static const uint8_t A0 = 1;
static const uint8_t A1 = 2;
static const uint8_t A2 = 3;
static const uint8_t A3 = 4;
static const uint8_t A4 = 5;
static const uint8_t A5 = 6;
static const uint8_t A6 = 7;
static const uint8_t A11 = 12;
static const uint8_t A12 = 13;
static const uint8_t A14 = 15;
static const uint8_t A15 = 16;
static const uint8_t A18 = 19;
static const uint8_t A19 = 20;

static const uint8_t T1 = 1;
static const uint8_t T2 = 2;
static const uint8_t T3 = 3;
static const uint8_t T4 = 4;
static const uint8_t T5 = 5;
static const uint8_t T6 = 6;
static const uint8_t T7 = 7;
static const uint8_t T12 = 12;
static const uint8_t T13 = 13;

static const uint8_t LED = 35;
// pfodWeb NOTE: Vext (power-gate) and RST_OLED/SCL_OLED/SDA_OLED
// deliberately NOT declared - internal control line and dedicated
// onboard OLED display I2C bus.

// pfodWeb NOTE: DIO0 (GPIO14) deliberately NOT declared - dedicated
// onboard radio interrupt line.

#endif /* Pins_Arduino_h */
