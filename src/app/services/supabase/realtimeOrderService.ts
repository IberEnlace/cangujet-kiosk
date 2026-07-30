import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabase/client";

export type RealtimeConnectionStatus = "connecting" | "connected" | "reconnecting" | "disconnected" | "error";
export type RealtimeSubscription = { unsubscribe: () => Promise<void> };

export function subscribeToBranchOrders(input: { branchId: string; audience: "kitchen" | "cashier"; onSignal: () => void; onStatus: (status: RealtimeConnectionStatus) => void }): RealtimeSubscription {
  const client = supabase;
  if (!client) { input.onStatus("disconnected"); return { unsubscribe: async () => undefined }; }
  const name = `orders:${input.audience}:${input.branchId}`;
  input.onStatus("connecting");
  const channel = client.channel(name)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: `branch_id=eq.${input.branchId}` }, input.onSignal)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `branch_id=eq.${input.branchId}` }, input.onSignal);
  subscribe(channel, input.onSignal, input.onStatus);
  return { unsubscribe: async () => { await client.removeChannel(channel); input.onStatus("disconnected"); } };
}

export function subscribeToPublicBoardSignal(onSignal: () => void, onStatus: (status: RealtimeConnectionStatus) => void): RealtimeSubscription {
  const client = supabase;
  if (!client) { onStatus("disconnected"); return { unsubscribe: async () => undefined }; }
  onStatus("connecting");
  const channel = client.channel("public-order-board-signal")
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "public_order_refresh_signal" }, onSignal);
  subscribe(channel, onSignal, onStatus);
  return { unsubscribe: async () => { await client.removeChannel(channel); onStatus("disconnected"); } };
}

function subscribe(channel: RealtimeChannel, refetch: () => void, update: (status: RealtimeConnectionStatus) => void) {
  let connected = false;
  channel.subscribe(status => {
    if (status === "SUBSCRIBED") { update(connected ? "reconnecting" : "connected"); connected = true; refetch(); queueMicrotask(() => update("connected")); }
    else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") update(connected ? "reconnecting" : "error");
    else if (status === "CLOSED") update("disconnected");
    if (import.meta.env?.DEV) console.debug(`[MORROW realtime] ${channel.topic}: ${status}`);
  });
}
