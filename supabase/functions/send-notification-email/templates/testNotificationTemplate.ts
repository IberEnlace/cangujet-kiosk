import { emailLayout } from "./emailLayout.ts";
import { escapeHtml, plainTextValue } from "../utils/escapeHtml.ts";
import { formatEmailDate } from "../utils/formatDate.ts";

export type TestNotificationTemplateInput = {
  branchName: string;
  recipient: string;
  timestamp: string;
  environment?: string;
};

export function buildTestNotificationEmail(input: TestNotificationTemplateInput) {
  const branch = escapeHtml(input.branchName);
  const recipient = escapeHtml(input.recipient);
  const environment = input.environment ? escapeHtml(input.environment) : "";
  const formatted = formatEmailDate(input.timestamp);
  const details = [
    ["Branch", branch],
    ["Recipient", recipient],
    ["Date", escapeHtml(formatted.date)],
    ["Time", escapeHtml(formatted.time)],
    ...(environment ? [["Environment", environment]] : []),
  ].map(([label, value]) => detailRow(label, value)).join("");

  const content = `
    <div style="display:inline-block;border-radius:999px;background-color:#D7FB69;padding:7px 11px;font-size:10px;line-height:12px;font-weight:800;letter-spacing:1.2px;color:#17200F;">TEST NOTIFICATION</div>
    <h1 style="margin:22px 0 0 0;font-size:28px;line-height:35px;font-weight:750;color:#FFFFFF;">Your MORROW email notifications are working</h1>
    <p style="margin:13px 0 0 0;font-size:15px;line-height:24px;color:#9CA39A;">This test confirms that your restaurant can receive system alerts and operational reports.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:27px;border-collapse:separate;border-spacing:0;border:1px solid #2a2e28;border-radius:12px;background-color:#1A1D18;">${details}</table>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:22px;border-collapse:separate;border-spacing:0;border-radius:12px;background-color:#D7FB69;">
      <tr>
        <td width="54" style="padding:18px 0 18px 18px;vertical-align:top;"><span style="display:inline-block;width:30px;height:30px;border-radius:15px;background-color:#17200F;text-align:center;font-size:18px;line-height:30px;font-weight:bold;color:#D7FB69;">✓</span></td>
        <td style="padding:17px 18px 17px 10px;"><div style="font-size:14px;line-height:19px;font-weight:800;color:#17200F;">Notification delivered to email provider</div><div style="padding-top:3px;font-size:12px;line-height:18px;color:#344025;">Resend accepted this message for delivery.</div></td>
      </tr>
    </table>`;

  const html = emailLayout({
    content, branchName: input.branchName, sent: formatted.sent,
    preheader: "Your MORROW email notifications are working.",
  });
  const text = `MORROW Notification Test

Your MORROW email notifications are working.

Branch: ${plainTextValue(input.branchName)}
Recipient: ${plainTextValue(input.recipient)}
Sent: ${plainTextValue(formatted.sent)}${input.environment ? `\nEnvironment: ${plainTextValue(input.environment)}` : ""}

This test confirms that system alerts and reports can be delivered.
Resend accepted this message for delivery.

Do not reply to this automated message.`;
  return { subject: "MORROW Notification Test", html, text };
}

function detailRow(label: string, value: string) {
  return `<tr><td style="width:34%;border-bottom:1px solid #2a2e28;padding:13px 16px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:.6px;color:#9CA39A;">${escapeHtml(label)}</td><td style="border-bottom:1px solid #2a2e28;padding:13px 16px;font-size:13px;line-height:18px;color:#FFFFFF;word-break:break-word;">${value}</td></tr>`;
}
