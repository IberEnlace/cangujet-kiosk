import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import { buildTestNotificationEmail } from "./templates/testNotificationTemplate.ts";
import { buildOperationalEmail } from "./templates/operationalTemplate.ts";
import { buildDailySalesReportEmail } from "./templates/dailySalesReportTemplate.ts";
import { isNotificationType, settingColumn, type NotificationType } from "./notificationTypes.ts";
import { loadReportData } from "./data/reportData.ts";
import { loadAlertData } from "./data/alertData.ts";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type,x-morrow-internal-secret","Access-Control-Allow-Methods":"POST,OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async request=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(request.method!=="POST")return json({ok:false,code:"method_not_allowed",message:"Only POST is supported."},405);
  const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!anon||!serviceKey)return json({ok:false,code:"server_not_configured",message:"Notification service is not configured."},503);
  let payload:{type?:unknown;branchId?:string;eventId?:string;recipient?:string;periodStart?:string;periodEnd?:string};
  try{payload=await request.json()}catch{return json({ok:false,code:"invalid_payload",message:"A valid JSON payload is required."},400)}
  if(!isNotificationType(payload.type))return json({ok:false,code:"invalid_notification_type",message:"Unsupported notification type."},400);
  const type=payload.type;
  const service=createClient(url,serviceKey,{auth:{persistSession:false}});
  const internalSecret=Deno.env.get("MORROW_NOTIFICATION_INTERNAL_SECRET")||"";
  const internal=internalSecret.length>=24&&constantTimeEqual(request.headers.get("x-morrow-internal-secret")||"",internalSecret);
  let branchId=payload.branchId,requestedBy:string|null=null,manualDailyReport=false;
  if(!internal){
    const authorization=request.headers.get("Authorization");
    if(!authorization?.startsWith("Bearer "))return json({ok:false,code:"authentication_required",message:"Authentication is required."},401);
    const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
    const {data:authData}=await userClient.auth.getUser(authorization.slice(7));
    if(!authData.user)return json({ok:false,code:"authentication_required",message:"Your session is invalid or expired."},401);
    const {data:profile}=await userClient.from("profiles").select("role,is_active,branch_id").eq("id",authData.user.id).maybeSingle();
    if(!profile?.is_active||profile.role!=="admin")return json({ok:false,code:"admin_required",message:"An active administrator account is required."},403);
    if(type!=="test"&&type!=="daily_sales_report")return json({ok:false,code:"internal_invocation_required",message:"This notification requires a trusted system invocation."},403);
    manualDailyReport=type==="daily_sales_report";
    branchId=profile.branch_id;requestedBy=authData.user.id;
  }
  if(!branchId)return json({ok:false,code:"branch_required",message:"A branch is required."},422);
  const {data:branch}=await service.from("branches").select("id,name,currency,timezone").eq("id",branchId).single();
  if(!branch)return json({ok:false,code:"branch_not_found",message:"The branch is unavailable."},404);
  const {data:settings}=await service.from("notification_settings").select("*").eq("branch_id",branchId).maybeSingle();
  if(type!=="test"&&!manualDailyReport&&(!settings||!settings[settingColumn[type as Exclude<NotificationType,"test">]]))return json({ok:true,suppressed:true,reason:"notification_disabled"});
  const recipients=dedupe(type==="test"&&payload.recipient?[payload.recipient]:[settings?.primary_email,settings?.secondary_email]);
  if(!recipients.length||recipients.some(value=>!emailPattern.test(value)))return json({ok:false,code:"invalid_email",message:"No valid notification recipient is configured."},422);
  const now=new Date().toISOString();
  let email;
  if(type==="test")email=buildTestNotificationEmail({branchName:branch.name,recipient:recipients[0],timestamp:now,environment:Deno.env.get("MORROW_ENVIRONMENT")||undefined});
  else if(type==="daily_sales_report"||type==="weekly_sales_summary"){
    const end=payload.periodEnd||now,start=payload.periodStart||new Date(Date.parse(end)-(type==="daily_sales_report"?864e5:7*864e5)).toISOString();
    const data=await loadReportData(service,branch,type,start,end);
    email=type==="daily_sales_report"?buildDailySalesReportEmail(data.daily):buildOperationalEmail({type,branchName:branch.name,timestamp:now,...data,severity:"info"});
  }else{
    if(!payload.eventId)return json({ok:false,code:"event_required",message:"A trusted notification event is required."},422);
    if(type==="payment_failure"&&!internal)return json({ok:false,code:"internal_invocation_required",message:"Payment alerts require a trusted payment event."},403);
    const data=await loadAlertData(service,branchId,payload.eventId,type);
    email=buildOperationalEmail({type,branchName:branch.name,timestamp:now,...data});
  }
  const resendKey=Deno.env.get("RESEND_API_KEY"),fromEmail=Deno.env.get("MORROW_NOTIFICATION_FROM_EMAIL"),fromName=Deno.env.get("MORROW_NOTIFICATION_FROM_NAME")||"MORROW";
  if(!resendKey||!fromEmail)return json({ok:false,code:"email_not_configured",message:"Email delivery is not configured."},503);
  const results=[];
  for(const recipient of recipients){
    const idempotency=`${type}:${branchId}:${payload.eventId||payload.periodStart||now.slice(0,16)}:${recipient}`;
    let {data:log,error:logError}=await service.from("notification_delivery_logs").insert({branch_id:branchId,recipient,notification_type:type,provider:"resend",status:"queued",requested_by:requestedBy,idempotency_key:idempotency}).select("id,status,provider_message_id,retry_count").single();
    if(logError?.code==="23505"){
      const {data:existing}=await service.from("notification_delivery_logs").select("id,status,provider_message_id,retry_count").eq("idempotency_key",idempotency).maybeSingle();
      if(existing&&["sent","delivered"].includes(existing.status)){results.push({recipient,ok:true,duplicate:true,messageId:existing.provider_message_id});continue}
      if(!existing||Number(existing.retry_count||0)>=5){results.push({recipient,ok:false,duplicate:true});continue}
      log=existing;logError=null;
      await service.from("notification_delivery_logs").update({status:"queued",next_retry_at:null}).eq("id",existing.id);
    }
    if(logError||!log)return json({ok:false,code:"delivery_log_failed",message:"The delivery attempt could not be recorded."},500);
    const retryCount=Number(log.retry_count||0)+1;
    try{
      const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${resendKey}`,"Content-Type":"application/json","Idempotency-Key":idempotency},body:JSON.stringify({from:`${fromName} <${fromEmail}>`,to:[recipient],subject:email.subject,html:email.html,text:email.text})});
      const body=await response.json();
      if(!response.ok||typeof body?.id!=="string"){await service.from("notification_delivery_logs").update({status:"failed",error_code:String(body?.name||"provider_rejected"),error_message:safeMessage(body),failed_at:new Date().toISOString(),retry_count:retryCount,next_retry_at:new Date(Date.now()+Math.min(3600000,60000*2**retryCount)).toISOString()}).eq("id",log.id);results.push({recipient,ok:false});continue}
      const sentAt=new Date().toISOString();await service.from("notification_delivery_logs").update({status:"sent",provider_message_id:body.id,sent_at:sentAt}).eq("id",log.id);results.push({recipient,ok:true,messageId:body.id,sentAt});
    }catch{await service.from("notification_delivery_logs").update({status:"failed",error_code:"provider_unavailable",error_message:"The provider could not be reached.",failed_at:new Date().toISOString(),retry_count:retryCount,next_retry_at:new Date(Date.now()+Math.min(3600000,60000*2**retryCount)).toISOString()}).eq("id",log.id);results.push({recipient,ok:false})}
  }
  const first=results.find((result:any)=>result.ok);
  if(!first)return json({ok:false,code:"provider_rejected",message:"No notification recipient was accepted by the provider.",results},502);
  return json({ok:true,messageId:first.messageId,recipient:first.recipient,sentAt:first.sentAt,results});
});

function dedupe(values:Array<string|null|undefined>){return[...new Set(values.map(value=>value?.trim().toLowerCase()).filter((value):value is string=>Boolean(value)))]}
function constantTimeEqual(a:string,b:string){if(a.length!==b.length)return false;let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);return mismatch===0}
function safeMessage(body:any){return typeof body?.message==="string"?body.message.slice(0,500):"Provider request failed."}
