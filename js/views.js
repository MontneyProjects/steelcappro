// Crew screens: home, safety + forms, tickets, hours & pay + certificates, fuel, More hub, account.
import { sb, S, $, esc, store, toast, msg, svg, view, go, isAdmin, today, iso, dayLabel, money, num, fmtH, initials, first, nameOf,
  truckName, clientName, logoUrl, sheet, closeSheet, uploadFile, signUrls, fileUrl, viewImage, payEvents, nextPay, nice, CONFIG, shrinkImage } from "./core.js";
import { TopBar, PageHead, Section, StickyBar, CompanyBrand, Card, MetricCard, Tile, ListRow, List, Avatar, StatusBadge, EmptyState, Skeleton, Banner, SuccessState,
  PrimaryButton, SecondaryButton, Button, IconButton, FormField, TextArea, Select, SegmentedControl, LineTabs, Stepper, Chips, PeoplePicker, ChecklistRow, Capture, Setting, Toggle,
  setLoading, fieldError, clearErrors, segValue, chipValues, peopleValues } from "./ui.js";
import { submit as outboxSubmit } from "./outbox.js";
import "./admin.js";
import "./ai.js";
import { pushRow, enablePush } from "./push.js";

const dailyTemplates = () => S.templates.filter(t => t.active && t.daily);
const shortName = tp => tp.kind === "pretrip" ? "Pre-Trip" : tp.kind === "toolbox" ? "Toolbox" : tp.kind === "flha" ? "FLHA" : tp.name;
const truckLabel = t => t ? `${t.unit}${t.kind ? " · " + t.kind : ""}` : "";
const truckOpts = () => S.trucks.filter(t => t.active !== false).map(t => ({ value: t.id, label: truckLabel(t) }));
const activePeople = () => S.people.filter(p => p.active);
export function periodOf(d = new Date()) {
  const sched = S.company.pay_schedule || {};
  if (sched.type === "biweekly" || sched.type === "weekly") {
    const b = new Date(d); b.setDate(b.getDate() - 40); const f = new Date(d); f.setDate(f.getDate() + 40);
    const cuts = [...payEvents(sched, b, f).cutoffs].sort(), k = iso(d);
    const end = cuts.find(c => c >= k) || k, prev = cuts.filter(c => c < k).pop();
    const s = prev ? new Date(prev + "T00:00:00") : new Date(d); s.setDate(s.getDate() + 1);
    return { s: iso(s), e: end };
  }
  return d.getDate() <= 15 ? { s: iso(new Date(d.getFullYear(), d.getMonth(), 1)), e: iso(new Date(d.getFullYear(), d.getMonth(), 15)) }
    : { s: iso(new Date(d.getFullYear(), d.getMonth(), 16)), e: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
}
const shortDate = k => new Date(k + "T00:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" });

// ---------- account sheet ----------
export function accountSheet() {
  sheet(`<div class="row" style="margin-bottom:16px">${Avatar({ name: S.me?.full_name || S.user.email, size: "lg", me: true })}<div><h3>${esc(S.me?.full_name || "Your account")}</h3><div class="t-small">${esc(S.user.email)}</div></div></div>
    <div class="list"><div id="pushBox"></div>
      ${Setting("Your name", "What the crew sees", `<button class="link" type="button" id="acName">Edit</button>`)}
      ${Setting("Company", `${S.company.name} · ${S.me?.role || ""}`, S.companies.length > 1 || isAdmin() ? `<button class="link" type="button" id="acSwitch">Switch</button>` : "")}</div>
    <div style="margin-top:16px">${Button("Sign out", { variant: "secondary", icon: "logout", id: "acOut" })}</div>`, async el => {
    el.querySelector("#acOut").onclick = () => { closeSheet(); sb.auth.signOut(); };
    const sw = el.querySelector("#acSwitch"); if (sw) sw.onclick = () => window.__fp.switchCompany();
    el.querySelector("#acName").onclick = () => sheet(`<h3>Your name</h3>${FormField({ id: "nmIn", label: "Full name", value: S.me?.full_name || "" })}${PrimaryButton("Save", { id: "nmSave" })}`, e2 => e2.querySelector("#nmSave").onclick = async () => {
      const n = e2.querySelector("#nmIn").value.trim(); if (!n) return fieldError(e2, "nmIn", "Enter your name");
      await sb.from("members").update({ full_name: n }).eq("company_id", S.company.id).eq("user_id", S.user.id);
      S.me.full_name = n; closeSheet(); toast("Saved"); go(S.view, S.params);
    });
    const pb = el.querySelector("#pushBox"); pb.innerHTML = await pushRow(); pb.onclick = e => { if (e.target.closest("#pushOn")) enablePush(); };
  });
}
document.addEventListener("click", e => { if (e.target.closest("#meBtn")) accountSheet(); });
const meBtn = () => `<button class="avatar-btn" type="button" id="meBtn" aria-label="Account">${esc(initials(S.me?.full_name || S.user.email))}</button>`;

// ---------- HOME ----------
view("home", { async render(main) {
  const t = today(), per = periodOf(), np = nextPay(S.company.pay_schedule), hr = new Date().getHours();
  main.innerHTML = `<div class="home-hero" style="--hero-img:url(hero.jpg)">
      <div class="hh-top">${CompanyBrand()}${meBtn()}</div>
      <div class="hh-greet"><h1>Good ${hr < 12 ? "morning" : hr < 17 ? "afternoon" : "evening"},<br>${esc(first(S.me?.full_name) || "there")}</h1><p class="t-body" id="hSub">&nbsp;</p></div>
    </div>
    <div class="grid-2" id="hTiles">${Skeleton(1, 92)}${Skeleton(1, 92)}</div>
    <div style="margin-top:12px">${PrimaryButton("New field ticket", { icon: "plus", go: "ticket" })}${SecondaryButton("Log fuel", { icon: "fuel", go: "fuel" })}</div>
    <div id="hOrders"></div>
    <div style="margin-top:12px" class="pay-strip"><div><div class="t-label">Hours this pay period</div><div class="ps-val" id="hHours">–</div></div><div><div class="t-label">Next payday</div><div class="ps-val accent" style="font-size:20px">${esc(nice(np.pay))}</div></div></div>
    <div id="hAdmin"></div>
    <div style="margin-top:12px">${List([ListRow({ icon: "spark", title: `Ask ${CONFIG.product}`, sub: "Who missed a Pre-Trip? What's fuel costing us?", go: "ask" })])}</div>`;
  const [subs, tks, ords] = await Promise.all([
    sb.from("form_submissions").select("kind,template_id,user_id").eq("company_id", S.company.id).eq("work_date", t),
    sb.from("tickets").select("hours,work_date,user_id").eq("company_id", S.company.id).eq("user_id", S.user.id).gte("work_date", per.s).lte("work_date", per.e),
    sb.from("dispatch_recipients").select("ack_at, dispatches(*)").eq("user_id", S.user.id),
  ]);
  const done = new Set((subs.data || []).filter(r => r.user_id === S.user.id).map(r => r.template_id));
  const tiles = dailyTemplates().map(tp => ({ label: shortName(tp), done: done.has(tp.id), go: "form", p: { id: tp.id }, icon: tp.kind === "pretrip" ? "truck" : tp.kind === "toolbox" ? "users" : "shield" }));
  tiles.push({ label: "Ticket", done: (tks.data || []).some(r => r.work_date === t), go: "ticket", p: {}, icon: "ticket" });
  $("hTiles").className = tiles.length % 2 === 1 && tiles.length > 2 ? "grid-3" : "grid-2";
  $("hTiles").innerHTML = tiles.map(Tile).join("");
  const left = tiles.filter(x => !x.done).length;
  $("hSub").textContent = left ? `${left} thing${left > 1 ? "s" : ""} left for today.` : "All caught up today. Nice work.";
  $("hHours").innerHTML = `${fmtH((tks.data || []).reduce((a, r) => a + Number(r.hours || 0), 0))}<small> hrs</small>`;
  const orders = (ords.data || []).filter(o => o.dispatches && (!o.dispatches.work_date || o.dispatches.work_date >= t)).sort((a, b) => String(a.dispatches.work_date).localeCompare(String(b.dispatches.work_date))).slice(0, 3);
  if (orders.length) $("hOrders").innerHTML = Section("Your orders") + `<div class="stack">${orders.map(o => { const d = o.dispatches; return Card(`<div class="order-card"><div class="oc-when">${esc(d.work_date ? nice(d.work_date) : "Orders")}${d.start_time ? " · " + esc(d.start_time) : ""}</div>
    <h3>${esc([d.truck_id && "Truck " + truckName(d.truck_id), clientName(d.client_id)].filter(Boolean).join(" · ") || "Marching orders")}</h3>
    <div class="kv">${d.site ? `<div class="wide"><span>Site</span><b>${esc(d.site)}</b></div>` : ""}${d.contact ? `<div class="wide"><span>Contact</span><b>${esc(d.contact)}</b></div>` : ""}</div>
    ${d.notes ? `<p class="t-body" style="margin-top:12px; color:var(--text); white-space:pre-wrap">${esc(d.notes)}</p>` : ""}
    <div style="margin-top:14px">${o.ack_at ? StatusBadge("Got it", "ok", "check") : Button("Got it", { size: "sm", full: false, data: { "data-ack": d.id } })}</div></div>`, { cls: "accent-card" }); }).join("")}</div>`;
  $("hOrders").onclick = async e => { const b = e.target.closest("[data-ack]"); if (!b) return; setLoading(b, true); await sb.from("dispatch_recipients").update({ ack_at: new Date().toISOString() }).eq("dispatch_id", b.dataset.ack).eq("user_id", S.user.id); go("home"); };
  if (isAdmin()) {
    const crew = activePeople(), doneBy = new Set((subs.data || []).map(r => r.user_id));
    const monthStart = iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const [def, pend, disp, rec] = await Promise.all([
      sb.from("form_submissions").select("id", { count: "exact", head: true }).eq("company_id", S.company.id).neq("defects", "[]").is("defect_fixed_at", null),
      sb.from("tickets").select("id", { count: "exact", head: true }).eq("company_id", S.company.id).eq("status", "submitted"),
      sb.from("dispatches").select("id", { count: "exact", head: true }).eq("company_id", S.company.id).gte("work_date", t),
      sb.from("expenses").select("id", { count: "exact", head: true }).eq("company_id", S.company.id).gte("exp_date", monthStart),
    ]);
    $("hAdmin").innerHTML = Section("Running the crew") + `<div class="grid-2">
      ${MetricCard({ label: "Crew today", value: `${doneBy.size}/${crew.length}`, sub: "sent a form", icon: "users", go: "crewtoday" })}
      ${MetricCard({ label: "Truck defects", value: String(def.count || 0), sub: def.count ? "open" : "all clear", icon: "alert", go: "defects", tone: def.count ? "danger" : "" })}
      ${MetricCard({ label: "Dispatch", value: String(disp.count || 0), sub: "upcoming orders", icon: "megaphone", go: "dispatch" })}
      ${MetricCard({ label: "Field tickets", value: String(pend.count || 0), sub: "to approve", icon: "ticket", go: "alltickets", tone: pend.count ? "accent" : "" })}
      </div><div style="margin-top:12px">${List([ListRow({ icon: "receipt", title: "Receipts", sub: `${rec.count || 0} this month`, go: "receipts" })])}</div>`;
  }
} });

// ---------- SAFETY ----------
view("safety", { async render(main) {
  const t = today(), start = new Date(); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start); end.setDate(end.getDate() + 6);
  main.innerHTML = `${PageHead({ title: "Safety", sub: `${shortDate(iso(start))} – ${shortDate(iso(end))}, ${start.getFullYear()}` })}
    <div class="card" style="margin-top:16px"><div class="week" id="sfWeek">${Skeleton(1, 52)}</div></div>
    <div class="stack" id="sfCards" style="margin-top:12px">${Skeleton(3, 72)}</div>
    ${Section("Recent submissions")}<div id="sfRecent">${Skeleton(2)}</div>`;
  const { data } = await sb.from("form_submissions").select("id,kind,template_id,work_date,user_id,truck_id,site,defects,data,created_at").eq("company_id", S.company.id).eq("user_id", S.user.id).gte("work_date", iso(new Date(Date.now() - 30 * 86400000))).order("created_at", { ascending: false }).limit(40);
  const rows = data || [];
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return iso(d); });
  $("sfWeek").innerHTML = days.map(k => { const n = rows.some(r => r.work_date === k), isT = k === t;
    return `<div><div class="wd${isT ? " today-l" : ""}">${new Date(k + "T00:00:00").toLocaleDateString("en-CA", { weekday: "short" })}</div><div class="wc${n ? " done" : isT ? " today" : k > t ? " future" : ""}">${n ? svg("check", 3) : new Date(k + "T00:00:00").getDate()}</div></div>`; }).join("");
  const done = new Set(rows.filter(r => r.work_date === t).map(r => r.template_id));
  $("sfCards").innerHTML = List(S.templates.filter(x => x.active).map(tp => ListRow({ icon: tp.kind === "pretrip" ? "truck" : tp.kind === "toolbox" ? "users" : "shield", iconTone: done.has(tp.id) ? "ok" : "",
    title: tp.name, end: done.has(tp.id) ? StatusBadge("Sent today", "ok", "check") : tp.daily ? StatusBadge("Due today", "bad") : StatusBadge("As needed", "neutral"), go: "form", p: { id: tp.id } })))
    || EmptyState({ icon: "shield", title: "No forms set up", text: "Your admin can turn forms on in Company settings." });
  $("sfRecent").innerHTML = rows.length ? List(rows.slice(0, 8).map(r => { const tp = S.templates.find(x => x.id === r.template_id); const ph = (r.defects || []).reduce((a, d) => a + (d.photos || []).length, 0);
    return ListRow({ icon: r.kind === "pretrip" ? "truck" : r.kind === "toolbox" ? "users" : "shield", iconTone: "neutral", title: tp ? tp.name : r.kind,
      sub: [dayLabel(r.work_date), r.truck_id && "Unit " + truckName(r.truck_id), r.site, ph && `${ph} photo${ph > 1 ? "s" : ""}`].filter(Boolean).join(" · "),
      end: (r.defects || []).length ? StatusBadge(`${r.defects.length} defect${r.defects.length > 1 ? "s" : ""}`, "bad") : StatusBadge("Sent", "ok") }); }))
    : EmptyState({ icon: "shield", title: "Nothing yet", text: "Forms you send show up here." });
} });

// ---------- FILL A FORM ----------
const PEOPLE_FIELDS = ["crew", "attendees"];
view("form", { tab: "safety", noTabs: true, sticky: true, async render(main, p) {
  const tp = S.templates.find(x => x.id === p.id); if (!tp) return go("safety");
  const sc = tp.schema || { fields: [] }, F = { checks: {}, photos: {} };
  const lastTruck = S.trucks.find(x => x.id === store("fp_last_truck")) ? store("fp_last_truck") : "";
  const field = f => {
    if (f.type === "checklist") return `${Section(f.label || "Checklist", `<button class="link" type="button" id="allOk">Mark all OK</button>`)}<div class="checklist">${(f.items || []).map((it, i) => ChecklistRow(i, it)).join("")}</div>`;
    if (f.type === "multi") return `<div class="form-field" style="margin-top:20px"><span class="ff-label">${esc(f.label)} <span class="t-small">(select all that apply)</span></span>${Chips(f.id, f.options || [])}</div>`;
    if (f.type === "people" || PEOPLE_FIELDS.includes(f.id)) return `<div class="form-field" data-field="${esc(f.id)}" style="margin-top:20px"><span class="ff-label">${esc(f.label)}</span>${PeoplePicker(f.id, activePeople(), [S.user.id])}<input class="input" data-f-extra="${esc(f.id)}" placeholder="Others not on the app (optional)" style="margin-top:8px"></div>`;
    if (f.type === "textarea") return TextArea({ id: "f_" + f.id, label: f.label, required: f.required });
    return FormField({ id: "f_" + f.id, label: f.label, required: f.required, inputmode: f.type === "number" ? "decimal" : undefined });
  };
  main.innerHTML = `${TopBar({ title: tp.name, back: "safety" })}<form id="ff" novalidate style="margin-top:8px">
    ${sc.truck ? (S.trucks.length ? Select({ id: "fTruck", label: "Truck", options: truckOpts(), value: lastTruck, placeholder: "Pick your truck", required: true }) : Banner("No trucks set up yet. Your admin can add them in Company settings.", { tone: "warn" })) : ""}
    ${(sc.fields || []).map(field).join("")}</form>
    ${StickyBar(PrimaryButton(`Send ${shortName(tp)}`, { id: "ffSend" }))}`;
  main.querySelectorAll("[data-ck]").forEach(b => b.onclick = () => {
    const i = b.dataset.ck; F.checks[i] = b.dataset.v;
    main.querySelectorAll(`[data-ck="${i}"]`).forEach(x => x.setAttribute("aria-pressed", x.dataset.v === F.checks[i]));
    const row = main.querySelector(`[data-check="${i}"]`); row.classList.toggle("is-defect", F.checks[i] === "bad"); row.classList.remove("missing");
    row.querySelector(".cr-defect").hidden = F.checks[i] !== "bad"; if (F.checks[i] === "bad") row.querySelector("[data-note]").focus();
  });
  const allOk = $("allOk"); if (allOk) allOk.onclick = () => main.querySelectorAll('[data-ck][data-v="ok"]').forEach(b => { if (!F.checks[b.dataset.ck]) b.click(); });
  const picker = document.createElement("input"); picker.type = "file"; picker.accept = "image/*"; picker.capture = "environment";
  main.querySelectorAll("[data-photo]").forEach(b => b.onclick = () => { picker.dataset.i = b.dataset.photo; picker.click(); });
  picker.onchange = () => { const f = picker.files[0], i = picker.dataset.i; picker.value = ""; if (!f) return; (F.photos[i] = F.photos[i] || []).push(f); main.querySelector(`[data-previews="${i}"]`).innerHTML = F.photos[i].map(x => `<img src="${URL.createObjectURL(x)}" alt="Defect photo">`).join(""); };
  $("ffSend").onclick = async () => {
    clearErrors(main);
    const truck = $("fTruck") ? $("fTruck").value : null;
    if (sc.truck && S.trucks.length && !truck) return fieldError(main, "fTruck", "Pick your truck");
    for (const f of sc.fields || []) if (f.required && f.type !== "checklist" && f.type !== "multi" && !PEOPLE_FIELDS.includes(f.id) && !$("f_" + f.id).value.trim()) return fieldError(main, "f_" + f.id, `${f.label} is required`);
    const ck = (sc.fields || []).find(f => f.type === "checklist");
    if (ck) {
      const miss = ck.items.map((_, i) => i).filter(i => !F.checks[i]);
      if (miss.length) { main.querySelector(`[data-check="${miss[0]}"]`).scrollIntoView({ block: "center", behavior: "smooth" }); return toast(`${miss.length} item${miss.length > 1 ? "s" : ""} still need OK or Defect`, "alert"); }
      const noNote = Object.entries(F.checks).find(([i, v]) => v === "bad" && !main.querySelector(`[data-note="${i}"]`).value.trim());
      if (noNote) { const inp = main.querySelector(`[data-note="${noNote[0]}"]`); inp.focus(); return toast("Say what's wrong with each defect", "alert"); }
    }
    setLoading($("ffSend"), true);
    const data = {}, defects = [], uploads = [];
    (sc.fields || []).forEach(f => {
      if (f.type === "checklist") data[f.id] = Object.fromEntries(f.items.map((it, i) => [it, F.checks[i]]));
      else if (f.type === "multi") data[f.id] = chipValues(main, f.id);
      else if (f.type === "people" || PEOPLE_FIELDS.includes(f.id)) { const names = peopleValues(main, f.id).map(nameOf); const extra = main.querySelector(`[data-f-extra="${f.id}"]`).value.trim(); data[f.id] = [...names, ...(extra ? extra.split(",").map(s => s.trim()).filter(Boolean) : [])].join(", "); }
      else data[f.id] = $("f_" + f.id).value.trim();
    });
    if (ck) for (const [i, v] of Object.entries(F.checks)) if (v === "bad") {
      const idx = defects.length;
      defects.push({ item: ck.items[i], note: main.querySelector(`[data-note="${i}"]`).value.trim(), photos: [] });
      for (const f of F.photos[i] || []) { const s = await shrinkImage(f); uploads.push({ area: "defects", blob: s.blob, type: s.type, name: "defect.jpg", set: "defects." + idx }); }
    }
    const row = { company_id: S.company.id, template_id: tp.id, kind: tp.kind, user_id: S.user.id, work_date: today(), truck_id: truck || null, site: data.site || null, data, defects };
    try {
      const r = await outboxSubmit({ label: tp.name, table: "form_submissions", row, uploads });
      if (truck) store("fp_last_truck", truck);
      main.className = "view no-nav";
      main.innerHTML = SuccessState({ title: r.queued ? "Saved on your phone" : `${shortName(tp)} sent`, text: r.queued ? "No signal right now. It sends itself as soon as you're back in range." : defects.length ? `Your boss got the defect alert for ${defects.length} item${defects.length > 1 ? "s" : ""}.` : "You're good to go. Stay safe out there.",
        actions: PrimaryButton("Back to Safety", { go: "safety" }) + SecondaryButton("Home", { go: "home" }) });
    } catch (er) { setLoading($("ffSend"), false); toast("Didn't send. Try again.", "alert"); }
  };
} });

// ---------- TICKETS ----------
view("tickets", { async render(main, p) {
  const mode = isAdmin() && p.all ? "all" : "mine";
  main.innerHTML = `${TopBar({ title: "Field Tickets", action: IconButton("plus", { label: "New ticket", go: "ticket" }) })}
    ${isAdmin() ? `<div style="margin:8px 0 14px">${SegmentedControl("tkMode", [{ value: "mine", label: "My tickets" }, { value: "all", label: "All tickets" }], mode)}</div>` : ""}
    <div id="tkList">${Skeleton(4)}</div>`;
  main.addEventListener("seg", e => e.detail === "all" ? go("alltickets") : null);
  const { data } = await sb.from("tickets").select("*").eq("company_id", S.company.id).eq("user_id", S.user.id).order("work_date", { ascending: false }).limit(80);
  const tag = s => ({ submitted: StatusBadge("Sent", "info"), approved: StatusBadge("Approved", "ok"), invoiced: StatusBadge("Invoiced", "neutral"), rejected: StatusBadge("Fix it", "bad") }[s] || "");
  $("tkList").innerHTML = (data || []).length ? List(data.map(r => ListRow({ title: `${shortDate(r.work_date)}, ${new Date(r.work_date + "T00:00:00").getFullYear()} · ${clientName(r.client_id) || "No client"}`, sub: [r.truck_id && "Unit " + truckName(r.truck_id), fmtH(r.hours) + " hrs", r.site].filter(Boolean).join(" · "), end: tag(r.status) })))
    : EmptyState({ icon: "ticket", title: "No tickets yet", text: "Send your first field ticket and it shows up here.", action: PrimaryButton("New field ticket", { go: "ticket", full: false, icon: "plus" }) });
} });

view("ticket", { tab: "tickets", noTabs: true, sticky: true, async render(main) {
  const last = store("fp_tk_last") || {};
  const lastTruck = S.trucks.find(x => x.id === last.truck) ? last.truck : "";
  main.innerHTML = `${TopBar({ title: "New Field Ticket", back: "tickets" })}<form id="tk" novalidate style="margin-top:8px">
    ${FormField({ id: "tkDate", label: "Date", type: "date", value: today(), required: true })}
    ${S.trucks.length ? Select({ id: "tkTruck", label: "Truck", options: truckOpts(), value: lastTruck, placeholder: "Pick your truck", required: true }) : ""}
    ${Select({ id: "tkClient", label: "Client", options: S.clients.filter(c => c.active !== false).map(c => ({ value: c.id, label: c.name })), value: last.client || "", placeholder: "Pick the client" })}
    ${FormField({ id: "tkSite", label: "Site / LSD", value: last.site || "", placeholder: "e.g. 102/13-22-078-06W6" })}
    <div class="grid-2">${FormField({ id: "tkAfe", label: "AFE / PO", placeholder: "Optional" })}${FormField({ id: "tkCode", label: "Cost code", placeholder: "Optional" })}</div>
    ${FormField({ id: "tkSup", label: "Site supervisor", value: last.sup || "", placeholder: "Optional" })}
    <div class="grid-2" style="margin-bottom:16px">${Stepper({ id: "tkHours", label: "Hours", value: last.hours || 10 })}${Stepper({ id: "tkHelper", label: "Helper hours", value: 0 })}</div>
    ${FormField({ id: "tkStandby", label: "Standby hours", inputmode: "decimal", placeholder: "0" })}
    ${TextArea({ id: "tkDesc", label: "What you did", placeholder: "Lifts, moves, materials, anything the client needs to see" })}
    </form>${StickyBar(PrimaryButton("Submit ticket", { id: "tkSend" }))}`;
  $("tkSend").onclick = async () => {
    clearErrors(main);
    if (!$("tkDate").value) return fieldError(main, "tkDate", "Pick the date");
    if ($("tkTruck") && !$("tkTruck").value) return fieldError(main, "tkTruck", "Pick your truck");
    const hours = num($("tkHours").value) || 0; if (!(hours > 0)) return toast("Put in your hours", "alert");
    setLoading($("tkSend"), true);
    const row = { company_id: S.company.id, user_id: S.user.id, work_date: $("tkDate").value, truck_id: $("tkTruck")?.value || null, client_id: $("tkClient").value || null,
      site: $("tkSite").value.trim() || null, afe: $("tkAfe").value.trim() || null, cost_code: $("tkCode").value.trim() || null, supervisor: $("tkSup").value.trim() || null,
      hours, helper_hours: num($("tkHelper").value) || 0, standby_hours: num($("tkStandby").value) || 0, description: $("tkDesc").value.trim() || null };
    try {
      const r = await outboxSubmit({ label: "Field ticket", table: "tickets", row });
      store("fp_tk_last", { truck: row.truck_id, client: row.client_id, site: row.site, sup: row.supervisor, hours });
      main.className = "view no-nav";
      main.innerHTML = SuccessState({ title: r.queued ? "Saved on your phone" : "Ticket sent", text: r.queued ? "No signal right now. It sends itself when you're back in range." : `${fmtH(hours)} hrs${row.client_id ? " for " + clientName(row.client_id) : ""}. Let's get this bag.`,
        actions: PrimaryButton("Done", { go: "home" }) + SecondaryButton("See my tickets", { go: "tickets" }) });
    } catch (er) { setLoading($("tkSend"), false); toast("Didn't send. Try again.", "alert"); }
  };
} });

// ---------- HOURS & PAY ----------
view("hours", { tab: "more", async render(main, p) {
  const tab = p.tab || "overview";
  main.innerHTML = `${TopBar({ title: "Hours & Pay", back: "more" })}${LineTabs("hpTab", [{ value: "overview", label: "Overview" }, { value: "calendar", label: "Calendar" }, { value: "certs", label: "Certificates" }], tab)}<div id="hpBody">${Skeleton(3, 80)}</div>`;
  main.addEventListener("tab", e => go("hours", { tab: e.detail }));
  const body = $("hpBody");
  if (tab === "overview") {
    const per = periodOf(), np = nextPay(S.company.pay_schedule);
    const [pk, rec] = await Promise.all([
      sb.from("tickets").select("hours").eq("company_id", S.company.id).eq("user_id", S.user.id).gte("work_date", per.s).lte("work_date", per.e),
      sb.from("tickets").select("*").eq("company_id", S.company.id).eq("user_id", S.user.id).order("work_date", { ascending: false }).limit(10),
    ]);
    const hrs = (pk.data || []).reduce((a, r) => a + Number(r.hours || 0), 0);
    body.innerHTML = `${Card(`<div class="row between"><div><div class="t-label">Current pay period</div><div class="t-h3" style="margin-top:4px">${esc(shortDate(per.s))} – ${esc(shortDate(per.e))}</div></div><div class="m-val t-num" style="font-size:30px; font-weight:800">${fmtH(hrs)}<small style="font-size:15px; color:var(--text-3)"> hrs</small></div></div>`)}
      <div style="margin-top:12px">${List([ListRow({ icon: "scissors", iconTone: "warn", title: "Next cut-off", sub: nice(np.cut) }), ListRow({ icon: "calendar", title: "Next payday", sub: nice(np.pay) })])}</div>
      ${Section("Recent tickets")}${(rec.data || []).length ? List(rec.data.map(r => ListRow({ title: `${shortDate(r.work_date)} · ${clientName(r.client_id) || "No client"}`, sub: [r.truck_id && "Unit " + truckName(r.truck_id), fmtH(r.hours) + " hrs"].filter(Boolean).join(" · "),
        end: StatusBadge({ submitted: "Sent", approved: "Approved", invoiced: "Invoiced", rejected: "Fix it" }[r.status] || r.status, { submitted: "info", approved: "ok", invoiced: "neutral", rejected: "bad" }[r.status]) }))) : EmptyState({ icon: "ticket", title: "No tickets yet" })}`;
  }
  if (tab === "calendar") {
    const now = new Date(), m = p.m ? new Date(p.m + "T00:00:00") : new Date(now.getFullYear(), now.getMonth(), 1);
    const { data } = await sb.from("tickets").select("work_date,hours").eq("company_id", S.company.id).eq("user_id", S.user.id).gte("work_date", iso(m)).lte("work_date", iso(new Date(m.getFullYear(), m.getMonth() + 1, 0)));
    const hrs = {}; (data || []).forEach(r => hrs[r.work_date] = (hrs[r.work_date] || 0) + Number(r.hours || 0));
    const ev = payEvents(S.company.pay_schedule, new Date(m.getFullYear(), m.getMonth(), 1), new Date(m.getFullYear(), m.getMonth() + 1, 0));
    const lead = (m.getDay() + 6) % 7, days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate(), t = today();
    let cells = ""; for (let i = 0; i < lead; i++) cells += "<div></div>";
    for (let d = 1; d <= days; d++) { const k = iso(new Date(m.getFullYear(), m.getMonth(), d)), v = hrs[k];
      cells += `<div class="${(k === t ? "t" : v ? "w" : k > t ? "f" : "") + (ev.paydays.has(k) ? " pay" : "") + (ev.cutoffs.has(k) ? " cut" : "")}"><span class="n">${d}</span><span class="h">${v ? fmtH(v) : ""}</span></div>`; }
    const mo = k => JSON.stringify({ tab: "calendar", m: iso(k) });
    body.innerHTML = Card(`<div class="cal-head"><h3>${esc(m.toLocaleDateString("en-CA", { month: "long", year: "numeric" }))}</h3><div class="row" style="gap:4px">
      <button class="icon-btn boxed" type="button" data-go="hours" data-p='${mo(new Date(m.getFullYear(), m.getMonth() - 1, 1))}' aria-label="Previous month">${svg("left")}</button>
      <button class="icon-btn boxed" type="button" data-go="hours" data-p='${mo(new Date(m.getFullYear(), m.getMonth() + 1, 1))}' aria-label="Next month">${svg("chev")}</button></div></div>
      <div class="dow"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div><div class="cal">${cells}</div>
      <div class="legend"><span><i class="lp">$</i>Payday</span><span><i class="lc"></i>Cut-off</span><span><i style="background:var(--card-2); border:1px solid var(--border-2)"></i>Hours worked</span></div>`);
  }
  if (tab === "certs") {
    const { data } = await sb.from("documents").select("*").eq("company_id", S.company.id).eq("user_id", S.user.id).order("expiry_date", { ascending: true, nullsFirst: false });
    const t = today();
    const st = d => { if (!d) return ["neutral", "No expiry", "file", "neutral"]; const left = Math.round((new Date(d + "T00:00:00") - new Date(t + "T00:00:00")) / 86400000);
      return left < 0 ? ["bad", "Expired", "alert", "danger"] : left <= 60 ? ["warn", `Expires in ${left} days`, "clock", "warn"] : ["ok", "Valid", "award", "ok"]; };
    body.innerHTML = `${(data || []).length ? List(data.map(d => { const [tone, label, ic, icTone] = st(d.expiry_date);
      return ListRow({ icon: ic, iconTone: icTone, title: d.title || d.doc_type, sub: d.expiry_date ? `Expires ${new Date(d.expiry_date + "T00:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}` : "No expiry date", end: StatusBadge(label, tone), data: d.file_path ? { "data-doc": d.file_path } : {} }); }))
      : EmptyState({ icon: "award", title: "No certificates yet", text: "Add your H2S, First Aid and other tickets. You'll get a heads-up before they expire." })}
      <div style="margin-top:14px">${SecondaryButton("Add certificate", { icon: "plus", id: "hpAdd" })}</div>`;
    body.onclick = async e => { const b = e.target.closest("[data-doc]"); if (!b) return; await signUrls([b.dataset.doc]); const u = fileUrl(b.dataset.doc); if (u) window.open(u, "_blank"); };
    $("hpAdd").onclick = () => docSheet(S.user.id, () => go("hours", { tab: "certs" }));
  }
} });

export function docSheet(userId, done) {
  const TYPES = ["H2S Alive", "Standard First Aid", "Ground Disturbance", "CSTS", "PST / OSSA", "WHMIS", "TDG", "Fall Protection", "Confined Space", "AWP", "Driver's licence", "Crane / picker certification", "Other"];
  let file = null;
  sheet(`<h3>Add certificate</h3><p class="sh-sub">Snap a photo of the card. You'll get a reminder before it expires.</p>
    ${Select({ id: "dsType", label: "Type", options: TYPES })}${FormField({ id: "dsExp", label: "Expiry date", type: "date" })}
    <button type="button" class="logo-drop" id="dsPick" style="min-height:88px">${svg("camera")} Photo or PDF</button><input type="file" id="dsFile" accept="image/*,application/pdf" hidden>
    <div style="margin-top:16px">${PrimaryButton("Save certificate", { id: "dsSave" })}</div><p class="form-msg" id="dsMsg"></p>`, el => {
    el.querySelector("#dsPick").onclick = () => el.querySelector("#dsFile").click();
    el.querySelector("#dsFile").onchange = () => { file = el.querySelector("#dsFile").files[0]; if (file) el.querySelector("#dsPick").innerHTML = `${svg("check")} ${esc(file.name)}`; };
    el.querySelector("#dsSave").onclick = async () => {
      setLoading(el.querySelector("#dsSave"), true);
      let path = null; if (file) { try { path = (await uploadFile("docs", file)).path; } catch (e) { setLoading(el.querySelector("#dsSave"), false); return msg(el.querySelector("#dsMsg"), "Upload failed. Try again.", "bad"); } }
      const t = el.querySelector("#dsType").value;
      const { error } = await sb.from("documents").insert({ company_id: S.company.id, user_id: userId, doc_type: t, title: t, expiry_date: el.querySelector("#dsExp").value || null, file_path: path });
      setLoading(el.querySelector("#dsSave"), false);
      if (error) return msg(el.querySelector("#dsMsg"), error.message, "bad");
      closeSheet(); toast("Certificate saved"); done && done();
    };
  });
}

// ---------- FUEL ----------
view("fuel", { tab: "more", noTabs: true, sticky: true, async render(main) {
  let file = null;
  const lastTruck = S.trucks.find(x => x.id === store("fp_last_truck")) ? store("fp_last_truck") : "";
  main.innerHTML = `${TopBar({ title: "Fuel", back: "home" })}
    ${S.trucks.length ? Select({ id: "fuTruck", label: "Truck", options: truckOpts(), value: lastTruck, placeholder: "Pick the truck", required: true }) : ""}
    ${Capture("fuShot", { title: "Snap the receipt", sub: "It reads the litres and cost for you" })}<input type="file" id="fuFile" accept="image/*" capture="environment" hidden>
    <div class="reading" id="fuReading" hidden><span class="spinner"></span>Reading the receipt...</div>
    <div style="margin-top:16px" class="grid-2">${FormField({ id: "fuL", label: "Litres", inputmode: "decimal" })}${FormField({ id: "fuP", label: "$ / L", inputmode: "decimal" })}${FormField({ id: "fuG", label: "GST", inputmode: "decimal" })}${FormField({ id: "fuT", label: "Total $", inputmode: "decimal", required: true })}</div>
    ${FormField({ id: "fuStation", label: "Station", placeholder: "Cardlock" })}
    <div class="grid-2">${FormField({ id: "fuDate", label: "Date", type: "date", value: today() })}${FormField({ id: "fuO", label: "Odometer", inputmode: "numeric" })}</div>
    <p class="form-msg" id="fuMsg"></p>
    ${Section(isAdmin() ? "Fuel by day" : "Your fill-ups")}<div id="fuList">${Skeleton(2)}</div>
    ${StickyBar(PrimaryButton("Save fill-up", { id: "fuSave" }))}`;
  $("fuShot").onclick = () => $("fuFile").click();
  $("fuFile").onchange = async () => {
    const f = $("fuFile").files[0]; $("fuFile").value = ""; if (!f) return; file = f;
    $("fuShot").innerHTML = `<img src="${URL.createObjectURL(f)}" alt="Receipt"><span class="cap-tag">${svg("camera")}Retake</span>`; $("fuReading").hidden = false;
    const { readReceipt } = await import("./ai.js");
    const r = navigator.onLine ? await readReceipt(f, "fuel") : null; $("fuReading").hidden = true;
    if (r) { if (r.date) $("fuDate").value = r.date; if (r.vendor) $("fuStation").value = r.vendor; if (r.litres) $("fuL").value = r.litres; if (r.price_per_litre) $("fuP").value = r.price_per_litre; if (r.gst != null) $("fuG").value = Number(r.gst).toFixed(2); if (r.total) $("fuT").value = Number(r.total).toFixed(2);
      msg("fuMsg", r.total ? "Got it. Check the numbers, then save." : "Couldn't read all of it. Fill in what's missing.", r.total ? "ok" : "bad"); }
    else msg("fuMsg", navigator.onLine ? "Couldn't read it. Type the numbers in." : "No signal to read it. Type the numbers in; the photo still saves.", "bad");
  };
  $("fuSave").onclick = async () => {
    clearErrors(main);
    if ($("fuTruck") && !$("fuTruck").value) return fieldError(main, "fuTruck", "Pick the truck");
    const total = num($("fuT").value); if (!(total > 0)) return fieldError(main, "fuT", "Enter the total");
    setLoading($("fuSave"), true);
    const row = { company_id: S.company.id, user_id: S.user.id, truck_id: $("fuTruck")?.value || null, fill_date: $("fuDate").value, station: $("fuStation").value.trim() || null,
      litres: num($("fuL").value), price_per_l: num($("fuP").value), gst: num($("fuG").value), total, odometer: $("fuO").value.trim() || null };
    const uploads = []; if (file) { const s = await shrinkImage(file); uploads.push({ area: "fuel", blob: s.blob, type: s.type, name: "receipt.jpg", set: "receipt_path" }); }
    try { const r = await outboxSubmit({ label: "Fuel", table: "fuel_logs", row, uploads }); store("fp_last_truck", row.truck_id); toast(r.queued ? "Saved. Sends when you have signal" : "Fuel saved", r.queued ? "cloudoff" : "check"); go("fuel"); }
    catch (e) { setLoading($("fuSave"), false); toast("Didn't save. Try again.", "alert"); }
  };
  const since = new Date(); since.setDate(since.getDate() - 31);
  const { data } = await sb.from("fuel_logs").select("*").eq("company_id", S.company.id).gte("fill_date", iso(since)).order("fill_date", { ascending: false }).limit(300);
  const rows = data || []; await signUrls(rows.map(r => r.receipt_path));
  const days = {}; rows.forEach(r => (days[r.fill_date] = days[r.fill_date] || []).push(r));
  $("fuList").innerHTML = Object.keys(days).map(k => `<div class="day-group"><div class="dg-head">${esc(dayLabel(k))}<b>${money(days[k].reduce((a, r) => a + Number(r.total || 0), 0))}</b></div>
    ${List(days[k].map(r => ListRow({ thumb: r.receipt_path ? fileUrl(r.receipt_path) : null, icon: r.receipt_path ? null : "fuel", iconTone: "neutral", title: `Unit ${truckName(r.truck_id) || "?"}${r.station ? " · " + r.station : ""}`, sub: [r.litres && Number(r.litres).toFixed(1) + " L", isAdmin() && first(nameOf(r.user_id))].filter(Boolean).join(" · "), end: `<b class="t-num" style="color:var(--text)">${money(r.total)}</b>`, data: r.receipt_path && fileUrl(r.receipt_path) ? { "data-big": fileUrl(r.receipt_path) } : {} })))}</div>`).join("")
    || EmptyState({ icon: "fuel", title: "No fill-ups yet", text: "Snap your next cardlock receipt." });
  $("fuList").onclick = e => { const b = e.target.closest("[data-big]"); if (b) viewImage(b.dataset.big); };
} });

// ---------- MORE ----------
view("more", { async render(main) {
  main.innerHTML = `<div class="page-head"><div>${CompanyBrand()}<h1 class="t-display" style="margin-top:14px">More</h1></div>${meBtn()}</div>
    <div style="margin-top:16px">${List([
      ListRow({ icon: "clock", title: "Hours & Pay", sub: "Pay calendar, cut-offs, your tickets", go: "hours" }),
      ListRow({ icon: "award", title: "Certificates", sub: "H2S, First Aid and the rest", go: "hours", p: { tab: "certs" } }),
      ListRow({ icon: "fuel", title: "Fuel", sub: "Snap the cardlock receipt", go: "fuel" }),
      ListRow({ icon: "spark", title: `Ask ${CONFIG.product}`, sub: "Your AI office assistant", go: "ask" })])}</div>
    ${isAdmin() ? `${Section("Running the company")}${List([
      ListRow({ icon: "users", title: "Crew today", sub: "Who's done their forms", go: "crewtoday" }),
      ListRow({ icon: "alert", title: "Truck defects", sub: "From Pre-Trips, with photos", go: "defects" }),
      ListRow({ icon: "megaphone", title: "Dispatch", sub: "Send orders to the crew", go: "dispatch" }),
      ListRow({ icon: "ticket", title: "Field tickets", sub: "Approve, then invoice or export", go: "alltickets" }),
      ListRow({ icon: "receipt", title: "Receipts", sub: "Into QuickBooks with the photo", go: "receipts" })])}
      ${Section("Company")}${List([
      ListRow({ icon: "users", title: "Team & invites", sub: "Add crew, set admins", go: "team" }),
      ListRow({ icon: "gear", title: "Company settings", sub: "Logo, look, trucks, clients, forms, pay", go: "settings" }),
      ListRow({ icon: "link", title: "Books", sub: (S.company.books || "quickbooks") === "quickbooks" ? (S.company.qbo_connected ? "QuickBooks · connected" : "QuickBooks, Excel or Google Sheets") : (S.company.books === "sheets" ? "Google Sheets · live link" : "Excel"), go: "integrations" })])}` : ""}
    <div style="margin-top:24px">${SecondaryButton("Account & notifications", { id: "moAcct", icon: "user" })}</div>`;
  $("moAcct").onclick = accountSheet;
} });
