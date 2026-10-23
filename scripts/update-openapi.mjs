import {readFileSync,writeFileSync} from 'node:fs';
const file='public/api/openapi.json',api=JSON.parse(readFileSync(file,'utf8'));
api.info={title:'Imperium Controle de Acesso',version:'2.0.0',description:'API implantada. Autenticação própria Supabase Auth e gateway HMAC; equipamentos exigem homologação.'};
api.servers=[{url:'https://abweepruixcyetrzefhk.supabase.co/functions/v1/access-api'}];
api.components.securitySchemes.gatewayToken={type:'http',scheme:'bearer',description:'Token exclusivo acgw_ do gateway'};
api.components.securitySchemes.gatewayHmac={type:'apiKey',in:'header',name:'X-Gateway-Signature',description:'Hex HMAC-SHA256 sobre POST + newline + caminho lógico + newline + corpo original; chave = token do gateway'};
const string={type:'string'},uuid={type:'string',format:'uuid'},bool={type:'boolean'},iso={type:'string',format:'date-time'};
const object=(properties,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
const add=(path,summary,body,security=api.security,status='200')=>{api.paths[path]={[body?'post':'get']:{summary,security,...(body?{requestBody:{required:true,content:{'application/json':{schema:body}}}}:{}),responses:{[status]:{description:'Sucesso; ver API.md para campos e restrições'},'400':{description:'Corpo inválido'},'401':{description:'Autenticação inválida'},'403':{description:'Sem permissão'},'409':{description:'Conflito/repetição ou equipamento indisponível'}}}}};
add('/v1/health','Saúde sem dados operacionais',null,[]);
add('/v1/integrations','Portaria: equipamentos, gateways e comandos',null);
add('/v1/gates/release','Liberação manual com motivo; exige permissão e gateway online',object({deviceId:string,reason:{type:'string',minLength:8,maxLength:300},requestId:uuid}),api.security,'202');
const admin={
 gateways:object({name:string}),
 devices:object({id:string,gatewayId:uuid,provider:{enum:['controlid','intelbras','hikvision','zkteco','dahua','generic']},name:string,model:string,gate:string,methods:{type:'array',minItems:1,items:{enum:['face','plate','code']}},mode:{enum:['online','monitor']},actuatorId:string},['id','gatewayId','provider','name','model','gate','methods','mode']),
 memberships:object({userId:uuid,role:{enum:['desk','resident']},name:string,unit:{type:['string','null']},enabled:bool,canRelease:bool}),
 credentials:object({name:string,unit:string,profile:{enum:['Morador','Visitante','Prestador']},faceRef:string,plate:string,validFrom:iso,validUntil:iso,gates:{type:'array',items:string,minItems:1}},['name','unit','profile','validFrom','validUntil','gates']),
 bindings:object({deviceId:string,externalId:string,credentialId:string}),
 'revoke-credential':object({id:string}),
 commission:object({deviceId:string,enabled:bool,commissioned:bool,gatewayEnabled:bool})
};for(const [path,body]of Object.entries(admin))add('/v1/admin/'+path,'Somente administrador: '+path,body,api.security,['devices','gateways','credentials','bindings'].includes(path)?'201':'200');
const base={requestId:uuid,sentAt:iso},security=[{gatewayToken:[],gatewayHmac:[]}];
add('/v1/gateway/poll','Heartbeat e lease; nunca reenvia lease em timeout',object(base),security);
add('/v1/gateway/ack','Confirma resultado sem afirmar posição física',object({...base,jobId:uuid,leaseId:uuid,status:{enum:['accepted','rejected','unknown']},vendorCode:string},['requestId','sentAt','jobId','leaseId','status']),security);
add('/v1/gateway/identify','Valida identificação com prazo; observação nunca autoriza',object({...base,eventId:string,deviceId:string,method:{enum:['face','plate','code']},identifier:string,purpose:{enum:['authorization-request','observation']}}),security);
writeFileSync(file,JSON.stringify(api,null,2)+'\n');
