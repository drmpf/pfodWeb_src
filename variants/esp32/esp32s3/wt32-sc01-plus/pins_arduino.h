#ifndef Pins_Arduino_h
#define Pins_Arduino_h

/**
 * Variant: WT32-SC01 PLUS
 * Vendor: Wireless-Tag
 * Url: http://www.wireless-tag.com/portfolio/wt32-eth01/
 */

#include <stdint.h>

#define USB_VID          0x303A
#define USB_PID          0x80D0
#define USB_MANUFACTURER "PANLEE"
#define USB_PRODUCT      "SC01PLUS"
#define USB_SERIAL       ""
//GENERAL I/O
static const uint8_t BOOT_0 = 0;
static const uint8_t IO1 = 10;
static const uint8_t IO2 = 11;
static const uint8_t IO3 = 12;
static const uint8_t IO4 = 13;
static const uint8_t IO5 = 14;
static const uint8_t IO6 = 21;
//RS485
static const uint8_t TX = 42;
static const uint8_t RX = 1;
static const uint8_t RTS = 2;
//TOUCHSCREEN (pfodWeb NOTE: LCD_RESET/RS/WR/TE/DB0-7, backlight PWM,
// touch digitizer I2C/INT/RST, and the SD card's SPI bus are all
// deliberately NOT declared as pins — dedicated onboard hardware, not
// general-purpose. LCD_RS shares GPIO0 with BOOT_0 above, which stays
// kept since it's explicitly labeled "GENERAL I/O" by the vendor. See
// this board's own board.json chipGpios override for the full list.)

#endif /* Pins_Arduino_h */
