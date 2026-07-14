#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t TX = 1;
static const uint8_t RX = 3;

#define TX1 17
#define RX1 16

static const uint8_t SDA = 21;
static const uint8_t SCL = 22;
// pfodWeb NOTE: I2C_INT (GPIO4) deliberately NOT declared - dedicated
// onboard interrupt line, not general-purpose.

// pfodWeb NOTE: SDA1/SCL1 deliberately NOT declared - same GPIO26/25 as
// the dedicated onboard audio codec's AUD_BCLK/AUD_LRCLK below.

static const uint8_t SS = 5;
static const uint8_t MOSI = 23;
static const uint8_t MISO = 19;
static const uint8_t SCK = 18;

static const uint8_t A0 = 34;
static const uint8_t A1 = 35;
static const uint8_t BATT_VIN = 39;
#define BAT_VOLT_PIN BATT_VIN

static const uint8_t PWM0 = 13;
static const uint8_t PWM1 = 12;

static const uint8_t D0 = 14;
static const uint8_t D1 = 27;

// pfodWeb NOTE: G1-G4 deliberately NOT declared - same dedicated onboard
// audio codec pins as AUD_LRCLK/BCLK/OUT/IN below.
static const uint8_t G0 = 15;
static const uint8_t G5 = 32;
static const uint8_t G6 = 33;

// pfodWeb NOTE: AUD_OUT/IN/LRCLK/BCLK deliberately NOT declared -
// dedicated onboard audio codec I2S bus, not general-purpose.

static const uint8_t T0 = 4;
static const uint8_t T1 = 0;
static const uint8_t T2 = 2;
static const uint8_t T3 = 15;
static const uint8_t T4 = 13;
static const uint8_t T5 = 12;
static const uint8_t T6 = 14;
static const uint8_t T7 = 27;
static const uint8_t T8 = 33;
static const uint8_t T9 = 32;

static const uint8_t DAC1 = 25;
static const uint8_t DAC2 = 26;

static const uint8_t LED_BUILTIN = 2;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

#endif /* Pins_Arduino_h */
