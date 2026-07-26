import { supabase } from "../../lib/supabase/client";

export type MenuCategory = {
  id: string; name: string; slug: string; description: string; image: string;
  icon: string; sortOrder: number; isActive: boolean; createdAt: string; updatedAt: string;
};
export type CategoryInput = Omit<MenuCategory, "id" | "createdAt" | "updatedAt"> & { id?: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "Category request failed.");
  }
  return response.status === 204 ? undefined as T : response.json();
}
export const getCategories = () => request<MenuCategory[]>("/api/categories");
export const createCategory = (data: CategoryInput) => request<MenuCategory>("/api/categories", { method: "POST", body: JSON.stringify(data) });
export const updateCategory = (id: string, data: CategoryInput) => request<MenuCategory>(`/api/categories/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteCategory = (id: string) => request<void>(`/api/categories/${encodeURIComponent(id)}`, { method: "DELETE" });
