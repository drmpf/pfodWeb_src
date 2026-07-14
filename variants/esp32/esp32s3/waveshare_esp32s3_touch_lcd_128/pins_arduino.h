#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define USB_VID          0x1A86
#define USB_PID          0x55D3
#define USB_MANUFACTURER "Waveshare"
#define USB_PRODUCT      "ESP32-S3 Touch LCD 1.28"
#define USB_SERIAL       ""  // Empty string for MAC address

#define LCD_BACKLIGHT 2
#define LCD_DC        8
#define LCD_RST       14

#define TP_INT 5
#define TP_RST 13

#define IMU_INT1 4
#define IMU_INT2 3
// pfodWeb NOTE (correction, 2026-07-14): GPIO4 (IMU_INT1) and GPIO5
// (TP_INT) are also broken out on the SH1.0 external header as
// MOSFET1_CS/MOSFET2_CS respectively (Waveshare's own wiki: "two MOS tube
// control switch contacts are also drawn out around the battery holder,
// which are connected to GPIO4 and GPIO5 ... can be used to solder small
// current devices such as vibration motors") - shared, not exclusively
// dedicated onboard hardware. See board.json chipGpios["4"]/["5"] notes.
// GPIO3 (IMU_INT2) has no such header breakout documented and stays a
// dedicated, excluded pin.

static const uint8_t TX = 43;
static const uint8_t RX = 44;
#define TX1 TX
#define RX1 RX

static const uint8_t SCL = 7;
static const uint8_t SDA = 6;

// pfodWeb NOTE: SS/MOSI/MISO/SCK (GPIO9/10/11/12) deliberately NOT
// declared - dedicated onboard LCD/touch-panel SPI bus (this board is a
// self-contained round touch LCD module; see LCD_BACKLIGHT/DC/RST,
// TP_INT/RST, IMU_INT1/2 macros above).

static const uint8_t A0 = 1;  // Connected through voltage divider to battery pin

#endif /* Pins_Arduino_h */
