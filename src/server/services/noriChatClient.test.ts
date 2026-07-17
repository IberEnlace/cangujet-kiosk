import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { postNoriChat, shouldSubmitNoriKey, type NoriFetch } from "../../app/services/noriChatClient";
import type { NoriChatRequest, NoriChatResponse } from "../types/noriChat";

const request: NoriChatRequest = { message: "Show my cart.", cart: [], activeAllergens: [], language: "en" };
const response: NoriChatResponse = {
  reply: "Your cart is empty.", intent: "show_cart",
  recommendedProducts: [], warnings: [], actions: [], conversationState: {} as NoriChatResponse["conversationState"],
};

test("one submission performs exactly one HTTP request with one client request ID", async () => {
  let calls = 0;
  let requestId = "";
  const fetchImpl: NoriFetch = async (_input, init) => {
    calls += 1;
    requestId = new Headers(init?.headers).get("X-Nori-Request-Id") ?? "";
    return new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  await postNoriChat(request, { requestId: "client-request-1", fetchImpl });
  assert.equal(calls, 1);
  assert.equal(requestId, "client-request-1");
});

test("backend fallback response does not create a frontend retry", async () => {
  let calls = 0;
  const fallback = { ...response, reply: "Here is the deterministic fallback." };
  const fetchImpl: NoriFetch = async () => {
    calls += 1;
    return new Response(JSON.stringify(fallback), { status: 200 });
  };
  assert.equal((await postNoriChat(request, { fetchImpl })).reply, fallback.reply);
  assert.equal(calls, 1);
});

test("Enter submits and Shift+Enter does not submit", () => {
  assert.equal(shouldSubmitNoriKey({ key: "Enter", shiftKey: false }), true);
  assert.equal(shouldSubmitNoriKey({ key: "Enter", shiftKey: true }), false);
});

test("composing Enter does not submit", () => {
  assert.equal(shouldSubmitNoriKey({ key: "Enter", shiftKey: false, isComposing: true }), false);
});

test("live assistant uses one form submit path without a send-button click handler", () => {
  const source = readFileSync("src/app/pages/KioskJourney.tsx", "utf8");
  assert.match(source, /<form[^>]+onSubmit=/);
  assert.match(source, /type="submit"/);
  assert.doesNotMatch(source, /onClick=\{\(\) => void sendAIMessage\(\)\}/);
  assert.match(source, /form\?\.requestSubmit\(\)/);
});

test("both assistants share the single Nori HTTP request builder", () => {
  const kiosk = readFileSync("src/app/pages/KioskJourney.tsx", "utf8");
  const standalone = readFileSync("src/app/pages/AIAssistant.tsx", "utf8");
  assert.doesNotMatch(kiosk, /fetch\("\/api\/nori\/chat"/);
  assert.doesNotMatch(standalone, /fetch\("\/api\/nori\/chat"/);
  const client = readFileSync("src/app/services/noriChatClient.ts", "utf8");
  assert.equal((client.match(/fetchImpl\("\/api\/nori\/chat"/g) ?? []).length, 1);
});

test("one parsed response is represented by one returned assistant reply", async () => {
  const replies: string[] = [];
  const fetchImpl: NoriFetch = async () => new Response(JSON.stringify(response), { status: 200 });
  const result = await postNoriChat(request, { fetchImpl });
  replies.push(result.reply);
  assert.deepEqual(replies, ["Your cart is empty."]);
});

test("live assistant ignores an in-flight duplicate and releases the guard in finally", () => {
  const source = readFileSync("src/app/pages/KioskJourney.tsx", "utf8");
  assert.match(source, /if \(!message \|\| aiSendingRef\.current\) return;/);
  assert.match(source, /aiSendingRef\.current = true;/);
  assert.match(source, /finally \{[\s\S]*aiSendingRef\.current = false;/);
});
