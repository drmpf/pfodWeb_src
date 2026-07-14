#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#if defined(ARDUINO_ESP32_GATEWAY_E) || defined(ARDUINO_ESP32_GATEWAY_F)
#define ETH_PHY_TYPE  ETH_PHY_LAN8720
#define ETH_PHY_ADDR  0
#define ETH_PHY_MDC   23
#define ETH_PHY_MDIO  18
#define ETH_PHY_POWER 5
#define ETH_CLK_MODE  ETH_CLOCK_GPIO17_OUT
#endif

static const uint8_t LED_BUILTIN = 33;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

static const uint8_t KEY_BUILTIN = 34;

static const uint8_t SCL = 16;  // This is extension pin 11
static const uint8_t SDA = 32;  // This is extension pin 13

// pfodWeb NOTE: SS/MOSI/MISO/SCK (GPIO5/23/19/18) deliberately NOT
// declared - stale boilerplate from the generic ESP32 pins_arduino.h
// template. On this board those exact GPIOs are dedicated to the
// onboard LAN8720 Ethernet PHY (GPIO5=ETH_PHY_POWER, GPIO23=ETH_PHY_MDC,
// GPIO18=ETH_PHY_MDIO per the #defines above; GPIO19 is the ESP32's
// fixed-silicon EMAC_TXD0 RMII data line) - none of these are a real
// SPI bus on this hardware. See board.json / boardsDetails notes.txt.

static const uint8_t TX = 1;
static const uint8_t RX = 3;

static const uint8_t A0 = 36;
static const uint8_t A3 = 39;
static const uint8_t A4 = 32;
static const uint8_t A7 = 35;

static const uint8_t T9 = 32;

#if defined(ARDUINO_ESP32_GATEWAY_F)
#define BOARD_HAS_1BIT_SDMMC
#endif

#endif /* Pins_Arduino_h */
