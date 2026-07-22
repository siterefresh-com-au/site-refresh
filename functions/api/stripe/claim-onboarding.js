import { errorResponse, json, randomToken, sha256Hex } from "../../_shared/http.js";
import { recordProjectPayment } from "../../_shared/payments.js";
import { getStripe } from "../../_shared/stripe.js";

export async function onRequestGet({ request, env }) {
  try {
    if (!env.CLIENTS_DB) throw new Error("CLIENTS_DB is not configured.");
    const sessionId = new URL(request.url).searchParams.get("session_id") || "";
    if (!sessionId.startsWith("cs_")) throw new Error("Invalid Checkout Session.");

    const stripe = getStripe(env);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.livemode && env.ALLOW_LIVE_STRIPE !== "true") {
      throw new Error("Live Stripe payments are disabled for this draft.");
    }
    if (session.payment_status !== "paid") {
      return json({ ok: false, status: session.payment_status || "unpaid" }, 402);
    }

    const prospectId = session.metadata?.prospect_id || session.client_reference_id;
    if (!prospectId) throw new Error("Payment is missing its prospect reference.");
    await recordProjectPayment(env, session);

    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const now = new Date();
    const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await env.CLIENTS_DB.prepare(
      `INSERT INTO onboarding_tokens
       (token_hash, prospect_id, checkout_session_id, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(tokenHash, prospectId, session.id, expires.toISOString(), now.toISOString())
      .run();

    const start = new URL("/start", env.PUBLIC_SITE_URL || "https://siterefresh.com.au");
    start.searchParams.set("token", token);
    return json({ ok: true, onboarding_url: start.toString() });
  } catch (error) {
    return errorResponse(error, 400);
  }
}
