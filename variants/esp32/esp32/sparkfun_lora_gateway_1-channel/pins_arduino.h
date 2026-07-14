#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const int LED_BUILTIN = 17;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

static const uint8_t TX = 1;
static const uint8_t RX = 3;

static const uint8_t SDA = 21;
static const uint8_t SCL = 22;

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - this board's
// entire purpose is a single-channel LoRa gateway, and there's no other
// plausible SPI consumer, so this bus is treated as dedicated to the
// onboard LoRa concentrator chip (no explicit "LORA_CS"-style naming in
// this file, but no alternative explanation for having SPI at all here).

static const uint8_t A0 = 36;
static const uint8_t A3 = 39;
static const uint8_t A4 = 32;
static const uint8_t A5 = 33;
static const uint8_t A6 = 34;
static const uint8_t A7 = 35;
static const uint8_t A10 = 4;
static const uint8_t A11 = 0;
static const uint8_t A12 = 2;
static const uint8_t A13 = 15;
// pfodWeb NOTE: A14-A16 deliberately NOT declared - same dedicated LoRa
// concentrator SPI bus as above.
static const uint8_t A17 = 27;
static const uint8_t A18 = 25;
static const uint8_t A19 = 26;

static const uint8_t T0 = 4;
static const uint8_t T1 = 0;
static const uint8_t T2 = 2;
static const uint8_t T3 = 15;
// pfodWeb NOTE: T4-T6 deliberately NOT declared - same as A14-A16 above.
static const uint8_t T7 = 27;
static const uint8_t T8 = 33;
static const uint8_t T9 = 32;

static const uint8_t DAC1 = 25;
static const uint8_t DAC2 = 26;

#endif /* Pins_Arduino_h */
