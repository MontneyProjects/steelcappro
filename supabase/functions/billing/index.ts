// Steelcap Pro billing (Stripe) + account deletion.
// platform_secrets: stripe_secret_key, stripe_webhook_secret, stripe_price_199, stripe_price_249, stripe_auto_tax ('true' once Stripe Tax is on)
// app_settings.billing_live = 'true' turns the paywall on in the app.
// Stripe webhook endpoint: https://hsyscwheyixsxzqahvbr.supabase.co/functions/v1/billing
//   events: checkout.session.completed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const BIG_CREW = 20; // more than this many active users -> $249 price
const ALLOWED_RETURN = /^https:\/\/(steelcappro\.com|[a-z0-9-]+\.github\.io)\//;

let sec: Record<string, string> | null = null;
async function secrets() { if (sec) return sec; const { data } = await admin.from("platform_secrets").select("key,value"); sec = Object.fromEntries((data || []).map((r) => [r.key, r.value])); return sec; }

// Stripe REST with form encoding (nested keys like a[b][c])
function form(obj: Record<string, unknown>, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => typeof x === "object" ? form(x as Record<string, unknown>, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(x)));
    else if (typeof v === "object") form(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}
async function stripe(method: string, path: string, body?: Record<string, unknown>) {
  const s = await secrets();
  if (!s.stripe_secret_key) throw new Error("Billing isn't set up yet");
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers: { Authorization: `Bearer ${s.stripe_secret_key}`, "Content-Type": "application/x-www-form-urlencoded" }, body: body ? form(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(j?.error?.message || `Stripe error ${r.status}`); return j;
}

async function user(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data } = await admin.auth.getUser(token); if (!data?.user) throw new Error("Sign in first");
  return data.user;
}
async function requireOwner(req: Request, cid: string) {
  const u = await user(req);
  const { data: m } = await admin.from("members").select("role,active").eq("company_id", cid).eq("user_id", u.id).maybeSingle();
  if (!m || !m.active || m.role !== "owner") throw new Error("Only the company owner can manage billing");
  return u;
}

// Map a Stripe subscription onto the company row
async function applySub(sub: Record<string, any>) {
  const cid = sub.metadata?.company_id; if (!cid) return;
  const st = sub.status; // trialing, active, past_due, canceled, unpaid, incomplete, incomplete_expired, paused
  const status = ["trialing", "active", "past_due"].includes(st) ? st : st === "canceled" || st === "incomplete_expired" ? "canceled" : "inactive";
  await admin.from("companies").update({
    billing_status: status, stripe_subscription_id: sub.id, stripe_customer_id: sub.customer,
    period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    plan: status === "canceled" ? "canceled" : "pro",
    trial_ends: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString().slice(0, 10) : undefined,
  }).eq("id", cid);
}

async function verifyWebhook(req: Request, raw: string) {
  const s = await secrets();
  const sig = req.headers.get("stripe-signature") || "";
  const parts = Object.fromEntries(sig.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts.t, v1s = sig.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !v1s.length || !s.stripe_webhook_secret) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 600) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(s.stripe_webhook_secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return v1s.some((v) => v.length === hex.length && [...v].reduce((d, c, i) => d | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
}

async function webhook(req: Request) {
  const raw = await req.text();
  if (!(await verifyWebhook(req, raw))) return json({ error: "bad signature" }, 400);
  const ev = JSON.parse(raw); const o = ev.data?.object || {};
  if (ev.type === "checkout.session.completed" && o.subscription) {
    const sub = await stripe("GET", `subscriptions/${o.subscription}`);
    await applySub(sub);
  } else if (ev.type?.startsWith("customer.subscription.")) {
    await applySub(o);
  }
  return json({ received: true });
}

async function activeUsers(cid: string) {
  const { count } = await admin.from("members").select("user_id", { count: "exact", head: true }).eq("company_id", cid).eq("active", true);
  return count || 0;
}

async function checkout(req: Request, b: Record<string, any>) {
  const cid = b.company_id; const u = await requireOwner(req, cid); const s = await secrets();
  const ret = ALLOWED_RETURN.test(b.return_to || "") ? b.return_to : "https://steelcappro.com/app/";
  const { data: co } = await admin.from("companies").select("id,name,ref,stripe_customer_id,stripe_subscription_id,billing_status").eq("id", cid).single();
  if (["trialing", "active"].includes(co.billing_status)) throw new Error("This company already has a plan");
  let customer = co.stripe_customer_id;
  if (!customer) {
    const c = await stripe("POST", "customers", { email: u.email, name: co.name, metadata: { company_id: cid, owner_id: u.id, ref: co.ref || "" } });
    customer = c.id; await admin.from("companies").update({ stripe_customer_id: customer }).eq("id", cid);
  }
  const big = (await activeUsers(cid)) > BIG_CREW;
  const price = big ? s.stripe_price_249 : s.stripe_price_199;
  if (!price) throw new Error("Billing isn't set up yet");
  const firstTime = !co.stripe_subscription_id;
  const session = await stripe("POST", "checkout/sessions", {
    mode: "subscription", customer, client_reference_id: cid,
    line_items: [{ price, quantity: 1 }],
    subscription_data: { ...(firstTime ? { trial_period_days: 7 } : {}), metadata: { company_id: cid, ref: co.ref || "" } },
    metadata: { company_id: cid, ref: co.ref || "" },
    ...(s.stripe_auto_tax === "true" ? { automatic_tax: { enabled: true }, customer_update: { address: "auto", name: "auto" } } : {}),
    tax_id_collection: { enabled: true },
    allow_promotion_codes: true, billing_address_collection: "required",
    success_url: ret + (ret.includes("?") ? "&" : "?") + "billing=ok", cancel_url: ret + (ret.includes("?") ? "&" : "?") + "billing=cancel",
  });
  return { url: session.url };
}

async function portal(req: Request, b: Record<string, any>) {
  const cid = b.company_id; await requireOwner(req, cid);
  const { data: co } = await admin.from("companies").select("stripe_customer_id").eq("id", cid).single();
  if (!co?.stripe_customer_id) throw new Error("No billing account yet");
  const ret = ALLOWED_RETURN.test(b.return_to || "") ? b.return_to : "https://steelcappro.com/app/";
  const s = await secrets();
  const p = await stripe("POST", "billing_portal/sessions", { customer: co.stripe_customer_id, return_url: ret, ...(s.stripe_portal_config ? { configuration: s.stripe_portal_config } : {}) });
  return { url: p.url };
}

// Re-read the subscription from Stripe (used right after checkout returns, before the webhook lands)
async function sync(req: Request, b: Record<string, any>) {
  const cid = b.company_id; await requireOwner(req, cid);
  const { data: co } = await admin.from("companies").select("stripe_customer_id").eq("id", cid).single();
  if (!co?.stripe_customer_id) return { billing_status: "none" };
  const subs = await stripe("GET", `subscriptions?customer=${co.stripe_customer_id}&status=all&limit=1`);
  if (subs.data?.[0]) await applySub({ ...subs.data[0], metadata: { ...subs.data[0].metadata, company_id: cid } });
  const { data: after } = await admin.from("companies").select("billing_status,period_end,trial_ends").eq("id", cid).single();
  return after;
}

// Delete my account. Owners: their companies (and all records) are deleted and billing is cancelled.
// Crew: login is removed; work records stay with the employer, anonymized.
async function deleteAccount(req: Request, b: Record<string, any>) {
  const u = await user(req);
  if (b.confirm !== "DELETE") throw new Error("Type DELETE to confirm");
  const { data: owned } = await admin.from("members").select("company_id").eq("user_id", u.id).eq("role", "owner");
  for (const o of owned || []) {
    const { data: co } = await admin.from("companies").select("stripe_subscription_id,billing_status").eq("id", o.company_id).single();
    if (co?.stripe_subscription_id && ["trialing", "active", "past_due"].includes(co.billing_status)) {
      try { await stripe("DELETE", `subscriptions/${co.stripe_subscription_id}`); } catch (_) { /* keep going */ }
    }
    await admin.from("companies").delete().eq("id", o.company_id);
  }
  await admin.from("push_subscriptions").delete().eq("user_id", u.id);
  const { error } = await admin.auth.admin.deleteUser(u.id);
  if (error) {
    // Records elsewhere still point at this user: anonymize instead of hard delete
    await admin.from("members").update({ full_name: "Former crew member", phone: null, active: false }).eq("user_id", u.id);
    await admin.auth.admin.updateUserById(u.id, { email: `deleted-${u.id}@deleted.steelcappro.com`, password: crypto.randomUUID() + "Aa1!", user_metadata: {}, ban_duration: "876000h" });
  }
  return { ok: true };
}

// One-time (idempotent) Stripe setup: product, prices, webhook, customer portal. Needs x-cron-secret.
async function setSecret(key: string, value: string) {
  await admin.from("platform_secrets").upsert({ key, value }, { onConflict: "key" }); if (sec) sec[key] = value;
}
async function setup(req: Request) {
  const s = await secrets();
  if (!s.cron_secret || req.headers.get("x-cron-secret") !== s.cron_secret) throw new Error("Not allowed");
  const out: Record<string, string> = {};
  // product
  const prods = await stripe("GET", "products/search?query=" + encodeURIComponent("metadata['app']:'steelcap'"));
  const product = prods.data?.[0]?.id || (await stripe("POST", "products", { name: "Steelcap Pro", description: "Field crew app: safety forms, field tickets, dispatch and QuickBooks invoicing.", metadata: { app: "steelcap" } })).id;
  out.product = product;
  // prices (by lookup key)
  for (const [lk, amt, nick, secKey] of [["steelcap_199_cad", 19900, "Up to 20 users", "stripe_price_199"], ["steelcap_249_cad", 24900, "More than 20 users", "stripe_price_249"]] as const) {
    const found = await stripe("GET", `prices?lookup_keys[]=${lk}&active=true`);
    const id = found.data?.[0]?.id || (await stripe("POST", "prices", { product, currency: "cad", unit_amount: amt, nickname: nick, lookup_key: lk, recurring: { interval: "month" }, tax_behavior: "exclusive" })).id;
    await setSecret(secKey, id); out[secKey] = id;
  }
  // webhook
  const url = `${SB_URL}/functions/v1/billing`;
  const hooks = await stripe("GET", "webhook_endpoints?limit=100");
  const mine = (hooks.data || []).filter((h: any) => h.url === url);
  if (!mine.length || !s.stripe_webhook_secret) {
    for (const h of mine) await stripe("DELETE", `webhook_endpoints/${h.id}`);
    const h = await stripe("POST", "webhook_endpoints", { url, description: "Steelcap Pro app", enabled_events: ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"] });
    await setSecret("stripe_webhook_secret", h.secret); out.webhook = h.id;
  } else out.webhook = mine[0].id + " (kept)";
  // customer portal
  if (!s.stripe_portal_config) {
    const pc = await stripe("POST", "billing_portal/configurations", {
      business_profile: { headline: "Steelcap Pro billing", privacy_policy_url: "https://steelcappro.com/privacy/", terms_of_service_url: "https://steelcappro.com/terms/" },
      features: { invoice_history: { enabled: true }, payment_method_update: { enabled: true }, customer_update: { enabled: true, allowed_updates: ["email", "address", "name", "tax_id"] }, subscription_cancel: { enabled: true, mode: "at_period_end" } },
      default_return_url: "https://steelcappro.com/app/",
    });
    await setSecret("stripe_portal_config", pc.id); out.portal = pc.id;
  } else out.portal = s.stripe_portal_config + " (kept)";
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.headers.get("stripe-signature")) return webhook(req);
  try {
    const b = await req.json().catch(() => ({}));
    if (b.action === "setup") return json(await setup(req));
    if (b.action === "checkout") return json(await checkout(req, b));
    if (b.action === "portal") return json(await portal(req, b));
    if (b.action === "sync") return json(await sync(req, b));
    if (b.action === "delete_account") return json(await deleteAccount(req, b));
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
