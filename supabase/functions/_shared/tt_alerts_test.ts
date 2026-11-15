const assert = (c: unknown, m = "assertion failed") => { if (!c) throw new Error(m); };
const assertEquals = (a: unknown, b: unknown) => assert(JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
import { paymentAlert, signupAlert, sendAlert } from "./tt_alerts.ts";

const ev = (type: string, object: Record<string, unknown>) => ({ type, data: { object } });

Deno.test("checkout completed -> paid plan alert with amount", () => {
  const a = paymentAlert(ev("checkout.session.completed", { amount_total: 499, currency: "nzd" }), "Acme");
  assertEquals(a?.subject, "Tool Tracker: Acme took out a paid plan");
  assert(a!.text.includes("NZD $4.99"));
});

Deno.test("zero and first invoices are not emailed", () => {
  assertEquals(paymentAlert(ev("invoice.paid", { amount_paid: 0 }), "Acme"), null);
  assertEquals(paymentAlert(ev("invoice.paid", { amount_paid: 499, billing_reason: "subscription_create" }), "Acme"), null);
});

Deno.test("renewal, failure, cancel alerts", () => {
  assert(paymentAlert(ev("invoice.paid", { amount_paid: 4900, currency: "nzd", billing_reason: "subscription_cycle" }), "Acme")!.text.includes("NZD $49.00"));
  assert(paymentAlert(ev("invoice.payment_failed", { amount_due: 499 }), "Acme")!.subject.includes("FAILED"));
  assert(paymentAlert(ev("customer.subscription.deleted", {}), "Acme")!.subject.includes("cancelled"));
  assertEquals(paymentAlert(ev("customer.subscription.updated", {}), "Acme"), null);
});

Deno.test("signup alert", () => {
  const a = signupAlert("Acme", "Bob", "bob@example.com", "2026-11-15T10:00:00Z");
  assertEquals(a.subject, "Tool Tracker: new sign-up – Acme");
  assert(a.text.includes("Bob <bob@example.com>"));
});

Deno.test("no key -> skipped, no network", async () => {
  Deno.env.delete("RESEND_API_KEY");
  assertEquals(await sendAlert({ subject: "x", text: "y" }), "skipped");
});
