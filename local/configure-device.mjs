import {catalog,ask,savePrivate,loadEquipmentContext} from './equipment-tools.mjs';
import {deviceUrl} from '../gateway/transport.mjs';
import {controlIdAction} from '../gateway/adapters.mjs';
import {createHash} from 'node:crypto';
import {isIP} from 'node:net';

try{
 const context=loadEquipmentContext(),{deviceConfig,env,base,apiTransport,gatewayClient}=context;
 console.log('Cadastro de equipamento · central local. Nenhum portão será acionado.');
 catalog.profiles.forEach((p,i)=>console.log(`${i+1}. ${p.label}`));
 const profile=catalog.profiles[Number(await ask('Número do perfil: '))-1];if(!profile)throw Error('Perfil inválido.');
 console.log(profile.requirement);if(['hcnetsdk','licensed-bridge'].includes(profile.protocol))throw Error('Este perfil exige instalação do SDK/ponte pelo integrador. Consulte COMPATIBILIDADE.md.');
 const id=await ask('Identificador único (letras minúsculas, números e hífen): ');if(!/^[a-z0-9_-]{1,60}$/.test(id)||deviceConfig.devices.some(d=>d.id===id))throw Error('Identificador inválido ou já existente.');
 const name=await ask('Nome do equipamento: '),model=await ask('Modelo completo da etiqueta: '),firmware=await ask('Versão do firmware: '),gate=await ask('Acesso (social, garagem, etc.): ');if(!name||!model||!firmware||!gate||model.length>100||name.length>100||gate.length>60)throw Error('Informe modelo, firmware, nome e acesso válidos.');
 const device={id,name,model,firmware,gate,profileId:profile.id,provider:profile.provider,protocol:profile.protocol,enabled:false,commissioned:false,...profile.defaults};
 const prefix='IMP_'+id.toUpperCase().replace(/[^A-Z0-9]/g,'_')+'_'+createHash('sha256').update(id).digest('hex').slice(0,6).toUpperCase();
 if(profile.protocol==='signed-events'){
  const sourceIp=await ask('IPv4 privado do produtor homologado: ');deviceUrl({baseUrl:'http://'+sourceIp},'/');device.sourceIp=sourceIp;
  device.eventSecretEnv=prefix+'_EVENT_SECRET';const {randomBytes}=await import('node:crypto');env[device.eventSecretEnv]=randomBytes(32).toString('hex');console.log('Chave do produtor criada no arquivo privado. Configure-a por canal privado no conector SDK.');
 }else{
  device.baseUrl=await ask('Endereço local do aparelho/servidor (http://IP ou https://IP): ');const url=deviceUrl(device,'/');device.sourceIp=url.hostname;
  if(profile.protocol==='zkbio-cvsecurity'){device.tokenEnv=prefix+'_API_TOKEN';env[device.tokenEnv]=await ask('Token da API CVSecurity: ',true);device.doorId=await ask('doorId conforme CVSecurity: ');}
  else{device.usernameEnv=prefix+'_USERNAME';device.passwordEnv=prefix+'_PASSWORD';env[device.usernameEnv]=await ask('Usuário de integração no aparelho: ');env[device.passwordEnv]=await ask('Senha de integração: ',true);}
 }
 if('channel'in device){device.channel=Number(await ask('Canal/porta (padrão 1): ')||1);if(!Number.isInteger(device.channel)||device.channel<1||device.channel>64)throw Error('Canal inválido.');}
 if(profile.role==='face-online'){
  device.vendorDeviceId=await ask('device_id informado pelo leitor: ');device.portalId=Number(await ask('portal_id (padrão 1): ')||1);
  const identifier=await ask('identifier_id facial confirmado (deixe vazio para configurar depois): ');device.faceIdentifierIds=identifier?[identifier]:[];
  const action=await ask('Ação documentada do aparelho: door ou sec_box (padrão door): ')||'door';if(!['door','sec_box'].includes(action))throw Error('Ação inválida.');device.action=action;if(action==='door')device.door=Number(await ask('Número da porta (padrão 1): ')||1);else device.secBoxId=await ask('ID da SecBox: ');
  controlIdAction(device);if(!/^\d{1,20}$/.test(device.vendorDeviceId)||!Number.isSafeInteger(device.portalId)||device.portalId<1||device.faceIdentifierIds.some(v=>!/^\d{1,10}$/.test(v)))throw Error('Identificadores do leitor inválidos.');
 }
 if(['face-reader','plate-reader'].includes(profile.role)){
  const candidates=deviceConfig.devices.filter(d=>d.id!==id&&d.gate===gate&&['http-cgi','dahua-cgi','hikvision-isapi','controlid-online','zkbio-cvsecurity','hcnetsdk','licensed-bridge'].includes(d.protocol)&&!d.watchEvents);
  if(!candidates.length)throw Error('Cadastre primeiro uma controladora independente para este acesso.');console.log('Controladoras: '+candidates.map(d=>d.id).join(', '));
  device.actuatorId=await ask('Identificador da controladora vinculada: ');if(!candidates.some(d=>d.id===device.actuatorId))throw Error('Controladora inválida para este acesso.');
 }
 if(device.provider==='hikvision'&&profile.role!=='actuator'){
  const mode=(await ask('Eventos ISAPI: conexão contínua ou HTTP Listening? Digite S ou P (padrão S): ')||'S').toUpperCase();if(!['S','P'].includes(mode))throw Error('Modo de eventos inválido.');device.watchEvents=mode==='S';device.eventTransport=mode==='S'?'stream':'push';
 }
 if(device.protocol==='controlid-online'||device.protocol==='signed-events'||device.eventTransport==='push'){
  if(!deviceConfig.callbackListen){const suggested=context.config.origins.map(o=>new URL(o).hostname).find(h=>isIP(h)===4&&!h.startsWith('127.'))||'',host=await ask('IPv4 fixo da central para callbacks'+(suggested?' (padrão '+suggested+')':'')+': ')||suggested;if(isIP(host)!==4||host.startsWith('127.'))throw Error('Informe o IPv4 da central na LAN.');deviceUrl({baseUrl:'http://'+host},'/');deviceConfig.callbackListen={host,port:8765};}
  console.log('Callback a configurar no aparelho/produtor: http://'+deviceConfig.callbackListen.host+':'+deviceConfig.callbackListen.port+'/callbacks/'+id+(device.eventTransport==='push'?'/events':device.protocol==='signed-events'?'/recognition':''));
  console.log('Após o cadastro, o administrador Windows pode executar local/Configurar-Callbacks.ps1 para liberar somente os IPs configurados.');
 }
 // Registration is authenticated; credentials for the device never enter the API.
 const email=await ask('E-mail do administrador local: '),password=await ask('Senha do administrador local: ',true);
 const login=await apiTransport(base.href+'/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,role:'desk'})}),auth=await login.json();if(!login.ok||!auth.user?.capabilities?.admin)throw Error('Login de administrador recusado.');
 try{
  const status=await gatewayClient.post('/v1/gateway/status');
  const response=await apiTransport(base.href+'/v1/admin/devices',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth.accessToken},body:JSON.stringify({id,name,model,provider:device.provider,gatewayId:status.gatewayId,gate,methods:[profile.method],mode:profile.role==='actuator'?'monitor':'online',...(device.actuatorId?{actuatorId:device.actuatorId}:{})})});if(!response.ok)throw Error((await response.json()).error||'Cadastro recusado.');
  const secrets={...context.privateSecrets};
  for(const key of [device.usernameEnv,device.passwordEnv,device.tokenEnv,device.eventSecretEnv].filter(Boolean))secrets[key]=env[key];
  savePrivate('gateway-secrets.private.json',secrets);deviceConfig.devices.push(device);savePrivate('gateway.private.json',deviceConfig);
  console.log('Equipamento cadastrado e desativado. Reinicie a central, execute a verificação e siga o ensaio de comissionamento.');
 }finally{try{await apiTransport(base.href+'/v1/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+auth.accessToken},body:'{}'})}catch{}}
}catch(e){console.error(e.message);process.exitCode=1}
