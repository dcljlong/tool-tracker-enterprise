// Shared tool tracker billing logic (pure - no network, no database), so it can be unit tested.
//
// Stripe prices are found by lookup key, so prices can be changed in the Stripe dashboard without a code change.
// Every tool tracker price's lookup key starts with "tt_"; anything else on the account (Site-Day) is ignored.

export const PRICE_KEYS = {
  personal_plus_month: "tt_personal_plus_month",
  personal_plus_year: "tt_personal_plus_year",
  crew_month: "tt_crew_month",
  crew_extra_seat_month: "tt_crew_extra_seat_month",
} as const;

export const CREW_INCLUDED_SEATS = 5;
export const MAX_EXTRA_SEATS = 200;

export type CheckoutPlan = "personal_plus_month" | "personal_plus_year" | "crew_month";

export function checkoutLineKeys(plan: string, extraSeats: number): { key: string; quantity: number }[] {
  if (plan === "personal_plus_month" || plan === "personal_plus_year") return [{ key: PRICE_KEYS[plan], quantity: 1 }];
  if (plan === "crew_month") {
    const extra = Math.trunc(Number(extraSeats) || 0);
    if (extra < 0 || extra > MAX_EXTRA_SEATS) throw new Error(`Extra users must be between 0 and ${MAX_EXTRA_SEATS}`);
    const lines: { key: string; quantity: number }[] = [{ key: PRICE_KEYS.crew_month, quantity: 1 }];
    if (extra > 0) lines.push({ key: PRICE_KEYS.crew_extra_seat_month, quantity: extra });
    return lines;
  }
  throw new Error("Unknown plan");
}

// Stripe subscription status -> tt_subscriptions.status
export function mapStatus(stripeStatus: string): string | null {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due"; // grace: keeps working while Stripe retries the card
    case "unpaid":
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return "canceled";
    case "incomplete":
      return null; // first payment not through yet - leave the account as it is
    default:
      return null;
  }
}

type StripeItem = { quantity?: number; current_period_end?: number; price?: { lookup_key?: string | null } };
export type StripeSubscription = {
  id: string;
  customer: string | { id: string };
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data?: StripeItem[] };
};

export function isToolTrackerSubscription(sub: StripeSubscription): boolean {
  return (sub.items?.data || []).some((i) => (i.price?.lookup_key || "").startsWith("tt_"));
}

// What a Stripe subscription means for tt_subscriptions. Returns null when nothing should change.
export function subscriptionToRow(sub: StripeSubscription) {
  const status = mapStatus(sub.status);
  if (!status) return null;
  const items = sub.items?.data || [];
  const keys = items.map((i) => i.price?.lookup_key || "");
  const crew = keys.includes(PRICE_KEYS.crew_month);
  const personal = keys.includes(PRICE_KEYS.personal_plus_month) || keys.includes(PRICE_KEYS.personal_plus_year);
  if (!crew && !personal) return null;
  const extra = crew
    ? items.filter((i) => i.price?.lookup_key === PRICE_KEYS.crew_extra_seat_month).reduce((n, i) => n + (i.quantity || 0), 0)
    : 0;
  // Newer Stripe API versions keep the period end on each item instead of the subscription.
  const periodEnd = sub.current_period_end ?? Math.max(0, ...items.map((i) => i.current_period_end || 0));
  return {
    plan: crew ? "crew" : "personal",
    status,
    seat_limit: crew ? CREW_INCLUDED_SEATS + extra : 1,
    extra_seats: extra,
    price_lookup_key: crew ? PRICE_KEYS.crew_month : keys.find((k) => k.startsWith("tt_personal_plus")) || null,
    provider: "stripe",
    provider_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id,
    provider_subscription_id: sub.id,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    updated_at: new Date().toISOString(),
  };
}

// ---- webhook signature (Stripe-Signature: t=...,v1=...) ----
const enc = new TextEncoder();

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyStripeSignature(payload: string, header: string | null, secret: string,
  toleranceSeconds = 300, nowSeconds = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v || "");
  if (!Number.isFinite(t) || !sigs.length) return false;
  if (Math.abs(nowSeconds - t) > toleranceSeconds) return false;
  const expected = await hmacHex(secret, `${t}.${payload}`);
  return sigs.some((s) => safeEqual(s, expected));
}

export async function signForTest(payload: string, secret: string, t = Math.floor(Date.now() / 1000)): Promise<string> {
  return `t=${t},v1=${await hmacHex(secret, `${t}.${payload}`)}`;
}

// ---- Stripe form encoding (Stripe's API takes application/x-www-form-urlencoded with bracket keys) ----
export function stripeForm(obj: Record<string, unknown>, prefix = "", out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === "object") stripeForm(item as Record<string, unknown>, `${key}[${i}]`, out);
        else out.append(`${key}[${i}]`, String(item));
      });
    } else if (typeof v === "object") stripeForm(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

// ---- webhook event handling (database and Stripe passed in, so it can be tested) ----
export type WebhookDeps = {
  getSubscription(id: string): Promise<StripeSubscription>;
  companyForCustomer(customerId: string): Promise<string | null>;
  storedSubscription(companyId: string): Promise<{ provider_subscription_id: string | null; status: string } | null>;
  companyExists(companyId: string): Promise<boolean>;
  updateSubscription(companyId: string, row: Record<string, unknown>): Promise<void>;
  cancelSubscription(id: string): Promise<void>;
};

type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } };

export async function handleEvent(event: StripeEvent, deps: WebhookDeps): Promise<{ result: string; companyId?: string }> {
  const obj = event.data?.object || {};
  let subId: string | null = null;
  let companyHint: string | null = null;

  if (event.type === "checkout.session.completed") {
    if (obj.mode !== "subscription" || !obj.subscription) return { result: "ignored: not a subscription checkout" };
    subId = typeof obj.subscription === "string" ? obj.subscription : (obj.subscription as { id: string }).id;
    companyHint = (obj.client_reference_id as string) || null;
  } else if (event.type.startsWith("customer.subscription.")) {
    subId = obj.id as string;
  } else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const s = obj.subscription ?? (obj.parent as { subscription_details?: { subscription?: string } })?.subscription_details?.subscription;
    subId = typeof s === "string" ? s : (s as { id?: string })?.id || null;
    if (!subId) return { result: "ignored: invoice without subscription" };
  } else {
    return { result: `ignored: ${event.type}` };
  }

  // Always read the subscription fresh from Stripe, so events arriving out of order can't roll it back.
  const sub = await deps.getSubscription(subId!);
  if (!isToolTrackerSubscription(sub)) return { result: "ignored: not a tool tracker subscription" };

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  let companyId = sub.metadata?.company_id || companyHint || null;
  if (!companyId && customerId) companyId = await deps.companyForCustomer(customerId);
  if (!companyId || !(await deps.companyExists(companyId))) return { result: "ignored: company not found" };

  // A customer id already linked to a company must match (stops one company's payment upgrading another).
  if (customerId) {
    const owner = await deps.companyForCustomer(customerId);
    if (owner && owner !== companyId) return { result: "ignored: customer belongs to another company", companyId };
  }

  const row = subscriptionToRow(sub);
  if (!row) return { result: `no change: subscription ${sub.status}`, companyId };

  // A different subscription from the one on file: a new active one (e.g. Personal Plus -> Crew) takes over
  // and the old one is cancelled with a pro-rata credit; anything else about an old one is ignored.
  const stored = await deps.storedSubscription(companyId);
  const previous = stored?.provider_subscription_id;
  if (previous && previous !== sub.id) {
    if (row.status !== "active") return { result: "ignored: older subscription", companyId };
    await deps.updateSubscription(companyId, row);
    if (["active", "past_due"].includes(stored!.status)) await deps.cancelSubscription(previous);
    return { result: `updated: ${row.plan} ${row.status} (replaced ${previous})`, companyId };
  }

  await deps.updateSubscription(companyId, row);
  return { result: `updated: ${row.plan} ${row.status}`, companyId };
}
