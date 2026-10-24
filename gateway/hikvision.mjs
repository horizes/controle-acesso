import {createHash} from 'node:crypto';
import {deviceUrl,secret,digestFetch,boundedText} from './transport.mjs';
import {multipartText,processRecognition,freshEvent,externalFaceActuator} from './streams.mjs';
import {parseDeviceXml,xmlChild,xmlValue} from './xml.mjs';

export function hikvisionEvent(frame,device,now=Date.now()){
 try{
  if(typeof frame!=='string'||Buffer.byteLength(frame)>65536)return null;
  let data;
  if(frame.trimStart().startsWith('{'))data=JSON.parse(frame);else{
   const root=parseDeviceXml(frame);if(root.name!=='EventNotificationAlert')return null;
   data=Object.fromEntries(['eventType','eventState','dateTime','channelID','ipAddress','UUID'].map(k=>[k,xmlValue(root,k)]));
   for(const name of ['ANPR','AccessControllerEvent']){const child=xmlChild(root,name);if(child)data[name]=Object.fromEntries(['licensePlate','UUID','employeeNoString','employeeNo','doorNo','serialNo','majorEventType','subEventType','eventType'].map(k=>[k,xmlValue(child,k)]));}
  }
  if(typeof data.dateTime!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(data.dateTime)||!freshEvent(Date.parse(data.dateTime),now)||data.eventState&&data.eventState!=='active')return null;
  if(device.sourceIp&&data.ipAddress&&data.ipAddress!==device.sourceIp)return null;
  if(device.eventChannel!==undefined&&Number(data.channelID)!==device.eventChannel)return null;
  const stable=(kind,parts)=>'hik-'+kind+':'+createHash('sha256').update(JSON.stringify([device.id,...parts])).digest('hex');
  if(data.eventType==='ANPR'){
   const plate=String(data.ANPR?.licensePlate||'').toUpperCase().replace(/[\s-]/g,'');if(!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate))return null;
   // Ignore upload counters: retransmissions of the same capture keep the ID.
   return {eventId:stable('plate',[data.ANPR?.UUID||data.UUID||'',data.dateTime,data.channelID,plate]),method:'plate',identifier:plate,purpose:device.nativeAutomaticOpeningDisabled===true?'authorization-request':'observation'};
  }
  if(data.eventType==='AccessControllerEvent'){
   const a=data.AccessControllerEvent;if(!a||Number(a.majorEventType)!==5||Number(a.subEventType)!==75)return null;
   const user=String(a.employeeNoString??a.employeeNo??'');if(!user||user==='0'||user.length>120||!/^\d{1,20}$/.test(String(a.serialNo)))return null;
   if(!Number.isSafeInteger(device.channel)||Number(a.doorNo)!==device.channel)return null;
   return {eventId:stable('face',[a.serialNo,data.dateTime,a.doorNo]),method:'face',identifier:user,purpose:externalFaceActuator(device)?'authorization-request':'observation'};
  }
  return null;
 }catch{return null}
}
export async function watchHikvision(device,context,signal){
 const url=deviceUrl(device,'/ISAPI/Event/notification/alertStream');
 const response=await digestFetch(url,{method:'GET',signal},{username:secret(device,'usernameEnv',context.env),password:secret(device,'passwordEnv',context.env)},context.transport||fetch);
 if(!response.ok||!response.body)throw Error('EVENT_STREAM_UNAVAILABLE');const type=response.headers.get('content-type')||'',boundary=type.match(/boundary\s*=\s*"?([^";\s]+)/i)?.[1];
 if(!boundary){await boundedText(response);throw Error('HIKVISION_MULTIPART_REQUIRED');}
 for await(const frame of multipartText(response.body,boundary)){const event=hikvisionEvent(frame,device);if(event)await processRecognition(event,device,context);}
}
