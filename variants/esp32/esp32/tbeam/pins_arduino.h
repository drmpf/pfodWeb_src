#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

// SPI LoRa Radio
#define LORA_SCK  5         // GPIO5  - SX1276 SCK
#define LORA_MISO 19        // GPIO19 - SX1276 MISO
#define LORA_MOSI 27        // GPIO27 - SX1276 MOSI
#define LORA_CS   18        // GPIO18 - SX1276 CS
#define LORA_RST  23        // GPIO23 - SX1276 RST
#define LORA_IRQ  26        // GPIO26 - SX1276 IO0
#define LORA_IO0  LORA_IRQ  // alias
#define LORA_IO1  33        // GPIO33 - SX1276 IO1 -> wired on pcb AND connected to header pin LORA1
#define LORA_IO2  32        // GPIO32 - SX1276 IO2 -> wired on pcb AND connected to header pin LORA2

static const uint8_t KEY_BUILTIN = 39;

static const uint8_t LED_BUILTIN = 14;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

static const uint8_t TX = 1;
static const uint8_t RX = 3;

static const uint8_t SDA = 21;
static const uint8_t SCL = 22;

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - dedicated
// onboard LoRa radio SPI bus (no other SPI peripheral on this board).

// pfodWeb NOTE: A4/A5 and T8/T9 deliberately NOT declared - dedicated
// onboard LoRa radio IO1/IO2 pins (see LORA_IO1/IO2 above).
static const uint8_t A0 = 36;
static const uint8_t A3 = 39;
static const uint8_t A6 = 34;
static const uint8_t A7 = 35;

static const uint8_t A10 = 4;
static const uint8_t A11 = 0;
static const uint8_t A12 = 2;
static const uint8_t A14 = 13;
static const uint8_t A16 = 14;
static const uint8_t A18 = 25;

static const uint8_t T0 = 4;
static const uint8_t T1 = 0;
static const uint8_t T2 = 2;
static const uint8_t T4 = 13;
static const uint8_t T6 = 14;

static const uint8_t DAC1 = 25;

#endif /* Pins_Arduino_h */
