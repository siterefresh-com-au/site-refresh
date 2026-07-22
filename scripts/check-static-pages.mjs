import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const required = [
  "start.html",
  "terms.html",
  "privacy.html",
  "payment-success.html",
  "hosting-confirmed.html",
  "assets/onboarding.js",
  "assets/client-flow.css",
  "_redirects",
];

const contents = new Map();
for (const file of required) contents.set(file, await readFile(file, "utf8"));

const redirects = contents.get("_redirects");
assert.doesNotMatch(
  redirects,
  /^\/(?:terms|privacy|start|payment-success|hosting-confirmed)\s+\S+\.html\s+200$/m,
  "Pages supplies clean HTML routes automatically; explicit rewrites cause redirect loops",
);

const start = contents.get("start.html");
for (const field of [
  "business_name", "contact_name", "email", "phone", "services", "service_areas",
  "ideal_customer", "primary_action", "design_notes", "terms_accepted",
]) {
  assert.match(start, new RegExp(`name=["']${field}["']`), `Missing onboarding field ${field}`);
}

const allText = [...contents.values()].join("\n");
assert.doesNotMatch(allText, /(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{8,}/, "Possible Stripe key in static files");
assert.doesNotMatch(allText, /whsec_[A-Za-z0-9]{8,}/, "Possible webhook secret in static files");
assert.doesNotMatch(allText, /â(?:€¦|œ|€”|€™)/, "Mojibake detected in static pages");

console.log(`Static checks passed for ${required.length} files.`);
