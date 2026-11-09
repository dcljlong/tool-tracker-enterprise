// Stripe -> tool tracker webhook. Deploy with verify_jwt = false (Stripe doesn't send a Supabase login);
// every request is checked against the Stripe signing secret instead.
//
// Secrets (Supabase dashboard > Edge Functions > Secrets):
//   TT_STRIPE_SECRET_KEY      - sk_test_... while testing (separate from Site-Day's keys)
//   TT_STRIPE_WEBHOOK_SECRET  - whsec_... from the Stripe webhook endpoint for this function
//
// Events to send: checkout.session.completed, customer.subscription.created, customer.subscription.updated,
// customer.subscription.deleted, invoice.paid, invoice.payment_failed
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { handleEvent, verifyStripeSignature, type StripeSubscription } from "../_shared/tt_billing.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  const secret = Deno.env.get("TT_STRIPE_WEBHOOK_SECRET") || "";
  const stripeKey = Deno.env.get("TT_STRIPE_SECRET_KEY") || "";
  if (!secret || !stripeKey) return json(500, { error: "Billing not configured" });

  const payload = await req.text();
  if (!(await verifyStripeSignature(payload, req.headers.get("Stripe-Signature"), secret))) {
    return json(400, { error: "Bad signature" });
  }
  const event = JSON.parse(payload);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // Record the event once; a repeat of an event already handled is acknowledged and skipped.
  const { data: seen } = await db.from("tt_billing_events").select("processed_at").eq("event_id", event.id).maybeSingle();
  if (seen?.processed_at) return json(200, { received: true, duplicate: true });
  if (!seen) {
    await db.from("tt_billing_events").insert({ event_id: event.id, event_type: event.type, payload: event });
  }

  const stripe = async (path: string, method = "GET") => {
    const r = await fetch(`https://api.stripe.com/v1/${path}`, {
      method,
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    const body = await r.json();
    if (!r.ok) throw new Error(body?.error?.message || `Stripe ${r.status}`);
    return body;
  };

  try {
    const outcome = await handleEvent(event, {
      getSubscription: (id) => stripe(`subscriptions/${encodeURIComponent(id)}`) as Promise<StripeSubscription>,
      companyForCustomer: async (customerId) => {
        const { data } = await db.from("tt_subscriptions").select("company_id").eq("provider_customer_id", customerId).maybeSingle();
        return data?.company_id || null;
      },
      storedSubscription: async (companyId) => {
        const { data } = await db.from("tt_subscriptions").select("provider_subscription_id, status").eq("company_id", companyId).maybeSingle();
        return data;
      },
      companyExists: async (companyId) => {
        if (!/^[0-9a-f-]{36}$/i.test(companyId)) return false;
        const { data } = await db.from("tt_companies").select("id").eq("id", companyId).maybeSingle();
        return Boolean(data);
      },
      updateSubscription: async (companyId, row) => {
        const { error } = await db.from("tt_subscriptions").update(row).eq("company_id", companyId);
        if (error) throw new Error(error.message);
      },
      cancelSubscription: async (id) => {
        await stripe(`subscriptions/${encodeURIComponent(id)}?prorate=true`, "DELETE");
      },
    });
    await db.from("tt_billing_events").update({
      processed_at: new Date().toISOString(), company_id: outcome.companyId || null, error: null,
    }).eq("event_id", event.id);
    return json(200, { received: true, result: outcome.result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from("tt_billing_events").update({ error: message }).eq("event_id", event.id);
    // 500 makes Stripe retry later.
    return json(500, { error: "Could not process event" });
  }
});
