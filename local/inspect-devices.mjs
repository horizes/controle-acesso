import {loadEquipmentContext} from './equipment-tools.mjs';
import {inspectDevice,configurationIssues} from '../gateway/preflight.mjs';
try{
 const {deviceConfig,env,gatewayClient}=loadEquipmentContext(),status=await gatewayClient.post('/v1/gateway/status'),reports=[];
 for(const device of deviceConfig.devices){const registered=status.devices.find(d=>d.id===device.id),issues=configurationIssues(device,deviceConfig.devices);if(!registered)issues.push('Não cadastrado na API desta central.');else if(registered.provider!==device.provider||registered.gate!==device.gate||(registered.actuator_id||undefined)!==(device.actuatorId||undefined))issues.push('Cadastro da API diverge da configuração privada.');
  reports.push({deviceId:device.id,model:device.model,firmware:device.firmware,issues,apiEnabled:!!registered?.enabled,apiCommissioned:!!registered?.commissioned,...await inspectDevice(device,{env})});
 }
 console.log(JSON.stringify({readOnly:true,physicalCommandsSent:0,devices:reports},null,2));
 if(!reports.length)console.log('Nenhum equipamento cadastrado. Execute local/configure-device.mjs.');
}catch{console.error('Verificação indisponível. Confirme central ativa, configuração privada, token e certificado. Nenhum portão foi acionado.');process.exitCode=1}
