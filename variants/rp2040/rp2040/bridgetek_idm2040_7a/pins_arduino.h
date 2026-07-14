#pragma once

// Pin definitions taken from:
//    https://brtchip.com/ic-module/wp-content/uploads/sites/3/2022/07/DS_IDM2040-7A-Revised.pdf


// LEDs
#define PIN_LED        (25u)

// Serial
#define PIN_SERIAL1_TX (0u)
#define PIN_SERIAL1_RX (1u)

#define PIN_SERIAL2_TX (8u)
#define PIN_SERIAL2_RX (9u)

// SPI
#define PIN_SPI0_MISO  (4u)
#define PIN_SPI0_MOSI  (3u)
#define PIN_SPI0_SCK   (2u)
#define PIN_SPI0_SS    (5u)

#define PIN_SPI1_MISO  (12u)
#define PIN_SPI1_MOSI  (11u)
#define PIN_SPI1_SCK   (10u)
#define PIN_SPI1_SS    (13u)

// default spi
#define PIN_SD_MOSI    PIN_SPI1_MOSI
#define PIN_SD_MISO    PIN_SPI1_MISO
#define PIN_SD_SCK     PIN_SPI1_SCK
#define PIN_SD_SS      PIN_SPI1_SS
#define SDCARD_DETECT  33

// Wire
#define PIN_WIRE0_SDA  (4u)
#define PIN_WIRE0_SCL  (5u)

#define PIN_WIRE1_SDA  (26u)
#define PIN_WIRE1_SCL  (27u)

#define SERIAL_HOWMANY (3u)
#define SPI_HOWMANY    (2u)
#define WIRE_HOWMANY   (2u)

static const uint8_t D0 = (0u);
static const uint8_t D1 = (1u);
// pfodWeb NOTE: D2-D5 deliberately NOT declared — GPIO2-5 are the onboard
// FT81x/BT81x (EVE) display's SPI0 bus (SCK/MOSI/MISO/SS), not
// general-purpose.
static const uint8_t D6 = (6u);
static const uint8_t D7 = (7u);
static const uint8_t D8 = (8u);
static const uint8_t D9 = (9u);
// pfodWeb NOTE: D10-D13 deliberately NOT declared — GPIO10-13 are the
// onboard SD card's SPI1 bus (SCK/MOSI/MISO/SS), not general-purpose.
static const uint8_t D14 = (14u);
static const uint8_t D15 = (15u);
static const uint8_t D16 = (16u);
static const uint8_t D17 = (17u);
static const uint8_t D18 = (18u);
static const uint8_t D19 = (19u);
static const uint8_t D20 = (20u);
static const uint8_t D21 = (21u);
static const uint8_t D22 = (22u);

static const uint8_t A0 = (26u);
static const uint8_t A1 = (27u);
static const uint8_t A2 = (28u);
// pfodWeb NOTE: no SS/MOSI/MISO/SCK/SDA/SCL aliases declared — the
// board's only SPI0/Wire0 pins are the excluded EVE display bus above;
// Wire1 (GPIO26/27) is already available via A0/A1.
