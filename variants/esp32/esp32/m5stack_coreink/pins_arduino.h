#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define TX2 14
#define RX2 13

static const uint8_t TX = 1;
static const uint8_t RX = 3;

static const uint8_t SDA = 32;
static const uint8_t SCL = 33;

// pfodWeb NOTE: SS/MOSI/SCK deliberately NOT declared - dedicated
// onboard E-ink display SPI bus (confirmed via M5Core-Ink library
// source: CS=9/SCK=18/MOSI=23 exact match). MISO (GPIO34) stays kept -
// no confirmed dedicated use found for this pin.
static const uint8_t MISO = 34;

static const uint8_t G26 = 26;
static const uint8_t G36 = 36;
static const uint8_t G25 = 25;

static const uint8_t G32 = 32;
static const uint8_t G33 = 33;

// pfodWeb NOTE: G21/G22 deliberately NOT declared - internal RTC I2C
// bus. G2 deliberately NOT declared - dedicated onboard speaker. G12
// deliberately NOT declared - dedicated power-hold pin (see board.json
// chipGpios override). G5/G10/G37/G38/G39 stay kept - confirmed buttons
// (UP/DOWN/MID/EXT) and status LED, kept per policy.
static const uint8_t G13 = 13;
static const uint8_t G14 = 14;

static const uint8_t G19 = 19;

static const uint8_t G5 = 5;
static const uint8_t G10 = 10;
static const uint8_t G37 = 37;
static const uint8_t G38 = 38;
static const uint8_t G39 = 39;

static const uint8_t DAC1 = 25;
static const uint8_t DAC2 = 26;

static const uint8_t ADC1 = 35;
static const uint8_t ADC2 = 36;

#endif /* Pins_Arduino_h */
