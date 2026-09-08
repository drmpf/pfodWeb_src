// LedOnOffApp.cpp  ==============================================
//
// Everything this sketch adds on top of the generated code: the LED
// hardware, and the behaviour behind the two buttons and the status label.
//
// NOTHING here edits a generated file. Each generated class is reached
// through an accessor -- get_dwg_LedOn(), get_dwg_LedOff(),
// get_dwg_LedOnOff(), get_pfodMainMenu() -- whose default is defined
// __attribute__((weak)) in the generated .cpp. Defining the same function
// here replaces it at link time, so the generated code drives these
// subclasses instead of its own default instances. Re-generating from the
// pfodWeb Designer overwrites pfodMainMenu.* and Dwg_*.* and leaves this
// file alone.
//
// The generated headers say which methods are virtual; those are the hooks.
// Their pfodAutoIdx / pfodAutoCmd members are protected, so an override can
// name the indexes it needs to send.
//
// (c)2026 Forward Computing and Control Pty. Ltd.
// NSW Australia, www.forward.com.au
// ================================================================

#include <Arduino.h>
#include "Dwg_LedOn.h"
#include "Dwg_LedOff.h"
#include "Dwg_LedOnOff.h"
#include "pfodMainMenu.h"

// ── The LED ──────────────────────────────────────────────────────
// LED_BUILTIN so the sketch builds for any board without editing a pin
// number.
static const int ledPin = LED_BUILTIN;
static bool ledIsOn = false;

// Some boards drive their built-in LED low-for-on; set this false for those.
#ifdef ESP8266
static bool highIsOn = false;
#else
static bool highIsOn = true;
#endif

static void turnLedOn() {
  digitalWrite(ledPin, highIsOn ? HIGH : LOW);
  ledIsOn = true;
}

static void turnLedOff() {
  digitalWrite(ledPin, highIsOn ? LOW : HIGH);
  ledIsOn = false;
}

static bool isLedOn() {
  return ledIsOn;
}

// ── Dwg_LedOnOff — the status label ──────────────────────────────
// The generated sendIndexedItems() always sends the black "Led is Off".
// idx_1 is that label's index; re-sending it with a different colour and
// text is all an update needs to carry, which is why only this one method
// is overridden.

class MyLedOnOff : public Dwg_LedOnOff {
  protected:
    virtual void sendIndexedItems();
};

void MyLedOnOff::sendIndexedItems() {
  if (isLedOn()) {
    dwgsPtr->label().idx(idx_1).color(dwgsPtr->RED).text("Led is ON")
      .bold().offset(20, 11.5).center().decimals(2).send();
  } else {
    dwgsPtr->label().idx(idx_1).color(dwgsPtr->BLACK).text("Led is Off")
      .bold().offset(20, 11.5).center().decimals(2).send();
  }
}

MyLedOnOff myLedOnOff;
Dwg_LedOnOff& get_dwg_LedOnOff() { return myLedOnOff; }

// ── Dwg_LedOn / Dwg_LedOff — the two buttons ─────────────────────
// Each touch switches the LED and then refreshes the drawing whose label
// changed. That is the PARENT, LedOnOff -- these two are inserted into it
// and have no label of their own -- so the update is sent on
// get_dwg_LedOnOff(), not on `this`.
//
// Returning true means "handled, and already replied": pfodParser.cpp's own
// dispatch loop sets rtn = 0 when processDwgCmds() returns true, so
// pfodMainMenu::handle() never sees the cmd and cannot send a second reply.
// Returning false instead would propagate up to the main menu, which would
// then have to know which drawing to refresh.

class MyLedOn : public Dwg_LedOn {
  protected:
    virtual bool Dwg_LedOn_cmd_c1(int row, int col, uint8_t touchType, const byte* editedText);
};

bool MyLedOn::Dwg_LedOn_cmd_c1(int row, int col, uint8_t touchType, const byte* editedText) {
  (void)row; (void)col; (void)touchType; (void)editedText; // suppress warnings
  turnLedOn();
  get_dwg_LedOnOff().sendUpdate();
  return true;
}

MyLedOn myLedOn;
Dwg_LedOn& get_dwg_LedOn() { return myLedOn; }

class MyLedOff : public Dwg_LedOff {
  protected:
    virtual bool Dwg_LedOff_cmd_c1(int row, int col, uint8_t touchType, const byte* editedText);
};

bool MyLedOff::Dwg_LedOff_cmd_c1(int row, int col, uint8_t touchType, const byte* editedText) {
  (void)row; (void)col; (void)touchType; (void)editedText; // suppress warnings
  turnLedOff();
  get_dwg_LedOnOff().sendUpdate();
  return true;
}

MyLedOff myLedOff;
Dwg_LedOff& get_dwg_LedOff() { return myLedOff; }

// ── pfodMainMenu — device setup ──────────────────────────────────
// The pin has to be an output before either button can drive it. Doing it
// in the menu's own init() keeps it with the rest of this sketch's code and
// leaves the .ino exactly as generated -- init_pfodMainMenu(), which the
// .ino calls from setup(), goes through get_pfodMainMenu(), so this runs.
//
// The base init() must still run: it is what registers the drawing with the
// parser.

class MyMainMenu : public pfodMainMenu {
  public:
    virtual void init(pfodCloseConnectionPtr _closeConnectionFnPtr = NULL);
};

void MyMainMenu::init(pfodCloseConnectionPtr _closeConnectionFnPtr) {
  pfodMainMenu::init(_closeConnectionFnPtr);
  pinMode(ledPin, OUTPUT);
  turnLedOff(); // start from a known state, matching the label's default
}

MyMainMenu myMainMenu;
pfodMainMenu& get_pfodMainMenu() { return myMainMenu; }

// ============== end of LedOnOffApp.cpp  file
