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
 {name:'Control iD',protocol:'API de acesso · Monitor',description:'Eventos e credenciais de leitores iDFace e da linha de acesso.',state:'Homologar modelo'},
 {name:'Intelbras',protocol:'API / SDK de acesso',description:'Linhas faciais e controladoras com interface de integração liberada pelo fabricante.',state:'Homologar modelo'},
 {name:'Hikvision',protocol:'ISAPI / SDK',description:'Leitores de acesso e eventos de câmeras de leitura de placas.',state:'Homologar modelo'},
 {name:'Dahua',protocol:'HTTP API / SDK',description:'Perfil de integração para leitores e câmeras compatíveis.',state:'Planejado'},
 {name:'ZKTeco',protocol:'API / SDK por linha',description:'Perfil de integração sujeito à linha e ao firmware do equipamento.',state:'Planejado'},
 {name:'Outros fabricantes',protocol:'Evento HTTP normalizado',description:'Entrada comum para eventos enviados por um conector do equipamento.',state:'Contrato definido'},
];
