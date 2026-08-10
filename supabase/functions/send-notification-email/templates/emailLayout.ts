import { escapeHtml } from "../utils/escapeHtml.ts";

type LayoutInput = { content: string; branchName: string; sent: string; preheader: string };

export function emailLayout({ content, branchName, sent, preheader }: LayoutInput): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>cangujet Notification Test</title>
</head>
<body style="margin:0;padding:0;background-color:#0B0D0A;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#0B0D0A;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;">
        <tr><td style="padding:0 4px 22px 4px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="vertical-align:middle;">
                <div style="font-size:25px;line-height:30px;font-weight:800;letter-spacing:3px;color:#FFFFFF;">cangujet</div>
                <div style="padding-top:5px;font-size:10px;line-height:14px;font-weight:700;letter-spacing:1.8px;color:#9CA39A;">RESTAURANT OPERATIONS</div>
              </td>
              <td align="right" style="vertical-align:middle;"><span style="display:inline-block;width:36px;height:6px;border-radius:6px;background-color:#D7FB69;font-size:0;line-height:0;">&nbsp;</span></td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="border:1px solid #292c27;border-radius:18px;background-color:#121511;padding:34px 32px;">${content}</td></tr>
        <tr><td style="padding:24px 8px 0 8px;text-align:center;">
          <div style="font-size:13px;line-height:18px;font-weight:700;letter-spacing:1.5px;color:#FFFFFF;">cangujet</div>
          <div style="padding-top:7px;font-size:11px;line-height:17px;color:#9CA39A;">${escapeHtml(branchName)} · ${escapeHtml(sent)}</div>
          <div style="padding-top:8px;font-size:10px;line-height:16px;color:#737970;">Automated operational message from cangujet Restaurant Platform.<br>Do not reply to this automated message.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
