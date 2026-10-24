import {applyCommand,audit,createCredential,emptyState,exactKeys,HttpError,iso,opaqueCode,requireAdmin,requireDesk,scopedState,text,uuid,type Member,type Device,type Command} from './domain';
import {sha256,type AccessStore} from './store';
import {evaluateAccess,normalizePlate} from '../src/access-engine';
import {verifyEquipmentSignature} from '../src/equipment-events';

type Options={store:AccessStore;allowedOrigins:string[];localAccounts?:{create:(member:Member,data:Record<string,unknown>)=>Promise<unknown>;list:(member:Member)=>Promise<unknown>;status:(member:Member,data:Record<string,unknown>)=>Promise<unknown>}};
const denied={allowed:false,reason:'Acesso não autorizado.',physicalState:'unknown'};
function bearer(req:Request){const value=req.headers.get('authorization')||'';if(!value.startsWith('Bearer ')||value.length>6000)throw new HttpError(401,'Autenticação necessária.');return value.slice(7)}
async function readBody(req:Request){
  if(Number(req.headers.get('content-length')||0)>32768)throw new HttpError(413,'Corpo muito grande.');
  const reader=req.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
  if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768){await reader.cancel();throw new HttpError(413,'Corpo muito grande.')}chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}const raw=new TextDecoder().decode(bytes);
  try{const data=JSON.parse(raw);if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return {raw,data}}catch{throw new HttpError(400,'JSON inválido.')}}
export function createHandler({store,allowedOrigins,localAccounts}:Options){return async(req:Request):Promise<Response>=>{
  const origin=req.headers.get('origin');const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  if(origin&&allowedOrigins.includes(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,content-type,x-gateway-signature','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Max-Age':'600'});
  const response=(body:unknown,status=200)=>new Response(status===204?null:JSON.stringify(body),{status,headers});
  const url=new URL(req.url),index=url.pathname.indexOf('/v1/'),path=index>=0?url.pathname.slice(index):url.pathname;
  try{
    if(origin&&!allowedOrigins.includes(origin))throw new HttpError(403,'Origem não autorizada.');
    if(req.method==='OPTIONS')return response(null,204);
    if(req.method==='GET'&&path==='/v1/health')return response({service:'imperium-access-api',version:1,status:'ok',physicalDevices:'require-commissioning'});
    if(req.method==='POST'&&path==='/v1/auth/login'){
      const {data}=await readBody(req);exactKeys(data,['role','email','password']);if(!['desk','resident'].includes(String(data.role)))throw new HttpError(400,'Perfil inválido.');const email=text(data.email,'email',254).toLowerCase();if(typeof data.password!=='string'||!data.password.length||data.password.length>1000)throw new HttpError(400,'Senha inválida.');const password=data.password;
      const ok=await store.rpc('ac_rate_limit',{p_bucket:'login:'+await sha256(email),p_limit:12,p_seconds:60});if(!ok)throw new HttpError(429,'Aguarde antes de tentar novamente.');
      const auth=await store.login(email,password),member=await store.member(auth.user.id),role=member.role==='resident'?'resident':'desk';if(role!==data.role)throw new HttpError(403,'Perfil sem permissão neste acesso.');
      return response({accessToken:auth.access_token,expiresAt:new Date((auth.expires_at||Date.now()/1000+auth.expires_in)*1000).toISOString(),user:{role,name:member.name,email:auth.user.email,...(member.unit?{unit:member.unit}:{}),capabilities:{admin:member.role==='admin',manualRelease:member.can_release||member.role==='admin'}}});
    }
    if(path.startsWith('/v1/gateway/')){
      if(req.method!=='POST')throw new HttpError(405,'Método não permitido.');const token=bearer(req);if(!token.startsWith('acgw_')||token.length<45)throw new HttpError(401,'Gateway inválido.');
      const [gateway]=await store.select('ac_gateways',{token_hash:'eq.'+await sha256(token),enabled:'eq.true'},'*',1);if(!gateway)throw new HttpError(401,'Gateway não autorizado.');
      const {raw,data}=await readBody(req);const sent=Date.parse(data.sentAt);if(!Number.isFinite(sent)||Math.abs(Date.now()-sent)>60000)throw new HttpError(401,'Requisição fora da janela.');uuid(data.requestId,'requestId');
      if(!await verifyEquipmentSignature('POST\n'+path+'\n'+raw,req.headers.get('x-gateway-signature')||'',token))throw new HttpError(401,'Assinatura inválida.');
      if(!await store.rpc('ac_nonce',{p_gateway:gateway.id,p_nonce:data.requestId}))throw new HttpError(409,'Requisição já recebida.');
      if(path==='/v1/gateway/poll'){
        exactKeys(data,['requestId','sentAt']);await store.patch('ac_gateways',{id:'eq.'+gateway.id},{last_seen:new Date().toISOString()});const jobs=await store.rpc('ac_lease_jobs',{p_gateway:gateway.id,p_limit:5});const allowed=[];
        for(const job of jobs){const [device]=await store.select('ac_devices',{id:'eq.'+job.device_id,gateway_id:'eq.'+gateway.id,enabled:'eq.true',commissioned:'eq.true'},'*',1);const [actor]=job.actor_id.startsWith('user:')?await store.select('ac_memberships',{user_id:'eq.'+job.actor_id.slice(5),enabled:'eq.true'},'*',1):[];
          if(!device||!actor||actor.condominium_id!==gateway.condominium_id||actor.role==='resident'||!actor.can_release&&actor.role!=='admin'){await store.patch('ac_jobs',{id:'eq.'+job.id,status:'eq.leased'},{status:'rejected',completed_at:new Date().toISOString(),result:{reason:'Permissão revogada antes da execução.',physicalState:'unknown'}});continue;}
          allowed.push({id:job.id,leaseId:job.lease_id,deviceId:device.id,gate:device.gate,provider:device.provider,expiresAt:job.expires_at,reason:job.reason});
        }return response({jobs:allowed,serverTime:new Date().toISOString()});
      }
      if(path==='/v1/gateway/ack'){
        exactKeys(data,['requestId','sentAt','jobId','leaseId','status','vendorCode'],['requestId','sentAt','jobId','leaseId','status']);uuid(data.jobId);uuid(data.leaseId);if(!['accepted','rejected','unknown'].includes(String(data.status)))throw new HttpError(400,'Estado inválido.');
        const [job]=await store.select('ac_jobs',{id:'eq.'+data.jobId,gateway_id:'eq.'+gateway.id,lease_id:'eq.'+data.leaseId},'*',1);if(!job)throw new HttpError(404,'Comando não encontrado.');if(job.status!=='leased')return response({status:job.status,physicalState:'unknown'});
        const [updated]=await store.patch('ac_jobs',{id:'eq.'+job.id,status:'eq.leased',lease_id:'eq.'+data.leaseId},{status:data.status,completed_at:new Date().toISOString(),result:{vendorCode:typeof data.vendorCode==='string'?data.vendorCode.slice(0,80):null,physicalState:'unknown'}});return response({status:updated?.status||job.status,physicalState:'unknown'});
      }
      if(path==='/v1/gateway/identify'){
        exactKeys(data,['requestId','sentAt','eventId','deviceId','method','identifier','purpose']);const eventId=text(data.eventId,'eventId',180),deviceId=text(data.deviceId,'deviceId',100),identifier=text(data.identifier,'identifier',250),purpose=String(data.purpose),method=String(data.method);
        const [device]:Device[]=await store.select('ac_devices',{id:'eq.'+deviceId,gateway_id:'eq.'+gateway.id,condominium_id:'eq.'+gateway.condominium_id},'*',1);if(!device||!device.methods.includes(method)||!['authorization-request','observation'].includes(purpose))throw new HttpError(403,'Dispositivo ou finalidade sem permissão.');
        const hash=await sha256(JSON.stringify({eventId,deviceId,method,identifier,purpose}));
        for(let attempt=0;attempt<3;attempt++){
          const snapshot=await store.state(gateway.condominium_id);let credential;let result:any={...denied,reason:purpose==='observation'?'Evento registrado somente para auditoria.':'Equipamento não habilitado ou não homologado.'};
          if(purpose==='authorization-request'&&device.enabled&&device.commissioned&&device.mode==='online'){
            let value=method==='plate'?normalizePlate(identifier):identifier;
            if(method==='face'){const [binding]=await store.select('ac_bindings',{device_id:'eq.'+device.id,condominium_id:'eq.'+gateway.condominium_id,method:'eq.face',external_id:'eq.'+identifier},'*',1);credential=binding?snapshot.body.credentials.find(c=>c.id===binding.credential_id):undefined;value=credential?.faceRef||'';}
            const evaluation=evaluateAccess(snapshot.body.credentials,{method:method as 'face'|'plate'|'code',value,gate:device.gate});credential=evaluation.credential;
            result={allowed:evaluation.allowed,reason:evaluation.reason,physicalState:'unknown',expiresAt:new Date(Math.min(Date.now()+4000,credential?Date.parse(credential.validUntil):Date.now())).toISOString(),deviceId:device.id,gate:device.gate};
            if(result.allowed){const target=device.actuator_id||device.id;const [actuator]=await store.select('ac_devices',{id:'eq.'+target,gateway_id:'eq.'+gateway.id,condominium_id:'eq.'+gateway.condominium_id,enabled:'eq.true',commissioned:'eq.true'},'*',1);if(!actuator||actuator.gate!==device.gate)result={...denied,reason:'Controladora não habilitada para este acesso.'};else result.actuatorId=actuator.id;}
          }
          const next=structuredClone(snapshot.body);audit(next,purpose==='observation'?'Identificação observada':result.allowed?'Autorização de equipamento emitida':'Acesso negado',device.name+' · '+result.reason,credential?.unit,'access');
          try{return response(await store.rpc('ac_commit_decision',{p_gateway:gateway.id,p_device:device.id,p_event:eventId,p_hash:hash,p_purpose:purpose,p_revision:snapshot.revision,p_body:next,p_result:result,p_credential:credential?.id||null,p_expires:result.expiresAt||null}));}catch(e){if(!(e instanceof HttpError)||e.message!=='REVISION_CONFLICT'||attempt===2)throw e;}
        }
      }
      throw new HttpError(404,'Rota de gateway não encontrada.');
    }
    const token=bearer(req),authUser=await store.authUser(token),member=await store.member(authUser.id);const directory=await store.directory(member.condominium_id);
    if(req.method==='POST'&&path==='/v1/auth/logout'){await store.revoke(token);return response(null,204);}
    if(req.method==='GET'&&path==='/v1/state'){const [condominium]=await store.select('ac_condominiums',{id:'eq.'+member.condominium_id},'name',1);return response({...scopedState((await store.state(member.condominium_id)).body,member,directory),condominiumName:condominium?.name||'Condomínio'});}
    if(req.method==='POST'&&path==='/v1/commands'){
      const {data}=await readBody(req);exactKeys(data,['type','requestId','payload']);uuid(data.requestId);const hash=await sha256(JSON.stringify(data));const prior=await store.select('ac_requests',{actor_id:'eq.user:'+member.user_id,request_id:'eq.'+data.requestId},'*',1);if(prior.length){if(prior[0].payload_hash!==hash)throw new HttpError(409,'IDEMPOTENCY_CONFLICT');return response(scopedState((await store.state(member.condominium_id)).body,member,directory));}
      for(let attempt=0;attempt<3;attempt++){const snapshot=await store.state(member.condominium_id),next=applyCommand(snapshot.body,member,data as Command,directory);try{const committed=await store.commit(member.condominium_id,snapshot.revision,next,'user:'+member.user_id,uuid(data.requestId),hash);return response(scopedState(committed.body,member,directory));}catch(e){if(!(e instanceof HttpError)||e.message!=='REVISION_CONFLICT'||attempt===2)throw e;}}
    }
    if(req.method==='GET'&&path==='/v1/integrations'){
      requireDesk(member);const devices=await store.select('ac_devices',{condominium_id:'eq.'+member.condominium_id},'*',1000),gateways=await store.select('ac_gateways',{condominium_id:'eq.'+member.condominium_id},'id,name,enabled,last_seen',1000),jobs=await store.select('ac_jobs',{condominium_id:'eq.'+member.condominium_id,order:'created_at.desc'},'id,device_id,gate,status,created_at,completed_at,result',20);return response({devices,gateways,jobs,canRelease:member.role==='admin'||member.can_release,admin:member.role==='admin',localAccounts:!!localAccounts,...(localAccounts&&member.role==='admin'?{members:await localAccounts.list(member)}:{})});
    }
    if(req.method==='POST'&&path==='/v1/gates/release'){
      requireDesk(member);const {data}=await readBody(req);exactKeys(data,['deviceId','requestId','reason']);uuid(data.requestId);const reason=text(data.reason,'reason',300,8);const job=await store.rpc('ac_enqueue_job',{p_actor:member.user_id,p_device:text(data.deviceId,'deviceId',100),p_request:uuid(data.requestId),p_hash:await sha256(JSON.stringify(data)),p_reason:reason});return response({id:job.id,status:job.status,expiresAt:job.expires_at,physicalState:'unknown'},202);
    }
    if(path.startsWith('/v1/admin/')){
      requireAdmin(member);if(req.method!=='POST')throw new HttpError(405,'Método não permitido.');const {data}=await readBody(req);
      if(path==='/v1/admin/local-accounts'&&localAccounts)return response(await localAccounts.create(member,data),201);
      if(path==='/v1/admin/local-account-status'&&localAccounts)return response(await localAccounts.status(member,data));
      if(path==='/v1/admin/memberships'){
        exactKeys(data,['userId','role','name','unit','enabled','canRelease']);const userId=uuid(data.userId);if(userId===member.user_id)throw new HttpError(400,'O administrador não pode alterar o próprio vínculo por esta operação.');
        if(!['desk','resident'].includes(String(data.role))||typeof data.enabled!=='boolean'||typeof data.canRelease!=='boolean')throw new HttpError(400,'Vínculo inválido.');
        const unit=data.role==='resident'?text(data.unit,'unit',100):null;const account=await store.authAccount(userId);if(!account?.id||!account.email_confirmed_at)throw new HttpError(400,'A conta deve existir e ter o e-mail confirmado no serviço de autenticação.');
        const [existing]=await store.select('ac_memberships',{user_id:'eq.'+userId},'*',1);if(existing&&existing.condominium_id!==member.condominium_id)throw new HttpError(409,'Conta vinculada a outro condomínio.');
        const values={condominium_id:member.condominium_id,role:data.role,name:text(data.name,'name',100,2),unit,enabled:data.enabled,can_release:data.role==='desk'&&data.canRelease};
        return response(existing?await store.patch('ac_memberships',{user_id:'eq.'+userId,condominium_id:'eq.'+member.condominium_id},values):await store.insert('ac_memberships',{...values,user_id:userId}),existing?200:201);
      }
      if(path==='/v1/admin/revoke-credential'){
        exactKeys(data,['id']);const credentialId=text(data.id,'id',100);for(let attempt=0;attempt<3;attempt++){const snapshot=await store.state(member.condominium_id),next=structuredClone(snapshot.body),credential=next.credentials.find(c=>c.id===credentialId);if(!credential)throw new HttpError(404,'Credencial não encontrada.');credential.revoked=true;audit(next,'Credencial bloqueada',credential.name,credential.unit);try{await store.commit(member.condominium_id,snapshot.revision,next,'admin:'+member.user_id,crypto.randomUUID(),await sha256('revoke:'+credentialId));return response({revoked:true})}catch(e){if(!(e instanceof HttpError)||e.message!=='REVISION_CONFLICT'||attempt===2)throw e;}}
      }
      if(path==='/v1/admin/gateways'){
        exactKeys(data,['name']);const gatewayToken='acgw_'+opaqueCode().slice(3).toLowerCase()+opaqueCode().slice(3).toLowerCase();const [row]=await store.insert('ac_gateways',{condominium_id:member.condominium_id,name:text(data.name,'name',100),token_hash:await sha256(gatewayToken),enabled:false});return response({id:row.id,token:gatewayToken,enabled:false},201);
      }
      if(path==='/v1/admin/devices'){
        exactKeys(data,['id','gatewayId','provider','name','model','gate','methods','mode','actuatorId'],['id','gatewayId','provider','name','model','gate','methods','mode']);uuid(data.gatewayId);const [gateway]=await store.select('ac_gateways',{id:'eq.'+data.gatewayId,condominium_id:'eq.'+member.condominium_id},'id',1);if(!gateway)throw new HttpError(403,'Gateway de outro condomínio.');
        if(!['controlid','intelbras','hikvision','dahua','zkteco','generic'].includes(String(data.provider))||!['online','monitor'].includes(String(data.mode))||!Array.isArray(data.methods)||!data.methods.length||data.methods.some((m:unknown)=>!['face','plate','code'].includes(String(m))))throw new HttpError(400,'Protocolo inválido.');const deviceId=text(data.id,'id',100);if(!/^[a-z0-9_-]+$/.test(deviceId))throw new HttpError(400,'Identificador de dispositivo inválido.');
        if(data.actuatorId){const [actuator]=await store.select('ac_devices',{id:'eq.'+text(data.actuatorId,'actuatorId',100),gateway_id:'eq.'+data.gatewayId,condominium_id:'eq.'+member.condominium_id,gate:'eq.'+text(data.gate,'gate',60)},'id',1);if(!actuator)throw new HttpError(400,'Controladora deve pertencer ao mesmo gateway e acesso.');}
        return response(await store.insert('ac_devices',{id:deviceId,condominium_id:member.condominium_id,gateway_id:data.gatewayId,provider:data.provider,name:text(data.name,'name',100),model:text(data.model,'model',100),gate:text(data.gate,'gate',60),methods:data.methods,mode:data.mode,enabled:false,commissioned:false,actuator_id:data.actuatorId||null}),201);
      }
      if(path==='/v1/admin/credentials'){
        const credential=createCredential(data,directory);for(let attempt=0;attempt<3;attempt++){const snapshot=await store.state(member.condominium_id);if(snapshot.body.credentials.some(c=>c.code===credential.code||credential.faceRef&&c.faceRef===credential.faceRef||credential.plate&&c.plate===credential.plate))throw new HttpError(409,'Identificador já cadastrado.');const next=structuredClone(snapshot.body);next.credentials.push(credential);audit(next,'Credencial cadastrada',credential.name,credential.unit);try{await store.commit(member.condominium_id,snapshot.revision,next,'admin:'+member.user_id,crypto.randomUUID(),await sha256(JSON.stringify(credential)));return response(credential,201)}catch(e){if(!(e instanceof HttpError)||e.message!=='REVISION_CONFLICT'||attempt===2)throw e;}}
      }
      if(path==='/v1/admin/bindings'){
        exactKeys(data,['deviceId','externalId','credentialId']);const [device]=await store.select('ac_devices',{id:'eq.'+text(data.deviceId,'deviceId',100),condominium_id:'eq.'+member.condominium_id},'id,methods',1),snapshot=await store.state(member.condominium_id);if(!device||!device.methods.includes('face')||!snapshot.body.credentials.some(c=>c.id===data.credentialId&&c.faceRef))throw new HttpError(400,'Dispositivo ou credencial inválidos.');return response(await store.insert('ac_bindings',{condominium_id:member.condominium_id,device_id:device.id,method:'face',external_id:text(data.externalId,'externalId',120),credential_id:data.credentialId}),201);
      }
      // Commissioning is deliberately a separate administrator operation.
      if(path==='/v1/admin/commission'){
        exactKeys(data,['deviceId','enabled','commissioned','gatewayEnabled']);if(typeof data.enabled!=='boolean'||typeof data.commissioned!=='boolean'||typeof data.gatewayEnabled!=='boolean')throw new HttpError(400,'Estado inválido.');const [device]=await store.select('ac_devices',{id:'eq.'+text(data.deviceId,'deviceId',100),condominium_id:'eq.'+member.condominium_id},'id,gateway_id',1);if(!device)throw new HttpError(404,'Dispositivo não encontrado.');await store.patch('ac_devices',{id:'eq.'+device.id},{enabled:data.enabled,commissioned:data.commissioned});await store.patch('ac_gateways',{id:'eq.'+device.gateway_id},{enabled:data.gatewayEnabled});return response({configured:true});
      }
      throw new HttpError(404,'Operação administrativa não encontrada.');
    }
    throw new HttpError(404,'Rota não encontrada.');
  }catch(e){const error=e instanceof HttpError?e:new HttpError(503,'Serviço temporariamente indisponível.');return response({error:error.message},error.status);}
}}
