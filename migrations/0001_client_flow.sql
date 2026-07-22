CREATE TABLE IF NOT EXISTS deposit_links (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  prospect_id TEXT NOT NULL,
  business_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  demo_url TEXT NOT NULL,
  project_ex_gst_cents INTEGER NOT NULL,
  terms_version TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS deposit_links_prospect_idx
  ON deposit_links (prospect_id, active);

CREATE TABLE IF NOT EXISTS stripe_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  livemode INTEGER NOT NULL,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  processing_error TEXT
);

CREATE TABLE IF NOT EXISTS project_payments (
  prospect_id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  stripe_customer_id TEXT,
  checkout_session_id TEXT NOT NULL,
  payment_intent_id TEXT,
  currency TEXT NOT NULL,
  amount_total_cents INTEGER NOT NULL,
  project_ex_gst_cents INTEGER NOT NULL,
  payment_status TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  final_invoice_id TEXT,
  final_invoice_status TEXT,
  paid_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS onboarding_tokens (
  token_hash TEXT PRIMARY KEY,
  prospect_id TEXT NOT NULL,
  checkout_session_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS onboarding_submissions (
  prospect_id TEXT PRIMARY KEY,
  checkout_session_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
