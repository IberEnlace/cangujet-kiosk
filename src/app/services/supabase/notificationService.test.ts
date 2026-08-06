import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isValidNotificationEmail, saveNotificationSettings, sendTestNotification } from "./notificationService";

const migration = readFileSync("supabase/migrations/202607240002_notification_email_delivery.sql", "utf8");
const edgeFunction = readFileSync("supabase/functions/send-notification-email/index.ts", "utf8");
const notificationService = readFileSync("src/app/services/supabase/notificationService.ts", "utf8");
const page = readFileSync("src/app/pages/AdminNotifications.tsx", "utf8");

test("notification email validation rejects malformed addresses", () => {
  assert.equal(isValidNotificationEmail("admin@example.com"), true);
  assert.equal(isValidNotificationEmail("not-an-email"), false);
  assert.equal(isValidNotificationEmail("a @example.com"), false);
});

test("unconfigured frontend does not fake settings or email success", async () => {
  const settings = await saveNotificationSettings({
    primaryEmail: "admin@example.com", secondaryEmail: "", dailyReportTime: "22:00",
    dailySalesReport: true, weeklySalesSummary: false, orderFailureAlerts: true,
    paymentFailureAlerts: true, kioskOfflineAlerts: true, kitchenOfflineAlerts: true,
    deviceSyncFailureAlerts: true,
  });
  const delivery = await sendTestNotification("admin@example.com");
  assert.equal(settings.ok, false);
  assert.equal(delivery.ok, false);
  if (!delivery.ok) assert.match(delivery.error.message, /staff session|sign in/i);
  assert.doesNotMatch(page, /simulated successfully|pretend/i);
});

test("RLS permits branch admins and prevents client delivery-log inserts", () => {
  assert.match(migration, /public\.is_admin\(\) and branch_id = public\.current_user_branch_id\(\)/);
  assert.match(migration, /revoke insert, update, delete on public\.notification_delivery_logs from authenticated/);
  assert.doesNotMatch(migration, /to anon/);
});

test("Edge Function validates active admin and provider configuration", () => {
  assert.match(edgeFunction, /profile\.role\s*!==\s*"admin"/);
  assert.match(edgeFunction, /!profile\?\.is_active/);
  assert.match(edgeFunction, /RESEND_API_KEY/);
  assert.match(edgeFunction, /email_not_configured/);
  assert.match(edgeFunction, /https:\/\/api\.resend\.com\/emails/);
});

test("browser delivery uses authenticated same-origin API routes instead of invoking Edge Functions", () => {
  assert.match(notificationService, /staffApiRequest/);
  assert.match(notificationService, /\/api\/v1\/admin\/notifications\/daily-report/);
  assert.match(notificationService, /\/api\/v1\/admin\/notifications\/test/);
  assert.doesNotMatch(notificationService, /supabase\.functions\.invoke/);
});

test("Edge Function uses strict CORS and always handles runtime failures", () => {
  assert.match(edgeFunction, /http:\/\/localhost:5173/);
  assert.match(edgeFunction, /https:\/\/morrow-kiosk-suite\.vercel\.app/);
  assert.match(edgeFunction, /status:allowedOrigin\(request\)\?204:403/);
  assert.match(edgeFunction, /"Vary":"Origin"/);
  assert.match(edgeFunction, /notification_runtime_failed/);
  assert.doesNotMatch(edgeFunction, /"Access-Control-Allow-Origin":"\*"/);
});

test("provider success and failure both update a privileged delivery log", () => {
  assert.match(edgeFunction, /status:\s*"queued"/);
  assert.match(edgeFunction, /status:\s*"sent",provider_message_id:body\.id/);
  assert.match(edgeFunction, /status:\s*"failed",error_code:/);
  assert.match(edgeFunction, /messageId:body\.id/);
  assert.match(page, /if \(!result\.ok\).*toast\.error/s);
});

test("manual daily report bypasses only the schedule toggle and requires provider acceptance", () => {
  assert.match(edgeFunction, /manualDailyReport=type==="daily_sales_report"/);
  assert.match(edgeFunction, /!manualDailyReport&&\(!settings\|\|!settings\[/);
  assert.match(edgeFunction, /notification_type:type/);
  assert.match(edgeFunction, /buildOperationalEmail\(\{type,branchName/);
  assert.match(notificationService, /typeof payload\.messageId !== "string"/);
  assert.match(notificationService, /typeof payload\.recipient !== "string"/);
  assert.match(notificationService, /The daily report was not accepted for delivery/);
  assert.match(page, /await refreshLogs\(\)/);
});
