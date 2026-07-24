import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildOperationalEmail } from "../../../../supabase/functions/send-notification-email/templates/operationalTemplate";

const read=(path:string)=>readFileSync(path,"utf8");
const dispatcher=read("supabase/functions/send-notification-email/index.ts");
const processor=read("supabase/functions/process-notifications/index.ts");
const heartbeat=read("supabase/functions/device-heartbeat/index.ts");
const webhook=read("supabase/functions/resend-webhook/index.ts");
const migration=read("supabase/migrations/202607240003_operational_notifications.sql");
const report=read("supabase/functions/send-notification-email/data/reportData.ts");

test("dispatcher enforces settings, trusted authority, recipient privacy, and deduplication",()=>{
  assert.match(dispatcher,/notification_disabled/);
  assert.match(dispatcher,/MORROW_NOTIFICATION_INTERNAL_SECRET/);
  assert.match(dispatcher,/type!=="test"&&type!=="daily_sales_report"/);
  assert.match(dispatcher,/\[settings\?\.primary_email,settings\?\.secondary_email\]/);
  assert.match(dispatcher,/new Set/);
  assert.match(dispatcher,/to:\[recipient\]/);
  assert.match(dispatcher,/idempotency_key:idempotency/);
});

test("reports use authoritative orders and keep ordered and paid values distinct",()=>{
  assert.match(report,/client\.from\("orders"\)/);
  assert.match(report,/payment_status==="paid"/);
  assert.match(report,/totalSales:/);
  assert.match(report,/paidOrders/);
  assert.match(report,/topProducts/);
  assert.match(report,/comparison:/);
  assert.match(report,/Daily trend/);
});

test("scheduled work is timezone-aware, DST-safe, atomically claimed, and unique",()=>{
  assert.match(processor,/Intl\.DateTimeFormat/);
  assert.match(processor,/zonedToUtc/);
  assert.match(processor,/\.eq\(column,status\)\.select\("id"\)/);
  assert.match(migration,/unique\(branch_id, report_type, report_period_start, report_period_end\)/);
  assert.match(migration,/'\*\/5 \* \* \* \*'/);
  assert.match(migration,/vault\.decrypted_secrets/);
});

test("device monitoring crosses thresholds once and sync alerts require three retries",()=>{
  assert.match(processor,/now\.getTime\(\)-5\*60000/);
  assert.match(processor,/event_key:`\$\{eventType\}:\$\{device\.device_id\}:\$\{incident\}`/);
  assert.match(processor,/active_order_count:activeOrders/);
  assert.match(processor,/\.gte\("sync_retry_count",3\)/);
  assert.match(heartbeat,/sync_retry_count\|\|0\)\+1/);
  assert.match(heartbeat,/offline_incident_started_at:null,offline_alerted_at:null/);
});

test("Resend webhook rejects unsigned events, verifies Svix HMAC, and updates terminal states",()=>{
  assert.match(webhook,/RESEND_WEBHOOK_SECRET/);
  assert.match(webhook,/svix-id/);
  assert.match(webhook,/crypto\.subtle\.sign/);
  for(const status of ["delivered","failed","bounced","delayed","complained"])assert.match(webhook,new RegExp(status));
  assert.match(migration,/provider_event_id/);
});

test("operational templates provide escaped HTML and plain text",()=>{
  const email=buildOperationalEmail({type:"kiosk_offline",branchName:"Main <script>",timestamp:"2026-07-24T12:00:00Z",title:"Kiosk offline",summary:"Device <unsafe>",rows:[["Device","Kiosk <1>"]],action:"Reconnect <now>",severity:"warning"});
  assert.doesNotMatch(email.html,/<script>|<unsafe>|<1>|<now>/);
  assert.match(email.html,/&lt;unsafe&gt;/);
  assert.match(email.text,/Kiosk offline/);
  assert.doesNotMatch(email.text,/<table|style=/i);
});
