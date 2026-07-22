export async function recordProjectPayment(env, session, eventType = "checkout.session.completed") {
  const metadata = session.metadata || {};
  const prospectId = metadata.prospect_id || session.client_reference_id;
  if (!prospectId) throw new Error("Paid session has no prospect_id.");

  const now = new Date().toISOString();
  const paidAt = session.payment_status === "paid" ? now : null;
  await env.CLIENTS_DB.prepare(
    `INSERT INTO project_payments (
      prospect_id, business_name, customer_email, stripe_customer_id,
      checkout_session_id, payment_intent_id, currency, amount_total_cents,
      project_ex_gst_cents, payment_status, terms_version, paid_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(prospect_id) DO UPDATE SET
      business_name = excluded.business_name,
      customer_email = excluded.customer_email,
      stripe_customer_id = excluded.stripe_customer_id,
      checkout_session_id = excluded.checkout_session_id,
      payment_intent_id = excluded.payment_intent_id,
      currency = excluded.currency,
      amount_total_cents = excluded.amount_total_cents,
      project_ex_gst_cents = excluded.project_ex_gst_cents,
      payment_status = excluded.payment_status,
      terms_version = excluded.terms_version,
      paid_at = COALESCE(excluded.paid_at, project_payments.paid_at),
      updated_at = excluded.updated_at`,
  )
    .bind(
      prospectId,
      metadata.business_name || "Unknown business",
      session.customer_details?.email || session.customer_email || "",
      typeof session.customer === "string" ? session.customer : session.customer?.id,
      session.id,
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
      String(session.currency || "aud").toLowerCase(),
      Number(session.amount_total || 0),
      Number(metadata.project_ex_gst_cents || 0),
      session.payment_status || eventType,
      metadata.terms_version || "unknown",
      paidAt,
      now,
    )
    .run();
}
