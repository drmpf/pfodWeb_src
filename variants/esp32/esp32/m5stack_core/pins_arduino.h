#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t TX = 1;
static const uint8_t RX = 3;

static const uint8_t TXD2 = 17;
static const uint8_t RXD2 = 16;

static const uint8_t SDA = 21;
static const uint8_t SCL = 22;

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - dedicated
// onboard TFT (ILI9342C) + microSD shared SPI bus (confirmed via the
// official M5Stack Arduino library's Config.h: MOSI=23/MISO=19/CLK=18
// exactly match). The display is typically always active whenever the
// M5Stack library runs, so this bus isn't safely shareable the way an
// optional peripheral's bus would be (see board.json chipGpios
// override, which also excludes CS/DC/RST/backlight/SD-CS pins that
// aren't even declared in this file). SDA/SCL (GPIO21/22) stay kept -
// confirmed via M5Stack docs as genuinely shared with the external
// Grove Port A connector, not internal-only.
static const uint8_t G3 = 3;
static const uint8_t G16 = 16;
static const uint8_t G21 = 21;
static const uint8_t G2 = 2;
static const uint8_t G12 = 12;
static const uint8_t G15 = 15;
static const uint8_t G35 = 35;
static const uint8_t G36 = 36;
static const uint8_t G25 = 25;
static const uint8_t G26 = 26;
static const uint8_t G1 = 1;
static const uint8_t G17 = 17;
static const uint8_t G22 = 22;
static const uint8_t G13 = 13;
static const uint8_t G0 = 0;
static const uint8_t G34 = 34;

static const uint8_t DAC1 = 25;
static const uint8_t DAC2 = 26;

static const uint8_t ADC1 = 35;
static const uint8_t ADC2 = 36;

#endif /* Pins_Arduino_h */
