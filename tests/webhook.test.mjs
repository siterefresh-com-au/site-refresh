import assert from "node:assert/strict";
import test from "node:test";
import Stripe from "stripe";

import { getStripe } from "../functions/_shared/stripe.js";
import { onRequestPost } from "../functions/api/stripe/webhook.js";

class MockStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
  }
  bind(...values) {
    this.values = values;
    return this;
  }
  async run() {
    this.database.calls.push({ sql: this.sql, values: this.values || [] });
    return { meta: { changes: 1 } };
  }
}

class MockD1 {
  constructor() {
    this.calls = [];
  }
  prepare(sql) {
    return new MockStatement(this, sql);
  }
}

test("draft configuration refuses live Stripe keys", () => {
  assert.throws(
    () => getStripe({ STRIPE_RESTRICTED_KEY: "rk_live_placeholder" }),
    /Live Stripe access is disabled/,
  );
});

test("webhook verifies its signature and records a paid deposit", async () => {
  const secret = "whsec_test_signing_secret";
  const payload = JSON.stringify({
    id: "evt_siterefresh_test",
    object: "event",
    api_version: "2026-06-24.dahlia",
    created: 1_753_200_000,
    data: {
      object: {
        id: "cs_test_siterefresh",
        object: "checkout.session",
        amount_total: 163350,
        client_reference_id: "SR-TEST-001",
        currency: "aud",
        customer: "cus_test_siterefresh",
        customer_details: { email: "owner@example.com" },
        livemode: false,
        metadata: {
          prospect_id: "SR-TEST-001",
          business_name: "Example Trade Co",
          project_ex_gst_cents: "495000",
          terms_version: "2026-07-draft",
        },
        payment_intent: "pi_test_siterefresh",
        payment_status: "paid",
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: "checkout.session.completed",
  });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  const database = new MockD1();
  const request = new Request("https://example.test/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature },
    body: payload,
  });

  const response = await onRequestPost({
    request,
    env: {
      CLIENTS_DB: database,
      STRIPE_RESTRICTED_KEY: "rk_test_placeholder",
      STRIPE_WEBHOOK_SECRET: secret,
    },
  });

  const responseBody = await response.json();
  assert.equal(response.status, 200, JSON.stringify(responseBody));
  assert.deepEqual(responseBody, { received: true });
  assert.equal(database.calls.length, 3);
  assert.match(database.calls[1].sql, /INSERT INTO project_payments/);
  assert.equal(database.calls[1].values[0], "SR-TEST-001");
  assert.equal(database.calls[1].values[8], 495000);
});

test("webhook rejects an invalid signature before writing", async () => {
  const database = new MockD1();
  const response = await onRequestPost({
    request: new Request("https://example.test/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "t=1,v1=invalid" },
      body: "{}",
    }),
    env: {
      CLIENTS_DB: database,
      STRIPE_RESTRICTED_KEY: "rk_test_placeholder",
      STRIPE_WEBHOOK_SECRET: "whsec_test_signing_secret",
    },
  });

  assert.equal(response.status, 400);
  assert.equal(database.calls.length, 0);
});
