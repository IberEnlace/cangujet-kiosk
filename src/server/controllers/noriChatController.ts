import type { NextFunction, Request, Response } from "express";
import { noriAIService } from "../services/noriAIService";
import type { NoriChatError, NoriChatRequest, NoriChatResponse } from "../types/noriChat";
import { normalizeNoriRequestCart } from "../services/noriCartNormalizer";
import { normalizeSupportedLanguage } from "../../shared/languages";

function isChatRequest(value: unknown): value is NoriChatRequest {
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
      && Array.isArray(request.conversationState.dietaryPreferences));
  return typeof request.message === "string"
    && request.message.trim().length > 0
    && request.message.length <= 2_000
    && validCart
    && Array.isArray(request.activeAllergens)
    && request.activeAllergens.length <= 32
    && request.activeAllergens.every(allergen => typeof allergen === "string")
    && typeof request.language === "string"
    && request.language.length <= 16
    && validConversationState;
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
