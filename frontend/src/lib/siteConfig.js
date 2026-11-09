// One place for every address the app uses, ready for a single brand domain.
//
// Today (no domain yet) the defaults below are used.
// When the domain is bought, set REACT_APP_BRAND_DOMAIN (e.g. "longline.co.nz") in the hosting settings and
// every app address switches to its subdomain automatically:
//   tools.<domain>, siteday.<domain>, timesheets.<domain>, fitout.<domain>, <domain> (launcher)
// Any single address can still be overridden with its own REACT_APP_..._URL variable.

const env = (name) => (process.env[name] || "").trim();
const BRAND_DOMAIN = env("REACT_APP_BRAND_DOMAIN").replace(/^https?:\/\//, "").replace(/\/+$/, "");

const fromDomain = (subdomain) => {
  if (!BRAND_DOMAIN) return "";
  return subdomain ? `https://${subdomain}.${BRAND_DOMAIN}` : `https://${BRAND_DOMAIN}`;
};

const pick = (override, subdomain, fallback) => env(override) || fromDomain(subdomain) || fallback;

export const brandDomain = BRAND_DOMAIN;

export const appUrls = {
  // This app. Used for sign-up confirmation, invite and password-reset links.
  toolTracker: pick("REACT_APP_SITE_URL", "tools", typeof window !== "undefined" ? window.location.origin : ""),
  launcher: pick("REACT_APP_LONG_LINE_SUITE_LAUNCHER_URL", "", "https://long-line-suite-launcher.vercel.app"),
  siteDay: pick("REACT_APP_LONG_LINE_DIARY_URL", "siteday", "https://lld-cody.vercel.app"),
  timesheets: pick("REACT_APP_TIMESHEET_MANAGER_URL", "timesheets", "https://timesheet-manager-two.vercel.app"),
  fitout: pick("REACT_APP_FITOUTOS_URL", "fitout", "https://fitout-os-project.vercel.app"),
};

export const appLink = (key, path = "") => `${appUrls[key] || ""}${path}`;

export const supabaseConfig = {
  url: env("REACT_APP_SUPABASE_URL"),
  publishableKey: env("REACT_APP_SUPABASE_PUBLISHABLE_KEY"),
};

// Supabase is used whenever its settings are present; otherwise the old FastAPI server (REACT_APP_BACKEND_URL).
export const useSupabase = Boolean(supabaseConfig.url && supabaseConfig.publishableKey);
