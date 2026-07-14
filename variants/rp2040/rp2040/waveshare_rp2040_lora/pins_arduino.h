#pragma once

// Waveshare RP2040 LoRa
// https://www.waveshare.com/wiki/RP2040-LoRa
// https://files.waveshare.com/wiki/RP2040-LoRa/Rp2040-lora-sch.pdf
// https://www.waveshare.com/w/upload/8/82/RP2040-LoRa_Pinout.jpg

/*
    NOTE: USB C connector, RESET button, and BOOT button are on a separate board

                  Pin#                Pin#
                       ___[_____]___
           GPIO0   1  | *8-pin FPC* | 40   VBUS
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
          GPIO11  15  |             | 26   GPIO20
          GPIO12  16  |_____________| 25   GPIO19
*/

// LEDs
#define PIN_LED        (25u)

// LoRa module internal connections
#define SX1262_CS      (13u)
#define SX1262_CLK     (14u)
#define SX1262_MOSI    (15u)
#define SX1262_DIO1    (16u)
#define SX1262_ANT_SW  (17u)
#define SX1262_BUSY    (18u)
#define SX1262_RST     (23u)
#define SX1262_MISO    (24u)

// Serial
#define PIN_SERIAL1_TX (0u)
#define PIN_SERIAL1_RX (1u)

#define PIN_SERIAL2_TX (8u)
#define PIN_SERIAL2_RX (9u)

// SPI
#define PIN_SPI0_MISO  (4u)
#define PIN_SPI0_MOSI  (3u)
#define PIN_SPI0_SCK   (2u)
#define PIN_SPI0_SS    (5u)

#define PIN_SPI1_MISO  (8u)
#define PIN_SPI1_MOSI  (11u)
#define PIN_SPI1_SCK   (10u)
#define PIN_SPI1_SS    (9u)

// Wire
#define PIN_WIRE0_SDA  (4u)
#define PIN_WIRE0_SCL  (5u)

#define PIN_WIRE1_SDA  (6u)
#define PIN_WIRE1_SCL  (7u)

#define SERIAL_HOWMANY (2u)
#define SPI_HOWMANY    (2u)
#define WIRE_HOWMANY   (2u)

// pfodWeb NOTE: bespoke pin set (not the shared common.h) — GPIO13,14,15,16,17,18,23,24 are dedicated to an onboard peripheral on this board (see comments above), not general-purpose.
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
static const uint8_t D19 = (19u);
static const uint8_t D20 = (20u);
static const uint8_t D21 = (21u);
static const uint8_t D22 = (22u);
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
