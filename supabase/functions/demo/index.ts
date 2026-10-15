// Steelcap Pro demo: one tap makes a private, fully loaded sample company and signs the visitor in as its owner.
// Each visitor gets their own copy. Copies older than a day are deleted (company + demo login) on later calls.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (n: number) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
// semi-monthly pay periods: 1st-15th and 16th-end
const periodStart = (d: Date) => d.getDate() <= 15 ? new Date(d.getFullYear(), d.getMonth(), 1, 12) : new Date(d.getFullYear(), d.getMonth(), 16, 12);
const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
// supabase insert result -> data, or stop the demo build with the real error
const ok = <R extends { data: unknown; error: unknown }>(r: R) => { if (r.error) throw new Error((r.error as { message?: string }).message || "Demo setup failed"); return r.data as NonNullable<R["data"]>; };
async function login(full_name: string) {
  const { data, error } = await admin.auth.admin.createUser({ email: `demo-${crypto.randomUUID().slice(0, 13)}@demo.steelcappro.com`, password: crypto.randomUUID() + "Aa1", email_confirm: true, user_metadata: { full_name, demo: true } });
  if (error || !data?.user) throw new Error(error?.message || "Couldn't start the demo");
  return data.user.id;
}

async function cleanup() {
  const cutoff = new Date(Date.now() - 24 * 3600e3).toISOString();
  const { data: old } = await admin.from("companies").select("id,created_by").eq("plan", "demo").lt("created_at", cutoff).limit(40);
  for (const o of old || []) {
    const { data: mem } = await admin.from("members").select("user_id").eq("company_id", o.id);
    const ids = new Set([...(mem || []).map((m) => m.user_id), o.created_by].filter(Boolean));
    await admin.from("companies").delete().eq("id", o.id);
    for (const id of ids) await admin.auth.admin.deleteUser(id as string).catch(() => {});
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    await cleanup().catch(() => {});
    const { count } = await admin.from("companies").select("id", { count: "exact", head: true }).eq("plan", "demo").gt("created_at", new Date(Date.now() - 60e3).toISOString());
    if ((count || 0) > 30) return json({ error: "Lots of people are trying the demo right now. Give it a minute and try again." }, 429);

    const email = `demo-${crypto.randomUUID().slice(0, 13)}@demo.steelcappro.com`, password = crypto.randomUUID() + "Aa1";
    const { data: u, error: ue } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Dale Morrison", demo: true } });
    if (ue || !u?.user) throw new Error(ue?.message || "Couldn't start the demo");
    const uid = u.user.id;

    const { data: co, error: ce } = await admin.from("companies").insert({ name: "Alpha Oilfield Ltd.", province: "AB", timezone: "America/Edmonton", plan: "demo", trial_ends: iso(day(1)),
      created_by: uid, theme: "steelcap", solo_rate: 125, books: "quickbooks", gst_number: "81234 5678 RT0001", pay_schedule: { type: "semi-monthly", paydays: [5, 20] } }).select("id").single();
    if (ce) throw ce;
    const cid = co.id, made: string[] = [];
    try {
    await admin.rpc("seed_company", { cid });

    // sample crew get their own logins (nobody signs in as them; only the visitor uses the owner login)
    const [codyId, joshId, masonId, tylerId] = await Promise.all(["Cody Larsen", "Josh Smith", "Mason Lee", "Tyler Brooks"].map(login));
    made.push(codyId, joshId, masonId, tylerId);
    const crew = [
      { user_id: uid, role: "owner", full_name: "Dale Morrison", title: "Owner", phone: "780-555-0100" },
      { user_id: codyId, role: "admin", full_name: "Cody Larsen", title: "Foreman", phone: "780-555-0111" },
      { user_id: joshId, role: "crew", full_name: "Josh Smith", title: "Picker operator", phone: "780-555-0122" },
      { user_id: masonId, role: "crew", full_name: "Mason Lee", title: "Picker operator", phone: "780-555-0133" },
      { user_id: tylerId, role: "crew", full_name: "Tyler Brooks", title: "Swamper", phone: "780-555-0144" },
    ];
    ok(await admin.from("members").insert(crew.map((m) => ({ ...m, company_id: cid }))));
    const [, cody, josh, mason, tyler] = crew.map((m) => m.user_id);

    const { data: trucks } = await admin.from("trucks").insert([
      { company_id: cid, unit: "08", kind: "Picker", description: "2019 Kenworth T370, 26-ton picker", plate: "BXT-4471", rate_hour: 165 },
      { company_id: cid, unit: "12", kind: "Picker", description: "2021 Freightliner M2, 18-ton picker", plate: "CKR-1190", rate_hour: 155 },
      { company_id: cid, unit: "15", kind: "Flatbed", description: "2018 Peterbilt 348 flatbed", plate: "BWM-8822", rate_hour: 135 },
      { company_id: cid, unit: "21", kind: "Picker", description: "2023 Kenworth T880, 38-ton picker", plate: "DLA-3056", rate_hour: 185 },
    ]).select("id,unit");
    const T = Object.fromEntries((trucks || []).map((t) => [t.unit, t.id]));
    const { data: clients } = await admin.from("clients").insert([
      { company_id: cid, name: "Northline Energy", contact: "Rob Kessler", email: "ap@northline.example", rate_hour: 175 },
      { company_id: cid, name: "Ridgeback Pipeline", contact: "Sara Dunn", email: "invoices@ridgeback.example", rate_hour: 165 },
      { company_id: cid, name: "Kestrel Facilities", contact: "Marc Leblanc", email: "ap@kestrel.example", rate_hour: 170 },
    ]).select("id,name");
    const C = Object.fromEntries((clients || []).map((c) => [c.name.split(" ")[0], c.id]));

    // tickets: about four weeks of work
    const sites: Record<string, string[]> = { Northline: ["102/13-22-078-06W6", "100/04-12-079-10W6"], Ridgeback: ["15-30-080-11W6 pipeline spread", "KP 14+200 tie-in"], Kestrel: ["Kestrel 9-27 compressor station", "4-18-077-05W6 battery"] };
    const jobs = ["Set skids and tied in piping", "Moved pipe racks and fittings", "Lifted separator into place", "Unloaded and stacked pipe", "Set anchors and mats", "Loaded out tank and moved to new pad", "Hauled valves and fittings from yard", "Lifted compressor package"];
    const crews = [{ op: josh, truck: "08", helper: true, client: "Northline" }, { op: mason, truck: "12", helper: false, client: "Ridgeback" }, { op: cody, truck: "21", helper: true, client: "Kestrel" }];
    const today = day(0), lastStart = periodStart(day(-(today.getDate() <= 15 ? today.getDate() : today.getDate() - 15)));
    const tickets: Record<string, unknown>[] = [];
    const inv = 1041;
    for (let n = -28; n <= 0; n++) {
      const d = day(n); if (d.getDay() === 0) continue;
      for (const c of crews) {
        if (n === 0 && c.op === cody) continue; // Cody hasn't sent today's ticket yet
        if (Math.random() < 0.08) continue;
        const client = Math.random() < 0.8 ? c.client : pick(["Northline", "Ridgeback", "Kestrel"]);
        const hrs = pick([10, 10.5, 11, 11.5, 12, 12]), standby = Math.random() < 0.12 ? pick([1, 1.5, 2]) : 0;
        const status = n >= -1 ? "submitted" : d < lastStart ? "invoiced" : "approved";
        tickets.push({ company_id: cid, user_id: c.op, work_date: iso(d), truck_id: T[c.truck], client_id: C[client], site: pick(sites[client]), afe: client === "Northline" ? "AFE-" + rnd(4000, 4099) : null,
          cost_code: client === "Ridgeback" ? "CC-" + rnd(210, 260) : null, supervisor: client === "Northline" ? "Rob Kessler" : client === "Ridgeback" ? "Sara Dunn" : "Marc Leblanc",
          hours: hrs, helper_hours: c.helper ? hrs : 0, standby_hours: standby, description: pick(jobs), status, invoice_ref: status === "invoiced" ? "QBO #" + (inv + (d.getDate() > 15 ? 1 : 0)) : null,
          created_at: new Date(d.getTime() + 7 * 3600e3).toISOString() });
      }
    }
    for (let i = 0; i < tickets.length; i += 200) ok(await admin.from("tickets").insert(tickets.slice(i, i + 200)));

    // safety forms today: Josh and Mason did their pre-trips (Mason found a defect), Josh did an FLHA, Cody still owes his
    const { data: tpl } = await admin.from("form_templates").select("id,kind").eq("company_id", cid);
    const TP = Object.fromEntries((tpl || []).map((t) => [t.kind, t.id]));
    const t0 = iso(today), now = Date.now();
    ok(await admin.from("form_submissions").insert([
      { company_id: cid, template_id: TP.pretrip, kind: "pretrip", user_id: josh, work_date: t0, truck_id: T["08"], data: { odometer: "184220", notes: "All good" }, defects: [], created_at: new Date(now - 4 * 3600e3).toISOString() },
      { company_id: cid, template_id: TP.pretrip, kind: "pretrip", user_id: mason, work_date: t0, truck_id: T["12"], data: { odometer: "96410", notes: "Left rear inside dual looks low" },
        defects: [{ item: "Tires and wheels", note: "Left rear inside dual low, about 60 psi", photos: [] }], created_at: new Date(now - 3.8 * 3600e3).toISOString() },
      { company_id: cid, template_id: TP.flha, kind: "flha", user_id: josh, work_date: t0, client_id: C.Northline, site: "102/13-22-078-06W6",
        data: { site: "102/13-22-078-06W6", task: "Set separator skid", hazards: ["Overhead lines", "Suspended loads", "Pinch points"], controls: "Spotter on every lift, tag lines, 7 m from lines", ppe: ["Hard hat", "Safety glasses", "FR coveralls", "Gloves", "H2S monitor"], crew: "Josh Smith, Tyler Brooks" }, defects: [],
        created_at: new Date(now - 2.5 * 3600e3).toISOString() },
      { company_id: cid, template_id: TP.toolbox, kind: "toolbox", user_id: josh, work_date: t0, client_id: C.Northline, site: "102/13-22-078-06W6",
        data: { topic: "Cold weather and slippery decks", discussion: "Three points of contact, sand on the deck, warm-up breaks every 2 hours", attendees: "Josh Smith, Tyler Brooks, Rob Kessler" }, defects: [], created_at: new Date(now - 2.4 * 3600e3).toISOString() },
    ]));

    // tomorrow's dispatch
    const { data: dsp } = await admin.from("dispatches").insert({ company_id: cid, work_date: iso(day(1)), start_time: "6:00 AM", truck_id: T["08"], client_id: C.Northline, site: "100/04-12-079-10W6",
      contact: "Rob Kessler 780-555-0142", notes: "Bring the 20 ft spreader bar. Gate code 4471. Muster at the lease shack.", created_by: uid }).select("id").single();
    if (dsp) ok(await admin.from("dispatch_recipients").insert([{ dispatch_id: dsp.id, user_id: josh, ack_at: new Date(now - 1800e3).toISOString() }, { dispatch_id: dsp.id, user_id: tyler }]));

    // crew chat
    const { data: th } = await admin.from("chat_threads").insert({ company_id: cid, kind: "group", title: "Alpha Oilfield crew", everyone: true, created_by: uid, last_message_at: new Date(now - 600e3).toISOString() }).select("id").single();
    if (th) {
      ok(await admin.from("chat_members").insert(crew.map((m) => ({ thread_id: th.id, user_id: m.user_id, last_read_at: m.user_id === uid ? new Date(now - 3 * 3600e3).toISOString() : new Date().toISOString() }))));
      ok(await admin.from("chat_messages").insert([
        { thread_id: th.id, sender_id: uid, body: "Safety meeting Monday 7am at the shop. Coffee's on me.", created_at: new Date(now - 5 * 3600e3).toISOString() },
        { thread_id: th.id, sender_id: josh, body: "Rigged up on the north pad, first lift going now", created_at: new Date(now - 2 * 3600e3).toISOString() },
        { thread_id: th.id, sender_id: mason, body: "12 has a low tire, put it in the pre-trip. Getting it aired up in town", created_at: new Date(now - 1.5 * 3600e3).toISOString() },
        { thread_id: th.id, sender_id: cody, body: "Kestrel wants us back Thursday for the second package", created_at: new Date(now - 600e3).toISOString() },
      ]));
    }

    // fuel and receipts
    const fuel: Record<string, unknown>[] = [];
    for (let n = -20; n <= 0; n += 3) for (const [unit, op] of [["08", josh], ["12", mason], ["21", cody]] as const) {
      const l = rnd(180, 340), ppl = 1.59 + Math.random() * 0.12; fuel.push({ company_id: cid, user_id: op, truck_id: T[unit], fill_date: iso(day(n)), station: pick(["Petro-Canada Grande Prairie", "Shell Clairmont", "Esso Fort St. John"]),
        litres: l, price_per_l: Math.round(ppl * 1000) / 1000, total: Math.round(l * ppl * 100) / 100, gst: Math.round(l * ppl * 0.05 / 1.05 * 100) / 100, odometer: String(rnd(90000, 190000)) });
    }
    ok(await admin.from("fuel_logs").insert(fuel));
    ok(await admin.from("expenses").insert([
      { company_id: cid, created_by: uid, exp_date: iso(day(-2)), vendor: "Napa Auto Parts", total: 214.37, gst: 10.21, category: "Repair and maintenance", notes: "Air filters for 08 and 12", paid_personally: false },
      { company_id: cid, created_by: cody, exp_date: iso(day(-1)), vendor: "Mark's Work Wearhouse", total: 189.0, gst: 9.0, category: "Supplies", notes: "FR coveralls for Tyler", paid_personally: true },
    ]));

    // certificates for the owner
    ok(await admin.from("documents").insert([
      { company_id: cid, user_id: uid, doc_type: "H2S Alive", title: "H2S Alive", issue_date: iso(day(-1050)), expiry_date: iso(day(40)) },
      { company_id: cid, user_id: uid, doc_type: "First Aid", title: "Standard First Aid & CPR C", issue_date: iso(day(-400)), expiry_date: iso(day(695)) },
      { company_id: cid, user_id: uid, doc_type: "Ground Disturbance", title: "Ground Disturbance Level II", issue_date: iso(day(-700)), expiry_date: iso(day(395)) },
    ]));

    } catch (err) {
      await admin.from("companies").delete().eq("id", cid);
      for (const id of [...made, uid]) await admin.auth.admin.deleteUser(id).catch(() => {});
      throw err;
    }
    return json({ email, password, company_id: cid });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 400);
  }
});
