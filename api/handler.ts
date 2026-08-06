import type { IncomingMessage, ServerResponse } from "node:http";
import { serverApp } from "../src/server/app";

type VercelRequest = IncomingMessage & { url?: string };

// Vercel sends every same-origin /api/* request to this one function. Restore
// the original path before handing the request to the existing Express app.
export default function handler(request: VercelRequest, response: ServerResponse) {
  const rewritten = new URL(request.url ?? "/api/handler", "https://morrow.local");
  const forwardedPath = rewritten.searchParams.get("path")?.replace(/^\/+/, "") ?? "";
  rewritten.searchParams.delete("path");
  const query = rewritten.searchParams.toString();
  request.url = `/api/${forwardedPath}${query ? `?${query}` : ""}`;
  return serverApp(request, response);
}
