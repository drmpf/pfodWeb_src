#pragma once

#define PICO_RP2350A 1

// LEDs
#define PIN_LED         (29u)

// Buzzer
#define PIN_BUZZER      (11u)

// Button
#define PIN_BUTTON      (28u)

// Digital Inputs
#define PIN_DI0         (0u)
#define PIN_DI1         (1u)
#define PIN_DI2         (2u)
#define PIN_DI3         (3u)
#define PIN_DI4         (4u)
#define PIN_DI5         (5u)
#define PIN_DI6         (6u)
#define PIN_DI7         (7u)
#define PIN_DI8         (8u)
#define PIN_DI9         (9u)
#define PIN_DI10        (10u)

// Digital Outputs
#define PIN_DO0         (12u)
#define PIN_DO1         (13u)
#define PIN_DO2         (14u)
#define PIN_DO3         (15u)

// Analog Inputs
#define PIN_AN0         (26u)
#define PIN_AN1         (27u)



// W5500 Interface
#define PIN_W5500_INT   (18u)

#define PIN_W5500_MOSI  (19u)
#define PIN_W5500_MISO  (20u)
#define PIN_W5500_CS    (21u)
#define PIN_W5500_SCK   (22u)

#define PIN_W5500_RST   (23u)
#define PIN_W5500_RESET (23u)



// Serial
#define PIN_SERIAL1_TX  (31u)   // Not used.
#define PIN_SERIAL1_RX  (31u)   // Not used.

#define PIN_SERIAL2_TX  (24u)
#define PIN_SERIAL2_RX  (25u)


// SPI
#define PIN_SPI0_MISO   (20u)
#define PIN_SPI0_MOSI   (19u)
#define PIN_SPI0_SCK    (22u)
#define PIN_SPI0_SS     (21u)

// Wire
#define __WIRE0_DEVICE i2c0
#define PIN_WIRE0_SDA  (16u)
#define PIN_WIRE0_SCL  (17u)

#define __WIRE1_DEVICE i2c1
#define PIN_WIRE1_SDA  (31u)    // Not used.
#define PIN_WIRE1_SCL  (31u)    // Not used.



#define SERIAL_HOWMANY (3u)
#define SPI_HOWMANY    (1u)
#define WIRE_HOWMANY   (1u)

// pfodWeb NOTE: bespoke pin set (not the shared common.h) — GPIO18,19,20,21,22,23 are dedicated to an onboard peripheral on this board (see comments above), not general-purpose.
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
static const uint8_t D12 = (12u);
static const uint8_t D13 = (13u);
static const uint8_t D14 = (14u);
static const uint8_t D15 = (15u);
static const uint8_t D16 = (16u);
static const uint8_t D17 = (17u);
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
