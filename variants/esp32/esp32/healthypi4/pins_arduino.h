#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t LED_BUILTIN = 15;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

static const uint8_t KEY_BUILTIN = 17;

static const uint8_t TX = 1;
static const uint8_t RX = 3;

static const uint8_t SDA = 21;
static const uint8_t SCL = 22;

static const uint8_t SS = 2;
static const uint8_t MOSI = 23;
static const uint8_t MISO = 19;
static const uint8_t SCK = 18;

// pfodWeb NOTE: A3/A10/A14/A16/A17/A19 and T0/T4/T6/T7 deliberately NOT
// declared - dedicated onboard ADS1292 ECG and AFE4490 PPG/pulse-ox
// sensor chip pins (see below).
static const uint8_t A0 = 36;
static const uint8_t A4 = 32;
static const uint8_t A5 = 33;
static const uint8_t A6 = 34;
static const uint8_t A7 = 35;
static const uint8_t A11 = 0;
static const uint8_t A12 = 2;
static const uint8_t A13 = 15;
static const uint8_t A15 = 12;
static const uint8_t A18 = 25;

static const uint8_t T1 = 0;
static const uint8_t T2 = 2;
static const uint8_t T3 = 15;
static const uint8_t T5 = 12;
static const uint8_t T8 = 33;
static const uint8_t T9 = 32;

static const uint8_t DAC1 = 25;
// pfodWeb NOTE: DAC2 (GPIO26) deliberately NOT declared - same GPIO as
// the dedicated ADS1292_DRDY_PIN below.

// pfodWeb NOTE: ADS1292_*/AFE4490_* deliberately NOT declared - dedicated
// onboard ECG and PPG/pulse-oximeter sensor chip pins, not general-purpose.

static const uint8_t PUSH_BUTTON = 17;
static const uint8_t SLIDE_SWITCH = 16;

#endif /* Pins_Arduino_h */
