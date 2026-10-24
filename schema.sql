CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  diamonds INTEGER NOT NULL CHECK (diamonds > 0),
  price_bdt INTEGER NOT NULL CHECK (price_bdt > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_uid VARCHAR(32) NOT NULL,
  package_id UUID NOT NULL REFERENCES packages(id),
  amount_bdt INTEGER NOT NULL CHECK (amount_bdt > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('bkash','nagad')),
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','paid','failed','refunded')),
  delivery_status TEXT NOT NULL DEFAULT 'waiting_payment'
    CHECK (delivery_status IN ('waiting_payment','queued','processing','delivered','failed','manual_review')),
  payment_reference TEXT UNIQUE,
  supplier_reference TEXT UNIQUE,
  supplier_response JSONB,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_event_id TEXT UNIQUE,
  order_id UUID REFERENCES orders(id),
  event_type TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(payment_status, delivery_status);

INSERT INTO packages (title, diamonds, price_bdt)
SELECT v.title, v.diamonds, v.price
FROM (VALUES
  ('Starter', 100, 80),
  ('Popular', 310, 240),
  ('Value Pack', 520, 390),
  ('Mega Pack', 1060, 780)
) AS v(title, diamonds, price)
WHERE NOT EXISTS (SELECT 1 FROM packages);
