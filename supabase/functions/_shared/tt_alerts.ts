// Owner alerts for Tool Tracker: new sign-ups and payment events, emailed to the owner via Resend.
// Message building is pure (unit tested); sendAlert does the network call.
//
// Secrets (Supabase dashboard > Edge Functions > Secrets):
//   RESEND_API_KEY  - Resend key with sending access for longline.co.nz. Missing = alerts quietly skipped.
//   TT_ALERT_TO     - where alerts go (owner's personal Gmail). Missing = alerts quietly skipped.
//   TT_ALERT_FROM   - optional, defaults to "Long Line Tool Tracker <alerts@longline.co.nz>".

export type Alert = { subject: string; text: string };

type Obj = Record<string, unknown>;

const money = (cents: unknown, currency: unknown) => {
  const n = typeof cents === "number" ? cents : 0;
  return `${String(currency || "nzd").toUpperCase()} $${(n / 100).toFixed(2)}`;
};

// Which Stripe events are worth an email. Only called for events already confirmed as Tool Tracker
// and matched to a company; returns null for everything else.
export function paymentAlert(event: { type: string; data: { object: Obj } }, companyName: string): Alert | null {
  const o = event.data?.object || {};
  const who = companyName || "Unknown company";
  switch (event.type) {
    case "checkout.session.completed":
      return {
        subject: `Tool Tracker: ${who} took out a paid plan`,
        text: `${who} completed checkout for a Tool Tracker plan (${money(o.amount_total, o.currency)} first charge).`,
      };
    case "invoice.paid": {
      if (!o.amount_paid) return null; // NZ$0 trial invoices aren't news
      if (o.billing_reason === "subscription_create") return null; // already covered by checkout email
      return {
        subject: `Tool Tracker: payment from ${who}`,
        text: `${who} paid ${money(o.amount_paid, o.currency)} (renewal or plan change).`,
      };
    }
    case "invoice.payment_failed":
      return {
        subject: `Tool Tracker: payment FAILED for ${who}`,
        text: `A payment of ${money(o.amount_due, o.currency)} from ${who} failed. Stripe will retry; their plan shows as past due until it's paid.`,
      };
    case "customer.subscription.deleted":
      return {
        subject: `Tool Tracker: ${who} cancelled`,
        text: `${who}'s Tool Tracker subscription has ended. They drop back to the free plan.`,
      };
    default:
      return null;
  }
}

export function signupAlert(companyName: string, memberName: string, email: string, createdAt: string): Alert {
  const who = companyName || "New company";
  return {
    subject: `Tool Tracker: new sign-up – ${who}`,
    text: [
      `${who} just signed up to Tool Tracker.`,
      `Person: ${memberName || "(no name)"}${email ? ` <${email}>` : ""}`,
      `When: ${new Date(createdAt).toLocaleString("en-NZ", { timeZone: "Pacific/Auckland" })}`,
    ].join("\n"),
  };
}

export async function sendAlert(alert: Alert): Promise<"sent" | "skipped" | "failed"> {
  const key = Deno.env.get("RESEND_API_KEY") || "";
  const to = Deno.env.get("TT_ALERT_TO") || "";
  if (!key || !to) return "skipped";
  const from = Deno.env.get("TT_ALERT_FROM") || "Long Line Tool Tracker <alerts@longline.co.nz>";
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: to.split(",").map((s) => s.trim()), subject: alert.subject, text: alert.text }),
    });
    if (!r.ok) console.error("alert send failed", r.status, await r.text());
    return r.ok ? "sent" : "failed";
  } catch (e) {
    console.error("alert send error", e);
    return "failed";
  }
}
