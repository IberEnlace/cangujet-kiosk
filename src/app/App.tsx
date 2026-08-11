import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { CUSTOMER_IDLE_TIMEOUT_MS } from "./auth/mockCredentials";
import { ROUTES, WORKSPACE_SELECTION_ROUTE, getHomeRouteForRole, getLoginRouteForRole, isStaffRole, type AppRoute, type StaffRole, type UserRole } from "./auth/roleConfig";
import { guardRoute, isKnownRoute } from "./auth/routeGuards";
import { routeRequiresDeviceSession, shouldInitializeDeviceSession } from "./auth/workspaceRequirements";
import {
  beginIntentionalWorkspaceSelection,
  completeIntentionalWorkspaceSelection,
  initialWorkspaceResumeDecision,
  isLegacyWorkspaceSelectionRoute,
  isWorkspaceSelectionOverrideActive,
  workspaceNavigationDiagnostic,
  workspaceRouteForDevice,
} from "./auth/workspaceNavigation";
import { CartProvider, useCart } from "./context/CartContext";
import { LanguageProvider, useLanguage } from "./context/LanguageContext";
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
  const path = window.location.hash.replace(/^#/, "") || ROUTES.deviceSetup;
  if (path.startsWith(`${ROUTES.mockQrPayment}/`)) return ROUTES.mockQrPayment;
  if (path === WORKSPACE_SELECTION_ROUTE || isLegacyWorkspaceSelectionRoute(path)) return ROUTES.deviceSetup;
  if (path === "/admin/integrations") return ROUTES.adminDashboard;
  if (path === "/admin/email") return ROUTES.adminNotifications;
  return isKnownRoute(path) ? path : ROUTES.deviceSetup;
}

function navigateTo(route: string, replace = false) {
  const normalized = route.startsWith("/") ? route : `/${route}`;
  const next = `#${normalized}`;
  if (window.location.hash === next) return;
  if (replace) {
    window.history.replaceState(null, "", next);
    window.dispatchEvent(new Event("hashchange"));
    return;
  }
  window.location.hash = normalized;
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
  const [adminSessionGate, setAdminSessionGate] = useState<{ route: AppRoute; state: "checking" | "valid" | "network_error" } | null>(null);
  const [adminSessionRetry, setAdminSessionRetry] = useState(0);
  const initialRouteResolvedRef = useRef(false);

  useEffect(() => {
    const initialHash = window.location.hash;
    const initialPath = initialHash.replace(/^#/, "");
    if (!initialHash || initialHash === "#/") navigateTo(ROUTES.deviceSetup, true);
    else if (initialPath === WORKSPACE_SELECTION_ROUTE || isLegacyWorkspaceSelectionRoute(initialPath)) {
      beginIntentionalWorkspaceSelection();
      workspaceNavigationDiagnostic({ route: ROUTES.deviceSetup, persistedWorkspace: null, selectionOverrideActive: true, redirectSource: "legacy_selection_route", redirectAllowed: true });
      navigateTo(ROUTES.deviceSetup, true);
    }
    else if (initialHash === "#/admin/integrations") navigateTo(ROUTES.adminDashboard);
    else if (initialHash === "#/admin/email") navigateTo(ROUTES.adminNotifications);
    else if (!initialPath.startsWith(`${ROUTES.mockQrPayment}/`) && !isKnownRoute(initialPath)) {
      beginIntentionalWorkspaceSelection();
      workspaceNavigationDiagnostic({ route: ROUTES.deviceSetup, persistedWorkspace: null, selectionOverrideActive: true, redirectSource: "invalid_route", redirectAllowed: true });
      navigateTo(ROUTES.deviceSetup, true);
    }
    const update = () => setRoute(getCurrentRoute());
    window.addEventListener("hashchange", update); update();
    return () => window.removeEventListener("hashchange", update);
  }, []);

  const assignedDeviceType = device.config?.bootstrap.device.type ?? null;
  const persistedWorkspace = auth.selectedDeviceMode !== "unassigned" ? auth.selectedDeviceMode : assignedDeviceType;
  const workspaceSelectionOverrideActive = isWorkspaceSelectionOverrideActive();
  const protectedAdminRoute = route.startsWith("/admin") && route !== ROUTES.adminLogin;
  const requiresDeviceSession = routeRequiresDeviceSession(route, auth.currentRole, auth.isAuthenticated);
  const staffDeviceAlternativeRoute = (route === ROUTES.cashier || route === ROUTES.kitchen)
    && !auth.isAuthenticated;
  const deviceAuthorizationPending = staffDeviceAlternativeRoute
    && ["initializing", "registering"].includes(device.initializationStatus);
  const guardedRoute = useMemo(() => deviceCanOpenRoute(assignedDeviceType, route) || deviceAuthorizationPending
    ? route
    : guardRoute(route, auth.currentRole, auth.isAuthenticated), [assignedDeviceType, route, auth.currentRole, auth.isAuthenticated, deviceAuthorizationPending]);
  useEffect(() => { if (!auth.isLoading && guardedRoute !== route) navigateTo(guardedRoute); }, [auth.isLoading, guardedRoute, route]);
  useEffect(() => {
    if (!protectedAdminRoute || auth.isLoading || !auth.isAuthenticated || auth.currentRole !== "admin") {
      setAdminSessionGate(null);
      return;
    }
    let active = true;
    setAdminSessionGate({ route, state: "checking" });
    void auth.verifySession("admin").then(result => {
      if (!active) return;
      if (result === "unauthenticated") {
        setAdminSessionGate(null);
        navigateTo(ROUTES.adminLogin);
        return;
      }
      setAdminSessionGate({ route, state: result === "valid" ? "valid" : "network_error" });
    });
    return () => { active = false; };
  }, [adminSessionRetry, auth.currentRole, auth.isAuthenticated, auth.isLoading, auth.verifySession, protectedAdminRoute, route]);
  useEffect(() => { if (route === ROUTES.categories && !orderType) navigateTo(ROUTES.service); }, [orderType, route]);

  const resetKiosk = useCallback(() => {
    clearPayAtCashierConfirmation(); clearQrPaymentSession(); clearCart(); clearOrderSession(); setOrderStatus("idle"); resetOrderType(); resetLanguage(); resetConversation(); sessionStorage.removeItem("morrow:nori-entry-category"); sessionStorage.removeItem("morrow:nori-voice-responses"); navigateTo(ROUTES.idle);
  }, [clearCart, clearOrderSession, resetConversation, resetLanguage, resetOrderType, setOrderStatus]);

  const kioskIdleTimeoutMs = device.config
    ? device.config.idleScreenConfiguration.timeoutSeconds * 1000
    : CUSTOMER_IDLE_TIMEOUT_MS;
  useKioskIdleReset({ timeoutMs: kioskIdleTimeoutMs, enabled: CUSTOMER_ROUTES.includes(route), resetKey: route, onIdle: resetKiosk });

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
  const enterWorkspaceSelection = useCallback((source: string) => {
    auth.clearDeviceMode();
    beginIntentionalWorkspaceSelection();
    workspaceNavigationDiagnostic({ route: ROUTES.deviceSetup, persistedWorkspace, selectionOverrideActive: true, redirectSource: source, redirectAllowed: true });
    navigateTo(ROUTES.deviceSetup, true);
  }, [auth.clearDeviceMode, persistedWorkspace]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.shiftKey || event.key.toLowerCase() !== "m") return;
      event.preventDefault();
      enterWorkspaceSelection("keyboard_shortcut");
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [enterWorkspaceSelection]);
  const selectWorkspace = useCallback((type: import("../shared/deviceBootstrap").BootstrapDeviceType) => {
    const mode = deviceModeForWorkspace(type);
    completeIntentionalWorkspaceSelection();
    auth.selectDeviceMode(mode, type === "kiosk" || type === "order_display");
    const existingDeviceWorkspace = device.initializationStatus === "authenticated" && assignedDeviceType === type;
    const target = existingDeviceWorkspace
      ? workspaceRouteForDevice(type)
      : isStaffRole(mode) ? getLoginRouteForRole(mode) : getHomeRouteForRole(mode);
    workspaceNavigationDiagnostic({ route: target, persistedWorkspace: mode, selectionOverrideActive: false, redirectSource: "workspace_selected", redirectAllowed: true });
    navigateTo(target);
  }, [assignedDeviceType, auth.selectDeviceMode, device.initializationStatus]);
  const customerViewport = (child: ReactNode) => <div className="min-h-[100dvh] bg-[#F8F9FA]"><div className="mx-auto min-h-[100dvh] w-full max-w-[1080px] bg-white shadow-[0_16px_48px_rgba(31,31,31,.08)]">{child}</div></div>;
  const staffPage = (role: StaffRole, child: ReactNode) => <StaffLayout role={role} onLoggedOut={() => navigateTo(role === "admin" ? ROUTES.deviceSetup : getLoginRouteForRole(role))} onChangeMode={() => enterWorkspaceSelection(`${role}_change_mode`)}>{child}</StaffLayout>;

  useEffect(() => {
    if (!requiresDeviceSession || staffDeviceAlternativeRoute) return;
    if (route === ROUTES.mockQrPayment) return;
    if (device.initializationStatus === "initializing" || device.initializationStatus === "error") return;
    if (device.initializationStatus === "setup_required" && route !== ROUTES.deviceSetup) navigateTo(ROUTES.deviceSetup);
  }, [device.initializationStatus, requiresDeviceSession, route, staffDeviceAlternativeRoute]);
  useEffect(() => {
    if (initialRouteResolvedRef.current) return;
    const decision = initialWorkspaceResumeDecision({
      route,
      initializationStatus: device.initializationStatus,
      assignedDeviceType,
      selectionOverrideActive: workspaceSelectionOverrideActive,
    });
    workspaceNavigationDiagnostic({
      route,
      persistedWorkspace,
      selectionOverrideActive: workspaceSelectionOverrideActive,
      redirectSource: decision.reason,
      redirectAllowed: Boolean(decision.target),
    });
    if (!decision.resolved) return;
    initialRouteResolvedRef.current = true;
    if (decision.target) navigateTo(decision.target, true);
  }, [assignedDeviceType, device.initializationStatus, persistedWorkspace, route, workspaceSelectionOverrideActive]);
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
  if (route === ROUTES.deviceSetup && workspaceSelectionOverrideActive && !device.config && device.initializationStatus === "not_required") return <DeviceLoadingScreen />;
  if (requiresDeviceSession && device.initializationStatus === "initializing") return <DeviceLoadingScreen />;
  if (requiresDeviceSession && !staffDeviceAlternativeRoute && device.initializationStatus === "error" && route !== ROUTES.deviceSetup) return <DeviceLoadingScreen
    error={device.initializationError ?? "configuration_error"}
    onRetry={device.retryInitialization}
    onSetup={() => { void device.clearDeviceConfiguration(); navigateTo(ROUTES.deviceSetup); }}
  />;
  if (auth.isLoading && (route.startsWith("/admin") || route.startsWith("/cashier") || route.startsWith("/kitchen"))) return <DeviceLoadingScreen />;
  if (protectedAdminRoute && auth.isAuthenticated && auth.currentRole === "admin" && (adminSessionGate?.route !== route || adminSessionGate.state !== "valid")) {
    return <AdminSessionGate networkError={adminSessionGate?.route === route && adminSessionGate.state === "network_error"} onRetry={() => setAdminSessionRetry(value => value + 1)} onLogin={() => { void auth.logout().then(() => navigateTo(ROUTES.adminLogin)); }} />;
  }
  if (requiresDeviceSession && !staffDeviceAlternativeRoute && device.initializationStatus === "setup_required" && route !== ROUTES.deviceSetup) return <DeviceSetup onConfigured={() => navigateTo(workspaceRouteForDevice(device.config?.bootstrap.device.type ?? "kiosk"))} onStaffSignIn={() => navigateTo(ROUTES.adminLogin)} />;
  if (route !== ROUTES.deviceSetup && requiresDeviceSession && device.initializationStatus === "authenticated" && ["waiting_for_device", "loading_configuration", "loading_menu", "error"].includes(bootstrap.state)) return <ConfigurationLoadingScreen />;
  if ([ROUTES.nori, ROUTES.noriChat, ROUTES.noriVoice].includes(route as "/nori" | "/nori/chat" | "/nori/voice") && !bootstrap.kiosk?.ai.enabled) return null;
  if (route === ROUTES.noriVoice && !bootstrap.kiosk?.ai.voiceEnabled) return null;
  if (guardedRoute !== route) return null;
  if (route === ROUTES.deviceSetup) return <DeviceSetup
    workspaceSelection={workspaceSelectionOverrideActive && Boolean(device.config)}
    onWorkspaceSelected={selectWorkspace}
    onConfigured={() => navigateTo(workspaceRouteForDevice(device.config?.bootstrap.device.type ?? "kiosk"))}
    onStaffSignIn={() => navigateTo(ROUTES.adminLogin)}
  />;
  if (route === ROUTES.deviceInfo) return <DeviceInfo onBack={() => enterWorkspaceSelection("device_info_back")} onCleared={() => { completeIntentionalWorkspaceSelection(); navigateTo(ROUTES.deviceSetup); }} />;
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
  if (loginRole) return <StaffLogin role={loginRole} {...LOGIN_COPY[loginRole]} onSuccess={() => navigateTo(getHomeRouteForRole(loginRole))} onBack={() => enterWorkspaceSelection(`${loginRole}_login_back`)} />;
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
  return <AuthProvider><RouteAwareDeviceProvider><BootstrapProvider><CartProvider><LanguageProvider><OrderProvider><NoriConversationProvider><Application /></NoriConversationProvider><OfflineConfigurationBanner /></OrderProvider></LanguageProvider></CartProvider></BootstrapProvider></RouteAwareDeviceProvider></AuthProvider>;
}

function RouteAwareDeviceProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [route, setRoute] = useState<AppRoute>(getCurrentRoute);
  useEffect(() => {
    const update = () => setRoute(getCurrentRoute());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const enabled = shouldInitializeDeviceSession(route, auth.currentRole, auth.isAuthenticated);
  return <DeviceProvider enabled={enabled}>{children}</DeviceProvider>;
}

function mockQrSessionId() {
  const path = window.location.hash.replace(/^#/, "");
  return path.startsWith(`${ROUTES.mockQrPayment}/`) ? decodeURIComponent(path.slice(ROUTES.mockQrPayment.length + 1)) : "";
}

function deviceCanOpenRoute(type: import("../shared/deviceBootstrap").BootstrapDeviceType | null, route: AppRoute) {
  return (type === "cashier_terminal" && route === ROUTES.cashier)
    || (type === "kitchen_display" && route === ROUTES.kitchen)
    || (type === "order_display" && route === ROUTES.display);
}

function deviceModeForWorkspace(type: import("../shared/deviceBootstrap").BootstrapDeviceType): UserRole {
  if (type === "cashier_terminal") return "cashier";
  if (type === "kitchen_display") return "kitchen";
  if (type === "admin_terminal") return "admin";
  if (type === "order_display") return "display";
  return "customer";
}

function AdminSessionGate({ networkError, onRetry, onLogin }: { networkError: boolean; onRetry: () => void; onLogin: () => void }) {
  if (!networkError) return <DeviceLoadingScreen />;
  return <main className="grid min-h-[100dvh] place-items-center bg-[#F8F9FA] px-5 text-[#1F1F1F]"><section role="alert" className="w-full max-w-md rounded-2xl border border-[#ECECEC] bg-white p-8 text-center shadow-[0_16px_40px_rgba(31,31,31,.08)]"><h1 className="text-2xl font-bold tracking-[-.03em]">Unable to verify staff session</h1><p className="mt-3 text-sm leading-6 text-[#6B7280]">The authentication service could not be reached. Your session was not cleared.</p><div className="mt-6 flex justify-center gap-3"><button type="button" onClick={onRetry} className="min-h-12 rounded-xl bg-[#C41E19] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#A8161A] active:scale-[.98]">Retry connection</button><button type="button" onClick={onLogin} className="min-h-12 rounded-xl border border-[#ECECEC] bg-white px-5 text-sm font-semibold text-[#1F1F1F] shadow-sm transition hover:bg-[#F8F9FA] active:scale-[.98]">Sign in again</button></div></section></main>;
}
