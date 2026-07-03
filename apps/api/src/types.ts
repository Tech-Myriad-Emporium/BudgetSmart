export interface Env {
  DB: D1Database;
  DOWNLOADS: R2Bucket;
  // secrets
  JWT_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  RESEND_API_KEY?: string;
  GMAIL_USER?: string; // the sending Gmail address
  GMAIL_APP_PASSWORD?: string; // Gmail App Password (secret)
  UPLOAD_TOKEN?: string; // guards the installer upload endpoints (secret)
  ENTITLEMENT_PRIVATE_KEY: string; // RSA private key (PEM) for signing entitlement tokens
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  FINNHUB_KEY?: string;
  // vars
  APP_URL: string;
  EMAIL_FROM: string;
  API_ORIGIN: string; // this Worker's public origin (workers.dev or api.budgetsmarttme.com)
  // Stripe price ids (vars) — monthly + annual per subscription tier
  STRIPE_PRICE_IND_T1_MONTH?: string;
  STRIPE_PRICE_IND_T1_YEAR?: string;
  STRIPE_PRICE_IND_T2_MONTH?: string;
  STRIPE_PRICE_IND_T2_YEAR?: string;
  STRIPE_PRICE_IND_T3_MONTH?: string;
  STRIPE_PRICE_IND_T3_YEAR?: string;
  STRIPE_PRICE_FAM_T1_MONTH?: string;
  STRIPE_PRICE_FAM_T1_YEAR?: string;
  STRIPE_PRICE_FAM_T2_MONTH?: string;
  STRIPE_PRICE_FAM_T2_YEAR?: string;
  STRIPE_PRICE_FAM_T3_MONTH?: string;
  STRIPE_PRICE_FAM_T3_YEAR?: string;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  email_verified: number;
  tier: string;
  stripe_customer_id: string | null;
  subscription_id: string | null;
  subscription_status: string | null;
  current_period_end: number | null;
  created_at: string;
  updated_at: string;
  birthday: string | null;
  avatar_key: string | null;
  locale: string | null;
  theme: string | null;
  location: string | null;
  totp_secret: string | null;
  totp_enabled: number;
  google_sub: string | null;
  trial_ends_at: number | null;
  summary_sent_at?: number | null;
}

/** Shape returned to clients (never leaks the password hash or TOTP secret). */
export interface AccountView {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  tier: string;
  subscriptionStatus: string | null;
  currentPeriodEnd: number | null;
  birthday: string | null;
  avatarUrl: string | null;
  locale: string;
  theme: string;
  location: string | null;
  twoFactorEnabled: boolean;
  /** Unix seconds when the free trial ends (null = never started). */
  trialEndsAt: number | null;
}
