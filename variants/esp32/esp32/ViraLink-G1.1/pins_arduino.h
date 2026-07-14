#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t RESET_KEY = 0;

// pfodWeb NOTE: RF433 deliberately NOT declared - dedicated onboard
// 433MHz radio, not general-purpose.

// pfodWeb NOTE: RS485_TX/RX, GSM1_TX/RX, GSM2_TX/RX, GSM_PWR
// deliberately NOT declared - dedicated onboard RS485 transceiver and
// GSM modem(s), not general-purpose.

static const uint8_t SDA = 4;
static const uint8_t SCL = 16;

static const uint8_t EXT1 = 12;
static const uint8_t EXT2 = 13;
// pfodWeb NOTE: PCF1_INT deliberately NOT declared - dedicated
// interrupt line for the onboard PCF8574-style I2C GPIO expander.

// pfodWeb NOTE: Wiegand1_D0/D1 and Wiegand2_D0/D1 deliberately NOT
// declared - dedicated onboard Wiegand card-reader interface.

// pfodWeb NOTE: ETH_CLK_OUT and EMAC_MDIO/TXD0/TX_EN/TXD1/MDC/RXD0/
// RXD1/RXD_DV deliberately NOT declared - dedicated onboard Ethernet
// MAC (RMII) interface, not general-purpose (see board.json).

// pfodWeb NOTE: SS/MOSI/SCK/MISO deliberately NOT declared - upstream
// declares them as -1 (no SPI on this board), which wraps to 255 as a
// uint8_t and would otherwise leak a phantom "GPIO255" pin.

#endif /* Pins_Arduino_h */
