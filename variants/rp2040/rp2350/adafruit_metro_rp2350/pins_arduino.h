#pragma once

#define PICO_RP2350A 0 // RP2350B

// LEDs
#define PIN_LED        (23u)

#define PIN_NEOPIXEL   (25)
#define NUM_NEOPIXEL   (1)

// 'Boot0' button also on GPIO #24
#define PIN_BUTTON      (24u)

// USB host connector
#define PIN_USB_HOST_DP (32u)
#define PIN_USB_HOST_DM (33u)
#define PIN_5V_EN       (29u)
#define PIN_5V_EN_STATE (1u)

// SDIO
#define PIN_SD_CLK       (34u)
#define PIN_SD_CMD_MOSI  (35u)
#define PIN_SD_DAT0_MISO (36u)
#define PIN_SD_DAT1      (37u)
#define PIN_SD_DAT2      (38u)
#define PIN_SD_DAT3_CS   (39u)
#define PIN_SD_DETECT    (40u)

#define __PIN_A0        (41u)
#define __PIN_A1        (42u)
#define __PIN_A2        (43u)
#define __PIN_A3        (44u)
#define __PIN_A4        (45u)
#define __PIN_A5        (46u)

// UARTs
#define PIN_SERIAL1_TX (0u)
#define PIN_SERIAL1_RX (1u)
#define PIN_SERIAL2_TX (99u) // not pinned out
#define PIN_SERIAL2_RX (99u)

// SPI
#define __SPI0_DEVICE   spi1
#define PIN_SPI1_MISO  (36u)
#define PIN_SPI1_MOSI  (35u)
#define PIN_SPI1_SCK   (34u)
#define PIN_SPI1_SS    (39u)

#define __SPI1_DEVICE   spi0
#define PIN_SPI0_MISO  (28u)
#define PIN_SPI0_MOSI  (31u)
#define PIN_SPI0_SCK   (30u)
#define PIN_SPI0_SS    (29u)

// Wire
#define __WIRE0_DEVICE i2c0
#define PIN_WIRE0_SDA  (20u)
#define PIN_WIRE0_SCL  (21u)

#define __WIRE1_DEVICE i2c1
#define PIN_WIRE1_SDA  (99u) // not pinned out
#define PIN_WIRE1_SCL  (99u)

#define SERIAL_HOWMANY (1u)
#define SPI_HOWMANY    (2u)
#define WIRE_HOWMANY   (1u)

// PSRAM
#define RP2350_PSRAM_CS         (47u)
#define RP2350_PSRAM_MAX_SCK_HZ (109*1000*1000)

// DVI connector
#define PIN_CKN (15u)
#define PIN_CKP (14u)
#define PIN_D0N (19u)
#define PIN_D0P (18u)
#define PIN_D1N (17u)
#define PIN_D1P (16u)
#define PIN_D2N (13u)
#define PIN_D2P (12u)


// pfodWeb NOTE: bespoke, fully self-contained pin set (not
// ../generic_full/common.h — that's 30-pin RP2040/RP2350A only, but this
// board is genuinely RP2350B / 48-pin per its own `PICO_RP2350A 0` above).
// GPIO12-19 (DVI), GPIO29/32/33 (USB host connector, incl. its 5V enable
// which happens to share SPI0_SS), GPIO34-40 (SDIO/SD card), and GPIO47
// (PSRAM) are dedicated to onboard peripherals, not general-purpose.
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
static const uint8_t D20 = (20u);
static const uint8_t D21 = (21u);
static const uint8_t D22 = (22u);
static const uint8_t D23 = (23u);
static const uint8_t D24 = (24u);
static const uint8_t D25 = (25u);
static const uint8_t D26 = (26u);
static const uint8_t D27 = (27u);
static const uint8_t D28 = (28u);
static const uint8_t D30 = (30u);
static const uint8_t D31 = (31u);

static const uint8_t A0 = (41u);
static const uint8_t A1 = (42u);
static const uint8_t A2 = (43u);
static const uint8_t A3 = (44u);
static const uint8_t A4 = (45u);
static const uint8_t A5 = (46u);

static const uint8_t SS = PIN_SPI0_SS;
static const uint8_t MOSI = PIN_SPI0_MOSI;
static const uint8_t MISO = PIN_SPI0_MISO;
static const uint8_t SCK = PIN_SPI0_SCK;

static const uint8_t SDA = PIN_WIRE0_SDA;
static const uint8_t SCL = PIN_WIRE0_SCL;
