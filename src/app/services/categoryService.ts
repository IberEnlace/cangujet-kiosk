import { staffApiRequest } from "./staffApiClient";

export type MenuCategory = {
  id: string; name: string; slug: string; description: string; image: string;
  icon: string; sortOrder: number; isActive: boolean; createdAt: string; updatedAt: string;
};
export type CategoryInput = Omit<MenuCategory, "id" | "createdAt" | "updatedAt"> & { id?: string };

export const getCategories = () => staffApiRequest<MenuCategory[]>("/api/categories");
export const createCategory = (data: CategoryInput) => staffApiRequest<MenuCategory>("/api/categories", { method: "POST", body: data });
export const updateCategory = (id: string, data: CategoryInput) => staffApiRequest<MenuCategory>(`/api/categories/${encodeURIComponent(id)}`, { method: "PUT", body: data });
export const deleteCategory = (id: string) => staffApiRequest<void>(`/api/categories/${encodeURIComponent(id)}`, { method: "DELETE" });
