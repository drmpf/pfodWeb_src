#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

#define USB_VID 0x303a
#define USB_PID 0x1001

// Some boards have too low voltage on this pin (board design bug)
// Use different pin with 3V and connect with 48
// and change this setup for the chosen pin (for example 38)
static const uint8_t LED_BUILTIN = SOC_GPIO_PIN_COUNT + 48;
#define BUILTIN_LED    LED_BUILTIN  // backward compatibility
#define LED_BUILTIN    LED_BUILTIN
#define RGB_BUILTIN    LED_BUILTIN
#define RGB_BRIGHTNESS 64

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t TXD2 = 17;
static const uint8_t RXD2 = 18;

// pfodWeb NOTE: SDA/SCL (GPIO12/11) deliberately NOT declared - confirmed
// via M5Stack's own CoreS3 documentation as the dedicated internal I2C bus
// shared by the touch controller, IMU, RTC, and PMU. SS/MOSI/MISO/SCK
// (GPIO15/37/35/36) deliberately NOT declared - MOSI/SCK/MISO are the same
// GPIOs as the onboard LCD+microSD shared SPI bus (see board.json).

static const uint8_t G0 = 0;
static const uint8_t G1 = 1;
static const uint8_t G2 = 2;
static const uint8_t G5 = 5;
static const uint8_t G6 = 6;
static const uint8_t G7 = 7;
static const uint8_t G8 = 8;
static const uint8_t G9 = 9;
static const uint8_t G13 = 13;
static const uint8_t G14 = 14;
static const uint8_t G17 = 17;
static const uint8_t G18 = 18;
static const uint8_t G21 = 21;
static const uint8_t G33 = 33;
static const uint8_t G34 = 34;
static const uint8_t G38 = 38;

static const uint8_t ADC = 10;

#endif /* Pins_Arduino_h */
