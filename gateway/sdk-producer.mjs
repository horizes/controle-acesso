import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import {boundedText} from './transport.mjs';

// Call only after an approved vendor SDK reports a verified face/plate match.
// This library does not perform biometric recognition or trust browser input.
export async function sendVerifiedRecognition({callbackBase,deviceId,key,eventId,method,identifier,occurredAt},transport=fetch){
 const base=new URL(callbackBase),ip=base.hostname;
 if(base.username||base.password||base.search||base.hash||!['http:','https:'].includes(base.protocol)||isIP(ip)!==4||!(/^(10\.|127\.|192\.168\.)/.test(ip)||/^172\.(1[6-9]|2\d|3[01])\./.test(ip))||!/^[-a-z0-9_]{1,60}$/.test(deviceId)||typeof key!=='string'||key.length<32)throw Error('SDK_PRODUCER_CONFIGURATION_INVALID');
 if(typeof eventId!=='string'||!/^[-a-zA-Z0-9_:]{1,120}$/.test(eventId)||!['face','plate'].includes(method)||typeof identifier!=='string'||!identifier||identifier.length>120||!Number.isFinite(Date.parse(occurredAt)))throw Error('SDK_RECOGNITION_INVALID');
 const path='/callbacks/'+deviceId+'/recognition',body=JSON.stringify({eventId,method,identifier,occurredAt}),signature=createHmac('sha256',key).update('POST\n'+path+'\n'+body).digest('hex');
 // No retries: the SDK must preserve eventId if a transport reconnect occurs.
 const response=await transport(new URL(path,base.origin),{method:'POST',headers:{'Content-Type':'application/json','X-Imperium-Signature':signature},body,redirect:'error',signal:AbortSignal.timeout(4500)});
 if(!response.ok){await response.body?.cancel();throw Error('SDK_CALLBACK_REJECTED');}return JSON.parse(await boundedText(response));
}
