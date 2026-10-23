import {createHash} from 'node:crypto';
import {deviceUrl,secret,digestFetch} from './transport.mjs';
import {actuate} from './adapters.mjs';
import {fingerprint} from './worker.mjs';

export async function* multipartText(body,boundary){
  if(!boundary||boundary.length>100||/[\r\n]/.test(boundary))throw Error('EVENT_BOUNDARY_INVALID');const separator=Buffer.from('--'+boundary);let buffer=Buffer.alloc(0);
  for await(const bytes of body){buffer=Buffer.concat([buffer,Buffer.from(bytes)]);if(buffer.length>2097152)throw Error('EVENT_BUFFER_LIMIT');
    while(true){const start=buffer.indexOf(separator);if(start<0)break;const next=buffer.indexOf(separator,start+separator.length);if(next<0){if(start>0)buffer=buffer.subarray(start);break;}const part=buffer.subarray(start+separator.length,next);buffer=buffer.subarray(next);const split=part.indexOf('\r\n\r\n');if(split<0)continue;const header=part.subarray(0,split).toString('ascii');if(!/content-type:\s*(text\/plain|application\/json)/i.test(header))continue;const content=part.subarray(split+4);if(content.length>65536)throw Error('EVENT_METADATA_LIMIT');yield content.toString('utf8').trim();}
  }
}
export function intelbrasEvent(frame,device,now=Date.now()){
  const code=frame.match(/(?:^|[;\r\n])(?:Code|Events\[0\]\.EventBaseInfo\.Code)=([^;\r\n]+)/)?.[1]?.trim();
  let data={};const json=frame.match(/(?:^|;)data=(\{[\s\S]*\})\s*$/);if(json)try{data=JSON.parse(json[1])}catch{return null}
  const line=key=>frame.split(/\r?\n/).find(s=>s.startsWith(key+'='))?.slice(key.length+1).trim();
  if(code==='TrafficJunction'){
    const plate=String(data.TrafficCar?.PlateNumber||line('Events[0].TrafficCar.PlateNumber')||'').toUpperCase().replace(/[\s-]/g,'');
    const record=data.TrafficCar?.RecNo??line('Events[0].TrafficCar.RecNo');const timestamp=data.UTC??data.RealUTC??line('Events[0].UTC');
    if(!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)||record===undefined||!Number.isFinite(Number(timestamp))||Math.abs(now-Number(timestamp)*1000)>60000)return null;
    return {eventId:'anpr:'+device.id+':'+record+':'+timestamp,method:'plate',identifier:plate,purpose:device.nativeAutomaticOpeningDisabled===true?'authorization-request':'observation'};
  }
  if(code==='AccessControl'){
    const user=String(data.UserID||line('Events[0].UserID')||'');if(!user||user.length>120)return null;
    return {eventId:'audit:'+device.id+':'+createHash('sha256').update(frame).digest('hex'),method:'face',identifier:user,purpose:'observation'};
  }return null;
}
export async function processRecognition(event,source,context){
  const {journal,client,devices,env=process.env,physicalEnabled=false,transport=fetch}=context;const key='recognition:'+event.eventId;
  if(!journal.begin(key,fingerprint(event)))return {duplicate:true};
  try{const decision=await client.post('/v1/gateway/identify',{...event,deviceId:source.id});
    if(event.purpose!=='authorization-request'||!decision.allowed||decision.duplicate){journal.finish(key,{status:'observed'});return {status:'observed'};}
    const target=devices.find(d=>d.id===decision.actuatorId);if(!target||target.gate!==source.gate||decision.gate!==source.gate||decision.deviceId!==source.id)throw Error('ACTUATOR_MAPPING_INVALID');
    const result=await actuate(target,{id:decision.decisionId,deviceId:target.id,provider:target.provider,gate:target.gate,expiresAt:decision.expiresAt},{env,physicalEnabled,transport});journal.finish(key,result);return result;
  }catch{journal.finish(key,{status:'unknown'});return {status:'unknown'};}
}
export async function watchIntelbras(device,context,signal){
  const url=deviceUrl(device,'/cgi-bin/eventManager.cgi');url.searchParams.set('action','attach');url.searchParams.set('codes','[AccessControl,TrafficJunction]');url.searchParams.set('heartbeat','5');
  const response=await digestFetch(url,{method:'GET',signal},{username:secret(device,'usernameEnv',context.env),password:secret(device,'passwordEnv',context.env)},context.transport||fetch);if(!response.ok||!response.body)throw Error('EVENT_STREAM_UNAVAILABLE');const boundary=response.headers.get('content-type')?.match(/boundary\s*=\s*"?([^";\s]+)/i)?.[1];
  for await(const frame of multipartText(response.body,boundary)){const event=intelbrasEvent(frame,device);if(event)await processRecognition(event,device,context);}
}
