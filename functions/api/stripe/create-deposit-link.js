import {
  STANDARD_PROJECT_EX_GST_CENTS,
  calculateProjectAmounts,
} from "../../_shared/commercial.js";
import {
  errorResponse,
  json,
  randomToken,
  readJson,
  requireBearer,
  requireHttpsUrl,
  sha256Hex,
} from "../../_shared/http.js";

function requiredText(value, label, maxLength = 240) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${label} is required.`);
  if (text.length > maxLength) throw new Error(`${label} is too long.`);
  return text;
}

export async function onRequestPost({ request, env }) {
  try {
    await requireBearer(request, env.WORKFLOW_AUTH_TOKEN);
    if (!env.CLIENTS_DB) throw new Error("CLIENTS_DB is not configured.");

    const payload = await readJson(request);
    const prospectId = requiredText(payload.prospect_id, "prospect_id", 80);
    const businessName = requiredText(payload.business_name, "business_name");
    const customerEmail = requiredText(payload.customer_email, "customer_email", 254);
    const demoUrl = requireHttpsUrl(payload.demo_url, "demo_url").toString();
    const projectExGstCents = Number(
      payload.project_ex_gst_cents ?? STANDARD_PROJECT_EX_GST_CENTS,
    );
    const amounts = calculateProjectAmounts(projectExGstCents);
    const termsVersion = String(env.TERMS_VERSION || "2026-07-draft");
    const token = randomToken();
    const tokenHash = await sha256Hex(token);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await env.CLIENTS_DB.batch([
      env.CLIENTS_DB.prepare(
        "UPDATE deposit_links SET active = 0, updated_at = ? WHERE prospect_id = ? AND active = 1",
      ).bind(now, prospectId),
      env.CLIENTS_DB.prepare(
        `INSERT INTO deposit_links (
          id, token_hash, prospect_id, business_name, customer_email, demo_url,
          project_ex_gst_cents, terms_version, active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).bind(
        id,
        tokenHash,
        prospectId,
        businessName,
        customerEmail,
        demoUrl,
        projectExGstCents,
        termsVersion,
        now,
        now,
      ),
    ]);

    const base = new URL(env.PUBLIC_SITE_URL || "https://siterefresh.com.au");
    const secureUrl = new URL("/api/stripe/start-deposit", base);
    secureUrl.searchParams.set("token", token);

    return json({
      ok: true,
      prospect_id: prospectId,
      secure_deposit_url: secureUrl.toString(),
      terms_version: termsVersion,
      amounts,
    });
  } catch (error) {
    return errorResponse(error, error?.status || 400);
  }
}

