#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t TX = 1;
static const uint8_t RX = 3;

// pfodWeb NOTE: A4/A13-A17 and T3-T7/T9 deliberately NOT declared -
// dedicated onboard touch panel, TFT display, and microSD card pins
// (see below).
static const uint8_t A0 = 36;
static const uint8_t A3 = 39;
static const uint8_t A5 = 33;
static const uint8_t A6 = 34;
static const uint8_t A7 = 35;
static const uint8_t A10 = 4;
static const uint8_t A11 = 0;
static const uint8_t A12 = 2;
static const uint8_t A18 = 25;
static const uint8_t A19 = 26;

static const uint8_t T0 = 4;
static const uint8_t T1 = 0;
static const uint8_t T2 = 2;
static const uint8_t T8 = 33;

static const uint8_t DAC1 = 25;
static const uint8_t DAC2 = 26;

static const uint8_t SDA = 4;
static const uint8_t SCL = 5;

// pfodWeb NOTE: MOSI/MISO/SCK/SS and TP_RST/TP_INT/TFT_BL/CS/DC/RST/
// SD_CS/SD_CD deliberately NOT declared - dedicated onboard touch panel,
// TFT display, and microSD card shared SPI bus (see board.json).
#endif /* Pins_Arduino_h */
