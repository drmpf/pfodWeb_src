#pragma once

// Waveshare RP2040 lcd 0.96
// https://www.waveshare.com/wiki/RP2040-LCD-0.96
// https://www.waveshare.com/w/upload/0/01/RP2040-LCD-0.96.pdf
// https://www.waveshare.com/img/devkit/RP2040-LCD-0.96/RP2040-LCD-0.96-details-7.jpg
//

/*
                  Pin#                Pin#
                       ___(_____)___
           GPIO0   1  |   *USB C*   | 40   VBUS
           GPIO1   2  |             | 39   VSYS
             GND   3  |             | 38   GND
           GPIO2   4  |             | 37   3V3_EN
           GPIO3   5  |             | 36   3V3(OUT)
           GPIO4   6  |             | 35   ADC_VREF
           GPIO5   7  |             | 34   GPIO28
             GND   8  |             | 33   GND
           GPIO6   9  |             | 32   GPIO27
           GPIO7  10  |             | 31   GPIO26
           GPIO8  11  |             | 30   RUN
           GPIO9  12  |             | 29   GPIO22
             GND  13  |             | 28   GND
          GPIO10  14  |             | 27   GPIO21
          GPIO11  15  |             | 25   GPIO20
          GPIO12  16  |             | 25   GPIO19
          GPIO13  17  |             | 24   GPIO18
             GND  18  |             | 23   GND
          GPIO14  19  |             | 22   GPIO17
          GPIO15  20  |____|_|_|____| 21   GPIO16
                           S G S
                           W N W
                           C D D
                           L   I
                           K   N
*/

// LCD
#define LDC_SPI         (1u)
#define PIN_LCD_DC      (8u)
#define PIN_LCD_CS      (9u)
#define PIN_LCD_SCLK    (10u)
#define PIN_LCD_MOSI    (11u)
#define PIN_LCD_RST     (12u)
#define PIN_LCD_BL      (25u)

// Serial
#define PIN_SERIAL1_TX  (0u)
#define PIN_SERIAL1_RX  (1u)

#define PIN_SERIAL2_TX  (8u)
#define PIN_SERIAL2_RX  (9u)

// SPI
#define PIN_SPI0_MISO   (16u)
#define PIN_SPI0_MOSI   (19u)
#define PIN_SPI0_SCK    (18u)
#define PIN_SPI0_SS     (17u)

#define PIN_SPI1_MISO   (12u)
#define PIN_SPI1_MOSI   (15u)
#define PIN_SPI1_SCK    (14u)
#define PIN_SPI1_SS     (13u)

// Wire
// pfodWeb NOTE (dedicated-hardware pin-exclusion audit, 2026-07-13):
// PIN_WIRE0_SDA/SCL removed — the vendor's default Wire0 (I2C0) location
// (GPIO8/GPIO9) is physically the same pair of pins this board dedicates
// to the onboard LCD's DC and CS lines (see PIN_LCD_DC/PIN_LCD_CS above),
// so Wire0 can never actually be used at its declared default location on
// this specific board while the display is present. Left in place, the
// `static const uint8_t SDA = PIN_WIRE0_SDA;` / `SCL = PIN_WIRE0_SCL;`
// aliases below caused build_boards.js to unconditionally tag GPIO8/9 as
// i2c_sda/i2c_scl (its bus-role auto-append keys off the SDA/SCL alias
// value regardless of any chipGpios override), on top of already showing
// them as full general-purpose digital I/O — both wrong, since those two
// pins are committed to the LCD. See notes.txt for full reasoning.
// Wire1 (GPIO6/7) is unaffected — those pins are not used by the LCD.
#define PIN_WIRE1_SDA   (6u)
#define PIN_WIRE1_SCL   (7u)

#define SERIAL_HOWMANY  (3u)
#define SPI_HOWMANY     (2u)
#define WIRE_HOWMANY    (2u)

// pfodWeb NOTE: bespoke pin set (not the shared common.h) — GPIO8,9,10,11,12,13,14,15,25 are dedicated to an onboard peripheral on this board (see comments above), not general-purpose.
static const uint8_t D0 = (0u);
static const uint8_t D1 = (1u);
static const uint8_t D2 = (2u);
static const uint8_t D3 = (3u);
static const uint8_t D4 = (4u);
static const uint8_t D5 = (5u);
static const uint8_t D6 = (6u);
static const uint8_t D7 = (7u);
static const uint8_t D16 = (16u);
static const uint8_t D17 = (17u);
static const uint8_t D18 = (18u);
static const uint8_t D19 = (19u);
static const uint8_t D20 = (20u);
static const uint8_t D21 = (21u);
static const uint8_t D22 = (22u);
static const uint8_t D23 = (23u);
static const uint8_t D24 = (24u);
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

// SDA/SCL top-level aliases removed along with PIN_WIRE0_SDA/SCL above —
// see the "// Wire" comment block for the reason (GPIO8/9 collision with
// the onboard LCD's dedicated DC/CS pins).
