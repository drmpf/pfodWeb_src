#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define TX2 14
#define RX2 13

static const uint8_t TX = 1;
static const uint8_t RX = 3;

static const uint8_t SDA = 25;
static const uint8_t SCL = 32;

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - dedicated
// onboard E-ink/SD shared SPI bus (confirmed via M5Stack Paper docs:
// CS=15/MOSI=12/MISO=13/SCK=14 exact match).

static const uint8_t G25 = 25;
static const uint8_t G32 = 32;

static const uint8_t G26 = 26;
static const uint8_t G33 = 33;

static const uint8_t G18 = 18;
static const uint8_t G19 = 19;

// pfodWeb NOTE: G21/G22 deliberately NOT declared - internal touch/RTC/
// EEPROM/sensor I2C bus (separate from the general Grove ports declared
// via SDA/SCL/G25-G33/G18-19 above). G36 deliberately NOT declared -
// dedicated touch controller interrupt line. G4 deliberately NOT
// declared - additional dedicated E-ink signal (see board.json
// chipGpios override).
static const uint8_t G2 = 2;
static const uint8_t G5 = 5;
static const uint8_t G23 = 23;

static const uint8_t G37 = 37;
static const uint8_t G38 = 38;
static const uint8_t G39 = 39;

static const uint8_t DAC1 = 25;
static const uint8_t DAC2 = 26;

static const uint8_t ADC1 = 35;
static const uint8_t ADC2 = 36;

#endif /* Pins_Arduino_h */
