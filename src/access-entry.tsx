import React, {useState} from 'react';
import {ArrowLeft, ArrowRight, Eye, EyeOff, Monitor, Smartphone, ChevronRight, LockKeyhole} from 'lucide-react';
import {AccessRole, AccessSession, authenticatePresentation, PRESENTATION_ACCOUNTS, PRESENTATION_PASSWORD} from './access-session';

export function Brand({small=false}:{small?:boolean}) {
  return <span className={'im-brand '+(small?'small':'')}><img src="./brand/logo.jpg" alt=""/><span><b>IMPERIUM</b><small>CONTROLE DE ACESSO</small></span></span>;
}

export default function AccessEntry({role,onSelect,onLogin,onApiLogin,apiMode=false,configurationError=''}:{
  role?: AccessRole;
  onSelect:(role?:AccessRole)=>void;
  onLogin:(session:AccessSession)=>void;
  onApiLogin?:(role:AccessRole,email:string,password:string)=>Promise<AccessSession>;
  apiMode?:boolean;
  configurationError?:string;
}) {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[visible,setVisible]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const submit=async(e:React.FormEvent)=>{
    e.preventDefault(); if(!role||busy)return;setError('');setBusy(true);
    try{onLogin(apiMode&&onApiLogin?await onApiLogin(role,email,password):authenticatePresentation(role,email,password));}
    catch(e){setError((e as Error).message)}finally{setBusy(false)}
  };
  const select=(next?:AccessRole)=>{setEmail('');setPassword('');setError('');setVisible(false);onSelect(next)};
  return <main className="im-entry"><div className="im-entry-top"><Brand/><span>CONDOMÍNIOS</span></div>
    <section className={'im-entry-panel '+(!role?'im-entry-chooser':'')}>
      {role?<>
        <button className="im-entry-back" onClick={()=>select()}><ArrowLeft size={15}/>Voltar</button>
        <span className="im-entry-icon">{role==='desk'?<Monitor size={23}/>:<Smartphone size={23}/>}</span>
        <h1>{role==='desk'?'Acesso à portaria':'Acesso do morador'}</h1><p>Entre com seu e-mail e senha.</p>
        <form className="im-login-form" onSubmit={submit}>
          <label>E-mail<input type="email" autoComplete="username" required value={email} placeholder="seu@email.com" onChange={e=>setEmail(e.target.value)}/></label>
          <label>Senha<span className="im-password-field"><input type={visible?'text':'password'} autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" aria-label={visible?'Ocultar senha':'Mostrar senha'} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></span></label>
          {error&&<p className="im-error" role="alert">{error}</p>}
          {configurationError&&<p className="im-error" role="alert">{configurationError}</p>}
          <button className="im-button gold full" type="submit" disabled={busy||!!configurationError}>{busy?'Entrando…':'Entrar'}<ArrowRight size={16}/></button>
        </form>
        {!apiMode&&<details className="im-fixtures"><summary>Acessos de apresentação</summary><p>Senha dos exemplos: <code>{PRESENTATION_PASSWORD}</code></p>{PRESENTATION_ACCOUNTS.filter(a=>a.role===role).map(a=><button key={a.email} onClick={()=>{setEmail(a.email);setPassword(PRESENTATION_PASSWORD);setError('')}}><span><b>{a.name}</b><small>{a.email}</small></span><ChevronRight size={16}/></button>)}</details>}
        <div className="im-entry-other">{role==='desk'?'É morador do condomínio?':'Trabalha na portaria?'}<button onClick={()=>select(role==='desk'?'resident':'desk')}>{role==='desk'?'Acesso do morador':'Acesso à portaria'}<ArrowRight size={14}/></button></div>
      </>:<>
        <span className="im-kicker">IMPERIUM · CONDOMÍNIOS</span><h1>Controle de acesso</h1><p>Selecione sua área para entrar.</p>
        <div className="im-access-options"><button onClick={()=>select('desk')}><Monitor size={25} strokeWidth={1.5}/><span><b>Portaria</b><small>Atendimento e controle do condomínio</small></span><ChevronRight size={19}/></button><button onClick={()=>select('resident')}><Smartphone size={25} strokeWidth={1.5}/><span><b>Morador</b><small>Acesso à sua unidade e serviços</small></span><ChevronRight size={19}/></button></div>
      </>}
    </section>
    <footer><LockKeyhole size={13}/>{apiMode?'Acesso integrado à API do condomínio.':'Ambiente de apresentação · dados fictícios'}<span>Imperium Terceirização e Serviços</span></footer>
  </main>;
}
