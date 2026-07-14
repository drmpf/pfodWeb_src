#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define TX2 14
#define RX2 13

static const uint8_t TX = 1;
static const uint8_t RX = 3;

static const uint8_t SDA = 32;
static const uint8_t SCL = 33;

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - dedicated
// onboard TFT display + microSD shared SPI bus (confirmed via M5Core2
// library source: TFT_CS/MOSI/SCLK/MISO).

// pfodWeb NOTE: G0/G2/G12/G15/G18/G21/G22/G23/G34/G38 deliberately NOT
// declared - dedicated onboard speaker I2S (0/2/12), internal AXP192/
// RTC/touch I2C bus (21/22), shared TFT+SD SPI bus (18/23/38), TFT DC
// (15), and PDM mic clock (34) - see board.json chipGpios override.
// GPIO32/33 stay kept as G32/G33/SDA/SCL - confirmed via library source
// as the genuinely general Port A Grove I2C, separate from the internal
// bus above.
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
