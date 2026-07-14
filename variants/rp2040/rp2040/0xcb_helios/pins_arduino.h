#pragma once

// Pin definitions taken from: https://raw.githubusercontent.com/0xCB-dev/0xCB-Helios/main/rev1.0/helios.webp

// LEDs
#define PIN_LED (17u)

// Serial
#define PIN_SERIAL1_TX (0u)
#define PIN_SERIAL1_RX (1u)

// Not pinned out
#define PIN_SERIAL2_TX (31u)
#define PIN_SERIAL2_RX (31u)

// SPI
#define PIN_SPI0_MISO (20u)
#define PIN_SPI0_MOSI (23u)
#define PIN_SPI0_SCK (22u)
#define PIN_SPI0_SS (21u)

// Not pinned out
#define PIN_SPI1_MISO (31u)
#define PIN_SPI1_MOSI (31u)
#define PIN_SPI1_SCK (31u)
#define PIN_SPI1_SS (31u)

// Not pinned out
#define PIN_WIRE0_SDA (31u)
#define PIN_WIRE0_SCL (31u)

// Wire
#define PIN_WIRE1_SDA (2u)
#define PIN_WIRE1_SCL (3u)

#define SERIAL_HOWMANY (1u)
#define SPI_HOWMANY (1u)
#define WIRE_HOWMANY (1u)

#define PIN_NEOPIXEL (25u)

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

// pfodWeb NOTE: SDA/SCL not declared — PIN_WIRE0_SDA/SCL are (31u) ("not
// pinned out"; GPIO31 doesn't physically exist), which otherwise leaked
// through as a phantom "SDA (GPIO31)" pin. Wire1 (GPIO2/3) is the real
// I2C bus on this board but isn't the default SDA/SCL alias target.
static const uint8_t SS = PIN_SPI0_SS;
static const uint8_t MOSI = PIN_SPI0_MOSI;
static const uint8_t MISO = PIN_SPI0_MISO;
static const uint8_t SCK = PIN_SPI0_SCK;
