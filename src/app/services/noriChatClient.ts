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
  console.log("[NORI][CLIENT_REQUEST_START]", { requestId, message: request.message });
  try {
    const response = await fetchImpl("/api/nori/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Nori-Request-Id": requestId },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error("Nori API request failed.");
    const parsedResponse = await response.json() as NoriChatResponse;
    console.log("[NORI][PARSED_RESPONSE]", parsedResponse);
    console.log("[NORI][RESPONSE_ACTIONS]", parsedResponse.actions);
    return parsedResponse;
  } finally {
    console.log("[NORI][CLIENT_REQUEST_FINISH]", { requestId, message: request.message });
  }
}

export function shouldSubmitNoriKey(event: { key: string; shiftKey: boolean; isComposing?: boolean }): boolean {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing;
}
