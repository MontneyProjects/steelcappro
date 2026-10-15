// Excel export for owners/admins. Works with or without QuickBooks: tickets (with rates and amounts),
// a tab per truck like a ticketing sheet, totals by truck and by client, plus fuel and receipts.
import { sb, S, esc, toast, svg, iso, today, nameOf, truckName, clientName, sheet, closeSheet, CONFIG } from "./core.js";
import { Select, FormField, PrimaryButton, Setting, Toggle, setLoading } from "./ui.js";

let xlsxLib = null;
const loadXLSX = () => xlsxLib || (xlsxLib = new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"; s.onload = () => res(window.XLSX); s.onerror = rej; document.head.appendChild(s); }));

// rate used for a ticket: client rate (or truck rate) with a helper; the company's no-helper rate when there's no helper
export function rateFor(t) {
  const c = S.clients.find(x => x.id === t.client_id), tr = S.trucks.find(x => x.id === t.truck_id);
  const base = (c && c.rate_hour) || (tr && tr.rate_hour) || 0;
  return Number(t.helper_hours) > 0 ? base : (S.company.solo_rate || base);
}
const r2 = n => Math.round(n * 100) / 100;

function ranges() {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth();
  const per = (dt) => dt.getDate() <= 15 ? [iso(new Date(dt.getFullYear(), dt.getMonth(), 1)), iso(new Date(dt.getFullYear(), dt.getMonth(), 15))] : [iso(new Date(dt.getFullYear(), dt.getMonth(), 16)), iso(new Date(dt.getFullYear(), dt.getMonth() + 1, 0))];
  const cur = per(d), prevEnd = new Date(cur[0] + "T00:00:00"); prevEnd.setDate(prevEnd.getDate() - 1);
  return {
    period: { label: "This pay period", v: cur },
    lastperiod: { label: "Last pay period", v: per(prevEnd) },
    month: { label: "This month", v: [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))] },
    lastmonth: { label: "Last month", v: [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))] },
    year: { label: "This year", v: [iso(new Date(y, 0, 1)), today()] },
    custom: { label: "Pick dates", v: null },
  };
}

export function exportSheet() {
  const R = ranges();
  sheet(`<h3>Download Excel</h3><p class="sh-sub">Every ticket with rates and amounts, a tab for each truck, and totals by truck and client. Use it for invoicing, payroll or your accountant.</p>
    ${Select({ id: "exRange", label: "Dates", options: Object.entries(R).map(([k, o]) => ({ value: k, label: o.label + (o.v ? ` (${o.v[0].slice(5)} to ${o.v[1].slice(5)})` : "") })), value: "period" })}
    <div class="grid-2" id="exCustom" hidden>${FormField({ id: "exFrom", label: "From", type: "date" })}${FormField({ id: "exTo", label: "To", type: "date", value: today() })}</div>
    <div class="list" style="margin-bottom:16px">${Setting("Include fuel", "Fill-ups by truck", Toggle("exFuel", true))}${Setting("Include receipts", "Company expenses", Toggle("exRec", true))}</div>
    ${PrimaryButton("Download Excel", { id: "exGo", icon: "upload" })}<p class="form-msg" id="exMsg"></p>`, el => {
    const sel = el.querySelector("#exRange");
    sel.onchange = () => { el.querySelector("#exCustom").hidden = sel.value !== "custom"; };
    el.querySelector("#exGo").onclick = async () => {
      const btn = el.querySelector("#exGo");
      const [from, to] = sel.value === "custom" ? [el.querySelector("#exFrom").value, el.querySelector("#exTo").value] : R[sel.value].v;
      if (!from || !to) { el.querySelector("#exMsg").textContent = "Pick both dates."; el.querySelector("#exMsg").className = "form-msg bad"; return; }
      setLoading(btn, true);
      try { await build(from, to, el.querySelector("#exFuel").checked, el.querySelector("#exRec").checked); closeSheet(); toast("Spreadsheet downloaded", "upload"); }
      catch (e) { console.error(e); el.querySelector("#exMsg").textContent = "Couldn't build the spreadsheet. Check your signal and try again."; el.querySelector("#exMsg").className = "form-msg bad"; }
      setLoading(btn, false);
    };
  });
}

async function build(from, to, withFuel, withReceipts) {
  const XLSX = await loadXLSX();
  const cid = S.company.id;
  const [tk, fu, ex] = await Promise.all([
    sb.from("tickets").select("*").eq("company_id", cid).gte("work_date", from).lte("work_date", to).order("work_date"),
    withFuel ? sb.from("fuel_logs").select("*").eq("company_id", cid).gte("fill_date", from).lte("fill_date", to).order("fill_date") : Promise.resolve({ data: [] }),
    withReceipts ? sb.from("expenses").select("*").eq("company_id", cid).gte("exp_date", from).lte("exp_date", to).order("exp_date") : Promise.resolve({ data: [] }),
  ]);
  if (tk.error) throw tk.error;
  const tickets = tk.data || [], fuel = fu.data || [], recs = ex.data || [];
  const status = s => ({ submitted: "Waiting for approval", approved: "Approved", invoiced: "Invoiced", rejected: "Sent back" }[s] || s);
  const row = t => { const rate = rateFor(t), billable = Number(t.hours || 0) + Number(t.standby_hours || 0);
    return { Date: t.work_date, Crew: nameOf(t.user_id), Truck: truckName(t.truck_id), Client: clientName(t.client_id), "Site / LSD": t.site || "", "AFE / PO": t.afe || "", "Cost code": t.cost_code || "", Supervisor: t.supervisor || "",
      Hours: Number(t.hours || 0), "Helper hours": Number(t.helper_hours || 0), "Standby hours": Number(t.standby_hours || 0), Rate: rate, Amount: r2(billable * rate), Status: status(t.status), Invoice: t.invoice_ref || "", "What they did": t.description || "" }; };
  const wb = XLSX.utils.book_new();
  const add = (name, rows, widths) => {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "Nothing in these dates" }]);
    if (widths) ws["!cols"] = widths.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name.replace(/[\\/?*[\]:]/g, "-").slice(0, 31));
  };
  const W = [11, 18, 10, 22, 20, 12, 10, 14, 7, 8, 8, 7, 10, 18, 12, 40];
  const all = tickets.map(row);

  // summary
  const byTruck = {}, byClient = {};
  tickets.forEach(t => { const r = row(t), k = r.Truck || "No truck", c = r.Client || "No client";
    byTruck[k] = byTruck[k] || { Truck: k, Tickets: 0, Hours: 0, "Helper hours": 0, Billed: 0, Fuel: 0 }; byTruck[k].Tickets++; byTruck[k].Hours += r.Hours; byTruck[k]["Helper hours"] += r["Helper hours"]; byTruck[k].Billed += r.Amount;
    byClient[c] = byClient[c] || { Client: c, Tickets: 0, Hours: 0, Billed: 0 }; byClient[c].Tickets++; byClient[c].Hours += r.Hours; byClient[c].Billed += r.Amount; });
  fuel.forEach(f => { const k = truckName(f.truck_id) || "No truck"; byTruck[k] = byTruck[k] || { Truck: k, Tickets: 0, Hours: 0, "Helper hours": 0, Billed: 0, Fuel: 0 }; byTruck[k].Fuel += Number(f.total || 0); });
  const truckRows = Object.values(byTruck).sort((a, b) => String(a.Truck).localeCompare(String(b.Truck))).map(x => ({ ...x, Hours: r2(x.Hours), "Helper hours": r2(x["Helper hours"]), Billed: r2(x.Billed), Fuel: r2(x.Fuel), "Billed minus fuel": r2(x.Billed - x.Fuel) }));
  const clientRows = Object.values(byClient).sort((a, b) => b.Billed - a.Billed).map(x => ({ ...x, Hours: r2(x.Hours), Billed: r2(x.Billed) }));
  const totalBilled = r2(all.reduce((a, r) => a + r.Amount, 0)), totalHours = r2(all.reduce((a, r) => a + r.Hours, 0)), totalFuel = r2(fuel.reduce((a, f) => a + Number(f.total || 0), 0));
  const summary = XLSX.utils.aoa_to_sheet([
    [S.company.name], [`Dates: ${from} to ${to}`], [`Made with ${CONFIG.product} on ${today()}`], [],
    ["Tickets", tickets.length], ["Hours", totalHours], ["Billed (before GST)", totalBilled], ["Fuel", totalFuel], [],
    ["Rates: client rate when a helper is on the ticket" + (S.company.solo_rate ? `, $${S.company.solo_rate}/hr when there's no helper` : "") + ". Amount = (hours + standby) × rate."],
  ]);
  summary["!cols"] = [{ wch: 26 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, summary, "Summary");
  add("By truck", truckRows, [12, 9, 8, 12, 12, 10, 16]);
  add("By client", clientRows, [26, 9, 8, 12]);
  add("All tickets", all, W);
  // a tab per truck, like a ticketing sheet
  [...new Set(all.map(r => r.Truck || "No truck"))].sort().forEach(k => add("Truck " + k, all.filter(r => (r.Truck || "No truck") === k), W));
  if (withFuel) add("Fuel", fuel.map(f => ({ Date: f.fill_date, Truck: truckName(f.truck_id), Crew: nameOf(f.user_id), Station: f.station || "", Litres: f.litres != null ? Number(f.litres) : "", "$ per litre": f.price_per_l != null ? Number(f.price_per_l) : "", GST: f.gst != null ? Number(f.gst) : "", Total: Number(f.total || 0), Odometer: f.odometer || "" })), [11, 10, 18, 20, 9, 10, 9, 10, 10]);
  if (withReceipts) add("Receipts", recs.map(e => ({ Date: e.exp_date, Vendor: e.vendor || "", Category: e.category || "", Total: Number(e.total || 0), GST: e.gst != null ? Number(e.gst) : "", "Paid personally": e.paid_personally ? "Yes" : "", Note: e.notes || "", QuickBooks: e.qbo_status === "posted" ? "In QuickBooks" : "" })), [11, 24, 22, 10, 9, 14, 30, 14]);
  const safe = S.company.name.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
  XLSX.writeFile(wb, `${safe}-${from}-to-${to}.xlsx`);
}
