/*
 * (c)2014-2026 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This code may be freely used for both private and commercial use
 * Provided this copyright is maintained.
 */
#ifndef target_Stream_h
#define target_Stream_h
/*
 * Template pfodStream implementation for your target board's serial port(s),
 * following the pattern of Arduino's HardwareSerial.
 * Use it for pfodParser::connect(pfodStream*), and for debug output via
 * setDebugPtr(pfodStream*). Since a pfodStream is a pfodPrint, it can also be
 * used wherever a pfodPrint* is wanted.
 *
 * One instance per serial port. The constructor does NOT access the hardware.
 * begin() initialises the port; add parameters to begin() to select which
 * port (UART number / handle), pins, rx buffer etc. as your micro needs.
 *
 * This is a skeleton only -- you need to implement begin(), write(uint8_t),
 * flush() and the serial port part of read() in target_Stream.cpp using your
 * board's UART / USB driver; their bodies just describe what each must do.
 * available() and peek() are implemented using a one byte lookAhead filled by read().
 * write(buf, size) is inherited from pfodPrint and calls write(uint8_t) for each byte.
 * See readme.txt, and pfodParserCPP/examples/
 * (e.g. esp32/OnOff_Serial/target_Stream.*, for ESP-IDF and ESP8266_RTOS_SDK)
 * for complete worked examples.
 *
 * Usage (in main.cpp):
 *   target_Stream serialStream;     // global, the constructor does not touch the hardware
 *   ...
 *   // in setup()
 *   serialStream.begin(115200);     // initialise the serial port, add args e.g. port, rx buffer
 *   parser.connect(&serialStream);
 *   setDebugPtr(&serialStream);     // optional, debug output on the same port
 *
 * Debug output can go out on the same port as the pfod messages. pfodWeb ignores
 * characters outside the {..} messages and logs them to the Raw Message Viewer.
 */

#include "pfodStream.h"

class target_Stream : public pfodStream {
  public:
    /**
     * Constructor, only initialises member variables.
     * Does NOT access the hardware, since global objects are constructed
     * before main() runs, i.e. before the board's clocks/pins are set up.
     * Call begin() from setup() to initialise the port.
     */
    target_Stream();

    /**
     * Initialise the serial port. Call once from setup() before
     * using it, e.g. before parser.connect().
     * Add parameters as needed for your micro, e.g. which port
     * (UART number, or driver handle such as UART_HandleTypeDef*, uart_port_t,
     * const device*), tx/rx pins, rx buffer for an interrupt driven receive,
     * and store them in member variables for write(), flush() and read() to use.
     * @param baudRate the serial baud rate, e.g. 115200
     */
    void begin(uint32_t baudRate);

    // pfodPrint methods
    // write(buf, size) is inherited from pfodPrint and calls write(uint8_t) for each byte.
    using pfodStream::write; // keep inherited write(buf, size) and write(const char*) visible

    /**
     * Write one byte to the serial port.
     * @param c the byte to send
     * @return 1 if the byte was sent (or queued for sending), 0 if it could not be
     *         (including if begin() has not been called).
     */
    size_t write(uint8_t c) override;

    /**
     * Wait until all bytes previously written have actually been sent.
     * pfodPrint's default does nothing, which is correct if write() blocks
     * until each byte has gone out.
     */
    void flush() override;

    // pfodStream methods

    /**
     * Number of received bytes waiting to be read.
     * Implemented using the one byte lookAhead: if lookAhead is empty (-1),
     * calls read() and stores the result in lookAhead.
     * Called repeatedly from loop() by the parser, so it must NOT block.
     * @return 1 if a byte is available (held in lookAhead), 0 if none.
     */
    int available() override;

    /**
     * Read and remove the next received byte.
     * Returns the lookAhead byte first, if available()/peek() has stored one,
     * otherwise reads from the serial port (the part you implement).
     * Must NOT block waiting for data.
     * @return the next byte (0..255) as an int, or -1 if no byte is available
     *         (including if begin() has not been called).
     */
    int read() override;

    /**
     * Return the next received byte WITHOUT removing it.
     * Implemented using available() to fill the one byte lookAhead.
     * Must NOT block waiting for data.
     * @return the next byte (0..255) as an int, or -1 if no byte is available.
     */
    int peek() override;

  private:
    // add member variables here for the port, pins, rx buffer etc. passed to begin()
    bool started;  // set true by begin(), no i/o until then
    int lookAhead; // one byte look ahead for available()/peek(), -1 if empty
};

#endif //target_Stream_h
