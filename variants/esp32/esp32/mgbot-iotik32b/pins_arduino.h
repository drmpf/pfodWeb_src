#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t LED_BUILTIN = 18;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

// IR receiver
static const uint8_t IR = 27;
#define IR_RECV  IR
#define IR_INPUT IR

static const uint8_t TX = 1;
static const uint8_t RX = 3;
#define TXD TX
#define RXD RX

static const uint8_t TX2 = 17;
static const uint8_t RX2 = 16;
#define TXD2 TX2
#define RXD2 RX2

static const uint8_t SDA = 21;
static const uint8_t SCL = 22;

static const uint8_t SS = 5;
static const uint8_t MOSI = 23;
static const uint8_t MISO = 19;
// pfodWeb NOTE: the default SCK alias was deleted - it pointed at the
// same GPIO as this board's confirmed onboard LED, and build_boards.js
// unconditionally attaches an spi_sck capability to any GPIO matching
// the SCK alias, which was silently contaminating the LED's capability
// list.

static const uint8_t A0 = 36;
static const uint8_t A3 = 39;
static const uint8_t A4 = 32;
static const uint8_t A5 = 33;
static const uint8_t A6 = 34;
static const uint8_t A7 = 35;
static const uint8_t A10 = 4;
static const uint8_t A11 = 0;
static const uint8_t A12 = 2;
static const uint8_t A13 = 15;
static const uint8_t A14 = 13;
static const uint8_t A15 = 12;
static const uint8_t A16 = 14;
// pfodWeb NOTE: A17 (GPIO27) deliberately NOT declared - same GPIO as
// the dedicated onboard IR receiver above.
static const uint8_t A18 = 25;
static const uint8_t A19 = 26;

static const uint8_t T0 = 4;
static const uint8_t T1 = 0;
static const uint8_t T2 = 2;
static const uint8_t T3 = 15;
static const uint8_t T4 = 13;
static const uint8_t T5 = 12;
static const uint8_t T6 = 14;
// pfodWeb NOTE: T7 (GPIO27) deliberately NOT declared - same as A17 above.
static const uint8_t T8 = 33;
static const uint8_t T9 = 32;

static const uint8_t DAC1 = 25;
static const uint8_t DAC2 = 26;

#endif /* Pins_Arduino_h */
