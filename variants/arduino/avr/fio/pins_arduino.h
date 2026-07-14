/*
  pins_arduino.h - Pin definition functions for Arduino

  Arduino Fio: same ATmega328P 8-analog-input pin map as Nano/Mini/BT/Pro,
  run at 3.3 V / 8 MHz instead of 5 V / 16 MHz (see this board's own
  board.json for the resulting ADC reference-voltage difference).

  Also has an onboard XBee socket. Confirmed via the official
  "Arduino-Fio-v22" schematic (S. Kobayashi / SparkFun, based on the
  original LilyPad Arduino v1.6 design): only the XBee's DOUT/DIN lines
  connect to the ATmega328's normal RXI/TXO (D0/D1, already excluded by
  the parser as the dedicated hardware-serial pins). The XBee's CTS and
  SLEEP_RQ lines are broken out to separate, unpopulated 2-pin jumper
  pads (JP8/JP9 in the schematic) — they are NOT factory-wired to any
  ATmega328 digital pin by default, so no additional GPIO is dedicated to
  the socket.
*/

#include "../eightanaloginputs/pins_arduino.h"
