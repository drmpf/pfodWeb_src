#pragma once

// LEDs
#define PIN_LED             (3u)

// Neopixel
#define PIN_NEOPIXEL        (18u)
#define NUM_NEOPIXEL        (2u)
#define PIN_RGB             PIN_NEOPIXEL

// Buzzer
#define PIN_BUZZER          (22u)

// Motor Driver
#define PIN_M1A	            (8u)
#define PIN_M1B	            (9u)
#define PIN_M2A	            (10u)
#define PIN_M2B	            (11u)

// Voltage Monitor
#define PIN_VBATT           (29u)
#define PIN_VOLTAGE_MONITOR PIN_VBATT



// Serial
#define PIN_SERIAL1_TX      (0u)
#define PIN_SERIAL1_RX      (1u)

#define PIN_SERIAL2_TX      (4u)
#define PIN_SERIAL2_RX      (5u)

// SPI (Not pinned out)
#define PIN_SPI0_MISO       (31u)
#define PIN_SPI0_MOSI       (31u)
#define PIN_SPI0_SCK        (31u)
#define PIN_SPI0_SS         (31u)

#define PIN_SPI1_MISO       (11u)
#define PIN_SPI1_MOSI       (12u)
#define PIN_SPI1_SCK        (10u)
#define PIN_SPI1_SS         (15u)

// Wire
#define PIN_WIRE0_SDA       (16u)
#define PIN_WIRE0_SCL       (17u)

#define PIN_WIRE1_SDA       (2u)
#define PIN_WIRE1_SCL       (3u)

#define SERIAL_HOWMANY      (2u)
#define SPI_HOWMANY         (2u)
#define WIRE_HOWMANY        (2u)

// pfodWeb NOTE: bespoke pin set (not the shared common.h) — GPIO8,9,10,11 drive the onboard DC motor driver, not general-purpose.
static const uint8_t D0 = (0u);
static const uint8_t D1 = (1u);
static const uint8_t D2 = (2u);
static const uint8_t D3 = (3u);
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

// pfodWeb NOTE: SS/MOSI/MISO/SCK not declared — PIN_SPI0_x is (31u)
// ("not pinned out"; GPIO31 does not physically exist), which
// otherwise leaked through as a phantom "SS (GPIO31)" pin.
static const uint8_t SDA = PIN_WIRE0_SDA;
static const uint8_t SCL = PIN_WIRE0_SCL;
