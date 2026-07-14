#pragma once

// based on
// https://github.com/s-light/bigtreetech-SKR-Pico?tab=readme-ov-file
// that is based on
// https://github.com/bigtreetech/SKR-Pico/blob/master/Hardware/BTT%20SKR%20Pico%20V1.0-SCH.pdf

// LEDs
// #define PIN_LED        (13u)


// Serial
#define PIN_SERIAL1_TX  (0u)
#define PIN_SERIAL1_RX  (1u)
#define PIN_TXD0        PIN_SERIAL1_TX
#define PIN_RXD0        PIN_SERIAL1_RX

// Wire
#define PIN_WIRE0_SDA   PIN_SERIAL1_TX
#define PIN_WIRE0_SCL   PIN_SERIAL1_RX


#define PIN_ZEN         (2u)
#define PIN_YSTOP       (3u)
#define PIN_XSTOP       (4u)
#define PIN_YDIR        (5u)
#define PIN_YSTP        (6u)
#define PIN_YEN         (7u)

#define PIN_SERIAL2_TX  (8u)
#define PIN_SERIAL2_RX  (9u)
#define PIN_TX4         PIN_SERIAL2_TX
#define PIN_RX4         PIN_SERIAL2_RX

#define PIN_XDIR        (10u)
#define PIN_XSTP        (11u)
#define PIN_XEN         (12u)
#define PIN_E0DIR       (13u)
#define PIN_E0STP       (14u)
#define PIN_E0EN        (15u)
#define PIN_E0STOP      (16u)
#define PIN_FAN1_PWM    (17u)
#define PIN_FAN2_PWM    (18u)
#define PIN_ZSTP        (19u)
#define PIN_FAN3_PWM    (20u)
#define LASER_PWM       PIN_FAN3_PWM
#define PIN_HB_PWM      (21u)
#define PIN_P_2         (22u)
#define PIN_HE_PWM      (23u)

// NeoPixel
#define PIN_NEOPIXEL   (24u)
#define NUM_NEOPIXEL   (1u)
#define PIN_RGB        PIN_NEOPIXEL

#define PIN_ZSTOP      (25u)
#define PIN_THB        (26u)
#define PIN_TH0        (27u)
#define PIN_ZDIR       (28u)
#define PIN_SERVOS     (29u)
#define ADC3           PIN_SERVOS

// ----------------------
// Not available..  (all pins already in use)
#define PIN_SPI0_MISO  (99u)
#define PIN_SPI0_MOSI  (99u)
#define PIN_SPI0_SCK   (99u)
#define PIN_SPI0_SS    (99u)

#define PIN_SPI1_MISO  (99u)
#define PIN_SPI1_MOSI  (99u)
#define PIN_SPI1_SCK   (99u)
#define PIN_SPI1_SS    (99u)

// #define __WIRE1_DEVICE i2c0
#define PIN_WIRE1_SDA  (99u)
#define PIN_WIRE1_SCL  (99u)



#define SERIAL_HOWMANY (2u)
#define SPI_HOWMANY    (0u)
#define WIRE_HOWMANY   (1u)

#define PINS_COUNT          (30u)
#define NUM_DIGITAL_PINS    (30u)
#define NUM_ANALOG_INPUTS   (4u)
#define NUM_ANALOG_OUTPUTS  (0u)
#define ADC_RESOLUTION      (12u)

// pfodWeb NOTE: this is a dedicated 3D-printer motion-control board (BTT
// SKR Pico) — every GPIO except Serial1/Serial2 and the NeoPixel is
// committed to a specific stepper DIR/STEP/EN/STOP line, fan/heater PWM
// output, or the servo header, per the vendor schematic linked above.
// Only Serial (general comms), the NeoPixel (simple onboard LED), and the
// two thermistor ADC inputs (bed/hotend temperature sensing, matching
// pfodWeb's own "data display" use case) are exposed as general-purpose
// pins here; everything else is deliberately NOT declared as a D<n>/A<n>
// pin to avoid a pfodWeb sketch fighting the printer's own motion control.

static const uint8_t D0 = (0u);
static const uint8_t D1 = (1u);
static const uint8_t D8 = (8u);
static const uint8_t D9 = (9u);
static const uint8_t D24 = (24u);

static const uint8_t A0 = (26u);
static const uint8_t A1 = (27u);
