import type { NextFunction, Request, Response } from "express";
import { noriAIService } from "../services/noriAIService";
import type {
  NoriChatError,
  NoriChatRequest,
  NoriChatResponse,
  NoriConversationState,
} from "../types/noriChat";
import { normalizeNoriRequestCart } from "../services/noriCartNormalizer";
import { normalizeSupportedLanguage } from "../../shared/languages";

export function isChatRequest(value: unknown): value is NoriChatRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<NoriChatRequest>;
  const validCart = Array.isArray(request.cart) && request.cart.every(item =>
    item !== null
    && typeof item === "object"
    && typeof item.productId === "string"
    && item.productId.length > 0
    && Number.isInteger(item.quantity)
    && item.quantity > 0
    && item.quantity <= 99,
  );
  const validConversationState = request.conversationState === undefined
    || (request.conversationState !== null
      && typeof request.conversationState === "object"
      && Array.isArray(request.conversationState.activeAllergens)
      && Array.isArray(request.conversationState.dietaryPreferences)
      && (request.conversationState.rankingPriorities === undefined || Array.isArray(request.conversationState.rankingPriorities))
      && (request.conversationState.preferredFlavors === undefined || Array.isArray(request.conversationState.preferredFlavors))
      && (request.conversationState.preferenceMemory === undefined
        || (request.conversationState.preferenceMemory !== null
          && typeof request.conversationState.preferenceMemory === "object"
          && Array.isArray(request.conversationState.preferenceMemory.dislikedIngredients)
          && Array.isArray(request.conversationState.preferenceMemory.preferredFlavors)))
      && validPlannerSnapshot(request.conversationState.plannerSnapshot)
      && validConversationLayer(request.conversationState));
  return typeof request.message === "string"
    && request.message.length <= 2_000
    && validCart
    && Array.isArray(request.activeAllergens)
    && request.activeAllergens.length <= 32
    && request.activeAllergens.every(allergen => typeof allergen === "string")
    && typeof request.language === "string"
    && request.language.length <= 16
    && validConversationState
    && validLifecycleContext(request.orderLifecycle)
    && (request.lifecycleEvent === undefined || typeof request.lifecycleEvent === "boolean");
}

const CONVERSATION_STAGES = new Set([
  "new_session", "welcomed", "discovering_needs", "recommending", "comparing",
  "customizing", "awaiting_confirmation", "cart_review", "checkout_ready",
  "payment_processing", "completed", "closing",
]);
const CLOSING_STATUSES = new Set([
  "open", "paused", "awaiting_checkout_decision", "checkout_ready",
  "order_completed", "pay_at_cashier_pending", "completed", "closed",
]);

function validConversationLayer(state: NoriConversationState) {
  return (state.conversationStage === undefined || CONVERSATION_STAGES.has(state.conversationStage))
    && (state.lastConversationActs === undefined
      || (Array.isArray(state.lastConversationActs)
        && state.lastConversationActs.length <= 12
        && state.lastConversationActs.every(act => typeof act === "string" && act.length <= 64)))
    && (state.lastAssistantTemplateId === undefined
      || state.lastAssistantTemplateId === null
      || (typeof state.lastAssistantTemplateId === "string" && state.lastAssistantTemplateId.length <= 100))
    && validCount(state.socialResponseRotationIndex)
    && validCount(state.misunderstandingCount)
    && validCount(state.consecutiveNoiseCount)
    && (state.temporaryRejectedProductIds === undefined
      || (Array.isArray(state.temporaryRejectedProductIds)
        && state.temporaryRejectedProductIds.length <= 24
        && state.temporaryRejectedProductIds.every(id => typeof id === "string" && id.length <= 100)))
    && (state.closingStatus === undefined || CLOSING_STATUSES.has(state.closingStatus))
    && (state.speechRate === undefined || ["slow", "normal", "fast"].includes(state.speechRate))
    && (state.lastTtsInterrupted === undefined || typeof state.lastTtsInterrupted === "boolean")
    && validLifecycleContext(state.orderLifecycle)
    && validAssistantSummary(state.lastAssistantResponseSummary)
    && validRepairContext(state.activeRepairContext);
}

const PAYMENT_STATUSES = new Set([
  "idle", "pending", "processing", "completed", "failed", "cancelled", "pay_at_cashier_pending",
]);
const PAYMENT_METHODS = new Set(["card", "cash", "pay_at_cashier", "qr"]);
const ORDER_STATUSES = new Set(["draft", "awaiting_payment", "paid", "accepted", "completed", "cancelled"]);

function validLifecycleContext(value: unknown) {
  if (value === undefined) return true;
  if (value === null || typeof value !== "object") return false;
  const lifecycle = value as Record<string, unknown>;
  return optionalEnum(lifecycle.paymentStatus, PAYMENT_STATUSES)
    && optionalEnum(lifecycle.paymentMethod, PAYMENT_METHODS)
    && optionalEnum(lifecycle.orderStatus, ORDER_STATUSES)
    && optionalText(lifecycle.orderId, 160)
    && optionalText(lifecycle.orderNumber, 80)
    && optionalText(lifecycle.paymentErrorCode, 80)
    && optionalText(lifecycle.paymentErrorMessage, 240)
    && optionalTimestamp(lifecycle.completedAt)
    && optionalTimestamp(lifecycle.updatedAt);
}

function optionalEnum(value: unknown, values: Set<string>) {
  return value === undefined || (typeof value === "string" && values.has(value));
}

function optionalText(value: unknown, maximum: number) {
  return value === undefined || (typeof value === "string" && value.length > 0 && value.length <= maximum);
}

function optionalTimestamp(value: unknown) {
  return value === undefined
    || (typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value)));
}

function validCount(value: unknown) {
  return value === undefined || (Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 10_000);
}

function validAssistantSummary(value: unknown) {
  if (value === undefined || value === null) return true;
  if (typeof value !== "object") return false;
  const summary = value as Record<string, unknown>;
  return typeof summary.purpose === "string"
    && Array.isArray(summary.productIds)
    && summary.productIds.length <= 3
    && summary.productIds.every(id => typeof id === "string")
    && (summary.requestedClarification === null
      || (typeof summary.requestedClarification === "string" && summary.requestedClarification.length <= 2_000))
    && Array.isArray(summary.proposedActions)
    && summary.proposedActions.length <= 16
    && Array.isArray(summary.documentedValues)
    && summary.documentedValues.length <= 3;
}

function validRepairContext(value: unknown) {
  if (value === undefined || value === null) return true;
  if (typeof value !== "object") return false;
  const context = value as Record<string, unknown>;
  return ["repeat", "simplify", "correction"].includes(String(context.type))
    && (context.originalIntent === null || typeof context.originalIntent === "string")
    && Array.isArray(context.productIds)
    && context.productIds.length <= 3
    && context.productIds.every(id => typeof id === "string")
    && typeof context.createdAt === "number"
    && Number.isFinite(context.createdAt);
}

function validPlannerSnapshot(value: unknown) {
  if (value === undefined || value === null) return true;
  if (typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  return typeof snapshot.planId === "string"
    && snapshot.planId.length <= 100
    && typeof snapshot.constraintFingerprint === "string"
    && snapshot.constraintFingerprint.length <= 4_000
    && typeof snapshot.goal === "string"
    && typeof snapshot.createdAt === "number"
    && Number.isFinite(snapshot.createdAt)
    && Array.isArray(snapshot.candidateProductIds)
    && snapshot.candidateProductIds.length <= 24
    && snapshot.candidateProductIds.every(item => typeof item === "string")
    && Array.isArray(snapshot.selectedProductIds)
    && snapshot.selectedProductIds.length <= 3
    && snapshot.selectedProductIds.every(item => typeof item === "string");
}

export async function noriChatController(
  request: Request<unknown, NoriChatResponse | NoriChatError, unknown>,
  response: Response<NoriChatResponse | NoriChatError>,
  next: NextFunction,
) {
  try {
    const rawBody = request.body;
    const rawCart = rawBody && typeof rawBody === "object" && "cart" in rawBody
      ? (rawBody as { cart?: unknown }).cart
      : undefined;
    const normalizedCart = normalizeNoriRequestCart(rawCart);
    const normalizedBody = rawBody && typeof rawBody === "object"
      ? {
        ...rawBody,
        cart: normalizedCart,
        language: normalizeSupportedLanguage(
          "language" in rawBody ? (rawBody as { language?: unknown }).language : undefined,
        ),
      }
      : rawBody;
    if (!isChatRequest(normalizedBody)) {
      response.status(400).json({ error: "Invalid Nori chat request." });
      return;
    }
    response.json(await noriAIService.chat(normalizedBody));
  } catch (error) {
    next(error);
  }
}
