/*
 * Delivery worker pattern. Wire into a durable worker process/queue.
 * Before retrying an uncertain supplier timeout, query supplier status by stable order ID.
 */
import { pool } from "./db.js";
import { supplierProvider } from "./provider-adapters.js";

export async function processOneDeliveryJob() {
  const client = await pool.connect();
  let job;
  try {
    await client.query("BEGIN");
    const picked = await client.query(
      `SELECT d.*, o.player_uid, o.package_id, o.id AS order_id
       FROM delivery_outbox d
       JOIN orders o ON o.id=d.order_id
       WHERE d.state='queued'
       ORDER BY d.created_at
       FOR UPDATE OF d SKIP LOCKED
       LIMIT 1`
    );
    if (!picked.rowCount) {
      await client.query("COMMIT");
      return false;
    }
    job = picked.rows[0];
    await client.query(
      "UPDATE delivery_outbox SET state='processing', attempts=attempts+1, updated_at=NOW() WHERE id=$1",
      [job.id]
    );
    await client.query("UPDATE orders SET delivery_status='processing', updated_at=NOW() WHERE id=$1", [job.order_id]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }

  try {
    const { rows: packageRows } = await pool.query("SELECT * FROM packages WHERE id=$1", [job.package_id]);
    if (!packageRows.length) throw new Error("Package missing");

    // Implement supplier adapter with a stable idempotency key and documented status lookup.
    const result = await supplierProvider.submitTopup({
      order: { id: job.order_id, player_uid: job.player_uid },
      packageInfo: packageRows[0]
    });

    if (result?.status !== "delivered" || !result?.supplierOrderId) {
      throw new Error("Supplier did not confirm delivery");
    }

    await pool.query(
      `UPDATE delivery_outbox
       SET state='delivered', supplier_order_id=$2, last_error=NULL, updated_at=NOW()
       WHERE id=$1`,
      [job.id, result.supplierOrderId]
    );
    await pool.query(
      `UPDATE orders
       SET delivery_status='delivered', supplier_reference=$2, updated_at=NOW()
       WHERE id=$1 AND payment_status='paid'`,
      [job.order_id, result.supplierOrderId]
    );
    return true;
  } catch (err) {
    // Do not automatically queue another supplier request: timeout may mean it succeeded.
    await pool.query(
      `UPDATE delivery_outbox
       SET state='manual_review', last_error=$2, updated_at=NOW()
       WHERE id=$1`,
      [job.id, String(err.message).slice(0, 500)]
    );
    await pool.query(
      `UPDATE orders SET delivery_status='manual_review', updated_at=NOW() WHERE id=$1`,
      [job.order_id]
    );
    return false;
  }
}
