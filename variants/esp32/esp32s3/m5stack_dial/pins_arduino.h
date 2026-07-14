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

// pfodWeb NOTE: SS/MOSI/SCK deliberately NOT declared (GPIO12/14/40) -
// no SD card on this board (confirmed via M5Unified library source);
// these values just collide with the internal I2C SCL, touch interrupt,
// and rotary encoder B line below. MISO (GPIO39) stays declared - no
// confirmed dedicated use found for this pin.
static const uint8_t MISO = 39;

// pfodWeb NOTE: G4-G12/G14/G40/G41/G46 deliberately NOT declared -
// dedicated onboard LCD (GC9A01), RFID (WS1850S), internal touch/RTC
// I2C bus, rotary encoder, and power-hold pins (confirmed via M5Unified
// library source + M5Stack docs). SDA/SCL (GPIO13/15, confirmed general
// external Grove I2C) stay kept.
static const uint8_t G0 = 0;
static const uint8_t G1 = 1;
static const uint8_t G2 = 2;
static const uint8_t G3 = 3;
static const uint8_t G13 = 13;
static const uint8_t G15 = 15;
static const uint8_t G39 = 39;
static const uint8_t G42 = 42;
static const uint8_t G43 = 43;
static const uint8_t G44 = 44;

static const uint8_t ADC1 = 7;
static const uint8_t ADC2 = 8;

#endif /* Pins_Arduino_h */
