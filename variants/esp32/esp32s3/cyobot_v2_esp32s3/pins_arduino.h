#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

#define USB_MANUFACTURER "CYOBot"
#define USB_PRODUCT      "CYOBrain ESP32S3"
#define USB_SERIAL       ""  // Empty string for MAC address

static const uint8_t BUTTON0 = 4;
static const uint8_t BUTTON1 = 38;
static const uint8_t LED = 24;

static const uint8_t BAT_MEAS = 6;
#define BAT_VOLT_PIN BAT_MEAS
static const uint8_t CHAR_DET = 23;

static const uint8_t NEO_BASE = 7;
static const uint8_t NEO_BRAIN = 15;

// pfodWeb NOTE: I2S0_MCLK/DSDIN/SCLK/LRCK deliberately NOT declared -
// dedicated onboard I2S audio bus, not general-purpose.

static const uint8_t SDA = 17;
static const uint8_t SCL = 18;

static const uint8_t SS = 5;
static const uint8_t MOSI = 2;
static const uint8_t MISO = 42;
static const uint8_t SCK = 41;

// pfodWeb NOTE: ENCODER1_A/B and ENCODER2_A/B deliberately NOT declared -
// dedicated onboard motor/wheel rotary encoder inputs, not general-purpose.

static const uint8_t UART1_RXD = 3;
static const uint8_t UART1_TXD = 1;

static const uint8_t GPIO46 = 46;
static const uint8_t ESP_IO0 = 0;

// pfodWeb NOTE: SD_OUT/SD_SPI_MOSI/CLK/MISO/CS deliberately NOT declared
// - dedicated onboard microSD card SPI bus, not general-purpose.

// pfodWeb NOTE: PA_CTRL (GPIO25) deliberately NOT declared - internal
// audio power-amp enable line, not general-purpose.

#endif /* Pins_Arduino_h */
