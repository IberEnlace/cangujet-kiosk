function speakPrice(amount: string, locale: string): string {
  const value = Number.parseFloat(amount.replace(",", "."));
  if (!Number.isFinite(value)) return amount;
  const language = locale.toLowerCase();
  if (language.startsWith("tr")) return `${value.toLocaleString("tr-TR")} dolar`;
  const dollars = Math.floor(value);
  const cents = Math.round((value - dollars) * 100);
  return cents
    ? `${dollars} dollar${dollars === 1 ? "" : "s"} and ${cents} cent${cents === 1 ? "" : "s"}`
    : `${dollars} dollar${dollars === 1 ? "" : "s"}`;
}

/**
 * Turns display-oriented assistant copy into natural speech without changing
 * the text stored in conversation history.
 */
export function toSpeakableText(value: string, locale: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^\s*(?:action|tool|metadata|debug|request\s*id|response\s*id|product\s*id|cart\s*action|action\s*id)\s*[:=].*$/gim, " ")
    .replace(/^\s*[{}[\],]*\s*"[\w.-]+"\s*:\s*.*$/gm, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/<button\b[^>]*>[\s\S]*?<\/button>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\[\[[\s\S]*?]]/g, " ")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, " ")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, " ")
    .replace(/\b(?:pending-)?action-[a-z0-9-]+\b/gi, " ")
    .replace(/\b(?:add_to_cart|remove_from_cart|update_quantity|update_cart_customization|replace_cart_item|clear_cart|open_cart)\b/gi, " ")
    .replace(/\$([0-9]+(?:[.,][0-9]{1,2})?)/g, (_, amount: string) => speakPrice(amount, locale))
    .replace(/(?:USD|TRY|TL)\s*([0-9]+(?:[.,][0-9]{1,2})?)/gi, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|[-*+]>?|>\s?)\s*/gm, "")
    .replace(/[*_~|]/g, "")
    .replace(/[{}[\]\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function shouldSpeakNoriReply(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return ![
    "nori could not respond right now",
    "i couldn’t reach the nori service",
    "i couldn't reach the nori service",
  ].some(message => normalized.startsWith(message));
}
