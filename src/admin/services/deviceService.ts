import type { DeviceConfiguration } from "../types/adminTypes";
export interface DeviceService { connectDevice(secretKey: string): Promise<DeviceConfiguration>; syncDevice(): Promise<DeviceConfiguration>; disconnectDevice(): Promise<void> }
const delay = () => new Promise(resolve => setTimeout(resolve, 650));
const configuration = (): DeviceConfiguration => ({ kioskId: "mock-kiosk", kioskName: "Morrow Kiosk", kioskNumber: "KSK-001", branchId: "mock-main", branchName: "Main Branch", connectionStatus: "connected", lastSync: new Date().toLocaleString(), menuVersion: "demo" });
export const mockDeviceService: DeviceService = {
  async connectDevice(secretKey) { if (!secretKey.trim()) throw new Error("Enter a device secret key."); await delay(); return configuration(); },
  async syncDevice() { await delay(); return configuration(); },
  async disconnectDevice() { await delay(); },
};
