#pragma once


// LEDs
#define PIN_LED           (5u)

// NeoPixel
#define PIN_NEOPIXEL      (5u)
#define NEOPIXEL_POWER    (20u)


// CAN bus
#define PIN_CAN_CS        (9u)
#define PIN_CAN_INTERRUPT (29u)

//Accelerometer
#define PIN_LIS_CS         (1u)
//#define PIN_LIS_INTERRUPT1 (23u)
#define PIN_LIS_INTERRUPT1 (25u)

//MAX31865
#define PIN_MAX31865_CS     (24u)

// Serial
#define PIN_SERIAL1_TX    (20u)
#define PIN_SERIAL1_RX    (31u)

// Not pinned out
#define PIN_SERIAL2_TX    (31u)
#define PIN_SERIAL2_RX    (31u)

// Shared between LIS2D and MAX31865
#define PIN_SPI0_MISO     (0u)
#define PIN_SPI0_MOSI     (3u)
#define PIN_SPI0_SCK      (2u)
#define PIN_SPI0_SS       (1u)
#define __SPI0_DEVICE     spi1

// CAN
#define PIN_SPI1_MISO     (11u)
#define PIN_SPI1_MOSI     (8u)
#define PIN_SPI1_SCK      (10u)
#define PIN_SPI1_SS       (31u)
#define __SPI1_DEVICE     spi0

// Wire
#define PIN_WIRE0_SDA     (31u)
#define PIN_WIRE0_SCL     (31u)
#define __WIRE0_DEVICE    i2c1

#define PIN_WIRE1_SDA     (31u)
#define PIN_WIRE1_SCL     (31u)
#define __WIRE1_DEVICE    i2c0

#define SERIAL_HOWMANY    (1u)
#define SPI_HOWMANY       (2u)
#define WIRE_HOWMANY      (0u)

// pfodWeb NOTE: bespoke pin set (not the shared common.h) — GPIO0-3 (SPI0) are dedicated to the onboard LIS2D accelerometer + MAX31865 temperature sensor, GPIO8-11 (SPI1 + CAN_CS) are dedicated to the onboard CAN transceiver.
static const uint8_t D4 = (4u);
static const uint8_t D5 = (5u);
static const uint8_t D6 = (6u);
static const uint8_t D7 = (7u);
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

static const uint8_t SS = PIN_SPI0_SS;
static const uint8_t MOSI = PIN_SPI0_MOSI;
static const uint8_t MISO = PIN_SPI0_MISO;
static const uint8_t SCK = PIN_SPI0_SCK;

// pfodWeb NOTE: SDA/SCL not declared — PIN_WIRE0_SDA/SCL are (31u)
// ('not pinned out'; GPIO31 does not physically exist), which otherwise
// leaked through as a phantom 'SDA (GPIO31)' pin.
