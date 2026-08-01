#ifndef PFOD_MAIN_MENU_H
#define PFOD_MAIN_MENU_H
/*   
   pfodMainMenu.h
 * (c)2025 Forward Computing and Control Pty. Ltd.
 * NSW Australia, www.forward.com.au
 * This code is not warranted to be fit for any purpose. You may only use it at your own risk.
 * This generated code may be freely used for both private and commercial use
 * provided this copyright is maintained.
 */

#include <pfodParser.h>
typedef void (*pfodCloseConnectionPtr)(Stream *);  // the pointer to the method that handles parser closeConnection calls
void init_pfodMainMenu(pfodCloseConnectionPtr = NULL);
void handle_pfodMainMenu(pfodParser & parser);
void tick_pfodMainMenu();  // call every loop() to drive the raw-data streaming timer, independent of any connection
#endif
