#pragma once

// Pin definitions taken from:
//    RAK definition: https://github.com/RAKWireless/RAK-RP-Arduino/
//    RAK datasheet: https://docs.rakwireless.com/Product-Categories/WisDuo/RAK11300-Module/Datasheet/#overview
//    Internal wiring of SX1262 module: https://forum.rakwireless.com/t/rak11300-pinout-rp2040-to-sx1262/8414/

// Serial
#define PIN_SERIAL1_TX (0u)
#define PIN_SERIAL1_RX (1u)

#define PIN_SERIAL2_TX (5u)
#define PIN_SERIAL2_RX (4u)

// SPI
#define PIN_SPI0_MISO  (16u)
#define PIN_SPI0_MOSI  (19u)
#define PIN_SPI0_SCK   (18u)
#define PIN_SPI0_SS    (17u)

// Hardwired to SX1262 Radio
#define PIN_SPI1_MISO  (12u)
#define PIN_SPI1_MOSI  (11u)
#define PIN_SPI1_SCK   (10u)
#define PIN_SPI1_SS    (13u)
// Reset / NReset PIN
#define PIN_SX1262_NRESET   (14u)
// Busy / GPIO PIN
#define PIN_SX1262_BUSY     (15u)
// DIO1 / IRQ PIN
#define PIN_SX1262_DIO1     (29u)
// Antenna Switch power control
#define PIN_SX1262_ANT_PWR  (25u)

// Wire
#define PIN_WIRE0_SDA  (2u)
#define PIN_WIRE0_SCL  (3u)

#define PIN_WIRE1_SDA  (20u)
#define PIN_WIRE1_SCL  (21u)

#define SERIAL_HOWMANY (2u)
#define SPI_HOWMANY    (2u)
#define WIRE_HOWMANY   (2u)

// pfodWeb NOTE: bespoke pin set (not the shared common.h) — GPIO10,11,12,13,14,15,25,29 are dedicated to an onboard peripheral on this board (see comments above), not general-purpose.
static const uint8_t D0 = (0u);
static const uint8_t D1 = (1u);
static const uint8_t D2 = (2u);
static const uint8_t D3 = (3u);
static const uint8_t D4 = (4u);
static const uint8_t D5 = (5u);
static const uint8_t D6 = (6u);
static const uint8_t D7 = (7u);
static const uint8_t D8 = (8u);
static const uint8_t D9 = (9u);
static const uint8_t D16 = (16u);
static const uint8_t D17 = (17u);
static const uint8_t D18 = (18u);
static const uint8_t D19 = (19u);
static const uint8_t D20 = (20u);
static const uint8_t D21 = (21u);
static const uint8_t D22 = (22u);
static const uint8_t D23 = (23u);
static const uint8_t D24 = (24u);
static const uint8_t D26 = (26u);
static const uint8_t D27 = (27u);
static const uint8_t D28 = (28u);

static const uint8_t A0 = (26u);
static const uint8_t A1 = (27u);
static const uint8_t A2 = (28u);

static const uint8_t SS = PIN_SPI0_SS;
static const uint8_t MOSI = PIN_SPI0_MOSI;
static const uint8_t MISO = PIN_SPI0_MISO;
static const uint8_t SCK = PIN_SPI0_SCK;

static const uint8_t SDA = PIN_WIRE0_SDA;
static const uint8_t SCL = PIN_WIRE0_SCL;
