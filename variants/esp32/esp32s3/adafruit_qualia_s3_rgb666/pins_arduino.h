#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define USB_VID 0x239A
#define USB_PID 0x8147

#define USB_MANUFACTURER "Adafruit"
#define USB_PRODUCT      "Qualia ESP32-S3 RGB666"
#define USB_SERIAL       ""  // Empty string for MAC address

// pfodWeb NOTE: PCA_TFT_SCK/CS/RESET/CPT_IRQ/BACKLIGHT/MOSI (GPIO0/1/2/
// 3/4/7) deliberately NOT declared — dedicated onboard RGB666 TFT +
// capacitive touch controller (confirmed by the exact same GPIOs also
// appearing as TFT_B4/PCLK/DE/R5 below). PCA_BUTTON_UP/DOWN (GPIO5/6)
// are kept — genuine onboard buttons, not overlapping any TFT pin.
static const uint8_t PCA_BUTTON_UP = 5;
static const uint8_t PCA_BUTTON_DOWN = 6;

static const uint8_t TX = 16;
static const uint8_t RX = 17;
#define TX1 TX
#define RX1 RX

static const uint8_t SDA = 8;
static const uint8_t SCL = 18;

// pfodWeb NOTE: MOSI/SCK not declared — same GPIO7/5 as
// PCA_TFT_MOSI/PCA_BUTTON_UP above. SS (15) and MISO (6, also
// PCA_BUTTON_DOWN) are kept — genuinely not part of the TFT bus.
static const uint8_t SS = 15;
static const uint8_t MISO = 6;

static const uint8_t A0 = 17;
static const uint8_t A1 = 16;

// pfodWeb NOTE: T3/T9/T10/T11/T12 deliberately NOT declared — same
// onboard TFT pins as above (touch pin IDs map directly to GPIO numbers)
static const uint8_t T8 = 8;

// pfodWeb NOTE: fixed onboard RGB666 TFT — every TFT_* line is
// dedicated, not general-purpose (see board.json chipGpios override)

#endif /* Pins_Arduino_h */
