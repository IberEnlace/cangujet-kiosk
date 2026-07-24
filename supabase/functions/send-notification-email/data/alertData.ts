export async function loadAlertData(client:any, branchId:string, eventId:string, type:string){
  const {data:event,error}=await client.from("notification_events").select("*").eq("id",eventId).eq("branch_id",branchId).eq("event_type",type).single();
  if(error||!event)throw new Error("notification_event_not_found");
  const payload=event.payload&&typeof event.payload==="object"?event.payload:{};
  const safeKeys=["source","stage","error_code","error_summary","item_count","retry_count","order_number","provider","payment_method","amount","currency","device_name","device_type","last_seen_at","offline_duration","active_orders","last_sync_at","failure_time","sync_target"];
  const rows:Array<[string,string]>=[["Occurred at",event.occurred_at],["Severity",event.severity]];
  for(const key of safeKeys)if(payload[key]!==undefined)rows.push([key.replaceAll("_"," "),String(payload[key]).slice(0,500)]);
  return{title:type.replaceAll("_"," ").replace(/\b\w/g,(c:string)=>c.toUpperCase()),summary:"MORROW detected an operational condition that may require attention.",rows,action:String(payload.suggested_action??"Review the affected workflow in MORROW Admin."),severity:event.severity};
}
