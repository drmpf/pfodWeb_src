#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define USB_VID          0x3343
#define USB_PID          0x83CF
#define USB_MANUFACTURER "DFRobot"
#define USB_PRODUCT      "FireBeetle 2 ESP32-S3"
#define USB_SERIAL       ""  // Empty string for MAC address

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t SDA = 1;
static const uint8_t SCL = 2;

static const uint8_t SS = 10;
static const uint8_t MOSI = 15;
static const uint8_t MISO = 16;
static const uint8_t SCK = 17;

static const uint8_t A0 = 4;
static const uint8_t A1 = 5;
static const uint8_t A2 = 6;
static const uint8_t A3 = 8;
static const uint8_t A4 = 10;
static const uint8_t A5 = 11;

// pfodWeb NOTE: D2/D3/D5/D6/D7/D10-D12 deliberately NOT declared -
// dedicated GDI display-connector-only signals with no general-purpose
// alias (GDI_DC/RES/FCS/CS/SDCS/BUSY_TE/INT below). D13 (GPIO21, also
// GDI_BLK) stays declared since LED_BUILTIN resolves through it below.
static const uint8_t D9 = 0;
static const uint8_t D13 = 21;
static const uint8_t D14 = 47;

static const uint8_t LED_BUILTIN = D13;
#define BUILTIN_LED LED_BUILTIN  // backward compatibility
#define LED_BUILTIN LED_BUILTIN  // allow testing #ifdef LED_BUILTIN

// pfodWeb NOTE: T3/T7/T9/T12-T14 deliberately NOT declared - same
// GDI-connector-only pins as above.
static const uint8_t T1 = 1;
static const uint8_t T2 = 2;
static const uint8_t T4 = 4;
static const uint8_t T5 = 5;
static const uint8_t T6 = 6;
static const uint8_t T8 = 8;
static const uint8_t T10 = 10;
static const uint8_t T11 = 11;

// pfodWeb NOTE: GDI_SPI_SCLK/MOSI/MISO and GDI_SCL/SDA alias the general
// SCK/MOSI/MISO/SCL/SDA bus above (kept, multi-drop) - only the
// display-exclusive signals below (BLK/DC/RES/CS/SDCS/FCS/TCS/INT/
// BUSY_TE) are excluded (see board.json chipGpios override).
#define GDI_DISPLAY_FPC_INTERFACE
#ifdef GDI_DISPLAY_FPC_INTERFACE

#define GDI_BLK      21
#define GDI_SPI_SCLK SCK
#define GDI_SPI_MOSI MOSI
#define GDI_SPI_MISO MISO
#define GDI_DC       3
#define GDI_RES      38
#define GDI_CS       18
#define GDI_SDCS     9
#define GDI_FCS      7
#define GDI_TCS      12
#define GDI_SCL      SCL
#define GDI_SDA      SDA
#define GDI_INT      13
#define GDI_BUSY_TE  14

#endif

#endif /* Pins_Arduino_h */
