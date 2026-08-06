import { staffApiRequest } from "./staffApiClient";

export type MenuProduct = {
  id: string; name: string; slug: string; description: string; price: number; image: string;
  categoryId: string; currency: string; isAvailable: boolean; isActive: boolean; sortOrder: number;
  calories: number; protein: number; allergens: string[]; createdAt: string; updatedAt: string;
};
export type ProductInput = Omit<MenuProduct, "id" | "slug" | "currency" | "isActive" | "createdAt" | "updatedAt"> & { id?: string; slug?: string };

export const getProducts = () => staffApiRequest<MenuProduct[]>("/api/products");
export const createProduct = (data: ProductInput) => staffApiRequest<MenuProduct>("/api/products", { method: "POST", body: data });
export const updateProduct = (id: string, data: ProductInput) => staffApiRequest<MenuProduct>(`/api/products/${encodeURIComponent(id)}`, { method: "PUT", body: data });
export const deleteProduct = (id: string) => staffApiRequest<void>(`/api/products/${encodeURIComponent(id)}`, { method: "DELETE" });
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
  return staffApiRequest<{ url: string }>("/api/menu-images", { method: "POST", body: { dataUrl } });
}
