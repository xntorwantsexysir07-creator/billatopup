import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "./db.js";
import { requireAdmin } from "./security.js";
import { createPayment, verifyPayment, deliverOrder } from "./providers.js";

const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "20kb" }));
app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "billatopup-api" }));

app.get("/api/packages", async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, title, diamonds, price_bdt FROM packages WHERE active = TRUE ORDER BY price_bdt"
    );
    res.json({ packages: rows });
  } catch (e) { next(e); }
});

const orderSchema = z.object({
  playerUid: z.string().trim().regex(/^[0-9]{6,20}$/, "Invalid Free Fire UID"),
  packageId: z.string().uuid(),
  paymentMethod: z.enum(["bkash", "nagad"]),
  idempotencyKey: z.string().trim().min(16).max(100)
});

app.post("/api/orders", async (req, res, next) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid order details", details: parsed.error.flatten() });

  const { playerUid, packageId, paymentMethod, idempotencyKey } = parsed.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT * FROM orders WHERE idempotency_key=$1", [idempotencyKey]);
    if (existing.rowCount) {
      await client.query("COMMIT");
      return res.status(200).json({ order: existing.rows[0], reused: true });
    }
    const p = await client.query("SELECT * FROM packages WHERE id=$1 AND active=TRUE", [packageId]);
    if (!p.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Package not found" });
    }
    const pkg = p.rows[0];
    const created = await client.query(
      `INSERT INTO orders(player_uid, package_id, amount_bdt, payment_method, idempotency_key)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [playerUid, packageId, pkg.price_bdt, paymentMethod, idempotencyKey]
    );
    await client.query("COMMIT");

    // Payment provider adapter must be implemented before real checkout can work.
    try {
      const payment = await createPayment({ method: paymentMethod, order: created.rows[0] });
      return res.status(201).json({ order: created.rows[0], payment });
    } catch (e) {
      return res.status(503).json({
        error: "Order created, but payment gateway is not configured yet",
        orderId: created.rows[0].id
      });
    }
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    next(e);
  } finally { client.release(); }
});

// Provider-specific webhook must verify the provider's signature before changing payment status.
// This generic endpoint intentionally does not accept browser claims as proof of payment.
app.post("/api/payments/confirm", async (req, res) => {
  const schema = z.object({
    orderId: z.string().uuid(),
    providerPaymentId: z.string().min(1).max(200),
    paymentMethod: z.enum(["bkash", "nagad"])
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request" });
  return res.status(501).json({
    error: "Not enabled until official provider verification and signed webhook are implemented"
  });
});

app.get("/api/orders/:id/status", async (req, res, next) => {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: "Invalid order ID" });
  try {
    const { rows } = await pool.query(
      "SELECT id, payment_status, delivery_status, created_at, updated_at FROM orders WHERE id=$1",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Order not found" });
    res.json({ order: rows[0] });
  } catch (e) { next(e); }
});

app.post("/api/admin/login", rateLimit({ windowMs: 15 * 60_000, limit: 8 }), async (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid credentials" });
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD_HASH || !process.env.JWT_SECRET) {
    return res.status(503).json({ error: "Admin environment is not configured" });
  }
  const ok = parsed.data.email.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase()
    && await bcrypt.compare(parsed.data.password, process.env.ADMIN_PASSWORD_HASH);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });
  const token = jwt.sign({ role: "admin", email: process.env.ADMIN_EMAIL }, process.env.JWT_SECRET, { expiresIn: "2h" });
  res.json({ token, expiresIn: 7200 });
});

app.get("/api/admin/orders", requireAdmin, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const { rows } = await pool.query(
      `SELECT o.id, o.player_uid, o.amount_bdt, o.payment_method, o.payment_status,
              o.delivery_status, o.payment_reference, o.supplier_reference, o.created_at,
              p.title AS package_title, p.diamonds
       FROM orders o JOIN packages p ON p.id=o.package_id
       ORDER BY o.created_at DESC LIMIT $1`, [limit]
    );
    res.json({ orders: rows });
  } catch (e) { next(e); }
});

// Admin retry is deliberately not implemented until supplier idempotency is configured.
app.post("/api/admin/orders/:id/retry-delivery", requireAdmin, async (_req, res) => {
  res.status(501).json({ error: "Configure supplier API and idempotency before enabling delivery retries" });
});

app.use((err, _req, res, _next) => {
  console.error("Request failed:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Billatopup API listening on ${port}`));
