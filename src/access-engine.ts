export type AccessMethod='face'|'plate'|'code';
export type Credential={id:string;name:string;unit:string;profile:'Morador'|'Visitante'|'Prestador';faceRef?:string;plate?:string;code?:string;validFrom:string;validUntil:string;revoked:boolean;gates:string[];sourceVisitId?:string};
export type AccessSignal={method:AccessMethod;value:string;gate:string;at?:string};
export type AccessResult={allowed:boolean;reason:string;credential?:Credential;at:string};
export const normalizePlate=(value:string)=>value.toUpperCase().replace(/[^A-Z0-9]/g,'');
export function evaluateAccess(credentials:Credential[],signal:AccessSignal,clock=new Date()):AccessResult{
 const at=signal.at?new Date(signal.at):clock;
 const result=(allowed:boolean,reason:string,credential?:Credential):AccessResult=>({allowed,reason,credential,at:Number.isFinite(at.getTime())?at.toISOString():clock.toISOString()});
 if(!Number.isFinite(at.getTime())||!signal.value.trim())return result(false,'Leitura inválida. Faça uma nova tentativa.');
 const value=signal.method==='plate'?normalizePlate(signal.value):signal.method==='code'?signal.value.trim().replace(/^IMPERIUM-DEMO:/,''):signal.value.trim();
 if(signal.method==='plate'&&!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(value))return result(false,'Placa fora do padrão cadastrado.');
 const matches=credentials.filter(c=>signal.method==='face'?c.faceRef===value:signal.method==='plate'?normalizePlate(c.plate||'')===value:c.code===value);
 if(!matches.length)return result(false,'Nenhuma credencial encontrada. Encaminhar para a portaria.');
 if(matches.length>1)return result(false,'Mais de um cadastro para esta leitura. Conferência necessária.');
 const c=matches[0];const start=new Date(c.validFrom).getTime(),end=new Date(c.validUntil).getTime();
 if(c.revoked)return result(false,'Credencial bloqueada pelo responsável.',c);
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return result(false,'Validade inconsistente. Conferência necessária.',c);
 if(at.getTime()<start)return result(false,'A autorização ainda não começou.',c);
 if(at.getTime()>=end)return result(false,'Autorização vencida. Solicitar uma nova liberação.',c);
 if(!c.gates.includes(signal.gate))return result(false,'Credencial sem permissão para este acesso.',c);
 return result(true,c.profile==='Morador'?'Morador com credencial ativa.':'Autorização dentro do prazo de validade.',c);
}
export const integrationProfiles=[
 {name:'Control iD',protocol:'API de acesso · modo online / Monitor',description:'Consulta preventiva no modo online compatível. Monitor é usado para auditoria; a ação de porta varia por família.',state:'Homologar modelo'},
 {name:'Intelbras',protocol:'HTTP Digest · CGI / SDK por modelo',description:'Portas e eventos AccessControl. Leitura de placas TrafficJunction depende das capacidades do equipamento.',state:'Homologar modelo'},
 {name:'Hikvision',protocol:'ISAPI Digest · HCNetSDK opcional',description:'Eventos faciais e ANPR por ISAPI, com controle de porta nas versões compatíveis. Leitor de eventos exige controladora separada e relé isolado.',state:'Homologar modelo e firmware'},
 {name:'Dahua',protocol:'CGI Digest · DSS / SDK por linha',description:'CGI nas versões que documentam AccessControl e TrafficJunction. DSS e outras linhas exigem ponte e pacote oficial.',state:'Confirmar contrato do modelo'},
 {name:'ZKTeco',protocol:'ZKBio CVSecurity 6+ / SDK por linha',description:'API licenciada do servidor CVSecurity. Outras famílias utilizam ponte com o SDK ou protocolo próprio.',state:'Requer servidor compatível'},
 {name:'Outros fabricantes',protocol:'Evento HTTP com assinatura HMAC',description:'Conector SDK homologado envia identificações assinadas; a central confere autorização e prazo.',state:'Requer produtor compatível'},
];
