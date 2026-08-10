import assert from "node:assert/strict";
import test from "node:test";
import { buildDailySalesReportEmail } from "../../../../supabase/functions/send-notification-email/templates/dailySalesReportTemplate";
import type { DailyReportData } from "../../../../supabase/functions/send-notification-email/data/reportData";

const base:DailyReportData={
  branchName:"cangujet Main Branch",localDate:"24 July 2026",periodStart:"2026-07-23T21:00:00.000Z",periodEnd:"2026-07-24T21:00:00.000Z",
  totalSales:"€66.53",grossSales:"€72.00",paidSales:"€66.53",totalOrders:6,submittedOrders:2,completedOrders:3,cancelledOrders:1,averageOrderValue:"€11.09",paidOrders:5,
  comparison:{sales:"+12%",orders:"+1"},
  topProducts:[
    {name:"Garden Chickpea Burger",quantity:4,sales:"€31.60"},
    {name:"Mango Chia Cup",quantity:2,sales:"€9.60"},
    {name:"Lean Turkey Avocado Burger",quantity:1,sales:"€9.40"},
    {name:"Must Not Render",quantity:1,sales:"€1.00"},
  ],
  payments:[{label:"Paid",count:5},{label:"Unpaid",count:1}],
  sources:[{label:"Cashier",count:6}],
  attention:["1 order is still unpaid."],
};

test("daily report renders a simple local-date summary without ISO timestamps",()=>{
  const email=buildDailySalesReportEmail(base);
  assert.match(email.html,/Daily Sales Report/);
  assert.match(email.html,/24 July 2026/);
  assert.match(email.html,/Total Sales/);
  assert.match(email.html,/Average Order Value/);
  assert.doesNotMatch(email.html,/2026-07-24T|Tax total|Hourly sales|Dine-in/i);
  assert.match(email.text,/Total Sales \(Paid\): €66\.53/);
});

test("comparison is shown only when available",()=>{
  assert.match(buildDailySalesReportEmail(base).html,/Compared with yesterday/);
  assert.match(buildDailySalesReportEmail(base).html,/Sales \+12%/);
  assert.doesNotMatch(buildDailySalesReportEmail({...base,comparison:undefined}).html,/Compared with yesterday|Ordered value Now|Orders Now/);
});

test("top products are limited to three and contain only manager-facing values",()=>{
  const email=buildDailySalesReportEmail(base);
  assert.match(email.html,/Garden Chickpea Burger/);
  assert.doesNotMatch(email.html,/Must Not Render/);
  assert.equal((email.text.match(/ sold · /g)??[]).length,3);
});

test("zero sources are omitted and a single source is described plainly",()=>{
  const email=buildDailySalesReportEmail({...base,sources:[{label:"Cashier",count:6}]});
  assert.match(email.html,/All orders came from Cashier\./);
  assert.doesNotMatch(email.html,/Kiosk 0|Nori 0/);
});

test("attention is hidden without issues and shown for unpaid or failed payments",()=>{
  assert.doesNotMatch(buildDailySalesReportEmail({...base,attention:[]}).html,/NEEDS ATTENTION/);
  const email=buildDailySalesReportEmail({...base,attention:["1 order is still unpaid.","2 payments failed today."]});
  assert.match(email.html,/NEEDS ATTENTION/);
  assert.match(email.html,/1 order is still unpaid/);
  assert.match(email.text,/2 payments failed today/);
});

test("all daily report dynamic HTML is escaped",()=>{
  const email=buildDailySalesReportEmail({...base,branchName:"<script>Main</script>",topProducts:[{name:"<img src=x>",quantity:1,sales:"€1"}]});
  assert.doesNotMatch(email.html,/<script>|<img src=x>/);
  assert.match(email.html,/&lt;script&gt;/);
});
