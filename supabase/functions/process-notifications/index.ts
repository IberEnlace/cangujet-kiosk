import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

Deno.serve(async request=>{
  const expected=Deno.env.get("MORROW_NOTIFICATION_INTERNAL_SECRET")||"";
  if(expected.length<24||request.headers.get("x-morrow-internal-secret")!==expected)return response({ok:false,code:"internal_authorization_required"},401);
  const url=Deno.env.get("SUPABASE_URL")!,key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const client=createClient(url,key,{auth:{persistSession:false}}),now=new Date();
  const {data:settings}=await client.from("notification_settings").select("*,branches!inner(id,timezone)");
  for(const setting of settings??[]){
    const local=localParts(now,setting.branches.timezone);
    const periodEnd=zonedToUtc(local,setting.branches.timezone).toISOString();
    if(dueWithinFiveMinutes(local,setting.daily_report_time)&&setting.daily_sales_report){
      const end=periodEnd,start=zonedToUtc(shiftLocalDate(local,-1),setting.branches.timezone).toISOString();
      await client.from("notification_report_runs").upsert({branch_id:setting.branch_id,report_type:"daily_sales_report",report_period_start:start,report_period_end:end,status:"pending"},{onConflict:"branch_id,report_type,report_period_start,report_period_end",ignoreDuplicates:true});
    }
    if(local.weekday==="Mon"&&local.hour==="00"&&Number(local.minute)<5&&setting.weekly_sales_summary){
      const end=periodEnd,start=zonedToUtc(shiftLocalDate(local,-7),setting.branches.timezone).toISOString();
      await client.from("notification_report_runs").upsert({branch_id:setting.branch_id,report_type:"weekly_sales_summary",report_period_start:start,report_period_end:end,status:"pending"},{onConflict:"branch_id,report_type,report_period_start,report_period_end",ignoreDuplicates:true});
    }
  }
  const threshold=new Date(now.getTime()-5*60000).toISOString();
  const {data:offline}=await client.from("device_health").select("*").lt("last_seen_at",threshold).neq("status","offline");
  for(const device of offline??[]){
    const incident=device.offline_incident_started_at||device.last_seen_at;
    const eventType=device.device_type==="kitchen_display"?"kitchen_display_offline":"kiosk_offline";
    let activeOrders=0;
    if(device.device_type==="kitchen_display"){const {count}=await client.from("orders").select("id",{count:"exact",head:true}).eq("branch_id",device.branch_id).in("status",["pending","preparing","ready"]);activeOrders=count||0}
    await client.from("device_health").update({status:"offline",offline_incident_started_at:incident,offline_alerted_at:now.toISOString()}).eq("device_id",device.device_id);
    await client.from("notification_events").upsert({branch_id:device.branch_id,event_type:eventType,source_type:"device",source_id:device.device_id,severity:activeOrders>0?"critical":"warning",event_key:`${eventType}:${device.device_id}:${incident}`,payload:{device_name:device.device_name,device_type:device.device_type,last_seen_at:device.last_seen_at,offline_duration:"More than 5 minutes",active_orders_exist:activeOrders>0,active_order_count:activeOrders,suggested_action:"Check device power, network connectivity, and the MORROW application."},occurred_at:now.toISOString()},{onConflict:"branch_id,event_key",ignoreDuplicates:true});
  }
  const {data:syncFailed}=await client.from("device_health").select("*").gte("sync_retry_count",3).eq("status","sync_failed");
  for(const device of syncFailed??[])await client.from("notification_events").upsert({branch_id:device.branch_id,event_type:"device_sync_failure",source_type:"device",source_id:device.device_id,severity:"warning",event_key:`device_sync_failure:${device.device_id}:${device.last_sync_at||device.updated_at}`,payload:{device_name:device.device_name,last_sync_at:device.last_sync_at,error_code:device.sync_failure_code,retry_count:device.sync_retry_count,sync_target:device.sync_target,suggested_action:"Review device connectivity and retry configuration synchronization."},occurred_at:now.toISOString()},{onConflict:"branch_id,event_key",ignoreDuplicates:true});
  const processed=[];
  const {data:runs}=await client.from("notification_report_runs").select("*").in("status",["pending","retry"]).or(`next_retry_at.is.null,next_retry_at.lte.${now.toISOString()}`).limit(25);
  for(const run of runs??[])if(await claim(client,"notification_report_runs",run.id,run.status)){const result=await dispatch(url,expected,{type:run.report_type,branchId:run.branch_id,eventId:run.id,periodStart:run.report_period_start,periodEnd:run.report_period_end});await finish(client,"notification_report_runs",run,result);processed.push(run.id)}
  const {data:events}=await client.from("notification_events").select("*").in("notification_status",["pending","retry"]).or(`next_retry_at.is.null,next_retry_at.lte.${now.toISOString()}`).limit(50);
  for(const event of events??[])if(await claim(client,"notification_events",event.id,event.notification_status)){const result=await dispatch(url,expected,{type:event.event_type,branchId:event.branch_id,eventId:event.id});await finish(client,"notification_events",event,result);processed.push(event.id)}
  return response({ok:true,processed});
});
function response(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}})}
function localParts(date:Date,timeZone:string){const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone,weekday:"short",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date).map(p=>[p.type,p.value]));return{weekday:parts.weekday,year:Number(parts.year),month:Number(parts.month),day:Number(parts.day),hour:parts.hour,minute:parts.minute}}
function dueWithinFiveMinutes(local:{hour:string;minute:string},configured:string){const [hour,minute]=configured.slice(0,5).split(":").map(Number),current=Number(local.hour)*60+Number(local.minute),target=hour*60+minute;return current>=target&&current-target<5}
function shiftLocalDate(local:{year:number;month:number;day:number;hour:string;minute:string;weekday:string},days:number){const shifted=new Date(Date.UTC(local.year,local.month-1,local.day+days));return{...local,year:shifted.getUTCFullYear(),month:shifted.getUTCMonth()+1,day:shifted.getUTCDate()}}
function zonedToUtc(local:{year:number;month:number;day:number;hour:string;minute:string},timeZone:string){const target=Date.UTC(local.year,local.month-1,local.day,Number(local.hour),Number(local.minute));let guess=target;for(let i=0;i<3;i++){const parts=localParts(new Date(guess),timeZone);const represented=Date.UTC(parts.year,parts.month-1,parts.day,Number(parts.hour),Number(parts.minute));guess+=target-represented}return new Date(guess)}
async function claim(client:any,table:string,id:string,status:string){const column=table==="notification_events"?"notification_status":"status";const {data}=await client.from(table).update({[column]:"processing"}).eq("id",id).eq(column,status).select("id");return Boolean(data?.length)}
async function dispatch(url:string,secret:string,body:unknown){try{const response=await fetch(`${url}/functions/v1/send-notification-email`,{method:"POST",headers:{"Content-Type":"application/json","x-morrow-internal-secret":secret},body:JSON.stringify(body)});return{ok:response.ok,body:await response.json()}}catch{return{ok:false,body:{message:"dispatcher_unavailable"}}}}
async function finish(client:any,table:string,row:any,result:any){const attempts=(row.retry_count||0)+1,column=table==="notification_events"?"notification_status":"status";const terminalAt=new Date().toISOString();if(result.ok){const status=result.body?.suppressed?"suppressed":"sent";const update=table==="notification_events"?{[column]:status,processed_at:terminalAt}:{[column]:status,completed_at:terminalAt};await client.from(table).update(update).eq("id",row.id)}else{const update:any={[column]:attempts>=5?"failed":"retry",retry_count:attempts,next_retry_at:attempts>=5?null:new Date(Date.now()+Math.min(3600000,60000*2**attempts)).toISOString()};if(table==="notification_report_runs")update.error_message=String(result.body?.message||"notification_failed").slice(0,500);await client.from(table).update(update).eq("id",row.id)}}
