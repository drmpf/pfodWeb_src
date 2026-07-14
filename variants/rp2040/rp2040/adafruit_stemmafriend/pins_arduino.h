#pragma once

// Pin definitions taken from:
//    https://learn.adafruit.com/assets/100337

// LEDs not pinned out
#define PIN_LED        (12u)  // backlight, weird but why not?

#define PIN_NEOPIXEL   (17u)
#define NUM_NEOPIXEL   (1u)
#define PIN_SWITCH     (11u)

// Serial
#define PIN_SERIAL1_TX (26u)  // shared on grove/jst 2mm
#define PIN_SERIAL1_RX (27u)  // shared on grove/jst 2mm

// Not pinned out
#define PIN_SERIAL2_TX (20u)  // shared on JST SH
#define PIN_SERIAL2_RX (21u)

// SPI
#define PIN_SPI0_MISO  (4u)  // unconnected
#define PIN_SPI0_MOSI  (7u)  // TFT data
#define PIN_SPI0_SCK   (2u)  // TFT clock
#define PIN_SPI0_SS    (1u)  // TFT CS

// Not pinned out
#define PIN_SPI1_MISO  (31u)
#define PIN_SPI1_MOSI  (31u)
#define PIN_SPI1_SCK   (31u)
#define PIN_SPI1_SS    (31u)

// Wire connected to STEMMA QT
#define PIN_WIRE0_SDA  (20u)
#define PIN_WIRE0_SCL  (21u)

// Wire1 is connected to Stemma JST/grove connector
#define PIN_WIRE1_SDA  (26u)
#define PIN_WIRE1_SCL  (27u)

#define SERIAL_HOWMANY (2u)
#define SPI_HOWMANY    (1u)
#define WIRE_HOWMANY   (2u)

#define PINS_COUNT          (30u)
#define NUM_DIGITAL_PINS    (30u)
#define NUM_ANALOG_INPUTS   (4u)
#define NUM_ANALOG_OUTPUTS  (0u)
#define ADC_RESOLUTION      (12u)

static const uint8_t D0 = (0u);
// pfodWeb NOTE: D1/D2/D4/D7 deliberately NOT declared — GPIO1/2/4/7 are
// SPI0, dedicated to driving this board's attached TFT (CS/clock/data;
// MISO is unconnected), not general-purpose.
static const uint8_t D3 = (3u);
static const uint8_t D5 = (5u);
static const uint8_t D6 = (6u);
static const uint8_t D8 = (8u);
static const uint8_t D9 = (9u);
static const uint8_t D10 = (10u);
static const uint8_t D11 = (11u);
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
static const uint8_t D26 = (26u);
static const uint8_t D27 = (27u);
static const uint8_t D28 = (28u);
static const uint8_t D29 = (29u);

static const uint8_t A0 = (26u);
static const uint8_t A1 = (27u);
static const uint8_t A2 = (28u);
static const uint8_t A3 = (29u);

static const uint8_t SDA = PIN_WIRE0_SDA;
static const uint8_t SCL = PIN_WIRE0_SCL;
