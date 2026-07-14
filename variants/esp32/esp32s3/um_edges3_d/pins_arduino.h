#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

#define USB_VID          0x303A
#define USB_PID          0x82DC
#define USB_MANUFACTURER "Unexpected Maker"
#define USB_PRODUCT      "EdgeS3[D]"
#define USB_SERIAL       ""

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t SDA = 8;
static const uint8_t SCL = 9;

// pfodWeb NOTE: the vendor header's SPI-bus aliases for GPIO34-37 have
// been removed. Those four GPIOs fall inside the GPIO33-37 octal
// flash/PSRAM range already excluded chip-wide in the ESP32-S3
// board.json (see that file's chipGpios comment), and the SDO/SDI
// names are simply this vendor header's alternate spelling of
// MOSI/MISO on the same physical pins, not a separate peripheral bus.
// Leaving the aliases in place would cause the board build script to
// re-add those pins as user-selectable digital/PWM/SPI pins even
// though the chip-level config omits them, silently exposing internal
// PSRAM/flash bus lines in the Designer. Sources consulted: this
// board's own header (identical to the upstream espressif/arduino-esp32
// um_edges3_d variant), the Unexpected Maker EdgeS3[D] product page at
// esp32s3.com/edges3d.html, and Espressif's published ESP32-S3
// GPIO33-37 octal PSRAM/flash restriction.
static const uint8_t A0 = 1;
static const uint8_t A1 = 2;
static const uint8_t A2 = 3;
static const uint8_t A3 = 4;
static const uint8_t A4 = 5;
static const uint8_t A5 = 6;
static const uint8_t A6 = 7;
static const uint8_t A7 = 8;
static const uint8_t A8 = 9;

static const uint8_t T1 = 1;
static const uint8_t T2 = 2;
static const uint8_t T3 = 3;
static const uint8_t T4 = 4;
static const uint8_t T5 = 5;
static const uint8_t T6 = 6;
static const uint8_t T7 = 7;
static const uint8_t T8 = 8;
static const uint8_t T9 = 9;

#endif /* Pins_Arduino_h */
