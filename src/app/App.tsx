import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { CUSTOMER_IDLE_TIMEOUT_MS } from "./auth/mockCredentials";
import { ROUTES, getHomeRouteForRole, getLoginRouteForRole, isStaffRole, type AppRoute, type StaffRole } from "./auth/roleConfig";
import { guardRoute, isKnownRoute } from "./auth/routeGuards";
import { CartProvider, useCart } from "./context/CartContext";
import { LanguageProvider, useLanguage } from "./context/LanguageContext";
import RoleSelection from "./pages/RoleSelection";
import StaffLogin from "./components/auth/StaffLogin";
import DeviceSetup from "./pages/device/DeviceSetup";
import CashierDashboard from "./pages/CashierDashboard";
import StaffLayout from "./layouts/StaffLayout";
import KioskJourney from "./pages/KioskJourney";
import ShoppingCart from "./pages/ShoppingCart";
import PaymentFlow from "./pages/PaymentFlow";
import CardTerminalPayment from "./pages/customer/CardTerminalPayment";
import OrderConfirmation from "./pages/customer/OrderConfirmation";
import Dashboard from "./pages/Dashboard";
import KitchenDisplay from "./pages/KitchenDisplay";
import OrderDisplay from "./pages/OrderDisplay";
import IdleScreen from "./pages/IdleScreen";
import { useKioskIdleReset } from "./hooks/useKioskIdleReset";
import LanguageSelection from "./pages/customer/LanguageSelection";
import ServiceSelection from "./pages/customer/ServiceSelection";
import MenuCatalog from "./pages/customer/MenuCatalog";
import { DeviceProvider, useDevice } from "./context/DeviceContext";
import DeviceInfo from "./pages/device/DeviceInfo";
import DeviceLoadingScreen from "./components/device/DeviceLoadingScreen";
import { NoriConversationProvider, useNoriConversation } from "./context/NoriConversationContext";
import NoriModeSelection from "./pages/nori/NoriModeSelection";
import NoriTextChat from "./pages/nori/NoriTextChat";
import NoriVoiceConversation from "./pages/nori/NoriVoiceConversation";
import { loadMenu } from "./services/supabase/menuService";
import { replaceAiMenu } from "./data/aiMenu";

function getCurrentRoute(): AppRoute {
  const path = window.location.hash.replace(/^#/, "") || ROUTES.selectRole;
  if (path === "/admin/integrations") return ROUTES.adminDashboard;
  if (path === "/admin/email") return ROUTES.adminNotifications;
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

const CUSTOMER_ROUTES: AppRoute[] = [ROUTES.language, ROUTES.service, ROUTES.categories, ROUTES.nori, ROUTES.noriChat, ROUTES.noriVoice, ROUTES.kiosk, ROUTES.cart, ROUTES.payment, ROUTES.cardPayment, ROUTES.orderConfirmation, ROUTES.tracking];
const PROTECTED_CUSTOMER_ROUTES: AppRoute[] = [ROUTES.idle, ...CUSTOMER_ROUTES];
const ORDER_SESSION_ROUTES: AppRoute[] = [ROUTES.cart, ROUTES.payment, ROUTES.cardPayment, ROUTES.orderConfirmation, ROUTES.tracking];
const NORI_ROUTES: AppRoute[] = [ROUTES.nori, ROUTES.noriChat, ROUTES.noriVoice];

function Application() {
  const auth = useAuth();
  const device = useDevice();
  const { resetConversation } = useNoriConversation();
  const { clearCart, items, currentOrderId, orderType, resetOrderType, setOrderType, setOrderStatus } = useCart();
  const { resetLanguage } = useLanguage();
  const [route, setRoute] = useState<AppRoute>(getCurrentRoute);
  const [kioskSession, setKioskSession] = useState(0);
  const [noriReturnRoute, setNoriReturnRoute] = useState<AppRoute>(ROUTES.categories);

  useEffect(() => {
    let active = true;
    void loadMenu().then(result => {
      if (active && result.ok) replaceAiMenu(result.data.products);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const initialHash = window.location.hash;
    if (!initialHash || initialHash === "#/") navigateTo(ROUTES.selectRole);
    else if (initialHash === "#/admin/integrations") navigateTo(ROUTES.adminDashboard);
    else if (initialHash === "#/admin/email") navigateTo(ROUTES.adminNotifications);
    const update = () => setRoute(getCurrentRoute());
    window.addEventListener("hashchange", update); update();
    return () => window.removeEventListener("hashchange", update);
  }, []);

  const guardedRoute = useMemo(() => guardRoute(route, auth.currentRole, auth.isAuthenticated), [route, auth.currentRole, auth.isAuthenticated]);
  useEffect(() => { if (!auth.isLoading && guardedRoute !== route) navigateTo(guardedRoute); }, [auth.isLoading, guardedRoute, route]);
  useEffect(() => { if (route === ROUTES.categories && !orderType) navigateTo(ROUTES.service); }, [orderType, route]);

  const resetKiosk = useCallback(() => {
    clearCart(); setOrderStatus("idle"); resetOrderType(); resetLanguage(); resetConversation(); sessionStorage.removeItem("morrow:nori-entry-category"); sessionStorage.removeItem("morrow:nori-voice-responses"); setKioskSession(v => v + 1); navigateTo(ROUTES.idle);
  }, [clearCart, resetConversation, resetLanguage, resetOrderType, setOrderStatus]);

  const kioskIdleTimeoutMs = device.config
    ? device.config.idleScreenConfiguration.timeoutSeconds * 1000
    : CUSTOMER_IDLE_TIMEOUT_MS;
  useKioskIdleReset({ timeoutMs: kioskIdleTimeoutMs, enabled: CUSTOMER_ROUTES.includes(route), onIdle: resetKiosk });

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "m") { event.preventDefault(); navigateTo(ROUTES.deviceSetup); } };
    window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut);
  }, []);

  const customerNavigate = (target: string) => {
    const map: Record<string, AppRoute> = { portal: ROUTES.kiosk, main: ROUTES.categories, cart: ROUTES.cart, payment: ROUTES.payment, paymentCard: ROUTES.cardPayment, tracking: ROUTES.orderConfirmation, confirmation: ROUTES.orderConfirmation };
    navigateTo(map[target] ?? ROUTES.kiosk);
  };
  const cardPaymentBack = useCallback(() => navigateTo(ROUTES.payment), []);
  const cardPaymentApproved = useCallback(() => navigateTo(ROUTES.orderConfirmation), []);
  const startOrder = useCallback(() => navigateTo(ROUTES.language), []);
  const finishOrder = useCallback(() => {
    clearCart(); setOrderStatus("idle"); resetOrderType(); resetConversation(); sessionStorage.removeItem("morrow:nori-entry-category"); sessionStorage.removeItem("morrow:nori-voice-responses"); setKioskSession(value => value + 1);
    window.history.replaceState(null, "", `#${ROUTES.idle}`); setRoute(ROUTES.idle);
  }, [clearCart, resetConversation, resetOrderType, setOrderStatus]);
  const customerViewport = (child: ReactNode) => <div className="min-h-[100dvh] bg-[#050705]"><div className="mx-auto min-h-[100dvh] w-full max-w-[1080px] shadow-[0_0_80px_rgba(0,0,0,.35)]">{child}</div></div>;
  const staffPage = (role: StaffRole, child: ReactNode) => <StaffLayout role={role} onLoggedOut={() => navigateTo(getLoginRouteForRole(role))} onChangeMode={() => navigateTo(ROUTES.selectRole)}>{child}</StaffLayout>;

  useEffect(() => {
    if (device.status === "checking") return;
    if (!device.config && PROTECTED_CUSTOMER_ROUTES.includes(route)) navigateTo(ROUTES.deviceSetup);
  }, [device.config, device.status, route]);
  useEffect(() => {
    if (items.length > 0 || currentOrderId || !ORDER_SESSION_ROUTES.includes(route)) return;
    window.history.replaceState(null, "", `#${ROUTES.idle}`); setRoute(ROUTES.idle);
  }, [currentOrderId, items.length, route]);
  useEffect(() => {
    if (!NORI_ROUTES.includes(route)) return;
    if (!device.config?.settings.aiAssistantEnabled) navigateTo(ROUTES.categories);
    else if (route === ROUTES.noriVoice && device.config.settings.voiceAssistantEnabled === false) navigateTo(ROUTES.noriChat);
  }, [device.config, route]);

  if (device.status === "checking") return <DeviceLoadingScreen />;
  if (auth.isLoading && (route.startsWith("/admin") || route.startsWith("/cashier") || route.startsWith("/kitchen"))) return <DeviceLoadingScreen />;
  if (!device.config && PROTECTED_CUSTOMER_ROUTES.includes(route)) return <DeviceLoadingScreen />;
  if ([ROUTES.nori, ROUTES.noriChat, ROUTES.noriVoice].includes(route as "/nori" | "/nori/chat" | "/nori/voice") && !device.config?.settings.aiAssistantEnabled) return null;
  if (route === ROUTES.noriVoice && device.config?.settings.voiceAssistantEnabled === false) return null;
  if (guardedRoute !== route) return null;
  if (route === ROUTES.selectRole) return <RoleSelection onSelect={(mode, remember) => { auth.selectDeviceMode(mode, remember); navigateTo(isStaffRole(mode) ? getLoginRouteForRole(mode) : getHomeRouteForRole(mode)); }} />;
  if (route === ROUTES.deviceSetup) return <DeviceSetup onConfigured={() => { window.history.replaceState(null, "", `#${ROUTES.idle}`); setRoute(ROUTES.idle); }} onDeviceInfo={() => navigateTo(ROUTES.deviceInfo)} />;
  if (route === ROUTES.deviceInfo) return <DeviceInfo onBack={() => navigateTo(ROUTES.deviceSetup)} onCleared={() => navigateTo(ROUTES.deviceSetup)} />;
  if (route === ROUTES.idle) return <IdleScreen onStart={startOrder} />;
  if (route === ROUTES.language) return <LanguageSelection onBack={() => navigateTo(ROUTES.idle)} onContinue={() => {
    const allowed = device.config?.settings.allowedOrderTypes ?? [];
    if (allowed.length === 1) setOrderType(allowed[0]);
    navigateTo(allowed.length === 1 ? ROUTES.categories : ROUTES.service);
  }} />;
  if (route === ROUTES.service) return <ServiceSelection onBack={() => navigateTo(ROUTES.language)} onContinue={() => navigateTo(ROUTES.categories)} />;
  if (route === ROUTES.categories) return orderType ? <MenuCatalog onBack={() => navigateTo(ROUTES.service)} onLanguage={() => navigateTo(ROUTES.language)} onCheckout={() => navigateTo(ROUTES.cart)} onNori={() => { setNoriReturnRoute(ROUTES.categories); navigateTo(ROUTES.nori); }} onNoriChat={() => { setNoriReturnRoute(ROUTES.categories); navigateTo(ROUTES.noriChat); }} /> : null;
  if (route === ROUTES.nori) return customerViewport(<NoriModeSelection onBack={() => navigateTo(noriReturnRoute)} onChat={() => navigateTo(ROUTES.noriChat)} onVoice={() => navigateTo(ROUTES.noriVoice)} />);
  if (route === ROUTES.noriChat) return customerViewport(<NoriTextChat onBack={() => navigateTo(ROUTES.nori)} onVoice={() => navigateTo(ROUTES.noriVoice)} onEnd={() => navigateTo(noriReturnRoute)} />);
  if (route === ROUTES.noriVoice) return customerViewport(<NoriVoiceConversation onBack={() => navigateTo(ROUTES.nori)} onText={() => navigateTo(ROUTES.noriChat)} onEnd={() => navigateTo(noriReturnRoute)} />);
  if (route === ROUTES.kiosk) return customerViewport(<KioskJourney key={kioskSession} onCheckout={() => navigateTo(ROUTES.cart)} />);
  if (route === ROUTES.cart) return customerViewport(<ShoppingCart onNavigate={customerNavigate} />);
  if (route === ROUTES.payment) return customerViewport(<PaymentFlow onNavigate={customerNavigate} />);
  if (route === ROUTES.cardPayment) return customerViewport(<CardTerminalPayment onBack={cardPaymentBack} onApproved={cardPaymentApproved} />);
  if (route === ROUTES.orderConfirmation || route === ROUTES.tracking) return customerViewport(<OrderConfirmation onReset={finishOrder} />);
  if (route === ROUTES.display) return <OrderDisplay onNavigate={() => undefined} />;

  const loginRole = (["admin", "cashier", "kitchen"] as StaffRole[]).find(role => route === getLoginRouteForRole(role));
  if (loginRole) return <StaffLogin role={loginRole} {...LOGIN_COPY[loginRole]} onSuccess={() => navigateTo(getHomeRouteForRole(loginRole))} onBack={() => navigateTo(ROUTES.selectRole)} />;
  if (route === ROUTES.admin) { navigateTo(ROUTES.adminDashboard); return null; }
  const adminSections: Partial<Record<AppRoute, "dashboard" | "menu" | "categories" | "notifications" | "settings">> = {
    [ROUTES.adminDashboard]: "dashboard", [ROUTES.adminMenu]: "menu", [ROUTES.adminCategories]: "categories",
    [ROUTES.adminNotifications]: "notifications", [ROUTES.adminSettings]: "settings",
  };
  const adminSection = adminSections[route];
  if (adminSection) return staffPage("admin", <Dashboard section={adminSection} onNavigate={navigateTo} />);
  if (route === ROUTES.cashier) return staffPage("cashier", <CashierDashboard />);
  if (route === ROUTES.kitchen) return staffPage("kitchen", <KitchenDisplay onNavigate={() => undefined} />);
  return null;
}

export default function App() {
  return <DeviceProvider><AuthProvider><CartProvider><LanguageProvider><NoriConversationProvider><Application /></NoriConversationProvider></LanguageProvider></CartProvider></AuthProvider></DeviceProvider>;
}
