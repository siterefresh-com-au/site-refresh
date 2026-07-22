import Stripe from "stripe";

export function getStripe(env) {
  if (!env.STRIPE_RESTRICTED_KEY) {
    throw new Error("Stripe restricted API key is not configured.");
  }
  if (
    /^(?:rk|sk)_live_/.test(env.STRIPE_RESTRICTED_KEY) &&
    env.ALLOW_LIVE_STRIPE !== "true"
  ) {
    throw new Error("Live Stripe access is disabled until this flow is approved.");
  }
  return new Stripe(env.STRIPE_RESTRICTED_KEY, {
    apiVersion: "2026-06-24.dahlia",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function stripeCryptoProvider() {
  return Stripe.createSubtleCryptoProvider();
}

export function integrationIdentifier(prefix = "siterefresh") {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const suffix = [...bytes]
    .map((value) => alphabet[value % alphabet.length])
    .join("");
  return `${prefix}_${suffix}`;
}
