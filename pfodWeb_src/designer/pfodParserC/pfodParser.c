/**
pfodParser 
 (c)2012 Forward Computing and Control Pty. Ltd.
 This code may be freely used for both private and commercial use.
 Provide this copyright is maintained.
 */

#include "pfodParser.h"
#include "pfodParserStream.h"
#include "pfodMenu.h"


// you can reduce the value if you are handling smaller messages
// but never increase it.
static const uint8_t pfodParser_pfodMaxMsgLen = 0xff; // == 255, if no closing } by now ignore msg
uint8_t pfodParser_emptyVersion[1];
uint8_t pfodParser_argsCount; // no of arguments found in msg
uint8_t pfodParser_argsIdx;
uint8_t pfodParser_byteCounter;
uint8_t pfodParser_parserState;
uint8_t pfodParser_args[PFOD_PARSER_BUFFER_SIZE + 2]; // pfodParser_pfodMaxMsgLen + 1]; // allow for trailing null
uint8_t *pfodParser_versionStart;
uint8_t *pfodParser_cmdStart;
uint8_t pfodParser_refresh;
const char *pfodParser_version;
static const uint8_t pfodParser_pfodBar = (uint8_t) '|';
static const uint8_t pfodParser_pfodTilda = (uint8_t) '~';
static const uint8_t pfodParser_pfodAccent = (uint8_t) '`';
static const uint8_t pfodParser_pfodArgStarted = 0xfe;

/**
 * pfodWaitingForStart if outside msg
 * pfodMsgStarted if just seen opening {
 * pfodInMsg in msg after {
 * prodEndMsg if just seen closing }
 */
void pfodParser_setCmd(uint8_t cmd);
static const uint8_t pfodParser_pfodWaitingForStart = 0xff;
static const uint8_t pfodParser_pfodMsgStarted = '{';
static const uint8_t pfodParser_pfodRefresh = ':';
static const uint8_t pfodParser_pfodInMsg = 0;
static const uint8_t pfodParser_pfodMsgEnd = '}';
const char* pfodParser_getVersion(void);
void pfodParser_setVersion(const char* version); // no usually needed

// this is returned if pfodDevice should drop the connection
// only returned by pfodParser in read() returns -1
void pfodParser_init(void); // for now
uint8_t pfodParser_parseChar(uint8_t in); // for now

int pfodParser_printCh(char c) {
    return pfodParser_write((uint8_t) c);
}

int pfodParser_printStr(const char *str) {
	int rtn = 0;
    while (*str) {
        rtn += pfodParser_write((uint8_t) * str++);
    }
	return rtn;
}

int pfodParser_printLong(const long lin) {
    char buf[3 * sizeof (long) + 2]; // Assumes max 3char per byte plus sign plus null terminator byte.  
    char *str = &buf[sizeof (buf) - 1];
    unsigned long l;
    *str = '\0';
    uint8_t neg = 0;
    if (lin < 0) {
        neg = 1;
        l = (unsigned long) (-(lin + 1)) + 1; // avoid UB negating LONG_MIN directly
    } else {
        l = (unsigned long) lin;
    }
    do {
        char c = l % 10;
        l /= 10;
        *--str = c < 10 ? c + '0' : c + 'A' - 10;
    } while (l);
    if (neg) {
        *--str = '-';
    }
    return pfodParser_printStr(str);
}

int pfodParser_println() {
    int rtn = pfodParser_write('\r');
    rtn += pfodParser_write('\n');
	return rtn;
}

void pfodParser_pfodParser(const char *_version) {
    pfodParser_setVersion(_version);
    pfodParser_emptyVersion[0] = 0;
    pfodParserStream_init();
    pfodParser_init();
}

/**
 * Note: this must NOT null the io stream
 */
void pfodParser_init() {
    pfodParser_argsCount = 0;
    pfodParser_argsIdx = 0;
    pfodParser_byteCounter = 0;
    pfodParser_args[0] = 0; // no cmd yet
    pfodParser_args[1] = 0; //
    pfodParser_args[PFOD_PARSER_BUFFER_SIZE] = 0; // terminate buffer
    pfodParser_args[PFOD_PARSER_BUFFER_SIZE + 1] = 0; // terminate buffer
    pfodParser_cmdStart = pfodParser_args; // if no version
    pfodParser_versionStart = pfodParser_emptyVersion; // not used if : not found
    pfodParser_parserState = pfodParser_pfodWaitingForStart; // not started yet pfodInMsg when have seen {
    pfodParser_refresh = 0;
}

void pfodParser_setCmd(uint8_t cmd) {
    pfodParser_init();
    pfodParser_args[0] = cmd;
    pfodParser_args[1] = 0;
    pfodParser_cmdStart = pfodParser_args;
    pfodParser_versionStart = pfodParser_emptyVersion; // leave refresh unchanged
}

/**
 * Return pointer to start of message return start of cmd
 */
uint8_t* pfodParser_getCmd() {
    return pfodParser_cmdStart;
}

/**
 * msg starts with {: the : is dropped from the cmd
 */
uint8_t pfodParser_isRefresh() {
    return pfodParser_refresh;
}

const char* pfodParser_getVersion() {
    return pfodParser_version;
}

void pfodParser_setVersion(const char* _version) {
    pfodParser_version = _version;
}

void pfodParser_sendVersion() {
    pfodParser_printCh('~');
    pfodParser_printStr(pfodParser_getVersion());
}

/**
 * Return pointer to first arg (or pointer to null if no args)
 *
 * Start at args[0] and scan for first null
 * if argsCount > 0 increment to point to  start of first arg
 * else if argsCount == 0 leave pointing to null
 */
uint8_t* pfodParser_getFirstArg() {
    uint8_t* idxPtr = pfodParser_cmdStart;
    while (*idxPtr != 0) {
        ++idxPtr;
    }
    if (pfodParser_argsCount > 0) {
        ++idxPtr;
    }
    return idxPtr;
}

/**
 * Return pointer to next arg or pointer to null if end of args
 * Need to call getFirstArg() first
 * Start at current pointer and scan for first null
 * if scanned over a non empty arg then skip terminating null and return
 * pointer to next arg, else return start if start points to null already
 */
uint8_t* pfodParser_getNextArg(uint8_t *start) {
    uint8_t* idxPtr = start;
    while (*idxPtr != 0) {
        ++idxPtr;
    }
    if (idxPtr != start) {
        ++idxPtr; // skip null
    } // else this was the last arg
    return idxPtr;
}

/**
 * Return number of args in last parsed msg
 */
uint8_t pfodParser_getArgsCount() {
    return pfodParser_argsCount;
}

uint8_t pfodParser_parse_RX() {
    uint8_t rtn = 0;
    while (pfodParser_RXavailable()) {
        int in = pfodParser_read();
        rtn = pfodParser_parseChar((uint8_t) in);
        if (rtn != 0) {
            return rtn;
        }
    }
    return rtn;
}

/**
 * parse
 * NOTE: only PFOD_PARSER_BUFFER_SIZE chars saved by parser (including nulls)
 * set PFOD_PARSER_BUFFER_SIZE in pfodParserStream.h to suit your messages.
 * NOTE: the size of the commands from pfodApp are COMPLETLEY controlled by your micro code pfod menus
 * 
 * Inputs:
 * uint8_t in -- uint8_t read from Serial port
 * Return:
 * return 0 if complete message not found yet
 * else return first char of cmd when see closing }
 * or ignore msg if longer then 255 bytes after { ( { included in count)
 * On non-zero return args[] contains
 * the cmd null terminated followed by the args null terminated
 * argsCount is the number of args
 *
 * parses
 * { cmd | arg1 ` arg2 ... }
 * { cmd ` arg1 ` arg2 ... }
 * { cmd ~ arg1 ~ arg2 ... }
 * save the cmd in args[] replace |, ~ and ` with null (\0)
 * then save arg1,arg2 etc in args[]
 * count of args saved in argCount
 * on seeing } return first char of cmd
 * if no } seen for 255 bytes  after starting { then
 * ignore msg and start looking for { again
 *
 * States:
 * before {   parserState == pfodWaitingForStart
 * when   { seen parserState == pfodInMsg
 */
uint8_t pfodParser_parseChar(uint8_t in) {
    if (in == 0xff) {
        // note 0xFF is not a valid utf-8 char
        // but is returned by underlying stream if start or end of connection
        // NOTE: Stream.read() is wrapped in while(Serial.available()) so should not get this
        // unless explicitlly added to stream buffer
        pfodParser_init(); // clean out last partial msg if any
        return 0;
    }
    if ((pfodParser_parserState == pfodParser_pfodWaitingForStart) || (pfodParser_parserState == pfodParser_pfodMsgEnd)) {
        pfodParser_parserState = pfodParser_pfodWaitingForStart;
        if (in == pfodParser_pfodMsgStarted) { // found {
            pfodParser_init(); // clean out last cmd
            pfodParser_parserState = pfodParser_pfodMsgStarted;
        }
        // else ignore this char as waiting for start {
        // always reset counter if waiting for {
        return 0;
    }

    // else have seen {  // use pfodParser_byteCounter as pfodParser_argsIdx is limited to buffer size
    if ((pfodParser_byteCounter >= (pfodParser_pfodMaxMsgLen - 2)) && //-2 since first { never stored
            (in != pfodParser_pfodMsgEnd)) {
        // ignore this msg and reset
        // should not happen as pfodApp should limit
        // msgs sent to pfodDevice to <=255 uint8_ts
        pfodParser_init();
        return 0;
    }
    // first char after opening {
    if (pfodParser_parserState == pfodParser_pfodMsgStarted) {
        pfodParser_parserState = pfodParser_pfodInMsg;
        if (in == pfodParser_pfodRefresh) {
            // pfodParser_refresh = 1; // disabled to match upstream Arduino pfodParser
            return 0; // skip this uint8_t if get {:
        }
    }
    // else continue. Check for version:
    if ((in == pfodParser_pfodRefresh) && (pfodParser_versionStart != pfodParser_args)) {
        // found first : set version pointer
        if (pfodParser_argsIdx < PFOD_PARSER_BUFFER_SIZE) {
            pfodParser_args[pfodParser_argsIdx++] = 0;
        }
        pfodParser_byteCounter++;
        pfodParser_versionStart = pfodParser_args;
        pfodParser_cmdStart = pfodParser_args + pfodParser_argsIdx; // next uint8_t after :
        pfodParser_refresh = (strcmp((const char*) pfodParser_versionStart, pfodParser_version) == 0);
        return 0;
    }

    // else process this msg char
    // look for special chars | ' } 
    if ((in == pfodParser_pfodMsgEnd) || (in == pfodParser_pfodBar) || (in == pfodParser_pfodTilda) || (in == pfodParser_pfodAccent)) {
        if (pfodParser_argsIdx < PFOD_PARSER_BUFFER_SIZE) {
            pfodParser_args[pfodParser_argsIdx++] = 0;
        }
        pfodParser_byteCounter++;
        if (pfodParser_parserState == pfodParser_pfodArgStarted) {
            // increase count if was parsing arg
            pfodParser_argsCount++;
        }
        if (in == pfodParser_pfodMsgEnd) {
            pfodParser_parserState = pfodParser_pfodMsgEnd; // reset state
            if (pfodParser_argsIdx < PFOD_PARSER_BUFFER_SIZE) {
                pfodParser_args[pfodParser_argsIdx++] = 0;
            }
            pfodParser_byteCounter++;
            // return command uint8_t found
            // this will return 0 when parsing {} msg
            return pfodParser_cmdStart[0];
        } else {
            pfodParser_parserState = pfodParser_pfodArgStarted;
        }
        return 0;
    }
    // else normal uint8_t
    if (pfodParser_argsIdx < PFOD_PARSER_BUFFER_SIZE) {
        pfodParser_args[pfodParser_argsIdx++] = in;
    }
    pfodParser_byteCounter++;
    return 0;
}

/**
 * parseLong
 * will parse between  -2,147,483,648 to 2,147,483,647
 * No error checking done.
 * will return 0 for empty string, i.e. first uint8_t == null
 *
 * Inputs:
 *  idxPtr - uint8_t* pointer to start of uint8_ts to parse
 *  result - long* pointer to where to store result
 * return
 *   uint8_t* updated pointer to uint8_ts after skipping terminator
 *
 */
uint8_t* pfodParser_parseLong(uint8_t* idxPtr, long *result) {
    long rtn = 0;
    uint8_t neg = 0;
    while (*idxPtr != 0) {
        if (*idxPtr == '-') {
            neg = 1;
        } else {
            rtn = (rtn << 3) + (rtn << 1); // *10 = *8+*2
            rtn = rtn + (*idxPtr - '0');
        }
        ++idxPtr;
    }
    if (neg) {
        rtn = -rtn;
    }
    *result = rtn;
    return ++idxPtr; // skip null
}

#ifdef DEBUG_PARSER_MSG
void pfodParser_msgDebug() {
    //==================   test code only ===================
    pfodParser_printStr("\r\nparsed buffer is \r\n");
    for (size_t i = 0; i < PFOD_PARSER_BUFFER_SIZE + 2; i++) {
        pfodParser_printLong(i);
        pfodParser_printCh('=');
        pfodParser_printLong(pfodParser_args[i]);
        pfodParser_printCh(' ');
        pfodParser_printCh((char) pfodParser_args[i]);
        pfodParser_println();
    }
    pfodParser_printStr("================ \r\n");
    pfodParser_printStr("Is Refresh ");
    pfodParser_printStr((pfodParser_isRefresh() ? "true" : "false"));
    pfodParser_println();
    if (pfodParser_isRefresh()) {
        pfodParser_printStr("Requested refresh for ");
        pfodParser_printStr((char*) pfodParser_versionStart);
        pfodParser_println();
    }
    pfodParser_printStr("Cmd:");
    pfodParser_printStr((char*) pfodParser_getCmd());
    pfodParser_println();
    pfodParser_printStr("number of Args:");
    pfodParser_printLong(pfodParser_getArgsCount());
    pfodParser_println();
    // parse result as chars
    uint8_t* idxPtr = pfodParser_getFirstArg();
    pfodParser_printStr(" as chars\r\n");
    while (*idxPtr) {
        pfodParser_printStr((char*) idxPtr);
        pfodParser_println();
        idxPtr = pfodParser_getNextArg(idxPtr);
    }
    // if (cmd == 'n') {
    idxPtr = pfodParser_getFirstArg();
    pfodParser_printStr(" as numbers\r\n");
    // parse args as numbers as well
    long longResult;
    for (int i = 0; i < pfodParser_getArgsCount(); i++) {
        idxPtr = pfodParser_parseLong(idxPtr, &longResult);
        pfodParser_printLong(longResult);
        pfodParser_println();
    }
    //}
    pfodParser_printStr("Finally process cmd and send reply\r\n");
}
#endif /* DEBUG_PARSER_MSG */
