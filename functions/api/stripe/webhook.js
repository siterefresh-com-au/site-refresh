import { json } from "../../_shared/http.js";
import { recordProjectPayment } from "../../_shared/payments.js";
import { getStripe, stripeCryptoProvider } from "../../_shared/stripe.js";

export async function onRequestPost({ request, env }) {
  let event;
  try {
    if (!env.CLIENTS_DB) throw new Error("CLIENTS_DB is not configured.");
    if (!env.STRIPE_WEBHOOK_SECRET) {
      throw new Error("Stripe webhook signing secret is not configured.");
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new Error("Missing Stripe-Signature header.");
    const rawBody = await request.text();
    const stripe = getStripe(env);
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
      undefined,
      stripeCryptoProvider(),
    );

    if (event.livemode && env.ALLOW_LIVE_STRIPE !== "true") {
      throw new Error("Live Stripe events are disabled for this draft.");
    }

    const inserted = await env.CLIENTS_DB.prepare(
      `INSERT OR IGNORE INTO stripe_events
       (event_id, event_type, livemode, received_at)
       VALUES (?, ?, ?, ?)`,
    )
      .bind(event.id, event.type, event.livemode ? 1 : 0, new Date().toISOString())
      .run();

    if (!inserted.meta?.changes) {
      return json({ received: true, duplicate: true });
    }

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      await recordProjectPayment(env, event.data.object, event.type);
    }

    if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const prospectId = invoice.metadata?.prospect_id;
      if (prospectId) {
        await env.CLIENTS_DB.prepare(
          `UPDATE project_payments
           SET final_invoice_id = ?, final_invoice_status = ?, updated_at = ?
           WHERE prospect_id = ?`,
        ).bind(invoice.id, invoice.status || event.type, new Date().toISOString(), prospectId).run();
      }
    }

    await env.CLIENTS_DB.prepare(
      "UPDATE stripe_events SET processed_at = ? WHERE event_id = ?",
    )
      .bind(new Date().toISOString(), event.id)
      .run();

    return json({ received: true });
  } catch (error) {
    if (event?.id && env.CLIENTS_DB) {
      await env.CLIENTS_DB.prepare(
        "UPDATE stripe_events SET processing_error = ? WHERE event_id = ?",
      )
        .bind(String(error?.message || error).slice(0, 500), event.id)
        .run()
        .catch(() => {});
    }
    return json({ received: false, error: error?.message || "Webhook failed." }, 400);
  }
}
