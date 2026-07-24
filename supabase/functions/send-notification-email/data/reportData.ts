import { formatCurrency } from "../utils/formatCurrency.ts";

type Order = {id:string;status:string;payment_status:string;total:number|string;tax:number|string;source:string;order_type:string;created_at:string};
export type DailyReportData = {
  branchName:string; localDate:string; totalSales:string; totalOrders:number; averageOrderValue:string; paidOrders:number;
  comparison?:{sales:string;orders:string}; topProducts:Array<{name:string;quantity:number;sales:string}>;
  payments:Array<{label:string;count:number}>; sources:Array<{label:string;count:number}>; attention:string[];
};
const money=(orders:Order[],field:"total"|"tax"="total")=>orders.reduce((sum,order)=>sum+Number(order[field]||0),0);
const count=(orders:Order[],field:keyof Order,value:string)=>orders.filter(order=>order[field]===value).length;
const change=(current:number,previous:number)=>previous===0?(current===0?"0%":"New"):`${((current-previous)/previous*100).toFixed(1)}%`;

export async function loadReportData(client:any,branch:any,type:"daily_sales_report"|"weekly_sales_summary",start:string,end:string){
  const duration=Date.parse(end)-Date.parse(start),previousStart=new Date(Date.parse(start)-duration).toISOString();
  const {data:orders,error}=await client.from("orders").select("id,status,payment_status,total,tax,source,order_type,created_at").eq("branch_id",branch.id).gte("created_at",previousStart).lt("created_at",end);
  if(error)throw new Error("report_orders_unavailable");
  const current=(orders??[]).filter((order:Order)=>order.created_at>=start) as Order[];
  const previous=(orders??[]).filter((order:Order)=>order.created_at<start) as Order[];
  const ids=current.map(order=>order.id);
  const {data:items}=ids.length?await client.from("order_items").select("order_id,product_id,product_name_snapshot,quantity,line_total").in("order_id",ids):{data:[]};
  const productIds=[...new Set((items??[]).map((item:any)=>item.product_id).filter(Boolean))];
  const {data:products}=productIds.length?await client.from("products").select("id,category_id").in("id",productIds):{data:[]};
  const categoryIds=[...new Set((products??[]).map((product:any)=>product.category_id).filter(Boolean))];
  const {data:categories}=categoryIds.length?await client.from("categories").select("id,name").in("id",categoryIds):{data:[]};
  const categoryByProduct=new Map<string,string>((products??[]).map((product:any)=>[String(product.id),String((categories??[]).find((category:any)=>category.id===product.category_id)?.name||"Uncategorized")]));
  const top=new Map<string,{quantity:number;value:number}>();
  const categorySales=new Map<string,number>();
  for(const item of items??[]){
    const value=Number(item.line_total||0),entry=top.get(item.product_name_snapshot)??{quantity:0,value:0};
    entry.quantity+=Number(item.quantity);entry.value+=value;top.set(item.product_name_snapshot,entry);
    const category=categoryByProduct.get(item.product_id)||"Uncategorized";categorySales.set(category,(categorySales.get(category)||0)+value);
  }
  const ordered=money(current),paid=money(current.filter(order=>order.payment_status==="paid"));
  if(type==="daily_sales_report"){
    const paidOrders=count(current,"payment_status","paid"),unpaid=count(current,"payment_status","unpaid"),failed=count(current,"payment_status","failed"),cancelled=count(current,"status","cancelled");
    const sourceValues=[["Kiosk",count(current,"source","kiosk")],["Cashier",count(current,"source","cashier")],["Nori",count(current,"source","nori")]] as Array<[string,number]>;
    const attention:string[]=[];
    if(unpaid)attention.push(`${unpaid} ${unpaid===1?"order is":"orders are"} still unpaid.`);
    if(failed)attention.push(`${failed} ${failed===1?"payment failed":"payments failed"} today.`);
    if(cancelled)attention.push(`${cancelled} ${cancelled===1?"order was":"orders were"} cancelled today.`);
    const salesChange=previous.length?Math.round((ordered-money(previous))/money(previous)*100):null;
    const orderChange=previous.length?current.length-previous.length:null;
    const daily:DailyReportData={
      branchName:branch.name,
      localDate:new Intl.DateTimeFormat("en-GB",{timeZone:branch.timezone,day:"numeric",month:"long",year:"numeric"}).format(new Date(end)),
      totalSales:formatCurrency(ordered,branch.currency),
      totalOrders:current.length,
      averageOrderValue:formatCurrency(current.length?ordered/current.length:0,branch.currency),
      paidOrders,
      comparison:salesChange===null||!Number.isFinite(salesChange)||orderChange===null?undefined:{sales:`${salesChange>=0?"+":""}${salesChange}%`,orders:`${orderChange>=0?"+":""}${orderChange}`},
      topProducts:[...top.entries()].sort((a,b)=>b[1].value-a[1].value).slice(0,3).map(([name,value])=>({name,quantity:value.quantity,sales:formatCurrency(value.value,branch.currency)})),
      payments:[{label:"Paid",count:paidOrders},...(unpaid?[{label:"Unpaid",count:unpaid}]:[]),...(failed?[{label:"Failed",count:failed}]:[])],
      sources:sourceValues.filter(([,value])=>value>0).map(([label,value])=>({label,count:value})),
      attention,
    };
    return{daily};
  }
  const topProducts=[...top.entries()].sort((a,b)=>b[1].value-a[1].value).slice(0,10).map(([name,value])=>`${name} (${value.quantity}, ${formatCurrency(value.value,branch.currency)})`).join("; ")||"No sales";
  const bucket=new Map<string,{orders:number,value:number}>();
  for(const order of current){
    const key=new Intl.DateTimeFormat("en-CA",{timeZone:branch.timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(order.created_at));
    const value=bucket.get(key)??{orders:0,value:0};value.orders++;value.value+=Number(order.total);bucket.set(key,value);
  }
  const trend=[...bucket.entries()].sort().map(([key,value])=>`${key}: ${value.orders} / ${formatCurrency(value.value,branch.currency)}`).join("; ")||"No orders";
  const busiest=[...bucket.entries()].sort((a,b)=>b[1].orders-a[1].orders)[0];
  const rows:Array<[string,string]>=[
    ["Period",`${start} — ${end}`],["Total ordered value",formatCurrency(ordered,branch.currency)],["Paid sales",formatCurrency(paid,branch.currency)],
    ["Tax total",formatCurrency(money(current,"tax"),branch.currency)],["Total orders",String(current.length)],
    ["Completed / Cancelled",`${count(current,"status","completed")} / ${count(current,"status","cancelled")}`],["Average order value",formatCurrency(current.length?ordered/current.length:0,branch.currency)],
    ["Sources",`Kiosk ${count(current,"source","kiosk")} · Cashier ${count(current,"source","cashier")} · Nori ${count(current,"source","nori")}`],
    ["Order types",`Dine-in ${count(current,"order_type","dine_in")} · Takeaway ${count(current,"order_type","takeaway")}`],["Top products",topProducts],
    ["Payment status",`Paid ${count(current,"payment_status","paid")} · Unpaid ${count(current,"payment_status","unpaid")} · Pending ${count(current,"payment_status","pending")} · Failed ${count(current,"payment_status","failed")} · Refunded ${count(current,"payment_status","refunded")}`],
    ["Daily trend",trend],
    ["Previous period comparison",`Ordered value ${change(ordered,money(previous))} · Orders ${change(current.length,previous.length)}`],
  ];
  {
    rows.push(["Best sales day / busiest period",busiest?`${busiest[0]} (${formatCurrency(busiest[1].value,branch.currency)})`:"No sales"]);
    rows.push(["Category sales",[...categorySales.entries()].sort((a,b)=>b[1]-a[1]).map(([name,value])=>`${name} ${formatCurrency(value,branch.currency)}`).join("; ")||"No sales"]);
    const {data:incidents}=await client.from("notification_events").select("event_type").eq("branch_id",branch.id).gte("occurred_at",start).lt("occurred_at",end);
    rows.push(["Operational incidents",["order_failure","payment_failure","kiosk_offline","kitchen_display_offline","device_sync_failure"].map(event=>`${event.replace(/_/g," ")} ${(incidents??[]).filter((item:any)=>item.event_type===event).length}`).join(" · ")]);
  }
  return{title:"Weekly Sales Summary",summary:`Authoritative weekly operational sales summary in ${branch.timezone}.`,rows};
}
