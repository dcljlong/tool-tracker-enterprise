// Tool tracker team management: add people with a password, invite by email, or reset a team member's password.
// Runs with the service role, so every request is checked here: the caller must be an admin (or a site manager
// adding a worker) of the company, the company must be paid up or in trial, and the plan's seat limit applies.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

// The live addresses are built in; TT_ALLOWED_ORIGINS (comma-separated) can add more without a code change.
const LIVE_ORIGINS = ["https://tools.longline.co.nz", "https://tool-tracker-enterprise.vercel.app"];
const ALLOWED_ORIGINS = [...LIVE_ORIGINS, ...(Deno.env.get("TT_ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean)];
// Vercel previews of this project (same rule as tt-billing), so testing still works once the real address is locked in.
const PREVIEW_ORIGIN = /^https:\/\/tool-tracker-enterprise-[a-z0-9-]+-dcljlongs-projects\.vercel\.app$/;

function cors(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const ok = !ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(origin) || PREVIEW_ORIGIN.test(origin);
  const allow = ok ? origin || "*" : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

const ROLES = new Set(["admin", "site_manager", "worker"]);

Deno.serve(async (req) => {
  const headers = { ...cors(req), "Content-Type": "application/json" };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { detail: "Method not allowed" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // Who is calling?
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who, error: whoErr } = await service.auth.getUser(jwt);
  if (whoErr || !who?.user) return reply(401, { detail: "Not signed in" });
  const caller = who.user;

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return reply(400, { detail: "Bad request" }); }
  const companyId = String(body.company_id || "");
  const action = String(body.action || "");
  if (!companyId) return reply(400, { detail: "Missing company" });

  const { data: me } = await service.from("tt_members").select("role, is_active")
    .eq("company_id", companyId).eq("user_id", caller.id).maybeSingle();
  if (!me?.is_active || !["admin", "site_manager"].includes(me.role)) return reply(403, { detail: "Only an admin can manage the team" });

  const { data: sub } = await service.from("tt_subscriptions").select("status, trial_ends_at, seat_limit, plan")
    .eq("company_id", companyId).maybeSingle();
  const paidUp = sub && (["active", "past_due", "complimentary", "beta"].includes(sub.status)
    || (sub.status === "trial" && new Date(sub.trial_ends_at) > new Date()));
  if (!paidUp) return reply(402, { detail: "Your trial or subscription has ended. Choose a plan to add people." });

  if (action === "set_password") {
    if (me.role !== "admin") return reply(403, { detail: "Only an admin can reset passwords" });
    const target = String(body.user_id || "");
    const pw = String(body.new_password || "");
    if (pw.length < 8) return reply(400, { detail: "Password must be at least 8 characters" });
    if (target === caller.id) return reply(400, { detail: "Use change password for your own account" });
    const { data: memberships } = await service.from("tt_members").select("company_id").eq("user_id", target);
    if (!memberships?.some((m) => m.company_id === companyId)) return reply(404, { detail: "Not in your team" });
    if (memberships.some((m) => m.company_id !== companyId)) {
      return reply(400, { detail: "This person also uses other workspaces - ask them to use Forgot password instead" });
    }
    const { error } = await service.auth.admin.updateUserById(target, { password: pw });
    if (error) return reply(400, { detail: error.message });
    return reply(200, { status: "password_reset", user_id: target });
  }

  if (action !== "create" && action !== "invite") return reply(400, { detail: "Unknown action" });

  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const role = String(body.role || "worker");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply(400, { detail: "Enter a valid email" });
  if (!name) return reply(400, { detail: "Enter a name" });
  if (!ROLES.has(role)) return reply(400, { detail: "Invalid role" });
  if (me.role !== "admin" && role !== "worker") return reply(403, { detail: "Site managers can only add workers" });

  const { count } = await service.from("tt_members").select("user_id", { count: "exact", head: true })
    .eq("company_id", companyId).eq("is_active", true);
  if ((count || 0) >= (sub?.seat_limit || 1)) {
    return reply(402, { detail: `Your plan includes ${sub?.seat_limit || 1} user${(sub?.seat_limit || 1) === 1 ? "" : "s"}. Upgrade to add more people.` });
  }

  // Existing account? Just add them to this company.
  const { data: existingId } = await service.rpc("tt_user_id_by_email", { p_email: email });
  let userId = existingId as string | null;
  let invited = false;

  if (!userId && action === "create") {
    const pw = String(body.password || "");
    if (pw.length < 8) return reply(400, { detail: "Password must be at least 8 characters" });
    const { data, error } = await service.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { name } });
    if (error) return reply(400, { detail: error.message });
    userId = data.user.id;
  } else if (!userId) {
    const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
      data: { name },
      redirectTo: String(body.redirect_to || "") || undefined,
    });
    if (error) return reply(400, { detail: error.message });
    userId = data.user.id;
    invited = true;
  }

  const { data: already } = await service.from("tt_members").select("is_active")
    .eq("company_id", companyId).eq("user_id", userId).maybeSingle();
  if (already?.is_active) return reply(400, { detail: "Already in your team" });

  const row = { company_id: companyId, user_id: userId, name, role, email, is_active: true };
  const { error: memberErr } = already
    ? await service.from("tt_members").update({ name, role, email, is_active: true }).eq("company_id", companyId).eq("user_id", userId)
    : await service.from("tt_members").insert(row);
  if (memberErr) return reply(400, { detail: memberErr.message });

  return reply(200, { id: userId, user_id: userId, email, name, role, company_id: companyId, invited, status: invited ? "invite_sent" : "added" });
});
