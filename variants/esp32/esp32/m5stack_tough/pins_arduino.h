#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t TX = 1;
static const uint8_t RX = 3;

static const uint8_t SDA = 32;
static const uint8_t SCL = 33;

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - dedicated
// onboard TFT display + microSD shared SPI bus. This board's own pin
// values (SDA=32/SCL=33 general Grove I2C, SS=5/MOSI=23/MISO=38/SCK=18
// shared TFT+SD bus) exactly match M5Stack Core2's confirmed
// architecture (verified via the M5Unified library source for Core2;
// Tough is a ruggedized Core2-architecture variant) - see board.json.

// pfodWeb NOTE: G0/G2/G5/G12/G15/G18/G21/G22/G23/G34/G38 deliberately
// NOT declared - dedicated onboard speaker I2S (0/2/12), shared TFT+SD
// SPI bus (5/18/23/38), TFT DC (15), internal AXP192/RTC/touch I2C bus
// (21/22), and PDM mic clock (34) - matches Core2's confirmed
// architecture (see board.json chipGpios override). SDA/SCL (GPIO32/33)
// stay kept as the genuinely general Port A Grove I2C.
static const uint8_t G3 = 3;
static const uint8_t G13 = 13;
static const uint8_t G32 = 32;
static const uint8_t G27 = 27;
static const uint8_t G35 = 35;
static const uint8_t G36 = 36;
static const uint8_t G25 = 25;
static const uint8_t G26 = 26;
static const uint8_t G1 = 1;
static const uint8_t G14 = 14;
static const uint8_t G33 = 33;
static const uint8_t G19 = 19;

static const uint8_t G17 = 17;

static const uint8_t DAC1 = 25;
static const uint8_t DAC2 = 26;

static const uint8_t ADC1 = 35;
static const uint8_t ADC2 = 36;

#endif /* Pins_Arduino_h */
