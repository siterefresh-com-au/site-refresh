import { calculateProjectAmounts } from "../../_shared/commercial.js";
import { errorResponse, sha256Hex } from "../../_shared/http.js";
import { getStripe, integrationIdentifier } from "../../_shared/stripe.js";

export async function onRequestGet({ request, env }) {
  try {
    if (!env.CLIENTS_DB) throw new Error("CLIENTS_DB is not configured.");
    if (!env.STRIPE_GST_TAX_RATE_ID) {
      throw new Error("The Stripe 10% GST tax rate is not configured.");
    }

    const requestUrl = new URL(request.url);
    const token = requestUrl.searchParams.get("token") || "";
    if (token.length < 30) throw new Error("This secure project link is invalid.");
    const tokenHash = await sha256Hex(token);
    const link = await env.CLIENTS_DB.prepare(
      `SELECT prospect_id, business_name, customer_email, demo_url,
              project_ex_gst_cents, terms_version
       FROM deposit_links
       WHERE token_hash = ? AND active = 1`,
    )
      .bind(tokenHash)
      .first();

    if (!link) throw new Error("This secure project link is no longer active.");

    const amounts = calculateProjectAmounts(Number(link.project_ex_gst_cents));
    const stripe = getStripe(env);
    const base = new URL(env.PUBLIC_SITE_URL || "https://siterefresh.com.au");
    const successUrl = new URL("/payment-success", base);
    successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");

    const metadata = {
      prospect_id: link.prospect_id,
      business_name: link.business_name,
      terms_version: link.terms_version,
      project_ex_gst_cents: String(amounts.projectExGstCents),
      deposit_ex_gst_cents: String(amounts.depositExGstCents),
      deposit_gst_cents: String(amounts.depositGstCents),
      deposit_inc_gst_cents: String(amounts.depositIncGstCents),
    };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: link.prospect_id,
      customer_email: link.customer_email,
      customer_creation: "always",
      billing_address_collection: "required",
      consent_collection: { terms_of_service: "required" },
      custom_fields: [
        {
          key: "business_name",
          label: { type: "custom", custom: "Business name" },
          type: "text",
          optional: false,
        },
      ],
      custom_text: {
        submit: {
          message:
            "Your 30% commencement payment is non-refundable, subject to the accepted project terms and applicable law.",
        },
      },
      line_items: [
        {
          price_data: {
            currency: "aud",
            unit_amount: amounts.depositExGstCents,
            tax_behavior: "exclusive",
            product_data: {
              name: "SiteRefresh website — 30% commencement payment",
              description: `${link.business_name} website project`,
            },
          },
          quantity: 1,
          tax_rates: [env.STRIPE_GST_TAX_RATE_ID],
        },
      ],
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: `30% commencement payment for ${link.business_name}`,
          footer: "Site Refresh · ABN 36 137 041 322",
          metadata,
        },
      },
      metadata,
      payment_intent_data: { metadata },
      success_url: successUrl.toString(),
      cancel_url: link.demo_url,
      integration_identifier: integrationIdentifier("siterefresh_deposit"),
    });

    return Response.redirect(session.url, 303);
  } catch (error) {
    return errorResponse(error, 400);
  }
}

