import { emailLayout } from "./emailLayout.ts";
import { escapeHtml, plainTextValue } from "../utils/escapeHtml.ts";
import type { NotificationType } from "../notificationTypes.ts";

type Input = { type: NotificationType; branchName: string; timestamp: string; title: string; summary: string; rows: Array<[string, string]>; action?: string; severity?: "info"|"warning"|"critical" };
export function buildOperationalEmail(input: Input) {
  const accent = input.severity === "critical" ? "#E86D6D" : input.severity === "warning" ? "#F0B35A" : "#D7FB69";
  const rows = input.rows.map(([label,value]) => `<tr><td style="width:38%;border-bottom:1px solid #2a2e28;padding:12px 15px;font-size:11px;font-weight:700;color:#9CA39A;">${escapeHtml(label)}</td><td style="border-bottom:1px solid #2a2e28;padding:12px 15px;font-size:13px;color:#FFFFFF;">${escapeHtml(value)}</td></tr>`).join("");
  const content = `<div style="display:inline-block;border-radius:999px;background:${accent};padding:7px 11px;font-size:10px;font-weight:800;letter-spacing:1px;color:#17200F;">${escapeHtml(input.type.replace(/_/g," ").toUpperCase())}</div>
  <h1 style="margin:20px 0 0;font-size:27px;line-height:34px;color:#FFFFFF;">${escapeHtml(input.title)}</h1>
  <p style="margin:12px 0 0;font-size:15px;line-height:23px;color:#9CA39A;">${escapeHtml(input.summary)}</p>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;border:1px solid #2a2e28;border-radius:12px;background:#1A1D18;">${rows}</table>
  ${input.action ? `<div style="margin-top:20px;border-left:4px solid ${accent};background:#1A1D18;padding:14px 16px;font-size:13px;line-height:20px;color:#FFFFFF;"><strong>Recommended action:</strong> ${escapeHtml(input.action)}</div>` : ""}`;
  const html = emailLayout({ content, branchName: input.branchName, sent: input.timestamp, preheader: input.summary });
  const text = `cangujet — ${plainTextValue(input.title)}\n\n${plainTextValue(input.summary)}\n\n${input.rows.map(([k,v])=>`${plainTextValue(k)}: ${plainTextValue(v)}`).join("\n")}${input.action?`\n\nRecommended action: ${plainTextValue(input.action)}`:""}\n\nDo not reply to this automated message.`;
  return { subject: `cangujet — ${input.title}`, html, text };
}
