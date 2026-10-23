import {createHandler} from '../../../server/http';
import {SupabaseStore} from '../../../server/store';
declare const Deno:{env:{get(name:string):string|undefined};serve(handler:(req:Request)=>Promise<Response>):void};
const store=new SupabaseStore(Deno.env.get('SUPABASE_URL')||'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'');
const allowedOrigins=(Deno.env.get('ALLOWED_ORIGINS')||'https://horizes.github.io').split(',').map(x=>x.trim()).filter(Boolean);
Deno.serve(createHandler({store,allowedOrigins}));
