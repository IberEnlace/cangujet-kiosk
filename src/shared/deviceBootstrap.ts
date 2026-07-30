export type BootstrapDeviceType =
  | "kiosk"
  | "cashier_terminal"
  | "kitchen_display"
  | "order_display"
  | "admin_terminal";

export type BootstrapPaymentMethod = "card" | "pay_at_cashier" | "qr";
export type BootstrapServiceMode = "dine_in" | "take_away";

export type DeviceOpeningHours = {
  dayOfWeek: number;
  sequence: number;
  opensAt: string | null;
  closesAt: string | null;
  closed: boolean;
};

export type DeviceBootstrap = {
  restaurant: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    brandColors: Record<string, string | number | boolean | null>;
  };
  branch: {
    id: string;
    name: string;
    code: string;
    address: string | null;
    phone: string | null;
    currency: string;
    taxRate: number;
    timezone: string;
    serviceModes: BootstrapServiceMode[];
    openingHours: DeviceOpeningHours[];
  };
  device: {
    id: string;
    type: BootstrapDeviceType;
    name: string;
    status: "active";
    configVersion: number;
    lastSeenAt: string | null;
    mode: BootstrapDeviceType;
    defaultLanguage: string;
    featureFlags: Record<string, boolean>;
    printerConfiguration: Record<string, unknown>;
  };
  configuration: {
    configVersion: number;
    lastUpdated: string;
    checksum: string;
  };
  configVersion: number;
  theme: {
    id: string;
    name: string;
    tokens: Record<string, string | number | boolean | null>;
  };
  logoUrl: string | null;
  languages: Array<{
    code: string;
    name: string;
    nativeName: string;
    locale: string;
    direction: "ltr" | "rtl";
    default: boolean;
  }>;
  currency: string;
  taxRate: number;
  serviceModes: BootstrapServiceMode[];
  openingHours: DeviceOpeningHours[];
  paymentConfiguration: {
    enabledMethods: BootstrapPaymentMethod[];
    receiptPrintingEnabled: boolean;
    publicOptions: Record<string, unknown>;
  };
  noriConfiguration: {
    enabled: boolean;
    voiceEnabled: boolean;
    voiceSettings: Record<string, unknown>;
    publicOptions: Record<string, unknown>;
  };
  idleScreenConfiguration: {
    timeoutSeconds: number;
    videoIntervalMs: number;
    minimumPlaybackMs: number;
    transitionMs: number;
    title: string;
    slogan: string;
    description: string;
    buttonLabel: string;
    touchLabel: string;
    videos: string[];
  };
  publishedMenuId: string;
  publishedMenuVersion: number;
  realtimeConfiguration: {
    enabled: boolean;
    transport: "private_broadcast";
    branchTopic: string;
    deviceTopic: string;
  };
};

export type DeviceRegistrationResponse = {
  accessToken: string;
  tokenType: "Bearer";
  expiresAt: string;
  bootstrap: DeviceBootstrap;
};

export type DeviceAccessTokenResponse = {
  accessToken: string;
  tokenType: "Bearer";
  expiresAt: string;
};

export type DeviceApiError = {
  code: string;
  message: string;
};

export type DeviceMenuResponse = {
  menuId: string;
  menuVersion: number;
  currency: string;
  categories: Array<Record<string, unknown>>;
  products: Array<Record<string, unknown>>;
  customizationGroups: Array<Record<string, unknown>>;
  customizationOptions: Array<Record<string, unknown>>;
};
