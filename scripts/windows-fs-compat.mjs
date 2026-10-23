// Some Windows application sandboxes reject the native realpath implementation
// while allowing Node's ordinary implementation for the same permitted file.
// Keep the access checks and fall back only for that specific platform error.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
if(process.platform==='win32') {
 const native=fs.realpathSync.native;
 fs.realpathSync.native=function(...args){try{return native(...args)}catch(error){if(error.code==='EPERM')return fs.realpathSync(...args);throw error;}};
 syncBuiltinESMExports();
}
