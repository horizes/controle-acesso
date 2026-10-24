import http from 'node:http';
import https from 'node:https';
import {readFileSync,existsSync,statSync,createReadStream} from 'node:fs';
import {Readable} from 'node:stream';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {createHandler,HttpError} from './build/api.mjs';
import {LocalStore} from './store.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.ttf':'font/ttf','.webmanifest':'application/manifest+json'};
function localHost(value){return value==='localhost'||value==='127.0.0.1'||value==='[::1]'||/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(value)&&/^\d+\.\d+\.\d+\.\d+$/.test(value)}

export async function startLocal(config,{store:providedStore}={}){
 const configDir=path.resolve(config.baseDir||root),file=p=>path.resolve(configDir,p),store=providedStore||new LocalStore(file(config.database||'private/imperium.sqlite'));
 const secure=!!config.tls,host=config.listenHost||'127.0.0.1',port=config.port??8443;
 if(!secure&&!['127.0.0.1','::1','localhost'].includes(host))throw Error('Acesso pela rede exige HTTPS com certificado confiável. HTTP só é aceito no próprio computador.');
 if(!['127.0.0.1','::1','localhost','0.0.0.0'].includes(host)&&!localHost(host))throw Error('Escuta deve estar na rede privada.');
 const origins=config.origins||[];if(!origins.length)throw Error('Configure os endereços locais permitidos.');
 for(const origin of origins){const u=new URL(origin);if(!localHost(u.hostname)||u.origin!==origin||u.protocol!==(secure?'https:':'http:'))throw Error('Origem local inválida.');}
 if(!store.rows('ac_condominiums').length)throw Error('Inicialize o condomínio com local/manage.mjs init antes de iniciar.');
 const handler=createHandler({store,allowedOrigins:origins,localAccounts:store.localAccounts()}),web=path.resolve(root,'local/build/web');
 const dispatch=async(req,res)=>{
  const reply=(status,body,type='text/plain; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body)};
  try{
   if(!origins.some(o=>new URL(o).host===req.headers.host))return reply(421,'Endereço local não autorizado.');
   const url=new URL(req.url,origins[0]),pathname=decodeURIComponent(url.pathname);
   if(pathname.startsWith('/api/')){
    store.checkClock();
    if(pathname==='/api/v1/auth/login'&&!await store.rpc('ac_rate_limit',{p_bucket:'local-ip:'+req.socket.remoteAddress,p_limit:30,p_seconds:60}))return reply(429,JSON.stringify({error:'Aguarde antes de tentar novamente.'}),'application/json');
    const incoming=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Readable.toWeb(req),duplex:'half'}:{})});
    const result=await handler(incoming);res.writeHead(result.status,Object.fromEntries(result.headers));return res.end(Buffer.from(await result.arrayBuffer()));
   }
   if(!['GET','HEAD'].includes(req.method))return reply(405,'Método não permitido.');
   if(pathname==='/runtime-config.js')return reply(200,'window.IMPERIUM_CONFIG=Object.freeze({apiBaseUrl:location.origin+"/api",operationalApiBaseUrl:location.origin+"/api",localMode:true,requestTimeoutMs:10000,refreshIntervalMs:5000});','text/javascript; charset=utf-8');
   // Service workers from earlier deployments must never serve stale cloud configuration.
   if(pathname==='/sw.js')return reply(200,"self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n.startsWith('imperium')).map(n=>caches.delete(n)))).then(()=>self.registration.unregister()).then(()=>self.clients.claim())));",'text/javascript; charset=utf-8');
   if(!/^\/(?:$|index\.html$|(?:assets|brand|icons|fonts)\/[a-zA-Z0-9_.\/-]+$|manifest(?:-operacao)?\.webmanifest$)/.test(pathname)||pathname.split('/').some(p=>p==='..'||p.startsWith('.')))return reply(404,'Arquivo não encontrado.');
   const target=path.resolve(web,'.'+(pathname==='/'?'/index.html':pathname));
   if(!target.startsWith(web+path.sep)||!existsSync(target)||!statSync(target).isFile())return reply(404,'Arquivo não encontrado.');
   res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'",'Referrer-Policy':'no-referrer'});
   if(req.method==='HEAD')res.end();else createReadStream(target).pipe(res);
  }catch(e){reply(e instanceof HttpError?e.status:503,JSON.stringify({error:e instanceof HttpError?e.message:'Serviço local indisponível.'}),'application/json')}
 };
 const tls=config.tls&&(config.tls.pfx?{pfx:readFileSync(file(config.tls.pfx)),passphrase:config.tls.passphrase,minVersion:'TLSv1.2'}:{key:readFileSync(file(config.tls.key)),cert:readFileSync(file(config.tls.cert)),minVersion:'TLSv1.2'});
 const server=secure?https.createServer(tls,dispatch):http.createServer(dispatch);server.requestTimeout=15000;server.headersTimeout=10000;server.maxConnections=200;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve)});
 let child,stopped=false,timer;
 const startGateway=()=>{
  if(stopped||!config.gateway?.enabled)return;
  const privateConfig=JSON.parse(readFileSync(file(config.gateway.config),'utf8')),secrets=JSON.parse(readFileSync(file(config.gateway.secrets),'utf8')),api=new URL(privateConfig.apiBaseUrl);
  if(!['127.0.0.1','localhost','[::1]'].includes(api.hostname)||!origins.includes(api.origin)||api.pathname!=='/api')throw Error('O gateway local deve consultar somente a API deste computador.');
  for(const d of privateConfig.devices||[]){if(d.allowPublicEndpoint||d.baseUrl&&!localHost(new URL(d.baseUrl).hostname)||d.host&&!localHost(d.host))throw Error('O perfil local aceita somente equipamentos da rede privada.');}
  const env={...process.env};for(const [k,v] of Object.entries(secrets)){if(!/^[A-Z][A-Z0-9_]{1,80}$/.test(k)||typeof v!=='string')throw Error('Variável privada inválida.');env[k]=v;}
  if(config.gateway.ca)env.NODE_EXTRA_CA_CERTS=file(config.gateway.ca);
  child=spawn(process.execPath,[path.join(root,'gateway/run.mjs'),file(config.gateway.config)],{cwd:root,env,stdio:['ignore','inherit','inherit'],windowsHide:true});
  child.on('exit',()=>{if(!stopped)timer=setTimeout(startGateway,5000)});child.on('error',()=>console.error('Gateway local não iniciou. Confira a configuração privada.'));
 };
 try{startGateway()}catch(e){await new Promise(r=>server.close(r));if(!providedStore)store.close();throw e}
 return {server,store,address:server.address(),close:async()=>{stopped=true;clearTimeout(timer);child?.kill();server.closeIdleConnections();await new Promise(r=>server.close(r));if(!providedStore)store.close()}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const configFile=path.resolve(process.argv[2]||path.join(root,'private/config.private.json'));
 try{const config=JSON.parse(readFileSync(configFile,'utf8'));config.baseDir=path.dirname(configFile);const app=await startLocal(config);console.log('Imperium local disponível. Banco, autenticação e decisões estão neste computador.');for(const origin of config.origins)console.log(origin+'/#portaria');for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void app.close().then(()=>process.exit(0)));}catch(e){console.error(e.message);process.exitCode=1;}
}
