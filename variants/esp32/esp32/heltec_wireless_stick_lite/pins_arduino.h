#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define Wireless_Stick_Lite true
#define DISPLAY_HEIGHT      0
#define DISPLAY_WIDTH       0

static const uint8_t LED_BUILTIN = 25;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

static const uint8_t KEY_BUILTIN = 0;

static const uint8_t TX = 1;
static const uint8_t RX = 3;

// pfodWeb NOTE: SDA (GPIO21) deliberately NOT declared - same GPIO as
// the Vext power-gate below, not a usable I2C SDA line.
static const uint8_t SCL = 22;

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - dedicated
// onboard LoRa radio SPI bus (no other SPI peripheral on this board).

// pfodWeb NOTE: A6/A7/A16/A17/A19 and T6/T7 deliberately NOT declared -
// dedicated onboard LoRa radio+SPI bus and Vext power-gate (see below).
static const uint8_t A0 = 36;
static const uint8_t A3 = 39;
static const uint8_t A4 = 32;
static const uint8_t A5 = 33;
static const uint8_t A10 = 4;
static const uint8_t A11 = 0;
static const uint8_t A12 = 2;
static const uint8_t A13 = 15;
static const uint8_t A14 = 13;
static const uint8_t A15 = 12;
static const uint8_t A18 = 25;

static const uint8_t T0 = 4;
static const uint8_t T1 = 0;
static const uint8_t T2 = 2;
static const uint8_t T3 = 15;
static const uint8_t T4 = 13;
static const uint8_t T5 = 12;
static const uint8_t T8 = 33;
static const uint8_t T9 = 32;

static const uint8_t DAC1 = 25;
// pfodWeb NOTE: DAC2 (GPIO26) deliberately NOT declared - same GPIO as
// the dedicated onboard LoRa DIO0 pin below.

static const uint8_t LED = 25;
// pfodWeb NOTE: Vext (power-gate) and RST_LoRa/DIO0/DIO1/DIO2
// deliberately NOT declared - internal control line and dedicated
// onboard LoRa radio control lines.

#endif /* Pins_Arduino_h */
