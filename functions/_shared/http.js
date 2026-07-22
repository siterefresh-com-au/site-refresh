const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

export function errorResponse(error, status = 400) {
  const message = error instanceof Error ? error.message : "Request failed.";
  return json({ ok: false, error: message }, status);
}

export async function readJson(request) {
  const type = request.headers.get("content-type") || "";
  if (!type.toLowerCase().includes("application/json")) {
    throw new Error("Content-Type must be application/json.");
  }
  return request.json();
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value)),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function randomToken(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function requireBearer(request, expectedToken) {
  if (!expectedToken) throw new Error("Workflow authorization is not configured.");
  const header = request.headers.get("authorization") || "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  const [actualHash, expectedHash] = await Promise.all([
    sha256Hex(supplied),
    sha256Hex(expectedToken),
  ]);
  if (actualHash !== expectedHash) {
    const error = new Error("Unauthorized.");
    error.status = 401;
    throw error;
  }
}

export function requireHttpsUrl(value, label) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error(`${label} must use HTTPS.`);
  }
  return url;
}

