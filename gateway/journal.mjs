import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync} from 'node:fs';
import path from 'node:path';
export class Journal {
  constructor(file){if(file!==':memory:')mkdirSync(path.dirname(path.resolve(file)),{recursive:true,mode:0o700});this.db=new DatabaseSync(file);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,hash TEXT NOT NULL,status TEXT NOT NULL,result TEXT,at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS gate_cooldowns(gate TEXT PRIMARY KEY,until_ms INTEGER NOT NULL)');if(file!==':memory:')try{chmodSync(file,0o600)}catch{}}
  claimGate(gate,milliseconds=5000,now=Date.now()){if(typeof gate!=='string'||!gate||gate.length>60||!Number.isSafeInteger(milliseconds)||milliseconds<1000||milliseconds>30000)throw Error('GATE_COOLDOWN_INVALID');this.db.exec('BEGIN IMMEDIATE');try{const previous=this.db.prepare('SELECT until_ms FROM gate_cooldowns WHERE gate=?').get(gate);if(previous&&previous.until_ms>now){this.db.exec('COMMIT');return false}this.db.prepare('INSERT INTO gate_cooldowns VALUES(?,?) ON CONFLICT(gate) DO UPDATE SET until_ms=excluded.until_ms').run(gate,now+milliseconds);this.db.exec('COMMIT');return true}catch(e){this.db.exec('ROLLBACK');throw e}}
  begin(id,hash){const row=this.db.prepare('SELECT hash FROM receipts WHERE id=?').get(id);if(row){if(row.hash!==hash)throw Error('LOCAL_IDEMPOTENCY_CONFLICT');return false;}this.db.prepare("INSERT INTO receipts(id,hash,status,at)VALUES(?,?,'started',?)").run(id,hash,new Date().toISOString());return true;}
  finish(id,result){this.db.prepare('UPDATE receipts SET status=?,result=? WHERE id=?').run(result.status||'unknown',JSON.stringify(result),id);}
  get(id){return this.db.prepare('SELECT * FROM receipts WHERE id=?').get(id);}
  close(){this.db.close();}
}
