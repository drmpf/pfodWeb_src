#pragma once

// Pin definitions taken from:
//    https://datasheets.raspberrypi.org/pico/pico-datasheet.pdf

#define PIN_HE0 (0u)

#define PIN_FAN0 (1u)
#define PIN_FAN1 (2u)
#define PIN_FAN2 (3u)

#define PIN_E0_DIR (4u)
#define PIN_E0_STEP (5u)

#define PIN_SERIAL1_TX (6u)
#define PIN_E0_UART (6u)
#define PIN_SERIAL1_RX (31u)
#define PIN_E0_DIAG (7u)
#define PIN_E0_EN (10u)

#define PIN_CAN_RX (8u)
#define PIN_CAN_TX (9u)
#define PIN_SERIAL2_TX (8u)
#define PIN_SERIAL2_RX (9u)

#define PIN_3D_TOUCH (11u)

//SPI
#define PIN_SPI1_MISO  (12u)
#define PIN_SPI1_MOSI  (15u)
#define PIN_SPI1_SCK   (14u)
#define PIN_SPI1_SS    (13u)

#define PIN_SPI0_MISO  (16u)
#define PIN_SPI0_MOSI  (19u)
#define PIN_SPI0_SCK   (18u)
#define PIN_SPI0_SS    (17u)

#define PIN_NEOPIXEL   (20u)
#define PIN_ZPLUS      (21u)

// Wire
#define PIN_WIRE0_SDA  (22u)
#define PIN_WIRE0_SCL  (23u)
#define PIN_I2C_SDA  (22u)
#define PIN_I2C_SCL  (23u)

#define PIN_IO24     (24u)
#define PIN_IO25     (25u)

#define PIN_TH0      (26u)
#define PIN_IPO29    (29u)

#define SERIAL_HOWMANY (3u)
#define SPI_HOWMANY    (2u)
#define WIRE_HOWMANY   (1u)

// pfodWeb NOTE: bespoke pin set (not the shared common.h) — GPIO0,1,2,3,4,5,6,8,9,10 are dedicated to an onboard peripheral on this board (see comments above), not general-purpose.
static const uint8_t D7 = (7u);
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

static const uint8_t SS = PIN_SPI0_SS;
static const uint8_t MOSI = PIN_SPI0_MOSI;
static const uint8_t MISO = PIN_SPI0_MISO;
static const uint8_t SCK = PIN_SPI0_SCK;

static const uint8_t SDA = PIN_WIRE0_SDA;
static const uint8_t SCL = PIN_WIRE0_SCL;
