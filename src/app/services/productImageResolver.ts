import productImageById from "../data/productImages.generated.json";

type ImageProduct = { id: string; name?: string; category: string; image?: string | null };

export const DEFAULT_PRODUCT_IMAGE = "/images/products/burger.png";

const categoryFallbackImages: Record<string, string> = {
  burger: "/images/products/burger.png",
  pizza: "/images/products/pizza.png",
  pasta: "/images/products/pasta.png",
  healthy_bowl: "/images/products/salads.png",
  salad: "/images/products/salads.png",
  side: "/images/products/chicken.png",
  hot_drink: "/images/products/coffee.png",
  cold_drink: "/images/products/drink.png",
  dessert: "/images/products/desserts.png",
};

const genericCategoryImages = new Set(Object.values(categoryFallbackImages));
const stableProductImages: Readonly<Record<string, string>> = productImageById;

export function normalizeImagePath(value?: string | null): string {
  const image = value?.trim();
  if (!image || /^(?:undefined|null)$/i.test(image) || /^[a-z]:\\/i.test(image) || image.includes("\\")) return "";
  if (/^(?:https?:|data:|blob:)/i.test(image)) return image;
  const withoutPublic = image.replace(/^\.?\/?public\//i, "");
  return `/${withoutPublic.replace(/^\/+/, "")}`;
}

export function getProductIdImage(productId: string) {
  return normalizeImagePath(stableProductImages[productId]);
}

export function resolveProductImage(product: ImageProduct): string {
  const supplied = normalizeImagePath(product.image);
  if (supplied && !genericCategoryImages.has(supplied)) return supplied;
  return getProductIdImage(product.id)
    || supplied
    || categoryFallbackImages[product.category.toLowerCase()]
    || DEFAULT_PRODUCT_IMAGE;
}

export function applyProductImageFallback(image: HTMLImageElement, product: ImageProduct) {
  if (image.dataset.fallbackApplied === "true") return;
  image.dataset.fallbackApplied = "true";
  const categoryFallback = categoryFallbackImages[product.category.toLowerCase()] || DEFAULT_PRODUCT_IMAGE;
  image.src = image.src.endsWith(categoryFallback) ? DEFAULT_PRODUCT_IMAGE : categoryFallback;
}
