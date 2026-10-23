import {defineConfig} from 'vite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export default defineConfig({base:'./',esbuild:{jsx:'automatic'},plugins:[{
  name:'imperium-runtime-config-version',
  transformIndexHtml(html){const version=createHash('sha256').update(readFileSync('public/runtime-config.js')).digest('hex').slice(0,12);return html.replace('src="./runtime-config.js"','src="./runtime-config.js?v='+version+'"')}
}]});
