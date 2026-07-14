#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

#define USB_VID          0x303A
#define USB_PID          0x82DF
#define USB_MANUFACTURER "Unexpected Maker"
#define USB_PRODUCT      "SQUiXL"
#define USB_SERIAL       ""

static const uint8_t SDA = 1;
static const uint8_t SCL = 2;

// pfodWeb NOTE: the SPI-alias declarations that used to appear here
// (SS/MOSI/MISO/SDO/SDI/SCK on GPIO41/42/45/46) have been removed
// entirely. Those four GPIOs are not a general-purpose SPI bus - they
// go through an onboard TMUX1574RSVR IO multiplexer that switches them
// between the microSD card SPI bus and the I2S audio bus (MAX98357A
// amp), confirmed via the vendor's own SQUiXL-DevOS firmware source
// (MUX_D1-D4 = 41/42/45/46 in squixl.h, matching this file's old
// SS/MOSI/MISO/SCK values exactly). Leaving any static const alias for
// these GPIOs here - even commented out - re-adds SPI-bus capability
// tags to them at build time regardless of the chipGpios exclusion in
// board.json, so the declarations must stay fully deleted, not just
// disabled. See board.json and boardsDetails/esp32/esp32s3/um_squixl/
// notes.txt for the full pin research.

#endif /* Pins_Arduino_h */
