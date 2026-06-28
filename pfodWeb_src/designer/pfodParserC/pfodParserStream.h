/* 
 * File:   pfodParserStream.h
 * Author: matthew
 *
 * Created on 25 July 2016, 6:44 AM
 */

#ifndef PFODPARSERSTREAM_H
#define	PFODPARSERSTREAM_H

#include <stddef.h>
#include <stdint.h>


#ifdef	__cplusplus
extern "C" {
#endif

    void pfodParserStream_init(void); // to do any Stream/UART setup required, called from pfodParser_pfodParser() 
    
    size_t pfodParser_RXavailable(void); // return bytes available for read()
    int pfodParser_read(void);  // read an input byte from rx buffer. Note: spins if none available
    size_t pfodParser_TXfree(void); // return space available for write();
    int pfodParser_write(uint8_t c); // write to tx buffer. Note: spins if no space to write
    

#ifdef	__cplusplus
}
#endif

#endif	/* PFODPARSERSTREAM_H */

