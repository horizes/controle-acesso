-- Run through an owner connection after bootstrap. All test writes are rolled back.
begin;
do $$
declare m public.ac_memberships;g uuid:=gen_random_uuid();request_id uuid:=gen_random_uuid();j public.ac_jobs;lease public.ac_jobs;s public.ac_state;r jsonb;denied boolean:=false;n int;
begin
 select * into m from public.ac_memberships where role='admin' and enabled=true limit 1;
 if not found then raise exception 'Bootstrap an administrator first';end if;
 if exists(select 1 from information_schema.tables t where t.table_schema='public' and t.table_name like 'ac\_%' escape '\' and (has_table_privilege('anon','public.'||t.table_name,'SELECT') or has_table_privilege('authenticated','public.'||t.table_name,'SELECT'))) then raise exception 'Client table access must be denied';end if;
 if has_function_privilege('anon','public.ac_commit_state(uuid,bigint,jsonb,text,uuid,text)','EXECUTE') then raise exception 'Client RPC access must be denied';end if;
 insert into public.ac_gateways(id,condominium_id,name,token_hash,enabled,last_seen) values(g,m.condominium_id,'Rollback test only',encode(gen_random_bytes(32),'hex'),true,now());
 insert into public.ac_devices(id,condominium_id,gateway_id,provider,name,model,gate,methods,mode,enabled,commissioned) values('rollback-'||g,m.condominium_id,g,'controlid','Rollback test','Mock only','social','["face"]','online',false,false);
 begin perform public.ac_enqueue_job(m.user_id,'rollback-'||g,request_id,'hash','Reversible test');exception when others then if sqlerrm='DEVICE_DISABLED' then denied:=true;else raise;end if;end;
 if not denied then raise exception 'Uncommissioned device accepted';end if;
 update public.ac_devices set enabled=true,commissioned=true where id='rollback-'||g;
 select * into j from public.ac_enqueue_job(m.user_id,'rollback-'||g,request_id,'hash','Reversible test');
 select * into lease from public.ac_lease_jobs(g,1);
 if j.status<>'pending' or lease.status<>'leased' or lease.lease_id is null then raise exception 'Invalid job lease';end if;
 select count(*) into n from public.ac_lease_jobs(g,1);if n<>0 then raise exception 'Lease was duplicated';end if;
 update public.ac_jobs set leased_at=now()-interval '31 seconds' where id=j.id;
 perform public.ac_lease_jobs(g,1);if (select status from public.ac_jobs where id=j.id)<>'unknown' then raise exception 'Timed out lease must be unknown';end if;
 if not public.ac_nonce(g,request_id) or public.ac_nonce(g,request_id) then raise exception 'Nonce replay accepted';end if;
 select * into s from public.ac_state where condominium_id=m.condominium_id;
 r:=public.ac_commit_state(m.condominium_id,s.revision,s.body,'rollback:'||g,request_id,'hash');
 r:=public.ac_commit_state(m.condominium_id,s.revision,s.body,'rollback:'||g,request_id,'hash');
 if not (r->>'duplicate')::boolean or (r->>'revision')::bigint<>s.revision+1 then raise exception 'Idempotency failed';end if;
 r:=public.ac_commit_decision(g,'rollback-'||g,'event-1','hash','observation',s.revision+1,s.body,'{"allowed":false,"reason":"Observation test","physicalState":"unknown"}',null,null);
 r:=public.ac_commit_decision(g,'rollback-'||g,'event-1','hash','observation',s.revision+2,s.body,'{"allowed":true,"reason":"Replay test"}',null,now()+interval '4 seconds');
 if not (r->>'duplicate')::boolean or (r->>'allowed')::boolean then raise exception 'Repeated decision issued a grant';end if;
end $$;
rollback;
select 'Database checks passed; test writes rolled back' as result;
