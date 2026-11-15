// New sign-up alert. Called by the database (trigger on tt_companies insert, via pg_net) with { company_id }.
// Deploy with verify_jwt = false: the database call carries no login. Safe because the function only ever
// emails the owner, only for a company created in the last 30 minutes, and only once per company
// (marker row "signup:<company id>" in tt_billing_events).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import { sendAlert, signupAlert } from "../_shared/tt_alerts.ts";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  let companyId = "";
  try {
    companyId = String((await req.json())?.company_id || "");
  } catch { /* bad body */ }
  if (!/^[0-9a-f-]{36}$/i.test(companyId)) return json(400, { error: "Bad request" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: co } = await db.from("tt_companies").select("id, name, created_at").eq("id", companyId).maybeSingle();
  if (!co || Date.now() - new Date(co.created_at).getTime() > 30 * 60 * 1000) return json(200, { result: "ignored" });

  // Once only: the insert fails if the marker already exists.
  const { error: dup } = await db.from("tt_billing_events").insert({
    event_id: `signup:${companyId}`, event_type: "tt.signup", company_id: companyId,
  });
  if (dup) return json(200, { result: "duplicate" });

  // The member row is written in the same transaction as the company, so it's there by now.
  const { data: m } = await db.from("tt_members").select("name, email").eq("company_id", companyId)
    .order("created_at").limit(1).maybeSingle();
  const outcome = await sendAlert(signupAlert(co.name, m?.name || "", m?.email || "", co.created_at));
  await db.from("tt_billing_events").update({ processed_at: new Date().toISOString(), error: outcome === "failed" ? "send failed" : null })
    .eq("event_id", `signup:${companyId}`);
  return json(200, { result: outcome });
});
