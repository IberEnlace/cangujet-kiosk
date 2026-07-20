import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthProvider, getDefaultRouteForDevice, useAuth } from "./auth/AuthContext";
import { CUSTOMER_IDLE_TIMEOUT_MS } from "./auth/mockCredentials";
import { ROUTES, getHomeRouteForRole, getLoginRouteForRole, isStaffRole, type AppRoute, type StaffRole } from "./auth/roleConfig";
import { guardRoute, isKnownRoute } from "./auth/routeGuards";
import { CartProvider, useCart } from "./context/CartContext";
import { LanguageProvider, useLanguage } from "./context/LanguageContext";
import RoleSelection from "./pages/RoleSelection";
import StaffLogin from "./components/auth/StaffLogin";
import DeviceSetup from "./pages/DeviceSetup";
import DeveloperPortal from "./pages/DeveloperPortal";
import CashierDashboard from "./pages/CashierDashboard";
import StaffLayout from "./layouts/StaffLayout";
import KioskJourney from "./pages/KioskJourney";
import ShoppingCart from "./pages/ShoppingCart";
import PaymentFlow from "./pages/PaymentFlow";
import OrderTracking from "./pages/OrderTracking";
import Dashboard from "./pages/Dashboard";
import KitchenDisplay from "./pages/KitchenDisplay";
import OrderDisplay from "./pages/OrderDisplay";
import IdleScreen from "./pages/IdleScreen";
import { useKioskIdleReset } from "./hooks/useKioskIdleReset";
import LanguageSelection from "./pages/customer/LanguageSelection";
import ServiceSelection from "./pages/customer/ServiceSelection";
import MenuCatalog from "./pages/customer/MenuCatalog";

function getCurrentRoute(): AppRoute {
  const path = window.location.hash.replace(/^#/, "") || ROUTES.idle;
  return isKnownRoute(path) ? path : ROUTES.idle;
}

function navigateTo(route: string) {
  const normalized = route.startsWith("/") ? route : `/${route}`;
  const next = `#${normalized}`;
  if (window.location.hash !== next) window.location.hash = normalized;
}

const LOGIN_COPY: Record<StaffRole, { title: string; description: string }> = {
  admin: { title: "Admin sign in", description: "Access performance, management, and restaurant configuration." },
  cashier: { title: "Cashier sign in", description: "Open the register, create orders, and take payments." },
  kitchen: { title: "Kitchen sign in", description: "Access incoming tickets and preparation workflows." },
};

function Application() {
  const auth = useAuth();
  const { clearCart, orderType, resetOrderType, setOrderStatus } = useCart();
  const { resetLanguage } = useLanguage();
  const [route, setRoute] = useState<AppRoute>(getCurrentRoute);
  const [kioskSession, setKioskSession] = useState(0);

  useEffect(() => {
    const initialHash = window.location.hash;
    if (!initialHash || initialHash === "#/") navigateTo(ROUTES.idle);
    const update = () => setRoute(getCurrentRoute());
    window.addEventListener("hashchange", update); update();
    return () => window.removeEventListener("hashchange", update);
  }, []);

  const guardedRoute = useMemo(() => guardRoute(route, auth.currentRole, auth.isAuthenticated), [route, auth.currentRole, auth.isAuthenticated]);
  useEffect(() => { if (guardedRoute !== route) navigateTo(guardedRoute); }, [guardedRoute, route]);
  useEffect(() => { if (route === ROUTES.categories && !orderType) navigateTo(ROUTES.service); }, [orderType, route]);

  const resetKiosk = useCallback(() => {
    clearCart(); setOrderStatus("idle"); resetOrderType(); resetLanguage(); setKioskSession(v => v + 1); navigateTo(ROUTES.idle);
  }, [clearCart, resetLanguage, resetOrderType, setOrderStatus]);

  const customerRoutes: AppRoute[] = [ROUTES.language, ROUTES.service, ROUTES.categories, ROUTES.kiosk, ROUTES.cart, ROUTES.payment, ROUTES.tracking];
  useKioskIdleReset({ timeoutMs: CUSTOMER_IDLE_TIMEOUT_MS, enabled: customerRoutes.includes(route), onIdle: resetKiosk });

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "m") { event.preventDefault(); navigateTo(ROUTES.deviceSetup); } };
    window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut);
  }, []);

  const customerNavigate = (target: string) => {
    const map: Record<string, AppRoute> = { portal: ROUTES.kiosk, main: ROUTES.categories, cart: ROUTES.cart, payment: ROUTES.payment, tracking: ROUTES.tracking };
    navigateTo(map[target] ?? ROUTES.kiosk);
  };
  const customerViewport = (child: ReactNode) => <div className="min-h-[100dvh] bg-[#050705]"><div className="mx-auto min-h-[100dvh] w-full max-w-[1080px] shadow-[0_0_80px_rgba(0,0,0,.35)]">{child}</div></div>;
  const staffPage = (role: StaffRole, child: ReactNode) => <StaffLayout role={role} onLoggedOut={() => navigateTo(getLoginRouteForRole(role))} onChangeMode={() => navigateTo(ROUTES.selectRole)}>{child}</StaffLayout>;

  if (guardedRoute !== route) return null;
  if (route === ROUTES.selectRole) return <RoleSelection onSelect={(mode, remember) => { auth.selectDeviceMode(mode, remember); navigateTo(isStaffRole(mode) ? getLoginRouteForRole(mode) : getHomeRouteForRole(mode)); }} />;
  if (route === ROUTES.deviceSetup) return <DeviceSetup onClose={() => navigateTo(getDefaultRouteForDevice(auth.selectedDeviceMode, auth.currentRole, auth.isAuthenticated))} onSelectRole={() => navigateTo(ROUTES.selectRole)} />;
  if (route === ROUTES.dev) return <DeveloperPortal navigate={navigateTo} />;
  if (route === ROUTES.idle) return <IdleScreen onStart={() => navigateTo(ROUTES.language)} />;
  if (route === ROUTES.language) return <LanguageSelection onBack={() => navigateTo(ROUTES.idle)} onContinue={() => navigateTo(ROUTES.service)} />;
  if (route === ROUTES.service) return <ServiceSelection onBack={() => navigateTo(ROUTES.language)} onContinue={() => navigateTo(ROUTES.categories)} />;
  if (route === ROUTES.categories) return orderType ? <MenuCatalog onBack={() => navigateTo(ROUTES.service)} onLanguage={() => navigateTo(ROUTES.language)} onCheckout={() => navigateTo(ROUTES.cart)} /> : null;
  if (route === ROUTES.kiosk) return customerViewport(<KioskJourney key={kioskSession} onCheckout={() => navigateTo(ROUTES.cart)} />);
  if (route === ROUTES.cart) return customerViewport(<ShoppingCart onNavigate={customerNavigate} />);
  if (route === ROUTES.payment) return customerViewport(<PaymentFlow onNavigate={customerNavigate} />);
  if (route === ROUTES.tracking) return customerViewport(<OrderTracking onNavigate={target => target === "portal" ? resetKiosk() : customerNavigate(target)} />);
  if (route === ROUTES.display) return <OrderDisplay onNavigate={() => undefined} />;

  const loginRole = (["admin", "cashier", "kitchen"] as StaffRole[]).find(role => route === getLoginRouteForRole(role));
  if (loginRole) return <StaffLogin role={loginRole} {...LOGIN_COPY[loginRole]} onSuccess={() => navigateTo(getHomeRouteForRole(loginRole))} onBack={() => navigateTo(ROUTES.selectRole)} />;
  if (route === ROUTES.admin) return staffPage("admin", <Dashboard onNavigate={() => undefined} />);
  if (route === ROUTES.cashier) return staffPage("cashier", <CashierDashboard />);
  if (route === ROUTES.kitchen) return staffPage("kitchen", <KitchenDisplay onNavigate={() => undefined} />);
  return null;
}

export default function App() {
  return <AuthProvider><CartProvider><LanguageProvider><Application /></LanguageProvider></CartProvider></AuthProvider>;
}
