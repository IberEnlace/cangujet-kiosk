import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  ChevronUp,
  LayoutDashboard,
  Mail,
  Menu as MenuIcon,
  PackageOpen,
  MonitorSmartphone,
  Pencil,
  Plus,
  Settings as SettingsIcon,
  Tags,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import CangujetLogo from "../components/branding/CangujetLogo";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  isValidEmail,
  mockNotificationService,
} from "../../admin/services/emailService";
import type {
  AdminCategory,
  AdminProduct,
  NotificationSettings,
  OrderStatus,
  SystemStatus,
} from "../../admin/types/adminTypes";
import {
  applyProductImageFallback,
  resolveProductImage,
} from "../services/productImageResolver";
import { invalidateMenuCache } from "../services/supabase/menuService";
import AdminNotifications from "./AdminNotifications";
import AdminDevices from "./AdminDevices";
import {
  createCategory,
  deleteCategory,
  getCategories,
  updateCategory,
  type MenuCategory,
} from "../services/categoryService";
import {
  createProduct,
  deleteProduct,
  getProducts,
  uploadMenuImage,
  updateProduct,
  type MenuProduct,
} from "../services/productService";
import { Skeleton } from "../components/ui/skeleton";
import {
  formatDashboardCurrency,
  formatDashboardItemCount,
  formatDashboardOrderNumber,
  loadAdminDashboard,
  mapOrderStatus,
  subscribeToAdminDashboard,
  type AdminDashboardData,
} from "../services/supabase/adminDashboardService";

type AdminSection =
  | "dashboard"
  | "menu"
  | "categories"
  | "notifications"
  | "devices"
  | "settings";
type Props = { section: AdminSection; onNavigate: (route: string) => void };
const nav = [
  ["dashboard", "Dashboard", LayoutDashboard],
  ["menu", "Menu", UtensilsCrossed],
  ["categories", "Categories", Tags],
  ["notifications", "Notifications", Mail],
  ["devices", "Devices", MonitorSmartphone],
  ["settings", "Settings", SettingsIcon],
] as const;
const input =
  "admin-input w-full text-sm text-[#1F1F1F] outline-none";
const button =
  "admin-button rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C41E19]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-40";
const card = "admin-card rounded-2xl";
const money = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
});

function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end gap-4">
      <div>
        <h1 className="text-[1.65rem] font-black tracking-[-0.035em] text-[#1F1F1F]">{title}</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-[#6B7280]">{subtitle}</p>
      </div>
      <div className="ml-auto">{action}</div>
    </div>
  );
}
function StatusBadge({
  status,
}: {
  status: OrderStatus | SystemStatus | string;
}) {
  const normalizedStatus = status.toLowerCase();
  const good = [
    "completed",
    "ready",
    "online",
    "connected",
    "Connected",
    "Active",
    "enabled",
    "Enabled",
  ].map(value => value.toLowerCase()).includes(normalizedStatus);
  const warn = [
    "preparing",
    "coming_soon",
    "mock",
    "Coming Soon",
    "Mock Mode",
  ].map(value => value.toLowerCase()).includes(normalizedStatus);
  const danger = ["cancelled", "failed", "offline", "disabled", "unavailable"].includes(normalizedStatus);
  const incoming = ["incoming", "accepted", "cooking"].includes(normalizedStatus);
  return (
    <span
      className={`admin-status-dot ${normalizedStatus === "online" ? "admin-status-pulse" : ""} inline-flex min-h-6 items-center rounded-full border px-2.5 py-1 text-[10px] font-bold capitalize tracking-wide ${good ? "border-[#C41E19]/20 bg-[#C41E19]/5 text-[#C41E19]" : warn ? "border-[#C41E19]/20 bg-[#C41E19]/5 text-[#C41E19]" : danger ? "border-[#C41E19]/20 bg-[#C41E19]/5 text-[#C41E19]" : incoming ? "border-[#C41E19]/15 bg-[#C41E19]/[.06] text-[#C41E19]" : "border-[#ECECEC] bg-[#F8F9FA] text-[#6B7280]"}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="admin-dialog max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl p-6">
        <div className="mb-5 flex items-center">
          <h2 className="text-lg font-bold tracking-[-.02em] text-[#1F1F1F]">{title}</h2>
          <button
            aria-label="Close"
            onClick={onClose}
            className="ml-auto rounded-lg p-2 text-[#9CA3AF] hover:bg-[#F8F9FA] hover:text-[#1F1F1F]"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 text-sm text-[#1F1F1F]">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`h-6 w-11 rounded-full border p-1 transition-[background-color,border-color,box-shadow] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C41E19]/50 ${checked ? "border-[#C41E19]/45 bg-[#C41E19]" : "border-[#ECECEC] bg-[#F8F9FA]"}`}
      >
        <span
          className={`block size-4 rounded-full bg-white shadow-sm transition-transform duration-150 ease-out ${checked ? "translate-x-5" : ""}`}
        />
      </button>
    </label>
  );
}

function DashboardPage() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => undefined;
    const refresh = async () => {
      const result = await loadAdminDashboard();
      if (!active) return;
      if (result.ok) {
        setData(result.data);
        setError(null);
        unsubscribe();
        unsubscribe = subscribeToAdminDashboard(result.data.branchId, refresh, refresh, refresh);
      } else setError(result.error.message);
      setLoading(false);
    };
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    void refresh();
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);
  const stats = data ? [
    ["Today's Sales", formatDashboardCurrency(data.currency, data.todaySales), "Total order value today"],
    ["Today's Orders", String(data.todayOrders), "Completed and active orders"],
    ["Kiosk Name", "cangujet kiosk 01", "Active device name"],
    ["Kiosk Number", "KSK - 001", "Device identifier"],
  ] : [];
  const statuses = data ? [
    ["Kiosk App", data.kioskStatus],
    ["Internet", online ? "Connected" : "Offline"],
    ["Kitchen Display", data.kitchenStatus],
    ["Device Configuration", data.deviceConfigurationStatus],
    ["Payment Terminal", data.paymentTerminalStatus],
    ["Notifications", data.notificationsStatus],
  ] : [];
  return (
    <>
      <PageHeader title="Dashboard" subtitle="Restaurant Overview" />
      {error && <div role="alert" className="mb-4 rounded-xl border border-[#C41E19]/20 bg-[#C41E19]/10 px-4 py-3 text-sm text-[#C41E19]">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? Array.from({ length: 4 }, (_, index) => (
          <div key={index} className={`${card} p-5`}>
            <Skeleton className="h-3 w-24 bg-[#ECECEC]" /><Skeleton className="mt-4 h-8 w-32 bg-[#ECECEC]" /><Skeleton className="mt-2 h-3 w-28 bg-[#ECECEC]" />
          </div>
        )) : stats.map(([title, value, sub]) => (
          <div key={title} className={`${card} p-5`}>
            <p className="text-xs font-bold uppercase tracking-wider text-[#9CA3AF]">{title}</p>
            <p className="mt-4 text-[1.75rem] font-black tracking-[-.035em] text-[#C41E19]">{value}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-[#9CA3AF]">{sub}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <section className={`${card} overflow-hidden`}>
          <h2 className="p-5 text-sm font-bold text-[#1F1F1F]">Recent Orders</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-y border-[#ECECEC] text-xs uppercase text-[#9CA3AF]"><tr>
                {["Order ID", "Time", "Items", "Total", "Status"].map(h => <th key={h} className="px-5 py-3">{h}</th>)}
              </tr></thead>
              <tbody>
                {loading ? Array.from({ length: 5 }, (_, index) => (
                  <tr key={index} className="border-b border-[#ECECEC]"><td colSpan={5} className="px-5 py-3"><Skeleton className="h-5 w-full bg-[#F8F9FA]" /></td></tr>
                )) : !data?.recentOrders.length ? (
                  <tr><td colSpan={5} className="px-5 py-10 text-center text-[#9CA3AF]">No orders yet today.</td></tr>
                ) : data.recentOrders.map(order => (
                  <tr key={order.id} className="border-b border-[#ECECEC]">
                    <td className="px-5 py-3 font-mono text-[#6B7280]">{formatDashboardOrderNumber(order.orderNumber)}</td>
                    <td className="px-5 py-3 text-[#1F1F1F]">{new Intl.DateTimeFormat(undefined, { timeZone: data.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(order.createdAt))}</td>
                    <td className="px-5 py-3 text-[#1F1F1F]">{formatDashboardItemCount(order.itemCount)}</td>
                    <td className="px-5 py-3 font-bold text-[#1F1F1F]">{formatDashboardCurrency(data.currency, order.total)}</td>
                    <td className="px-5 py-3"><StatusBadge status={mapOrderStatus(order.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className={`${card} p-5`}>
          <h2 className="mb-3 text-sm font-bold text-[#1F1F1F]">System Status</h2>
          {loading ? Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex items-center justify-between border-b border-[#ECECEC] py-3"><Skeleton className="h-4 w-28 bg-[#F8F9FA]" /><Skeleton className="h-6 w-20 rounded-full bg-[#F8F9FA]" /></div>
          )) : statuses.map(([label, status]) => (
            <div key={label} className="flex items-center justify-between border-b border-[#ECECEC] py-3 last:border-0">
              <span className="text-sm text-[#6B7280]">{label}</span><StatusBadge status={status} />
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

function AdminSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="admin-input mt-1 h-10 rounded-xl text-[#1F1F1F]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="z-[10001] rounded-xl border-[#ECECEC] bg-white text-[#1F1F1F] shadow-xl">
        {options.map((option) => (
          <SelectItem
            key={option}
            value={option}
            className="rounded-lg text-[#1F1F1F] focus:bg-[#C41E19]/10 focus:text-[#C41E19] data-[state=checked]:text-[#C41E19]"
          >
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const blankProduct: AdminProduct = {
  id: "",
  name: "",
  description: "",
  category: "",
  price: 0,
  image: "",
  available: true,
  calories: 0,
  protein: 0,
  allergens: [],
};
function ProductThumbnail({ product }: { product: AdminProduct }) {
  return (
    <img
      src={resolveProductImage(product)}
      alt={product.name}
      className="size-10 rounded-lg object-cover"
      onError={(event) =>
        applyProductImageFallback(event.currentTarget, product)
      }
    />
  );
}
function ProductForm({
  value,
  categories,
  onSave,
  onClose,
}: {
  value: AdminProduct;
  categories: MenuCategory[];
  onSave: (v: AdminProduct) => void;
  onClose: () => void;
}) {
  const [p, setP] = useState(value);
  const [uploadingImage, setUploadingImage] = useState(false);
  const selectImage = async (file?: File) => {
    if (!file) return;
    setUploadingImage(true);
    try {
      const uploaded = await uploadMenuImage(file);
      setP(current => ({ ...current, image: uploaded.url }));
      toast.success("Image uploaded.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Image upload failed.");
    } finally {
      setUploadingImage(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const selectedCategory = categories.find(category => category.id === p.categoryId);
    if (!p.name.trim() || !selectedCategory || p.price < 0) {
      toast.error("Name, category, and a valid price are required.");
      return;
    }
    onSave({ ...p, category: selectedCategory.name });
  };
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <label className="sm:col-span-2 text-xs text-[#6B7280]">
        Product name
        <input
          className={`${input} mt-1`}
          value={p.name}
          onChange={(e) => setP({ ...p, name: e.target.value })}
        />
      </label>
      <label className="sm:col-span-2 text-xs text-[#6B7280]">
        Description
        <textarea
          className={`${input} mt-1`}
          value={p.description}
          onChange={(e) => setP({ ...p, description: e.target.value })}
        />
      </label>
      <div className="text-xs text-[#6B7280]">
        Category
        <Select value={p.categoryId ?? ""} onValueChange={categoryId => setP({ ...p, categoryId })}>
          <SelectTrigger className="admin-input mt-1 h-10 rounded-xl text-[#1F1F1F]">
            <SelectValue placeholder="Select a category" />
          </SelectTrigger>
          <SelectContent className="z-[10001] rounded-xl border-[#ECECEC] bg-white text-[#1F1F1F]">
            {categories.filter(category => category.isActive).map(category => (
              <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <label className="text-xs text-[#6B7280]">
        Price
        <input
          type="number"
          min="0"
          step=".01"
          className={`${input} mt-1`}
          value={p.price}
          onChange={(e) => setP({ ...p, price: Number(e.target.value) })}
        />
      </label>
      <label className="sm:col-span-2 text-xs text-[#6B7280]">
        Product image
        <div className="mt-1 flex items-center gap-4 rounded-xl border border-dashed border-[#ECECEC] bg-[#F8F9FA] p-4">
          {p.image ? (
            <img
              src={p.image}
              alt="Selected product preview"
              className="size-20 rounded-xl object-cover"
            />
          ) : (
            <div className="grid size-20 place-items-center rounded-xl bg-[#F8F9FA] text-[10px] text-[#9CA3AF]">
              No image
            </div>
          )}
          <div>
            <input
              id="product-image-upload"
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => { void selectImage(e.target.files?.[0]); }}
            />
            <label
              htmlFor="product-image-upload"
              className={`${button} inline-flex cursor-pointer border border-[#ECECEC] bg-[#F8F9FA] text-[#1F1F1F] hover:bg-[#F8F9FA]`}
            >
              {uploadingImage ? "Uploading..." : "Choose Image"}
            </label>
            <p className="mt-2 text-[10px] text-[#9CA3AF]">
              Preview only — not uploaded.
            </p>
          </div>
        </div>
      </label>
      <label className="text-xs text-[#6B7280]">
        Calories
        <input
          type="number"
          min="0"
          className={`${input} mt-1`}
          value={p.calories}
          onChange={(e) => setP({ ...p, calories: Number(e.target.value) })}
        />
      </label>
      <label className="text-xs text-[#6B7280]">
        Protein (g)
        <input
          type="number"
          min="0"
          className={`${input} mt-1`}
          value={p.protein}
          onChange={(e) => setP({ ...p, protein: Number(e.target.value) })}
        />
      </label>
      <label className="sm:col-span-2 text-xs text-[#6B7280]">
        Allergens (comma separated)
        <input
          className={`${input} mt-1`}
          value={p.allergens.join(", ")}
          onChange={(e) =>
            setP({
              ...p,
              allergens: e.target.value
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
            })
          }
        />
      </label>
      <div className="sm:col-span-2">
        <Toggle
          label="Available"
          checked={p.available}
          onChange={(available) => setP({ ...p, available })}
        />
      </div>
      <div className="sm:col-span-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className={`${button} bg-[#F8F9FA] text-[#1F1F1F] border border-[#ECECEC]`}
        >
          Cancel
        </button>
        <button disabled={uploadingImage} className={`${button} bg-[#C41E19] text-white`}>
          Save Product
        </button>
      </div>
    </form>
  );
}
function MenuPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<AdminProduct | undefined>(undefined);
  const [deleting, setDeleting] = useState<AdminProduct | null>(null);
  const refresh = async () => {
    const [productRows, categoryRows] = await Promise.all([getProducts(), getCategories()]);
    const categoryNames = new Map(categoryRows.map(category => [category.id, category.name]));
    setCategories(categoryRows);
    setProducts(productRows.map(product => ({
      id: product.id, name: product.name, description: product.description,
      categoryId: product.categoryId, category: categoryNames.get(product.categoryId) ?? "Unknown",
      price: product.price, image: product.image, available: product.isAvailable,
      calories: product.calories, protein: product.protein, allergens: product.allergens,
    })));
  };
  useEffect(() => {
    let active = true;
    void refresh().catch(cause => {
      if (active) toast.error(cause instanceof Error ? cause.message : "Menu could not be loaded.");
    }).finally(() => { if (active) setLoadingMenu(false); });
    return () => { active = false; };
  }, []);
  const save = async (p: AdminProduct) => {
    if (!p.categoryId) return toast.error("Select a valid category.");
    setSaving(true);
    try {
      const payload = { name: p.name, description: p.description, price: p.price, image: p.image, categoryId: p.categoryId, isAvailable: p.available, sortOrder: 0, calories: p.calories, protein: p.protein, allergens: p.allergens };
      if (p.id) await updateProduct(p.id, payload);
      else await createProduct(payload);
      invalidateMenuCache();
      await refresh();
      setEditing(undefined);
      toast.success("Product saved.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Product could not be saved.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <PageHeader
        title="Menu"
        subtitle="Manage kiosk products"
        action={
          <button
            onClick={() => setEditing({ ...blankProduct, categoryId: categories.find(category => category.isActive)?.id })}
            disabled={loadingMenu || categories.length === 0}
            className={`${button} flex items-center gap-2 bg-[#C41E19] text-white`}
          >
            <Plus size={16} />
            Add Product
          </button>
        }
      />
      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-[#ECECEC] text-xs uppercase text-[#9CA3AF]">
              <tr>
                {[
                  "Product",
                  "Category",
                  "Price",
                  "Availability",
                  "Actions",
                ].map((h) => (
                  <th key={h} className="px-5 py-3 text-[#9CA3AF]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
            {loadingMenu ? (
              Array.from({ length: 5 }, (_, index) => (
                <tr key={index} className="border-b border-[#ECECEC]">
                  <td colSpan={5} className="px-5 py-4">
                    <Skeleton className="h-10 w-full rounded-lg bg-[#F8F9FA]" />
                  </td>
                </tr>
              ))
            ) : products.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center">
                    <div className="mx-auto max-w-xs rounded-2xl border border-dashed border-[#ECECEC] bg-[#F8F9FA] px-6 py-7">
                      <PackageOpen className="mx-auto mb-3 text-[#9CA3AF]" size={22} />
                      <p className="text-sm font-semibold text-[#6B7280]">No products yet</p>
                      <p className="mt-1 text-xs text-[#9CA3AF]">Add your first product to populate the menu.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id} className="border-b border-[#ECECEC]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <ProductThumbnail product={p} />
                        <span className="font-medium text-[#1F1F1F]">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 capitalize text-[#6B7280]">
                      {p.category.replace(/_/g, " ")}
                    </td>
                    <td className="px-5 py-3 font-bold text-[#C41E19]">
                      {money.format(p.price)}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => { void save({ ...p, available: !p.available }); }}
                      >
                        <StatusBadge
                          status={p.available ? "Active" : "Unavailable"}
                        />
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        <button
                          aria-label={`Edit ${p.name}`}
                          onClick={() => setEditing(p)}
                          className="rounded-lg p-2 text-[#6B7280] hover:bg-[#F8F9FA] hover:text-[#1F1F1F]"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          aria-label={`Delete ${p.name}`}
                          onClick={() => setDeleting(p)}
                          className="rounded-lg p-2 text-[#C41E19] hover:bg-[#C41E19]/5 hover:text-[#C41E19]"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {editing !== undefined && (
        <Modal
          title={editing.id ? "Edit Product" : "Add Product"}
          onClose={() => setEditing(undefined)}
        >
          <ProductForm
            value={editing}
            categories={categories}
            onSave={save}
            onClose={() => setEditing(undefined)}
          />
        </Modal>
      )}
      {deleting && (
        <Modal title="Delete Product?" onClose={() => setDeleting(null)}>
          <p className="text-sm text-[#6B7280]">This action cannot be undone.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setDeleting(null)}
              className={`${button} bg-[#F8F9FA] text-[#1F1F1F] border border-[#ECECEC]`}
            >
              Cancel
            </button>
            <button
              disabled={saving}
              onClick={() => { void (async () => {
                setSaving(true);
                try {
                  await deleteProduct(deleting.id); invalidateMenuCache(); await refresh();
                  setDeleting(null); toast.success("Product deleted.");
                } catch (cause) {
                  toast.error(cause instanceof Error ? cause.message : "Product could not be deleted.");
                } finally { setSaving(false); }
              })(); }}
              className={`${button} border border-[#C41E19]/20 bg-white text-[#C41E19] hover:border-[#C41E19]/30 hover:bg-[#C41E19]/5 hover:text-[#C41E19]`}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function CategoriesPage() {
  const [items, setItems] = useState<AdminCategory[]>([]);
  const [products, setCategoryProducts] = useState<MenuProduct[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [savingCategory, setSavingCategory] = useState(false);
  const [edit, setEdit] = useState<AdminCategory | undefined>(undefined);
  const [del, setDel] = useState<AdminCategory | null>(null);
  const refresh = async () => {
    const [categoryRows, productRows] = await Promise.all([getCategories(), getProducts()]);
    setItems(categoryRows.map(category => ({ id: category.id, name: category.name, description: category.description, image: category.image, icon: category.icon, displayOrder: category.sortOrder, active: category.isActive })));
    setCategoryProducts(productRows);
  };
  useEffect(() => {
    let active = true;
    void refresh().catch(cause => { if (active) toast.error(cause instanceof Error ? cause.message : "Categories could not be loaded."); })
      .finally(() => { if (active) setLoadingCategories(false); });
    return () => { active = false; };
  }, []);
  const counts = useMemo(
    () => Object.fromEntries(items.map(category => [category.id, products.filter(product => product.categoryId === category.id).length])),
    [items, products],
  );
  const categoryPayload = (category: AdminCategory, order = category.displayOrder) => ({
    name: category.name, slug: category.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    description: category.description, image: category.image ?? "", icon: category.icon,
    sortOrder: order, isActive: category.active,
  });
  const move = async (i: number, d: number) => {
    const n = [...items],
      j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]];
    setSavingCategory(true);
    try {
      await Promise.all(n.map((category, index) => updateCategory(category.id, categoryPayload(category, index + 1))));
      await refresh();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Category order could not be saved."); }
    finally { setSavingCategory(false); }
  };
  return (
    <>
      <PageHeader
        title="Categories"
        subtitle="Manage menu categories"
        action={
          <button
            onClick={() =>
              setEdit({
                id: "",
                name: "",
                description: "",
                icon: "",
                displayOrder: items.length + 1,
                active: true,
              })
            }
            className={`${button} flex items-center gap-2 bg-[#C41E19] text-white`}
          >
            <Plus size={16} />
            Add Category
          </button>
        }
      />
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[#ECECEC] text-xs uppercase text-[#9CA3AF]">
            <tr>
              {["Name", "Products", "Order", "Status", "Actions"].map((h) => (
                <th className="px-5 py-3" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loadingCategories ? Array.from({ length: 5 }, (_, index) => (
              <tr key={index} className="border-b border-[#ECECEC]"><td colSpan={5} className="px-5 py-4"><Skeleton className="h-10 w-full rounded-lg bg-[#F8F9FA]" /></td></tr>
            )) : items.length === 0 ? (
              <tr><td colSpan={5} className="p-12 text-center"><div className="mx-auto max-w-xs rounded-2xl border border-dashed border-[#ECECEC] bg-[#F8F9FA] px-6 py-7"><Tags className="mx-auto mb-3 text-[#9CA3AF]" size={22} /><p className="text-sm font-semibold text-[#1F1F1F]">No categories yet</p><p className="mt-1 text-xs text-[#9CA3AF]">Create a category to organize your menu.</p></div></td></tr>
            ) : items.map((c, i) => (
              <tr key={c.id} className="border-b border-[#ECECEC]">
                <td className="px-5 py-4 font-medium">{c.name}</td>
                <td className="px-5 py-4 text-[#6B7280]">
                  {counts[c.id] ?? counts[c.name.toLowerCase()] ?? 0}
                </td>
                <td className="px-5 py-4">{c.displayOrder}</td>
                <td className="px-5 py-4">
                  <button
                    disabled={savingCategory}
                    onClick={() => { void (async () => {
                      setSavingCategory(true);
                      try { await updateCategory(c.id, categoryPayload({ ...c, active: !c.active })); invalidateMenuCache(); await refresh(); }
                      catch (cause) { toast.error(cause instanceof Error ? cause.message : "Category could not be updated."); }
                      finally { setSavingCategory(false); }
                    })(); }}
                  >
                    <StatusBadge status={c.active ? "Active" : "Disabled"} />
                  </button>
                </td>
                <td className="px-5 py-4">
                  <div className="flex gap-1">
                    <button
                      disabled={i === 0}
                      aria-label="Move up"
                      onClick={() => { void move(i, -1); }}
                      className="rounded-lg p-2 text-[#6B7280] transition hover:bg-[#F8F9FA] hover:text-[#1F1F1F] disabled:opacity-20"
                    >
                      <ChevronUp size={15} />
                    </button>
                    <button
                      disabled={i === items.length - 1}
                      aria-label="Move down"
                      onClick={() => { void move(i, 1); }}
                      className="rounded-lg p-2 text-[#6B7280] transition hover:bg-[#F8F9FA] hover:text-[#1F1F1F] disabled:opacity-20"
                    >
                      <ChevronDown size={15} />
                    </button>
                    <button
                      aria-label="Edit category"
                      onClick={() => setEdit(c)}
                      className="rounded-lg p-2 text-[#6B7280] transition hover:bg-[#C41E19]/5 hover:text-[#C41E19]"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      aria-label="Delete category"
                      onClick={() => setDel(c)}
                      className="rounded-lg p-2 text-[#C41E19] transition hover:bg-[#C41E19]/5 hover:text-[#C41E19]"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit !== undefined && (
        <Modal
          title={edit.id ? "Edit Category" : "Add Category"}
          onClose={() => setEdit(undefined)}
        >
          <CategoryForm
            value={edit}
            onClose={() => setEdit(undefined)}
            onSave={(v) => { void (async () => {
              setSavingCategory(true);
              try {
                if (v.id) await updateCategory(v.id, categoryPayload(v));
                else await createCategory(categoryPayload(v));
                invalidateMenuCache(); await refresh(); setEdit(undefined); toast.success("Category saved.");
              } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Category could not be saved."); }
              finally { setSavingCategory(false); }
            })(); }}
          />
        </Modal>
      )}
      {del && (
        <Modal title="Delete Category?" onClose={() => setDel(null)}>
          <p className="text-sm text-[#6B7280]">This action cannot be undone.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setDel(null)}
              className={`${button} border border-[#ECECEC] bg-white text-[#1F1F1F] hover:bg-[#F8F9FA]`}
            >
              Cancel
            </button>
            <button
              disabled={savingCategory}
              onClick={() => { void (async () => {
                setSavingCategory(true);
                try { await deleteCategory(del.id); invalidateMenuCache(); await refresh(); setDel(null); toast.success("Category deleted."); }
                catch (cause) { toast.error(cause instanceof Error ? cause.message : "Category could not be deleted."); }
                finally { setSavingCategory(false); }
              })(); }}
              className={`${button} border border-[#C41E19]/20 bg-white text-[#C41E19] hover:border-[#C41E19]/30 hover:bg-[#C41E19]/5 hover:text-[#C41E19]`}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function CategoryForm({
  value,
  onSave,
  onClose,
}: {
  value: AdminCategory;
  onSave: (v: AdminCategory) => void;
  onClose: () => void;
}) {
  const icons = [
    ["🍕", "Pizza"],
    ["🍔", "Burger"],
    ["🥤", "Drink"],
    ["🍰", "Dessert"],
    ["🍟", "Fries"],
    ["🥗", "Salad"],
    ["☕", "Coffee"],
  ];
  const known = icons.some(([icon]) => icon === value.icon);
  const [v, setV] = useState(value);
  const [other, setOther] = useState(Boolean(value.icon && !known));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.name.trim()) return toast.error("Category name is required.");
        if (!v.icon.trim())
          return toast.error("Choose or enter a category icon.");
        onSave(v);
      }}
      className="space-y-4"
    >
      <label className="block text-xs text-[#6B7280]">
        Category name
        <input
          className={`${input} mt-1`}
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
        />
      </label>
      <label className="block text-xs text-[#6B7280]">
        Description
        <textarea
          className={`${input} mt-1`}
          value={v.description}
          onChange={(e) => setV({ ...v, description: e.target.value })}
        />
      </label>
      <fieldset>
        <legend className="text-xs text-[#6B7280]">Category icon</legend>
        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {icons.map(([icon, label]) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              aria-pressed={!other && v.icon === icon}
              title={label}
              onClick={() => {
                setOther(false);
                setV({ ...v, icon });
              }}
              className={`rounded-xl border p-3 text-xl transition focus:outline-none focus:ring-2 focus:ring-[#C41E19]/35 ${!other && v.icon === icon ? "border-[#C41E19] bg-[#C41E19]/5" : "border-[#ECECEC] bg-white hover:border-[#ECECEC] hover:bg-[#F8F9FA]"}`}
            >
              {icon}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={other}
            onClick={() => {
              setOther(true);
              if (known) setV({ ...v, icon: "" });
            }}
            className={`rounded-xl border px-2 text-xs transition ${other ? "border-[#C41E19] bg-[#C41E19]/5 text-[#C41E19]" : "border-[#ECECEC] bg-white text-[#6B7280]"}`}
          >
            Other…
          </button>
        </div>
        {other && (
          <input
            aria-label="Custom category icon"
            placeholder="Enter an emoji or icon"
            maxLength={8}
            className={`${input} mt-2`}
            value={v.icon}
            onChange={(e) => setV({ ...v, icon: e.target.value })}
          />
        )}
      </fieldset>
      <label className="block text-xs text-[#6B7280]">
        Display order
        <input
          type="number"
          min="1"
          className={`${input} mt-1`}
          value={v.displayOrder}
          onChange={(e) => setV({ ...v, displayOrder: Number(e.target.value) })}
        />
      </label>
      <Toggle
        label="Active"
        checked={v.active}
        onChange={(active) => setV({ ...v, active })}
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className={`${button} border border-[#ECECEC] bg-white text-[#1F1F1F] hover:bg-[#F8F9FA]`}
        >
          Cancel
        </button>
        <button className={`${button} bg-[#C41E19] text-white hover:bg-[#A8161A]`}>
          Save Category
        </button>
      </div>
    </form>
  );
}

function NotificationsPage() {
  const [v, setV] = useState<NotificationSettings>({
    restaurantEmail: "admin@cangujet.example",
    secondaryEmail: "",
    dailySalesReport: true,
    weeklySalesSummary: false,
    orderFailureAlerts: true,
    paymentFailureAlerts: true,
    kioskOfflineAlerts: true,
    kitchenDisplayOfflineAlerts: true,
    deviceSyncFailureAlerts: true,
    dailyReportTime: "22:00",
  });
  const [testOpen, setTestOpen] = useState(false);
  const [recipient, setRecipient] = useState(v.restaurantEmail);
  const [notificationType, setNotificationType] =
    useState("Daily Sales Report");
  const [loading, setLoading] = useState(false);
  const valid = () => {
    if (!isValidEmail(v.restaurantEmail)) {
      toast.error("Enter a valid restaurant email.");
      return false;
    }
    if (v.secondaryEmail && !isValidEmail(v.secondaryEmail)) {
      toast.error("Enter a valid secondary email.");
      return false;
    }
    return true;
  };
  const save = () => {
    if (valid()) toast.success("Notification settings saved.");
  };
  const sendTest = async () => {
    setLoading(true);
    try {
      await mockNotificationService.sendTestNotification(
        recipient,
        notificationType,
      );
      setTestOpen(false);
      toast.success("Test notification simulated successfully.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  const preferences: [keyof NotificationSettings, string][] = [
    ["dailySalesReport", "Daily Sales Report"],
    ["weeklySalesSummary", "Weekly Sales Summary"],
    ["orderFailureAlerts", "Order Failure Alerts"],
    ["paymentFailureAlerts", "Payment Failure Alerts"],
    ["kioskOfflineAlerts", "Kiosk Offline Alerts"],
    ["kitchenDisplayOfflineAlerts", "Kitchen Display Offline Alerts"],
    ["deviceSyncFailureAlerts", "Device Sync Failure Alerts"],
  ];
  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Manage restaurant reports and system alerts"
      />
      <div className="grid max-w-5xl gap-5 lg:grid-cols-2">
        <SettingsSection title="Notification Email">
          <div className="grid gap-4">
            <Field
              label="Restaurant Email"
              type="email"
              value={v.restaurantEmail}
              onChange={(restaurantEmail) => setV({ ...v, restaurantEmail })}
            />
            <Field
              label="Secondary Email (optional)"
              type="email"
              value={v.secondaryEmail}
              onChange={(secondaryEmail) => setV({ ...v, secondaryEmail })}
            />
            <label className="text-xs text-[#6B7280]">
              Daily Report Time
              <input
                type="time"
                className={`${input} mt-1`}
                value={v.dailyReportTime}
                onChange={(e) =>
                  setV({ ...v, dailyReportTime: e.target.value })
                }
              />
              <span className="mt-1 block text-[11px] text-[#9CA3AF]">
                The daily report will be sent at this time using the restaurant
                timezone.
              </span>
            </label>
          </div>
        </SettingsSection>
        <SettingsSection title="Notification Preferences">
          <div className="space-y-4">
            {preferences.map(([key, label]) => (
              <Toggle
                key={key}
                label={label}
                checked={Boolean(v[key])}
                onChange={(checked) => setV({ ...v, [key]: checked })}
              />
            ))}
          </div>
        </SettingsSection>
        <div className="flex flex-wrap gap-2 lg:col-span-2">
          <button
            onClick={save}
            className={`${button} bg-[#C41E19] text-white hover:bg-[#A8161A]`}
          >
            Save Notification Settings
          </button>
          <button
            onClick={() => {
              setRecipient(v.restaurantEmail);
              setTestOpen(true);
            }}
            className={`${button} border border-[#ECECEC] bg-white text-[#1F1F1F] hover:bg-[#F8F9FA]`}
          >
            Send Test Notification
          </button>
        </div>
        <p className="text-[11px] text-[#9CA3AF] lg:col-span-2">
          Demo mode: actions are simulated in this prototype.
        </p>
      </div>
      {testOpen && (
        <Modal
          title="Send Test Notification"
          onClose={() => setTestOpen(false)}
        >
          <div className="space-y-4">
            <Field
              label="Recipient Email"
              type="email"
              value={recipient}
              onChange={setRecipient}
            />
            <label className="block text-xs text-[#6B7280]">
              Notification Type
              <AdminSelect
                value={notificationType}
                onChange={setNotificationType}
                options={[
                  "Daily Sales Report",
                  "System Alert",
                  "Kiosk Offline Alert",
                ]}
              />
            </label>
          </div>
          <p className="mt-3 text-[11px] text-[#9CA3AF]">
            Demo mode: this notification will only be simulated.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setTestOpen(false)}
              className={`${button} border border-[#ECECEC] bg-white text-[#1F1F1F] hover:bg-[#F8F9FA]`}
            >
              Cancel
            </button>
            <button
              disabled={loading}
              onClick={sendTest}
              className={`${button} bg-[#C41E19] text-white hover:bg-[#A8161A]`}
            >
              {loading ? "Sending…" : "Send Test"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
void NotificationsPage;
function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="text-xs text-[#6B7280]">
      {label}
      <input
        type={type}
        className={`${input} mt-1`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function SettingsPage() {
  const [restaurant, setRestaurant] = useState({
    name: "cangujet Restaurant",
    currency: "EUR",
    tax: "8",
    language: "English",
    timezone: "Europe/Istanbul",
  });
  const [kiosk, setKiosk] = useState({
    name: "cangujet Kiosk",
    number: "KSK-001",
    timeout: "60",
    autoReturn: true,
    sound: true,
    animations: true,
  });
  const connected = false;
  const saveKiosk = () => {
    if (!Number.isFinite(Number(kiosk.timeout)) || Number(kiosk.timeout) <= 0) {
      toast.error("Idle Timeout must be a positive number.");
      return;
    }
    toast.success("Changes saved for this demo session.");
  };
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Restaurant and kiosk preferences"
      />
      <div className="grid max-w-5xl gap-5">
        <SettingsSection title="Restaurant Settings">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Restaurant Name"
              value={restaurant.name}
              onChange={(name) => setRestaurant({ ...restaurant, name })}
            />
            <label className="text-xs text-[#6B7280]">
              Currency
              <AdminSelect
                value={restaurant.currency}
                onChange={(currency) =>
                  setRestaurant({ ...restaurant, currency })
                }
                options={["EUR", "USD", "GBP", "TRY"]}
              />
            </label>
            <Field
              label="Tax Rate (%)"
              type="number"
              value={restaurant.tax}
              onChange={(tax) => setRestaurant({ ...restaurant, tax })}
            />
            <label className="text-xs text-[#6B7280]">
              Default Language
              <AdminSelect
                value={restaurant.language}
                onChange={(language) =>
                  setRestaurant({ ...restaurant, language })
                }
                options={["English", "Turkish"]}
              />
            </label>
            <label className="text-xs text-[#6B7280]">
              Timezone
              <AdminSelect
                value={restaurant.timezone}
                onChange={(timezone) =>
                  setRestaurant({ ...restaurant, timezone })
                }
                options={[
                  "Europe/Istanbul",
                  "Europe/Berlin",
                  "Europe/London",
                  "America/New_York",
                ]}
              />
            </label>
          </div>
          <Save />
        </SettingsSection>
        <SettingsSection title="Kiosk Settings">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs text-[#6B7280]">
              Kiosk Name
              <input
                disabled={connected}
                className={`${input} mt-1 disabled:cursor-not-allowed disabled:opacity-50`}
                value={kiosk.name}
                onChange={(e) => setKiosk({ ...kiosk, name: e.target.value })}
              />
              {connected && (
                <span className="mt-1 block text-[11px] text-[#9CA3AF]">
                  Managed by the connected device configuration.
                </span>
              )}
            </label>
            <label className="text-xs text-[#6B7280]">
              Kiosk Number
              <input
                disabled={connected}
                className={`${input} mt-1 disabled:cursor-not-allowed disabled:opacity-50`}
                value={kiosk.number}
                onChange={(e) => setKiosk({ ...kiosk, number: e.target.value })}
              />
              {connected && (
                <span className="mt-1 block text-[11px] text-[#9CA3AF]">
                  Managed by the connected device configuration.
                </span>
              )}
            </label>
            <label className="text-xs text-[#6B7280]">
              Idle Timeout
              <div className="relative mt-1">
                <input
                  type="number"
                  min="1"
                  className={`${input} pr-20`}
                  value={kiosk.timeout}
                  onChange={(e) =>
                    setKiosk({ ...kiosk, timeout: e.target.value })
                  }
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#9CA3AF]">
                  seconds
                </span>
              </div>
            </label>
          </div>
          <div className="mt-5 space-y-4">
            <Toggle
              label="Auto-return to categories after add-to-cart"
              checked={kiosk.autoReturn}
              onChange={(autoReturn) => setKiosk({ ...kiosk, autoReturn })}
            />
            <Toggle
              label="Enable sound"
              checked={kiosk.sound}
              onChange={(sound) => setKiosk({ ...kiosk, sound })}
            />
            <Toggle
              label="Enable animations"
              checked={kiosk.animations}
              onChange={(animations) => setKiosk({ ...kiosk, animations })}
            />
          </div>
          <button
            onClick={saveKiosk}
            className={`${button} mt-6 bg-[#C41E19] text-white hover:bg-[#A8161A]`}
          >
            Save Changes
          </button>
        </SettingsSection>
      </div>
    </>
  );
}
function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={`${card} p-6`}>
      <h2 className="mb-5 font-bold">{title}</h2>
      {children}
    </section>
  );
}
function Save() {
  return (
    <button
      onClick={() => toast.success("Changes saved for this demo session.")}
      className={`${button} mt-6 bg-[#C41E19] text-white hover:bg-[#A8161A]`}
    >
      Save Changes
    </button>
  );
}

export default function Dashboard({ section, onNavigate }: Props) {
  const pages: Record<AdminSection, ReactNode> = {
    dashboard: <DashboardPage />,
    menu: <MenuPage />,
    categories: <CategoriesPage />,
    notifications: <AdminNotifications />,
    devices: <AdminDevices />,
    settings: <SettingsPage />,
  };
  return (
    <div className="cangujet-admin min-h-screen text-[#1F1F1F] md:flex">
      <Toaster theme="light" position="top-right" />
      <aside className="border-b border-[#ECECEC] bg-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:flex-col md:border-b-0 md:border-r">
        <div className="flex items-center justify-between border-b border-[#ECECEC] px-5 py-5">
          <div>
            <CangujetLogo variant="full" priority className="h-auto w-36" />
            <p className="mt-1 text-[10px] text-[#9CA3AF]">Admin Panel</p>
          </div>
          <MenuIcon className="text-[#9CA3AF] md:hidden" size={20} />
        </div>
        <nav
          aria-label="Admin navigation"
          className="flex gap-1.5 overflow-x-auto p-3 md:flex-1 md:flex-col md:py-4"
        >
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => onNavigate(`/admin/${id}`)}
              aria-current={section === id ? "page" : undefined}
              className={`relative flex min-h-10 shrink-0 items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-all duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C41E19]/30 ${section === id ? "bg-[#C41E19] font-semibold text-white shadow-sm" : "text-[#6B7280] hover:bg-[#F8F9FA] hover:text-[#1F1F1F]"}`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
        <div className="hidden border-t border-[#ECECEC] p-4 md:block">
          <div className="flex items-center gap-3 rounded-xl border border-[#ECECEC] bg-[#F8F9FA] p-3">
            <div className="grid size-8 place-items-center rounded-full bg-[#C41E19]/10 text-xs font-bold text-[#C41E19]">
              A
            </div>
            <div>
              <p className="text-xs font-bold text-[#1F1F1F]">Admin</p>
              <p className="text-[10px] text-[#9CA3AF]">cangujet kiosk</p>
            </div>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 bg-[#F8F9FA] p-4 pb-28 sm:p-7 lg:p-10">
        <div className="mx-auto w-full max-w-[1440px]">{pages[section]}</div>
      </main>
    </div>
  );
}
