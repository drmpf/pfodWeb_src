/*
 * (c)2014-2026 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This code may be freely used for both private and commercial use
 * Provided this copyright is maintained.
 */
/*
 * target_pfodClock.cpp -- micros() (required) and yield() (optional) for your board
 *
 * pfodParserCPP does not implement micros(), it must be supplied by your program.
 * millis() (in pfodParserCPP/src/pfodClock.cpp) is derived from it.
 * See "micros() -- check this works on your micro" and "yield()" in readme.txt.
 *
 * The micros() below uses std::chrono::steady_clock. That works where the C/C++
 * runtime has a real clock underneath, e.g. ESP-IDF, Zephyr with POSIX / libc
 * time support, Linux.
 *
 * On many bare metal toolchains (e.g. arm-none-eabi with newlib, PIC32) it does
 * NOT work: either the link fails (missing clock_gettime / _gettimeofday), or it
 * links but micros() always returns 0, so millis() never advances and timeouts
 * never expire, with no error.
 * If so, replace micros() below with one of the commented out examples (or your
 * own using your board's timer), and remove the #include <chrono>.
 */

#include "pfodClock.h"
#include <chrono>

/**
 * Microseconds since the first call.
 * MUST count through the full unsigned long range and wrap from its maximum
 * value back to 0 (every ~71.6 minutes for a 32 bit unsigned long), so that
 * (micros() - start) gives the correct elapsed time across a wrap.
 * Casting a 64 bit count to unsigned long wraps correctly. A cycle counter
 * divided by cycles-per-uS does NOT, as it wraps long before reaching the maximum.
 *
 * This implementation uses std::chrono::steady_clock. The start time is a
 * function local static, initialised on the first call. The cast to
 * unsigned long truncates the count, so it wraps from max back to 0 as required.
 * @return the current microsecond count
 */
unsigned long micros() {
  static const std::chrono::steady_clock::time_point startTime = std::chrono::steady_clock::now();
  return (unsigned long)std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now() - startTime).count();
}

/* ---- Example micros() for other targets, replace the one above with one of these ----

// ESP-IDF (ESP32), ESP8266_RTOS_SDK
// esp_timer_get_time() is a 64 bit uS count since boot
#include "esp_timer.h"
unsigned long micros() {
  return (unsigned long)esp_timer_get_time();
}

// Zephyr
#include <zephyr/kernel.h>
unsigned long micros() {
  return (unsigned long)k_ticks_to_us_floor64(k_uptime_ticks());
}

// STM32 HAL, using the 1 ms SysTick (HAL_GetTick()) plus the uS into the
// current SysTick period. SysTick counts down from LOAD to 0.
// Re-reads if the ms tick changed during the calculation.
// 32 bit unsigned arithmetic, so it wraps correctly.
#include "main.h"  // your CubeMX generated header, pulls in the HAL
unsigned long micros() {
  uint32_t ms;
  uint32_t ticks;
  do {
    ms = HAL_GetTick();
    ticks = SysTick->LOAD - SysTick->VAL;
  } while (ms != HAL_GetTick());
  return (unsigned long)(ms * 1000UL + ticks / (SystemCoreClock / 1000000UL));
}

// Bare metal, a free running 32 bit timer clocked at 1 MHz,
// set up and started in your board initialisation.
unsigned long micros() {
  return (unsigned long)YOUR_TIMER_COUNT_REGISTER;  // replace with your timer's count register
}

---- end of micros() examples ---- */

/*
 * yield() -- optional.
 * Only called by pfodBufferedStream: by write() in blocking mode, while it
 * waits in 1 ms steps for transmit buffer space, and by flush(), while it
 * waits for the buffer to empty.
 * The library's default yield() (pfodClock.cpp) is weak and empty. Defining
 * yield() here replaces it at link time.
 * yield() is NOT defined by ESP-IDF, ESP8266_RTOS_SDK, FreeRTOS or Zephyr.
 * Uncomment ONE of these if your board needs it:
 */

// ESP-IDF (ESP32), ESP8266_RTOS_SDK, other FreeRTOS
// vTaskDelay(1) blocks for 1 tick so every task runs, including the lowest
// priority IDLE task that resets the task watchdog.
// (With the ESP-IDF default 100 Hz tick, it blocks for 10 ms, and as
// pfodBufferedStream releases at most one byte per yield() call, a blocked
// write()/flush() then sends ~100 bytes/sec. Set CONFIG_FREERTOS_HZ=1000
// if that is too slow.)
// #include "freertos/FreeRTOS.h"   // plain FreeRTOS: "FreeRTOS.h"
// #include "freertos/task.h"       // plain FreeRTOS: "task.h"
// void yield() { vTaskDelay(1); }

// Zephyr
// k_msleep(1) lets lower priority threads run too.
// #include <zephyr/kernel.h>
// void yield() { k_msleep(1); }

// ESP8266: use ESP8266_RTOS_SDK (FreeRTOS, above).
// The ESP8266 NonOS SDK is NOT supported -- its user code runs in SDK
// callbacks that must return before WiFi can run, so pfodBufferedStream's
// blocking write()/flush() would stall WiFi, and yield() cannot hand control
// back to the SDK.

// Bare metal (no RTOS, e.g. STM32 HAL, nRF5 SDK, PIC32)
// Nothing else needs to run, so the default empty yield() is fine.
// If a hardware watchdog is enabled, feed it here, e.g. STM32 HAL:
// void yield() { HAL_IWDG_Refresh(&hiwdg); }
