import { calculateProjectAmounts } from "../../_shared/commercial.js";
import { errorResponse, json, readJson, requireBearer } from "../../_shared/http.js";
import { getStripe } from "../../_shared/stripe.js";

export async function onRequestPost({ request, env }) {
  try {
    await requireBearer(request, env.WORKFLOW_AUTH_TOKEN);
    if (!env.CLIENTS_DB) throw new Error("CLIENTS_DB is not configured.");
    if (!env.STRIPE_GST_TAX_RATE_ID) throw new Error("The Stripe 10% GST tax rate is not configured.");

    const payload = await readJson(request);
    const prospectId = String(payload.prospect_id || "").trim();
    if (!prospectId) throw new Error("prospect_id is required.");
    const payment = await env.CLIENTS_DB.prepare(
      `SELECT prospect_id, business_name, customer_email, stripe_customer_id,
              project_ex_gst_cents, terms_version, final_invoice_id
       FROM project_payments WHERE prospect_id = ? AND payment_status = 'paid'`,
    ).bind(prospectId).first();
    if (!payment?.stripe_customer_id) throw new Error("A paid commencement payment and Stripe customer are required.");

    const stripe = getStripe(env);
    if (payment.final_invoice_id) {
      const existing = await stripe.invoices.retrieve(payment.final_invoice_id);
      return json({
        ok: true,
        duplicate: true,
        invoice_id: existing.id,
        status: existing.status,
        hosted_invoice_url: existing.hosted_invoice_url,
      });
    }

    const amounts = calculateProjectAmounts(Number(payment.project_ex_gst_cents));
    const metadata = {
      prospect_id: prospectId,
      business_name: payment.business_name,
      terms_version: payment.terms_version,
      purpose: "final_project_balance",
    };
    const draft = await stripe.invoices.create({
      customer: payment.stripe_customer_id,
      collection_method: "send_invoice",
      days_until_due: 7,
      auto_advance: false,
      currency: "aud",
      description: `Final 70% website project balance for ${payment.business_name}`,
      footer: "Site Refresh · ABN 36 137 041 322",
      metadata,
    }, { idempotencyKey: `siterefresh-balance-invoice-${prospectId}` });

    await stripe.invoiceItems.create({
      customer: payment.stripe_customer_id,
      invoice: draft.id,
      amount: amounts.balanceExGstCents,
      currency: "aud",
      description: "Website project – final 70% balance",
      tax_behavior: "exclusive",
      tax_rates: [env.STRIPE_GST_TAX_RATE_ID],
      metadata,
    }, { idempotencyKey: `siterefresh-balance-item-${prospectId}` });

    const finalised = await stripe.invoices.finalizeInvoice(draft.id);
    const sent = await stripe.invoices.sendInvoice(finalised.id);
    await env.CLIENTS_DB.prepare(
      `UPDATE project_payments
       SET final_invoice_id = ?, final_invoice_status = ?, updated_at = ?
       WHERE prospect_id = ?`,
    ).bind(sent.id, sent.status, new Date().toISOString(), prospectId).run();

    return json({
      ok: true,
      invoice_id: sent.id,
      status: sent.status,
      hosted_invoice_url: sent.hosted_invoice_url,
      due_in_days: 7,
      amounts: {
        balance_ex_gst_cents: amounts.balanceExGstCents,
        balance_gst_cents: amounts.balanceGstCents,
        balance_inc_gst_cents: amounts.balanceIncGstCents,
      },
    });
  } catch (error) {
    return errorResponse(error, error?.status || 400);
  }
}
