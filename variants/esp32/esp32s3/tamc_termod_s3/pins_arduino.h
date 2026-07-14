#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>
#include <stdbool.h>

#define USB_VID 0x303a
#define USB_PID 0x1001

// This board has no NeoLED or any User LED

static const uint8_t TX = 43;
static const uint8_t RX = 44;

static const uint8_t SDA = 8;
static const uint8_t SCL = 9;

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - dedicated
// onboard TFT+microSD shared SPI bus (same GPIOs as TFT_CS/RST/DC and
// SD_CS below).

// pfodWeb NOTE: A9-A13/A17 and T10-T14 deliberately NOT declared - same
// dedicated TFT/SD SPI bus and TFT_DC/RST pins as below.
static const uint8_t A0 = 1;
static const uint8_t A1 = 2;
static const uint8_t A2 = 3;
static const uint8_t A3 = 4;
static const uint8_t A4 = 5;
static const uint8_t A5 = 6;
static const uint8_t A6 = 7;
static const uint8_t A7 = 8;
static const uint8_t A8 = 9;
static const uint8_t A14 = 15;
static const uint8_t A15 = 16;
static const uint8_t A16 = 17;
static const uint8_t A18 = 19;
static const uint8_t A19 = 20;

static const uint8_t T1 = 1;
static const uint8_t T2 = 2;
static const uint8_t T3 = 3;
static const uint8_t T4 = 4;
static const uint8_t T5 = 5;
static const uint8_t T6 = 6;
static const uint8_t T7 = 7;
static const uint8_t T8 = 8;
static const uint8_t T9 = 9;

static const uint8_t BAT_LV = 1;
#define BAT_VOLT_PIN BAT_LV
static const uint8_t CHG = 2;
// pfodWeb NOTE: TFT_CS/DC/RST/BCKL and SD_CS/CD deliberately NOT declared
// - dedicated onboard TFT display + microSD card (see board.json).

#define DISPLAY_PORTRAIT       2
#define DISPLAY_LANDSCAPE      3
#define DISPLAY_PORTRAIT_FLIP  0
#define DISPLAY_LANDSCAPE_FLIP 1

#define DISPLAY_WIDTH  240
#define DISPLAY_HEIGHT 320

/**
 * Get battery voltage in volts
 * @return          Battery voltage in volts
 */
float getBatteryVoltage();
/**
 * Get battery level in percent
 * @return          Battery level in percent(0-100)
 */
float getBatteryCapacity();
/**
 * Get battery charge state
 * @return          Battery charge state(true=charging, false=not charging)
 */
bool getChargingState();
/**
 * Set on charge start callback
 * @param func  On charge start Callback function
 */
void setOnChargeStart(void (*func)());
/**
 * Set on charge end callback
 * @param func  On charge end Callback function
 */
void setOnChargeEnd(void (*func)());

#endif /* Pins_Arduino_h */
