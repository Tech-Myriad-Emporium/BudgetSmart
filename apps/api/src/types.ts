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
  // vars
  APP_URL: string;
  EMAIL_FROM: string;
  API_ORIGIN: string; // this Worker's public origin (workers.dev or api.budgetsmarttme.com)
  // Stripe price ids (vars, set after products are created)
  STRIPE_PRICE_BASE?: string;
  STRIPE_PRICE_IND_T1?: string;
  STRIPE_PRICE_IND_T2?: string;
  STRIPE_PRICE_IND_T3?: string;
  STRIPE_PRICE_FAM_T1?: string;
  STRIPE_PRICE_FAM_T2?: string;
  STRIPE_PRICE_FAM_T3?: string;
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
}

/** Shape returned to clients (never leaks the password hash). */
export interface AccountView {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  tier: string;
  subscriptionStatus: string | null;
  currentPeriodEnd: number | null;
}
