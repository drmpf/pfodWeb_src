#pragma once

// MOTOR CONTROL SECTION:
// SimpleFOC Flags
#define SIMPLEFOC_PWM_HIGHSIDE_ACTIVE_HIGH true
#define SIMPLEFOC_PWM_LOWSIDE_ACTIVE_HIGH false

// Important Constants
#define CURR_SENSE_RES  (0.001f)
#define CURR_SENSE_GAIN (66.0f)

// Power Stage Control Pins
#define PIN_PWMH_A     (0u)
#define PIN_PWML_A     (1u)
#define PIN_PWMH_B     (2u)
#define PIN_PWML_B     (3u)
#define PIN_PWMH_C     (4u)
#define PIN_PWML_C     (5u)

// Hall-Effect Angle Sensor Pins
#define PIN_HALL_RX    (16u)
#define PIN_HALL_CS    (17u)
#define PIN_HALL_SCK   (18u)

// Current Sensing Pins
#define PIN_IOUT_A     (26u)    // Analog Input
#define PIN_IOUT_B     (27u)    // Analog Input

// Power Supply Feedback Pins
#define PIN_VBUS_DET   (7u)     // Digital Input
#define PIN_VCC_SENSE  (28u)    // Analog Input


// STANDARD SECTION:
// LED
#define PIN_LED        (6u)

// Serial
#define PIN_SERIAL1_TX (12u)
#define PIN_SERIAL1_RX (13u)

#define PIN_SERIAL2_TX (20u)
#define PIN_SERIAL2_RX (21u)

// NOTE: SPI0 is used by the on-board magnetic angle sensor,
// do not change the pins assigned to this SPI object!
// SPI
#define PIN_SPI0_MISO  (16u)
#define PIN_SPI0_MOSI  (19u)
#define PIN_SPI0_SCK   (18u)
#define PIN_SPI0_SS    (17u)

#define PIN_SPI1_MISO  (8u)
#define PIN_SPI1_MOSI  (11u)
#define PIN_SPI1_SCK   (10u)
#define PIN_SPI1_SS    (9u)

// Wire
#define PIN_WIRE0_SDA  (24u)
#define PIN_WIRE0_SCL  (25u)

#define PIN_WIRE1_SDA  (22u)
#define PIN_WIRE1_SCL  (23u)

#define SERIAL_HOWMANY (3u)
#define SPI_HOWMANY    (2u)
#define WIRE_HOWMANY   (2u)

// pfodWeb NOTE: bespoke pin set (not the shared common.h) — GPIO0,1,2,3,4,5,16,17,18 are dedicated to an onboard peripheral on this board (see comments above), not general-purpose.
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
