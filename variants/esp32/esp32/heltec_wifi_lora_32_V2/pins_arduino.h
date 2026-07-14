#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define WIFI_LoRa_32_V2 true
#define DISPLAY_HEIGHT  64
#define DISPLAY_WIDTH   128

static const uint8_t LED_BUILTIN = 25;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

static const uint8_t KEY_BUILTIN = 0;

static const uint8_t TX = 1;
static const uint8_t RX = 3;

static const uint8_t SDA = 21;
static const uint8_t SCL = 22;

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - dedicated
// onboard LoRa radio SPI bus (no other SPI peripheral on this board).

// pfodWeb NOTE: A6/A7/A10/A13/A16/A17/A19 and T0/T3/T6/T7 deliberately
// NOT declared - dedicated onboard OLED I2C, LoRa radio+SPI bus, and
// Vext power-gate (see below).
static const uint8_t A0 = 36;
static const uint8_t A3 = 39;
static const uint8_t A4 = 32;
static const uint8_t A5 = 33;
static const uint8_t A11 = 0;
static const uint8_t A12 = 2;
static const uint8_t A14 = 13;
static const uint8_t A15 = 12;
static const uint8_t A18 = 25;

static const uint8_t T1 = 0;
static const uint8_t T2 = 2;
static const uint8_t T4 = 13;
static const uint8_t T5 = 12;
static const uint8_t T8 = 33;
static const uint8_t T9 = 32;

static const uint8_t DAC1 = 25;
// pfodWeb NOTE: DAC2 (GPIO26) deliberately NOT declared - same GPIO as
// the dedicated onboard LoRa DIO0 pin below.

static const uint8_t LED = 25;
// pfodWeb NOTE: Vext (power-gate), RST_OLED/SCL_OLED/SDA_OLED, and
// RST_LoRa/DIO0/DIO1/DIO2 deliberately NOT declared - internal control
// line and dedicated onboard OLED display I2C + LoRa radio control lines.

#endif /* Pins_Arduino_h */
