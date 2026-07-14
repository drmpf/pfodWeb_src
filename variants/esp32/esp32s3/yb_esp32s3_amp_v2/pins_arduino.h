#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t LED_BUILTIN = 47;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t SDA = 8;
static const uint8_t SCL = 9;

// pfodWeb NOTE: I2S_BCLK/LRCLK/DOUT (GPIO5/6/7) deliberately NOT declared
// - dedicated onboard MAX98357A I2S amplifier bus (see vendor comment).

// pfodWeb NOTE: SS/MOSI/MISO/SCK (GPIO10/11/12/13) deliberately NOT
// declared - dedicated onboard microSD card SPI bus (see vendor comment).

// SPI2 for public usage
static const uint8_t SS2 = 38;
static const uint8_t MOSI2 = 39;
static const uint8_t MISO2 = 41;
static const uint8_t SCK2 = 40;

static const uint8_t A0 = 1;
static const uint8_t A1 = 2;
static const uint8_t A2 = 3;
static const uint8_t A3 = 4;
static const uint8_t A4 = 8;
static const uint8_t A5 = 9;
// pfodWeb NOTE: A6 (GPIO10) deliberately NOT declared - same dedicated
// microSD SPI bus as above.
static const uint8_t A7 = 14;
static const uint8_t A8 = 15;
static const uint8_t A9 = 16;
static const uint8_t A10 = 17;
static const uint8_t A11 = 18;

static const uint8_t T1 = 1;
static const uint8_t T2 = 2;
static const uint8_t T3 = 3;
static const uint8_t T4 = 4;
static const uint8_t T8 = 8;
static const uint8_t T9 = 9;
// pfodWeb NOTE: T10 (GPIO10) deliberately NOT declared - same as A6 above.
static const uint8_t T14 = 14;

#define PIN_DAC_MUTE 47  // only if solder bridge "DAC_MUTE" is closed

#endif /* Pins_Arduino_h */
