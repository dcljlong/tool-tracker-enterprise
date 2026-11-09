// Supabase version of the old FastAPI routes.
// The screens still call api.get("/tools") etc.; this file answers those calls straight from Supabase,
// returning the same shapes the old server did, so the pages didn't need rewriting.
// Company separation and permissions are enforced by the database (RLS), not here.

import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { appLink, supabaseConfig } from "./siteConfig";

export const supabase = createClient(supabaseConfig.url || "http://localhost", supabaseConfig.publishableKey || "missing", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
});

const BUCKET = "tool-tracker";
const COMPANY_KEY = "tt_company_id";
const PHOTO_URL_SECONDS = 60 * 60;

// ---------------------------------------------------------------------------
// Errors in the same shape axios gave the pages: err.response.status / err.response.data.detail
// ---------------------------------------------------------------------------
const fail = (status, detail) => {
  const err = new Error(detail);
  err.response = { status, data: { detail } };
  throw err;
};

const friendly = (message = "") => {
  if (/row-level security|permission denied/i.test(message)) return "You don't have permission to do that (or the trial has ended - see Settings, Plan & billing).";
  if (/duplicate key.*asset/i.test(message)) return "Asset ID already exists";
  if (/duplicate key.*categor/i.test(message)) return "Category already exists";
  if (/borrower_id_fkey/i.test(message)) return "This person has borrowed tools before, so they stay on the list to keep your records. You can still edit their details.";
  if (/tt_borrowers.*name|name.*check constraint/i.test(message)) return "Enter a name (up to 120 characters).";
  return message || "Something went wrong";
};

const check = ({ data, error }, status = 400) => {
  if (error) fail(error.code === "PGRST116" ? 404 : status, friendly(error.message));
  return data;
};

// ---------------------------------------------------------------------------
// Session and current company
// ---------------------------------------------------------------------------
let cachedContext = null;

async function sessionUser() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) fail(401, "Not authenticated");
  return data.session.user;
}

export function clearContext() {
  cachedContext = null;
}

export function setCurrentCompany(companyId) {
  try { localStorage.setItem(COMPANY_KEY, companyId); } catch { /* storage blocked */ }
  cachedContext = null;
}

async function context({ create = true } = {}) {
  const user = await sessionUser();
  if (cachedContext && cachedContext.user.id === user.id) return cachedContext;

  let members = check(await supabase.from("tt_members")
    .select("company_id, name, role, email, is_active, tt_companies(id, name, brand, tt_subscriptions(plan, status, trial_ends_at, seat_limit, extra_seats, price_lookup_key, provider_customer_id, current_period_end, cancel_at_period_end))")
    .eq("user_id", user.id).eq("is_active", true));

  if (!members.length && create) {
    // First sign-in after sign-up (or an email-confirmed sign-up): make their workspace.
    const meta = user.user_metadata || {};
    check(await supabase.rpc("tt_create_company", {
      p_name: meta.company_name || "My tools",
      p_member_name: meta.name || (user.email || "").split("@")[0],
      p_brand: meta.brand || "long_line",
    }));
    return context({ create: false });
  }
  if (!members.length) fail(403, "No workspace for this account");

  let stored = "";
  try { stored = localStorage.getItem(COMPANY_KEY) || ""; } catch { /* ignore */ }
  const me = members.find((m) => m.company_id === stored) || members[0];
  const company = me.tt_companies || {};
  const sub = (Array.isArray(company.tt_subscriptions) ? company.tt_subscriptions[0] : company.tt_subscriptions) || {};
  cachedContext = { user, me, companyId: me.company_id, company, subscription: sub, workspaces: members };
  return cachedContext;
}

function subscriptionPaid(sub) {
  if (!sub || !sub.status) return false;
  if (["active", "past_due", "complimentary", "beta"].includes(sub.status)) return true;
  return sub.status === "trial" && new Date(sub.trial_ends_at) > new Date();
}

// Personal accounts never lock: unpaid they drop to the free tier (25 tools, enforced in the database).
function subscriptionActive(sub) {
  return subscriptionPaid(sub) || sub?.plan === "personal";
}

// What the banner's date badge shows: trial end, cancel date or renewal date.
function accessExpiry(sub = {}) {
  if (sub.status === "trial" && sub.trial_ends_at) return { access_expires_at: sub.trial_ends_at, access_expiry_kind: "trial_ends" };
  if (sub.current_period_end && ["active", "past_due"].includes(sub.status)) {
    return { access_expires_at: sub.current_period_end, access_expiry_kind: sub.cancel_at_period_end ? "cancels" : "renews" };
  }
  return { access_expires_at: null, access_expiry_kind: subscriptionPaid(sub) ? "none" : "free" };
}

function meShape(ctx) {
  const { user, me, company, subscription, workspaces } = ctx;
  return {
    id: user.id,
    user_id: user.id,
    email: user.email,
    name: me.name,
    role: me.role,
    is_active: me.is_active,
    company_id: ctx.companyId,
    company_name: company.name,
    brand: company.brand,
    force_password_change: false,
    email_verified: Boolean(user.email_confirmed_at),
    subscription,
    workspace_access: {
      access_status: subscriptionActive(subscription) ? "active" : "expired",
      access_type: subscription.plan === "personal" && !subscriptionPaid(subscription) ? "free" : subscription.status,
      plan: subscription.plan,
      trial_ends_at: subscription.trial_ends_at,
      ...accessExpiry(subscription),
    },
    workspaces: workspaces.map((w) => ({ company_id: w.company_id, company_name: w.tt_companies?.name, role: w.role })),
  };
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------
const TOOL_SELECT = "*, current:tt_checkouts!tt_tools_current_checkout_fkey(id, holder_name, holder_user_id, borrower_id, site, job_number, site_manager, expected_return_date, checked_out_at)";

async function signedUrl(path) {
  if (!path) return "";
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, PHOTO_URL_SECONDS);
  return data?.signedUrl || "";
}

async function signedUrls(paths) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(unique, PHOTO_URL_SECONDS);
  const map = {};
  (data || []).forEach((row) => { if (row.signedUrl) map[row.path] = row.signedUrl; });
  return map;
}

function toolShape(row, urls = {}) {
  const current = row.current || null;
  return {
    ...row,
    current: undefined,
    photo_url: urls[row.photo_path] || "",
    current_holder_id: current?.holder_user_id || current?.borrower_id || null,
    current_holder_name: current?.holder_name || null,
    current_site: current?.site || null,
    current_job: current?.job_number || null,
    current_site_manager: current?.site_manager || null,
    expected_return_date: current?.expected_return_date || null,
    current_checkout_id: current?.id || null,
  };
}

async function toolsShaped(rows) {
  const urls = await signedUrls(rows.map((r) => r.photo_path));
  return rows.map((r) => toolShape(r, urls));
}

function checkoutShape(row, tool = row.tt_tools || {}) {
  return {
    ...row,
    tt_tools: undefined,
    tool_asset_id: tool.asset_id || "",
    tool_description: tool.description || "",
    checkout_time: row.checked_out_at,
    return_time: row.returned_at,
    checked_out_by_name: row.holder_name,
  };
}

const describeDetails = (action, d = {}) => {
  if (typeof d === "string") return d;
  switch (action) {
    case "checked_out": return `Checked out to ${d.holder || "?"}${d.job ? ` for job ${d.job}` : ""}${d.site ? ` at ${d.site}` : ""}`;
    case "handed_over": return `Handed over to ${d.holder || "?"}${d.job ? ` for job ${d.job}` : ""}`;
    case "returned": return `Returned by ${d.holder || "?"}${d.condition ? ` (${d.condition})` : ""}`;
    case "tool_created": return `Tool ${d.asset_id || ""} added`;
    case "tool_updated": return `Tool ${d.asset_id || ""} updated`;
    case "tool_archived": return `Tool ${d.asset_id || ""} removed`;
    default: return Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(", ");
  }
};

async function memberNames(companyId) {
  const rows = check(await supabase.from("tt_members").select("user_id, name").eq("company_id", companyId));
  return Object.fromEntries(rows.map((r) => [r.user_id, r.name]));
}

async function auditShaped(rows, companyId) {
  const names = await memberNames(companyId);
  return rows.map((a) => ({
    id: String(a.id),
    tool_id: a.tool_id,
    action: a.action,
    user_id: a.user_id,
    user_name: names[a.user_id] || "System",
    details: describeDetails(a.action, a.details),
    timestamp: a.at,
    created_at: a.at,
  }));
}

const dateOnly = (v) => (v ? String(v).slice(0, 10) : null);
const today = () => new Date().toISOString().slice(0, 10);
const daysAgoIso = (days) => new Date(Date.now() - days * 86400000).toISOString();
const daysAheadDate = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

function certStatus(c) {
  if (!c.expiry_date) return "valid";
  if (c.expiry_date < today()) return "expired";
  if (c.expiry_date < daysAheadDate(30)) return "expiring_soon";
  return "valid";
}

const TOOL_FIELDS = ["asset_id", "description", "category", "model_name", "serial_number", "condition", "status",
  "safety_tag_expiry", "next_maintenance_date", "purchase_date", "purchase_price", "notes"];
const DATE_FIELDS = new Set(["safety_tag_expiry", "next_maintenance_date", "purchase_date", "expected_return_date", "issue_date", "expiry_date"]);

function pickFields(body, fields) {
  const out = {};
  fields.forEach((f) => {
    if (body[f] === undefined) return;
    let v = body[f];
    if (DATE_FIELDS.has(f)) v = v ? dateOnly(v) : null;
    else if (v === null && f !== "purchase_price") v = "";
    out[f] = v;
  });
  return out;
}

async function callTeamFunction(payload) {
  return callFunction("tt-team", payload);
}

async function callFunction(name, payload) {
  const { data, error } = await supabase.functions.invoke(name, { body: payload });
  if (error) {
    let detail = error.message;
    try { detail = (await error.context.json()).detail || detail; } catch { /* keep message */ }
    fail(error.context?.status || 400, detail);
  }
  return data;
}

function fileExt(file) {
  const fromName = (file.name || "").split(".").pop();
  if (fromName && fromName.length <= 5 && fromName !== file.name) return fromName.toLowerCase();
  return (file.type || "").split("/").pop() || "bin";
}

const randomId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------
const routes = [];
const on = (method, pattern, handler) => routes.push({ method, re: new RegExp(`^${pattern}$`), handler });

// ---- auth ----
on("GET", "/setup/check", async () => ({ is_first_run: false }));

on("GET", "/auth/me", async () => meShape(await context()));

// ---- billing (Stripe, via the tt-billing edge function; admins only) ----
on("POST", "/billing/checkout", async (_, body) => {
  const ctx = await context();
  return callFunction("tt-billing", { action: "checkout", company_id: ctx.companyId, plan: body.plan, extra_seats: body.extra_seats || 0 });
});
on("POST", "/billing/portal", async () => {
  const ctx = await context();
  return callFunction("tt-billing", { action: "portal", company_id: ctx.companyId });
});
// After returning from Stripe the plan may have changed: drop the cached context so /auth/me re-reads it.
on("POST", "/billing/refresh", async () => { cachedContext = null; return meShape(await context()); });

on("POST", "/auth/login", async (_, body) => {
  check(await supabase.auth.signInWithPassword({ email: (body.email || "").trim().toLowerCase(), password: body.password }), 401);
  clearContext();
  const me = meShape(await context());
  return { token: "supabase", user: me };
});

on("POST", "/auth/setup", async (_, body) => {
  const email = (body.email || "").trim().toLowerCase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: body.password,
    options: {
      data: { name: body.name, company_name: body.company_name || "", brand: body.brand || "long_line" },
      emailRedirectTo: appLink("toolTracker", "/login"),
    },
  });
  if (error) fail(400, friendly(error.message));
  if (!data.session) fail(400, "Account created. Check your email to confirm it, then sign in.");
  clearContext();
  return { token: "supabase", user: meShape(await context()) };
});

on("POST", "/auth/forgot-password", async (_, body) => {
  await supabase.auth.resetPasswordForEmail((body.email || "").trim().toLowerCase(), {
    redirectTo: appLink("toolTracker", "/reset-password"),
  });
  return { status: "reset_email_sent_if_configured" };
});

const setPassword = async (_, body) => {
  const { data } = await supabase.auth.getSession();
  if (!data.session) fail(400, "This link has expired or was already used. Ask for a new one.");
  check(await supabase.auth.updateUser({ password: body.new_password }));
  await supabase.auth.signOut();
  clearContext();
  return { status: "password_reset" };
};
on("POST", "/auth/reset-password", setPassword);
on("POST", "/auth/accept-invite", setPassword);

on("POST", "/auth/change-password", async (_, body) => {
  const user = await sessionUser();
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: body.current_password });
  if (error) fail(400, "Current password is incorrect");
  check(await supabase.auth.updateUser({ password: body.new_password }));
  return { status: "password_changed" };
});

// ---- people ----
on("GET", "/users", async () => {
  const ctx = await context();
  const rows = check(await supabase.from("tt_members").select("*").eq("company_id", ctx.companyId).order("name"));
  return rows.map((m) => ({ ...m, id: m.user_id, company_name: ctx.company.name }));
});

on("POST", "/users", async (_, body) => {
  const ctx = await context();
  return callTeamFunction({ action: "create", company_id: ctx.companyId, ...body });
});

on("POST", "/users/invite", async (_, body) => {
  const ctx = await context();
  return callTeamFunction({ action: "invite", company_id: ctx.companyId, redirect_to: appLink("toolTracker", "/accept-invite"), ...body });
});

on("POST", "/users/([^/]+)/reset-password", async ([userId], body) => {
  const ctx = await context();
  return callTeamFunction({ action: "set_password", company_id: ctx.companyId, user_id: userId, new_password: body.new_password });
});

on("PUT", "/users/([^/]+)", async ([userId], body) => {
  const ctx = await context();
  const patch = {};
  if (body.name) patch.name = body.name;
  if (body.role) patch.role = body.role;
  if (body.is_active !== undefined) patch.is_active = body.is_active;
  const row = check(await supabase.from("tt_members").update(patch)
    .eq("company_id", ctx.companyId).eq("user_id", userId).select().single());
  clearContext();
  return { ...row, id: row.user_id };
});

on("DELETE", "/users/([^/]+)", async ([userId]) => {
  const ctx = await context();
  check(await supabase.from("tt_members").update({ is_active: false }).eq("company_id", ctx.companyId).eq("user_id", userId).select().single());
  return { status: "deactivated" };
});

// ---- tools ----
on("GET", "/tools", async (_, __, params = {}) => {
  const ctx = await context();
  let q = supabase.from("tt_tools").select(TOOL_SELECT).eq("company_id", ctx.companyId).is("archived_at", null);
  if (params.status) q = q.eq("status", params.status);
  if (params.category) q = q.eq("category", params.category);
  if (params.search) {
    const s = params.search.replace(/[%,()]/g, " ").trim();
    if (s) q = q.or(`asset_id.ilike.%${s}%,description.ilike.%${s}%,serial_number.ilike.%${s}%`);
  }
  let tools = await toolsShaped(check(await q.order("asset_id").limit(2000)));
  if (params.holder) tools = tools.filter((t) => t.current_holder_id === params.holder);
  if (params.site) tools = tools.filter((t) => t.current_site === params.site);
  return tools;
});

on("GET", "/tools/([^/]+)/qr", async ([toolId]) => {
  const ctx = await context();
  const tool = check(await supabase.from("tt_tools").select("id, asset_id, description").eq("company_id", ctx.companyId).eq("id", toolId).single());
  const qr = await QRCode.toDataURL(JSON.stringify({ tool_id: tool.id, asset_id: tool.asset_id, description: tool.description }), { margin: 4, width: 330 });
  return { qr_code: qr, asset_id: tool.asset_id };
});

on("GET", "/tools/([^/]+)", async ([toolId]) => {
  const ctx = await context();
  const row = check(await supabase.from("tt_tools").select(TOOL_SELECT).eq("company_id", ctx.companyId).eq("id", toolId).single(), 404);
  return toolShape(row, { [row.photo_path]: await signedUrl(row.photo_path) });
});

on("POST", "/tools", async (_, body) => {
  const ctx = await context();
  const row = check(await supabase.from("tt_tools")
    .insert({ ...pickFields(body, TOOL_FIELDS), company_id: ctx.companyId }).select(TOOL_SELECT).single());
  return toolShape(row);
});

on("PUT", "/tools/([^/]+)", async ([toolId], body) => {
  const ctx = await context();
  const row = check(await supabase.from("tt_tools").update(pickFields(body, TOOL_FIELDS))
    .eq("company_id", ctx.companyId).eq("id", toolId).select(TOOL_SELECT).single());
  return toolShape(row, { [row.photo_path]: await signedUrl(row.photo_path) });
});

on("DELETE", "/tools/([^/]+)", async ([toolId]) => {
  const ctx = await context();
  const tool = check(await supabase.from("tt_tools").select("status").eq("company_id", ctx.companyId).eq("id", toolId).single(), 404);
  if (tool.status === "checked_out") fail(400, "Return the tool before removing it");
  check(await supabase.from("tt_tools").update({ archived_at: new Date().toISOString(), status: "retired" })
    .eq("company_id", ctx.companyId).eq("id", toolId));
  return { status: "deleted" };
});

on("POST", "/tools/([^/]+)/photo", async ([toolId], form) => {
  const ctx = await context();
  const file = form.get("file");
  if (!file) fail(400, "No file");
  const path = `${ctx.companyId}/tools/${toolId}/${randomId()}.${fileExt(file)}`;
  check(await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false }));
  check(await supabase.from("tt_tools").update({ photo_path: path }).eq("company_id", ctx.companyId).eq("id", toolId));
  return { photo_url: await signedUrl(path) };
});

// ---- check-out / return / handover ----
async function checkOut(ctx, body) {
  const row = check(await supabase.from("tt_checkouts").insert({
    company_id: ctx.companyId,
    tool_id: body.tool_id,
    holder_user_id: body.borrower_id ? null : (body.holder_user_id || ctx.user.id),
    borrower_id: body.borrower_id || null,
    holder_name: "pending",
    job_number: body.job_number || "",
    site: body.site || "",
    site_manager: body.site_manager || "",
    expected_return_date: dateOnly(body.expected_return_date),
    notes: body.notes || "",
  }).select("*, tt_tools:tt_tools!tt_checkouts_company_id_tool_id_fkey(asset_id, description)").single());
  return checkoutShape(row);
}

async function returnTool(ctx, body) {
  const active = check(await supabase.from("tt_checkouts").select("id").eq("company_id", ctx.companyId)
    .eq("tool_id", body.tool_id).eq("status", "active").maybeSingle());
  if (!active) fail(400, "Tool is not checked out");
  check(await supabase.from("tt_checkouts").update({
    status: "returned", return_condition: body.condition || "good", return_notes: body.notes || "",
  }).eq("id", active.id));
  const tool = check(await supabase.from("tt_tools").select("status").eq("id", body.tool_id).single());
  return { status: "returned", tool_status: tool.status };
}

on("POST", "/checkout", async (_, body) => checkOut(await context(), body));
on("POST", "/return", async (_, body) => returnTool(await context(), body));

on("POST", "/handover", async (_, body) => {
  const ctx = await context();
  const active = check(await supabase.from("tt_checkouts").select("id").eq("company_id", ctx.companyId)
    .eq("tool_id", body.tool_id).eq("status", "active").maybeSingle());
  if (!active) fail(400, "Tool is not checked out");
  const newId = check(await supabase.rpc("tt_hand_over", {
    p_checkout: active.id,
    p_holder_user: body.borrower_id ? null : body.next_holder_id,
    p_borrower: body.borrower_id || null,
    p_job: body.job_number ?? null,
    p_site_manager: body.site_manager ?? null,
    p_notes: body.notes || "",
  }));
  const row = check(await supabase.from("tt_checkouts").select("*, tt_tools:tt_tools!tt_checkouts_company_id_tool_id_fkey(asset_id, description)").eq("id", newId).single());
  return { ...checkoutShape(row), to_user_name: row.holder_name, status: "completed" };
});

async function bulk(toolIds, fn) {
  const results = { success: [], failed: [] };
  for (const toolId of toolIds || []) {
    try {
      const out = await fn(toolId);
      results.success.push({ tool_id: toolId, asset_id: out?.tool_asset_id || "" });
    } catch (e) {
      results.failed.push({ tool_id: toolId, reason: e.response?.data?.detail || e.message });
    }
  }
  return results;
}
on("POST", "/bulk-checkout", async (_, body) => {
  const ctx = await context();
  const { tool_ids: ids, ...rest } = body;
  return bulk(ids, (id) => checkOut(ctx, { ...rest, tool_id: id }));
});
on("POST", "/bulk-return", async (_, body) => {
  const ctx = await context();
  const { tool_ids: ids, ...rest } = body;
  return bulk(ids, (id) => returnTool(ctx, { ...rest, tool_id: id }));
});

on("GET", "/checkouts", async (_, __, params = {}) => {
  const ctx = await context();
  let q = supabase.from("tt_checkouts").select("*, tt_tools:tt_tools!tt_checkouts_company_id_tool_id_fkey(asset_id, description)").eq("company_id", ctx.companyId);
  if (params.status) q = q.eq("status", params.status);
  if (params.tool_id) q = q.eq("tool_id", params.tool_id);
  return check(await q.order("checked_out_at", { ascending: false }).limit(1000)).map((r) => checkoutShape(r));
});

// ---- borrowers (people you lend to who don't have a login) ----
const BORROWER_FIELDS = ["name", "phone", "email", "notes"];

function borrowerBody(body) {
  const out = {};
  BORROWER_FIELDS.forEach((k) => {
    if (body[k] === undefined) return;
    const v = String(body[k] ?? "").trim();
    out[k] = k === "notes" ? v : (v || null);
  });
  if (out.name === null) fail(400, "Enter a name.");
  return out;
}

on("GET", "/borrowers", async () => {
  const ctx = await context();
  const people = check(await supabase.from("tt_borrowers").select("*").eq("company_id", ctx.companyId).order("name"));
  const loans = check(await supabase.from("tt_checkouts")
    .select("id, borrower_id, tool_id, status, checked_out_at, expected_return_date, returned_at, tt_tools:tt_tools!tt_checkouts_company_id_tool_id_fkey(asset_id, description)")
    .eq("company_id", ctx.companyId).not("borrower_id", "is", null).order("checked_out_at", { ascending: false }).limit(2000));
  const today = new Date().toISOString().slice(0, 10);
  return people.map((p) => {
    const mine = loans.filter((l) => l.borrower_id === p.id);
    const out = mine.filter((l) => l.status === "active").map((l) => ({
      checkout_id: l.id, tool_id: l.tool_id, asset_id: l.tt_tools?.asset_id || "", description: l.tt_tools?.description || "",
      checked_out_at: l.checked_out_at, expected_return_date: l.expected_return_date,
      overdue: Boolean(l.expected_return_date && l.expected_return_date < today),
    }));
    return { ...p, tools_out: out, times_borrowed: mine.length, last_borrowed_at: mine[0]?.checked_out_at || null };
  });
});

on("POST", "/borrowers", async (_, body) => {
  const ctx = await context();
  const fields = borrowerBody(body);
  if (!fields.name) fail(400, "Enter a name.");
  return check(await supabase.from("tt_borrowers").insert({ notes: "", ...fields, company_id: ctx.companyId }).select().single());
});

on("PUT", "/borrowers/([^/]+)", async ([id], body) => {
  const ctx = await context();
  return check(await supabase.from("tt_borrowers").update(borrowerBody(body))
    .eq("company_id", ctx.companyId).eq("id", id).select().single(), 404);
});

on("DELETE", "/borrowers/([^/]+)", async ([id]) => {
  const ctx = await context();
  const { data, error } = await supabase.from("tt_borrowers").delete().eq("company_id", ctx.companyId).eq("id", id).select("id");
  if (error) fail(400, friendly(error.message));
  if (!data?.length) fail(403, "Only an admin or site manager can remove people.");
  return { status: "deleted" };
});

// ---- maintenance ----
on("POST", "/maintenance", async (_, body) => {
  const ctx = await context();
  const row = check(await supabase.from("tt_maintenance").insert({
    company_id: ctx.companyId, tool_id: body.tool_id, action_type: body.action_type,
    description: body.description || "", performed_by: ctx.user.id, performed_by_name: ctx.me.name,
  }).select().single());
  const toolPatch = pickFields(body, ["safety_tag_expiry", "next_maintenance_date", "condition"]);
  if (body.status && body.status !== "checked_out") toolPatch.status = body.status;
  else if (body.condition && ["good", "new", "fair"].includes(body.condition)) toolPatch.status = "available";
  if (Object.keys(toolPatch).length) {
    const tool = check(await supabase.from("tt_tools").select("status").eq("id", body.tool_id).single());
    if (tool.status === "checked_out") delete toolPatch.status;
    check(await supabase.from("tt_tools").update(toolPatch).eq("company_id", ctx.companyId).eq("id", body.tool_id));
  }
  return { ...row, timestamp: row.performed_at };
});

on("GET", "/maintenance/([^/]+)", async ([toolId]) => {
  const ctx = await context();
  return check(await supabase.from("tt_maintenance").select("*").eq("company_id", ctx.companyId).eq("tool_id", toolId)
    .order("performed_at", { ascending: false })).map((m) => ({ ...m, timestamp: m.performed_at }));
});

// ---- history ----
on("GET", "/audit/([^/]+)", async ([toolId]) => {
  const ctx = await context();
  const rows = check(await supabase.from("tt_audit_log").select("*").eq("company_id", ctx.companyId).eq("tool_id", toolId)
    .order("at", { ascending: false }).limit(200));
  return auditShaped(rows, ctx.companyId);
});

on("GET", "/dashboard/recent-activity", async () => {
  const ctx = await context();
  const rows = check(await supabase.from("tt_audit_log").select("*").eq("company_id", ctx.companyId)
    .order("at", { ascending: false }).limit(20));
  return auditShaped(rows, ctx.companyId);
});

async function companyTools(ctx) {
  return check(await supabase.from("tt_tools").select("id, asset_id, description, status, safety_tag_expiry, next_maintenance_date")
    .eq("company_id", ctx.companyId).is("archived_at", null).limit(5000));
}

async function activeCheckouts(ctx) {
  return check(await supabase.from("tt_checkouts").select("*, tt_tools:tt_tools!tt_checkouts_company_id_tool_id_fkey(asset_id, description)")
    .eq("company_id", ctx.companyId).eq("status", "active").limit(5000)).map((r) => checkoutShape(r));
}

on("GET", "/dashboard/stats", async () => {
  const ctx = await context();
  const [tools, active, members] = await Promise.all([
    companyTools(ctx), activeCheckouts(ctx),
    supabase.from("tt_members").select("user_id", { count: "exact", head: true }).eq("company_id", ctx.companyId).eq("is_active", true),
  ]);
  const overdue = active.filter((c) => c.expected_return_date && c.expected_return_date < today());
  const now = today(); const soon = daysAheadDate(14);
  return {
    total_tools: tools.length,
    available: tools.filter((t) => t.status === "available").length,
    checked_out: tools.filter((t) => t.status === "checked_out").length,
    maintenance_required: tools.filter((t) => t.status === "maintenance_required").length,
    overdue: overdue.length,
    expiring_tags: tools.filter((t) => t.safety_tag_expiry && t.safety_tag_expiry >= now && t.safety_tag_expiry <= soon).length,
    total_users: members.count || 0,
    overdue_tools: overdue,
  };
});

on("GET", "/calendar/events", async () => {
  const ctx = await context();
  const [tools, active, certs] = await Promise.all([
    companyTools(ctx), activeCheckouts(ctx),
    supabase.from("tt_certificates").select("*, tt_tools(asset_id)").eq("company_id", ctx.companyId).then((r) => check(r)),
  ]);
  const events = [];
  tools.forEach((t) => {
    if (t.next_maintenance_date) events.push({ id: `maint_${t.id}`, title: `Maintenance: ${t.asset_id}`, date: t.next_maintenance_date, type: "maintenance", tool_id: t.id, description: t.description });
    if (t.safety_tag_expiry) events.push({ id: `tag_${t.id}`, title: `Tag Expiry: ${t.asset_id}`, date: t.safety_tag_expiry, type: "tag_expiry", tool_id: t.id, description: t.description });
  });
  certs.forEach((c) => {
    if (c.expiry_date) events.push({ id: `cert_${c.id}`, title: `Cert Expiry: ${c.tt_tools?.asset_id || ""} - ${c.certificate_type}`, date: c.expiry_date, type: "certificate_expiry", tool_id: c.tool_id, description: `${c.certificate_type} #${c.certificate_number || ""}` });
  });
  active.forEach((co) => {
    if (co.expected_return_date) events.push({ id: `return_${co.id}`, title: `Due Back: ${co.tool_asset_id}`, date: co.expected_return_date, type: "expected_return", tool_id: co.tool_id, description: `Held by ${co.holder_name}` });
  });
  return events.sort((a, b) => a.date.localeCompare(b.date));
});

// ---- notifications ----
on("GET", "/notifications", async () => {
  const user = await sessionUser();
  return check(await supabase.from("tt_notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100));
});
on("GET", "/notifications/unread-count", async () => {
  const user = await sessionUser();
  const { count } = await supabase.from("tt_notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("read", false);
  return { count: count || 0 };
});
on("PUT", "/notifications/read-all", async () => {
  const user = await sessionUser();
  check(await supabase.from("tt_notifications").update({ read: true }).eq("user_id", user.id).eq("read", false));
  return { status: "all_read" };
});
on("PUT", "/notifications/([^/]+)/read", async ([id]) => {
  check(await supabase.from("tt_notifications").update({ read: true }).eq("id", id));
  return { status: "read" };
});

// ---- settings ----
const settingsShape = (c) => ({
  id: "app_settings", company_id: c.id, company_name: c.name, brand: c.brand,
  notify_tag_expiry: c.notify_tag_expiry, notify_overdue: c.notify_overdue, notify_handover: c.notify_handover,
  notify_days_before: c.notify_days_before,
  // Emails are now sent by the system, so there's nothing to configure here.
  email_provider: "system", email_api_key: "", sender_email: "",
});

on("GET", "/settings", async () => {
  const ctx = await context();
  return settingsShape(check(await supabase.from("tt_companies").select("*").eq("id", ctx.companyId).single()));
});

on("PUT", "/settings", async (_, body) => {
  const ctx = await context();
  const patch = {};
  if (body.company_name) patch.name = body.company_name;
  ["notify_tag_expiry", "notify_overdue", "notify_handover", "notify_days_before"].forEach((k) => {
    if (body[k] !== undefined && body[k] !== null) patch[k] = body[k];
  });
  if (!Object.keys(patch).length) return settingsShape(ctx.company);
  const row = check(await supabase.from("tt_companies").update(patch).eq("id", ctx.companyId).select().single());
  clearContext();
  return settingsShape(row);
});

on("POST", "/settings/test-email", async () => fail(400, "Emails are now sent by the system - there's nothing to set up."));

// ---- categories ----
on("GET", "/categories", async () => {
  const ctx = await context();
  const [cats, tools] = await Promise.all([
    supabase.from("tt_categories").select("*").eq("company_id", ctx.companyId).order("name").then((r) => check(r)),
    companyToolsWithCategory(ctx),
  ]);
  const counts = {};
  tools.forEach((t) => { counts[t.category] = (counts[t.category] || 0) + 1; });
  if (!cats.length) return Object.keys(counts).filter(Boolean).map((name) => ({ id: name, name, description: "", tool_count: counts[name] }));
  return cats.map((c) => ({ ...c, tool_count: counts[c.name] || 0 }));
});

async function companyToolsWithCategory(ctx) {
  return check(await supabase.from("tt_tools").select("category").eq("company_id", ctx.companyId).is("archived_at", null).limit(5000));
}

on("POST", "/categories", async (_, body) => {
  const ctx = await context();
  const row = check(await supabase.from("tt_categories").insert({ company_id: ctx.companyId, name: body.name, description: body.description || "" }).select().single());
  return { ...row, tool_count: 0 };
});

on("PUT", "/categories/([^/]+)", async ([id], body) => {
  const ctx = await context();
  const old = check(await supabase.from("tt_categories").select("name").eq("company_id", ctx.companyId).eq("id", id).single(), 404);
  const patch = pickFields(body, ["name", "description"]);
  const row = check(await supabase.from("tt_categories").update(patch).eq("company_id", ctx.companyId).eq("id", id).select().single());
  if (patch.name && patch.name !== old.name) {
    check(await supabase.from("tt_tools").update({ category: patch.name }).eq("company_id", ctx.companyId).eq("category", old.name));
  }
  return row;
});

on("DELETE", "/categories/([^/]+)", async ([id]) => {
  const ctx = await context();
  const cat = check(await supabase.from("tt_categories").select("name").eq("company_id", ctx.companyId).eq("id", id).single(), 404);
  const { count } = await supabase.from("tt_tools").select("id", { count: "exact", head: true })
    .eq("company_id", ctx.companyId).eq("category", cat.name).is("archived_at", null);
  if (count) fail(400, `Cannot delete: ${count} tools use this category. Reassign them first.`);
  check(await supabase.from("tt_categories").delete().eq("company_id", ctx.companyId).eq("id", id));
  return { status: "deleted" };
});

// ---- certificates ----
const NZ_CERT_TYPES = ["Annual Inspection", "Load Test Certificate", "Electrical Test & Tag", "Scaffold Inspection",
  "Pressure Vessel WOF", "Fall Arrest Inspection", "Crane Certificate", "Hoist Certificate", "Forklift Inspection",
  "Fire Extinguisher Service", "First Aid Kit Inspection", "Other"];
const NZ_STANDARDS = ["AS/NZS 1418 (Cranes)", "AS/NZS 3012 (Electrical)", "AS/NZS 1576 (Scaffolding)",
  "AS/NZS 1891 (Fall Arrest)", "NZS 3910 (Construction)", "WorkSafe NZ PCBU", "MBIE Regulations", "Other"];
const CERT_FIELDS = ["certificate_type", "certificate_number", "issuer_name", "issuer_company", "issuer_license_number",
  "nz_standard", "issue_date", "expiry_date", "notes"];

on("GET", "/certificates/types", async () => ({ types: NZ_CERT_TYPES, standards: NZ_STANDARDS }));

on("GET", "/certificates", async (_, __, params = {}) => {
  const ctx = await context();
  let q = supabase.from("tt_certificates").select("*, tt_tools(asset_id, description)").eq("company_id", ctx.companyId);
  if (params.tool_id) q = q.eq("tool_id", params.tool_id);
  const rows = check(await q.order("expiry_date", { ascending: true }));
  const urls = await signedUrls(rows.map((r) => r.document_path));
  let certs = rows.map((c) => ({
    ...c, tt_tools: undefined, tool_asset_id: c.tt_tools?.asset_id || "", tool_description: c.tt_tools?.description || "",
    document_url: urls[c.document_path] || "", status: certStatus(c),
  }));
  if (params.status) certs = certs.filter((c) => c.status === params.status);
  return certs;
});

on("POST", "/certificates", async (_, body) => {
  const ctx = await context();
  const row = check(await supabase.from("tt_certificates").insert({ ...pickFields(body, CERT_FIELDS), company_id: ctx.companyId, tool_id: body.tool_id }).select().single());
  return { ...row, document_url: "", status: certStatus(row) };
});

on("PUT", "/certificates/([^/]+)", async ([id], body) => {
  const ctx = await context();
  const row = check(await supabase.from("tt_certificates").update(pickFields(body, CERT_FIELDS)).eq("company_id", ctx.companyId).eq("id", id).select().single());
  return { ...row, document_url: await signedUrl(row.document_path), status: certStatus(row) };
});

on("DELETE", "/certificates/([^/]+)", async ([id]) => {
  const ctx = await context();
  const row = check(await supabase.from("tt_certificates").select("document_path").eq("company_id", ctx.companyId).eq("id", id).single(), 404);
  check(await supabase.from("tt_certificates").delete().eq("company_id", ctx.companyId).eq("id", id));
  if (row.document_path) await supabase.storage.from(BUCKET).remove([row.document_path]);
  return { status: "deleted" };
});

on("POST", "/certificates/([^/]+)/document", async ([id], form) => {
  const ctx = await context();
  const file = form.get("file");
  if (!file) fail(400, "No file");
  const cert = check(await supabase.from("tt_certificates").select("tool_id").eq("company_id", ctx.companyId).eq("id", id).single(), 404);
  const path = `${ctx.companyId}/certificates/${cert.tool_id}/${id}-${randomId()}.${fileExt(file)}`;
  check(await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined }));
  check(await supabase.from("tt_certificates").update({ document_path: path }).eq("company_id", ctx.companyId).eq("id", id));
  return { document_url: await signedUrl(path) };
});

// ---- reports ----
async function periodData(ctx, days) {
  const since = daysAgoIso(days);
  const [checkouts, maint] = await Promise.all([
    supabase.from("tt_checkouts").select("*, tt_tools:tt_tools!tt_checkouts_company_id_tool_id_fkey(asset_id, description)").eq("company_id", ctx.companyId).gte("checked_out_at", since).limit(5000).then((r) => check(r).map((c) => checkoutShape(c))),
    supabase.from("tt_maintenance").select("*").eq("company_id", ctx.companyId).gte("performed_at", since).limit(5000).then((r) => check(r).map((m) => ({ ...m, timestamp: m.performed_at }))),
  ]);
  const handovers = checkouts.filter((c) => c.handed_over_from).map((c) => ({ ...c, timestamp: c.checked_out_at, to_user_name: c.holder_name }));
  const fresh = checkouts.filter((c) => !c.handed_over_from);
  return { checkouts: fresh, handovers, maint };
}

on("GET", "/reports/tool-activity", async (_, __, params = {}) => {
  const ctx = await context();
  const days = Number(params.days) || 7;
  const { checkouts, handovers, maint } = await periodData(ctx, days);
  return {
    period_days: days, checkouts: checkouts.length, returns: checkouts.filter((c) => c.status === "returned").length,
    handovers: handovers.length, maintenance_actions: maint.length,
    checkout_details: checkouts, handover_details: handovers, maintenance_details: maint,
  };
});

on("GET", "/reports/summary", async (_, __, params = {}) => {
  const ctx = await context();
  const period = params.period || "week";
  const days = period === "week" ? 7 : 1;
  const [{ checkouts, handovers, maint }, tools, active] = await Promise.all([periodData(ctx, days), companyTools(ctx), activeCheckouts(ctx)]);
  const overdue = active.filter((c) => c.expected_return_date && c.expected_return_date < today());
  const tally = (list, key) => {
    const m = {};
    list.forEach((x) => { const k = x[key] || "Unknown"; m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
  };
  return {
    period, period_days: days,
    inventory: {
      total: tools.length, available: tools.filter((t) => t.status === "available").length,
      checked_out: tools.filter((t) => t.status === "checked_out").length,
      maintenance: tools.filter((t) => t.status === "maintenance_required").length,
    },
    activity: { checkouts: checkouts.length, returns: checkouts.filter((c) => c.status === "returned").length, handovers: handovers.length, maintenance_actions: maint.length },
    overdue_count: overdue.length,
    overdue_details: overdue.slice(0, 10),
    top_users: tally([...checkouts, ...handovers], "holder_name").map(([name, actions]) => ({ name, actions })),
    top_tools: tally(checkouts, "tool_asset_id").map(([asset_id, uses]) => ({ asset_id, uses })),
  };
});

const csvCell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // stop spreadsheet formula injection
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

on("GET", "/reports/export", async () => {
  const ctx = await context();
  const rows = check(await supabase.from("tt_tools").select(TOOL_SELECT).eq("company_id", ctx.companyId).is("archived_at", null).order("asset_id"));
  const tools = rows.map((r) => toolShape(r));
  const cols = ["asset_id", "description", "category", "model_name", "serial_number", "condition", "status",
    "current_holder_name", "current_site", "current_job", "safety_tag_expiry", "next_maintenance_date", "purchase_date", "purchase_price", "notes"];
  const csv = [cols.join(","), ...tools.map((t) => cols.map((c) => csvCell(t[c])).join(","))].join("\n");
  return new Blob([csv], { type: "text/csv" });
});

on("GET", "/reports/export-pdf", async (_, __, params = {}) => {
  const ctx = await context();
  const days = Number(params.days) || 7;
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const [{ checkouts, handovers, maint }, tools, active] = await Promise.all([periodData(ctx, days), companyTools(ctx), activeCheckouts(ctx)]);
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(16);
  doc.text(`${ctx.company.name || "Tool Tracker"} - tool report (last ${days} day${days === 1 ? "" : "s"})`, 14, 16);
  doc.setFontSize(10);
  doc.text(`Generated ${new Date().toLocaleString("en-NZ")}`, 14, 23);
  autoTable(doc, {
    startY: 28, head: [["Total", "Available", "Checked out", "Maintenance", "Check-outs", "Handovers", "Maintenance actions"]],
    body: [[tools.length, tools.filter((t) => t.status === "available").length, tools.filter((t) => t.status === "checked_out").length,
      tools.filter((t) => t.status === "maintenance_required").length, checkouts.length, handovers.length, maint.length]],
  });
  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 8, head: [["Tool", "Description", "Held by", "Job", "Site", "Due back"]],
    body: active.map((c) => [c.tool_asset_id, c.tool_description, c.holder_name, c.job_number, c.site, c.expected_return_date || ""]),
  });
  return doc.output("blob");
});

// ---- import ----
on("POST", "/import/tools", async (_, form) => {
  const ctx = await context();
  const file = form.get("file");
  if (!file) fail(400, "No file");
  let rows;
  if (/\.xlsx$/i.test(file.name || "")) {
    const { default: readXlsx } = await import("read-excel-file");
    rows = await readXlsx(file);
  } else {
    rows = parseCsv(await file.text());
  }
  if (!rows.length) fail(400, "File is empty");
  const header = rows[0].map((h) => String(h || "").trim().toLowerCase().replace(/\s+/g, "_"));
  const errors = [];
  const inserts = [];
  rows.slice(1).forEach((r, i) => {
    const rec = Object.fromEntries(header.map((h, j) => [h, r[j] === null || r[j] === undefined ? "" : String(r[j]).trim()]));
    if (!rec.asset_id || !rec.description) { errors.push(`Row ${i + 2}: asset_id and description are required`); return; }
    inserts.push({ ...pickFields({ ...rec, status: undefined, purchase_price: rec.purchase_price ? Number(rec.purchase_price) : undefined }, TOOL_FIELDS), company_id: ctx.companyId });
  });
  let imported = 0;
  for (const rec of inserts) {
    const { error } = await supabase.from("tt_tools").insert(rec);
    if (error) errors.push(`${rec.asset_id}: ${friendly(error.message)}`); else imported += 1;
  }
  return { imported, errors };
});

function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

// ---------------------------------------------------------------------------
// axios-like surface used by the pages
// ---------------------------------------------------------------------------
async function request(method, url, body, config = {}) {
  const [path, query] = url.split("?");
  const params = { ...Object.fromEntries(new URLSearchParams(query || "")), ...(config.params || {}) };
  const route = routes.find((r) => r.method === method && r.re.test(path));
  if (!route) fail(404, `Not available yet: ${method} ${path}`);
  const args = path.match(route.re).slice(1).map(decodeURIComponent);
  try {
    const data = await route.handler(args, body || {}, params);
    return { data, status: 200, headers: {} };
  } catch (err) {
    if (err.response?.status === 401 && !path.startsWith("/auth/")) {
      try { localStorage.removeItem("token"); localStorage.removeItem("user"); } catch { /* ignore */ }
      if (window.location.pathname !== "/login") window.location.href = "/login";
    }
    throw err;
  }
}

const supabaseApi = {
  get: (url, config) => request("GET", url, null, config),
  delete: (url, config) => request("DELETE", url, null, config),
  post: (url, body, config) => request("POST", url, body, config),
  put: (url, body, config) => request("PUT", url, body, config),
  patch: (url, body, config) => request("PUT", url, body, config),
};

export default supabaseApi;
