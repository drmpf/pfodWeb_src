#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t LED_BUILTIN = 5;
#define BUILTIN_LED LED_BUILTIN
#define LED_BUILTIN LED_BUILTIN

static const uint8_t RESET_KEY = 0;

// pfodWeb NOTE: RS485_TX/RX deliberately NOT declared - dedicated
// onboard RS485 transceiver, not general-purpose.

static const uint8_t SDA = 4;
static const uint8_t SCL = 16;

static const uint8_t BUZZER = 12;
static const uint8_t RELAY1_PIN = 2;
static const uint8_t RELAY2_PIN = 13;
static const uint8_t RELAY3_PIN = 14;
static const uint8_t RELAY4_PIN = 33;

// pfodWeb NOTE: Wiegand1_D0/D1 and Wiegand2_D0/D1 deliberately NOT
// declared - dedicated onboard Wiegand card-reader interface.

// pfodWeb NOTE: ETH_CLK_OUT and EMAC_MDIO/TXD0/TX_EN/TXD1/MDC/RXD0/
// RXD1/RXD_DV deliberately NOT declared - dedicated onboard Ethernet
// MAC (RMII) interface, not general-purpose (see board.json).

// pfodWeb NOTE: SS/MOSI/SCK/MISO deliberately NOT declared - upstream
// declares them as -1 (no SPI on this board), which wraps to 255 as a
// uint8_t and would otherwise leak a phantom "GPIO255" pin.

#endif /* Pins_Arduino_h */
