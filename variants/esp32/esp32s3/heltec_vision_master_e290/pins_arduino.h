#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define Vision_Master_E290 true
#define DISPLAY_HEIGHT     128
#define DISPLAY_WIDTH      296

#define USB_VID 0x303a
#define USB_PID 0x1001

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t SDA = 39;
static const uint8_t SCL = 38;

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - dedicated
// onboard LoRa radio SPI bus (no other SPI peripheral on this board).

// pfodWeb NOTE: A0-A5/A7-A13/A17 and T1-T6/T8-T14 deliberately NOT
// declared - dedicated onboard E-ink display, LoRa radio+SPI bus, and
// Vext power-gate (see below).
static const uint8_t A6 = 7;
static const uint8_t A14 = 15;
static const uint8_t A15 = 16;
static const uint8_t A16 = 17;
static const uint8_t A18 = 19;
static const uint8_t A19 = 20;

static const uint8_t T7 = 7;

// pfodWeb NOTE: Vext (power-gate for onboard peripherals) and
// Eink_SDI/CLK/CS/DC/RST/BUSY deliberately NOT declared - internal
// control line and dedicated onboard E-ink display SPI bus.

// pfodWeb NOTE: RST_LoRa/BUSY_LoRa/DIO0 deliberately NOT declared -
// dedicated onboard LoRa radio control lines.

#endif /* Pins_Arduino_h */
