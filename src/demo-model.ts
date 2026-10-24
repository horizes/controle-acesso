import {Credential,AccessResult,AccessSignal,evaluateAccess,normalizePlate} from './access-engine';
export type Visit={id:string;name:string;unit:string;host:string;type:'Visitante'|'Prestador'|'Entrega';status:'Aguardando'|'Autorizado'|'No condomínio'|'Finalizado'|'Recusado';createdAt:string;note:string;known:boolean;enteredAt?:string;exitedAt?:string};
export type Parcel={id:string;name:string;unit:string;carrier:string;tracking:string;location:string;volumes:number;status:'Na portaria'|'Retirada';createdAt:string;receivedBy?:string;withdrawnAt?:string};
export type Invite={id:string;name:string;unit:string;host:string;type:'Visita'|'Serviço';startsAt:string;endsAt:string;code:string;credentialId:string;cancelled:boolean};
export type Booking={id:string;name:string;unit:string;area:string;startsAt:string;endsAt:string;cancelled:boolean};
export type RequestItem={id:string;name:string;unit:string;subject:string;message:string;at:string;resolved:boolean};
export type Event={id:string;title:string;detail:string;at:string;kind:'visit'|'parcel'|'invite'|'access'|'booking'|'request';allowed?:boolean};
export type DemoState={version:2;visits:Visit[];parcels:Parcel[];invites:Invite[];credentials:Credential[];bookings:Booking[];requests:RequestItem[];events:Event[]};
export const RESIDENTS=[{name:'Ana Oliveira',unit:'102 · Torre A',initials:'AO'},{name:'Bruno Santos',unit:'304 · Torre B',initials:'BS'},{name:'Clara Martins',unit:'201 · Torre A',initials:'CM'}];
export const AREAS=[{name:'Salão de festas',description:'Para reunir a família e celebrar.',capacity:'Até 40 pessoas',hours:'Das 10h às 22h'},{name:'Churrasqueira',description:'Almoço demorado, conversa boa.',capacity:'Até 16 pessoas',hours:'Das 10h às 22h'},{name:'Espaço gourmet',description:'Um espaço para os seus encontros.',capacity:'Até 12 pessoas',hours:'Das 10h às 22h'}];
export const id=(prefix='r')=>prefix+'-'+(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2));
export function createDemo(clock=new Date()):DemoState{
 const n=clock.getTime(),ago=(m:number)=>new Date(n-m*60000).toISOString(),ahead=(h:number)=>new Date(n+h*3600000).toISOString();
 return {version:2,visits:[
  {id:'v1',name:'Mariana Costa',unit:'102 · Torre A',host:'Ana Oliveira',type:'Visitante',status:'Aguardando',createdAt:ago(3),note:'Visita para Ana. Já esteve no condomínio.',known:true},
  {id:'v2',name:'Rafael Almeida',unit:'304 · Torre B',host:'Bruno Santos',type:'Prestador',status:'Autorizado',createdAt:ago(11),note:'Manutenção do ar-condicionado.',known:true},
  {id:'v3',name:'Camila Ribeiro',unit:'201 · Torre A',host:'Clara Martins',type:'Visitante',status:'No condomínio',createdAt:ago(31),enteredAt:ago(28),note:'',known:true},
  {id:'v4',name:'João Mendes',unit:'102 · Torre A',host:'Ana Oliveira',type:'Visitante',status:'Finalizado',createdAt:ago(120),enteredAt:ago(115),exitedAt:ago(70),note:'',known:true}
 ],parcels:[
  {id:'p1',name:'Ana Oliveira',unit:'102 · Torre A',carrier:'Mercado Livre',tracking:'ML2048',location:'Estante A · 03',volumes:1,status:'Na portaria',createdAt:ago(24)},
  {id:'p2',name:'Bruno Santos',unit:'304 · Torre B',carrier:'Amazon',tracking:'AZ0812',location:'Estante B · 01',volumes:2,status:'Na portaria',createdAt:ago(48)},
  {id:'p3',name:'Clara Martins',unit:'201 · Torre A',carrier:'Correios',tracking:'BR0314',location:'Estante A · 01',volumes:1,status:'Na portaria',createdAt:ago(83)},
 ],invites:[{id:'i1',name:'Fernanda Souza',unit:'102 · Torre A',host:'Ana Oliveira',type:'Visita',startsAt:ago(30),endsAt:ahead(5),code:'IP-FERNANDA',credentialId:'c-fernanda',cancelled:false}],
 credentials:[
  {id:'c-ana',name:'Ana Oliveira',unit:'102 · Torre A',profile:'Morador',faceRef:'FACE-ANA-102',plate:'ABC1D23',code:'IP-ANA-102',validFrom:ago(525600),validUntil:ahead(8760),revoked:false,gates:['social','garagem']},
  {id:'c-bruno',name:'Bruno Santos',unit:'304 · Torre B',profile:'Morador',faceRef:'FACE-BRUNO-304',plate:'DEF4G56',code:'IP-BRUNO-304',validFrom:ago(525600),validUntil:ahead(8760),revoked:false,gates:['social','garagem']},
  {id:'c-clara',name:'Clara Martins',unit:'201 · Torre A',profile:'Morador',faceRef:'FACE-CLARA-201',code:'IP-CLARA-201',validFrom:ago(525600),validUntil:ahead(8760),revoked:false,gates:['social','garagem']},
  {id:'c-mariana',name:'Mariana Costa',unit:'102 · Torre A',profile:'Visitante',faceRef:'FACE-MARIANA',code:'IP-MARIANA-ANTERIOR',validFrom:ago(1440),validUntil:ago(720),revoked:false,gates:['social']},
  {id:'c-fernanda',name:'Fernanda Souza',unit:'102 · Torre A',profile:'Visitante',faceRef:'FACE-FERNANDA',code:'IP-FERNANDA',validFrom:ago(30),validUntil:ahead(5),revoked:false,gates:['social']},
  {id:'c-rafael',name:'Rafael Almeida',unit:'304 · Torre B',profile:'Prestador',faceRef:'FACE-RAFAEL',code:'IP-RAFAEL',validFrom:ago(120),validUntil:ago(15),revoked:false,gates:['social']},
  {id:'c-joao',name:'João Mendes',unit:'102 · Torre A',profile:'Visitante',faceRef:'FACE-JOAO',plate:'GHI7J89',code:'IP-JOAO',validFrom:ago(60),validUntil:ahead(4),revoked:true,gates:['social','garagem']}
 ],bookings:[{id:'b1',name:'Ana Oliveira',unit:'102 · Torre A',area:'Churrasqueira',startsAt:ahead(24),endsAt:ahead(28),cancelled:false}],requests:[{id:'r1',name:'Clara Martins',unit:'201 · Torre A',subject:'Iluminação da garagem',message:'A lâmpada próxima à vaga 18 está apagada.',at:ago(90),resolved:false}],events:[
  {id:'e1',title:'Visita aguardando autorização',detail:'Mariana Costa · 102 · Torre A',at:ago(3),kind:'visit'},
  {id:'e2',title:'Encomenda recebida',detail:'Ana Oliveira · Mercado Livre · Estante A · 03',at:ago(24),kind:'parcel'},
  {id:'e3',title:'Entrada registrada',detail:'Camila Ribeiro · 201 · Torre A',at:ago(28),kind:'visit'}
 ]};
}
function event(state:DemoState,title:string,detail:string,kind:Event['kind'],allowed?:boolean){state.events=[{id:id('e'),title,detail,kind,at:new Date().toISOString(),...(allowed!==undefined?{allowed}:{})},...state.events].slice(0,250);}
export function transitionVisit(state:DemoState,visitId:string,status:Visit['status']){
 const next=structuredClone(state),v=next.visits.find(v=>v.id===visitId);if(!v)throw Error('Visita não encontrada.');
 const transitions:Record<Visit['status'],Visit['status'][]>= {Aguardando:['Autorizado','Recusado'],Autorizado:['No condomínio','Recusado'],'No condomínio':['Finalizado'],Finalizado:[],Recusado:[]};
 if(!transitions[v.status].includes(status))throw Error('Esta visita já foi atualizada.');
 v.status=status;if(status==='No condomínio')v.enteredAt=new Date().toISOString();if(status==='Finalizado')v.exitedAt=new Date().toISOString();
 if(status==='Autorizado'){
  const known=next.credentials.find(c=>c.sourceVisitId===v.id&&c.unit===v.unit&&c.profile!=='Morador');
  if(known&&(!known.revoked&&new Date(known.validFrom)<=new Date()&&new Date(known.validUntil)>new Date())){/* Keep an invitation that is already valid. */}
  else if(known){known.validFrom=new Date().toISOString();known.validUntil=new Date(Date.now()+2*3600000).toISOString();known.revoked=false;known.sourceVisitId=v.id;known.unit=v.unit;known.code='IP-'+id('v').slice(-8).toUpperCase();next.invites=next.invites.map(i=>i.credentialId===known.id?{...i,cancelled:true}:i);}
  else next.credentials.push({id:id('c'),name:v.name,unit:v.unit,profile:v.type==='Prestador'?'Prestador':'Visitante',code:'IP-'+id('v').slice(-8).toUpperCase(),validFrom:new Date().toISOString(),validUntil:new Date(Date.now()+2*3600000).toISOString(),revoked:false,gates:['social'],sourceVisitId:v.id});
 }
 if(status==='Finalizado'||status==='Recusado')for(const c of next.credentials)if(c.sourceVisitId===v.id)c.revoked=true;
 event(next,status==='Autorizado'?'Visita autorizada':status==='No condomínio'?'Entrada registrada':status==='Finalizado'?'Saída registrada':'Visita recusada',v.name+' · '+v.unit,'visit');return next;
}
export function addParcel(state:DemoState,data:Omit<Parcel,'id'|'status'|'createdAt'>){if(!data.name.trim()||!data.unit||!data.carrier.trim()||!data.location.trim()||data.volumes<1||data.volumes>99)throw Error('Informe destinatário, unidade, transportadora e local.');const next=structuredClone(state);next.parcels.unshift({...data,id:id('p'),status:'Na portaria',createdAt:new Date().toISOString()});event(next,'Encomenda recebida',data.name+' · '+data.carrier+' · '+data.unit,'parcel');return next;}
export function withdrawParcel(state:DemoState,parcelId:string,receivedBy:string){const next=structuredClone(state),p=next.parcels.find(p=>p.id===parcelId);if(!p||p.status!=='Na portaria')throw Error('Esta encomenda já foi retirada.');if(receivedBy.trim().length<2)throw Error('Informe quem recebeu a encomenda.');p.status='Retirada';p.receivedBy=receivedBy.trim();p.withdrawnAt=new Date().toISOString();event(next,'Encomenda retirada',p.name+' · Retirada por '+p.receivedBy,'parcel');return next;}
export function addInvite(state:DemoState,data:Omit<Invite,'id'|'code'|'credentialId'|'cancelled'> & {plate?:string;renewCredentialId?:string}){
 if(data.name.trim().length<2||!data.unit)throw Error('Informe o visitante e a unidade.');
 if(!Number.isFinite(new Date(data.startsAt).getTime())||!Number.isFinite(new Date(data.endsAt).getTime())||new Date(data.endsAt)<=new Date(data.startsAt))throw Error('A validade final precisa ser posterior ao início.');
 if(data.plate&&!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizePlate(data.plate)))throw Error('Confira a placa: use o padrão ABC1234 ou ABC1D23.');
 const next=structuredClone(state),code='IP-'+Math.random().toString(36).slice(2,8).toUpperCase();
 const known=data.renewCredentialId?next.credentials.find(c=>c.id===data.renewCredentialId):undefined;
 if(data.renewCredentialId&&(!known||known.unit!==data.unit||known.name.trim().toLowerCase()!==data.name.trim().toLowerCase()))throw Error('O cadastro selecionado não pertence à pessoa e unidade informadas.');
 const credentialId=known?.id||id('c');
 // Reuse an explicitly selected identity, keeping its equipment bindings stable.
 // A matching name never transfers another person's biometric identifier.
 if(known&&known.profile==='Morador')throw Error('Esta pessoa já possui cadastro de morador.');
 if(known){next.credentials=next.credentials.filter(c=>c.id!==known.id);next.invites=next.invites.map(i=>i.credentialId===known.id?{...i,cancelled:true}:i);}
 const invitation:Invite={id:id('i'),name:data.name.trim(),unit:data.unit,host:data.host,type:data.type,startsAt:data.startsAt,endsAt:data.endsAt,code,credentialId,cancelled:false};
 next.invites.unshift(invitation);next.credentials.push({id:credentialId,name:invitation.name,unit:data.unit,profile:data.type==='Serviço'?'Prestador':'Visitante',faceRef:known?.faceRef,plate:data.plate?normalizePlate(data.plate):undefined,code,validFrom:data.startsAt,validUntil:data.endsAt,revoked:false,gates:data.plate?['social','garagem']:['social']});
 event(next,'Convite criado',data.name+' · '+data.unit,'invite');return {state:next,invite:invitation};
}
export function cancelInvite(state:DemoState,inviteId:string){const next=structuredClone(state),i=next.invites.find(i=>i.id===inviteId);if(!i||i.cancelled)throw Error('Este convite já foi cancelado.');i.cancelled=true;const c=next.credentials.find(c=>c.id===i.credentialId);if(c)c.revoked=true;event(next,'Convite cancelado',i.name+' · '+i.unit,'invite');return next;}
export function addBooking(state:DemoState,data:Omit<Booking,'id'|'cancelled'>){const start=new Date(data.startsAt).getTime(),end=new Date(data.endsAt).getTime();if(!data.name||!data.area||!Number.isFinite(start)||!Number.isFinite(end)||end<=start||start<Date.now()-60000)throw Error('Confira a data e o horário da reserva.');if(state.bookings.some(b=>!b.cancelled&&b.area===data.area&&new Date(b.startsAt).getTime()<end&&new Date(b.endsAt).getTime()>start))throw Error('Este espaço já está reservado nesse horário.');const next=structuredClone(state);next.bookings.unshift({...data,id:id('b'),cancelled:false});event(next,'Reserva confirmada',data.area+' · '+data.name,'booking');return next;}
export function runAccess(state:DemoState,signal:AccessSignal):{state:DemoState;result:AccessResult}{const next=structuredClone(state),result=evaluateAccess(next.credentials,signal);event(next,result.allowed?'Leitura permitida':'Leitura recusada',(result.credential?.name||signal.value)+' · '+result.reason,'access',result.allowed);return {state:next,result};}
export function isDemoState(value:unknown):value is DemoState{const s=value as DemoState;return !!s&&s.version===2&&['visits','parcels','invites','credentials','bookings','requests','events'].every(k=>Array.isArray((s as any)[k]));}
