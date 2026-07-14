#pragma once

// Pin definitions taken from:
//    https://learn.adafruit.com/assets/100337

// LEDs not pinned out
#define PIN_LED        (31u)

// NeoPixel
#define PIN_NEOPIXEL   (12u)
#define NEOPIXEL_POWER (11u)

// Serial1
#define PIN_SERIAL1_TX (28u) // marked A1 on the Board
#define PIN_SERIAL1_RX (29u) // marked A0 on the Board

// Serial2
#define PIN_SERIAL2_TX (20u) // marked TX on the Board
#define PIN_SERIAL2_RX (5u)  // marked RX on the Board

// SPI
#define PIN_SPI0_MISO  (4u)
#define PIN_SPI0_MOSI  (3u)
#define PIN_SPI0_SCK   (6u)
#define PIN_SPI0_SS    (31u) // not pinned out

// Not pinned out
#define PIN_SPI1_MISO  (31u)
#define PIN_SPI1_MOSI  (31u)
#define PIN_SPI1_SCK   (31u)
#define PIN_SPI1_SS    (31u)

// Wire
#define PIN_WIRE0_SDA  (24u)
#define PIN_WIRE0_SCL  (25u)

// Wire1 is connected to StemmaQT connector
#define PIN_WIRE1_SDA  (22u)
#define PIN_WIRE1_SCL  (23u)

#define SERIAL_HOWMANY (2u)
#define SPI_HOWMANY    (1u)
#define WIRE_HOWMANY   (2u)

#define PINS_COUNT          (30u)
#define NUM_DIGITAL_PINS    (30u)
#define NUM_ANALOG_INPUTS   (4u)
#define NUM_ANALOG_OUTPUTS  (0u)
#define ADC_RESOLUTION      (12u)

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
static const uint8_t D10 = (10u);
// pfodWeb NOTE: D11 deliberately NOT declared — GPIO11 (NEOPIXEL_POWER)
// is confirmed (Adafruit's own pinout guide) to be an internal-only power
// gate for the onboard NeoPixel, not broken out to any castellated pad.
static const uint8_t D12 = (12u);
static const uint8_t D13 = (13u);
static const uint8_t D14 = (14u);
static const uint8_t D15 = (15u);
static const uint8_t D16 = (16u);
static const uint8_t D17 = (17u);
static const uint8_t D18 = (18u);
static const uint8_t D19 = (19u);
static const uint8_t D20 = (20u);
static const uint8_t D21 = (21u);
static const uint8_t D22 = (22u);
static const uint8_t D23 = (23u);
static const uint8_t D24 = (24u);
static const uint8_t D25 = (25u);

// pfodWeb NOTE: A0-A3 overridden per QT Py RP2040's own silkscreen (the
// upstream vendor file reverses the default A-pin order for this board).
static const uint8_t A0 = (29u);
static const uint8_t A1 = (28u);
static const uint8_t A2 = (27u);
static const uint8_t A3 = (26u);

// pfodWeb NOTE: SS not declared — PIN_SPI0_SS is (31u) ("not pinned
// out"; GPIO31 doesn't physically exist).
static const uint8_t MOSI = PIN_SPI0_MOSI;
static const uint8_t MISO = PIN_SPI0_MISO;
static const uint8_t SCK = PIN_SPI0_SCK;

static const uint8_t SDA = PIN_WIRE0_SDA;
static const uint8_t SCL = PIN_WIRE0_SCL;
