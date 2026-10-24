import {HttpError,type Member,type State,type Person} from './domain';
export const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
export const sha256=async(value:string)=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
export type AccessStore=Pick<SupabaseStore,'select'|'insert'|'patch'|'rpc'|'login'|'authUser'|'revoke'|'member'|'directory'|'state'|'authAccount'|'commit'>;
export class SupabaseStore {
  constructor(readonly url:string,private serviceKey:string,private transport:typeof fetch=fetch){if(!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(url))throw Error('SUPABASE_URL inválida.');if(!serviceKey)throw Error('Chave de serviço ausente.');}
  private async send(path:string,method='GET',data?:unknown,headers:Record<string,string>={}){
    const response=await this.transport(this.url+path,{method,headers:{apikey:this.serviceKey,Authorization:'Bearer '+this.serviceKey,'Content-Type':'application/json',...headers},body:data===undefined?undefined:JSON.stringify(data),redirect:'error',signal:AbortSignal.timeout(8000)});
    if(!response.ok){const err=await response.json().catch(()=>({}));const message=String(err?.message||'');const conflict=['REVISION_CONFLICT','IDEMPOTENCY_CONFLICT'].find(k=>message.includes(k));if(conflict)throw new HttpError(409,conflict);if(message.includes('FORBIDDEN'))throw new HttpError(403,'Operação sem permissão.');if(/DEVICE_DISABLED|GATEWAY_OFFLINE/.test(message))throw new HttpError(409,'Equipamento desativado, não homologado ou gateway indisponível.');if(response.status===401||response.status===403)throw new HttpError(401,'Sessão inválida.');throw new HttpError(503,'Serviço de dados indisponível.');}
    const raw=await response.text();return raw?JSON.parse(raw):null;
  }
  async select(table:string,filters:Record<string,string>,columns='*',limit=100){const query=new URLSearchParams({select:columns,limit:String(limit),...filters});return this.send('/rest/v1/'+table+'?'+query)}
  async insert(table:string,data:unknown,returning=true){return this.send('/rest/v1/'+table,'POST',data,{Prefer:returning?'return=representation':'return=minimal'})}
  async patch(table:string,filters:Record<string,string>,data:unknown){return this.send('/rest/v1/'+table+'?'+new URLSearchParams(filters),'PATCH',data,{Prefer:'return=representation'})}
  async rpc(name:string,args:unknown){return this.send('/rest/v1/rpc/'+name,'POST',args)}
  async login(email:string,password:string){try{return await this.send('/auth/v1/token?grant_type=password','POST',{email,password})}catch{throw new HttpError(401,'E-mail ou senha inválidos.')}}
  async authUser(token:string){if((await this.select('ac_revocations',{token_hash:'eq.'+await sha256(token)},'token_hash',1)).length)throw new HttpError(401,'Sessão encerrada.');try{const u=await this.send('/auth/v1/user','GET',undefined,{Authorization:'Bearer '+token});if(!u?.id)throw Error();return u}catch{throw new HttpError(401,'Sessão inválida.')}}
  async revoke(token:string,expiresAt?:string){if(!expiresAt){const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));expiresAt=new Date(claims.exp*1000).toISOString();}await this.insert('ac_revocations',{token_hash:await sha256(token),expires_at:expiresAt},false);}
  async member(userId:string):Promise<Member>{const [m]=await this.select('ac_memberships',{user_id:'eq.'+userId,enabled:'eq.true'});if(!m)throw new HttpError(403,'Usuário não vinculado a um condomínio.');return m}
  async directory(condominium:string):Promise<Person[]>{const rows=await this.select('ac_memberships',{condominium_id:'eq.'+condominium,role:'eq.resident',enabled:'eq.true'},'name,unit',10000);return rows.map((r:{name:string;unit:string})=>({...r,initials:r.name.split(' ').slice(0,2).map(x=>x[0]).join('')}))}
  async state(condominium:string):Promise<{body:State;revision:number}>{const [s]=await this.select('ac_state',{condominium_id:'eq.'+condominium},'*',1);if(!s)throw new HttpError(404,'Condomínio não inicializado.');return s}
  async authAccount(userId:string){return this.send('/auth/v1/admin/users/'+encodeURIComponent(userId))}
  async commit(condominium:string,revision:number,body:State,actor:string,request:string,hash:string){return this.rpc('ac_commit_state',{p_condominium:condominium,p_revision:revision,p_body:body,p_actor:actor,p_request:request,p_hash:hash})}
}
