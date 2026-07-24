export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type StaffRole = "admin" | "cashier" | "kitchen";
export type ProfileRow = { id: string; full_name: string; role: StaffRole; branch_id: string | null; is_active: boolean; created_at: string; updated_at: string };
type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };
export type CategoryRow = { id: string; name: string; slug: string; description: string | null; image_url: string | null; display_order: number; is_active: boolean; created_at: string; updated_at: string };
export type ProductRow = { id: string; category_id: string; name: string; slug: string; description: string | null; price: number; currency: string; image_url: string | null; calories: number | null; protein: number | null; carbohydrates: number | null; fat: number | null; fiber: number | null; sugars: number | null; sodium: number | null; ingredients: Json; allergens: string[]; dietary_tags: string[]; recommendation_score: number; is_available: boolean; is_active: boolean; metadata: Json; created_at: string; updated_at: string };
export type CustomizationGroupRow = { id: string; product_id: string; source_id: string; name: string; minimum_selections: number; maximum_selections: number; required: boolean; display_order: number };
export type CustomizationOptionRow = { id: string; group_id: string; source_id: string; name: string; price_delta: number; is_available: boolean; display_order: number; metadata: Json };
export type BranchRow = { id: string; name: string; code: string; address: string | null; currency: string; timezone: string; tax_rate: number; is_active: boolean; created_at: string; updated_at: string };
export type DbOrderStatus = Database["public"]["Enums"]["order_status"];
export type DbPaymentStatus = Database["public"]["Enums"]["payment_status"];
export type OrderRow = { id: string; branch_id: string; order_number: string; order_type: "dine_in" | "takeaway"; status: DbOrderStatus; payment_status: DbPaymentStatus; subtotal: number; tax: number; total: number; currency: string; customer_note: string | null; source: "kiosk" | "cashier" | "nori"; created_by: string | null; created_at: string; updated_at: string; confirmed_at: string | null; preparing_at: string | null; ready_at: string | null; completed_at: string | null; cancelled_at: string | null; idempotency_key: string | null };
export type OrderItemRow = { id: string; order_id: string; product_id: string | null; product_name_snapshot: string; unit_price: number; quantity: number; line_total: number; customizations: Json; notes: string | null; created_at: string };
export type OrderStatusHistoryRow = { id: string; order_id: string; previous_status: DbOrderStatus; new_status: DbOrderStatus; changed_by: string | null; changed_at: string; reason: string | null };
export type PublicBoardRow = { order_number: string; public_status: "preparing" | "ready" | "completed"; created_at: string; ready_at: string | null };
export type TrackingRow = { order_number: string; status: DbOrderStatus; created_at: string; confirmed_at: string | null; preparing_at: string | null; ready_at: string | null; completed_at: string | null; total: number; currency: string };
export type NotificationSettingsRow = { id: string; branch_id: string; primary_email: string; secondary_email: string | null; daily_report_time: string; daily_sales_report: boolean; weekly_sales_summary: boolean; order_failure_alerts: boolean; payment_failure_alerts: boolean; kiosk_offline_alerts: boolean; kitchen_offline_alerts: boolean; device_sync_failure_alerts: boolean; created_at: string; updated_at: string };
export type NotificationDeliveryLogRow = { id: string; branch_id: string | null; recipient: string; notification_type: string; provider: string; provider_message_id: string | null; status: "queued" | "sent" | "delivered" | "delayed" | "failed" | "bounced" | "complained"; error_code: string | null; error_message: string | null; requested_by: string | null; created_at: string; sent_at: string | null; idempotency_key?: string | null; delivered_at?: string | null; failed_at?: string | null; bounced_at?: string | null; complained_at?: string | null; provider_event_id?: string | null; provider_event_type?: string | null; last_provider_update_at?: string | null };
export type CreateOrderArgs = { p_branch_id: string; p_source: "kiosk" | "cashier" | "nori"; p_order_type: "dine_in" | "takeaway"; p_items: Json; p_customer_note?: string | null; p_idempotency_key: string };
export type CreateOrderRow = { order_id: string; order_number: string; subtotal: number; tax: number; total: number; currency: string; order_status: Database["public"]["Enums"]["order_status"]; payment_status: Database["public"]["Enums"]["payment_status"]; created_at: string };

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Omit<ProfileRow, "created_at" | "updated_at"> & { created_at?: string; updated_at?: string };
        Update: Partial<Omit<ProfileRow, "id" | "created_at">>;
        Relationships: [];
      };
      branches: Table<BranchRow>;
      categories: Table<CategoryRow>;
      products: Table<ProductRow>;
      product_customization_groups: Table<CustomizationGroupRow>;
      product_customization_options: Table<CustomizationOptionRow>;
      orders: Table<OrderRow>;
      order_items: Table<OrderItemRow>;
      order_status_history: Table<OrderStatusHistoryRow>;
      notification_settings: Table<NotificationSettingsRow>;
      notification_delivery_logs: Table<NotificationDeliveryLogRow>;
      public_order_refresh_signal: Table<{ singleton: boolean; changed_at: string }>;
      nori_conversations: Table<Record<string, unknown>>;
      nori_messages: Table<Record<string, unknown>>;
    };
    Views: Record<string, never>;
    Functions: {
      current_user_role: { Args: Record<string, never>; Returns: StaffRole | null };
      current_user_branch_id: { Args: Record<string, never>; Returns: string | null };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      resolve_active_branch: { Args: { p_code: string }; Returns: Pick<BranchRow, "id" | "name" | "code" | "currency" | "timezone" | "tax_rate">[] };
      create_order: { Args: CreateOrderArgs; Returns: CreateOrderRow[] };
      transition_order_status: { Args: { p_order_id: string; p_next_status: DbOrderStatus; p_reason?: string | null }; Returns: { order_id: string; previous_status: DbOrderStatus; new_status: DbOrderStatus; changed_at: string }[] };
      get_public_order_board: { Args: { p_branch_code: string }; Returns: PublicBoardRow[] };
      get_order_tracking: { Args: { p_order_id: string; p_tracking_token: string }; Returns: TrackingRow[] };
    };
    Enums: {
      staff_role: StaffRole;
      order_status: "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";
      payment_status: "unpaid" | "pending" | "paid" | "failed" | "refunded";
      order_source: "kiosk" | "cashier" | "nori";
      nori_message_role: "user" | "assistant" | "system" | "tool";
    };
    CompositeTypes: Record<string, never>;
  };
}
