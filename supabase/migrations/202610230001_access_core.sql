-- Dedicated project; no policies grant direct client access to operational data.
create table public.ac_condominiums(id uuid primary key default gen_random_uuid(),name text not null,created_at timestamptz not null default now());
create table public.ac_memberships(user_id uuid primary key references auth.users(id),condominium_id uuid not null references public.ac_condominiums(id),role text not null check(role in ('admin','desk','resident')),name text not null,unit text,can_release boolean not null default false,enabled boolean not null default true,check(role<>'resident' or unit is not null));
create index ac_memberships_condominium_idx on public.ac_memberships(condominium_id);
create table public.ac_state(condominium_id uuid primary key references public.ac_condominiums(id),revision bigint not null default 0,body jsonb not null,updated_at timestamptz not null default now());
create table public.ac_requests(actor_id text not null,request_id uuid not null,condominium_id uuid not null references public.ac_condominiums(id),payload_hash text not null,created_at timestamptz not null default now(),primary key(actor_id,request_id));
create index ac_requests_condominium_idx on public.ac_requests(condominium_id);
create table public.ac_gateways(id uuid primary key default gen_random_uuid(),condominium_id uuid not null references public.ac_condominiums(id),name text not null,token_hash text not null unique,enabled boolean not null default false,last_seen timestamptz,created_at timestamptz not null default now());
create index ac_gateways_condominium_idx on public.ac_gateways(condominium_id);
create table public.ac_devices(id text primary key,condominium_id uuid not null references public.ac_condominiums(id),gateway_id uuid not null references public.ac_gateways(id),provider text not null check(provider in ('controlid','intelbras','hikvision','zkteco','dahua','generic')),name text not null,model text not null,gate text not null,methods jsonb not null,mode text not null check(mode in ('online','monitor')),enabled boolean not null default false,commissioned boolean not null default false,actuator_id text references public.ac_devices(id),last_seen timestamptz);
create index ac_devices_condominium_idx on public.ac_devices(condominium_id);
create index ac_devices_gateway_idx on public.ac_devices(gateway_id);
create table public.ac_bindings(condominium_id uuid not null references public.ac_condominiums(id),device_id text not null references public.ac_devices(id),method text not null check(method in ('face','plate','code')),external_id text not null,credential_id text not null,primary key(device_id,method,external_id));
create index ac_bindings_condominium_idx on public.ac_bindings(condominium_id);
create table public.ac_decisions(id uuid primary key default gen_random_uuid(),condominium_id uuid not null references public.ac_condominiums(id),gateway_id uuid not null references public.ac_gateways(id),device_id text not null references public.ac_devices(id),event_id text not null,request_hash text not null,purpose text not null,allowed boolean not null default false,reason text not null,credential_id text,expires_at timestamptz,result jsonb not null,created_at timestamptz not null default now(),unique(gateway_id,event_id));
create index ac_decisions_condominium_idx on public.ac_decisions(condominium_id);
create index ac_decisions_device_idx on public.ac_decisions(device_id);
create table public.ac_jobs(id uuid primary key default gen_random_uuid(),condominium_id uuid not null references public.ac_condominiums(id),gateway_id uuid not null references public.ac_gateways(id),device_id text not null references public.ac_devices(id),gate text not null,credential_id text,decision_id uuid references public.ac_decisions(id),actor_id text not null,request_id uuid not null,payload_hash text not null,reason text not null,expires_at timestamptz not null,status text not null default 'pending' check(status in ('pending','leased','accepted','rejected','unknown','expired')),lease_id uuid,leased_at timestamptz,completed_at timestamptz,result jsonb,created_at timestamptz not null default now(),unique(actor_id,request_id));
create index ac_jobs_gateway_idx on public.ac_jobs(gateway_id,status,created_at);
create index ac_jobs_condominium_idx on public.ac_jobs(condominium_id);
create index ac_jobs_device_idx on public.ac_jobs(device_id);
create index ac_jobs_decision_idx on public.ac_jobs(decision_id);
create table public.ac_rate_limits(bucket text primary key,count int not null,reset_at timestamptz not null);
create table public.ac_revocations(token_hash text primary key,expires_at timestamptz not null);
create table public.ac_gateway_nonces(gateway_id uuid not null references public.ac_gateways(id),nonce uuid not null,created_at timestamptz not null default now(),primary key(gateway_id,nonce));
create index ac_gateway_nonces_created_idx on public.ac_gateway_nonces(created_at);
create index ac_rate_limits_reset_idx on public.ac_rate_limits(reset_at);
create index ac_revocations_expires_idx on public.ac_revocations(expires_at);

alter table public.ac_condominiums enable row level security;
alter table public.ac_memberships enable row level security;
alter table public.ac_state enable row level security;
alter table public.ac_requests enable row level security;
alter table public.ac_gateways enable row level security;
alter table public.ac_devices enable row level security;
alter table public.ac_bindings enable row level security;
alter table public.ac_decisions enable row level security;
alter table public.ac_jobs enable row level security;
alter table public.ac_rate_limits enable row level security;
alter table public.ac_revocations enable row level security;
alter table public.ac_gateway_nonces enable row level security;
revoke all on public.ac_condominiums,public.ac_memberships,public.ac_state,public.ac_requests,public.ac_gateways,public.ac_devices,public.ac_bindings,public.ac_decisions,public.ac_jobs,public.ac_rate_limits,public.ac_revocations,public.ac_gateway_nonces from anon,authenticated;
grant all on public.ac_condominiums,public.ac_memberships,public.ac_state,public.ac_requests,public.ac_gateways,public.ac_devices,public.ac_bindings,public.ac_decisions,public.ac_jobs,public.ac_rate_limits,public.ac_revocations,public.ac_gateway_nonces to service_role;

create function public.ac_commit_state(p_condominium uuid,p_revision bigint,p_body jsonb,p_actor text,p_request uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_row public.ac_state; previous_request public.ac_requests;
begin
 select * into current_row from public.ac_state where condominium_id=p_condominium for update;
 if not found then raise exception 'NOT_FOUND'; end if;
 select * into previous_request from public.ac_requests where actor_id=p_actor and request_id=p_request;
 if found then
  if previous_request.payload_hash<>p_hash or previous_request.condominium_id<>p_condominium then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('duplicate',true,'revision',current_row.revision,'body',current_row.body);
 end if;
 if current_row.revision<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
 if jsonb_typeof(p_body)<>'object' or p_body->>'version'<>'2' then raise exception 'INVALID_STATE'; end if;
 update public.ac_state set revision=revision+1,body=p_body,updated_at=now() where condominium_id=p_condominium returning * into current_row;
 insert into public.ac_requests(actor_id,request_id,condominium_id,payload_hash) values(p_actor,p_request,p_condominium,p_hash);
 return jsonb_build_object('duplicate',false,'revision',current_row.revision,'body',current_row.body);
end $$;

create function public.ac_rate_limit(p_bucket text,p_limit int,p_seconds int) returns boolean language plpgsql security definer set search_path='' as $$
declare n int;
begin
 insert into public.ac_rate_limits(bucket,count,reset_at) values(p_bucket,1,now()+make_interval(secs=>p_seconds))
 on conflict(bucket) do update set count=case when public.ac_rate_limits.reset_at<now() then 1 else public.ac_rate_limits.count+1 end, reset_at=case when public.ac_rate_limits.reset_at<now() then now()+make_interval(secs=>p_seconds) else public.ac_rate_limits.reset_at end returning count into n;
 return n<=p_limit;
end $$;

-- A lease is never automatically returned to pending. A lost acknowledgement
-- can mean a relay already pulsed; treating it as unknown avoids a second pulse.
create function public.ac_lease_jobs(p_gateway uuid,p_limit int default 5) returns setof public.ac_jobs language plpgsql security definer set search_path='' as $$
begin
 update public.ac_jobs set status='expired',completed_at=now() where gateway_id=p_gateway and status='pending' and expires_at<=now();
 update public.ac_jobs set status='unknown',completed_at=now(),result='{"reason":"lease_timeout","physicalState":"unknown"}' where gateway_id=p_gateway and status='leased' and leased_at<now()-interval '30 seconds';
 return query with selected as(select id from public.ac_jobs where gateway_id=p_gateway and status='pending' and expires_at>now() order by created_at for update skip locked limit least(greatest(p_limit,1),10)) update public.ac_jobs j set status='leased',lease_id=gen_random_uuid(),leased_at=now() from selected s where j.id=s.id returning j.*;
end $$;

create function public.ac_commit_decision(p_gateway uuid,p_device text,p_event text,p_hash text,p_purpose text,p_revision bigint,p_body jsonb,p_result jsonb,p_credential text,p_expires timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.ac_gateways; d public.ac_devices; old public.ac_decisions; s public.ac_state; created public.ac_decisions;
begin
 select * into g from public.ac_gateways where id=p_gateway and enabled=true;
 if not found then raise exception 'GATEWAY_DISABLED'; end if;
 select * into d from public.ac_devices where id=p_device and gateway_id=g.id and condominium_id=g.condominium_id;
 if not found then raise exception 'DEVICE_NOT_FOUND'; end if;
 select * into s from public.ac_state where condominium_id=g.condominium_id for update;
 select * into old from public.ac_decisions where gateway_id=p_gateway and event_id=p_event;
 if found then
  if old.request_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  -- Replays are audit only: never re-issue a physical authorization.
  return jsonb_build_object('duplicate',true,'allowed',false,'reason','Evento já processado.','decisionId',old.id,'physicalState','unknown');
 end if;
 if s.revision<>p_revision then raise exception 'REVISION_CONFLICT'; end if;
 if coalesce((p_result->>'allowed')::boolean,false) and (not d.enabled or not d.commissioned or d.mode<>'online' or p_expires is null or p_expires<=now()) then raise exception 'DEVICE_DISABLED'; end if;
 insert into public.ac_decisions(condominium_id,gateway_id,device_id,event_id,request_hash,purpose,allowed,reason,credential_id,expires_at,result) values(g.condominium_id,p_gateway,p_device,p_event,p_hash,p_purpose,coalesce((p_result->>'allowed')::boolean,false),p_result->>'reason',p_credential,p_expires,p_result) returning * into created;
 update public.ac_state set body=p_body,revision=revision+1,updated_at=now() where condominium_id=g.condominium_id;
 update public.ac_devices set last_seen=now() where id=p_device;
 update public.ac_gateways set last_seen=now() where id=p_gateway;
 return p_result||jsonb_build_object('duplicate',false,'decisionId',created.id);
end $$;

revoke execute on function public.ac_commit_state(uuid,bigint,jsonb,text,uuid,text),public.ac_rate_limit(text,int,int),public.ac_lease_jobs(uuid,int),public.ac_commit_decision(uuid,text,text,text,text,bigint,jsonb,jsonb,text,timestamptz) from public,anon,authenticated;
grant execute on function public.ac_commit_state(uuid,bigint,jsonb,text,uuid,text),public.ac_rate_limit(text,int,int),public.ac_lease_jobs(uuid,int),public.ac_commit_decision(uuid,text,text,text,text,bigint,jsonb,jsonb,text,timestamptz) to service_role;

create function public.ac_enqueue_job(p_actor uuid,p_device text,p_request uuid,p_hash text,p_reason text) returns public.ac_jobs language plpgsql security definer set search_path='' as $$
declare m public.ac_memberships;d public.ac_devices;g public.ac_gateways;j public.ac_jobs;
begin
 select * into m from public.ac_memberships where user_id=p_actor and enabled=true;
 if not found or m.role='resident' or not(m.can_release or m.role='admin') then raise exception 'FORBIDDEN'; end if;
 select * into j from public.ac_jobs where actor_id='user:'||p_actor::text and request_id=p_request;
 if found then if j.payload_hash<>p_hash then raise exception 'IDEMPOTENCY_CONFLICT';end if;return j;end if;
 select * into d from public.ac_devices where id=p_device and condominium_id=m.condominium_id and enabled=true and commissioned=true for share;
 if not found then raise exception 'DEVICE_DISABLED';end if;
 select * into g from public.ac_gateways where id=d.gateway_id and condominium_id=m.condominium_id and enabled=true and last_seen>now()-interval '45 seconds';
 if not found then raise exception 'GATEWAY_OFFLINE';end if;
 if length(trim(p_reason))<8 or length(p_reason)>300 then raise exception 'INVALID_REASON';end if;
 insert into public.ac_jobs(condominium_id,gateway_id,device_id,gate,actor_id,request_id,payload_hash,reason,expires_at) values(m.condominium_id,g.id,d.id,d.gate,'user:'||p_actor::text,p_request,p_hash,p_reason,now()+interval '10 seconds') returning * into j;
 return j;
end $$;

create function public.ac_nonce(p_gateway uuid,p_nonce uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare n int;
begin
 delete from public.ac_gateway_nonces where created_at<now()-interval '10 minutes';
 delete from public.ac_rate_limits where reset_at<now()-interval '1 day';
 delete from public.ac_revocations where expires_at<now();
 insert into public.ac_gateway_nonces(gateway_id,nonce) values(p_gateway,p_nonce) on conflict do nothing;
 get diagnostics n=row_count;return n=1;
end $$;
revoke execute on function public.ac_enqueue_job(uuid,text,uuid,text,text),public.ac_nonce(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ac_enqueue_job(uuid,text,uuid,text,text),public.ac_nonce(uuid,uuid) to service_role;
