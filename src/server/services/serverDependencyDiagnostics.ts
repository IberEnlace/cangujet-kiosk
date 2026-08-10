const TRANSPORT_CODES = [
  "UND_ERR_CONNECT_TIMEOUT",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "EACCES",
] as const;

export type SafeDependencyError = {
  name?: string;
  code?: string;
  status?: number;
  causeCode?: string;
};

export function safeDependencyError(error: unknown): SafeDependencyError | null {
  if (!error || typeof error !== "object") return null;
  const value = error as {
    name?: unknown;
    code?: unknown;
    status?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
    cause?: unknown;
  };
  return {
    name: stringValue(value.name) ?? error.constructor?.name,
    code: stringValue(value.code),
    status: typeof value.status === "number" ? value.status : undefined,
    causeCode: transportCode(value),
  };
}

function transportCode(value: unknown, depth = 0): string | undefined {
  if (!value || typeof value !== "object" || depth > 4) return undefined;
  const candidate = value as Record<string, unknown>;
  const direct = stringValue(candidate.code);
  if (direct && TRANSPORT_CODES.includes(direct as typeof TRANSPORT_CODES[number])) return direct;
  for (const field of [candidate.message, candidate.details, candidate.hint]) {
    if (typeof field !== "string") continue;
    const match = TRANSPORT_CODES.find(code => field.includes(code));
    if (match) return match;
  }
  return transportCode(candidate.cause, depth + 1);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length ? value : undefined;
}
