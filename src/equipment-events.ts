import {AccessMethod,AccessSignal} from './access-engine';
export type EquipmentProvider='controlid'|'intelbras'|'hikvision'|'dahua'|'zkteco'|'generic';
export type EquipmentEnvelope={version:1;eventId:string;provider:EquipmentProvider;deviceId:string;sentAt:string;method:AccessMethod;identifier:string;gate:string;purpose:'authorization-request'|'observation'};
export type DeviceConfiguration={deviceId:string;provider:EquipmentProvider;gate:string;method:AccessMethod;mode:'online'|'monitor'};
const providers=new Set(['controlid','intelbras','hikvision','dahua','zkteco','generic']);
// The gateway translates the vendor-specific message into this contract. This
// parser deliberately does not claim native SDK compatibility for every model.
export function normalizeEquipmentEnvelope(raw:unknown,configuration:DeviceConfiguration,now=new Date()):{eventId:string;purpose:EquipmentEnvelope['purpose'];signal:AccessSignal}{
 const e=raw as EquipmentEnvelope;
 if(!e||e.version!==1||!providers.has(e.provider)||!e.eventId||e.eventId.length>180||!e.identifier||e.identifier.length>250)throw Error('Evento de equipamento inválido.');
 if(e.provider!==configuration.provider||e.deviceId!==configuration.deviceId||e.gate!==configuration.gate||e.method!==configuration.method)throw Error('Evento incompatível com o equipamento configurado.');
 if(!['authorization-request','observation'].includes(e.purpose)||e.purpose==='authorization-request'&&configuration.mode!=='online')throw Error('Este equipamento não aceita decisão preventiva neste modo.');
 const sentAt=new Date(e.sentAt).getTime();
 if(!Number.isFinite(sentAt)||Math.abs(now.getTime()-sentAt)>300000)throw Error('Evento fora da janela de recebimento.');
 if(!['face','plate','code'].includes(e.method))throw Error('Método de identificação não suportado.');
 // Authorization always uses server time, never the time supplied by a reader.
 return {eventId:e.eventId,purpose:e.purpose,signal:{method:e.method,value:e.identifier.trim(),gate:configuration.gate}};
}
export async function verifyEquipmentSignature(payload:string,signatureHex:string,secret:string):Promise<boolean>{
 if(secret.length<32||!/^[0-9a-f]{64}$/i.test(signatureHex))return false;
 const bytes=new Uint8Array(signatureHex.match(/../g)!.map(s=>parseInt(s,16)));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(payload));
}
// Observer for the documented Control iD Monitor access_photo payload.
// It is telemetry after an identification event, not an online release callback.
export function normalizeControlIdMonitor(raw:unknown,configuration:DeviceConfiguration,identifierMap:Record<string,string>):{kind:'observation';identification:AccessSignal}{
 const e=raw as Record<string,unknown>;
 if(configuration.provider!=='controlid'||!e||String(e.device_id)!==configuration.deviceId)throw Error('Monitor de equipamento não configurado.');
 const user=String(e.user_id??'');
 if(!user||user==='0'||!identifierMap[user])throw Error('Identificador de usuário não vinculado.');
 return {kind:'observation',identification:{method:configuration.method,value:identifierMap[user],gate:configuration.gate}};
}
