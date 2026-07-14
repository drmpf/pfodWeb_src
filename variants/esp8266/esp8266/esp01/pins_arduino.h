/*
  pins_arduino.h - Pin definition stub for the AI-Thinker ESP-01 module.

  Unlike every other variant under variants/esp8266/, this file
  deliberately declares NO pin aliases at all — the ESP-01's 8-pin
  castellated form factor only physically breaks out GPIO0, GPIO1(TX),
  GPIO2 and GPIO3(RX) (plus VCC/GND/CH_PD/RST, none of which are GPIOs).
  Those four pins are supplied directly via this variant's own
  board.json chipGpios map instead, so the Designer's pin picker shows
  exactly what's wired out on the module — not the full chip GPIO
  superset that variants/esp8266/esp8266/board.json's chipGpios exposes
  for boards that DO break out SDA/SCL/SPI/A0.
*/

#ifndef Pins_Arduino_h
#define Pins_Arduino_h

#ifndef LED_BUILTIN
#define LED_BUILTIN 1
#endif

#endif /* Pins_Arduino_h */
