/*
  pins_arduino.h - Pin definition functions for Arduino
  Arduino Esplora: same ATmega32U4 mechanical pin map as the standard
  Leonardo family (D0-D30, A0-A11=D18-D29, SPI on D14-D17, I2C SDA=D2/
  SCL=D3, LED_BUILTIN=D13). The Esplora's uniqueness is entirely about
  what's wired to what on the PCB (onboard joystick/buttons/slider/
  sensors/RGB LED/buzzer/accelerometer via an analog multiplexer, plus
  a TFT/SD socket) — handled via this board's own board.json chipGpios/
  pinNotes, not via a different mechanical pin map.
*/

#include "../leonardo/pins_arduino.h"
