
#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include "soc/soc_caps.h"

// BN: ESP32 Family Device
#define USB_VID 0x303a
#define USB_PID 0x8255

#define USB_MANUFACTURER "Waveshare"
#define USB_PRODUCT      "ESP32-S3-Touch-AMOLED-1.8"
#define USB_SERIAL       ""

// display for SH8601
#define WS_LCD_CS    12
#define WS_QSPI_SIO0 4
#define WS_QSPI_SI1  5
#define WS_QSPI_SI2  6
#define WS_QSPI_SI3  7
#define WS_QSPI_SCL  11

// Touch for FT3168
#define WS_TP_INT 21

// Onboard Electric buzzer & Custom buttons
// GPIO and PSRAM conflict, need to pay attention when using

// UART0 pins
static const uint8_t TX = 43;
static const uint8_t RX = 44;

// pfodWeb NOTE: SDA/SCL not declared — shared with the onboard IMU, not
// a general expansion port (see board.json).

// Mapping based on the ESP32S3 data sheet - alternate for SPI2
static const uint8_t SS = 34;    // FSPICS0
static const uint8_t MOSI = 35;  // FSPID
static const uint8_t MISO = 37;  // FSPIQ
static const uint8_t SCK = 36;   // FSPICLK

// Mapping based on the ESP32S3 data sheet - alternate for OUTPUT
static const uint8_t OUTPUT_IO2 = 2;
static const uint8_t OUTPUT_IO3 = 3;
static const uint8_t OUTPUT_IO17 = 17;
static const uint8_t OUTPUT_IO18 = 18;

// Analog capable pins on the header (pfodWeb NOTE: A3-A6 deliberately
// NOT declared — GPIO4/5/6/7 are the onboard SH8601 display's QSPI
// data lines)
static const uint8_t A0 = 1;
static const uint8_t A1 = 2;
static const uint8_t A2 = 3;

// GPIO capable pins on the header (pfodWeb NOTE: D0-D3 deliberately NOT
// declared — same QSPI display lines as above)
static const uint8_t D4 = 3;
static const uint8_t D5 = 2;
static const uint8_t D6 = 1;
static const uint8_t D7 = 44;
static const uint8_t D8 = 43;
static const uint8_t D9 = 40;
static const uint8_t D10 = 39;
static const uint8_t D11 = 38;
static const uint8_t D12 = 37;
static const uint8_t D13 = 36;
static const uint8_t D14 = 35;
static const uint8_t D15 = 34;
static const uint8_t D16 = 33;

// Touch input capable pins on the header (pfodWeb NOTE: T4-T7
// deliberately NOT declared — same QSPI display lines as above)
static const uint8_t T1 = 1;
static const uint8_t T2 = 2;
static const uint8_t T3 = 3;

#endif /* Pins_Arduino_h */
