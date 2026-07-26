import { supabase } from "../../lib/supabase/client";

export type MenuProduct = {
  id: string; name: string; slug: string; description: string; price: number; image: string;
  categoryId: string; currency: string; isAvailable: boolean; isActive: boolean; sortOrder: number;
  calories: number; protein: number; allergens: string[]; createdAt: string; updatedAt: string;
};
export type ProductInput = Omit<MenuProduct, "id" | "slug" | "currency" | "isActive" | "createdAt" | "updatedAt"> & { id?: string; slug?: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "Product request failed.");
  }
  return response.status === 204 ? undefined as T : response.json();
}
export const getProducts = () => request<MenuProduct[]>("/api/products");
export const createProduct = (data: ProductInput) => request<MenuProduct>("/api/products", { method: "POST", body: JSON.stringify(data) });
export const updateProduct = (id: string, data: ProductInput) => request<MenuProduct>(`/api/products/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) });
export const deleteProduct = (id: string) => request<void>(`/api/products/${encodeURIComponent(id)}`, { method: "DELETE" });
export async function uploadMenuImage(file: File) {
  if (!file.type.match(/^image\/(jpeg|png|webp|gif)$/) || file.size > 5 * 1024 * 1024) {
    throw new Error("Choose a JPG, PNG, WebP, or GIF image up to 5 MB.");
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Image could not be read."));
    reader.readAsDataURL(file);
  });
  return request<{ url: string }>("/api/menu-images", { method: "POST", body: JSON.stringify({ dataUrl }) });
}
