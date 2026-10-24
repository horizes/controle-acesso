import {createHash} from 'node:crypto';
import {actuate,outcome} from './adapters.mjs';
export const fingerprint=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function executeJob(job,{devices,journal,client,env=process.env,physicalEnabled=false,transport=fetch}){
  const hash=fingerprint({id:job.id,deviceId:job.deviceId,gate:job.gate,provider:job.provider,expiresAt:job.expiresAt});
  if(!journal.begin('job:'+job.id,hash))return {duplicate:true,status:journal.get('job:'+job.id)?.status||'unknown'};
  let result;try{const device=devices.find(d=>d.id===job.deviceId);result=!device?outcome('rejected','DEVICE_NOT_IN_LOCAL_CONFIGURATION'):physicalEnabled&&!journal.claimGate(device.gate,device.actuationCooldownMs||5000)?outcome('rejected','GATE_COOLDOWN'):await actuate(device,job,{env,physicalEnabled,transport});}catch(e){result=outcome('rejected',String(e.message||'CONFIGURATION_INVALID').replace(/[^A-Z0-9_]/g,'').slice(0,70))}
  journal.finish('job:'+job.id,result);
  // A failed acknowledgement is never a reason to actuate again.
  try{await client.post('/v1/gateway/ack',{jobId:job.id,leaseId:job.leaseId,status:result.status,vendorCode:result.vendorCode})}catch{return {...result,acknowledged:false}}
  return {...result,acknowledged:true};
}
