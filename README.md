# Billatopup provider integration scaffold

This is an integration scaffold, not a live payment implementation. Direct bKash/Nagad APIs and the supplier API have provider-specific endpoints, signatures, and payloads. The adapters below intentionally fail closed until completed against the official documentation.

## Included
- Provider adapter interface for checkout, server-side payment verification, webhook signature verification and supplier delivery
- PostgreSQL idempotency / event-ledger migration
- Payment webhook processing pattern with amount/order checks and transaction locking
- Supplier delivery job pattern with a durable outbox table
- Environment variable template

## Do not enable real payments until
1. Implement each TODO using official merchant API documentation.
2. Verify webhook signature exactly as specified by provider.
3. Verify merchant account, currency, amount, order reference, and final transaction state using provider server-to-server query.
4. Implement supplier idempotency using a stable merchant order ID and check supplier status before retrying uncertain requests.
5. Test in sandbox and reconcile payment/provider records before production.

Never commit `.env`, expose secrets in frontend JavaScript, trust browser redirects or customer screenshots as payment proof, or automatically retry a supplier request if the first request may have succeeded but timed out.
