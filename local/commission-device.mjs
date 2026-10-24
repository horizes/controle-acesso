import {catalog,ask,savePrivate,loadEquipmentContext,loginAdministrator,adminOperation,logout} from './equipment-tools.mjs';
import {inspectDevice} from '../gateway/preflight.mjs';
try{
 const context=loadEquipmentContext(),{deviceConfig,env}=context;
 console.log('Comissionamento · executar pelo responsável após o ensaio físico local. Este assistente não envia abertura de teste.');
 deviceConfig.devices.forEach(d=>console.log(d.id+' · '+d.name+' · '+d.model));
 const id=await ask('Identificador do equipamento: '),device=deviceConfig.devices.find(d=>d.id===id);if(!device)throw Error('Equipamento não encontrado.');
 const action=(await ask('Habilitar ou desabilitar? Digite H ou D: ')).toUpperCase();if(!['H','D'].includes(action))throw Error('Opção inválida.');const enabling=action==='H',token=await loginAdministrator(context);
 try{
  if(enabling){
   if(!device.model||!device.firmware)throw Error('Registre modelo e firmware antes de homologar.');
   const profile=catalog.profiles.find(p=>p.id===device.profileId);if(!profile)throw Error('Perfil personalizado exige comissionamento manual pelo integrador.');
   const status=await context.gatewayClient.post('/v1/gateway/status'),registered=status.devices.find(d=>d.id===id);if(!registered||registered.provider!==device.provider||registered.gate!==device.gate||(registered.actuator_id||undefined)!==(device.actuatorId||undefined))throw Error('Cadastro da API e configuração privada divergem.');
   const report=await inspectDevice(device,{env});console.log(JSON.stringify(report,null,2));if(report.reachable===false||report.remoteDoor==='not-advertised')throw Error('Resolva a comunicação/protocolo antes de habilitar.');
   if(device.protocol==='controlid-online'&&!device.faceIdentifierIds?.length)throw Error('Informe o identifier_id facial confirmado.');
   if(['face-reader','plate-reader'].includes(profile.role)){
    const target=deviceConfig.devices.find(d=>d.id===device.actuatorId),apiTarget=status.devices.find(d=>d.id===device.actuatorId);if(!target?.enabled||!target.commissioned||!apiTarget?.enabled||!apiTarget.commissioned||target.gate!==device.gate||target.id===device.id)throw Error('Homologue primeiro a controladora independente deste acesso.');
    if((await ask('A abertura automática nativa está desativada e foi testada? Digite SIM: '))!=='SIM')throw Error('Abertura nativa não confirmada.');device.nativeAutomaticOpeningDisabled=true;
    if(profile.role==='face-reader'){if((await ask('O relé do leitor está isolado do portão e isso foi verificado fisicamente? Digite SIM: '))!=='SIM')throw Error('Isolamento do leitor não confirmado.');device.readerRelayIsolated=true;device.recognitionMode='external-actuator';}
   }
   if((await ask('Após conferir modelo, ligação, contingência e teste físico local, digite ENSAIO '+id+' para habilitar o teste integrado: '))!=='ENSAIO '+id)throw Error('Ensaio não confirmado.');
   device.enabled=true;device.commissioned=true;
  }else{
   // Disable the authority first; the private runtime update follows.
   await adminOperation(context,token,'commission',{deviceId:id,enabled:false,commissioned:!!device.commissioned,gatewayEnabled:true});device.enabled=false;
  }
  const anyEnabled=deviceConfig.devices.some(d=>d.enabled&&d.commissioned);deviceConfig.physicalEnabled=anyEnabled;const secrets={...context.privateSecrets,IMPERIUM_ENABLE_PHYSICAL:anyEnabled?'yes':'no'};
  savePrivate('gateway-secrets.private.json',secrets);savePrivate('gateway.private.json',deviceConfig);
  if(enabling)await adminOperation(context,token,'commission',{deviceId:id,enabled:true,commissioned:true,gatewayEnabled:true});
  console.log('Configuração gravada. Reinicie a central e faça o aceite integrado supervisionado. Sem sensor, a posição do portão continua indeterminada.');
 }finally{await logout(context,token)}
}catch(e){console.error(e.message);process.exitCode=1}
