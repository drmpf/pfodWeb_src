#pragma once

// LEDs
#define PIN_LED        (28u)

// NeoPixel
#define PIN_NEOPIXEL   (22u)

// SD Card
#define PIN_CARD_CS 21
// PIN_CARD_DETECT on IO expander

#define TFT_DC 23
#define TFT_CS 24
#define TFT_BACKLIGHT 25
#define TFT_RESET 0

// pins on the 34-pin header
#define DENSITY_PIN 1 // IDC 2
#define INDEX_PIN 10  // IDC 8
#define SELECT_PIN 2  // IDC 12
#define MOTOR_PIN 3   // IDC 16
#define DIR_PIN 4     // IDC 18
#define STEP_PIN 5    // IDC 20
#define WRDATA_PIN 6  // IDC 22 (not used during read)
#define WRGATE_PIN 7  // IDC 24 (not used during read)
#define TRK0_PIN 11   // IDC 26
#define PROT_PIN 12   // IDC 28
#define READ_PIN 13   // IDC 30
#define SIDE_PIN 8    // IDC 32
#define READY_PIN 14  // IDC 34

// pins for Apple Disk ][ interfacing (20-pin IDC header)
#define APPLE2_PHASE1_PIN  SIDE_PIN    // IDC 2 "Phi0"
#define APPLE2_PHASE2_PIN  STEP_PIN    // IDC 4 "Phi1"
#define APPLE2_PHASE3_PIN  DIR_PIN     // IDC 6 "Phi2"
#define APPLE2_PHASE4_PIN  MOTOR_PIN   // IDC 8 "Phi3"
#define APPLE2_WRGATE_PIN  WRGATE_PIN  // IDC 10 "WR REQ"
// (IDC 12 is VCC)
#define APPLE2_ENABLE_PIN  DENSITY_PIN // IDC 14 "DRVEN/"
#define APPLE2_RDDATA_PIN  READ_PIN    // IDC 16 "RD DATA"
#define APPLE2_WRDATA_PIN  WRDATA_PIN  // IDC 18 "WR DATA"
#define APPLE2_PROTECT_PIN PROT_PIN    // IDC 20 "W PROT"

#define APPLE2_INDEX_PIN   (26)          // SENSE 1 JST connector

#define FLOPPY_DIRECTION_PIN 9
#define FLOPPY_ENABLE_PIN 15

// Not pinned out
#define PIN_SERIAL1_TX (31u)
#define PIN_SERIAL1_RX (31u)

// Not pinned out
#define PIN_SERIAL2_TX (31u)
#define PIN_SERIAL2_RX (31u)

// SPI
#define PIN_SPI0_SCK   (18u)
#define PIN_SPI0_MOSI  (19u)
#define PIN_SPI0_MISO  (20u)
#define PIN_SPI0_SS    (24u)
#define __SPI0_DEVICE  spi0

// Not pinned out
#define PIN_SPI1_MISO  (31u)
#define PIN_SPI1_MOSI  (31u)
#define PIN_SPI1_SCK   (31u)
#define PIN_SPI1_SS    (31u)
#define __SPI1_DEVICE  spi1

// Wire
#define PIN_WIRE0_SDA  (16u)
#define PIN_WIRE0_SCL  (17u)
#define __WIRE0_DEVICE i2c0

#define PIN_WIRE1_SDA  (31u)
#define PIN_WIRE1_SCL  (31u)
#define __WIRE1_DEVICE i2c1

#define SERIAL_HOWMANY (0u)
#define SPI_HOWMANY    (1u)
#define WIRE_HOWMANY   (1u)

// pfodWeb NOTE: bespoke pin set (not ../generic_full/common.h) — this
// board is a specialized floppy-drive/Apple II disk controller and TFT
// display driver, so nearly every GPIO already has a fixed hardware role
// (floppy interface signals, TFT, SD card CS) — only Wire0 (16/17), the
// remaining SPI0 lines (18-20), NeoPixel (22), LED (27/28 area) and A1-A3
// are left as general-purpose. GPIO26 (APPLE2_INDEX_PIN) is dedicated, so
// A0 is intentionally not declared here (A1-A3 keep their normal names).
static const uint8_t D16 = (16u);
static const uint8_t D17 = (17u);
static const uint8_t D18 = (18u);
static const uint8_t D19 = (19u);
static const uint8_t D20 = (20u);
static const uint8_t D22 = (22u);
static const uint8_t D27 = (27u);
static const uint8_t D28 = (28u);
static const uint8_t D29 = (29u);

static const uint8_t A1 = (27u);
static const uint8_t A2 = (28u);
static const uint8_t A3 = (29u);

static const uint8_t SS = PIN_SPI0_SS;
static const uint8_t MOSI = PIN_SPI0_MOSI;
static const uint8_t MISO = PIN_SPI0_MISO;
static const uint8_t SCK = PIN_SPI0_SCK;

static const uint8_t SDA = PIN_WIRE0_SDA;
static const uint8_t SCL = PIN_WIRE0_SCL;
