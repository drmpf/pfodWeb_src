/*
  pins_arduino.h - Pin definition functions for Arduino
  Part of Arduino - http://www.arduino.cc/

  Arduino UNO WiFi (Rev1, "UNO WiFi Developer Edition"): same ATmega328P
  pin map as the standard Uno-family boards (14 digital + 6 analog,
  identical PWM/SPI/TWI pin assignments) - the onboard ESP8266 co-processor
  is bridged to the ATmega328P via an SC16IS750 UART-to-I2C IO-expander
  chip sitting on the standard TWI bus (A4/SDA, A5/SCL), not via any extra
  dedicated GPIO. See this board's own board.json for the resulting
  pinNotes on A4/A5.
*/

#include "../standard/pins_arduino.h"
