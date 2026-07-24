export type EmailDateParts = { date: string; time: string; sent: string };

export function formatEmailDate(timestamp: string): EmailDateParts {
  const value = new Date(timestamp);
  const date = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(value);
  const time = new Intl.DateTimeFormat("en", { timeStyle: "short", timeZone: "UTC", hour12: false }).format(value);
  return { date, time: `${time} UTC`, sent: `${date}, ${time} UTC` };
}
