#pragma once

// LEDs
#define PIN_LED        (8u)

// Serial
#define PIN_SERIAL1_TX (0u)
#define PIN_SERIAL1_RX (1u)

// Not pinned out
#define PIN_SERIAL2_TX (31u)
#define PIN_SERIAL2_RX (31u)

// SPI Not pinned out
#define PIN_SPI0_MISO  (31u)
#define PIN_SPI0_MOSI  (31u)
#define PIN_SPI0_SCK   (31u)
#define PIN_SPI0_SS    (31u)

// Wire
#define PIN_WIRE0_SDA  (4u)
#define PIN_WIRE0_SCL  (5u)

// Wire1  Not pinned out
#define PIN_WIRE1_SDA  (31u)
#define PIN_WIRE1_SCL  (31u)

#define SERIAL_HOWMANY (1u)
#define SPI_HOWMANY    (1u)
#define WIRE_HOWMANY   (1u)

#define PINS_COUNT          (26u)
#define NUM_DIGITAL_PINS    (26u)
#define NUM_ANALOG_INPUTS   (3u)
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

static const uint8_t A0 = (26u);
static const uint8_t A1 = (27u);
static const uint8_t A2 = (28u);

// pfodWeb NOTE: SS/MOSI/MISO/SCK not declared — SPI0 is entirely (31u)
// ("not pinned out"; GPIO31 doesn't physically exist), which otherwise
// leaked through as a phantom "SS (GPIO31)" pin.
static const uint8_t SDA = PIN_WIRE0_SDA;
static const uint8_t SCL = PIN_WIRE0_SCL;
