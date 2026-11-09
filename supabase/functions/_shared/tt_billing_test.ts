// deno test supabase/functions/_shared/tt_billing_test.ts
import nodeAssert from "node:assert/strict";
const assert = (v: unknown) => nodeAssert.ok(v);
const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepEqual(a, b);
const assertThrows = (f: () => unknown) => nodeAssert.throws(f);
const assertRejects = (f: () => Promise<unknown>) => nodeAssert.rejects(f);
import {
  checkoutLineKeys, handleEvent, mapStatus, signForTest, stripeForm, subscriptionToRow, verifyStripeSignature,
  type StripeSubscription, type WebhookDeps,
} from "./tt_billing.ts";

const CO_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CO_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function sub(over: Partial<StripeSubscription> & { keys?: [string, number][] } = {}): StripeSubscription {
  const keys = over.keys || [["tt_personal_plus_month", 1]];
  return {
    id: "sub_1", customer: "cus_A", status: "active", cancel_at_period_end: false, metadata: { company_id: CO_A },
    items: { data: keys.map(([k, q]) => ({ quantity: q, current_period_end: 1800000000, price: { lookup_key: k } })) },
    ...over,
  };
}

function fakeDeps(subs: Record<string, StripeSubscription>, stored: Record<string, { customer?: string; sub?: string; status: string }>) {
  const updates: [string, Record<string, unknown>][] = [];
  const cancelled: string[] = [];
  const deps: WebhookDeps = {
    getSubscription: async (id) => { if (!subs[id]) throw new Error("no such sub"); return subs[id]; },
    companyForCustomer: async (c) => Object.entries(stored).find(([, v]) => v.customer === c)?.[0] || null,
    storedSubscription: async (co) => stored[co] ? { provider_subscription_id: stored[co].sub || null, status: stored[co].status } : null,
    companyExists: async (co) => co in stored,
    updateSubscription: async (co, row) => { updates.push([co, row]); },
    cancelSubscription: async (id) => { cancelled.push(id); },
  };
  return { deps, updates, cancelled };
}

const ev = (type: string, object: Record<string, unknown>) => ({ id: "evt_1", type, data: { object } });

Deno.test("signature: valid, wrong secret, tampered, stale, missing", async () => {
  const body = '{"id":"evt_1"}';
  const header = await signForTest(body, "whsec_test");
  assert(await verifyStripeSignature(body, header, "whsec_test"));
  assert(!(await verifyStripeSignature(body, header, "whsec_other")));
  assert(!(await verifyStripeSignature(body + " ", header, "whsec_test")));
  const old = await signForTest(body, "whsec_test", Math.floor(Date.now() / 1000) - 3600);
  assert(!(await verifyStripeSignature(body, old, "whsec_test")));
  assert(!(await verifyStripeSignature(body, null, "whsec_test")));
  assert(!(await verifyStripeSignature(body, "t=abc,v1=", "whsec_test")));
});

Deno.test("checkout lines per plan", () => {
  assertEquals(checkoutLineKeys("personal_plus_year", 0), [{ key: "tt_personal_plus_year", quantity: 1 }]);
  assertEquals(checkoutLineKeys("crew_month", 3), [{ key: "tt_crew_month", quantity: 1 }, { key: "tt_crew_extra_seat_month", quantity: 3 }]);
  assertEquals(checkoutLineKeys("crew_month", 0).length, 1);
  assertThrows(() => checkoutLineKeys("crew_month", -1));
  assertThrows(() => checkoutLineKeys("crew_month", 9999));
  assertThrows(() => checkoutLineKeys("free_lunch", 0));
});

Deno.test("status mapping", () => {
  assertEquals(mapStatus("trialing"), "active");
  assertEquals(mapStatus("past_due"), "past_due");
  assertEquals(mapStatus("unpaid"), "canceled");
  assertEquals(mapStatus("canceled"), "canceled");
  assertEquals(mapStatus("incomplete"), null);
});

Deno.test("row: personal plus and crew seats, period end from items", () => {
  const p = subscriptionToRow(sub())!;
  assertEquals([p.plan, p.status, p.seat_limit, p.price_lookup_key], ["personal", "active", 1, "tt_personal_plus_month"]);
  assertEquals(p.current_period_end, new Date(1800000000 * 1000).toISOString());
  const c = subscriptionToRow(sub({ keys: [["tt_crew_month", 1], ["tt_crew_extra_seat_month", 4]] }))!;
  assertEquals([c.plan, c.seat_limit, c.extra_seats], ["crew", 9, 4]);
  assertEquals(subscriptionToRow(sub({ keys: [["siteday_solo", 1]] })), null);
  assertEquals(subscriptionToRow(sub({ status: "incomplete" })), null);
});

Deno.test("form encoding with arrays and nested objects", () => {
  const f = stripeForm({ mode: "subscription", line_items: [{ price: "price_1", quantity: 2 }], metadata: { company_id: "x" }, skip: undefined });
  assertEquals(f.get("line_items[0][price]"), "price_1");
  assertEquals(f.get("line_items[0][quantity]"), "2");
  assertEquals(f.get("metadata[company_id]"), "x");
  assert(!f.has("skip"));
});

Deno.test("checkout completed -> company upgraded", async () => {
  const { deps, updates } = fakeDeps({ sub_1: sub() }, { [CO_A]: { status: "trial" } });
  const r = await handleEvent(ev("checkout.session.completed", { mode: "subscription", subscription: "sub_1", client_reference_id: CO_A }), deps);
  assertEquals(r.result, "updated: personal active");
  assertEquals(updates[0][0], CO_A);
  assertEquals(updates[0][1].provider_customer_id, "cus_A");
});

Deno.test("out-of-order: stale 'updated' event still applies Stripe's current state", async () => {
  const { deps, updates } = fakeDeps({ sub_1: sub({ status: "canceled" }) }, { [CO_A]: { customer: "cus_A", sub: "sub_1", status: "active" } });
  await handleEvent(ev("customer.subscription.updated", { id: "sub_1", status: "active" }), deps);
  assertEquals(updates[0][1].status, "canceled");
});

Deno.test("Site-Day subscription on the same account is ignored", async () => {
  const { deps, updates } = fakeDeps({ sub_9: sub({ id: "sub_9", keys: [["siteday_solo", 1]] }) }, { [CO_A]: { status: "trial" } });
  const r = await handleEvent(ev("customer.subscription.updated", { id: "sub_9" }), deps);
  assert(r.result.startsWith("ignored"));
  assertEquals(updates.length, 0);
});

Deno.test("one company's customer can't upgrade another company", async () => {
  const s = sub({ customer: "cus_A", metadata: { company_id: CO_B } });
  const { deps, updates } = fakeDeps({ sub_1: s }, { [CO_A]: { customer: "cus_A", status: "trial" }, [CO_B]: { status: "trial" } });
  const r = await handleEvent(ev("customer.subscription.created", { id: "sub_1" }), deps);
  assertEquals(r.result, "ignored: customer belongs to another company");
  assertEquals(updates.length, 0);
});

Deno.test("unknown company is ignored", async () => {
  const { deps, updates } = fakeDeps({ sub_1: sub({ metadata: {} }) }, {});
  const r = await handleEvent(ev("customer.subscription.created", { id: "sub_1" }), deps);
  assertEquals(r.result, "ignored: company not found");
  assertEquals(updates.length, 0);
});

Deno.test("upgrade personal plus -> crew: crew takes over, old sub cancelled; old sub's cancel event ignored", async () => {
  const crew = sub({ id: "sub_2", keys: [["tt_crew_month", 1]] });
  const oldCancelled = sub({ id: "sub_1", status: "canceled" });
  const stored = { [CO_A]: { customer: "cus_A", sub: "sub_1", status: "active" } };
  const { deps, updates, cancelled } = fakeDeps({ sub_2: crew, sub_1: oldCancelled }, stored);
  const r = await handleEvent(ev("checkout.session.completed", { mode: "subscription", subscription: "sub_2", client_reference_id: CO_A }), deps);
  assertEquals(r.result, "updated: crew active (replaced sub_1)");
  assertEquals(cancelled, ["sub_1"]);
  assertEquals(updates[0][1].seat_limit, 5);
  stored[CO_A].sub = "sub_2";
  const r2 = await handleEvent(ev("customer.subscription.deleted", { id: "sub_1" }), deps);
  assertEquals(r2.result, "ignored: older subscription");
  assertEquals(updates.length, 1);
});

Deno.test("payment failed -> past_due via fresh subscription; cancel -> canceled", async () => {
  const { deps, updates } = fakeDeps({ sub_1: sub({ status: "past_due" }) }, { [CO_A]: { customer: "cus_A", sub: "sub_1", status: "active" } });
  await handleEvent(ev("invoice.payment_failed", { subscription: "sub_1" }), deps);
  assertEquals(updates[0][1].status, "past_due");
  // newer API shape: subscription under parent.subscription_details
  await handleEvent(ev("invoice.paid", { parent: { subscription_details: { subscription: "sub_1" } } }), deps);
  assertEquals(updates.length, 2);
});

Deno.test("other events ignored; Stripe errors bubble up (so Stripe retries)", async () => {
  const { deps } = fakeDeps({}, { [CO_A]: { status: "trial" } });
  assertEquals((await handleEvent(ev("charge.refunded", {}), deps)).result, "ignored: charge.refunded");
  await assertRejects(() => handleEvent(ev("customer.subscription.updated", { id: "sub_missing" }), deps));
});
