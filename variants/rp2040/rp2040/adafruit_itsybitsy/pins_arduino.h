#pragma once

// Pin definitions taken from:
//    https://learn.adafruit.com/assets/100337

// LEDs
#define PIN_LED        (11u)

// NeoPixel
#define PIN_NEOPIXEL   (17u)
#define NEOPIXEL_POWER (16u)

// Serial
#define PIN_SERIAL1_TX (0u)
#define PIN_SERIAL1_RX (1u)

// Not pinned out
#define PIN_SERIAL2_TX (31u)
#define PIN_SERIAL2_RX (31u)

// SPI
#define PIN_SPI0_MISO  (20u)
#define PIN_SPI0_MOSI  (19u)
#define PIN_SPI0_SCK   (18u)
#define PIN_SPI0_SS    (31u) // not pinned out

// Not pinned out
#define PIN_SPI1_MISO  (31u)
#define PIN_SPI1_MOSI  (31u)
#define PIN_SPI1_SCK   (31u)
#define PIN_SPI1_SS    (31u)

// Wire
#define PIN_WIRE0_SDA  (24u)
#define PIN_WIRE0_SCL  (25u)
#define PIN_WIRE1_SDA  (2u)
#define PIN_WIRE1_SCL  (3u)

#define SERIAL_HOWMANY (2u)
#define SPI_HOWMANY    (1u)
#define WIRE_HOWMANY   (2u)

#define PINS_COUNT          (30u)
#define NUM_DIGITAL_PINS    (30u)
#define NUM_ANALOG_INPUTS   (4u)
#define NUM_ANALOG_OUTPUTS  (0u)
#define ADC_RESOLUTION      (12u)

// D pins (board silkscreen numbering, per Adafruit's own pins_arduino.h)
static const uint8_t D0 = (0u);
static const uint8_t D1 = (1u);
static const uint8_t D2 = (12u);
static const uint8_t D3 = (5u);
static const uint8_t D4 = (4u);
static const uint8_t D5 = (14u);
static const uint8_t D6 = (6u);
static const uint8_t D7 = (6u);
static const uint8_t D8 = (8u);
static const uint8_t D9 = (7u);
static const uint8_t D10 = (8u);
static const uint8_t D11 = (9u);
static const uint8_t D12 = (10u);
static const uint8_t D13 = (11u);
static const uint8_t D14 = (14u);
static const uint8_t D15 = (15u);
// pfodWeb NOTE: D16 deliberately NOT declared — GPIO16 (NEOPIXEL_POWER)
// is confirmed (Adafruit's own pinout guide) to be an internal-only power
// gate for the onboard NeoPixel, not broken out to any header/pad.
static const uint8_t D17 = (17u);
static const uint8_t D18 = (18u);
static const uint8_t D19 = (19u);
static const uint8_t D20 = (20u);
static const uint8_t D21 = (21u);
static const uint8_t D22 = (22u);
static const uint8_t D23 = (23u);
static const uint8_t D24 = (24u);
static const uint8_t D25 = (25u);
static const uint8_t D26 = (26u);
static const uint8_t D27 = (27u);
static const uint8_t D28 = (28u);
static const uint8_t D29 = (29u);

static const uint8_t A0 = (26u);
static const uint8_t A1 = (27u);
static const uint8_t A2 = (28u);
static const uint8_t A3 = (29u);

// pfodWeb NOTE: SS not declared — PIN_SPI0_SS is (31u) ("not pinned
// out"; GPIO31 doesn't physically exist).
static const uint8_t MOSI = PIN_SPI0_MOSI;
static const uint8_t MISO = PIN_SPI0_MISO;
static const uint8_t SCK = PIN_SPI0_SCK;

static const uint8_t SDA = PIN_WIRE0_SDA;
static const uint8_t SCL = PIN_WIRE0_SCL;
