#pragma once

// DatanoiseTV PicoADK+ - Audio Development Kit
// Pin definitions taken from:
// https://github.com/DatanoiseTV/PicoDSP-Hardware

// LEDs
#define PIN_LED        (15u)

// Debug LEDs near the USB connector
#define PIN_LED0       (2u)
#define PIN_LED1       (3u)
#define PIN_LED2       (4u)
#define PIN_LED3       (5u)

// Serial
#define PIN_SERIAL1_TX (0u)
#define PIN_SERIAL1_RX (1u)

#define PIN_SERIAL2_TX (8u)
#define PIN_SERIAL2_RX (9u)

// SPI0
#define PIN_SPI0_MISO  (16u)
#define PIN_SPI0_MOSI  (19u)
#define PIN_SPI0_SCK   (18u)
#define PIN_SPI0_SS    (17u)

// SPI1
#define PIN_SPI1_MISO  (12u)
#define PIN_SPI1_MOSI  (11u)
#define PIN_SPI1_SCK   (10u)
#define PIN_SPI1_SS    (13u)

// Wire
#define PIN_WIRE0_SDA  (8u)
#define PIN_WIRE0_SCL  (9u)

#define PIN_WIRE1_SDA  (6u)
#define PIN_WIRE1_SCL  (7u)

// I2S
#define PIN_I2S_BCLK   (17u)
#define PIN_I2S_LRCLK  (18u)
#define PIN_I2S_DOUT   (16u)

#define SERIAL_HOWMANY (3u)
#define SPI_HOWMANY    (2u)
#define WIRE_HOWMANY   (2u)

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
// pfodWeb NOTE: D16-D19 deliberately NOT declared — GPIO16-19 are SPI0,
// which this "Audio Development Kit" board reuses as the I2S bus to its
// onboard DAC (BCLK/LRCLK/DOUT aliases above), not general-purpose.
static const uint8_t D20 = (20u);
static const uint8_t D21 = (21u);
static const uint8_t D22 = (22u);

static const uint8_t A0 = (26u);
static const uint8_t A1 = (27u);
static const uint8_t A2 = (28u);

static const uint8_t SDA = PIN_WIRE0_SDA;
static const uint8_t SCL = PIN_WIRE0_SCL;
