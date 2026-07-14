#pragma once

#define PICO_RP2350A 1

// DatanoiseTV PicoADK v2 - Audio Development Kit with RP2350A
// https://github.com/DatanoiseTV/PicoDSP-Hardware

// LEDs
#define PIN_LED        (2u)
#define LED_BUILTIN    PIN_LED

// Serial - relocated
#define PIN_SERIAL1_TX (12u)
#define PIN_SERIAL1_RX (13u)

// Serial 2 - relocated
#define PIN_SERIAL2_TX (27u)
#define PIN_SERIAL2_RX (28u)

// SPI0
#define PIN_SPI0_MISO  (8u)
#define PIN_SPI0_MOSI  (7u)
#define PIN_SPI0_SCK   (6u)
#define PIN_SPI0_SS    (5u)

// SPI1
#define PIN_SPI1_MISO  (12u)
#define PIN_SPI1_MOSI  (11u)
#define PIN_SPI1_SCK   (10u)
#define PIN_SPI1_SS    (13u)

// Wire
#define PIN_WIRE0_SDA  (8u)
#define PIN_WIRE0_SCL  (9u)

#define PIN_WIRE1_SDA  (6u)
#define PIN_WIRE1_SCL  (7u)

// I2S
#define PIN_I2S_BCLK   (17u)
#define PIN_I2S_LRCLK  (18u)
#define PIN_I2S_DOUT   (16u)
#define PIN_I2S_DIN    (15u)

#define SERIAL_HOWMANY (3u)
#define SPI_HOWMANY    (2u)
#define WIRE_HOWMANY   (2u)

// PSRAM
#define RP2350_PSRAM_CS         (0u)
#define RP2350_PSRAM_MAX_SCK_HZ (109*1000*1000)
#define PIN_PSRAM_CS            RP2350_PSRAM_CS

// SDIO for SD Card
#define PIN_SDIO_CLK    (20u)
#define PIN_SDIO_CMD    (21u)
#define PIN_SDIO_D0     (22u)
#define PIN_SDIO_D1     (23u)
#define PIN_SDIO_D2     (24u)
#define PIN_SDIO_D3     (25u)

// MIDI
#define PIN_MIDI_RX    (1u)

#define PINS_COUNT          (26u)
#define NUM_DIGITAL_PINS    (26u)
#define NUM_ANALOG_INPUTS   (3u)
#define NUM_ANALOG_OUTPUTS  (0u)
#define ADC_RESOLUTION      (12u)

// pfodWeb NOTE: D0 (GPIO0, external PSRAM chip-select) and D15-D18
// (GPIO15-18, the I2S bus to the onboard DAC) and D20-D22 (GPIO20-22, the
// SDIO SD-card CLK/CMD/D0 lines) are deliberately NOT declared here — all
// dedicated to onboard hardware, not general-purpose. D23-D25 (SDIO
// D1-D3) are already excluded by the conservative default pin range this
// board otherwise follows. D1 (MIDI_RX) is kept — it's a normal external
// MIDI-in connector, not an internal bus.
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
static const uint8_t D19 = (19u);

static const uint8_t A0 = (26u);
static const uint8_t A1 = (27u);
static const uint8_t A2 = (28u);

static const uint8_t SDA = PIN_WIRE0_SDA;
static const uint8_t SCL = PIN_WIRE0_SCL;
