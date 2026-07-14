#pragma once

// LEDs
#define PIN_LED             (25u)

// Button
#define PIN_BUTTON          (24u)

// Servo Ports
#define PIN_SERVO1          (2u)
#define PIN_SERVO2          (3u)
#define PIN_SERVO3          (10u)
#define PIN_SERVO4          (11u)

// Motor Ports
#define PIN_MOTOR1_OUTA     (29u)
#define PIN_MOTOR1_OUTB     (28u)
#define PIN_MOTOR2_OUTA     (27u)
#define PIN_MOTOR2_OUTB     (26u)
#define PIN_MOTOR3_OUTA     (23u)
#define PIN_MOTOR3_OUTB     (22u)
#define PIN_MOTOR4_OUTA     (21u)
#define PIN_MOTOR4_OUTB     (20u)

#define PIN_MOTOR1_ENCA     (18u)
#define PIN_MOTOR1_ENCB     (19u)
#define PIN_MOTOR2_ENCA     (17u)
#define PIN_MOTOR2_ENCB     (16u)
#define PIN_MOTOR3_ENCA     (14u)
#define PIN_MOTOR3_ENCB     (15u)
#define PIN_MOTOR4_ENCA     (13u)
#define PIN_MOTOR4_ENCB     (12u)

// Serial
#define PIN_SERIAL1_TX      (0u)
#define PIN_SERIAL1_RX      (1u)

#define PIN_SERIAL2_TX      (8u)
#define PIN_SERIAL2_RX      (9u)

// SPI
#define PIN_SPI0_MISO       (0u)
#define PIN_SPI0_MOSI       (3u)
#define PIN_SPI0_SCK        (2u)
#define PIN_SPI0_SS         (1u)

#define PIN_SPI1_MISO       (8u)
#define PIN_SPI1_MOSI       (11u)
#define PIN_SPI1_SCK        (10u)
#define PIN_SPI1_SS         (9u)

// Wire
#define PIN_WIRE0_SDA       (4u)
#define PIN_WIRE0_SCL       (5u)

#define PIN_WIRE1_SDA       (6u)
#define PIN_WIRE1_SCL       (7u)

#define SERIAL_HOWMANY      (3u)
#define SPI_HOWMANY         (2u)
#define WIRE_HOWMANY        (2u)

static const uint8_t D0 = (0u);
static const uint8_t D1 = (1u);
// pfodWeb NOTE: D2/D3 deliberately NOT declared — GPIO2/3 are Servo1/
// Servo2 outputs, not general-purpose.
static const uint8_t D4 = (4u);
static const uint8_t D5 = (5u);
static const uint8_t D6 = (6u);
static const uint8_t D7 = (7u);
static const uint8_t D8 = (8u);
static const uint8_t D9 = (9u);
// pfodWeb NOTE: D10-D22 and A0-A2 deliberately NOT declared — GPIO10/11
// are Servo3/Servo4; GPIO12-19 are Motor1-4's encoder A/B lines; GPIO20-23
// and GPIO26-29 are Motor1-4's OUTA/OUTB driver outputs. None of these are
// general-purpose (this is a robotics board with all of GPIO10-23/26-29
// dedicated to onboard servo/motor-driver/encoder hardware).
