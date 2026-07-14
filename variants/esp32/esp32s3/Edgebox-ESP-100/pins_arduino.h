#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#include <stdint.h>

//Programming and Debugging Port
static const uint8_t TXD = 43;
static const uint8_t RXD = 44;
static const uint8_t RST = 0;

//I2C
static const uint8_t SDA = 20;
static const uint8_t SCL = 19;

// pfodWeb NOTE: I2C_INT (GPIO9, RTC PCF8563 interrupt), SS/MOSI/MISO/
// SCK/ETH_INT/ETH_RST (GPIO10-15, dedicated W5500 Ethernet SPI bus),
// LTE_PWR_EN/PWR_KEY/TXD/RXD (GPIO16/21/47/48, dedicated A7670G cellular
// modem), RS485_TXD/RXD/RTS (GPIO17/18/8, dedicated RS485 transceiver),
// and CAN_TXD/RXD (GPIO1/2, dedicated CAN transceiver) deliberately NOT
// declared - all fixed onboard hardware, not general-purpose (see
// board.json chipGpios override). DO0-5/DI0-3/AO0-1 stay kept - the
// industrial I/O terminal banks are the point of using this board.

//BUZZER
static const uint8_t BUZZER = 45;

static const uint8_t DO0 = 40;
static const uint8_t DO1 = 39;
static const uint8_t DO2 = 38;
static const uint8_t DO3 = 37;
static const uint8_t DO4 = 36;
static const uint8_t DO5 = 35;

static const uint8_t DI0 = 4;
static const uint8_t DI1 = 5;
static const uint8_t DI2 = 6;
static const uint8_t DI3 = 7;

static const uint8_t AO0 = 42;
static const uint8_t AO1 = 41;

#endif /* Pins_Arduino_h */
