import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { CreditCard, ExternalLink } from "lucide-react";

// Prices shown here are for display; Stripe holds the real prices (looked up by tt_ lookup keys).
export const PLAN_PRICES = {
  personal_plus_month: "NZ$4.99 / month",
  personal_plus_year: "NZ$49 / year",
  crew_month: "NZ$49 / month incl. 5 users",
  crew_extra_seat: "NZ$8 / month per extra user",
};
export const FREE_TOOL_LIMIT = 25;

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-NZ", { day: "numeric", month: "short", year: "numeric" }) : "");

export function describePlan(sub = {}, now = new Date()) {
  const trialLive = sub.status === "trial" && new Date(sub.trial_ends_at) > now;
  const paid = ["active", "past_due", "complimentary", "beta"].includes(sub.status);
  if (sub.plan === "crew") {
    if (paid) return { name: "Crew", detail: `${sub.seat_limit} users`, paid: true };
    if (trialLive) return { name: "Crew trial", detail: `ends ${fmtDate(sub.trial_ends_at)}`, paid: false, trial: true };
    return { name: "Crew (ended)", detail: "Read and export only until a plan is chosen", paid: false, locked: true };
  }
  if (paid) return { name: "Personal Plus", detail: "Unlimited tools", paid: true };
  if (trialLive) return { name: "Free trial", detail: `Unlimited tools until ${fmtDate(sub.trial_ends_at)}, then free up to ${FREE_TOOL_LIMIT} tools`, paid: false, trial: true };
  return { name: "Free", detail: `Up to ${FREE_TOOL_LIMIT} tools, 1 login`, paid: false };
}

const cardClass = "rounded-[1.35rem] border border-slate-200 bg-white text-slate-950 shadow-[0_18px_46px_rgba(15,23,42,0.08)] dark:border-[rgba(245,190,80,0.24)] dark:bg-[radial-gradient(circle_at_top_left,rgba(245,190,80,0.10),transparent_38%),linear-gradient(135deg,#020617,#0f172a_64%,#111827)] dark:text-slate-50 dark:shadow-[0_20px_54px_rgba(15,23,42,0.16)]";
const goldBtn = "bg-[hsl(38,92%,50%)] text-black hover:bg-[hsl(38,92%,45%)] rounded-none uppercase text-xs font-bold tracking-wider h-10";
const plainBtn = "rounded-none uppercase text-xs font-bold tracking-wider h-10";

export default function BillingCard({ initial }) {
  const [sub, setSub] = useState(initial || {});
  const [busy, setBusy] = useState("");
  const [extraSeats, setExtraSeats] = useState(0);

  // Coming back from Stripe: the webhook can take a few seconds, so re-read the plan a few times.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("billing");
    if (!outcome) return;
    if (outcome === "success") toast.success("Payment received - updating your plan");
    if (outcome === "cancelled") toast("Checkout cancelled - nothing was charged");
    window.history.replaceState({}, "", window.location.pathname);
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      try {
        const res = await api.post("/billing/refresh");
        setSub(res.data.subscription || {});
        if (res.data.subscription && describePlan(res.data.subscription).paid) clearInterval(timer);
      } catch { /* keep trying */ }
      if (tries >= 6) clearInterval(timer);
    }, outcome === "success" ? 2500 : 60000);
    return () => clearInterval(timer);
  }, []);

  const plan = describePlan(sub);
  const hasBilling = Boolean(sub.provider_customer_id);

  const go = async (path, body, key) => {
    setBusy(key);
    try {
      const res = await api.post(path, body);
      if (res.data?.url) window.location.assign(res.data.url);
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message || "Something went wrong");
    } finally {
      setBusy("");
    }
  };

  return (
    <Card className={cardClass} data-testid="billing-card">
      <CardHeader className="pb-2">
        <CardTitle className="font-['Barlow_Condensed'] text-lg uppercase tracking-tight flex items-center gap-2">
          <CreditCard size={16} /> Plan &amp; billing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-xl font-black" data-testid="billing-plan-name">{plan.name}</p>
          <p className="text-sm text-slate-600 dark:text-slate-300" data-testid="billing-plan-detail">{plan.detail}</p>
          {sub.status === "past_due" && (
            <p className="mt-2 text-sm font-semibold text-rose-600" data-testid="billing-past-due">
              Your last payment didn't go through. Update your card in Manage billing to keep everything running.
            </p>
          )}
          {plan.paid && sub.cancel_at_period_end && (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Cancels on {fmtDate(sub.current_period_end)}. Your records stay.</p>
          )}
          {plan.paid && !sub.cancel_at_period_end && sub.current_period_end && (
            <p className="mt-1 text-xs text-slate-500">Renews {fmtDate(sub.current_period_end)}</p>
          )}
        </div>

        {hasBilling && (
          <Button variant="outline" className={plainBtn} disabled={!!busy} onClick={() => go("/billing/portal", {}, "portal")} data-testid="billing-manage-btn">
            <ExternalLink size={14} className="mr-2" /> {busy === "portal" ? "Opening..." : "Manage billing"}
          </Button>
        )}

        {!(plan.paid && sub.plan === "crew") && (
          <div className="grid gap-4 md:grid-cols-2">
            {!(plan.paid && sub.plan === "personal") && sub.plan !== "crew" && (
              <div className="border border-slate-200 dark:border-white/15 p-4 space-y-3" data-testid="billing-option-personal">
                <p className="font-bold uppercase text-xs tracking-wider">Personal Plus</p>
                <p className="text-sm">Unlimited tools for one person. Keeps all your records.</p>
                <div className="flex flex-wrap gap-2">
                  <Button className={goldBtn} disabled={!!busy} onClick={() => go("/billing/checkout", { plan: "personal_plus_month" }, "pm")} data-testid="billing-personal-month">
                    {busy === "pm" ? "Opening..." : PLAN_PRICES.personal_plus_month}
                  </Button>
                  <Button variant="outline" className={plainBtn} disabled={!!busy} onClick={() => go("/billing/checkout", { plan: "personal_plus_year" }, "py")} data-testid="billing-personal-year">
                    {busy === "py" ? "Opening..." : PLAN_PRICES.personal_plus_year}
                  </Button>
                </div>
              </div>
            )}
            <div className="border border-slate-200 dark:border-white/15 p-4 space-y-3" data-testid="billing-option-crew">
              <p className="font-bold uppercase text-xs tracking-wider">Crew</p>
              <p className="text-sm">For a company: {PLAN_PRICES.crew_month}, {PLAN_PRICES.crew_extra_seat}.</p>
              <div className="flex items-end gap-2">
                <div>
                  <Label className="text-xs uppercase tracking-wider font-bold">Extra users</Label>
                  <Input type="number" min={0} max={200} value={extraSeats} className="mt-1 w-24 rounded-xl"
                    onChange={(e) => setExtraSeats(Math.max(0, Math.min(200, parseInt(e.target.value || "0", 10) || 0)))} data-testid="billing-extra-seats" />
                </div>
                <Button className={goldBtn} disabled={!!busy} onClick={() => go("/billing/checkout", { plan: "crew_month", extra_seats: extraSeats }, "crew")} data-testid="billing-crew">
                  {busy === "crew" ? "Opening..." : "Choose Crew"}
                </Button>
              </div>
              {plan.paid && sub.plan === "personal" && (
                <p className="text-xs text-slate-500">Switching to Crew ends Personal Plus with a credit for the unused time.</p>
              )}
            </div>
          </div>
        )}
        <p className="text-xs text-slate-500">Payments are handled by Stripe. Card details never touch this app.</p>
      </CardContent>
    </Card>
  );
}
