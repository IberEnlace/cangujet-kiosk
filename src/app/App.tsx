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
import ShoppingCart from "./pages/ShoppingCart";
import PaymentFlow from "./pages/PaymentFlow";
import CardTerminalPayment from "./pages/customer/CardTerminalPayment";
import QrPayment from "./pages/customer/QrPayment";
import MockQrPayment from "./pages/customer/MockQrPayment";
import OrderConfirmation from "./pages/customer/OrderConfirmation";
import PayAtCashierConfirmation from "./pages/customer/PayAtCashierConfirmation";
import Dashboard from "./pages/Dashboard";
import KitchenDisplay from "./pages/KitchenDisplay";
import OrderDisplay from "./pages/OrderDisplay";
import IdleScreen from "./pages/IdleScreen";
import { useKioskIdleReset } from "./hooks/useKioskIdleReset";
import LanguageSelection from "./pages/customer/LanguageSelection";
import ServiceSelection from "./pages/customer/ServiceSelection";
import MenuCatalog from "./pages/customer/MenuCatalog";
import { DeviceProvider, useDevice } from "./context/DeviceContext";
import { BootstrapProvider, useBootstrap } from "./context/BootstrapContext";
import DeviceInfo from "./pages/device/DeviceInfo";
import DeviceLoadingScreen from "./components/device/DeviceLoadingScreen";
import ConfigurationLoadingScreen from "./components/configuration/ConfigurationLoadingScreen";
import OfflineConfigurationBanner from "./components/configuration/OfflineConfigurationBanner";
import { NoriConversationProvider, useNoriConversation } from "./context/NoriConversationContext";
import { OrderProvider, useOrderSubmission } from "./context/OrderContext";
import NoriModeSelection from "./pages/nori/NoriModeSelection";
import NoriTextChat from "./pages/nori/NoriTextChat";
import NoriVoiceConversation from "./pages/nori/NoriVoiceConversation";
import { clearPayAtCashierConfirmation, readPayAtCashierConfirmation } from "./services/orders/payAtCashierConfirmation";
import { clearQrPaymentSession, readQrPaymentAttempt } from "./services/orders/qrPaymentSession";

function getCurrentRoute(): AppRoute {
  const path = window.location.hash.replace(/^#/, "") || ROUTES.selectRole;
  if (path.startsWith(`${ROUTES.mockQrPayment}/`)) return ROUTES.mockQrPayment;
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

const CUSTOMER_ROUTES: AppRoute[] = [ROUTES.language, ROUTES.service, ROUTES.categories, ROUTES.nori, ROUTES.noriChat, ROUTES.noriVoice, ROUTES.kiosk, ROUTES.cart, ROUTES.payment, ROUTES.cardPayment, ROUTES.qrPayment, ROUTES.payAtCashierConfirmation, ROUTES.orderConfirmation, ROUTES.tracking];
const ORDER_SESSION_ROUTES: AppRoute[] = [ROUTES.cart, ROUTES.payment, ROUTES.cardPayment, ROUTES.qrPayment, ROUTES.payAtCashierConfirmation, ROUTES.orderConfirmation, ROUTES.tracking];
const NORI_ROUTES: AppRoute[] = [ROUTES.nori, ROUTES.noriChat, ROUTES.noriVoice];

function Application() {
  const auth = useAuth();
  const device = useDevice();
  const bootstrap = useBootstrap();
  const { resetConversation } = useNoriConversation();
  const { clearCart, items, currentOrderId, orderType, resetOrderType, setOrderType, setOrderStatus } = useCart();
  const { resetLanguage } = useLanguage();
  const { clearOrderSession } = useOrderSubmission();
  const [route, setRoute] = useState<AppRoute>(getCurrentRoute);
  const [noriReturnRoute, setNoriReturnRoute] = useState<AppRoute>(ROUTES.categories);

  useEffect(() => {
    const initialHash = window.location.hash;
    if (!initialHash || initialHash === "#/") navigateTo(ROUTES.selectRole);
    else if (initialHash === "#/admin/integrations") navigateTo(ROUTES.adminDashboard);
    else if (initialHash === "#/admin/email") navigateTo(ROUTES.adminNotifications);
    const update = () => setRoute(getCurrentRoute());
    window.addEventListener("hashchange", update); update();
    return () => window.removeEventListener("hashchange", update);
  }, []);

  const assignedDeviceType = device.config?.bootstrap.device.type ?? null;
  const guardedRoute = useMemo(() => deviceCanOpenRoute(assignedDeviceType, route)
    ? route
    : guardRoute(route, auth.currentRole, auth.isAuthenticated), [assignedDeviceType, route, auth.currentRole, auth.isAuthenticated]);
  useEffect(() => { if (!auth.isLoading && guardedRoute !== route) navigateTo(guardedRoute); }, [auth.isLoading, guardedRoute, route]);
  useEffect(() => { if (route === ROUTES.categories && !orderType) navigateTo(ROUTES.service); }, [orderType, route]);

  const resetKiosk = useCallback(() => {
    clearPayAtCashierConfirmation(); clearQrPaymentSession(); clearCart(); clearOrderSession(); setOrderStatus("idle"); resetOrderType(); resetLanguage(); resetConversation(); sessionStorage.removeItem("morrow:nori-entry-category"); sessionStorage.removeItem("morrow:nori-voice-responses"); navigateTo(ROUTES.idle);
  }, [clearCart, clearOrderSession, resetConversation, resetLanguage, resetOrderType, setOrderStatus]);

  const kioskIdleTimeoutMs = device.config
    ? device.config.idleScreenConfiguration.timeoutSeconds * 1000
    : CUSTOMER_IDLE_TIMEOUT_MS;
  useKioskIdleReset({ timeoutMs: kioskIdleTimeoutMs, enabled: CUSTOMER_ROUTES.includes(route), resetKey: route, onIdle: resetKiosk });

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "m") { event.preventDefault(); navigateTo(ROUTES.deviceSetup); } };
    window.addEventListener("keydown", shortcut); return () => window.removeEventListener("keydown", shortcut);
  }, []);

  const customerNavigate = (target: string) => {
    const map: Record<string, AppRoute> = { portal: ROUTES.kiosk, main: ROUTES.categories, cart: ROUTES.cart, payment: ROUTES.payment, paymentCard: ROUTES.cardPayment, payAtCashierConfirmation: ROUTES.payAtCashierConfirmation, tracking: ROUTES.orderConfirmation, confirmation: ROUTES.orderConfirmation };
    navigateTo(map[target] ?? ROUTES.kiosk);
  };
  const cardPaymentBack = useCallback(() => navigateTo(ROUTES.payment), []);
  const cardPaymentApproved = useCallback(() => navigateTo(ROUTES.orderConfirmation), []);
  const payAtCashierConfirmed = useCallback(() => {
    window.history.replaceState(null, "", `#${ROUTES.payAtCashierConfirmation}`);
    setRoute(ROUTES.payAtCashierConfirmation);
  }, []);
  const qrPaymentStarted = useCallback(() => {
    window.history.replaceState(null, "", `#${ROUTES.qrPayment}`);
    setRoute(ROUTES.qrPayment);
  }, []);
  const qrPaymentCompleted = useCallback(() => navigateTo(ROUTES.orderConfirmation), []);
  const qrPaymentCancelled = useCallback(() => navigateTo(ROUTES.payment), []);
  const startOrder = useCallback(() => navigateTo(ROUTES.language), []);
  const finishOrder = useCallback(() => {
    clearCart(); clearOrderSession(); setOrderStatus("idle"); resetOrderType(); resetConversation(); sessionStorage.removeItem("morrow:nori-entry-category"); sessionStorage.removeItem("morrow:nori-voice-responses");
    window.history.replaceState(null, "", `#${ROUTES.idle}`); setRoute(ROUTES.idle);
  }, [clearCart, clearOrderSession, resetConversation, resetOrderType, setOrderStatus]);
  const customerViewport = (child: ReactNode) => <div className="min-h-[100dvh] bg-[#050705]"><div className="mx-auto min-h-[100dvh] w-full max-w-[1080px] shadow-[0_0_80px_rgba(0,0,0,.35)]">{child}</div></div>;
  const staffPage = (role: StaffRole, child: ReactNode) => <StaffLayout role={role} onLoggedOut={() => navigateTo(getLoginRouteForRole(role))} onChangeMode={() => navigateTo(ROUTES.selectRole)}>{child}</StaffLayout>;

  useEffect(() => {
    if (route === ROUTES.mockQrPayment) return;
    if (device.initializationStatus === "initializing" || device.initializationStatus === "error") return;
    if (device.initializationStatus === "setup_required" && route !== ROUTES.deviceSetup) navigateTo(ROUTES.deviceSetup);
  }, [device.initializationStatus, route]);
  useEffect(() => {
    if (device.initializationStatus !== "authenticated" || !assignedDeviceType) return;
    if (route === ROUTES.selectRole) navigateTo(workspaceForDevice(assignedDeviceType));
  }, [assignedDeviceType, device.initializationStatus, route]);
  useEffect(() => {
    if (route === ROUTES.idle) { clearPayAtCashierConfirmation(); clearQrPaymentSession(); }
  }, [route]);
  useEffect(() => {
    if (route === ROUTES.payAtCashierConfirmation && readPayAtCashierConfirmation()) return;
    if (route === ROUTES.qrPayment && readQrPaymentAttempt()?.session) return;
    if (items.length > 0 || currentOrderId || !ORDER_SESSION_ROUTES.includes(route)) return;
    window.history.replaceState(null, "", `#${ROUTES.idle}`); setRoute(ROUTES.idle);
  }, [currentOrderId, items.length, route]);
  useEffect(() => {
    if (!NORI_ROUTES.includes(route)) return;
    if (!bootstrap.kiosk?.ai.enabled) navigateTo(ROUTES.categories);
    else if (route === ROUTES.noriVoice && !bootstrap.kiosk.ai.voiceEnabled) navigateTo(ROUTES.noriChat);
  }, [bootstrap.kiosk, route]);

  if (route === ROUTES.mockQrPayment) return <MockQrPayment sessionId={mockQrSessionId()} />;
  if (device.initializationStatus === "initializing") return <DeviceLoadingScreen />;
  if (device.initializationStatus === "error" && route !== ROUTES.deviceSetup) return <DeviceLoadingScreen
    error={device.initializationError ?? "configuration_error"}
    onRetry={device.retryInitialization}
    onSetup={() => { void device.clearDeviceConfiguration(); navigateTo(ROUTES.deviceSetup); }}
  />;
  if (auth.isLoading && (route.startsWith("/admin") || route.startsWith("/cashier") || route.startsWith("/kitchen"))) return <DeviceLoadingScreen />;
  if (device.initializationStatus === "setup_required" && route !== ROUTES.deviceSetup) return <DeviceSetup onConfigured={() => navigateTo(workspaceForDevice(device.config?.bootstrap.device.type ?? "kiosk"))} onDeviceInfo={() => navigateTo(ROUTES.deviceInfo)} />;
  if (device.initializationStatus === "authenticated" && ["waiting_for_device", "loading_configuration", "loading_menu", "error"].includes(bootstrap.state)) return <ConfigurationLoadingScreen />;
  if ([ROUTES.nori, ROUTES.noriChat, ROUTES.noriVoice].includes(route as "/nori" | "/nori/chat" | "/nori/voice") && !bootstrap.kiosk?.ai.enabled) return null;
  if (route === ROUTES.noriVoice && !bootstrap.kiosk?.ai.voiceEnabled) return null;
  if (guardedRoute !== route) return null;
  if (route === ROUTES.selectRole) return <RoleSelection onSelect={(mode, remember) => { auth.selectDeviceMode(mode, remember); navigateTo(isStaffRole(mode) ? getLoginRouteForRole(mode) : getHomeRouteForRole(mode)); }} />;
  if (route === ROUTES.deviceSetup) return <DeviceSetup onConfigured={() => navigateTo(workspaceForDevice(device.config?.bootstrap.device.type ?? "kiosk"))} onDeviceInfo={() => navigateTo(ROUTES.deviceInfo)} />;
  if (route === ROUTES.deviceInfo) return <DeviceInfo onBack={() => navigateTo(ROUTES.deviceSetup)} onCleared={() => navigateTo(ROUTES.deviceSetup)} />;
  if (route === ROUTES.idle) return <IdleScreen onStart={startOrder} />;
  if (route === ROUTES.language) return <LanguageSelection onBack={() => navigateTo(ROUTES.idle)} onContinue={() => {
    const allowed = bootstrap.branch?.serviceModes ?? [];
    if (allowed.length === 1) setOrderType(allowed[0]);
    navigateTo(allowed.length === 1 ? ROUTES.categories : ROUTES.service);
  }} />;
  if (route === ROUTES.service) return <ServiceSelection onBack={() => navigateTo(ROUTES.language)} onContinue={() => navigateTo(ROUTES.categories)} />;
  if (route === ROUTES.categories) return orderType ? <MenuCatalog onBack={() => navigateTo(ROUTES.service)} onLanguage={() => navigateTo(ROUTES.language)} onCheckout={() => navigateTo(ROUTES.cart)} onNori={() => { setNoriReturnRoute(ROUTES.categories); navigateTo(ROUTES.nori); }} onNoriChat={() => { setNoriReturnRoute(ROUTES.categories); navigateTo(ROUTES.noriChat); }} /> : null;
  if (route === ROUTES.nori) return customerViewport(<NoriModeSelection onBack={() => navigateTo(noriReturnRoute)} onChat={() => navigateTo(ROUTES.noriChat)} onVoice={() => navigateTo(ROUTES.noriVoice)} />);
  if (route === ROUTES.noriChat) return customerViewport(<NoriTextChat onBack={() => navigateTo(ROUTES.nori)} onVoice={() => navigateTo(ROUTES.noriVoice)} onEnd={() => navigateTo(noriReturnRoute)} />);
  if (route === ROUTES.noriVoice) return customerViewport(<NoriVoiceConversation onBack={() => navigateTo(ROUTES.nori)} onText={() => navigateTo(ROUTES.noriChat)} onEnd={() => navigateTo(noriReturnRoute)} />);
  if (route === ROUTES.kiosk) { navigateTo(ROUTES.categories); return null; }
  if (route === ROUTES.cart) return customerViewport(<ShoppingCart onNavigate={customerNavigate} />);
  if (route === ROUTES.payment) return customerViewport(<PaymentFlow onNavigate={customerNavigate} onPayAtCashierConfirmed={payAtCashierConfirmed} onQrPaymentStarted={qrPaymentStarted} />);
  if (route === ROUTES.cardPayment) return customerViewport(<CardTerminalPayment onBack={cardPaymentBack} onApproved={cardPaymentApproved} />);
  if (route === ROUTES.qrPayment) return customerViewport(<QrPayment onComplete={qrPaymentCompleted} onCancel={qrPaymentCancelled} onInvalid={resetKiosk} />);
  if (route === ROUTES.payAtCashierConfirmation) return customerViewport(<PayAtCashierConfirmation onReset={resetKiosk} />);
  if (route === ROUTES.orderConfirmation || route === ROUTES.tracking) return customerViewport(<OrderConfirmation onReset={finishOrder} />);
  if (route === ROUTES.display) return <OrderDisplay onNavigate={() => undefined} />;

  const loginRole = (["admin", "cashier", "kitchen"] as StaffRole[]).find(role => route === getLoginRouteForRole(role));
  if (loginRole) return <StaffLogin role={loginRole} {...LOGIN_COPY[loginRole]} onSuccess={() => navigateTo(getHomeRouteForRole(loginRole))} onBack={() => navigateTo(ROUTES.selectRole)} />;
  if (route === ROUTES.admin) { navigateTo(ROUTES.adminDashboard); return null; }
  const adminSections: Partial<Record<AppRoute, "dashboard" | "menu" | "categories" | "notifications" | "devices" | "settings">> = {
    [ROUTES.adminDashboard]: "dashboard", [ROUTES.adminMenu]: "menu", [ROUTES.adminCategories]: "categories",
    [ROUTES.adminNotifications]: "notifications", [ROUTES.adminDevices]: "devices", [ROUTES.adminSettings]: "settings",
  };
  const adminSection = adminSections[route];
  if (adminSection) return staffPage("admin", <Dashboard section={adminSection} onNavigate={navigateTo} />);
  if (route === ROUTES.cashier) return staffPage("cashier", <CashierDashboard />);
  if (route === ROUTES.kitchen) return staffPage("kitchen", <KitchenDisplay onNavigate={() => undefined} />);
  return null;
}

export default function App() {
  return <DeviceProvider><BootstrapProvider><AuthProvider><CartProvider><LanguageProvider><OrderProvider><NoriConversationProvider><Application /></NoriConversationProvider><OfflineConfigurationBanner /></OrderProvider></LanguageProvider></CartProvider></AuthProvider></BootstrapProvider></DeviceProvider>;
}

function mockQrSessionId() {
  const path = window.location.hash.replace(/^#/, "");
  return path.startsWith(`${ROUTES.mockQrPayment}/`) ? decodeURIComponent(path.slice(ROUTES.mockQrPayment.length + 1)) : "";
}

function workspaceForDevice(type: import("../shared/deviceBootstrap").BootstrapDeviceType): AppRoute {
  if (type === "cashier_terminal") return ROUTES.cashier;
  if (type === "kitchen_display") return ROUTES.kitchen;
  if (type === "order_display") return ROUTES.display;
  if (type === "admin_terminal") return ROUTES.adminLogin;
  return ROUTES.idle;
}

function deviceCanOpenRoute(type: import("../shared/deviceBootstrap").BootstrapDeviceType | null, route: AppRoute) {
  return (type === "cashier_terminal" && route === ROUTES.cashier)
    || (type === "kitchen_display" && route === ROUTES.kitchen)
    || (type === "order_display" && route === ROUTES.display);
}
