export interface KitchenNotificationService {
  notifyNewOrders(count: number): void;
}

export class BrowserKitchenNotificationService implements KitchenNotificationService {
  notifyNewOrders(count: number) {
    if (count < 1 || typeof window === "undefined" || !window.AudioContext) return;
    try {
      const context = new window.AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = count > 1 ? 720 : 660;
      gain.gain.value = 0.025;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.12);
      oscillator.addEventListener("ended", () => void context.close(), { once: true });
    } catch {
      // Visual notification remains when an autoplay policy blocks audio.
    }
  }
}

export const kitchenNotificationService = new BrowserKitchenNotificationService();
