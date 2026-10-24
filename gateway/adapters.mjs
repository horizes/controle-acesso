import {spawn} from 'node:child_process';
import {deviceUrl,secret,beforeActuation,boundedText,digestFetch} from './transport.mjs';
import {parseDeviceXml,xmlValue} from './xml.mjs';
export const outcome=(status,vendorCode='')=>({status,physicalState:'unknown',vendorCode});

export function controlIdAction(device,reason=3){
  if(device.action==='door'&&Number.isSafeInteger(device.door)&&device.door>=1&&device.door<=64)return {action:'door',parameters:'door='+device.door};
  if(device.action==='sec_box'&&/^\d{1,20}$/.test(String(device.secBoxId)))return {action:'sec_box',parameters:'id='+device.secBoxId+', reason='+reason};
  if(device.action==='catra'&&['clockwise','anticlockwise','both'].includes(device.direction))return {action:'catra',parameters:'allow='+device.direction};
  throw Error('CONTROLID_ACTION_NOT_CONFIGURED');
}
async function controlIdLogin(device,env,transport){const url=deviceUrl(device,'/login.fcgi');const response=await transport(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:secret(device,'usernameEnv',env),password:secret(device,'passwordEnv',env)}),redirect:'error',signal:AbortSignal.timeout(3000)});if(!response.ok)throw Error('CONTROLID_LOGIN_FAILED');const data=JSON.parse(await boundedText(response));if(typeof data.session!=='string'||data.session.length<5||data.session.length>250)throw Error('CONTROLID_SESSION_INVALID');return data.session;}
export async function openControlId(device,command,env=process.env,transport=fetch){
  const action=controlIdAction(device),session=await controlIdLogin(device,env,transport),url=deviceUrl(device,'/execute_actions.fcgi');url.searchParams.set('session',session);
  const timeout=beforeActuation(command.expiresAt);let response;
  try{response=await transport(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actions:[action]}),redirect:'error',signal:AbortSignal.timeout(timeout)});const raw=await boundedText(response);if(!response.ok)return outcome('unknown','HTTP_'+response.status);if(raw){let data;try{data=JSON.parse(raw)}catch{return outcome('unknown','INVALID_RESPONSE')}if(data.error)return outcome('rejected','VENDOR_REJECTED');if(data.actions?.some(a=>a.status==='denied'))return outcome('rejected','INTERLOCK_DENIED');}return outcome('accepted','CONTROLID_ACCEPTED');}catch{return outcome('unknown','COMMAND_RESPONSE_UNCERTAIN');}
}
export async function openIntelbras(device,command,env=process.env,transport=fetch){
  if(!Number.isInteger(device.channel)||device.channel<1||device.channel>64)throw Error('INTELBRAS_CHANNEL_INVALID');const url=deviceUrl(device,'/cgi-bin/accessControl.cgi');url.searchParams.set('action','openDoor');url.searchParams.set('channel',String(device.channel));url.searchParams.set('Type','Remote');
  const credentials={username:secret(device,'usernameEnv',env),password:secret(device,'passwordEnv',env)};
  try{const response=await digestFetch(url,{method:'GET',signal:AbortSignal.timeout(beforeActuation(command.expiresAt))},credentials,transport),raw=(await boundedText(response)).trim();if(response.ok&&raw==='OK')return outcome('accepted',device.provider==='dahua'?'DAHUA_CGI_OK':'INTELBRAS_OK');if(response.ok&&/^Error/i.test(raw))return outcome('rejected','VENDOR_REJECTED');return outcome('unknown','HTTP_'+response.status);}catch{return outcome('unknown','COMMAND_RESPONSE_UNCERTAIN');}
}
export async function openHikvisionIsapi(device,command,env=process.env,transport=fetch){
  if(!Number.isInteger(device.channel)||device.channel<1||device.channel>64)throw Error('HIKVISION_CHANNEL_INVALID');
  const url=deviceUrl(device,'/ISAPI/AccessControl/RemoteControl/door/'+device.channel),credentials={username:secret(device,'usernameEnv',env),password:secret(device,'passwordEnv',env)};
  const body='<?xml version="1.0" encoding="UTF-8"?><RemoteControlDoor version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><cmd>open</cmd></RemoteControlDoor>';
  try{const response=await digestFetch(url,{method:'PUT',headers:{'Content-Type':'application/xml'},body,signal:AbortSignal.timeout(beforeActuation(command.expiresAt))},credentials,transport),raw=await boundedText(response);
    if(!response.ok)return outcome(response.status===401||response.status===403?'rejected':'unknown','HTTP_'+response.status);
    const xml=parseDeviceXml(raw);if(xml.name!=='ResponseStatus')return outcome('unknown','INVALID_RESPONSE');const code=xmlValue(xml,'statusCode');
    return code==='1'?outcome('accepted','HIKVISION_ISAPI_OK'):code?outcome('rejected','HIKVISION_STATUS_'+code.replace(/[^0-9]/g,'').slice(0,6)):outcome('unknown','INVALID_RESPONSE');
  }catch{return outcome('unknown','COMMAND_RESPONSE_UNCERTAIN')}
}
export async function openZkBio(device,command,env=process.env,transport=fetch){
  if(!device.doorId||!Number.isInteger(device.interval)||device.interval<1||device.interval>254)throw Error('ZKBIO_DOOR_NOT_CONFIGURED');const url=deviceUrl(device,'/api/door/remoteOpenById');url.searchParams.set('doorId',String(device.doorId));url.searchParams.set('interval',String(device.interval));url.searchParams.set('access_token',secret(device,'tokenEnv',env));
  try{const response=await transport(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(beforeActuation(command.expiresAt))});if(!response.ok)return outcome('unknown','HTTP_'+response.status);const data=JSON.parse(await boundedText(response));if(data.code===0)return outcome('accepted','ZKBIO_0');if(Number.isInteger(data.code))return outcome('rejected','ZKBIO_'+data.code);return outcome('unknown','INVALID_RESPONSE');}catch{return outcome('unknown','COMMAND_RESPONSE_UNCERTAIN');}
}
export async function openSdkBridge(device,command,env=process.env){
  if(!Array.isArray(device.helperCommand)||!device.helperCommand.length||device.helperCommand.some(s=>typeof s!=='string'||s.includes('\0')))throw Error('SDK_HELPER_NOT_CONFIGURED');
  const fields=[device.host,String(device.sdkPort||8000),secret(device,'usernameEnv',env),secret(device,'passwordEnv',env),String(device.channel||1)];if(fields.some(v=>typeof v!=='string'||/[\r\n\0]/.test(v)||v.length>250))throw Error('SDK_PARAMETERS_INVALID');
  const timeout=beforeActuation(command.expiresAt);
  return new Promise(resolve=>{const child=spawn(device.helperCommand[0],device.helperCommand.slice(1),{shell:false,windowsHide:true,stdio:['pipe','pipe','ignore'],env:{PATH:env.PATH||'',SystemRoot:env.SystemRoot||'',LD_LIBRARY_PATH:env.LD_LIBRARY_PATH||''}});let output='',settled=false;const finish=result=>{if(settled)return;settled=true;clearTimeout(timer);resolve(result)};const timer=setTimeout(()=>{child.kill();finish(outcome('unknown','SDK_TIMEOUT'))},timeout);child.stdout.on('data',chunk=>{output+=chunk;if(output.length>4096){child.kill();finish(outcome('unknown','SDK_OUTPUT_INVALID'))}});child.on('error',()=>finish(outcome('rejected','SDK_NOT_AVAILABLE')));child.on('close',()=>{try{const r=JSON.parse(output);finish(r.accepted===true?outcome('accepted','SDK_ACCEPTED'):outcome('unknown','SDK_'+String(r.errorCode||'UNKNOWN').replace(/[^0-9A-Z_-]/g,'').slice(0,40)))}catch{finish(outcome('unknown','SDK_OUTPUT_INVALID'))}});child.stdin.on('error',()=>{});child.stdin.end(fields.join('\n')+'\n');});
}
export async function openLicensedBridge(device,command,env=process.env,transport=fetch){
  if(!device.licensedBridgeReady)throw Error('LICENSED_VENDOR_PACKAGE_REQUIRED');const url=deviceUrl(device,'/v1/open');
  try{const response=await transport(url,{method:'POST',headers:{Authorization:'Bearer '+secret(device,'tokenEnv',env),'Content-Type':'application/json'},body:JSON.stringify({commandId:command.id,doorId:device.doorId,expiresAt:command.expiresAt}),redirect:'error',signal:AbortSignal.timeout(beforeActuation(command.expiresAt))});const data=JSON.parse(await boundedText(response));return response.ok&&data.accepted===true?outcome('accepted','LICENSED_BRIDGE_ACCEPTED'):outcome('unknown','LICENSED_BRIDGE_UNCERTAIN');}catch{return outcome('unknown','COMMAND_RESPONSE_UNCERTAIN');}
}
export async function actuate(device,command,{env=process.env,transport=fetch,physicalEnabled=false}={}){
  if(!physicalEnabled||!device.enabled||!device.commissioned)return outcome('rejected','PHYSICAL_ACTUATION_DISABLED');if(device.id!==command.deviceId||device.gate!==command.gate||device.provider!==command.provider)return outcome('rejected','DEVICE_MAPPING_MISMATCH');
  beforeActuation(command.expiresAt);
  if(device.provider==='controlid')return openControlId(device,command,env,transport);
  if(device.provider==='intelbras'&&device.protocol==='http-cgi')return openIntelbras(device,command,env,transport);
  if(device.provider==='dahua'&&device.protocol==='dahua-cgi')return openIntelbras(device,command,env,transport);
  if(device.provider==='zkteco'&&device.protocol==='zkbio-cvsecurity')return openZkBio(device,command,env,transport);
  if(device.provider==='hikvision'&&device.protocol==='hcnetsdk')return openSdkBridge(device,command,env);
  if(device.provider==='hikvision'&&device.protocol==='hikvision-isapi')return openHikvisionIsapi(device,command,env,transport);
  if(['dahua','generic'].includes(device.provider)&&device.protocol==='licensed-bridge')return openLicensedBridge(device,command,env,transport);
  return outcome('rejected','MODEL_PROTOCOL_NOT_SUPPORTED');
}
