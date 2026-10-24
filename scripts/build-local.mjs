import {build} from 'esbuild';
import {mkdirSync,cpSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
mkdirSync('local/build',{recursive:true});
await build({entryPoints:['local/api.ts'],bundle:true,platform:'node',format:'esm',target:'node24',outfile:'local/build/api.mjs',logLevel:'silent'});
const buildRoot=path.resolve('local/build'),web=path.join(buildRoot,'web');
if(!web.startsWith(buildRoot+path.sep)||path.basename(web)!=='web')throw Error('Diretório de saída inválido.');
rmSync(web,{recursive:true,force:true});
cpSync('docs',web,{recursive:true});
// Runtime configuration is supplied by the LOCAL server, never the cloud file.
writeFileSync('local/build/web/runtime-config.js','throw Error("Inicie pelo servidor local da Imperium.");\n');
console.log('Servidor e interface locais preparados em local/build.');
