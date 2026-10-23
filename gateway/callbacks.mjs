import {controlIdAction} from './adapters.mjs';
import {fingerprint} from './worker.mjs';
const reject=(message='Acesso negado.')=>({result:{event:6,actions:[],message,user_image:false}});
export async function controlIdCallback(device,form,context){
  const {client,journal,physicalEnabled=false}=context;
  if(!physicalEnabled||!device.enabled||!device.commissioned||device.protocol!=='controlid-online')return reject('Integração não habilitada.');
  if(String(form.device_id)!==String(device.vendorDeviceId)||String(form.portal_id)!==String(device.portalId)||String(form.duress||'0')==='1')return reject();
  if(!form.uuid||String(form.uuid).length>150||!/^\d+$/.test(String(form.user_id))||!Number.isSafeInteger(Number(form.user_id))||Number(form.user_id)===0)return reject('Identificação inválida.');
  if(!Number.isFinite(Number(form.time))||Math.abs(Date.now()-Number(form.time)*1000)>60000)return reject('Confira o relógio do leitor.');
  const key='cid:'+device.id+':'+form.uuid,hash=fingerprint({user:form.user_id,portal:form.portal_id,time:form.time});if(!journal.begin(key,hash))return reject('Evento já recebido.');
  try{
    const decision=await client.post('/v1/gateway/identify',{eventId:key,deviceId:device.id,method:'face',identifier:String(form.user_id),purpose:'authorization-request'});
    if(!decision.allowed||decision.duplicate||decision.actuatorId!==device.id||decision.deviceId!==device.id||decision.gate!==device.gate||Date.parse(decision.expiresAt)-Date.now()<750){journal.finish(key,{status:'rejected'});return reject(decision.reason||'Autorização indisponível.');}
    const result={result:{event:7,user_id:Number(form.user_id),user_name:String(decision.userName||'Usuário autorizado').slice(0,100),user_image:false,portal_id:device.portalId,actions:[controlIdAction(device,1)]}};
    // This records the authorization response, not a physical sensor state.
    journal.finish(key,{status:'authorization-issued',physicalState:'unknown'});return result;
  }catch{journal.finish(key,{status:'unknown'});return reject('Servidor de autorização indisponível.');}
}

export function callbackHandler(context){return async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  const send=(status,body)=>{res.writeHead(status);res.end(JSON.stringify(body))};
  try{
    const url=new URL(req.url,'http://gateway.local');const match=url.pathname.match(/^\/callbacks\/([a-z0-9_-]+)\/(new_user_identified\.fcgi|device_is_alive\.fcgi)$/);if(req.method!=='POST'||!match)return send(404,reject());
    const device=context.devices.find(d=>d.id===match[1]);const peer=String(req.socket.remoteAddress||'').replace(/^::ffff:/,'');if(!device||peer!==device.sourceIp)return send(403,reject());
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16384){req.destroy();return}chunks.push(chunk)}const raw=Buffer.concat(chunks).toString('utf8');
    if(match[2]==='device_is_alive.fcgi'){if(!context.physicalEnabled||!device.enabled||!device.commissioned)return send(503,reject());return send(200,{});}
    if(!String(req.headers['content-type']||'').startsWith('application/x-www-form-urlencoded'))return send(415,reject());const form=Object.fromEntries(new URLSearchParams(raw));return send(200,await controlIdCallback(device,form,context));
  }catch{return send(200,reject('Acesso indisponível.'));}
}}
