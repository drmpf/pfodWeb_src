#pragma once

// LEDs
#define PIN_LED             (19u)

// Serial1, (UART0) Connected to ESP32 chip)
#define PIN_SERIAL1_TX      (16u)
#define PIN_SERIAL1_RX      (17u)
#define PIN_ESP32_RST       (24u)
#define PIN_ESP32_MODE      (25u)
#define ESP32_SERIAL        Serial1
// Uart define esp serial abstraction pins
#define PIN_ESP_TX          PIN_SERIAL1_TX
#define PIN_ESP_RX          PIN_SERIAL1_RX
#define PIN_ESP_RST         PIN_ESP32_RST
#define PIN_ESP_MODE        PIN_ESP32_MODE
#define ESP_SERIAL_PORT     ESP32_SERIAL

// Serial2, (UART1) connected to SARA-R4XX modem
#define PIN_SERIAL2_TX      (4u)
#define PIN_SERIAL2_RX      (5u)
#define PIN_SERIAL2_CTS     (6u)
#define PIN_SERIAL2_RTS     (7u)
#define PIN_SARA_DTR        (12u)
#define PIN_SARA_ON         (13u)
#define PIN_SARA_RST        (14u)
#define PIN_SARA_PWR        (15u)
#define SARA_SERIAL_PORT    Serial2

// SPI
#define PIN_SPI0_MISO       (20u)
#define PIN_SPI0_MOSI       (23u)
#define PIN_SPI0_SCK        (22u)
#define PIN_SPI0_SS         (21u)

// Not pinned out
#define PIN_SPI1_MISO       (31u)
#define PIN_SPI1_MOSI       (31u)
#define PIN_SPI1_SCK        (31u)
#define PIN_SPI1_SS         (31u)

// Wire
#define PIN_WIRE0_SDA       (0u)
#define PIN_WIRE0_SCL       (1u)

// Not pinned out
#define PIN_WIRE1_SDA       (31u)
#define PIN_WIRE1_SCL       (31u)

#define SERIAL_HOWMANY      (2u)
#define SPI_HOWMANY         (1u)
#define WIRE_HOWMANY        (1u)

// pfodWeb NOTE: bespoke pin set (not generic_full) — GPIO4,5,16,17,24,25 are
// the UART+reset+mode lines to the onboard ESP32 WiFi/BLE co-processor,
// and GPIO6,7,12,13,14,15 are the UART+control lines to the onboard
// SARA-R4XX cellular modem — none are general-purpose.
static const uint8_t D0 = (0u);
static const uint8_t D1 = (1u);
static const uint8_t D2 = (2u);
static const uint8_t D3 = (3u);
static const uint8_t D8 = (8u);
static const uint8_t D9 = (9u);
static const uint8_t D10 = (10u);
static const uint8_t D11 = (11u);
static const uint8_t D18 = (18u);
static const uint8_t D19 = (19u);
static const uint8_t D20 = (20u);
static const uint8_t D21 = (21u);
static const uint8_t D22 = (22u);
static const uint8_t D23 = (23u);
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
