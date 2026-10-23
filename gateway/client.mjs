import {createHmac,randomUUID} from 'node:crypto';
import {boundedText} from './transport.mjs';
export class GatewayClient {
  constructor(baseUrl,token,transport=fetch){const url=new URL(baseUrl);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!token.startsWith('acgw_')||token.length<45)throw Error('GATEWAY_API_CONFIGURATION_INVALID');this.baseUrl=baseUrl.replace(/\/$/,'');this.token=token;this.transport=transport;}
  async post(path,payload={}){const raw=JSON.stringify({...payload,requestId:randomUUID(),sentAt:new Date().toISOString()}),signature=createHmac('sha256',this.token).update('POST\n'+path+'\n'+raw).digest('hex');const response=await this.transport(this.baseUrl+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+this.token,'X-Gateway-Signature':signature},body:raw,redirect:'error',signal:AbortSignal.timeout(4500)});if(!response.ok)throw Error('GATEWAY_API_HTTP_'+response.status);return JSON.parse(await boundedText(response,262144));}
}
