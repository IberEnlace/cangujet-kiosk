export interface NotificationService { sendTestNotification(email: string, notificationType: string): Promise<void> }
export const isValidEmail = (email: string) => /^\S+@\S+\.\S+$/.test(email);
export const mockNotificationService: NotificationService = { async sendTestNotification(email, notificationType) { if (!isValidEmail(email)) throw new Error("Enter a valid recipient email."); if (!notificationType) throw new Error("Choose a notification type."); await new Promise(resolve => setTimeout(resolve, 600)); } };
