#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t TX = 1;
static const uint8_t RX = 3;

static const uint8_t SDA = 21;
static const uint8_t SCL = 22;

static const uint8_t SS = 5;
static const uint8_t MOSI = 23;
static const uint8_t MISO = 19;
static const uint8_t SCK = 18;

// pfodWeb NOTE: A5/A10/A16/A17/A19 and T0/T6-T8 deliberately NOT declared
// - dedicated onboard Teleinfo(TIC)/LoRa module pins (see below). GPIO26/
// 27 are ambiguously either LORA_TX/RX (1st revision) or LED_GRN/RED
// (2nd revision) depending on which is actually populated - excluded to
// avoid risking the LoRa link on 1st-revision boards.
static const uint8_t A0 = 36;
static const uint8_t A3 = 39;
static const uint8_t A4 = 32;
static const uint8_t A6 = 34;
static const uint8_t A7 = 35;
static const uint8_t A11 = 0;
static const uint8_t A12 = 2;
static const uint8_t A13 = 15;
static const uint8_t A14 = 13;
static const uint8_t A15 = 12;
static const uint8_t A18 = 25;

static const uint8_t T1 = 0;
static const uint8_t T2 = 2;
static const uint8_t T3 = 15;
static const uint8_t T4 = 13;
static const uint8_t T5 = 12;
static const uint8_t T9 = 32;

static const uint8_t DAC1 = 25;
// pfodWeb NOTE: DAC2 (GPIO26) deliberately NOT declared - same ambiguous
// LoRa/LED pin as above.

// Specific CH2i (Charles Hallard) Boards
// 1st Revision Denky with ESP WROOM32 + LoRa RN2483 module
#if defined(ARDUINO_DENKY_WROOM32)
#define PUSH_BUTTON    0
#define TIC_ENABLE_PIN 4
#define TIC_RX_PIN     33
#define LORA_TX_PIN    26
#define LORA_RX_PIN    27
#define LORA_RESET     14
#define RGB_LED_PIN    25

// 2nd Utra Small version with ESP Pico-D4-V3-02
#elif defined(ARDUINO_DENKY_PICOV3)
// RGB Led Pins
#define LED_RED_PIN 27
#define LED_GRN_PIN 26
#define LED_BLU_PIN 25

// Teleinfo RXD pin is connected to ESP32-PICO-V3-02 GPIO8
#define TIC_RX_PIN  8
#endif

#endif /* Pins_Arduino_h */
