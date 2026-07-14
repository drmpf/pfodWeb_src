#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

static const uint8_t TX = 1;
static const uint8_t RX = 3;

static const uint8_t SDA = 21;
static const uint8_t SCL = 22;

// pfodWeb NOTE: SS/MOSI/MISO/SCK deliberately NOT declared - dedicated
// onboard E-ink display SPI bus (no other SPI peripheral on this board).

static const uint8_t MENU_BTN_PIN = 26;
static const uint8_t BACK_BTN_PIN = 25;
static const uint8_t DOWN_BTN_PIN = 4;
// pfodWeb NOTE: DISPLAY_CS/RES/DC/BUSY, ACC_INT_1/2, VIB_MOTOR_PIN, and
// RTC_INT_PIN deliberately NOT declared - dedicated onboard E-ink
// display, accelerometer, vibration motor, and RTC pins (see board.json
// chipGpios override).

#if defined(ARDUINO_WATCHY_V10)
static const uint8_t UP_BTN_PIN = 32;
static const uint8_t BATT_ADC_PIN = 33;
#define BAT_VOLT_PIN BATT_ADC_PIN
#define RTC_TYPE     1  //DS3231
#elif defined(ARDUINO_WATCHY_V15)
static const uint8_t UP_BTN_PIN = 32;
static const uint8_t BATT_ADC_PIN = 35;
#define RTC_TYPE 2  //PCF8563
#elif defined(ARDUINO_WATCHY_V20)
static const uint8_t UP_BTN_PIN = 35;
static const uint8_t BATT_ADC_PIN = 34;
#define RTC_TYPE 2  //PCF8563
#endif

#define UP_BTN_MASK   (BIT64(UP_BTN_PIN))
#define MENU_BTN_MASK (BIT64(MENU_BTN_PIN))
#define BACK_BTN_MASK (BIT64(BACK_BTN_PIN))
#define DOWN_BTN_MASK (BIT64(DOWN_BTN_PIN))
#define ACC_INT_MASK  (BIT64(ACC_INT_1_PIN))
#define BTN_PIN_MASK  (MENU_BTN_MASK | BACK_BTN_MASK | UP_BTN_MASK | DOWN_BTN_MASK)

#endif /* Pins_Arduino_h */
