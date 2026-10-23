import {createHash,randomBytes} from 'node:crypto';
import {isIP} from 'node:net';

export function deviceUrl(config,path){
  const base=new URL(config.baseUrl);
  if(base.username||base.password||base.search||base.hash||!['http:','https:'].includes(base.protocol))throw Error('DEVICE_URL_INVALID');
  const ip=base.hostname.replace(/^\[|\]$/g,'');
  const privateV4=isIP(ip)===4&&(/^(10\.|127\.|192\.168\.)/.test(ip)||/^172\.(1[6-9]|2\d|3[01])\./.test(ip));
  if(!privateV4&&!(base.protocol==='https:'&&config.allowPublicEndpoint===true))throw Error('DEVICE_URL_REQUIRES_PRIVATE_NETWORK_OR_EXPLICIT_HTTPS');
  // The URL is local configuration, never a URL supplied by an API job.
  return new URL(path,base.origin);
}
export function secret(config,key,env=process.env){const variable=config[key];const value=variable?env[variable]:undefined;if(typeof variable!=='string'||!value)throw Error('DEVICE_CREDENTIAL_NOT_CONFIGURED');return value;}
export function beforeActuation(expiresAt){const remaining=Date.parse(expiresAt)-Date.now();if(!Number.isFinite(remaining)||remaining<750)throw Error('COMMAND_EXPIRED');return Math.min(4000,remaining);}
export async function boundedText(response,max=65536){const reader=response.body?.getReader();if(!reader)return '';const chunks=[];let length=0;while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>max){await reader.cancel();throw Error('DEVICE_RESPONSE_TOO_LARGE')}chunks.push(value)}return Buffer.concat(chunks.map(c=>Buffer.from(c))).toString('utf8');}
export function parseDigest(header){if(!header||!/^Digest /i.test(header))throw Error('DIGEST_AUTH_REQUIRED');const values={};for(const match of header.slice(7).matchAll(/([\w-]+)\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^,\s]+))/g))values[match[1].toLowerCase()]=(match[2]??match[3]).replace(/\\(.)/g,'$1');if(!values.realm||!values.nonce)throw Error('DIGEST_CHALLENGE_INVALID');return values;}
export function digestAuthorization(challenge,{username,password,method,url,cnonce=randomBytes(16).toString('hex')}){
  const algorithm=(challenge.algorithm||'MD5').toUpperCase();if(!['MD5','SHA-256','MD5-SESS','SHA-256-SESS'].includes(algorithm))throw Error('DIGEST_ALGORITHM_UNSUPPORTED');
  const hashName=algorithm.startsWith('MD5')?'md5':'sha256',hash=s=>createHash(hashName).update(s).digest('hex'),escape=s=>String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"');
  const uri=url.pathname+url.search,nc='00000001',qops=(challenge.qop||'').split(',').map(q=>q.trim());if(challenge.qop&&!qops.includes('auth'))throw Error('DIGEST_QOP_UNSUPPORTED');
  let ha1=hash(username+':'+challenge.realm+':'+password);if(algorithm.endsWith('-SESS'))ha1=hash(ha1+':'+challenge.nonce+':'+cnonce);const ha2=hash(method+':'+uri),qop=challenge.qop?'auth':'';
  const response=hash(ha1+':'+challenge.nonce+':'+(qop?nc+':'+cnonce+':'+qop+':':'')+ha2);
  return 'Digest '+['username="'+escape(username)+'"','realm="'+escape(challenge.realm)+'"','nonce="'+escape(challenge.nonce)+'"','uri="'+escape(uri)+'"','response="'+response+'"','algorithm='+algorithm,...(qop?['qop=auth','nc='+nc]:[]),...(qop||algorithm.endsWith('-SESS')?['cnonce="'+cnonce+'"']:[]),...(challenge.opaque?['opaque="'+escape(challenge.opaque)+'"']:[])].join(', ');
}
export async function digestFetch(url,options,credentials,transport=fetch){
  let response=await transport(url,{...options,redirect:'error'});if(response.status!==401)return response;
  const challenge=parseDigest(response.headers.get('www-authenticate'));await response.body?.cancel();
  // Only the unauthenticated 401 challenge is retried. No command is retried
  // after an authenticated request, timeout, or ambiguous response.
  response=await transport(url,{...options,headers:{...options.headers,Authorization:digestAuthorization(challenge,{...credentials,method:options.method||'GET',url})},redirect:'error'});return response;
}
