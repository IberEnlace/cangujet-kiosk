import type { NoriChatRequest, NoriChatResponse } from "../../server/types/noriChat";

export type NoriFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function createNoriRequestId(): string {
  return crypto.randomUUID();
}

export async function postNoriChat(
  request: NoriChatRequest,
  options: { requestId?: string; fetchImpl?: NoriFetch } = {},
): Promise<NoriChatResponse> {
  const requestId = options.requestId ?? createNoriRequestId();
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl("/api/nori/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Nori-Request-Id": requestId },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error("Nori API request failed.");
  return await response.json() as NoriChatResponse;
}

export function shouldSubmitNoriKey(event: { key: string; shiftKey: boolean; isComposing?: boolean }): boolean {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing;
}
