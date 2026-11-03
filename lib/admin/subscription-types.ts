export interface SubscriptionStatus {
  user_id: string;
  user_email: string | null;
  user_display_name: string | null;
  user_code: string | null;
  public_user_code: string | null;
  current_plan_key: string | null;
  current_plan_name: string | null;
  activation_id: string | null;
  activation_created_at: string | null;
  activation_duration_days: number | null;
  activation_note: string | null;
  activation_activated_by: string | null;
  entitlement_expires_at: string | null;
  entitlement_kind: string | null;
  entitlement_value: string | null;
  messages_24h: number;
  uploads_today: number;
  message_limit: number | null;
  upload_limit: number | null;
  quota_updated_at: string | null;
}

export interface ResetQuotaResult { ok: boolean; message: string; }

export interface RevokeSubscriptionResult { ok: boolean; message: string; }

export interface ExtendSubscriptionResult {
  ok: boolean;
  message: string;
  previousExpiry: string | null;
  newExpiry: string | null;
  entitlementExtended: boolean;
}
