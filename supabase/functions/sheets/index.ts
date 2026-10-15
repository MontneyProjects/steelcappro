// Steelcap Pro live spreadsheet feed. A company admin gets a private link (sheet_feeds.token).
// Google Sheets:  =IMPORTDATA("https://hsyscwheyixsxzqahvbr.supabase.co/functions/v1/sheets?t=TOKEN&tab=tickets")
// Excel:          Data > From Web > same link (then Refresh All)
// Tabs: tickets (default), trucks, clients, fuel, receipts.  Dates: ?days=90 (default) or ?from=YYYY-MM-DD&to=YYYY-MM-DD
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*" };
const csvCell = (v: unknown) => { if (v == null) return ""; const s = String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const csv = (rows: Record<string, unknown>[], cols: string[]) => [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\r\n") + "\r\n";
const r2 = (n: number) => Math.round(n * 100) / 100;
const n = (v: unknown) => Number(v || 0);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const dateOk = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const text = (body: string, status = 200) => new Response(body, { status, headers: { ...cors, "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const u = new URL(req.url);
  const token = u.searchParams.get("t") || "";
  if (!/^[a-f0-9]{24,64}$/.test(token)) return text("error\r\nMissing or bad link. Copy it again from Steelcap Pro > More > Books.\r\n", 401);
  const { data: feed } = await admin.from("sheet_feeds").select("company_id").eq("token", token).maybeSingle();
  if (!feed) return text("error\r\nThis link was turned off. Copy the new one from Steelcap Pro > More > Books.\r\n", 401);
  const cid = feed.company_id;

  const tab = (u.searchParams.get("tab") || "tickets").toLowerCase();
  let from = u.searchParams.get("from"), to = u.searchParams.get("to");
  if (!dateOk(from) || !dateOk(to)) {
    const days = Math.min(Math.max(parseInt(u.searchParams.get("days") || "90") || 90, 1), 1100);
    to = isoDate(new Date()); from = isoDate(new Date(Date.now() - days * 86400000));
  }

  const [co, tr, cl, mem] = await Promise.all([
    admin.from("companies").select("name,solo_rate").eq("id", cid).single(),
    admin.from("trucks").select("id,unit,kind,plate,rate_hour").eq("company_id", cid),
    admin.from("clients").select("id,name,rate_hour").eq("company_id", cid),
    admin.from("members").select("user_id,full_name").eq("company_id", cid),
  ]);
  const trucks = tr.data || [], clients = cl.data || [], members = mem.data || [];
  const solo = co.data?.solo_rate ? Number(co.data.solo_rate) : 0;
  const truckName = (id: string | null) => trucks.find((t) => t.id === id)?.unit || "";
  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name || "";
  const crewName = (id: string | null) => members.find((m) => m.user_id === id)?.full_name || "";
  // same as the app: client rate (or truck rate) with a helper; the company's no-helper rate when there's no helper
  const rateFor = (t: any) => { const base = n(clients.find((c) => c.id === t.client_id)?.rate_hour) || n(trucks.find((x) => x.id === t.truck_id)?.rate_hour); return n(t.helper_hours) > 0 ? base : (solo || base); };
  const status = (s: string) => ({ submitted: "Waiting for approval", approved: "Approved", invoiced: "Invoiced", rejected: "Sent back" } as Record<string, string>)[s] || s;

  const loadTickets = async () => (await admin.from("tickets").select("*").eq("company_id", cid).neq("status", "rejected").gte("work_date", from).lte("work_date", to).order("work_date").limit(5000)).data || [];
  const loadFuel = async () => (await admin.from("fuel_logs").select("*").eq("company_id", cid).gte("fill_date", from).lte("fill_date", to).order("fill_date").limit(5000)).data || [];
  const ticketRow = (t: any) => { const rate = rateFor(t); return { Date: t.work_date, Crew: crewName(t.user_id), Truck: truckName(t.truck_id), Client: clientName(t.client_id), "Site / LSD": t.site, "AFE / PO": t.afe, "Cost code": t.cost_code, Supervisor: t.supervisor, Hours: n(t.hours), "Helper hours": n(t.helper_hours), "Standby hours": n(t.standby_hours), Rate: rate, Amount: r2((n(t.hours) + n(t.standby_hours)) * rate), Status: status(t.status), Invoice: t.invoice_ref, "What they did": t.description }; };

  if (tab === "tickets") {
    const rows = (await loadTickets()).map(ticketRow);
    return text(csv(rows, ["Date", "Crew", "Truck", "Client", "Site / LSD", "AFE / PO", "Cost code", "Supervisor", "Hours", "Helper hours", "Standby hours", "Rate", "Amount", "Status", "Invoice", "What they did"]));
  }
  if (tab === "trucks") {
    const [tk, fu] = await Promise.all([loadTickets(), loadFuel()]);
    const by: Record<string, any> = {};
    const get = (k: string) => by[k] = by[k] || { Truck: k, Tickets: 0, Hours: 0, "Helper hours": 0, Billed: 0, Fuel: 0 };
    tk.map(ticketRow).forEach((r) => { const x = get(r.Truck || "No truck"); x.Tickets++; x.Hours += r.Hours; x["Helper hours"] += r["Helper hours"]; x.Billed += r.Amount; });
    fu.forEach((f: any) => { get(truckName(f.truck_id) || "No truck").Fuel += n(f.total); });
    const rows = Object.values(by).sort((a: any, b: any) => String(a.Truck).localeCompare(String(b.Truck))).map((x: any) => ({ ...x, Hours: r2(x.Hours), "Helper hours": r2(x["Helper hours"]), Billed: r2(x.Billed), Fuel: r2(x.Fuel), "Billed minus fuel": r2(x.Billed - x.Fuel) }));
    return text(csv(rows, ["Truck", "Tickets", "Hours", "Helper hours", "Billed", "Fuel", "Billed minus fuel"]));
  }
  if (tab === "clients") {
    const by: Record<string, any> = {};
    (await loadTickets()).map(ticketRow).forEach((r) => { const k = r.Client || "No client"; const x = by[k] = by[k] || { Client: k, Tickets: 0, Hours: 0, Billed: 0 }; x.Tickets++; x.Hours += r.Hours; x.Billed += r.Amount; });
    const rows = Object.values(by).sort((a: any, b: any) => b.Billed - a.Billed).map((x: any) => ({ ...x, Hours: r2(x.Hours), Billed: r2(x.Billed) }));
    return text(csv(rows, ["Client", "Tickets", "Hours", "Billed"]));
  }
  if (tab === "fuel") {
    const rows = (await loadFuel()).map((f: any) => ({ Date: f.fill_date, Truck: truckName(f.truck_id), Crew: crewName(f.user_id), Station: f.station, Litres: f.litres, "$ per litre": f.price_per_l, GST: f.gst, Total: n(f.total), Odometer: f.odometer }));
    return text(csv(rows, ["Date", "Truck", "Crew", "Station", "Litres", "$ per litre", "GST", "Total", "Odometer"]));
  }
  if (tab === "receipts") {
    const { data } = await admin.from("expenses").select("*").eq("company_id", cid).gte("exp_date", from).lte("exp_date", to).order("exp_date").limit(5000);
    const rows = (data || []).map((e: any) => ({ Date: e.exp_date, Vendor: e.vendor, Category: e.category, Total: n(e.total), GST: e.gst, "Paid personally": e.paid_personally ? "Yes" : "", Note: e.notes, QuickBooks: e.qbo_status === "posted" ? "In QuickBooks" : "" }));
    return text(csv(rows, ["Date", "Vendor", "Category", "Total", "GST", "Paid personally", "Note", "QuickBooks"]));
  }
  return text("error\r\nUnknown tab. Use tickets, trucks, clients, fuel or receipts.\r\n", 400);
});
