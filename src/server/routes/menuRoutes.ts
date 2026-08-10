import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Router, type Request, type Response } from "express";
import type { Database } from "../../lib/supabase/database.types";
import { safeDependencyError } from "../services/serverDependencyDiagnostics";

type MenuClientFactory = (request: Request) => SupabaseClient<Database> | null;

function client(request: Request): SupabaseClient<Database> | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY)?.trim();
  if (!url || !key) return null;
  const authorization = request.header("authorization");
  return createClient<Database>(url, key, {
    global: authorization ? { headers: { Authorization: authorization } } : undefined,
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
function slug(value: string) {
  return value.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function validImage(value: unknown) {
  if (value == null || value === "") return true;
  return typeof value === "string" && !/^(blob:|data:|file:|[a-z]:[\\/])/i.test(value);
}
function fail(response: Response, status: number, message: string) {
  return response.status(status).json({ error: message });
}
function dependencyFailure(request: Request, response: Response, operation: string, error: unknown, message: string) {
  const requestId = requestIdFrom(request);
  const safe = safeDependencyError(error);
  response.setHeader("x-request-id", requestId);
  console.error("[cangujet menu API]", {
    event: "menu_dependency_failure",
    requestId,
    method: request.method,
    path: request.path,
    status: 503,
    dependency: "supabase_rest",
    operation,
    errorName: safe?.name ?? "UnknownError",
    errorCode: safe?.code ?? null,
    causeCode: safe?.causeCode ?? null,
    upstreamStatus: safe?.status ?? null,
  });
  return fail(response, 503, message);
}
function mapCategory(row: Database["public"]["Tables"]["categories"]["Row"]) {
  return { id: row.id, name: row.name, slug: row.slug, description: row.description ?? "", image: row.image_url ?? "", icon: row.icon, sortOrder: row.display_order, isActive: row.is_active, createdAt: row.created_at, updatedAt: row.updated_at };
}
function mapProduct(row: Database["public"]["Tables"]["products"]["Row"]) {
  return { id: row.id, name: row.name, slug: row.slug, description: row.description ?? "", price: Number(row.price), image: row.image_url ?? "", categoryId: row.category_id, currency: row.currency, isAvailable: row.is_available, isActive: row.is_active, sortOrder: row.display_order, calories: Number(row.calories ?? 0), protein: Number(row.protein ?? 0), allergens: row.allergens, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function createMenuRouter(clientFactory: MenuClientFactory = client) {
const router = Router();
router.get("/categories", async (request, response) => {
  const db = clientFactory(request); if (!db) return fail(response, 503, "Database is not configured.");
  const { data, error } = await db.from("categories").select("*").order("display_order").order("name");
  if (error) return dependencyFailure(request, response, "categories_read", error, "Categories could not be loaded.");
  return response.json((data ?? []).map(mapCategory));
});
router.post("/categories", async (request, response) => {
  const db = clientFactory(request); if (!db) return fail(response, 503, "Database is not configured.");
  const name = String(request.body?.name ?? "").trim(); const categorySlug = slug(String(request.body?.slug || name));
  if (!name || !categorySlug || !validImage(request.body?.image)) return fail(response, 422, "Valid category fields are required.");
  const { data, error } = await db.from("categories").insert({ name, slug: categorySlug, description: String(request.body?.description ?? ""), image_url: request.body?.image || null, icon: String(request.body?.icon ?? ""), display_order: Number(request.body?.sortOrder ?? 0), is_active: request.body?.isActive !== false }).select("*").single();
  if (error || !data) return fail(response, error?.code === "42501" ? 403 : 409, "Category could not be created.");
  return response.status(201).json(mapCategory(data));
});
router.put("/categories/:id", async (request, response) => {
  const db = clientFactory(request); if (!db) return fail(response, 503, "Database is not configured.");
  if (!validImage(request.body?.image)) return fail(response, 422, "Category image must be a persistent URL.");
  const name = String(request.body?.name ?? "").trim();
  const { data, error } = await db.from("categories").update({ name, slug: slug(String(request.body?.slug || name)), description: String(request.body?.description ?? ""), image_url: request.body?.image || null, icon: String(request.body?.icon ?? ""), display_order: Number(request.body?.sortOrder ?? 0), is_active: request.body?.isActive !== false }).eq("id", request.params.id).select("*").single();
  if (error || !data) return fail(response, error?.code === "42501" ? 403 : 409, "Category could not be updated.");
  return response.json(mapCategory(data));
});
router.delete("/categories/:id", async (request, response) => {
  const db = clientFactory(request); if (!db) return fail(response, 503, "Database is not configured.");
  const { error } = await db.from("categories").delete().eq("id", request.params.id);
  if (error) return fail(response, error.code === "23503" ? 409 : error.code === "42501" ? 403 : 500, error.code === "23503" ? "Delete or move products in this category first." : "Category could not be deleted.");
  return response.status(204).end();
});

router.get("/products", async (request, response) => {
  const db = clientFactory(request); if (!db) return fail(response, 503, "Database is not configured.");
  const { data, error } = await db.from("products").select("*").order("display_order").order("name");
  if (error) return dependencyFailure(request, response, "products_read", error, "Products could not be loaded.");
  return response.json((data ?? []).map(mapProduct));
});
router.post("/products", async (request, response) => {
  const db = clientFactory(request); if (!db) return fail(response, 503, "Database is not configured.");
  const name = String(request.body?.name ?? "").trim(); const productSlug = slug(String(request.body?.slug || name));
  if (!name || !productSlug || !request.body?.categoryId || !validImage(request.body?.image)) return fail(response, 422, "Valid product fields and categoryId are required.");
  const branch = await db.rpc("current_user_branch_id");
  const branchRow = branch.data ? await db.from("branches").select("currency").eq("id", branch.data).single() : null;
  const currency = branchRow?.data?.currency;
  if (!currency) return fail(response, 403, "Admin branch could not be resolved.");
  const category = await db.from("categories").select("id").eq("id", String(request.body.categoryId)).maybeSingle();
  if (category.error || !category.data) return fail(response, 422, "Selected category does not exist.");
  const id = String(request.body?.id || productSlug);
  const { data, error } = await db.from("products").insert({ id, name, slug: productSlug, description: String(request.body?.description ?? ""), price: Number(request.body?.price), currency, image_url: request.body?.image || null, category_id: category.data.id, is_available: request.body?.isAvailable !== false, is_active: true, display_order: Number(request.body?.sortOrder ?? 0), calories: Number(request.body?.calories ?? 0), protein: Number(request.body?.protein ?? 0), allergens: Array.isArray(request.body?.allergens) ? request.body.allergens : [] }).select("*").single();
  if (error || !data) return fail(response, error?.code === "42501" ? 403 : 409, "Product could not be created.");
  return response.status(201).json(mapProduct(data));
});
router.put("/products/:id", async (request, response) => {
  const db = clientFactory(request); if (!db) return fail(response, 503, "Database is not configured.");
  if (!request.body?.categoryId || !validImage(request.body?.image)) return fail(response, 422, "Valid product fields and categoryId are required.");
  const category = await db.from("categories").select("id").eq("id", String(request.body.categoryId)).maybeSingle();
  if (category.error || !category.data) return fail(response, 422, "Selected category does not exist.");
  const name = String(request.body?.name ?? "").trim();
  const { data, error } = await db.from("products").update({ name, slug: slug(String(request.body?.slug || name)), description: String(request.body?.description ?? ""), price: Number(request.body?.price), image_url: request.body?.image || null, category_id: category.data.id, is_available: request.body?.isAvailable !== false, display_order: Number(request.body?.sortOrder ?? 0), calories: Number(request.body?.calories ?? 0), protein: Number(request.body?.protein ?? 0), allergens: Array.isArray(request.body?.allergens) ? request.body.allergens : [] }).eq("id", request.params.id).select("*").single();
  if (error || !data) return fail(response, error?.code === "42501" ? 403 : 409, "Product could not be updated.");
  return response.json(mapProduct(data));
});
router.delete("/products/:id", async (request, response) => {
  const db = clientFactory(request); if (!db) return fail(response, 503, "Database is not configured.");
  const { error } = await db.from("products").delete().eq("id", request.params.id);
  if (error) return fail(response, error.code === "42501" ? 403 : 500, "Product could not be deleted.");
  return response.status(204).end();
});

router.post("/menu-images", async (request, response) => {
  const db = clientFactory(request); if (!db) return fail(response, 503, "Database is not configured.");
  const match = String(request.body?.dataUrl ?? "").match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return fail(response, 422, "A supported image is required.");
  const extension = match[1] === "image/jpeg" ? "jpg" : match[1].split("/")[1];
  const path = `${crypto.randomUUID()}.${extension}`;
  const { error } = await db.storage.from("menu-images").upload(path, Buffer.from(match[2], "base64"), { contentType: match[1], upsert: false });
  if (error) return fail(response, error.message.toLowerCase().includes("policy") ? 403 : 500, "Image could not be uploaded.");
  const { data } = db.storage.from("menu-images").getPublicUrl(path);
  return response.status(201).json({ url: data.publicUrl });
});
return router;
}

export const menuRouter = createMenuRouter();

function requestIdFrom(request: Request) {
  const candidate = request.header("x-request-id");
  return candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : crypto.randomUUID();
}
