#ifndef PFODPARSER_H
#define PFODPARSER_H
/**
pfodParser PIC (and other micros)
 Parses commands of the form { cmd | arg1 ` arg2 ... }
 Arguments are separated by `
 The | and the args are optional
 This is a complete parser for ALL commands a pfodApp will send to a pfodDevice
 see www.pfod.com.au  for more details.

  pfodParser adds about 81 bytes of Ram (with 16byte parser buffer)

The pfodParser parses messages of the form
 { cmd | arg1 ` arg2 ` ... }
The message is parsed into the args array by replacing '|', '`' and '}' with '/0' (null)
When the the end of message } is seen
  parse() returns the first uint8_t of the cmd
  getCmd() returns a pointer to the null terminated cmd
  skipCmd() returns a pointer to the first arg (null terminated)
      or a pointer to null if there are no args
  getArgsCount() returns the number of args found.
These calls are valid until the start of the next msg { is parsed.
At which time they are reset to empty command and no args.

 (c)2012 Forward Computing and Control Pty. Ltd.
 This code may be freely used for both private and commercial use.
 Provide this copyright is maintained.
 */

#include <stddef.h>
#include <stdint.h>
#include <string.h>

#include "pfodParserStream.h"

#ifdef	__cplusplus
extern "C" {
#endif

void pfodParser_pfodParser(const char* version);
uint8_t pfodParser_parse_RX(void);
uint8_t pfodParser_isRefresh(void); // starts with {version: and the version matches this parser's version
void pfodParser_sendVersion(void); // send ~ version to parser.print
uint8_t* pfodParser_getCmd(void);
uint8_t* pfodParser_getFirstArg(void);
uint8_t* pfodParser_getNextArg(uint8_t *start);
uint8_t pfodParser_getArgsCount(void);
uint8_t* pfodParser_parseLong(uint8_t* idxPtr, long *result);

int pfodParser_swap01(int); // method prototype for slider end swaps

// print support
int pfodParser_println(void); // skips print if not connected
int pfodParser_printCh(char c); // skips print if not connected
int pfodParser_printStr(const char *str); // skips print if not connected
int pfodParser_printLong(const long l); // skips print if not connected

// #define DEBUG_PARSER_MSG to enable this method
//  void pfodParser_msgDebug(); // normally not used

#ifdef	__cplusplus
}
#endif
#endif /* PFODPARSER_H */

