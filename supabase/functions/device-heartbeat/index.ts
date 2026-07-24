import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
Deno.serve(async request=>{
  const secret=Deno.env.get("MORROW_NOTIFICATION_INTERNAL_SECRET")||"";
  if(secret.length<24||request.headers.get("x-morrow-internal-secret")!==secret)return reply({ok:false},401);
  let body:{deviceId?:string;branchId?:string;deviceType?:string;deviceName?:string;syncOk?:boolean;syncTarget?:string;errorCode?:string};
  try{body=await request.json()}catch{return reply({ok:false},400)}
  if(!body.deviceId||!body.branchId||!["kiosk","kitchen_display","order_display"].includes(body.deviceType||""))return reply({ok:false},422);
  const client=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  const now=new Date().toISOString();
  const {data:previous}=await client.from("device_health").select("status,offline_incident_started_at,sync_retry_count,last_sync_at").eq("device_id",body.deviceId).maybeSingle();
  const syncRetries=body.syncOk===false?Number(previous?.sync_retry_count||0)+1:0;
  await client.from("device_health").upsert({device_id:body.deviceId,branch_id:body.branchId,device_type:body.deviceType,device_name:String(body.deviceName||body.deviceId).slice(0,120),last_seen_at:now,last_sync_at:body.syncOk?now:previous?.last_sync_at,status:body.syncOk===false?"sync_failed":"online",sync_failure_code:body.syncOk===false?String(body.errorCode||"sync_failed").slice(0,100):null,sync_retry_count:syncRetries,sync_target:body.syncTarget||null,recovered_at:previous?.status==="offline"?now:null,offline_incident_started_at:null,offline_alerted_at:null});
  return reply({ok:true,recovered:previous?.status==="offline"});
});
function reply(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}})}
