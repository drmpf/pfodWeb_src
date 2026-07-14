#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

// power button
#define BUTTON 3

static const uint8_t RX = 20;

// pfodWeb NOTE: SS/MOSI/MISO/SCK (GPIO21/10/7/8) deliberately NOT
// declared - this board's entire purpose is an e-ink display devkit, and
// the bus is shared between the onboard e-paper display and microSD
// card (see EPD_RESET/BUSY/DC and SD_CS below), so it's treated as
// dedicated.
// EPD_RESET/BUSY/DC (GPIO5/6/4) deliberately NOT declared - dedicated
// e-paper display control lines.
// SD_CS (GPIO12) deliberately NOT declared - dedicated onboard microSD
// chip-select.

static const uint8_t A0 = 0;
static const uint8_t A1 = 1;
static const uint8_t A2 = 2;

// not broken out
static const uint8_t SCL = -1;
static const uint8_t SDA = -1;

#endif /* Pins_Arduino_h */
