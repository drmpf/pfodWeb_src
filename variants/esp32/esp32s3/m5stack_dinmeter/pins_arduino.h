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

static const uint8_t SDA = 13;
static const uint8_t SCL = 15;

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - these
// values don't correspond to any confirmed general SPI bus; GPIO12/40
// are actually the dedicated RTC I2C SCL and rotary encoder B lines
// respectively (see below), so this alias block is misleading/vestigial.

static const uint8_t G0 = 0;
static const uint8_t G1 = 1;
static const uint8_t G2 = 2;
static const uint8_t G3 = 3;
static const uint8_t G10 = 10;
static const uint8_t G13 = 13;
static const uint8_t G14 = 14;
static const uint8_t G15 = 15;
static const uint8_t G39 = 39;
static const uint8_t G42 = 42;
static const uint8_t G43 = 43;
static const uint8_t G44 = 44;

// pfodWeb NOTE: GPIO4-9 (ST7789P3 display CS/SCK/DC/MOSI/RESET/backlight),
// GPIO11/12 (dedicated RTC I2C SDA/SCL), GPIO40/41 (rotary encoder B/A
// quadrature lines), and GPIO46 (power-hold - must stay high to keep the
// board powered) deliberately NOT declared - confirmed via M5Stack
// DinMeter documentation (see board.json chipGpios override).

static const uint8_t ADC1 = 7;
static const uint8_t ADC2 = 8;

#endif /* Pins_Arduino_h */
