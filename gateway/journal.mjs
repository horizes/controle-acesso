import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import path from 'node:path';
export class Journal {
  constructor(file){if(file!==':memory:')mkdirSync(path.dirname(path.resolve(file)),{recursive:true,mode:0o700});this.db=new DatabaseSync(file);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,hash TEXT NOT NULL,status TEXT NOT NULL,result TEXT,at TEXT NOT NULL)');if(file!==':memory:')try{chmodSync(file,0o600)}catch{}}
  begin(id,hash){const row=this.db.prepare('SELECT hash FROM receipts WHERE id=?').get(id);if(row){if(row.hash!==hash)throw Error('LOCAL_IDEMPOTENCY_CONFLICT');return false;}this.db.prepare("INSERT INTO receipts(id,hash,status,at)VALUES(?,?,'started',?)").run(id,hash,new Date().toISOString());return true;}
  finish(id,result){this.db.prepare('UPDATE receipts SET status=?,result=? WHERE id=?').run(result.status||'unknown',JSON.stringify(result),id);}
  get(id){return this.db.prepare('SELECT * FROM receipts WHERE id=?').get(id);}
  close(){this.db.close();}
}
