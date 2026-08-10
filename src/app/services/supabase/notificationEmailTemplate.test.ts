import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildTestNotificationEmail } from "../../../../supabase/functions/send-notification-email/templates/testNotificationTemplate";

const edgeFunction = readFileSync("supabase/functions/send-notification-email/index.ts", "utf8");

test("premium test email contains cangujet branding and the dark brand palette", () => {
  const email = buildTestNotificationEmail({ branchName: "Main Branch", recipient: "admin@example.com", timestamp: "2026-07-24T12:30:00.000Z" });
  assert.match(email.html, /cangujet/);
  assert.match(email.html, /RESTAURANT OPERATIONS/);
  assert.match(email.html, /#D7FB69/i);
  assert.match(email.html, /#0B0D0A/i);
  assert.match(email.html, /Your cangujet email notifications are working/);
  assert.match(email.html, /Resend accepted this message for delivery/);
});

test("all dynamic HTML fields are escaped", () => {
  const email = buildTestNotificationEmail({
    branchName: `Main <script>alert("branch")</script>`,
    recipient: `admin+<tag>@example.com`,
    timestamp: "2026-07-24T12:30:00.000Z",
    environment: `<img src=x onerror=alert(1)>`,
  });
  assert.doesNotMatch(email.html, /<script>|<tag>|<img src=x/i);
  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.html, /admin\+&lt;tag&gt;@example\.com/);
  assert.match(email.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test("plain-text fallback includes operational details without markup", () => {
  const email = buildTestNotificationEmail({ branchName: "Main Branch", recipient: "admin@example.com", timestamp: "2026-07-24T12:30:00.000Z" });
  assert.equal(email.subject, "cangujet Notification Test");
  assert.match(email.text, /Branch: Main Branch/);
  assert.match(email.text, /Recipient: admin@example\.com/);
  assert.match(email.text, /Sent: Jul 24, 2026/);
  assert.doesNotMatch(email.text, /<table|<div|style=/i);
});

test("Resend payload keeps html, text, message ID, and failure logging", () => {
  assert.match(edgeFunction, /html:\s*email\.html/);
  assert.match(edgeFunction, /text:\s*email\.text/);
  assert.match(edgeFunction, /provider_message_id:body\.id/);
  assert.match(edgeFunction, /status:\s*"failed"/);
});
