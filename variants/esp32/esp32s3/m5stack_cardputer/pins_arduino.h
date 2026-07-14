#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

#define USB_VID 0x303a
#define USB_PID 0x1001

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t TXD2 = 1;
static const uint8_t RXD2 = 2;

// pfodWeb NOTE: SDA/SCL (GPIO13/15) deliberately NOT declared - unlike
// the sibling M5Stack Dial/Capsule boards, on CardPuter these are
// dedicated keyboard-matrix INPUT lines, not a general Grove I2C port
// (confirmed via the official M5Cardputer firmware's IOMatrix.h; the
// real Grove I2C on this board is GPIO1/2, already declared as TXD2/
// RXD2 above and kept).

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - dedicated
// onboard microSD card SPI bus (confirmed via M5Unified library source:
// exact CLK/MOSI/MISO/CS match).

// pfodWeb NOTE: G3-G9/G11-G15/G39/G40/G43/G46 deliberately NOT declared -
// dedicated onboard keyboard matrix, microSD card, LCD (ST7789), and mic
// pins (see above and board.json chipGpios override).
static const uint8_t G0 = 0;
static const uint8_t G1 = 1;
static const uint8_t G2 = 2;
static const uint8_t G10 = 10;
static const uint8_t G41 = 41;
static const uint8_t G42 = 42;
static const uint8_t G44 = 44;

static const uint8_t ADC1 = 7;
static const uint8_t ADC2 = 8;

#endif /* Pins_Arduino_h */
