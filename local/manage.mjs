import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {randomBytes,createHash} from 'node:crypto';
import path from 'node:path';
import {LocalStore} from './store.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),privateDir=path.join(root,'private');
mkdirSync(privateDir,{recursive:true,mode:0o700});
const store=new LocalStore(path.join(privateDir,'imperium.sqlite'));
async function ask(label,secret=false){let muted=false;const output=new Writable({write(chunk,encoding,done){if(!muted)process.stdout.write(chunk);done()}});const rl=createInterface({input:process.stdin,output,terminal:process.stdin.isTTY});const answer=rl.question(label);muted=secret;try{return await answer}finally{rl.close();if(secret)process.stdout.write('\n')}}
const save=(name,value)=>{const file=path.join(privateDir,name);writeFileSync(file,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600})};
try{
 const command=process.argv[2];
 if(command==='init'){
  if(store.rows('ac_condominiums').length)throw Error('Esta instalação já foi inicializada.');
  const condominium=await ask('Nome do condomínio: '),name=await ask('Nome do administrador: '),email=await ask('E-mail do administrador (identificador local): '),password=await ask('Nova senha local (mínimo 12 caracteres): ',true),confirm=await ask('Confirme a senha: ',true);if(password!==confirm)throw Error('As senhas não coincidem.');
  const admin=await store.initialize({condominium,name,email,password}),member=await store.member(admin.id),token='acgw_'+randomBytes(32).toString('hex');
  await store.insert('ac_gateways',{condominium_id:member.condominium_id,name:'Central local do condomínio',token_hash:createHash('sha256').update(token).digest('hex'),enabled:true});
  save('gateway-secrets.private.json',{IMPERIUM_GATEWAY_TOKEN:token,IMPERIUM_ENABLE_PHYSICAL:'no'});
  save('gateway.private.json',{apiBaseUrl:'http://127.0.0.1:8787/api',gatewayTokenEnv:'IMPERIUM_GATEWAY_TOKEN',journalFile:path.join(privateDir,'gateway.sqlite'),physicalEnabled:false,devices:[]});
  if(!existsSync(path.join(privateDir,'config.private.json')))save('config.private.json',{database:'imperium.sqlite',listenHost:'127.0.0.1',port:8787,origins:['http://127.0.0.1:8787','http://localhost:8787'],gateway:{enabled:true,config:'gateway.private.json',secrets:'gateway-secrets.private.json'}});
  console.log('Condomínio e administrador locais criados. Nenhuma conta de nuvem foi alterada. Configure HTTPS antes de abrir na rede.');
 }else if(command==='backup'){
  const destination=process.argv[3];if(!destination)throw Error('Informe o caminho de um novo arquivo de backup.');await store.backup(path.resolve(destination));console.log('Cópia consistente do banco criada. O diário do gateway e os arquivos privados exigem cópia adicional com o serviço parado.');
 }else if(command==='reset-password'){
  const email=await ask('E-mail local: '),user=store.db.prepare('SELECT id FROM accounts WHERE email=?').get(email.trim().toLowerCase());if(!user)throw Error('Usuário não encontrado.');const password=await ask('Nova senha local: ',true),confirm=await ask('Confirme: ',true);if(password!==confirm)throw Error('As senhas não coincidem.');const {scrypt}=await import('node:crypto'),{promisify}=await import('node:util');if(password.length<12||Buffer.byteLength(password)>256)throw Error('Senha deve ter 12 a 256 caracteres/bytes.');const salt=randomBytes(16).toString('hex'),derived=await promisify(scrypt)(password,salt,32,{N:32768,r:8,p:1,maxmem:67108864});store.transaction(()=>{store.db.prepare('UPDATE accounts SET salt=?,password_key=? WHERE id=?').run(salt,derived.toString('hex'),user.id);store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id)});console.log('Senha local alterada e sessões encerradas.');
 }else throw Error('Use: init | backup CAMINHO | reset-password.');
}catch(e){console.error(e.message);process.exitCode=1}finally{store.close()}
