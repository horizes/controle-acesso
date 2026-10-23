import {build} from 'esbuild';
import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('.deploy/access-api',{recursive:true});
await build({entryPoints:['supabase/functions/access-api/index.ts'],bundle:true,platform:'neutral',format:'esm',target:'es2022',outfile:'.deploy/access-api/index.ts',logLevel:'silent'});
writeFileSync('.deploy/access-api/deno.json',JSON.stringify({compilerOptions:{lib:['deno.window','dom','dom.iterable','esnext']}}));
console.log('Self-contained Edge Function prepared in .deploy/access-api/.');
