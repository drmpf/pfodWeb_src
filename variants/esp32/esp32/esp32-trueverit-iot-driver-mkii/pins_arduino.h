#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t LED_BUILTIN = 18;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

#define TX1 12
#define RX1 13
#define TX2 33
#define RX2 39

static const uint8_t TX = 1;
static const uint8_t RX = 3;

static const uint8_t SCL = 4;
static const uint8_t SDA = 15;

static const uint8_t SS = 5;
static const uint8_t MOSI = 23;
static const uint8_t MISO = 32;
// pfodWeb NOTE: this file deliberately does NOT declare an alias named
// SCK. Reason: GPIO eighteen is this board's confirmed onboard LED (see
// LED_BUILTIN above), and the generic ESP32 dev-module template this
// file was derived from happened to assign that same GPIO number to the
// hardware SPI clock line - never vendor-confirmed as a real SPI
// connection on this board. build_boards.js appends an spi_sck
// capability onto any GPIO matching a parsed SCK alias regardless of a
// chipGpios override, so leaving this declared would silently
// contaminate the confirmed LED pin's capability list with an unwanted
// SPI-role capability. SS/MOSI/MISO above are unaffected (no collision
// found for those three GPIOs against any confirmed onboard hardware).

static const uint8_t A0 = 36;
static const uint8_t A3 = 39;
static const uint8_t A4 = 32;
static const uint8_t A5 = 33;
static const uint8_t A6 = 34;
static const uint8_t A7 = 35;

static const uint8_t T0 = 4;
// pfodWeb NOTE: T2 (GPIO2) deliberately NOT declared - dedicated
// Ethernet PHY power-enable pin (ETH_PHY_POWER).
static const uint8_t T8 = 33;
static const uint8_t T9 = 32;

#define ETH_PHY_ADDR  1
#define ETH_PHY_POWER 2
#define ETH_PHY_MDC   16
#define ETH_PHY_MDIO  14
#define ETH_PHY_TYPE  ETH_PHY_DP83848
#define ETH_CLK_MODE  ETH_CLOCK_GPIO17_OUT

#endif /* Pins_Arduino_h */
