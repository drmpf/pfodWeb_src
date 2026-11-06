Porting OnOff_serial to your micro -- implementing target_Stream and checking target_pfodClock
===============================================================

OnOff_serial is built against the plain C++ pfodParserCPP library, not Arduino.
Non-Arduino boards have no portable "Serial" object, so you need to connect
pfodParser to your board's serial port (UART, USB CDC, etc.).
That is done by the template class in this directory:

  target_Stream (target_Stream.h / target_Stream.cpp)
      A pfodStream subclass, i.e. input AND output, passed to
      parser.connect() in main.cpp.

target_Stream follows the pattern of Arduino's HardwareSerial:
  - one class does all the serial i/o for a port
  - one instance per serial port, e.g. target_Stream serialStream;
  - the constructor does not access the hardware
  - begin() initialises the port, with parameters you add to select
    which port, pins, rx buffer etc.
  - an instance can also be passed to setDebugPtr(pfodStream*) for debug
    output, and since pfodStream is a pfodPrint, used wherever a pfodPrint*
    is wanted -- no separate print class needed

For any micro you only implement 4 methods, in target_Stream.cpp:

  1. begin(...)        -- initialise the serial port
  2. write(uint8_t c)  -- send one byte
  3. flush()           -- wait for output to finish
  4. read()            -- the serial port part only, receive one byte

Each part to complete contains a comment "// Implement this for your board:"
(or "Implement this part for your board:") describing what it must do and,
where a value is returned, a placeholder marked "// replace with your implementation".
Everything else is already implemented.

Checking target_pfodClick.cpp
-----------------------------------
Check that micros() works on your micro (see target_pfodClock methods section below) and
implement yield() if you call pfodBufferedStream with blocking true


target_Stream Implementation
=======================================

Constructor and begin()
-----------------------
main.cpp declares the stream as a global
   target_Stream serialStream;
Global objects are constructed BEFORE main() runs, i.e. before the board's
clocks, pins and peripherals have been set up. So the constructor only
initialises member variables (started = false, lookAhead = -1).
It does NOT access the hardware.

All the hardware setup is done by begin(), called from setup() in main.cpp:
   serialStream.begin(115200);
   parser.connect(&serialStream);

begin() is declared as begin(uint32_t baudRate). Add parameters for
whatever your micro needs, e.g.
   - which port: UART number, or driver handle (UART_HandleTypeDef*,
     uart_port_t, const struct device*), or UART register base address
   - tx / rx pin numbers
   - a caller supplied rx buffer for an interrupt driven receive, as in
     the examples: begin(baudRate, rxBuf, sizeof(rxBuf))
Then update the serialStream.begin(...) call in main.cpp to match.
Store them in member variables for write(), flush() and read() to use
(add them to the private: section of the class, where marked).

begin() sets started = true at the end. Until begin() has been called
write() returns 0 and read() returns -1, so nothing touches the hardware.

The baud rate etc. must match the settings used on the pfodWeb / pfodProxy side.


The Stream methods to implement
========================

1. begin(...)  -- initialise the serial port
--------------------------------------------
Store the port / pins / rx buffer parameters you added in member variables.
Set up the UART: clocks, tx/rx pins / pin muxing,
baud rate, data bits / parity / stop bits (normally 8N1), enable the
transmitter and receiver.
If write() uses an interrupt/DMA driven transmit buffer, set that up.
If read() uses an interrupt driven receive, initialise the pfodRingBuffer
(see pfodParserCPP/src/pfodRingBuffer.h) and attach / enable this UART's
receive interrupt.

2. write(uint8_t c)  -- send one byte
-------------------------------------
Send the byte c out the serial port, using your board's UART transmit
register or driver call, e.g.
   STM32 HAL : HAL_UART_Transmit(huart, &c, 1, HAL_MAX_DELAY)
   ESP-IDF / ESP8266_RTOS_SDK : uart_write_bytes(uartNum, &c, 1)
   Zephyr    : uart_poll_out(dev, c)
   bare metal: wait for the UART "transmit register empty" flag, then
               write c to the UART data register

Either block until the byte is accepted by the hardware/driver, or put it
in a transmit buffer that an interrupt/DMA empties.
Block if the tx buffer is full and wait for space to become available.

Return 1 if the byte was sent/queued, 0 if it could not be sent.
Do not return 1 for a byte that was dropped.

3. flush()  -- wait for output to finish
----------------------------------------
Block until every byte previously written has actually been transmitted.

If write(c) blocks until each byte has gone out (the simple polled case
above), there is nothing to wait for -- leave flush() empty.

If write(c) buffers output (interrupt or DMA driven), wait here until that
buffer is empty and the UART has finished sending the last byte
(e.g. wait for the UART "transmit complete" flag, or call your driver's
wait-for-tx-done function, such as ESP-IDF uart_wait_tx_done()).

NOTE: flush() does NOT discard received data.

4. read()  -- receive one byte, without blocking
------------------------------------------------
read() already returns the look ahead byte first (see below), and returns
-1 if begin() has not been called. You only complete the part after the
"Implement this part for your board:" comment:

  - If no received byte is available from the serial port, return -1
    immediately. read() MUST NOT block waiting for data, the parser calls
    it repeatedly from loop().
  - Otherwise remove the oldest received byte from the UART receive
    buffer / fifo and return it as 0..255, i.e. (int)(uint8_t)byte.
    Never return a negative char value, -1 means "no data".

Typical implementations:
   polled    : if the UART "receive data ready" flag is set, return the
               UART data register, else return -1
   ESP-IDF   : uart_read_bytes(uartNum, &b, 1, 0) with a 0 timeout,
               return b if 1 byte was read, else -1
   Zephyr    : uart_poll_in(dev, &b) returns 0 when a byte was read
   interrupt : have the UART receive interrupt put bytes into a
               pfodRingBuffer and return ringBuffer.read() here
               (it returns -1 when empty)

At higher baud rates a polled read can lose bytes if loop() is slow, because
the UART hardware usually holds only 1 or a few bytes. If that happens use an
interrupt driven receive into a ring buffer, as the examples do.

Interrupt driven receive: the UART interrupt handler is a plain C function,
so it needs to reach the right target_Stream instance. Have each UART's 
interrupt handler call a method on its global instance
(e.g. serialStream.onByteReceived()), or keep a static table of instance
pointers indexed by UART number, filled in by begin().


Already implemented -- no changes needed
========================================
available() and peek()
    Implemented with a one byte look ahead (int lookAhead, -1 when empty):
      available() - if lookAhead is empty, calls read() and stores the
                    result in lookAhead. Returns 1 if a byte is held, else 0.
      peek()      - calls available(), then returns lookAhead (or -1).
      read()      - returns and empties lookAhead if it holds a byte,
                    otherwise reads from the serial port (your code).
    So available() only ever returns 0 or 1, not the full count of waiting
    bytes. That is all pfodParser needs, it only uses while (available()) { read(); }
    If you use an interrupt driven receive into a pfodRingBuffer, you can
    instead have available() and peek() return ringBuffer.available() and
    ringBuffer.peek(), as the examples do.

write(buffer, size), write(const char*), print(...), println(...)
    Inherited from pfodPrint, they all end up calling write(c).
    Optionally override write(buffer, size) with your driver's block
    transmit call if that is faster.


Debug output on the same port
-----------------------------
Because target_Stream is also a pfodPrint, the same serialStream used for
the pfod connection can also be used for debug output, just like Arduino's Serial:
   ...
   // in setup()
   serialStream.begin(115200);
   setDebugPtr(&serialStream);

You don't need to use a different port for sending debug output.
pfodWeb ignores characters outside the {..} messages and just logs them to
the Raw Message Viewer where you can see your debug messages.


target_pfodClock methods
===========================================

micros() -- check this works on your micro
------------------------------------------
pfodParserCPP needs a clock. It is declared in pfodParserCPP/src/pfodClock.h
(included for the generated files by pfodParser.h in this directory):
   unsigned long micros();   // us since startup -- the only clock source
   unsigned long millis();   // ms since startup -- derived from micros()
   void yield();             // called while busy waiting -- optional, see below

millis() is used for the parser's message timeout (pfodParserCPP.cpp), in
pfodDelay.cpp, pfodWaitForUtils.cpp and pfodBufferedStream.cpp, and by the
generated pfodMainMenu.cpp. micros() is used by pfodBufferedStream.cpp and
pfodRandom.cpp. You only ever need to provide micros(); millis() is already
implemented from it in pfodClock.cpp.

The library does NOT implement micros(). It is in target_pfodClock.cpp in
this directory, which must be part of your build. Edit it there directly if
needed -- it is the only place micros() is defined.

As supplied, micros() in target_pfodClock.cpp uses std::chrono::steady_clock.
That works where the C/C++ runtime has a real clock underneath, e.g. ESP-IDF,
Zephyr with POSIX / libc time support, Linux.

On many bare metal toolchains (e.g. arm-none-eabi with newlib, PIC32) it
does NOT work: either the link fails (missing clock_gettime / _gettimeofday),
or it links but micros() always returns 0. Then millis() never advances and
timeouts never expire, with no error.

If so, replace micros() in target_pfodClock.cpp with one using your board's
timer, and remove its #include <chrono>. Nothing else then references
std::chrono::steady_clock, so the clock_gettime / _gettimeofday link error goes.
target_pfodClock.cpp has commented out example micros() for ESP-IDF,
Zephyr, STM32 HAL and a bare metal 1 MHz timer.

Your micros() MUST count through the full unsigned long range and
wrap from its maximum value back to 0 (every ~71.6 minutes for 32 bit),
otherwise (micros() - start) and millis() go wrong when it wraps.
The examples are:
   ESP-IDF   : micros() { return (unsigned long)esp_timer_get_time(); }
   Zephyr    : micros() { return (unsigned long)k_ticks_to_us_floor64(k_uptime_ticks()); }
   STM32 HAL : micros() from HAL_GetTick() * 1000 plus the microseconds
               into the current 1 ms SysTick period, i.e.
               (SysTick->LOAD - SysTick->VAL) / (SystemCoreClock / 1000000),
               re-reading if HAL_GetTick() changed during the calculation
   bare metal: a free running 32 bit timer clocked at 1 MHz, return its count
(Casting a 64 bit count to unsigned long, or 32 bit unsigned arithmetic as
in the STM32 case, wraps correctly. Something like a cycle counter divided by
cycles-per-uS does NOT, as it wraps long before reaching the maximum.)

millis() keeps an internal count of the elapsed micros() between calls, so
it must be called at least once per micros() wrap period (~71.6 minutes).
pfodParser calls it every loop, so this is normally automatic.
millis() is not safe to call from an interrupt handler.

Quick check once the serial port works: in loop(), print millis() about
once a second (e.g. using a pfodDelay) and check the values advance by
about 1000 each time.

yield()
-------
There is no delay() in pfodParserCPP. The only places the library busy waits
are in pfodBufferedStream, and both call yield() repeatedly while waiting:
  - write(): when it is in blocking mode and its transmit buffer is full,
    it waits in 1 ms steps, timed with millis(), for space.
  - flush(): waits until the buffer is empty, about
    (buffered bytes x one byte time at the baud rate).
pfodBufferedStream releases at most one byte per yield() call, so if your
yield() blocks (e.g. vTaskDelay(1)) the wait is correspondingly longer.

The default yield() in pfodClock.cpp is an empty function marked
__attribute__((weak)), so by default the wait just spins. If your board needs
to run other things while waiting, e.g. an RTOS (task watchdog, WiFi stack),
define your own yield() -- target_pfodClock.cpp has commented out examples,
uncomment ONE. Your (non-weak) yield() replaces the weak default at link
time -- do not edit pfodClock.cpp for this. Weak symbols need a GCC/Clang
toolchain producing ELF objects, which is what micro toolchains use.

yield() is NOT defined by ESP-IDF, ESP8266_RTOS_SDK, FreeRTOS or Zephyr.
(Only the Arduino cores define one, and that is a C function, a different
symbol from pfodParserCPP's C++ yield(), so it would not replace the default.)

The examples in target_pfodClock.cpp:
   ESP-IDF (ESP32) / ESP8266_RTOS_SDK / other FreeRTOS:
      #include "freertos/FreeRTOS.h"
      #include "freertos/task.h"
      void yield() { vTaskDelay(1); }  // block for 1 tick, lets every task run
   vTaskDelay(1) lets the lowest priority IDLE task run, and IDLE is what
   resets the task watchdog. (taskYIELD() does NOT, it only lets tasks of
   equal or higher priority run.) With the ESP-IDF default 100 Hz tick,
   vTaskDelay(1) blocks for 10 ms, so a blocked write()/flush() sends only
   ~100 bytes/sec -- set CONFIG_FREERTOS_HZ=1000 if that is too slow.

   Zephyr:
      #include <zephyr/kernel.h>
      void yield() { k_msleep(1); }    // lower priority threads also run
   (k_yield() only lets threads of equal or higher priority run.)

   ESP8266: use ESP8266_RTOS_SDK (FreeRTOS, above).
      The ESP8266 NonOS SDK is NOT supported. Its user code runs in SDK
      callbacks that must return before WiFi can run, so pfodBufferedStream's
      blocking write()/flush() would stall WiFi, and yield() cannot hand
      control back to the SDK.

   Bare metal (no RTOS, e.g. STM32 HAL, nRF5 SDK, PIC32):
      Nothing else needs to run, so the default empty yield() is fine.
      If a hardware watchdog is enabled, feed it in yield(), e.g. STM32 HAL:
      void yield() { HAL_IWDG_Refresh(&hiwdg); }


Worked examples
---------------
pfodParserCPP/examples/ has this OnOff_Serial sketch with target_Stream.h/.cpp,
target_pfodClock.cpp and main.cpp completed for several micros:
esp32, esp8266 (ESP8266_RTOS_SDK), stm32, nrf52, pic32 and zephyr
(e.g. examples/esp32/OnOff_Serial/). They show the driver calls to use in begin(), write(c),
flush() and read() for that micro, how an interrupt driven receive
into a pfodRingBuffer is set up, and a micros() for that micro.
