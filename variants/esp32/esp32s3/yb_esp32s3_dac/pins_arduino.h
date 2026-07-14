#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define USB_VID 0x303A
#define USB_PID 0x1001

static const uint8_t LED_BUILTIN = 47;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t SDA = 8;
static const uint8_t SCL = 9;

// pfodWeb NOTE: TLV_RESET (GPIO21) deliberately NOT declared - connected
// by default (solder bridge default closed). TLV_INT (GPIO48) stays
// available - NOT connected by default (bridge default open).

// I2S for onboard TLV320DAC3101
// pfodWeb NOTE: I2S_MCLK (GPIO4) stays available - NOT connected by
// default (bridge default open). I2S_BCLK/LRCLK/DOUT deliberately NOT
// declared - always connected, dedicated onboard DAC I2S bus.

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - dedicated
// onboard microSD card SPI bus (see vendor comment). SS2/MOSI2/MISO2/
// SCK2 stay kept - vendor explicitly documents that bus as "for public
// usage".

// SPI2 for public usage
static const uint8_t SS2 = 38;
static const uint8_t MOSI2 = 39;
static const uint8_t MISO2 = 41;
static const uint8_t SCK2 = 40;

static const uint8_t A0 = 1;
static const uint8_t A1 = 2;
static const uint8_t A2 = 3;
static const uint8_t A3 = 4;
static const uint8_t A4 = 8;
static const uint8_t A5 = 9;
// pfodWeb NOTE: A6 (GPIO10) deliberately NOT declared - same dedicated
// onboard microSD SPI bus as SS above.
static const uint8_t A7 = 14;
static const uint8_t A8 = 15;
static const uint8_t A9 = 16;
static const uint8_t A10 = 17;
static const uint8_t A11 = 18;

static const uint8_t T1 = 1;
static const uint8_t T2 = 2;
static const uint8_t T3 = 3;
static const uint8_t T4 = 4;
static const uint8_t T8 = 8;
static const uint8_t T9 = 9;
// pfodWeb NOTE: T10 (GPIO10) deliberately NOT declared - same as A6 above.
static const uint8_t T14 = 14;

#endif /* Pins_Arduino_h */
