/*
 * Implement only from the official provider documentation.
 * These functions intentionally throw until completed; no fake success paths.
 */

export const paymentProviders = {
  bkash: {
    async createCheckout({ order }) {
      // TODO:
      // 1) Obtain/refresh official bKash token securely.
      // 2) Create checkout/payment using order.id as merchant invoice/reference.
      // 3) Return the official checkout URL and provider payment ID.
      // Never accept amount from client; use order.amount_bdt from database.
      throw new Error("Implement bKash createCheckout from official merchant docs");
    },

    async verifyPayment({ order, providerPaymentId }) {
      // TODO: server-to-server query using official bKash payment execution/query API.
      // Confirm final success, correct merchant, currency, amount, and invoice/order.
      throw new Error("Implement bKash verifyPayment from official merchant docs");
    },

    async verifyWebhook({ rawBody, headers }) {
      // TODO: verify signature/authentication according to official bKash webhook docs.
      // Do not assume an HMAC header unless docs specify it.
      throw new Error("Implement bKash verifyWebhook from official docs");
    }
  },

  nagad: {
    async createCheckout({ order }) {
      // TODO: create payment using official Nagad merchant API and signed payload.
      throw new Error("Implement Nagad createCheckout from official merchant docs");
    },

    async verifyPayment({ order, providerPaymentId }) {
      // TODO: server-to-server verification and validate amount, merchant, currency, order.
      throw new Error("Implement Nagad verifyPayment from official merchant docs");
    },

    async verifyWebhook({ rawBody, headers }) {
      // TODO: validate callback signature/certificate as required by official docs.
      throw new Error("Implement Nagad verifyWebhook from official docs");
    }
  }
};

export const supplierProvider = {
  async submitTopup({ order, packageInfo }) {
    // TODO: call authorized supplier endpoint. Send order.id as idempotency/reference
    // if the supplier supports it. Map UID/package fields exactly as docs specify.
    // A timeout is ambiguous: query supplier status before retrying.
    throw new Error("Implement supplier submitTopup from supplier docs");
  },

  async getTopupStatus({ supplierOrderId }) {
    // TODO: query supplier order status before retries/manual reconciliation.
    throw new Error("Implement supplier getTopupStatus from supplier docs");
  }
};
