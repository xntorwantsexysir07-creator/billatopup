-- Apply after the existing Billatopup schema.
CREATE TABLE IF NOT EXISTS provider_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  order_id UUID REFERENCES orders(id),
  event_type TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE(provider, event_id)
);

CREATE TABLE IF NOT EXISTS delivery_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
  state TEXT NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued','processing','delivered','failed','manual_review')),
  attempts INTEGER NOT NULL DEFAULT 0,
  supplier_order_id TEXT UNIQUE,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS provider_events_order_idx ON provider_events(order_id);
CREATE INDEX IF NOT EXISTS delivery_outbox_state_idx ON delivery_outbox(state, created_at);
