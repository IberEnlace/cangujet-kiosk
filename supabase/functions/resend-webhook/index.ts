import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

Deno.serve(async request=>{
  if(request.method!=="POST")return reply({ok:false},405);
  const raw=await request.text(),id=request.headers.get("svix-id")||"",timestamp=request.headers.get("svix-timestamp")||"",signature=request.headers.get("svix-signature")||"";
  const secret=Deno.env.get("RESEND_WEBHOOK_SECRET")||"";
  if(!await verifySvix(secret,id,timestamp,raw,signature))return reply({ok:false,code:"invalid_signature"},401);
  let event:any;try{event=JSON.parse(raw)}catch{return reply({ok:false},400)}
  const supported:Record<string,string>={"email.delivered":"delivered","email.failed":"failed","email.bounced":"bounced","email.delivery_delayed":"delayed","email.complained":"complained"};
  const status=supported[event.type];if(!status)return reply({ok:true,ignored:true});
  const messageId=event.data?.email_id;if(typeof messageId!=="string")return reply({ok:false,code:"message_id_required"},422);
  const client=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
  const {data:existing}=await client.from("notification_delivery_logs").select("id,provider_event_id").eq("provider_message_id",messageId).maybeSingle();
  if(!existing)return reply({ok:true,unmatched:true});
  const {error:eventError}=await client.from("notification_provider_events").insert({provider_event_id:id,delivery_log_id:existing.id,provider_event_type:event.type});
  if(eventError?.code==="23505")return reply({ok:true,duplicate:true});
  if(eventError)return reply({ok:false,code:"event_log_failed"},500);
  const now=new Date().toISOString(),update:any={status,provider_event_id:id,provider_event_type:event.type,last_provider_update_at:now};
  if(status==="delivered")update.delivered_at=now;if(status==="failed")update.failed_at=now;if(status==="bounced")update.bounced_at=now;if(status==="complained")update.complained_at=now;
  const {error}=await client.from("notification_delivery_logs").update(update).eq("id",existing.id);
  return error?reply({ok:false,code:"log_update_failed"},500):reply({ok:true});
});
function reply(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}})}
async function verifySvix(secret:string,id:string,timestamp:string,body:string,header:string){
  if(!secret.startsWith("whsec_")||!id||!timestamp||!header)return false;
  const seconds=Number(timestamp);if(!Number.isFinite(seconds)||Math.abs(Date.now()/1000-seconds)>300)return false;
  try{const keyBytes=Uint8Array.from(atob(secret.slice(6)),c=>c.charCodeAt(0));const key=await crypto.subtle.importKey("raw",keyBytes,{name:"HMAC",hash:"SHA-256"},false,["sign"]);const digest=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`${id}.${timestamp}.${body}`)));const expected=btoa(String.fromCharCode(...digest));return header.split(" ").some(part=>part.startsWith("v1,")&&constantTime(part.slice(3),expected))}catch{return false}
}
function constantTime(a:string,b:string){if(a.length!==b.length)return false;let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a.charCodeAt(i)^b.charCodeAt(i);return mismatch===0}
