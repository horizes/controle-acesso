import {deviceUrl,secret,digestFetch,boundedText} from './transport.mjs';
import {parseDeviceXml,xmlValue} from './xml.mjs';
import {externalFaceActuator} from './streams.mjs';

export function configurationIssues(device,devices){
 const issues=[];
 if(!device.model||!device.firmware)issues.push('Registrar modelo e firmware reais.');
 if(!device.enabled||!device.commissioned)issues.push('Equipamento permanece desabilitado ou sem aceite físico.');
 if(device.recognitionMode==='external-actuator'&&!externalFaceActuator(device))issues.push('Reconhecimento facial exige relé isolado, abertura nativa desativada e controladora diferente.');
 if(device.actuatorId){const target=devices.find(d=>d.id===device.actuatorId);if(!target||target.gate!==device.gate||target.id===device.id)issues.push('Controladora vinculada deve ser diferente e pertencer ao mesmo acesso.');}
 if((device.watchEvents||device.eventTransport==='push'||device.protocol==='signed-events')&&device.nativeAutomaticOpeningDisabled!==true)issues.push('Eventos permanecem em auditoria até comprovar abertura nativa desativada.');
 if(device.protocol==='controlid-online'&&(!Array.isArray(device.faceIdentifierIds)||!device.faceIdentifierIds.length))issues.push('Informar identifier_id facial confirmado no aparelho.');
 if(['licensed-bridge','hcnetsdk'].includes(device.protocol))issues.push('Pacote/licença e helper oficial precisam ser conferidos separadamente.');
 return issues;
}
// All paths are read-only. No openDoor, relay, setConfig or enrollment is sent.
export async function inspectDevice(device,{env=process.env,transport=fetch}={}){
 const signal=()=>AbortSignal.timeout(4000),credentials=()=>({username:secret(device,'usernameEnv',env),password:secret(device,'passwordEnv',env)});
 const get=async(path)=>{let authenticated=false;const r=await digestFetch(deviceUrl(device,path),{method:'GET',signal:signal()},credentials(),async(url,options)=>{const response=await transport(url,options);if(options.headers?.Authorization?.startsWith('Digest ')&&response.ok)authenticated=true;return response});if(!r.ok||!authenticated){await r.body?.cancel();throw Error('DIGEST_AUTH_NOT_VERIFIED')}return boundedText(r)};
 try{
  if(device.provider==='hikvision'&&device.protocol==='hikvision-isapi'){
   const info=parseDeviceXml(await get('/ISAPI/System/deviceInfo')),model=xmlValue(info,'model'),firmware=xmlValue(info,'firmwareVersion');if(info.name!=='DeviceInfo'||!model||!firmware)throw Error('DEVICE_IDENTITY_INVALID');
   let remoteDoor='not-checked';if(!device.watchEvents&&!device.eventTransport){const caps=await get('/ISAPI/AccessControl/RemoteControl/door/capabilities');if(parseDeviceXml(caps).name!=='RemoteControlDoor')throw Error('CAPABILITY_RESPONSE_INVALID');remoteDoor=/\bopen\b/.test(caps)?'advertised':'not-advertised'}
   return {reachable:true,authenticated:true,reportedModel:model?.slice(0,100),reportedFirmware:firmware?.slice(0,100),remoteDoor,events:'require-live-event-test',physicalValidation:'pending'};
  }
  if(['intelbras','dahua'].includes(device.provider)&&['http-cgi','http-events','dahua-cgi','dahua-events'].includes(device.protocol)){
   const text=await get(device.watchEvents?'/cgi-bin/eventManager.cgi?action=getCaps':'/cgi-bin/accessControlManager.cgi?action=getCaps');
   if(!/^(?:caps|table)\./m.test(text))throw Error('CAPABILITY_RESPONSE_INVALID');return {reachable:true,authenticated:true,protocol:'cgi',remoteDoor:device.watchEvents?'not-checked':'capability-response',events:'require-live-event-test',physicalValidation:'pending'};
  }
  if(device.protocol==='controlid-online'){
   const response=await transport(deviceUrl(device,'/login.fcgi'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:secret(device,'usernameEnv',env),password:secret(device,'passwordEnv',env)}),redirect:'error',signal:signal()}),raw=await boundedText(response),d=JSON.parse(raw);if(!response.ok||typeof d.session!=='string'||d.session.length<5)throw Error('LOGIN_REJECTED');
   const url=deviceUrl(device,'/logout.fcgi');url.searchParams.set('session',d.session);try{const r=await transport(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',redirect:'error',signal:signal()});await r.body?.cancel()}catch{}
   return {reachable:true,authenticated:true,protocol:'controlid-online',events:'require-callback-and-identifier-test',physicalValidation:'pending'};
  }
  if(device.protocol==='zkbio-cvsecurity'){
   const url=deviceUrl(device,'/api/door/list');url.searchParams.set('pageNo','1');url.searchParams.set('pageSize','1');url.searchParams.set('access_token',secret(device,'tokenEnv',env));const r=await transport(url,{method:'GET',redirect:'error',signal:signal()}),d=JSON.parse(await boundedText(r));if(!r.ok||d.code!==0)throw Error('LICENSE_OR_AUTH_REJECTED');return {reachable:true,authenticated:true,protocol:'zkbio-cvsecurity',recognition:'audit-or-approved-sdk-bridge-required',physicalValidation:'pending'};
  }
  return {reachable:null,authenticated:null,reason:'Revisão do conector/SDK necessária; nenhuma chamada foi enviada.',physicalValidation:'pending'};
 }catch{return {reachable:false,authenticated:false,reason:'Não foi possível comprovar comunicação e protocolo. Conferir rede, TLS, credencial e contrato do modelo.',physicalValidation:'pending'}}
}
