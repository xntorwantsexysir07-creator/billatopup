/*
 * Provider adapters are deliberately fail-closed placeholders.
 * Implement these functions using the official merchant/supplier API docs.
 * Never mark a payment paid from a browser redirect or customer-submitted TrxID.
 * Never call deliverOrder until verifyPayment returns verified=true from the provider.
 */

export async function createPayment({ method, order }) {
  if (method === "bkash") {
    throw new Error("bKash is not configured. Add official merchant API adapter first.");
  }
  if (method === "nagad") {
    throw new Error("Nagad is not configured. Add official merchant API adapter first.");
  }
  throw new Error("Unsupported payment method");
}

export async function verifyPayment({ method, providerPaymentId, order }) {
  // TODO: Call official bKash/Nagad server-side payment query/verification endpoint.
  // Validate provider signature, amount, currency, merchant, and order association.
  // Return only after provider confirms the payment is completed.
  throw new Error(`Payment verification adapter is not configured for ${method}`);
}

export async function deliverOrder({ order, packageInfo }) {
  // TODO: Call your authorized Free Fire top-up supplier API.
  // Use a stable idempotency/order reference to prevent duplicate deliveries.
  // Keep API keys server-side; do not expose them to the browser.
  if (!process.env.SUPPLIER_BASE_URL || !process.env.SUPPLIER_API_KEY) {
    throw new Error("Supplier API is not configured");
  }
  throw new Error("Supplier-specific adapter must be implemented from official API documentation");
}
