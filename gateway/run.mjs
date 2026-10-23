import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {setTimeout as sleep} from 'node:timers/promises';
import {isIP} from 'node:net';
import {GatewayClient} from './client.mjs';
import {Journal} from './journal.mjs';
import {executeJob} from './worker.mjs';
import {callbackHandler} from './callbacks.mjs';
import {watchIntelbras} from './streams.mjs';

const configPath=process.argv[2];if(!configPath)throw Error('Informe o caminho de um arquivo de configuração privado.');
const config=JSON.parse(readFileSync(configPath,'utf8'));
if(!Array.isArray(config.devices)||config.devices.some(d=>!d.id||!d.gate||!d.provider||'password'in d||'token'in d||'username'in d))throw Error('Configuração inválida: use referências de variáveis de ambiente para credenciais.');
if(new Set(config.devices.map(d=>d.id)).size!==config.devices.length)throw Error('Identificador de dispositivo duplicado.');
const token=process.env[config.gatewayTokenEnv||'IMPERIUM_GATEWAY_TOKEN']||'';
const client=new GatewayClient(config.apiBaseUrl,token),journal=new Journal(config.journalFile||'/data/imperium.sqlite');
const physicalEnabled=config.physicalEnabled===true&&process.env.IMPERIUM_ENABLE_PHYSICAL==='yes';
const context={client,journal,devices:config.devices,physicalEnabled,env:process.env};
const controller=new AbortController();let server;
if(config.callbackListen){const host=config.callbackListen.host;if(isIP(host)!==4||!(/^(10\.|127\.|192\.168\.)/.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host)))throw Error('Callbacks devem ouvir apenas no endereço privado da VPN/rede.');server=createServer(callbackHandler(context));server.requestTimeout=5000;server.headersTimeout=5000;server.listen(config.callbackListen.port||8765,host);}
for(const device of config.devices.filter(d=>d.watchEvents===true&&d.provider==='intelbras'))void(async()=>{let backoff=2000;while(!controller.signal.aborted){try{await watchIntelbras(device,context,controller.signal);backoff=2000}catch{console.error(JSON.stringify({event:'device-stream-unavailable',deviceId:device.id}));}try{await sleep(backoff,undefined,{signal:controller.signal})}catch{}backoff=Math.min(backoff*2,60000)}})();
process.on('SIGTERM',()=>controller.abort());process.on('SIGINT',()=>controller.abort());
console.log(JSON.stringify({event:'gateway-started',mode:physicalEnabled?'physical-enabled':'dry-run',devices:config.devices.length}));
try{while(!controller.signal.aborted){try{const response=await client.post('/v1/gateway/poll');for(const job of response.jobs||[]){const result=await executeJob(job,context);console.log(JSON.stringify({event:'command-result',commandId:job.id,status:result.status,physicalState:'unknown'}));}}catch{console.error(JSON.stringify({event:'api-unavailable'}));}try{await sleep(2000,undefined,{signal:controller.signal})}catch{}}}finally{server?.close();journal.close();}
