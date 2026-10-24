/*
 * Example pattern to adapt into the existing Express backend.
 * Provider-specific route, raw-body handling, signature checks and payload mapping
 * must match official docs before this is enabled.
 */
import express from "express";
import { pool } from "./db.js";
import { paymentProviders } from "./provider-adapters.js";

export const webhookRouter = express.Router();

// Use a provider-specific route and raw body if required by its signature scheme.
// Do not register this generic example as a live callback before implementing adapters.
webhookRouter.post("/payments/:provider/webhook-example", express.raw({ type: "application/json" }), async (req, res) => {
  const provider = req.params.provider;
  if (!["bkash", "nagad"].includes(provider)) return res.sendStatus(404);

  const adapter = paymentProviders[provider];
  const rawBody = req.body;
  let event;
  try {
    event = await adapter.verifyWebhook({ rawBody, headers: req.headers });
  } catch {
    return res.status(401).json({ error: "Webhook authentication failed or adapter is not configured" });
  }

  // event mapping must be defined from the provider's documentation.
  // Expected normalized fields: eventId, orderId, providerPaymentId, eventType.
  if (!event?.eventId || !event?.orderId || !event?.providerPaymentId) {
    return res.status(400).json({ error: "Invalid normalized event" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const inserted = await client.query(
      `INSERT INTO provider_events(provider, event_id, order_id, event_type, verified, payload)
       VALUES($1,$2,$3,$4,TRUE,$5::jsonb)
       ON CONFLICT(provider,event_id) DO NOTHING
       RETURNING id`,
      [provider, event.eventId, event.orderId, event.eventType || "payment_event", JSON.stringify(event.safePayload || {})]
    );

    // A duplicate signed event is already recorded; acknowledge it without reprocessing.
    if (!inserted.rowCount) {
      await client.query("COMMIT");
      return res.status(200).json({ received: true, duplicate: true });
    }

    const result = await client.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [event.orderId]);
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Order not found" });
    }
    const order = result.rows[0];

    // Query provider server-to-server; webhook payload alone is not sufficient.
    const verifiedPayment = await adapter.verifyPayment({
      order,
      providerPaymentId: event.providerPaymentId
    });

    if (
      verifiedPayment?.status !== "success" ||
      Number(verifiedPayment.amountBdt) !== Number(order.amount_bdt) ||
      verifiedPayment.orderId !== order.id ||
      verifiedPayment.currency !== "BDT"
    ) {
      await client.query(
        "UPDATE provider_events SET processed_at=NOW() WHERE provider=$1 AND event_id=$2",
        [provider, event.eventId]
      );
      await client.query("COMMIT");
      return res.status(202).json({ received: true, action: "manual_review" });
    }

    // Do not mark paid for the wrong payment method or if already paid.
    if (order.payment_method !== provider) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Payment method mismatch" });
    }

    await client.query(
      `UPDATE orders
       SET payment_status='paid', delivery_status='queued',
           payment_reference=$2, updated_at=NOW()
       WHERE id=$1 AND payment_status='pending'`,
      [order.id, event.providerPaymentId]
    );

    // UNIQUE(order_id) ensures at most one delivery job per order.
    await client.query(
      `INSERT INTO delivery_outbox(order_id,state) VALUES($1,'queued')
       ON CONFLICT(order_id) DO NOTHING`,
      [order.id]
    );
    await client.query(
      "UPDATE provider_events SET processed_at=NOW() WHERE provider=$1 AND event_id=$2",
      [provider, event.eventId]
    );
    await client.query("COMMIT");
    return res.status(200).json({ received: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Webhook processing failed:", err.message);
    return res.status(500).json({ error: "Temporary processing failure" });
  } finally {
    client.release();
  }
});
