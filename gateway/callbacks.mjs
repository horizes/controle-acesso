import {controlIdAction} from './adapters.mjs';
import {fingerprint} from './worker.mjs';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {secret} from './transport.mjs';
import {hikvisionEvent} from './hikvision.mjs';
import {processRecognition,multipartText,freshEvent,externalFaceActuator} from './streams.mjs';
const reject=(message='Acesso negado.')=>({result:{event:6,actions:[],message,user_image:false}});
export async function controlIdCallback(device,form,context){
  const {client,journal,physicalEnabled=false}=context;
  if(!physicalEnabled||!device.enabled||!device.commissioned||device.protocol!=='controlid-online')return reject('Integração não habilitada.');
  if(String(form.device_id)!==String(device.vendorDeviceId)||String(form.portal_id)!==String(device.portalId)||String(form.duress||'0')==='1')return reject();
  if(!Array.isArray(device.faceIdentifierIds)||!device.faceIdentifierIds.map(String).includes(String(form.identifier_id)))return reject('Mecanismo facial não homologado.');
  if(!form.uuid||String(form.uuid).length>150||!/^\d+$/.test(String(form.user_id))||!Number.isSafeInteger(Number(form.user_id))||Number(form.user_id)===0)return reject('Identificação inválida.');
  if(!freshEvent(Number(form.time)*1000))return reject('Confira o relógio do leitor.');
  const key='cid:'+device.id+':'+form.uuid,hash=fingerprint({user:form.user_id,portal:form.portal_id,time:form.time});if(!journal.begin(key,hash))return reject('Evento já recebido.');
  try{
    const decision=await client.post('/v1/gateway/identify',{eventId:key,deviceId:device.id,method:'face',identifier:String(form.user_id),purpose:'authorization-request'});
    if(!decision.allowed||decision.duplicate||decision.actuatorId!==device.id||decision.deviceId!==device.id||decision.gate!==device.gate||Date.parse(decision.expiresAt)-Date.now()<750){journal.finish(key,{status:'rejected'});return reject(decision.reason||'Autorização indisponível.');}
    if(!journal.claimGate(device.gate,device.actuationCooldownMs||5000)){journal.finish(key,{status:'rejected',vendorCode:'GATE_COOLDOWN'});return reject('Aguarde a conclusão da passagem anterior.');}
    const result={result:{event:7,user_id:Number(form.user_id),user_name:String(decision.userName||'Usuário autorizado').slice(0,100),user_image:false,portal_id:device.portalId,actions:[controlIdAction(device,1)]}};
    // This records the authorization response, not a physical sensor state.
    journal.finish(key,{status:'authorization-issued',physicalState:'unknown'});return result;
  }catch{journal.finish(key,{status:'unknown'});return reject('Servidor de autorização indisponível.');}
}
export function signedRecognition(device,raw,signature,env=process.env,now=Date.now()){
 try{const key=secret(device,'eventSecretEnv',env);if(key.length<32)return null;const expected=createHmac('sha256',key).update('POST\n/callbacks/'+device.id+'/recognition\n'+raw).digest('hex');if(!/^[0-9a-f]{64}$/i.test(signature)||!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(expected,'hex')))return null;
 const d=JSON.parse(raw);if(!d||Object.keys(d).sort().join(',')!=='eventId,identifier,method,occurredAt'||!['face','plate'].includes(d.method)||typeof d.eventId!=='string'||!/^[-a-zA-Z0-9_:]{1,120}$/.test(d.eventId)||typeof d.identifier!=='string'||!d.identifier||d.identifier.length>120||!freshEvent(Date.parse(d.occurredAt),now))return null;
 if(d.method==='plate'&&!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(d.identifier))return null;
 return {eventId:'bridge:'+fingerprint([device.id,d.eventId]),method:d.method,identifier:d.identifier,purpose:(d.method==='face'?externalFaceActuator(device):device.nativeAutomaticOpeningDisabled===true)?'authorization-request':'observation'};
 }catch{return null}
}

export function callbackHandler(context){return async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  const send=(status,body)=>{res.writeHead(status);res.end(JSON.stringify(body))};
  try{
    const url=new URL(req.url,'http://gateway.local');const match=url.pathname.match(/^\/callbacks\/([a-z0-9_-]+)\/(new_user_identified\.fcgi|device_is_alive\.fcgi|session_is_valid\.fcgi|events|recognition)$/);if(req.method!=='POST'||!match)return send(404,reject());
    const device=context.devices.find(d=>d.id===match[1]);const peer=String(req.socket.remoteAddress||'').replace(/^::ffff:/,'');if(!device||peer!==device.sourceIp)return send(403,reject());
    if(match[2]==='events'){
     if(device.provider!=='hikvision'||device.protocol!=='hikvision-isapi')return send(403,reject());
     const type=String(req.headers['content-type']||''),boundary=type.match(/boundary\s*=\s*"?([^";\s]+)/i)?.[1];let count=0;
     if(boundary){for await(const frame of multipartText(req,boundary)){const event=hikvisionEvent(frame,device);if(event){await processRecognition(event,device,context);count++}}}
     else{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>65536)return send(413,reject());chunks.push(chunk)}if(!/^(?:application\/(?:json|xml)|text\/xml)/i.test(type))return send(415,reject());const event=hikvisionEvent(Buffer.concat(chunks).toString('utf8'),device);if(event){await processRecognition(event,device,context);count++}}
     return send(200,{received:count});
    }
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16384)return send(413,reject());chunks.push(chunk)}const raw=Buffer.concat(chunks).toString('utf8');
    if(match[2]==='recognition'){if(device.protocol!=='signed-events'||!String(req.headers['content-type']||'').startsWith('application/json'))return send(415,reject());const event=signedRecognition(device,raw,String(req.headers['x-imperium-signature']||''),context.env);if(!event)return send(403,reject());return send(200,await processRecognition(event,device,context));}
    if(device.protocol!=='controlid-online')return send(403,reject());
    if(['device_is_alive.fcgi','session_is_valid.fcgi'].includes(match[2])){const available=context.physicalEnabled&&device.enabled&&device.commissioned&&context.lastAuthorityContact&&Date.now()-context.lastAuthorityContact<10000;if(!available)return send(503,{session_is_valid:false});return send(200,match[2]==='session_is_valid.fcgi'?{session_is_valid:true}:{});}
    if(!String(req.headers['content-type']||'').startsWith('application/x-www-form-urlencoded'))return send(415,reject());const form=Object.fromEntries(new URLSearchParams(raw));return send(200,await controlIdCallback(device,form,context));
  }catch{return send(200,reject('Acesso indisponível.'));}
}}
