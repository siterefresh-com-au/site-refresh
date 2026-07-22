import { errorResponse, json, readJson, sha256Hex } from "../_shared/http.js";

const MAX_PAYLOAD_BYTES = 80_000;

function cleanString(value, maxLength = 4000) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normaliseSubmission(input) {
  const required = [
    "contact_name",
    "business_name",
    "email",
    "phone",
    "services",
    "service_areas",
    "ideal_customer",
    "primary_action",
    "design_notes",
  ];
  const cleaned = {};
  for (const [key, value] of Object.entries(input || {})) {
    cleaned[key] = Array.isArray(value)
      ? value.map((item) => cleanString(item, 240)).filter(Boolean).slice(0, 30)
      : cleanString(value);
  }
  for (const key of required) {
    if (!cleaned[key]) throw new Error(`Please complete ${key.replaceAll("_", " ")}.`);
  }
  if (cleaned.terms_accepted !== "yes") {
    throw new Error("The project declarations must be accepted.");
  }
  return cleaned;
}

async function resolveToken(env, token) {
  if (!token || token.length < 30) throw new Error("Your secure onboarding link is invalid.");
  const tokenHash = await sha256Hex(token);
  const record = await env.CLIENTS_DB.prepare(
    `SELECT t.prospect_id, t.checkout_session_id, t.expires_at,
            p.business_name, p.customer_email, p.payment_status
     FROM onboarding_tokens t
     JOIN project_payments p ON p.prospect_id = t.prospect_id
     WHERE t.token_hash = ?`,
  )
    .bind(tokenHash)
    .first();
  if (!record) throw new Error("Your secure onboarding link is invalid.");
  if (new Date(record.expires_at).getTime() < Date.now()) {
    throw new Error("Your onboarding link has expired. Please contact Ryan for a new link.");
  }
  if (record.payment_status !== "paid") {
    throw new Error("The commencement payment has not been confirmed.");
  }
  return { ...record, tokenHash };
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.CLIENTS_DB) throw new Error("CLIENTS_DB is not configured.");
    const token = new URL(request.url).searchParams.get("token") || "";
    const record = await resolveToken(env, token);
    return json({
      ok: true,
      prospect_id: record.prospect_id,
      business_name: record.business_name,
      customer_email: record.customer_email,
      expires_at: record.expires_at,
    });
  } catch (error) {
    return errorResponse(error, 403);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.CLIENTS_DB) throw new Error("CLIENTS_DB is not configured.");
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_PAYLOAD_BYTES) throw new Error("Submission is too large.");
    const body = await readJson(request);
    const record = await resolveToken(env, body.token);
    const submission = normaliseSubmission(body.submission);
    const payload = JSON.stringify(submission);
    if (new TextEncoder().encode(payload).byteLength > MAX_PAYLOAD_BYTES) {
      throw new Error("Submission is too large.");
    }
    const now = new Date().toISOString();

    await env.CLIENTS_DB.batch([
      env.CLIENTS_DB.prepare(
        `INSERT INTO onboarding_submissions
         (prospect_id, checkout_session_id, payload_json, status, submitted_at, updated_at)
         VALUES (?, ?, ?, 'submitted', ?, ?)
         ON CONFLICT(prospect_id) DO UPDATE SET
           checkout_session_id = excluded.checkout_session_id,
           payload_json = excluded.payload_json,
           status = 'submitted',
           submitted_at = excluded.submitted_at,
           updated_at = excluded.updated_at`,
      ).bind(record.prospect_id, record.checkout_session_id, payload, now, now),
      env.CLIENTS_DB.prepare(
        "UPDATE onboarding_tokens SET last_used_at = ? WHERE token_hash = ?",
      ).bind(now, record.tokenHash),
    ]);

    return json({ ok: true, status: "submitted" });
  } catch (error) {
    return errorResponse(error, 400);
  }
}

