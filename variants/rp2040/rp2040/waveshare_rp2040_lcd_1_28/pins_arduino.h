#pragma once

// Waveshare RP2040 LCD 1.28
// https://www.waveshare.com/wiki/RP2040-LCD-1.28
// https://www.waveshare.com/w/upload/6/60/RP2040-LCD-1.28-sch.pdf
// https://www.waveshare.com/img/devkit/RP2040-LCD-1.28/RP2040-LCD-1.28-details-3.jpg
//

/*
                 H1                                H2
            Pin#    Pin#                      Pin#    Pin#
    GPIO8   1       2    GPIO0        GND     1       2   GND
    GPIO9   3       4    GPIO1        VSYS    3       4   ADC_AVDD
    GPIO10  5       6    GPIO2        GPIO23  5       6   BOOT
    GPIO11  7       8    GPIO3        GPIO22  7       8   RUM
    GPIO12  9       10   GPIO4        GPIO21  9       10  GPIO29
    GPIO13  11      12   GPIO5        GPIO20  11      12  GPIO28
    GPIO14  13      14   GPIO6        GPIO19  13      14  GPIO27
    GPIO15  15      16   GPIO7        GPIO18  15      16  GPIO26
    SWCLK   17      18   VSYS         GPIO17  17      18  GPIO25
    SWDIP   19      20   GND          GPIO16  19      20  GPIO24
*/

// LCD
#define LDC_SPI         (1u)
#define PIN_LCD_DC      (8u)
#define PIN_LCD_CS      (9u)
#define PIN_LCD_SCLK    (10u)
#define PIN_LCD_MOSI    (11u)
#define PIN_LCD_RST     (12u)
#define PIN_LCD_BL      (25u)
// BAT_ADC
#define PIN_BAT_ADC      (29u)
// IMU
#define PIN_IMU_SDA      (6u)
#define PIN_IMU_SCL      (7u)
#define PIN_IMU_INT1     (23u)
#define PIN_IMU_INT2     (24u)

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
// Wire1 (GPIO6/7) is unaffected — those pins carry the onboard IMU's I2C
// bus (PIN_IMU_SDA/SCL above), not general-purpose either, but that is a
// genuine confirmed hardware use, not a bug, so left as-is.
#define PIN_WIRE1_SDA   (6u)
#define PIN_WIRE1_SCL   (7u)

#define SERIAL_HOWMANY  (3u)
#define SPI_HOWMANY     (2u)
#define WIRE_HOWMANY    (2u)

// pfodWeb NOTE: bespoke pin set (not the shared common.h) — GPIO6,7,8,9,10,11,12,13,14,15,23,24,25 are dedicated to an onboard peripheral on this board (see comments above), not general-purpose.
static const uint8_t D0 = (0u);
static const uint8_t D1 = (1u);
static const uint8_t D2 = (2u);
static const uint8_t D3 = (3u);
static const uint8_t D4 = (4u);
static const uint8_t D5 = (5u);
static const uint8_t D16 = (16u);
static const uint8_t D17 = (17u);
static const uint8_t D18 = (18u);
static const uint8_t D19 = (19u);
static const uint8_t D20 = (20u);
static const uint8_t D21 = (21u);
static const uint8_t D22 = (22u);
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
