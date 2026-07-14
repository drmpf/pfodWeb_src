#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define Wireless_Stick_Lite_V3 true
#define DISPLAY_HEIGHT         0
#define DISPLAY_WIDTH          0

static const uint8_t LED_BUILTIN = 35;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t SDA = 2;
static const uint8_t SCL = 3;

static const uint8_t SS = 34;
// pfodWeb NOTE: MOSI (GPIO35) deliberately NOT declared - same GPIO as
// LED_BUILTIN/LED below (kept via that alias instead). SCK (GPIO36)
// deliberately NOT declared - same GPIO as the Vext power-gate below.
static const uint8_t MISO = 37;

// pfodWeb NOTE: A7/A8/A11/A12 deliberately NOT declared - dedicated
// onboard LoRa RST/DIO0 and OLED SDA/SCL pins (see below).
static const uint8_t A0 = 1;
static const uint8_t A1 = 2;
static const uint8_t A2 = 3;
static const uint8_t A3 = 4;
static const uint8_t A4 = 5;
static const uint8_t A5 = 6;
static const uint8_t A6 = 7;
static const uint8_t A9 = 15;
static const uint8_t A10 = 16;
static const uint8_t A13 = 19;
static const uint8_t A14 = 20;

static const uint8_t T0 = 1;
static const uint8_t T1 = 2;
static const uint8_t T2 = 3;
static const uint8_t T3 = 4;
static const uint8_t T4 = 5;
static const uint8_t T5 = 6;
static const uint8_t T6 = 7;

static const uint8_t LED = 35;
// pfodWeb NOTE: Vext (power-gate), RST_OLED/SCL_OLED/SDA_OLED, and
// RST_LoRa/BUSY_LoRa/DIO0 deliberately NOT declared - internal control
// line and dedicated onboard OLED (reserved pins, even though this
// board's DISPLAY_HEIGHT/WIDTH are 0) + LoRa radio control lines.

#endif /* Pins_Arduino_h */
