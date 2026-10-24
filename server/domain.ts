import {addBooking,addInvite,addParcel,cancelInvite,id,transitionVisit,withdrawParcel,type DemoState,type Event,type Visit} from '../src/demo-model';
import {evaluateAccess,normalizePlate,type Credential} from '../src/access-engine';

export class HttpError extends Error { constructor(public status:number,message:string){super(message)} }
export type Member={user_id:string;condominium_id:string;role:'admin'|'desk'|'resident';name:string;email?:string;unit:string|null;can_release:boolean;enabled:boolean};
export type Person={name:string;unit:string;initials:string};
export type State=Omit<DemoState,'events'> & {residents?:Person[];events:Array<Event & {unit?:string}>};
export type Device={id:string;condominium_id:string;gateway_id:string;provider:string;name:string;model:string;gate:string;methods:string[];mode:'online'|'monitor';enabled:boolean;commissioned:boolean;actuator_id:string|null;last_seen?:string|null};
export type Command={type:string;requestId:string;payload:Record<string,unknown>};
export const emptyState=():State=>({version:2,visits:[],parcels:[],invites:[],credentials:[],bookings:[],requests:[],events:[]});
export function text(v:unknown,label:string,max=200,min=1){if(typeof v!=='string'||v.trim().length<min||v.length>max)throw new HttpError(400,'Campo inválido: '+label);return v.trim()}
export function exactKeys(value:unknown,allowed:string[],required:string[]=allowed):asserts value is Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k))||required.some(k=>!(k in value)))throw new HttpError(400,'Campos da operação inválidos.');}
export function iso(value:unknown,label:string){const s=text(value,label,40);if(!Number.isFinite(Date.parse(s)))throw new HttpError(400,'Data inválida: '+label);return new Date(s).toISOString()}
export function uuid(value:unknown,label='identificador'){const s=text(value,label,50);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s))throw new HttpError(400,'Identificador inválido.');return s}
export function requireDesk(m:Member){if(!m.enabled||m.role==='resident')throw new HttpError(403,'Operação exclusiva da portaria.');}
export function requireAdmin(m:Member){if(!m.enabled||m.role!=='admin')throw new HttpError(403,'Operação exclusiva da administração.');}
export function requireUnit(m:Member,unit:string){if(!m.enabled||m.role==='resident'&&m.unit!==unit)throw new HttpError(403,'Unidade sem permissão.');}
export function opaqueCode(){return 'IP-'+Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('').toUpperCase()}
export function audit(state:State,title:string,detail:string,unit?:string,kind:Event['kind']='access'){state.events.unshift({id:id('e'),title,detail,kind,at:new Date().toISOString(),...(unit?{unit}:{})});state.events=state.events.slice(0,5000);}
export function scopedState(state:State,m:Member,directory:Person[]){
  const resident=m.role==='resident',own=(r:{unit:string})=>!resident||r.unit===m.unit;
  return {...state,residents:directory.filter(own),visits:state.visits.filter(own),parcels:state.parcels.filter(own),invites:state.invites.filter(own),credentials:state.credentials.filter(own),bookings:state.bookings.filter(own),requests:state.requests.filter(own),events:state.events.filter(e=>!resident||e.unit===m.unit).map(({unit,...e})=>e)};
}
export function applyCommand(state:State,member:Member,command:Command,directory:Person[]):State{
  if(!member.enabled)throw new HttpError(403,'Acesso desativado.');
  exactKeys(command,['type','payload','requestId']);uuid(command.requestId,'requestId');
  const type=text(command.type,'type',60),p=command.payload;let next:State,unit:string|undefined;
  const inDirectory=(value:unknown)=>{const u=text(value,'unit',100);if(!directory.some(r=>r.unit===u))throw new HttpError(400,'Unidade não cadastrada.');return u};
  try{switch(type){
    case 'visit.create':{
      requireDesk(member);exactKeys(p,['name','unit','host','type','note']);unit=inDirectory(p.unit);const host=text(p.host,'host',100);if(!directory.some(r=>r.unit===unit&&r.name===host))throw new HttpError(400,'Responsável não pertence à unidade.');
      if(!['Visitante','Prestador','Entrega'].includes(String(p.type)))throw new HttpError(400,'Tipo de visita inválido.');
      next=structuredClone(state);next.visits.unshift({id:id('v'),name:text(p.name,'name',100,2),unit,host,type:p.type as Visit['type'],status:'Aguardando',createdAt:new Date().toISOString(),note:typeof p.note==='string'?p.note.slice(0,2000):'',known:state.credentials.some(c=>c.name.toLowerCase()===String(p.name).trim().toLowerCase())});audit(next,'Visita cadastrada',String(p.name)+' · '+unit,unit,'visit');break;
    }
    case 'visit.transition':{
      exactKeys(p,['id','status']);const visit=state.visits.find(v=>v.id===p.id);if(!visit)throw new HttpError(404,'Visita não encontrada.');unit=visit.unit;requireUnit(member,unit);
      if(member.role==='resident'&&!['Autorizado','Recusado'].includes(String(p.status)))throw new HttpError(403,'O morador pode autorizar ou recusar a própria visita.');
      if(!['Autorizado','Recusado','No condomínio','Finalizado'].includes(String(p.status)))throw new HttpError(400,'Transição inválida.');
      if(p.status==='No condomínio'){
        const credential=state.credentials.find(c=>c.sourceVisitId===visit.id&&c.unit===unit);
        if(!credential||!evaluateAccess([credential],{method:'code',value:credential.code||'',gate:'social'}).allowed)throw new HttpError(409,'A autorização da visita não está válida.');
      }
      next=transitionVisit(state,visit.id,p.status as Visit['status']) as State;
      if(p.status==='Autorizado')for(const c of next.credentials)if(c.sourceVisitId===visit.id)c.code=opaqueCode();break;
    }
    case 'parcel.receive':{
      requireDesk(member);exactKeys(p,['name','unit','carrier','tracking','location','volumes']);unit=inDirectory(p.unit);const name=text(p.name,'name',100,2);if(!directory.some(r=>r.unit===unit&&r.name===name))throw new HttpError(400,'Destinatário não pertence à unidade.');
      if(!Number.isInteger(p.volumes)||Number(p.volumes)<1||Number(p.volumes)>99)throw new HttpError(400,'Volumes inválidos.');
      next=addParcel(state,{name,unit,carrier:text(p.carrier,'carrier',100),tracking:typeof p.tracking==='string'?p.tracking.slice(0,100):'',location:text(p.location,'location',120),volumes:Number(p.volumes)}) as State;break;
    }
    case 'parcel.withdraw':{
      requireDesk(member);exactKeys(p,['id','receivedBy']);const parcel=state.parcels.find(v=>v.id===p.id);if(!parcel)throw new HttpError(404,'Encomenda não encontrada.');unit=parcel.unit;next=withdrawParcel(state,parcel.id,text(p.receivedBy,'receivedBy',100,2)) as State;break;
    }
    case 'invite.create':{
      exactKeys(p,['name','unit','host','type','startsAt','endsAt','plate','renewCredentialId'],['name','unit','host','type','startsAt','endsAt']);unit=inDirectory(p.unit);requireUnit(member,unit);const host=member.role==='resident'?member.name:text(p.host,'host',100);
      if(!directory.some(r=>r.unit===unit&&r.name===host)||!['Visita','Serviço'].includes(String(p.type)))throw new HttpError(400,'Responsável ou finalidade inválidos.');
      const start=iso(p.startsAt,'startsAt'),end=iso(p.endsAt,'endsAt');if(Date.parse(end)<=Date.now()||Date.parse(end)-Date.parse(start)>366*86400000)throw new HttpError(400,'Prazo de autorização inválido.');
      const result=addInvite(state,{name:text(p.name,'name',100,2),unit,host,type:p.type as 'Visita'|'Serviço',startsAt:start,endsAt:end,plate:p.plate?text(p.plate,'plate',20):undefined,renewCredentialId:p.renewCredentialId?text(p.renewCredentialId,'renewCredentialId',100):undefined});next=result.state as State;const credential=next.credentials.find(c=>c.id===result.invite.credentialId)!;if(credential.plate&&next.credentials.some(c=>c.id!==credential.id&&c.plate===credential.plate))throw new HttpError(409,'Placa já vinculada a outro cadastro.');const code=opaqueCode();next.invites.find(i=>i.id===result.invite.id)!.code=code;credential.code=code;break;
    }
    case 'invite.cancel':{
      exactKeys(p,['id']);const invite=state.invites.find(v=>v.id===p.id);if(!invite)throw new HttpError(404,'Convite não encontrado.');unit=invite.unit;requireUnit(member,unit);next=cancelInvite(state,invite.id) as State;break;
    }
    case 'booking.create':{
      if(member.role!=='resident'||!member.unit)throw new HttpError(403,'Entre como morador para reservar.');exactKeys(p,['area','startsAt','endsAt']);unit=member.unit;
      if(!['Salão de festas','Churrasqueira','Espaço gourmet'].includes(String(p.area)))throw new HttpError(400,'Espaço não cadastrado.');next=addBooking(state,{name:member.name,unit,area:String(p.area),startsAt:iso(p.startsAt,'startsAt'),endsAt:iso(p.endsAt,'endsAt')}) as State;break;
    }
    case 'booking.cancel':{
      exactKeys(p,['id']);const booking=state.bookings.find(v=>v.id===p.id);if(!booking)throw new HttpError(404,'Reserva não encontrada.');unit=booking.unit;requireUnit(member,unit);if(booking.cancelled)throw new HttpError(409,'Reserva já cancelada.');next=structuredClone(state);next.bookings.find(b=>b.id===booking.id)!.cancelled=true;audit(next,'Reserva cancelada',booking.area+' · '+member.name,unit,'booking');break;
    }
    case 'request.create':{
      if(member.role!=='resident'||!member.unit)throw new HttpError(403,'Entre como morador para criar uma solicitação.');exactKeys(p,['subject','message']);unit=member.unit;next=structuredClone(state);next.requests.unshift({id:id('r'),name:member.name,unit,subject:text(p.subject,'subject',150,3),message:text(p.message,'message',2000,5),at:new Date().toISOString(),resolved:false});audit(next,'Solicitação recebida',String(p.subject)+' · '+unit,unit,'request');break;
    }
    case 'request.resolve':{
      requireDesk(member);exactKeys(p,['id']);const request=state.requests.find(v=>v.id===p.id);if(!request)throw new HttpError(404,'Solicitação não encontrada.');unit=request.unit;next=structuredClone(state);next.requests.find(r=>r.id===request.id)!.resolved=true;audit(next,'Solicitação concluída',request.subject,unit,'request');break;
    }
    default:throw new HttpError(400,'Comando não suportado.');
  }}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(409,e instanceof Error?e.message:'Operação inválida.');}
  const previous=new Set(state.events.map(e=>e.id));next.events=next.events.map(e=>previous.has(e.id)?e:{...e,unit});return next;
}
export function createCredential(raw:unknown,directory:Person[]):Credential{
  exactKeys(raw,['name','unit','profile','faceRef','plate','validFrom','validUntil','gates'],['name','unit','profile','validFrom','validUntil','gates']);
  const unit=text(raw.unit,'unit',100),name=text(raw.name,'name',100,2),profile=String(raw.profile);if(!directory.some(r=>r.unit===unit)||!['Morador','Visitante','Prestador'].includes(profile))throw new HttpError(400,'Unidade ou perfil inválidos.');
  const validFrom=iso(raw.validFrom,'validFrom'),validUntil=iso(raw.validUntil,'validUntil');if(Date.parse(validUntil)<=Date.parse(validFrom))throw new HttpError(400,'Prazo inválido.');
  const gates=raw.gates;if(!Array.isArray(gates)||!gates.length||gates.some(g=>typeof g!=='string'||!/^[a-z0-9_-]{1,60}$/.test(g)))throw new HttpError(400,'Portas inválidas.');
  const plate=raw.plate?normalizePlate(text(raw.plate,'plate',20)):undefined;if(plate&&!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate))throw new HttpError(400,'Placa inválida.');
  return {id:id('c'),name,unit,profile:profile as Credential['profile'],faceRef:raw.faceRef?text(raw.faceRef,'faceRef',120):undefined,plate,code:opaqueCode(),validFrom,validUntil,gates,revoked:false};
}
