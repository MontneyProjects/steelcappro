// Steelcap Pro <-> QuickBooks Online. Each company connects its own QuickBooks once (OAuth).
// Approved tickets become invoice drafts (per client) and timesheets (per crew member) for QuickBooks Payroll.
// Needs platform_secrets: qbo_client_id, qbo_client_secret, qbo_env ('sandbox' or 'production').
// Redirect URI to register with Intuit: https://hsyscwheyixsxzqahvbr.supabase.co/functions/v1/qbo
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const REDIRECT = `${SB_URL}/functions/v1/qbo`;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
type Conn = { company_id: string; realm_id: string; access_token: string; refresh_token: string; access_expires_at: string };

let sec: Record<string, string> | null = null;
async function secrets() { if (sec) return sec; const { data } = await admin.from("platform_secrets").select("key,value"); sec = Object.fromEntries((data || []).map((r) => [r.key, r.value])); return sec; }
const apiBase = (s: Record<string, string>) => s.qbo_env === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com";
const basic = (s: Record<string, string>) => "Basic " + btoa(`${s.qbo_client_id}:${s.qbo_client_secret}`);

async function tokenCall(params: Record<string, string>) {
  const s = await secrets();
  const r = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", { method: "POST", headers: { Authorization: basic(s), "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams(params) });
  const j = await r.json(); if (!r.ok) throw new Error(j.error_description || j.error || "QuickBooks sign-in failed"); return j;
}
async function conn(cid: string): Promise<Conn> {
  const { data } = await admin.from("qbo_connections").select("*").eq("company_id", cid).maybeSingle();
  if (!data) throw new Error("QuickBooks isn't connected");
  if (new Date(data.access_expires_at).getTime() - Date.now() > 120000) return data;
  const t = await tokenCall({ grant_type: "refresh_token", refresh_token: data.refresh_token });
  const upd = { access_token: t.access_token, refresh_token: t.refresh_token, access_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(), refresh_expires_at: new Date(Date.now() + (t.x_refresh_token_expires_in || 0) * 1000).toISOString() };
  await admin.from("qbo_connections").update(upd).eq("company_id", cid);
  return { ...data, ...upd };
}
async function qb(c: Conn, method: string, path: string, body?: unknown) {
  const s = await secrets();
  const r = await fetch(`${apiBase(s)}/v3/company/${c.realm_id}/${path}${path.includes("?") ? "&" : "?"}minorversion=73`, { method, headers: { Authorization: `Bearer ${c.access_token}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.Fault?.Error?.[0]?.Detail || j?.Fault?.Error?.[0]?.Message || `QuickBooks error ${r.status}`);
  return j;
}
const query = async (c: Conn, q: string) => (await qb(c, "GET", "query?query=" + encodeURIComponent(q))).QueryResponse || {};
const qs = (v: string) => v.replace(/'/g, "\\'");

async function findOrCreate(c: Conn, entity: "Customer" | "Vendor", name: string) {
  const r = await query(c, `select Id, DisplayName from ${entity} where DisplayName = '${qs(name)}'`);
  if (r[entity]?.length) return r[entity][0].Id as string;
  const made = await qb(c, "POST", entity.toLowerCase(), { DisplayName: name.slice(0, 100) });
  return made[entity].Id as string;
}
async function taxCode(c: Conn, gst: boolean) {
  const r = await query(c, "select Id, Name from TaxCode");
  const list = (r.TaxCode || []) as { Id: string; Name: string }[];
  const pick = gst ? list.find((t) => /^GST\b/i.test(t.Name) && !/QST|PST/i.test(t.Name)) || list.find((t) => /GST|HST/i.test(t.Name)) : list.find((t) => /exempt|zero/i.test(t.Name));
  return pick?.Id || null;
}
async function serviceItem(c: Conn, name: string) {
  const r = await query(c, `select Id from Item where Name = '${qs(name)}'`);
  if (r.Item?.length) return r.Item[0].Id as string;
  const inc = await query(c, "select Id from Account where AccountType = 'Income' maxresults 1");
  const made = await qb(c, "POST", "item", { Name: name, Type: "Service", IncomeAccountRef: { value: inc.Account?.[0]?.Id } });
  return made.Item.Id as string;
}
async function requireAdmin(req: Request, cid: string) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(token); if (!u?.user) throw new Error("Sign in first");
  const { data: m } = await admin.from("members").select("role,active").eq("company_id", cid).eq("user_id", u.user.id).maybeSingle();
  if (!m || !m.active || !["owner", "admin"].includes(m.role)) throw new Error("Admins only");
  return u.user;
}

async function callback(url: URL) {
  const state = url.searchParams.get("state") || "", code = url.searchParams.get("code") || "", realm = url.searchParams.get("realmId") || "";
  const { data: st } = await admin.from("oauth_states").select("*").eq("state", state).maybeSingle();
  if (!st || Date.now() - new Date(st.created_at).getTime() > 15 * 60000) return new Response("That QuickBooks link expired. Go back to the app and tap Connect again.", { status: 400 });
  await admin.from("oauth_states").delete().eq("state", state);
  const t = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: REDIRECT });
  await admin.from("qbo_connections").upsert({ company_id: st.company_id, realm_id: realm, access_token: t.access_token, refresh_token: t.refresh_token, access_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(), refresh_expires_at: new Date(Date.now() + (t.x_refresh_token_expires_in || 0) * 1000).toISOString(), connected_by: st.user_id });
  let name = ""; try { const c = await conn(st.company_id); name = (await qb(c, "GET", `companyinfo/${realm}`)).CompanyInfo?.CompanyName || ""; } catch (_) { /* name is optional */ }
  await admin.from("companies").update({ qbo_connected: true, qbo_company_name: name }).eq("id", st.company_id);
  const back = (st as { return_to?: string }).return_to || "/";
  return new Response(null, { status: 302, headers: { Location: back + (back.includes("?") ? "&" : "?") + "qbo=connected" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  try {
    if (req.method === "GET" && url.searchParams.get("code")) return await callback(url);
    const body = await req.json();
    const cid = body.company_id as string;
    const user = await requireAdmin(req, cid);
    const s = await secrets();
    if (!s.qbo_client_id || !s.qbo_client_secret) return json({ error: "QuickBooks connection isn't switched on yet. The app owner needs to add the Intuit keys." }, 503);

    if (body.action === "connect_url") {
      const state = crypto.randomUUID();
      const back = String(body.return_to || "").startsWith("https://") ? body.return_to : "";
      await admin.from("oauth_states").insert({ state, company_id: cid, user_id: user.id, return_to: back });
      const u = new URL("https://appcenter.intuit.com/connect/oauth2");
      u.search = new URLSearchParams({ client_id: s.qbo_client_id, response_type: "code", scope: "com.intuit.quickbooks.accounting", redirect_uri: REDIRECT, state }).toString();
      return json({ url: u.toString() });
    }
    if (body.action === "disconnect") {
      const { data } = await admin.from("qbo_connections").select("refresh_token").eq("company_id", cid).maybeSingle();
      if (data) await fetch("https://developer.api.intuit.com/v2/oauth2/tokens/revoke", { method: "POST", headers: { Authorization: basic(s), "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ token: data.refresh_token }) }).catch(() => {});
      await admin.from("qbo_connections").delete().eq("company_id", cid);
      await admin.from("companies").update({ qbo_connected: false, qbo_company_name: null }).eq("id", cid);
      return json({ ok: true });
    }
    const c = await conn(cid);
    if (body.action === "customers") {
      const r = await query(c, "select Id, DisplayName from Customer where Active = true maxresults 1000");
      return json({ customers: (r.Customer || []).map((x: { Id: string; DisplayName: string }) => ({ id: x.Id, name: x.DisplayName })) });
    }
    if (body.action === "draft_invoices") {
      const { data: tks } = await admin.from("tickets").select("*").eq("company_id", cid).eq("status", "approved").in("id", body.ticket_ids || []);
      const [{ data: trucks }, { data: clients }, { data: mem }] = await Promise.all([
        admin.from("trucks").select("id,unit,rate_hour").eq("company_id", cid), admin.from("clients").select("*").eq("company_id", cid), admin.from("members").select("user_id,full_name").eq("company_id", cid)]);
      const { data: co } = await admin.from("companies").select("solo_rate").eq("id", cid).single();
      // same pricing as the app's exports: client rate (or truck rate) with a helper; the company's no-helper rate when there's no helper
      const rateFor = (t: Record<string, unknown>, cl: Record<string, unknown> | undefined, tr: Record<string, unknown> | null | undefined) => {
        const base = Number(cl?.rate_hour || 0) || Number(tr?.rate_hour || 0);
        return Number(t.helper_hours) > 0 ? base : (Number(co?.solo_rate || 0) || base);
      };
      const T = new Map((trucks || []).map((t) => [t.id, t])), P = new Map((mem || []).map((m) => [m.user_id, m.full_name]));
      const gst = await taxCode(c, true), item = await serviceItem(c, "Truck and crew hours");
      const groups = new Map<string, typeof tks>(); (tks || []).forEach((t) => { const k = t.client_id || "none"; groups.set(k, [...(groups.get(k) || []), t]); });
      let created = 0; const refs: string[] = [];
      for (const [k, list] of groups) {
        const cl = (clients || []).find((x) => x.id === k);
        const custId = cl?.qbo_customer_id || await findOrCreate(c, "Customer", cl?.name || "Unassigned client");
        if (cl && !cl.qbo_customer_id) await admin.from("clients").update({ qbo_customer_id: custId }).eq("id", cl.id);
        const lines: Record<string, unknown>[] = [];
        for (const t of (list || []).sort((a, b) => a.work_date.localeCompare(b.work_date))) {
          const tr = t.truck_id ? T.get(t.truck_id) : null;
          const desc = [t.work_date, tr ? "Truck " + tr.unit : "", t.site, t.afe ? "AFE " + t.afe : "", t.cost_code ? "Code " + t.cost_code : "", P.get(t.user_id), Number(t.helper_hours) > 0 ? "with helper" : "no helper", t.description].filter(Boolean).join(" · ");
          const line = (itemId: string, qty: number, price: number, d: string) => ({ DetailType: "SalesItemLineDetail", Amount: Math.round(qty * price * 100) / 100, Description: d.slice(0, 4000),
            SalesItemLineDetail: { ItemRef: { value: itemId }, Qty: qty, UnitPrice: price, ServiceDate: t.work_date, ...(gst ? { TaxCodeRef: { value: gst } } : {}) } });
          lines.push(line(item, Number(t.hours) + Number(t.standby_hours || 0), rateFor(t, cl, tr), desc));
        }
        const inv = await qb(c, "POST", "invoice", { CustomerRef: { value: custId }, TxnDate: new Date().toISOString().slice(0, 10), Line: lines, EmailStatus: "NotSet", PrintStatus: "NotSet",
          PrivateNote: "Draft built by Steelcap Pro from approved field tickets. Check dates and rates before sending.", ...(gst ? { GlobalTaxCalculation: "TaxExcluded" } : {}) });
        const ref = "QBO #" + (inv.Invoice.DocNumber || inv.Invoice.Id);
        await admin.from("tickets").update({ status: "invoiced", invoice_ref: ref }).in("id", (list || []).map((t) => t.id));
        created++; refs.push(ref);
      }
      return json({ ok: true, created, refs });
    }
    if (body.action === "employees") {
      const r = await query(c, "select Id, DisplayName, GivenName, FamilyName from Employee where Active = true maxresults 1000");
      return json({ employees: (r.Employee || []).map((x: { Id: string; DisplayName?: string; GivenName?: string; FamilyName?: string }) => ({ id: x.Id, name: x.DisplayName || [x.GivenName, x.FamilyName].filter(Boolean).join(" ") })) });
    }
    if (body.action === "map_employee") {
      await admin.from("members").update({ qbo_employee_id: body.employee_id || null }).eq("company_id", cid).eq("user_id", body.user_id);
      return json({ ok: true });
    }
    if (body.action === "send_hours") {
      // Approved hours -> QuickBooks timesheets (TimeActivity), one per ticket, under the crew member's employee record.
      // QuickBooks Payroll picks these up when payroll is run for the period. Nothing is paid from here.
      let q = admin.from("tickets").select("*").eq("company_id", cid).in("status", ["approved", "invoiced"]).is("qbo_time_id", null);
      if (Array.isArray(body.ticket_ids)) q = q.in("id", body.ticket_ids);
      else q = q.gte("work_date", body.from).lte("work_date", body.to);
      const { data: tks } = await q;
      if (!tks?.length) return json({ ok: true, sent: 0, hours: 0, missing: [] });
      const [{ data: mem }, { data: trucks }, { data: clients }] = await Promise.all([
        admin.from("members").select("user_id,full_name,qbo_employee_id").eq("company_id", cid),
        admin.from("trucks").select("id,unit").eq("company_id", cid), admin.from("clients").select("id,name,qbo_customer_id").eq("company_id", cid)]);
      const er = await query(c, "select Id, DisplayName, GivenName, FamilyName from Employee where Active = true maxresults 1000");
      const norm = (v: string) => (v || "").toLowerCase().replace(/[^a-z]/g, "");
      const byName = new Map<string, string>();
      for (const e of (er.Employee || []) as { Id: string; DisplayName?: string; GivenName?: string; FamilyName?: string }[]) {
        byName.set(norm(e.DisplayName || ""), e.Id); byName.set(norm(`${e.GivenName || ""}${e.FamilyName || ""}`), e.Id);
      }
      const empOf = new Map<string, string | null>();
      for (const m of mem || []) {
        let id = m.qbo_employee_id || byName.get(norm(m.full_name || "")) || null;
        if (id && !m.qbo_employee_id) await admin.from("members").update({ qbo_employee_id: id }).eq("company_id", cid).eq("user_id", m.user_id);
        empOf.set(m.user_id, id);
      }
      const P = new Map((mem || []).map((m) => [m.user_id, m.full_name || "Crew member"]));
      const T = new Map((trucks || []).map((t) => [t.id, t.unit])), C = new Map((clients || []).map((x) => [x.id, x]));
      let sent = 0, hours = 0; const missing = new Set<string>(), errors: string[] = [];
      for (const t of tks.sort((a, b) => a.work_date.localeCompare(b.work_date))) {
        const emp = empOf.get(t.user_id);
        if (!emp) { missing.add(P.get(t.user_id) || "Crew member"); continue; }
        const total = Number(t.hours || 0) + Number(t.standby_hours || 0); if (total <= 0) continue;
        const mins = Math.round(total * 60), cl = t.client_id ? C.get(t.client_id) : null;
        const desc = [t.truck_id ? "Truck " + T.get(t.truck_id) : "", cl?.name, t.site, Number(t.standby_hours) > 0 ? `${t.standby_hours} hrs standby` : "", "Steelcap Pro ticket"].filter(Boolean).join(" · ");
        try {
          const r = await qb(c, "POST", "timeactivity", { NameOf: "Employee", EmployeeRef: { value: emp }, TxnDate: t.work_date, Hours: Math.floor(mins / 60), Minutes: mins % 60,
            BillableStatus: "NotBillable", Description: desc.slice(0, 4000), ...(cl?.qbo_customer_id ? { CustomerRef: { value: cl.qbo_customer_id } } : {}) });
          await admin.from("tickets").update({ qbo_time_id: r.TimeActivity.Id, time_sent_at: new Date().toISOString() }).eq("id", t.id);
          sent++; hours += total;
        } catch (err) { errors.push(`${P.get(t.user_id)} ${t.work_date}: ${(err as Error).message}`); }
      }
      return json({ ok: true, sent, hours: Math.round(hours * 100) / 100, missing: [...missing], errors: errors.slice(0, 5) });
    }
    if (body.action === "post_expense") {
      const { data: e } = await admin.from("expenses").select("*").eq("company_id", cid).eq("id", body.expense_id).single();
      if (e.qbo_status === "posted") return json({ ok: true, already: true });
      try {
        const vendorId = e.vendor ? await findOrCreate(c, "Vendor", e.vendor) : null;
        const acct = await query(c, `select Id from Account where Name = '${qs(e.category || "Uncategorized Expense")}'`);
        const expAcct = acct.Account?.[0]?.Id || (await query(c, "select Id from Account where Name = 'Uncategorized Expense'")).Account?.[0]?.Id;
        let payAcct: string, payType = "Cash";
        if (e.paid_personally) {
          const ex = await query(c, "select Id from Account where Name = 'Paid Personally - Owe Owner'");
          payAcct = ex.Account?.[0]?.Id || (await qb(c, "POST", "account", { Name: "Paid Personally - Owe Owner", AccountType: "Credit Card", Description: "Company costs the owner paid personally. The balance is what the company owes them." })).Account.Id;
          payType = "CreditCard";
        } else payAcct = (await query(c, "select Id from Account where AccountType = 'Bank' maxresults 1")).Account?.[0]?.Id;
        const hasGst = Number(e.gst || 0) > 0, tax = await taxCode(c, hasGst);
        const p = await qb(c, "POST", "purchase", { PaymentType: payType, AccountRef: { value: payAcct }, TxnDate: e.exp_date, ...(vendorId ? { EntityRef: { value: vendorId, type: "Vendor" } } : {}),
          GlobalTaxCalculation: "TaxExcluded", PrivateNote: "From Steelcap Pro" + (e.notes ? "; " + e.notes : ""),
          Line: [{ DetailType: "AccountBasedExpenseLineDetail", Amount: Math.round((Number(e.total) - Number(e.gst || 0)) * 100) / 100, Description: e.notes || e.vendor || "Receipt", AccountBasedExpenseLineDetail: { AccountRef: { value: expAcct }, ...(tax ? { TaxCodeRef: { value: tax } } : {}) } }] });
        const pid = p.Purchase.Id;
        if (e.receipt_path) {
          const { data: blob } = await admin.storage.from("files").download(e.receipt_path);
          if (blob) {
            const isPdf = e.receipt_path.endsWith(".pdf"), fname = `receipt-${e.exp_date}.${isPdf ? "pdf" : "jpg"}`, ct = isPdf ? "application/pdf" : "image/jpeg";
            const fd = new FormData();
            fd.append("file_metadata_01", new Blob([JSON.stringify({ AttachableRef: [{ EntityRef: { type: "Purchase", value: pid } }], FileName: fname, ContentType: ct })], { type: "application/json" }), "meta.json");
            fd.append("file_content_01", new Blob([await blob.arrayBuffer()], { type: ct }), fname);
            await fetch(`${apiBase(s)}/v3/company/${c.realm_id}/upload?minorversion=73`, { method: "POST", headers: { Authorization: `Bearer ${c.access_token}`, Accept: "application/json" }, body: fd });
          }
        }
        await admin.from("expenses").update({ qbo_status: "posted", qbo_id: pid, posted_at: new Date().toISOString(), qbo_error: null }).eq("id", e.id);
        return json({ ok: true, id: pid });
      } catch (err) {
        await admin.from("expenses").update({ qbo_status: "error", qbo_error: String((err as Error).message).slice(0, 300) }).eq("id", e.id);
        throw err;
      }
    }
    return json({ error: "unknown action" }, 400);
  } catch (e) { return json({ error: String((e as Error).message || e) }, 400); }
});
