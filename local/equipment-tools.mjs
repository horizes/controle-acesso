import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {GatewayClient} from '../gateway/client.mjs';

export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),privateDir=path.join(root,'private');
export const catalog=JSON.parse(readFileSync(path.join(root,'gateway/installation/catalog.json'),'utf8'));
export async function ask(label,secret=false){let muted=false;const output=new Writable({write(chunk,encoding,done){if(!muted)process.stdout.write(chunk);done()}}),rl=createInterface({input:process.stdin,output,terminal:process.stdin.isTTY}),answer=rl.question(label);muted=secret;try{const value=await answer;return secret?value:value.trim()}finally{rl.close();if(secret)process.stdout.write('\n')}}
export function savePrivate(name,value){if(!/^[a-z-]+\.private\.json$/.test(name))throw Error('Arquivo privado inválido.');const target=path.join(privateDir,name),temp=target+'.tmp';writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});renameSync(temp,target)}
export function loadEquipmentContext(){
 const config=JSON.parse(readFileSync(path.join(privateDir,'config.private.json'),'utf8'));if(config.gateway.config!=='gateway.private.json'||config.gateway.secrets!=='gateway-secrets.private.json')throw Error('Configuração personalizada: usar procedimento manual do integrador.');
 const deviceConfig=JSON.parse(readFileSync(path.resolve(privateDir,config.gateway.config),'utf8')),privateSecrets=JSON.parse(readFileSync(path.resolve(privateDir,config.gateway.secrets),'utf8')),env={...process.env,...privateSecrets},base=new URL(deviceConfig.apiBaseUrl);
 if(!['127.0.0.1','localhost','[::1]'].includes(base.hostname)||base.pathname!=='/api')throw Error('Este assistente só configura a central local.');
 const ca=config.gateway.ca?[...tls.rootCertificates,readFileSync(path.resolve(privateDir,config.gateway.ca),'utf8')]:undefined;
 const apiTransport=(input,options={})=>new Promise((resolve,reject)=>{
  const url=new URL(input);if(url.origin!==base.origin||!url.pathname.startsWith('/api/v1/'))return reject(Error('API fora da central local.'));
  const request=(url.protocol==='https:'?https:http).request(url,{method:options.method||'GET',headers:options.headers,ca,signal:options.signal,timeout:10000},response=>{const chunks=[];let size=0;response.on('data',c=>{size+=c.length;if(size>262144){request.destroy(Error('Resposta excessiva.'));return}chunks.push(c)});response.on('end',()=>resolve(new Response([204,205,304].includes(response.statusCode)?null:Buffer.concat(chunks),{status:response.statusCode,headers:response.headers})));response.on('error',reject)});
  request.on('timeout',()=>request.destroy(Error('Tempo de resposta excedido.')));request.on('error',reject);request.end(options.body);
 });
 const gatewayClient=new GatewayClient(base.href,env[deviceConfig.gatewayTokenEnv||'IMPERIUM_GATEWAY_TOKEN'],apiTransport);
 return {config,deviceConfig,privateSecrets,env,apiTransport,gatewayClient,base};
}
export async function loginAdministrator(context){const email=await ask('E-mail do administrador local: '),password=await ask('Senha do administrador local: ',true),response=await context.apiTransport(context.base.href+'/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,role:'desk'})}),auth=await response.json();if(!response.ok||!auth.user?.capabilities?.admin)throw Error('Login de administrador recusado.');return auth.accessToken}
export async function adminOperation(context,token,operation,body){const response=await context.apiTransport(context.base.href+'/v1/admin/'+operation,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)});if(!response.ok)throw Error((await response.json()).error||'Operação recusada.');return response.json()}
export async function logout(context,token){try{await context.apiTransport(context.base.href+'/v1/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+token},body:'{}'})}catch{}}
