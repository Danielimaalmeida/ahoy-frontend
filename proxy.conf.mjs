// Dev-server proxy for `npm start` (local development only; it never ships to production).
//
// The browser calls the relative `/api/v1` (same origin, F9) and this proxy forwards it to the hosted API. It also adds
// `X-Ahoy-Actor`, which the API needs when it runs with `AHOY_AUTH=dev`. The app itself never sends that header nor
// `Authorization` (F8). Never point AHOY_API_TARGET at `--live` or at the TEST environment.

/** Reads an optional env var; an empty value counts as unset. */
function env(name, fallback) {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value.trim();
}

const target = env("AHOY_API_TARGET", "http://127.0.0.1:8080");
const actor = env("AHOY_ACTOR", "dev@example.com");

const url = new URL(target); // Throws on a malformed target, so a typo fails at start-up instead of per request.
if (url.protocol !== "http:" && url.protocol !== "https:") {
  throw new Error(`AHOY_API_TARGET must be an http(s) URL, got ${url.protocol}`);
}

export default {
  "/api/v1": {
    target,
    secure: false,
    changeOrigin: true,
    headers: { "X-Ahoy-Actor": actor },
  },
};
