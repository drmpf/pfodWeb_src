/*
 * (c)2014-2026 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This code may be freely used for both private and commercial use
 * Provided this copyright is maintained.
 */
#include "target_Stream.h"

/**
 * Constructor, only initialises member variables.
 * Does NOT access the hardware, call begin() from setup() for that.
 */
target_Stream::target_Stream() {
  started = false;
  lookAhead = -1;
}

/**
 * Initialise the serial port. Call once from setup() before
 * using it, e.g. before parser.connect().
 * Add parameters as needed for your micro, e.g. which port
 * (UART number, or driver handle such as UART_HandleTypeDef*, uart_port_t,
 * const device*), tx/rx pins, rx buffer for an interrupt driven receive,
 * and store them in member variables for write(), flush() and read() to use.
 * @param baudRate the serial baud rate, e.g. 115200
 */
void target_Stream::begin(uint32_t baudRate) {
  (void)(baudRate);
  // Implement this for your board:
  // Store any port / pins / rx buffer parameters you added in member variables.
  // Set up the UART -- clocks, tx/rx pins / pin muxing,
  // baud rate, data bits/parity/stop bits (normally 8N1), and enable the
  // transmitter and receiver.
  // If write() uses an interrupt/DMA driven transmit buffer, set that up here.
  // If read() uses an interrupt driven receive into a pfodRingBuffer
  // (see pfodParserCPP/src/pfodRingBuffer.h), initialise the ring buffer and
  // attach/enable this UART's receive interrupt here.
  started = true;
}

/**
 * Write one byte to the serial port.
 * @param c the byte to send
 * @return 1 if the byte was sent (or queued for sending), 0 if it could not be
 *         (including if begin() has not been called).
 */
size_t target_Stream::write(uint8_t c) {
  if (!started) {
    return 0;
  }
  (void)(c);
  // Implement this for your board:
  // Send the byte c out the serial port (UART transmit register,
  // driver transmit call, etc.).
  // Either block until the byte has been accepted by the hardware/driver,
  // or put it in a transmit buffer that is emptied by an interrupt/DMA.
  // If the transmit buffer is full, block and wait for space to become available.
  // Return 1 if the byte was sent/queued, 0 if it could not be sent.
  // Do not return 1 for a byte that was dropped.
  return 0; // replace with your implementation
}

/**
 * Wait until all bytes previously written have actually been sent.
 * pfodPrint's default does nothing, which is correct if write() blocks
 * until each byte has gone out.
 */
void target_Stream::flush() {
  // Implement this for your board:
  // If write() buffers output (transmit buffer, interrupt or DMA driven),
  // block here until that buffer is empty and the hardware has finished
  // transmitting the last byte (e.g. wait for the UART transmit-complete flag,
  // or call your driver's wait-for-tx-done function).
  // If write() already blocks until each byte is sent, leave this empty.
  // NOTE: this does NOT discard received data.
}

/**
 * Number of received bytes waiting to be read.
 * Implemented using the one byte lookAhead: if lookAhead is empty (-1),
 * calls read() and stores the result in lookAhead.
 * Called repeatedly from loop() by the parser, so it must NOT block.
 * @return 1 if a byte is available (held in lookAhead), 0 if none.
 */
int target_Stream::available() {
  if (lookAhead == -1) {
    lookAhead = read(); // lookAhead is empty so this reads from the serial port
  }
  return (lookAhead == -1) ? 0 : 1;
}

/**
 * Read and remove the next received byte.
 * Returns the lookAhead byte first, if available()/peek() has stored one,
 * otherwise reads from the serial port.
 * Must NOT block waiting for data.
 * @return the next byte (0..255) as an int, or -1 if no byte is available
 *         (including if begin() has not been called).
 */
int target_Stream::read() {
  if (lookAhead != -1) {
    int c = lookAhead;
    lookAhead = -1; // empty the lookAhead
    return c;
  }
  if (!started) {
    return -1;
  }
  // Implement this part for your board:
  // If no received byte is available from the serial port,
  // return -1 immediately.
  // Otherwise remove the oldest received byte from the UART receive buffer / fifo
  // and return it as an unsigned value 0..255 (i.e. (int)(uint8_t)byte,
  // never a negative char).
  return -1; // replace with your implementation
}

/**
 * Return the next received byte WITHOUT removing it.
 * Implemented using available() to fill the one byte lookAhead.
 * Must NOT block waiting for data.
 * @return the next byte (0..255) as an int, or -1 if no byte is available.
 */
int target_Stream::peek() {
  available(); // fills lookAhead if a byte can be read
  return lookAhead;
}
