import type {AccessRole, AccessSession} from './access-session';
import {DemoState, isDemoState} from './demo-model';

export type RuntimeConfig = {apiBaseUrl?:string; operationalApiBaseUrl?:string; requestTimeoutMs?:number; refreshIntervalMs?:number;localMode?:boolean};
export type ApiCommand = {type:string;payload:Record<string,unknown>;requestId:string};
export type DirectoryPerson = {name:string;unit:string;initials:string};
export type ConnectedState = DemoState & {residents:DirectoryPerson[];condominiumName?:string};
declare global {interface Window {IMPERIUM_CONFIG?:RuntimeConfig}}

export function normalizeApiUrl(value:string):string {
  const url=new URL(value);
  const loopback=url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if(url.protocol!=='https:'&&!loopback||url.username||url.password||url.search||url.hash)throw Error('A API deve usar HTTPS. HTTP é permitido apenas no próprio computador.');
  return url.href.replace(/\/$/,'');
}
export function createConfiguredApi():CondominiumApi|null {
  if(typeof window==='undefined')return null;
  const config=window.IMPERIUM_CONFIG,operational=new URLSearchParams(window.location.search).get('ambiente')==='operacao';
  const base=operational?config?.operationalApiBaseUrl:config?.apiBaseUrl;
  if(!base?.trim()){if(operational)throw Error('O endereço do ambiente operacional não está configurado.');return null;}
  return new CondominiumApi({...config,apiBaseUrl:base});
}

// This client only talks to the condominium backend. It never calls a reader,
// controller, camera, or manufacturer endpoint from the public browser.
export class CondominiumApi {
  readonly baseUrl:string;
  private token='';
  private timeout:number;
  readonly refreshInterval:number;
  constructor(config:RuntimeConfig,private transport:typeof fetch=fetch){
    this.baseUrl=normalizeApiUrl(config.apiBaseUrl||'');
    this.timeout=Math.min(30000,Math.max(3000,config.requestTimeoutMs||10000));
    this.refreshInterval=Math.min(60000,Math.max(5000,config.refreshIntervalMs||15000));
  }
  private async request(path:string,method='GET',body?:unknown){
    const response=await this.transport(this.baseUrl+path,{method,headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...(this.token?{Authorization:'Bearer '+this.token}:{})},body:body?JSON.stringify(body):undefined,credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(this.timeout)});
    if(response.status===401){this.token='';throw Error('Sua sessão terminou. Entre novamente.');}
    if(!response.ok)throw Error(response.status===403?'Este acesso não tem permissão para a operação.':response.status===409?'O registro foi atualizado. Confira os dados e tente novamente.':'A API não concluiu a operação. Tente novamente.');
    return response.status===204?null:response.json();
  }
  async login(role:AccessRole,email:string,password:string):Promise<AccessSession>{
    this.token='';
    const data=await this.request('/v1/auth/login','POST',{role,email:email.trim().toLowerCase(),password});
    const user=data?.user;
    if(typeof data?.accessToken!=='string'||data.accessToken.length<16||!user||user.role!==role||typeof user.name!=='string'||typeof user.email!=='string'||!Number.isFinite(Date.parse(data.expiresAt))||Date.parse(data.expiresAt)<=Date.now()||(role==='resident'&&typeof user.unit!=='string'))throw Error('A API retornou uma sessão inválida.');
    this.token=data.accessToken;
    return {mode:'api',role,name:user.name,email:user.email,unit:user.unit,expiresAt:Date.parse(data.expiresAt),capabilities:{admin:user.capabilities?.admin===true,manualRelease:user.capabilities?.manualRelease===true}};
  }
  async state():Promise<ConnectedState>{
    const data=await this.request('/v1/state');
    if(!isDemoState(data)||!Array.isArray((data as ConnectedState).residents)||!(data as ConnectedState).residents.every((r:DirectoryPerson)=>typeof r.name==='string'&&typeof r.unit==='string'&&typeof r.initials==='string'))throw Error('A API retornou dados fora do contrato.');
    return data as ConnectedState;
  }
  async command(command:ApiCommand):Promise<ConnectedState>{
    const data=await this.request('/v1/commands','POST',command);
    if(!isDemoState(data)||!Array.isArray((data as ConnectedState).residents))throw Error('A API retornou dados fora do contrato.');
    return data as ConnectedState;
  }
  async logout(){try{if(this.token)await this.request('/v1/auth/logout','POST',{});}finally{this.token='';}}
  clearSession(){this.token='';}
  async integrations():Promise<IntegrationState>{return this.request('/v1/integrations')}
  async release(deviceId:string,reason:string){return this.request('/v1/gates/release','POST',{deviceId,reason,requestId:crypto.randomUUID()})}
  async administer(operation:string,body:Record<string,unknown>){return this.request('/v1/admin/'+operation,'POST',body)}
}

export type IntegrationDevice={id:string;name:string;provider:string;model:string;gate:string;gateway_id:string;enabled:boolean;commissioned:boolean;mode:string};
export type IntegrationState={devices:IntegrationDevice[];gateways:{id:string;name:string;enabled:boolean;last_seen:string|null}[];jobs:{id:string;device_id:string;gate:string;status:string;created_at:string}[];decisions?:{id:string;device_id:string;purpose:string;allowed:boolean;reason:string;created_at:string}[];admin:boolean;canRelease:boolean;localAccounts?:boolean;members?:{user_id:string;name:string;email:string;role:string;unit:string|null;enabled:boolean}[]};

// Convert the existing UI actions into semantic commands. The API must repeat
// all validation and enforce the authenticated person's role and unit.
export function commandFromChange(before:DemoState,after:DemoState):ApiCommand {
  const make=(type:string,payload:Record<string,unknown>):ApiCommand=>({type,payload,requestId:crypto.randomUUID()});
  const visit=after.visits.find(v=>!before.visits.some(p=>p.id===v.id));
  if(visit)return make('visit.create',{name:visit.name,unit:visit.unit,host:visit.host,type:visit.type,note:visit.note});
  const moved=after.visits.find(v=>before.visits.some(p=>p.id===v.id&&p.status!==v.status));
  if(moved)return make('visit.transition',{id:moved.id,status:moved.status});
  const parcel=after.parcels.find(p=>!before.parcels.some(v=>v.id===p.id));
  if(parcel)return make('parcel.receive',{name:parcel.name,unit:parcel.unit,carrier:parcel.carrier,tracking:parcel.tracking,location:parcel.location,volumes:parcel.volumes});
  const withdrawn=after.parcels.find(p=>before.parcels.some(v=>v.id===p.id&&v.status!==p.status));
  if(withdrawn)return make('parcel.withdraw',{id:withdrawn.id,receivedBy:withdrawn.receivedBy});
  const invite=after.invites.find(i=>!before.invites.some(v=>v.id===i.id));
  if(invite)return make('invite.create',{name:invite.name,unit:invite.unit,host:invite.host,type:invite.type,startsAt:invite.startsAt,endsAt:invite.endsAt,plate:after.credentials.find(c=>c.id===invite.credentialId)?.plate,...(before.credentials.some(c=>c.id===invite.credentialId)?{renewCredentialId:invite.credentialId}:{})});
  const cancelled=after.invites.find(i=>i.cancelled&&!before.invites.find(v=>v.id===i.id)?.cancelled);
  if(cancelled)return make('invite.cancel',{id:cancelled.id});
  const booking=after.bookings.find(b=>!before.bookings.some(v=>v.id===b.id));
  if(booking)return make('booking.create',{area:booking.area,startsAt:booking.startsAt,endsAt:booking.endsAt});
  const cancelledBooking=after.bookings.find(b=>b.cancelled&&!before.bookings.find(v=>v.id===b.id)?.cancelled);
  if(cancelledBooking)return make('booking.cancel',{id:cancelledBooking.id});
  const request=after.requests.find(r=>!before.requests.some(v=>v.id===r.id));
  if(request)return make('request.create',{subject:request.subject,message:request.message});
  const resolved=after.requests.find(r=>r.resolved&&!before.requests.find(v=>v.id===r.id)?.resolved);
  if(resolved)return make('request.resolve',{id:resolved.id});
  throw Error('Esta ação só está disponível no modo de apresentação.');
}
