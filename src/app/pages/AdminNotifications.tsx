import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { NotificationSettings } from "../../admin/types/adminTypes";
import type { NotificationDeliveryLogRow } from "../../lib/supabase/database.types";
import { useAuth } from "../auth/AuthContext";
import { getNotificationSettings, getRecentDeliveryLogs, isValidNotificationEmail, saveNotificationSettings, sendDailyReportNow, sendTestNotification } from "../services/supabase/notificationService";

const input = "mt-1 min-h-11 w-full rounded-xl border border-[#ECECEC] bg-[#F8F9FA] px-3 text-sm text-[#1F1F1F] outline-none transition focus:border-[#C41E19]/45 focus:bg-white focus:ring-2 focus:ring-[#C41E19]/10";
const button = "rounded-xl border border-transparent px-4 py-2.5 text-sm font-bold shadow-sm transition hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C41E19]/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40";
const card = "rounded-2xl border border-[#ECECEC] bg-white p-6 shadow-[0_8px_28px_rgba(31,31,31,.05)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(31,31,31,.08)]";
const defaults: NotificationSettings = { restaurantEmail: "", secondaryEmail: "", dailySalesReport: true, weeklySalesSummary: false, orderFailureAlerts: true, paymentFailureAlerts: true, kioskOfflineAlerts: true, kitchenDisplayOfflineAlerts: true, deviceSyncFailureAlerts: true, dailyReportTime: "22:00" };

export default function AdminNotifications() {
  const auth = useAuth();
  const [settings, setSettings] = useState(defaults);
  const [logs, setLogs] = useState<NotificationDeliveryLogRow[]>([]);
  const [recipient, setRecipient] = useState("");
  const [testOpen, setTestOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [backendMessage, setBackendMessage] = useState("");
  const refreshLogs = useCallback(async () => { const result = await getRecentDeliveryLogs(); if (result.ok) setLogs(result.data); }, []);

  useEffect(() => {
    let active = true;
    void getNotificationSettings().then(result => {
      if (!active) return;
      if (!result.ok) { setBackendMessage(result.error.message); return; }
      if (result.data) setSettings({
        restaurantEmail: result.data.primary_email, secondaryEmail: result.data.secondary_email ?? "", dailyReportTime: result.data.daily_report_time.slice(0, 5),
        dailySalesReport: result.data.daily_sales_report, weeklySalesSummary: result.data.weekly_sales_summary,
        orderFailureAlerts: result.data.order_failure_alerts, paymentFailureAlerts: result.data.payment_failure_alerts,
        kioskOfflineAlerts: result.data.kiosk_offline_alerts, kitchenDisplayOfflineAlerts: result.data.kitchen_offline_alerts,
        deviceSyncFailureAlerts: result.data.device_sync_failure_alerts,
      });
    });
    void refreshLogs();
    return () => { active = false; };
  }, [refreshLogs]);

  async function save() {
    if (!isValidNotificationEmail(settings.restaurantEmail) || settings.secondaryEmail && !isValidNotificationEmail(settings.secondaryEmail)) return toast.error("Enter valid notification email addresses.");
    setSaving(true);
    const result = await saveNotificationSettings({
      primaryEmail: settings.restaurantEmail, secondaryEmail: settings.secondaryEmail, dailyReportTime: settings.dailyReportTime,
      dailySalesReport: settings.dailySalesReport, weeklySalesSummary: settings.weeklySalesSummary, orderFailureAlerts: settings.orderFailureAlerts,
      paymentFailureAlerts: settings.paymentFailureAlerts, kioskOfflineAlerts: settings.kioskOfflineAlerts,
      kitchenOfflineAlerts: settings.kitchenDisplayOfflineAlerts, deviceSyncFailureAlerts: settings.deviceSyncFailureAlerts,
    });
    setSaving(false);
    if (!result.ok) { setBackendMessage(result.error.message); return toast.error(result.error.message); }
    setBackendMessage(""); toast.success("Notification settings saved.");
  }

  async function sendTest() {
    if (!isValidNotificationEmail(recipient)) return toast.error("Enter a valid recipient email.");
    setSending(true); const result = await sendTestNotification(recipient); setSending(false);
    if (!result.ok) { setBackendMessage(result.error.message); return toast.error(result.error.message); }
    setBackendMessage(""); setTestOpen(false);
    toast.success(`Test notification sent to ${result.data.recipient}${import.meta.env.DEV ? ` · ${result.data.messageId}` : ""}`);
    await refreshLogs();
  }

  async function sendReport() {
    setReporting(true);
    const result = await sendDailyReportNow();
    setReporting(false);
    if (!result.ok) {
      setBackendMessage(result.error.message);
      return toast.error(result.error.message);
    }
    const recipient =
      result.data.recipient ??
      result.data.recipients?.join(", ") ??
      settings.restaurantEmail ??
      "configured recipients";

    setBackendMessage("");
    toast.success(`Daily report sent to ${recipient}`);
    await refreshLogs();
  }

  const preferences: [keyof NotificationSettings, string][] = [
    ["dailySalesReport", "Daily Sales Report"], ["weeklySalesSummary", "Weekly Sales Summary"], ["orderFailureAlerts", "Order Failure Alerts"],
    ["paymentFailureAlerts", "Payment Failure Alerts"], ["kioskOfflineAlerts", "Kiosk Offline Alerts"],
    ["kitchenDisplayOfflineAlerts", "Kitchen Display Offline Alerts"], ["deviceSyncFailureAlerts", "Device Sync Failure Alerts"],
  ];
  return <>
    <div className="mb-7"><h1 className="text-[1.65rem] font-black tracking-[-.035em] text-[#1F1F1F]">Notifications</h1><p className="mt-1.5 text-sm leading-relaxed text-[#6B7280]">Manage restaurant reports and system alerts</p></div>
    <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
      <section className={card}><h2 className="mb-5 font-bold text-[#1F1F1F]">Notification Email</h2><div className="grid gap-4"><Field label="Restaurant Email" value={settings.restaurantEmail} onChange={restaurantEmail => setSettings({ ...settings, restaurantEmail })}/><Field label="Secondary Email (optional)" value={settings.secondaryEmail} onChange={secondaryEmail => setSettings({ ...settings, secondaryEmail })}/><label className="text-xs font-medium text-[#6B7280]">Daily Report Time<input type="time" className={input} value={settings.dailyReportTime} onChange={event => setSettings({ ...settings, dailyReportTime: event.target.value })}/></label></div></section>
      <section className={card}><h2 className="mb-5 font-bold text-[#1F1F1F]">Notification Preferences</h2><div className="space-y-4">{preferences.map(([key, label]) => <Toggle key={key} label={label} checked={Boolean(settings[key])} onChange={checked => setSettings({ ...settings, [key]: checked })}/>)}</div></section>
      <div className="flex flex-wrap gap-2 lg:col-span-2"><button disabled={saving || auth.isDemoAuth} onClick={() => void save()} className={`${button} bg-[#C41E19] text-white hover:bg-[#A8161A]`}>{saving ? "Saving…" : "Save Notification Settings"}</button><button disabled={sending || auth.isDemoAuth} onClick={() => { setRecipient(settings.restaurantEmail); setTestOpen(true); }} className={`${button} border-[#ECECEC] bg-white text-[#1F1F1F] hover:border-[#C41E19]/25 hover:bg-[#C41E19]/5 hover:text-[#C41E19]`}>Send Test Notification</button><button disabled={reporting || auth.isDemoAuth} onClick={() => void sendReport()} className={`${button} border-[#ECECEC] bg-white text-[#1F1F1F] hover:border-[#C41E19]/25 hover:bg-[#C41E19]/5 hover:text-[#C41E19]`}>{reporting ? "Generating…" : "Send Daily Report Now"}</button></div>
      <p className="text-[11px] text-[#9CA3AF] lg:col-span-2">Next daily report: {settings.dailyReportTime} branch time · Weekly summary: Monday 00:00 branch time</p>
      {(auth.isDemoAuth || backendMessage) && <p className="rounded-lg border border-[#C41E19]/20 bg-[#C41E19]/5 px-3 py-2 text-[11px] text-[#C41E19] lg:col-span-2">{auth.isDemoAuth ? "Email delivery is not configured." : backendMessage}</p>}
      <section className={`${card} lg:col-span-2`}><h2 className="mb-5 font-bold text-[#1F1F1F]">Recent Delivery Attempts</h2>{logs.length ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs text-[#1F1F1F]"><thead className="text-[#9CA3AF]"><tr><th>Recipient</th><th>Type</th><th>Status</th><th>Time</th><th>Provider message ID</th></tr></thead><tbody>{logs.map(log => <tr key={log.id} className="border-t border-[#ECECEC]"><td className="py-3">{log.recipient}</td><td>{log.notification_type}</td><td>{log.status}</td><td>{new Date(log.sent_at ?? log.created_at).toLocaleString()}</td><td className="font-mono text-[#6B7280]">{log.provider_message_id ?? "—"}</td></tr>)}</tbody></table></div> : <p className="text-xs text-[#6B7280]">No delivery attempts recorded.</p>}<p className="mt-3 text-[10px] text-[#9CA3AF]">Sent confirms provider acceptance; final inbox delivery depends on the recipient server.</p></section>
    </div>
    {testOpen && <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#1F1F1F]/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Send Test Notification"><div className="w-full max-w-xl rounded-2xl border border-[#ECECEC] bg-white p-5 text-[#1F1F1F] shadow-[0_24px_80px_rgba(31,31,31,.18)]"><h2 className="mb-5 text-lg font-bold">Send Test Notification</h2><Field label="Recipient Email" value={recipient} onChange={setRecipient}/><p className="mt-3 text-[11px] text-[#9CA3AF]">This sends a real MORROW test email through the configured provider.</p><div className="mt-5 flex justify-end gap-2"><button disabled={sending} onClick={() => setTestOpen(false)} className={`${button} border-[#ECECEC] bg-white text-[#1F1F1F] hover:bg-[#F8F9FA]`}>Cancel</button><button disabled={sending} onClick={() => void sendTest()} className={`${button} bg-[#C41E19] text-white hover:bg-[#A8161A]`}>{sending ? "Sending…" : "Send Test"}</button></div></div></div>}
  </>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-xs font-medium text-[#6B7280]">{label}<input type="email" className={input} value={value} onChange={event => onChange(event.target.value)}/></label>; }
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) { return <label className="flex items-center justify-between gap-4 text-sm text-[#1F1F1F]"><span>{label}</span><button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`h-6 w-11 rounded-full border p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C41E19]/35 ${checked ? "border-[#C41E19] bg-[#C41E19]" : "border-[#ECECEC] bg-[#F8F9FA]"}`}><span className={`block size-4 rounded-full bg-white shadow-sm transition ${checked ? "translate-x-5" : ""}`}/></button></label>; }
