// Tool tracker billing for the signed-in admin: start a Stripe Checkout for a plan, or open the Stripe
// Customer Portal (change card, invoices, cancel). Only company admins can do either.
//
// Secrets: TT_STRIPE_SECRET_KEY (sk_test_... while testing), TT_ALLOWED_ORIGINS (the app's address(es)),
// TT_STRIPE_PORTAL_CONFIG (bpc_... the tool tracker's Customer Portal settings).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { checkoutLineKeys, stripeForm } from "../_shared/tt_billing.ts";

const ALLOWED_ORIGINS = (Deno.env.get("TT_ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
// Vercel previews of this project, used while testing before the real domain exists.
const PREVIEW_ORIGIN = /^https:\/\/tool-tracker-enterprise-[a-z0-9-]+-dcljlongs-projects\.vercel\.app$/;

function originOk(origin: string) {
  return ALLOWED_ORIGINS.includes(origin) || PREVIEW_ORIGIN.test(origin);
}

function cors(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": originOk(origin) ? origin : ALLOWED_ORIGINS[0] || "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

Deno.serve(async (req) => {
  const headers = { ...cors(req), "Content-Type": "application/json" };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { detail: "Method not allowed" });

  const stripeKey = Deno.env.get("TT_STRIPE_SECRET_KEY") || "";
  if (!stripeKey) return reply(503, { detail: "Online payments aren't switched on yet." });
  const origin = req.headers.get("Origin") || "";
  if (!originOk(origin)) return reply(403, { detail: "Unknown app address" });

  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who, error: whoErr } = await service.auth.getUser(jwt);
  if (whoErr || !who?.user) return reply(401, { detail: "Not signed in" });
  const user = who.user;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { detail: "Bad request" }); }
  const companyId = String(body.company_id || "");
  const action = String(body.action || "");

  const { data: me } = await service.from("tt_members").select("role, is_active")
    .eq("company_id", companyId).eq("user_id", user.id).maybeSingle();
  if (!me?.is_active || me.role !== "admin") return reply(403, { detail: "Only an admin can manage billing" });

  const { data: company } = await service.from("tt_companies").select("id, name").eq("id", companyId).single();
  const { data: sub } = await service.from("tt_subscriptions")
    .select("plan, status, provider_customer_id, provider_subscription_id, price_lookup_key").eq("company_id", companyId).single();

  const stripe = async (path: string, params?: Record<string, unknown>, method = params ? "POST" : "GET", idempotencyKey?: string) => {
    const h: Record<string, string> = { Authorization: `Bearer ${stripeKey}` };
    if (params) h["Content-Type"] = "application/x-www-form-urlencoded";
    if (idempotencyKey) h["Idempotency-Key"] = idempotencyKey;
    const r = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers: h, body: params ? stripeForm(params) : undefined });
    const out = await r.json();
    if (!r.ok) throw new Error(out?.error?.message || `Stripe ${r.status}`);
    return out;
  };

  try {
    const returnUrl = `${origin}/settings?billing=`;

    if (action === "portal") {
      if (!sub?.provider_customer_id) return reply(400, { detail: "There's no billing account yet. Choose a plan first." });
      const session = await stripe("billing_portal/sessions", {
        customer: sub.provider_customer_id,
        return_url: `${returnUrl}portal`,
        // The tool tracker's own portal settings (Site-Day may use the account's default ones).
        configuration: Deno.env.get("TT_STRIPE_PORTAL_CONFIG") || undefined,
      });
      return reply(200, { url: session.url });
    }

    if (action !== "checkout") return reply(400, { detail: "Unknown action" });
    const plan = String(body.plan || "");
    let lines;
    try { lines = checkoutLineKeys(plan, Number(body.extra_seats || 0)); } catch (e) { return reply(400, { detail: (e as Error).message }); }

    // Already paying: change the same plan in the portal, not with a second subscription.
    const paying = sub?.provider_subscription_id && ["active", "past_due"].includes(sub.status);
    const samePlan = paying && ((plan === "crew_month" && sub.plan === "crew") || (plan !== "crew_month" && sub.plan === "personal"));
    if (samePlan) return reply(409, { detail: "You're already on this plan. Use Manage billing to change it." });

    const prices = await stripe(`prices?active=true&limit=10&${lines.map((l) => `lookup_keys[]=${encodeURIComponent(l.key)}`).join("&")}`);
    const byKey = new Map((prices.data || []).map((p: { lookup_key: string; id: string }) => [p.lookup_key, p.id]));
    const missing = lines.filter((l) => !byKey.has(l.key));
    if (missing.length) return reply(503, { detail: "That plan isn't set up for payments yet." });

    let customerId = sub?.provider_customer_id;
    if (!customerId) {
      const customer = await stripe("customers", {
        email: user.email, name: company?.name, metadata: { company_id: companyId, app: "tool-tracker" },
      }, "POST", `tt-customer-${companyId}`);
      customerId = customer.id;
      const { error } = await service.from("tt_subscriptions").update({ provider: "stripe", provider_customer_id: customerId }).eq("company_id", companyId);
      if (error) throw new Error(error.message);
    }

    const session = await stripe("checkout/sessions", {
      mode: "subscription",
      customer: customerId,
      client_reference_id: companyId,
      line_items: lines.map((l) => ({ price: byKey.get(l.key), quantity: l.quantity })),
      subscription_data: { metadata: { company_id: companyId, app: "tool-tracker" } },
      metadata: { company_id: companyId, app: "tool-tracker" },
      allow_promotion_codes: true,
      success_url: `${returnUrl}success`,
      cancel_url: `${returnUrl}cancelled`,
    });
    return reply(200, { url: session.url });
  } catch (e) {
    console.error("tt-billing", (e as Error).message);
    return reply(502, { detail: "Couldn't reach the payment provider. Try again shortly." });
  }
});
