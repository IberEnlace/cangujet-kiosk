export type RepositorySource = "supabase" | "local";
export type RepositoryErrorCode = "aborted" | "configuration" | "network" | "server" | "invalid_data" | "not_found" | "unauthenticated" | "forbidden" | "unauthorized" | "conflict" | "unknown";
export type RepositoryError = { code: RepositoryErrorCode; message: string; cause?: unknown };
export type RepositoryResult<T> = { ok: true; data: T; source: RepositorySource } | { ok: false; error: RepositoryError };

export function repositoryFailure(code: RepositoryErrorCode, message: string, cause?: unknown): RepositoryResult<never> {
  return { ok: false, error: { code, message, cause } };
}
