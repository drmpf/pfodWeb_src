#pragma once

// pfodWeb NOTE: this board has an add-on WiFi/BLE co-processor (not the
// native RP2040/RP2350 + CYW43439 combo that Pico W/2W use), so it stays
// Serial-only for now — variants/rp2040/tcp.ino, http.ino and ble.ino
// only work with the native cyw43 WiFi.h stack (see variants/rp2040w/
// for those boards). This board would need its own dedicated .ino
// templates written for its specific co-processor/protocol before it
// could offer tcp/http/ble connections.
#define PICO_RP2350A 0

// LEDs
#define PIN_LED        (29u)

#define PIN_NEOPIXEL   (32u)
#define NUM_NEOPIXEL   (5u)

// 'Boot0' button also on GPIO #0
#define PIN_BUTTON1     (0u)
#define PIN_BUTTON2     (4u)
#define PIN_BUTTON3     (5u)

// USB host connector
#define PIN_USB_HOST_DP (1u)
#define PIN_USB_HOST_DM (2u)
#define PIN_5V_EN       (11u)
#define PIN_5V_EN_STATE (1u)

// SDIO
#define PIN_SD_DETECT    (33u)
#define PIN_SD_CLK       (34u)
#define PIN_SD_CMD_MOSI  (35u)
#define PIN_SD_DAT0_MISO (36u)
#define PIN_SD_DAT1      (37u)
#define PIN_SD_DAT2      (38u)
#define PIN_SD_DAT3_CS   (39u)

// I2S
#define PIN_I2S_DATAOUT  (24u)
#define PIN_I2S_WORDSEL  (27u)
#define PIN_I2S_BITCLK   (26u)
#define PIN_I2S_MCLK     (25u)
#define PIN_I2S_IRQ      (23u)


#define PIN_PERIPHERAL_RESET (22u)


#define SerialESP32     Serial1
#define SPIWIFI         SPI1
#define SPIWIFI_SS      46      // Chip select pin
#define SPIWIFI_ACK     3       // a.k.a BUSY or READY pin
#define ESP32_RESETN    PIN_PERIPHERAL_RESET  // Reset pin
#define ESP32_GPIO0     PIN_I2S_IRQ

#define __PIN_A0        (40u)
#define __PIN_A1        (41u)
#define __PIN_A2        (42u)
#define __PIN_A3        (43u)
#define __PIN_A4        (44u)
#define __PIN_A5        (45u)

// UARTs
#define __SERIAL1_DEVICE uart1
#define PIN_SERIAL1_TX (8u)
#define PIN_SERIAL1_RX (9u)
#define PIN_SERIAL2_TX (99u)
#define PIN_SERIAL2_RX (99u)

// SPI
#define __SPI0_DEVICE   spi0
#define PIN_SPI0_MISO  (36u)
#define PIN_SPI0_MOSI  (35u)
#define PIN_SPI0_SCK   (34u)
#define PIN_SPI0_SS    (39u)

#define __SPI1_DEVICE   spi1
#define PIN_SPI1_MISO  (28u)
#define PIN_SPI1_MOSI  (31u)
#define PIN_SPI1_SCK   (30u)
#define PIN_SPI1_SS    (46u)

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
#define PIN_CKN (12u)
#define PIN_CKP (13u)
#define PIN_D0N (14u)
#define PIN_D0P (15u)
#define PIN_D1N (16u)
#define PIN_D1P (17u)
#define PIN_D2N (18u)
#define PIN_D2P (19u)

// pfodWeb NOTE: bespoke, fully self-contained pin set (not
// ../generic_full/common.h — that's 30-pin RP2040/RP2350A only, but this
// board is genuinely RP2350B / 48-pin per its own `PICO_RP2350A 0` above,
// and it has an onboard ESP32 WiFi/BLE co-processor — see below).
// Dedicated/excluded: GPIO1/2/11 (USB host), GPIO33-39 (SDIO/SD card),
// GPIO23-27 (I2S audio), GPIO3/8/9/22/28/30/31/46 (ESP32 "SPI-hosted"
// WiFi link: Serial1 UART, SPI1 bus, reset, ack), GPIO47 (PSRAM),
// GPIO12-19 (DVI). Buttons (0/4/5) are left available like every other
// board's onboard buttons/LED/NeoPixel.
static const uint8_t D0 = (0u);
static const uint8_t D4 = (4u);
static const uint8_t D5 = (5u);
static const uint8_t D6 = (6u);
static const uint8_t D7 = (7u);
static const uint8_t D10 = (10u);
static const uint8_t D20 = (20u);
static const uint8_t D21 = (21u);
static const uint8_t D29 = (29u);
static const uint8_t D32 = (32u);

static const uint8_t A0 = (40u);
static const uint8_t A1 = (41u);
static const uint8_t A2 = (42u);
static const uint8_t A3 = (43u);
static const uint8_t A4 = (44u);
static const uint8_t A5 = (45u);

static const uint8_t SDA = PIN_WIRE0_SDA;
static const uint8_t SCL = PIN_WIRE0_SCL;
