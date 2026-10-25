// Bound the complete database HTTP operation, including reading the body.
async function requestJson(url, options, {fetcher=fetch,totalMs=10000,attemptMs=3000,attempts=3,backoffMs=300}={}) {
    const deadline=Date.now()+totalMs;
    let last;
    for(let attempt=0;attempt<attempts;attempt++) {
        const remaining=deadline-Date.now();if(remaining<=0)break;
        const controller=new AbortController();let timer;
        try {
            return await Promise.race([
                (async()=>{
                    const response=await fetcher(url,{...options,signal:controller.signal});
                    if(response.ok)return options.method==='GET'&&response.status!==204?await response.json():null;
                    const detail=await response.text();
                    throw Object.assign(new Error(`Shared database HTTP ${response.status}: ${detail.slice(0,500)}`),{nonRetryable:response.status<500&&response.status!==429});
                })(),
                new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Object.assign(new Error('Shared database request deadline exceeded'),{code:'STATE_HTTP_TIMEOUT'}));},Math.min(attemptMs,remaining));})
            ]);
        } catch(error) {last=error;if(error.nonRetryable)throw error;}
        finally {clearTimeout(timer);controller.abort();}
        if(attempt+1<attempts){const delay=Math.min(backoffMs*(attempt+1),Math.max(0,deadline-Date.now()));if(delay)await new Promise(resolve=>setTimeout(resolve,delay));}
    }
    throw last||new Error('Shared database request deadline exceeded');
}
function assertPersisted(enabled,pending) {
    if(enabled&&pending)throw Object.assign(new Error('Booking save is not confirmed by the shared database; check status before retrying'),{code:'BOOKING_SAVE_UNCONFIRMED'});
}
async function confirmBooking(flush, enabled, pending, timeoutMs=25000) {
    let timer;
    try {
        await Promise.race([flush(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('Booking persistence acknowledgement timed out; check status before retrying'),{code:'BOOKING_SAVE_UNCONFIRMED'})),timeoutMs);})]);
        assertPersisted(enabled(),pending());
    } finally {clearTimeout(timer);}
}
module.exports={requestJson,assertPersisted,confirmBooking};
