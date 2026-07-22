import { nextBrisbaneFirstUnix } from "../../_shared/commercial.js";
import { errorResponse, json, readJson, requireBearer } from "../../_shared/http.js";
import { getStripe, integrationIdentifier } from "../../_shared/stripe.js";

export async function onRequestPost({ request, env }) {
  try {
    await requireBearer(request, env.WORKFLOW_AUTH_TOKEN);
    if (!env.STRIPE_HOSTING_PRICE_ID) {
      throw new Error("Stripe hosting Price ID is not configured.");
    }
    const payload = await readJson(request);
    const prospectId = String(payload.prospect_id || "").trim();
    if (!prospectId) throw new Error("prospect_id is required.");

    const stripe = getStripe(env);
    const base = new URL(env.PUBLIC_SITE_URL || "https://siterefresh.com.au");
    const success = new URL("/hosting-confirmed", base);
    const cancel = new URL("/start", base);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: payload.stripe_customer_id || undefined,
      customer_email: payload.stripe_customer_id ? undefined : payload.customer_email,
      client_reference_id: prospectId,
      line_items: [{ price: env.STRIPE_HOSTING_PRICE_ID, quantity: 1 }],
      payment_method_collection: "always",
      subscription_data: {
        billing_cycle_anchor: nextBrisbaneFirstUnix(),
        proration_behavior: "none",
        metadata: { prospect_id: prospectId },
      },
      metadata: { prospect_id: prospectId },
      success_url: success.toString(),
      cancel_url: cancel.toString(),
      integration_identifier: integrationIdentifier("siterefresh_hosting"),
    });

    return json({
      ok: true,
      checkout_url: session.url,
      first_charge_at: new Date(nextBrisbaneFirstUnix() * 1000).toISOString(),
      proration: "none",
    });
  } catch (error) {
    return errorResponse(error, error?.status || 400);
  }
}

