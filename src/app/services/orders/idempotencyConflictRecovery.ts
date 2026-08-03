import { OrderClientError } from "./OrderService";

export type IdempotencyRecoveryDisposition = "initial" | "reconciled" | "rotated";

export type IdempotencyRecoveryResult<T> = {
  value: T;
  key: string;
  disposition: IdempotencyRecoveryDisposition;
};

type IdempotencyRecoveryOptions<T> = {
  initialKey: string;
  execute: (key: string) => Promise<T>;
  createKey?: () => string;
  onKeyRotated?: (key: string) => void;
  reconcile?: (error: OrderClientError) => Promise<T | undefined>;
  repeatedConflictMessage: string;
};

/**
 * Reconciles an ambiguous completed operation first, then retries a genuine
 * stale-key conflict exactly once with a fresh key. Limiting the retry to one
 * prevents an accidental conflict loop or duplicate side effect.
 */
export async function executeWithIdempotencyRecovery<T>(
  options: IdempotencyRecoveryOptions<T>,
): Promise<IdempotencyRecoveryResult<T>> {
  try {
    return {
      value: await options.execute(options.initialKey),
      key: options.initialKey,
      disposition: "initial",
    };
  } catch (error) {
    if (!isIdempotencyConflict(error)) throw error;

    const reconciled = await options.reconcile?.(error);
    if (reconciled !== undefined) {
      return { value: reconciled, key: options.initialKey, disposition: "reconciled" };
    }

    const freshKey = options.createKey?.() ?? crypto.randomUUID();
    options.onKeyRotated?.(freshKey);
    try {
      return {
        value: await options.execute(freshKey),
        key: freshKey,
        disposition: "rotated",
      };
    } catch (retryError) {
      if (!isIdempotencyConflict(retryError)) throw retryError;
      throw new OrderClientError(
        "idempotency_conflict",
        options.repeatedConflictMessage,
        409,
        retryError.requestId || error.requestId,
        retryError.itemIndex,
        retryError.productId,
        {
          ...error.details,
          ...retryError.details,
          recoveryAttempted: true,
        },
        retryError.existingOrderId || error.existingOrderId,
      );
    }
  }
}

export function isIdempotencyConflict(error: unknown): error is OrderClientError {
  return error instanceof OrderClientError
    && error.status === 409
    && error.code === "idempotency_conflict";
}
