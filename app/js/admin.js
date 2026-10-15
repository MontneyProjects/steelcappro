// Owner/admin screens: crew today, defects, dispatch, ticket approval + invoice drafts, receipts, team, settings, safety forms, QuickBooks.
import { sb, S, $, esc, toast, msg, svg, view, go, isAdmin, isOwner, today, iso, dayLabel, money, num, fmtH, initials, first, nameOf,
  truckName, clientName, sheet, closeSheet, uploadFile, signUrls, fileUrl, viewImage, loadCompany, CONFIG } from "./core.js";
import { TopBar, Section, StickyBar, Card, MetricCard, ListRow, List, Avatar, StatusBadge, EmptyState, Skeleton, Banner,
  PrimaryButton, SecondaryButton, Button, IconButton, FormField, TextArea, Select, SegmentedControl, Chips, PeoplePicker, Capture, Setting, Toggle,
  setLoading, fieldError, clearErrors, segValue, peopleValues, RadioList } from "./ui.js";
import { exportSheet, rateFor, ranges } from "./export.js";

const guard = main => { if (isAdmin()) return true; main.innerHTML = `${TopBar({ title: "Admins only", back: "home" })}${EmptyState({ icon: "lock", title: "Admins only", text: "Ask your boss if you need access to this." })}`; return false; };
const shortDate = k => new Date(k + "T00:00:00").toLocaleDateString("en-CA", { month: "short", day: "numeric" });
const truckOpts = () => S.trucks.filter(t => t.active !== false).map(t => ({ value: t.id, label: `${t.unit}${t.kind ? " · " + t.kind : ""}` }));

// ---------- crew today ----------
view("crewtoday", { tab: "home", async render(main) {
  if (!guard(main)) return;
  main.innerHTML = `${TopBar({ title: "Crew today", back: "home" })}<div id="ctBody">${Skeleton(4)}</div>`;
  const t = today();
  const [f, k] = await Promise.all([
    sb.from("form_submissions").select("user_id,template_id").eq("company_id", S.company.id).eq("work_date", t),
    sb.from("tickets").select("user_id").eq("company_id", S.company.id).eq("work_date", t),
  ]);
  const daily = S.templates.filter(x => x.active && x.daily), crew = S.people.filter(p => p.active);
  const by = {}; (f.data || []).forEach(r => (by[r.user_id] = by[r.user_id] || new Set()).add(r.template_id));
  const tk = new Set((k.data || []).map(r => r.user_id));
  const doneN = crew.filter(p => by[p.user_id]).length;
  const label = d => d.kind === "pretrip" ? "Pre-Trip" : d.kind === "toolbox" ? "Toolbox" : d.kind === "flha" ? "FLHA" : d.name;
  $("ctBody").innerHTML = `<div class="grid-2" style="margin-top:8px">${MetricCard({ label: "Sent forms", value: String(doneN), icon: "check", tone: "accent" })}${MetricCard({ label: "Nothing yet", value: String(crew.length - doneN), icon: "clock", tone: crew.length - doneN ? "danger" : "" })}</div>
    ${Section("Crew")}${crew.length ? List(crew.map(p => `<div class="list-row">${Avatar({ name: p.full_name })}<span class="lr-main"><div class="lr-title">${esc(p.full_name || "No name")}</div><div class="pills">
      ${daily.map(d => StatusBadge(label(d), by[p.user_id]?.has(d.id) ? "ok" : "bad", by[p.user_id]?.has(d.id) ? "check" : null)).join("")}${StatusBadge("Ticket", tk.has(p.user_id) ? "ok" : "bad", tk.has(p.user_id) ? "check" : null)}</div></span></div>`))
      : EmptyState({ icon: "users", title: "No crew yet", text: "Invite them from Team & invites.", action: PrimaryButton("Invite crew", { go: "team", full: false }) })}`;
} });

// ---------- defects ----------
view("defects", { tab: "home", async render(main, p) {
  if (!guard(main)) return;
  const show = p.show || "open";
  main.innerHTML = `${TopBar({ title: "Truck defects", back: "home" })}<div style="margin:8px 0 14px">${SegmentedControl("dfShow", [{ value: "open", label: "Open" }, { value: "fixed", label: "Fixed" }], show)}</div><div id="dfList">${Skeleton(3, 120)}</div>`;
  main.addEventListener("seg", e => go("defects", { show: e.detail }));
  let q = sb.from("form_submissions").select("*").eq("company_id", S.company.id).neq("defects", "[]").order("created_at", { ascending: false }).limit(80);
  q = show === "open" ? q.is("defect_fixed_at", null) : q.not("defect_fixed_at", "is", null);
  const { data } = await q; const rows = data || [];
  await signUrls(rows.flatMap(r => (r.defects || []).flatMap(d => d.photos || [])));
  $("dfList").innerHTML = rows.length ? `<div class="stack">${rows.map(r => Card(`<div class="defect-card${r.defect_fixed_at ? " fixed" : ""}"><div class="dc-head"><div><div class="t-h3">Truck ${esc(truckName(r.truck_id) || "?")}</div><div class="t-small" style="margin-top:2px">${esc(dayLabel(r.work_date))} · ${esc(nameOf(r.user_id))}</div></div>
    ${r.defect_fixed_at ? StatusBadge("Fixed", "ok", "check") : Button("Mark fixed", { variant: "secondary", size: "sm", full: false, data: { "data-fix": r.id } })}</div>
    <ul>${(r.defects || []).map(d => `<li><span><b>${esc(d.item)}</b>${d.note ? ": " + esc(d.note) : ""}</span></li>`).join("")}</ul>
    <div class="thumbs">${(r.defects || []).flatMap(d => d.photos || []).map(ph => fileUrl(ph) ? `<img src="${esc(fileUrl(ph))}" alt="Defect photo" data-big="${esc(fileUrl(ph))}">` : "").join("")}</div>
    ${r.defect_fixed_at ? `<button class="link" type="button" data-unfix="${r.id}" style="margin-top:8px">Reopen</button>` : ""}</div>`, { cls: r.defect_fixed_at ? "" : "danger-card" })).join("")}</div>`
    : EmptyState({ icon: "truck", title: show === "open" ? "No open defects" : "Nothing fixed yet", text: show === "open" ? "Trucks are good to go." : "" });
  $("dfList").onclick = async e => {
    const big = e.target.closest("[data-big]"); if (big) return viewImage(big.dataset.big);
    const fx = e.target.closest("[data-fix]"), un = e.target.closest("[data-unfix]"); if (!fx && !un) return;
    if (fx) setLoading(fx, true);
    await sb.from("form_submissions").update({ defect_fixed_at: fx ? new Date().toISOString() : null, defect_fixed_by: fx ? S.user.id : null }).eq("id", (fx || un).dataset.fix || (fx || un).dataset.unfix);
    toast(fx ? "Marked fixed" : "Reopened"); go("defects", { show });
  };
} });

// ---------- dispatch ----------
view("dispatch", { tab: "home", sticky: true, async render(main) {
  if (!guard(main)) return;
  const tm = new Date(); tm.setDate(tm.getDate() + 1);
  main.innerHTML = `${TopBar({ title: "Dispatch", back: "home" })}
    <p class="t-body" style="margin:4px 0 18px">Pick who's going, type the orders, and their phones ping.</p>
    <div class="form-field" data-field="dpPeople"><span class="ff-label">Crew<span class="req">*</span></span>${PeoplePicker("dpPeople", S.people.filter(p => p.active), [])}<div class="ff-error" hidden>${svg("alert")}<span></span></div></div>
    ${S.trucks.length ? Select({ id: "dpTruck", label: "Truck", options: truckOpts(), placeholder: "Optional" }) : ""}
    <div class="grid-2">${FormField({ id: "dpDate", label: "Date", type: "date", value: iso(tm) })}${FormField({ id: "dpTime", label: "Start time", placeholder: "6:00 AM" })}</div>
    ${Select({ id: "dpClient", label: "Client", options: S.clients.map(c => ({ value: c.id, label: c.name })), placeholder: "Optional" })}
    ${FormField({ id: "dpSite", label: "Site", placeholder: "LSD or directions" })}${FormField({ id: "dpContact", label: "Site contact", placeholder: "Name and number" })}
    ${TextArea({ id: "dpNotes", label: "Orders", placeholder: "What to bring, what to do" })}
    ${Section("Sent")}<div id="dpSent">${Skeleton(2)}</div>
    ${StickyBar(PrimaryButton("Send orders", { id: "dpSend", icon: "send" }))}`;
  $("dpSend").onclick = async () => {
    clearErrors(main);
    const people = peopleValues(main, "dpPeople"); if (!people.length) return fieldError(main, "dpPeople", "Pick at least one person");
    setLoading($("dpSend"), true);
    const { data, error } = await sb.from("dispatches").insert({ company_id: S.company.id, work_date: $("dpDate").value || null, start_time: $("dpTime").value.trim() || null, truck_id: $("dpTruck")?.value || null,
      client_id: $("dpClient").value || null, site: $("dpSite").value.trim() || null, contact: $("dpContact").value.trim() || null, notes: $("dpNotes").value.trim() || null, created_by: S.user.id }).select().single();
    if (error) { setLoading($("dpSend"), false); return toast(error.message, "alert"); }
    await sb.from("dispatch_recipients").insert(people.map(u => ({ dispatch_id: data.id, user_id: u })));
    sb.functions.invoke("push", { body: { mode: "dispatch", dispatch_id: data.id } }).catch(() => {});
    toast(`Orders sent to ${people.length} ${people.length > 1 ? "people" : "person"}`); go("dispatch");
  };
  const { data } = await sb.from("dispatches").select("*, dispatch_recipients(user_id, ack_at)").eq("company_id", S.company.id).order("created_at", { ascending: false }).limit(20);
  $("dpSent").innerHTML = (data || []).length ? List(data.map(d => { const rc = d.dispatch_recipients || [], ack = rc.filter(r => r.ack_at).length;
    return ListRow({ icon: "megaphone", title: [d.truck_id && "Truck " + truckName(d.truck_id), clientName(d.client_id), d.site].filter(Boolean).join(" · ") || "Orders", sub: `${d.work_date ? shortDate(d.work_date) + " · " : ""}${rc.map(r => first(nameOf(r.user_id))).join(", ")}`, end: StatusBadge(`${ack}/${rc.length} got it`, ack === rc.length && rc.length ? "ok" : "warn"), data: { "data-dsp": d.id } }); }))
    : EmptyState({ icon: "megaphone", title: "Nothing sent yet" });
  $("dpSent").onclick = e => { const b = e.target.closest("[data-dsp]"); if (!b) return; const d = data.find(x => x.id === b.dataset.dsp);
    sheet(`<h3>${esc([d.truck_id && "Truck " + truckName(d.truck_id), clientName(d.client_id)].filter(Boolean).join(" · ") || "Orders")}</h3><p class="sh-sub">${esc(d.work_date ? dayLabel(d.work_date) : "")}${d.start_time ? " · " + esc(d.start_time) : ""}</p>
      ${d.notes ? Card(`<p style="margin:0; white-space:pre-wrap">${esc(d.notes)}</p>`) : ""}<div style="margin-top:12px">${List((d.dispatch_recipients || []).map(r => ListRow({ avatar: nameOf(r.user_id), title: nameOf(r.user_id), end: r.ack_at ? StatusBadge("Got it", "ok", "check") : StatusBadge("Not yet", "warn") })))}</div>
      <div style="margin-top:16px">${Button("Delete orders", { variant: "danger", id: "dsDel" })}</div>`, el => el.querySelector("#dsDel").onclick = async () => { if (!confirm("Delete these orders?")) return; await sb.from("dispatches").delete().eq("id", d.id); closeSheet(); toast("Deleted"); go("dispatch"); }); };
} });

// ---------- all tickets: approve + invoice drafts ----------
view("alltickets", { tab: "tickets", async render(main, p) {
  if (!guard(main)) return;
  const status = p.status || "submitted";
  main.innerHTML = `${TopBar({ title: "Field Tickets", back: "tickets" })}
    <div style="margin:8px 0 14px">${SegmentedControl("atStatus", [{ value: "submitted", label: "To approve" }, { value: "approved", label: "Approved" }, { value: "invoiced", label: "Invoiced" }], status)}</div>
    <div id="atTop"></div><div id="atList">${Skeleton(4)}</div>`;
  main.addEventListener("seg", e => ["lastperiod", "period", "all"].includes(e.detail) ? go("alltickets", { status, per: e.detail }) : go("alltickets", { status: e.detail }));
  const { data } = await sb.from("tickets").select("*").eq("company_id", S.company.id).eq("status", status).order("work_date", { ascending: false }).limit(500);
  // approved tickets get sent to the books one pay period at a time, so invoices and payroll line up
  const R = ranges(), per = status === "approved" ? (p.per || "lastperiod") : "all";
  const span = per === "all" ? null : R[per].v;
  const rows = (data || []).filter(r => !span || (r.work_date >= span[0] && r.work_date <= span[1]));
  const perLabel = span ? `${shortDate(span[0])} to ${shortDate(span[1])}` : "";
  if (status === "submitted" && rows.length) $("atTop").innerHTML = `<div style="margin-bottom:14px">${PrimaryButton(`Approve all ${rows.length}`, { id: "atAll", icon: "check" })}</div>`;
  const books = S.company.books || "quickbooks";
  if (status !== "submitted") $("atTop").innerHTML = `<div style="margin-bottom:14px">${
    status === "approved" ? `<div style="margin-bottom:12px">${SegmentedControl("atPer", [{ value: "lastperiod", label: "Last pay period" }, { value: "period", label: "This pay period" }, { value: "all", label: "All" }], per)}</div>` : ""}${
    status === "approved" && rows.length && books === "quickbooks" ? (S.company.qbo_connected
      ? `${Banner(`<b>${rows.length} approved ticket${rows.length > 1 ? "s" : ""}</b>${perLabel ? ` for ${perLabel}` : ""}, ${fmtH(rows.reduce((a, r) => a + Number(r.hours || 0) + Number(r.standby_hours || 0), 0))} hrs. Sending makes invoice drafts (one per client) and payroll timesheets (one per person per day) in QuickBooks. Nothing goes to a client and nobody gets paid until you do it in QuickBooks.`, { icon: "info" })}<div style="margin-top:12px">${PrimaryButton("Send to QuickBooks", { id: "atInv", icon: "file" })}</div>`
      : Banner(`<b>Connect QuickBooks</b> in More › Books to turn these into invoice drafts and payroll timesheets automatically.`, { icon: "link" }))
    : books === "sheets" ? Banner(`Approved tickets show up in your <b>Google Sheet</b> on their own, about every hour.`, { icon: "info" }) : ""}
    <div style="margin-top:12px">${(books === "excel" ? PrimaryButton : SecondaryButton)("Download Excel", { id: "atXls", icon: "upload" })}</div></div>`;
  const byClient = {}; rows.forEach(r => (byClient[r.client_id || "none"] = byClient[r.client_id || "none"] || []).push(r));
  $("atList").innerHTML = rows.length ? Object.entries(byClient).map(([c, list]) => `${Section(`${c === "none" ? "No client picked" : clientName(c)} · ${fmtH(list.reduce((a, r) => a + Number(r.hours || 0), 0))} hrs`)}
    ${List(list.map(r => `<div class="list-row" style="flex-wrap:wrap">${Avatar({ name: nameOf(r.user_id), size: "sm" })}<span class="lr-main"><div class="lr-title">${esc(nameOf(r.user_id))} · ${fmtH(r.hours)} hrs${r.helper_hours > 0 ? ` + ${fmtH(r.helper_hours)} helper` : ""}</div>
      <div class="lr-sub wrap">${esc([shortDate(r.work_date), r.truck_id && "Unit " + truckName(r.truck_id), r.site, r.afe && "AFE " + r.afe].filter(Boolean).join(" · "))}</div>${r.description ? `<div class="lr-sub wrap">${esc(r.description)}</div>` : ""}</span>
      ${status === "submitted" ? `<span class="btn-row" style="width:100%; margin-top:10px">${Button("Send back", { variant: "secondary", size: "sm", data: { "data-rej": r.id } })}${Button("Approve", { size: "sm", data: { "data-ok": r.id } })}</span>` : r.invoice_ref ? `<span class="lr-end">${StatusBadge(r.invoice_ref, "neutral")}</span>` : ""}</div>`))}`).join("")
    : EmptyState({ icon: "ticket", title: status === "submitted" ? "Nothing to approve" : status === "approved" ? "No approved tickets" : "No invoiced tickets", text: status === "submitted" ? "New tickets from the crew land here." : "" });
  $("atList").onclick = async e => {
    const ok = e.target.closest("[data-ok]"), rej = e.target.closest("[data-rej]"); if (!ok && !rej) return;
    setLoading(ok || rej, true);
    await sb.from("tickets").update({ status: ok ? "approved" : "rejected" }).eq("id", (ok || rej).dataset.ok || (ok || rej).dataset.rej);
    toast(ok ? "Approved" : "Sent back to fix"); go("alltickets", p);
  };
  const all = $("atAll"); if (all) all.onclick = async () => { setLoading(all, true); await sb.from("tickets").update({ status: "approved" }).in("id", rows.map(r => r.id)); toast("All approved"); go("alltickets", p); };
  const xl = $("atXls"); if (xl) xl.onclick = exportSheet;
  const inv = $("atInv"); if (inv) inv.onclick = async () => {
    setLoading(inv, true);
    const ids = rows.map(r => r.id), body = a => ({ body: { action: a, company_id: S.company.id, ticket_ids: ids } });
    const { data: hrs } = await sb.functions.invoke("qbo", body("send_hours"));
    const { data: res, error } = await sb.functions.invoke("qbo", body("draft_invoices"));
    setLoading(inv, false);
    if (error || !res || res.error) return toast((res && res.error) || "QuickBooks didn't take it. Try again.", "alert");
    const h = hrs && !hrs.error ? hrs : null, miss = (h && h.missing) || [];
    sheet(`<h3>Sent to QuickBooks</h3>${List([
      ListRow({ icon: "file", iconTone: "ok", title: `${res.created} invoice draft${res.created === 1 ? "" : "s"}`, sub: (res.refs || []).join(", ") || "One per client. Check them, then send from QuickBooks." }),
      ListRow({ icon: "clock", iconTone: h && h.sent ? "ok" : "warn", title: h ? `${h.sent} timesheet entr${h.sent === 1 ? "y" : "ies"}, ${fmtH(h.hours || 0)} hrs` : "Timesheets didn't go", sub: h ? "Ready for payroll. They show up when you run payroll in QuickBooks." : (hrs && hrs.error) || "Try again from More › Books." })])}
      ${miss.length ? `<div style="margin-top:12px">${Banner(`<b>No QuickBooks employee for:</b> ${esc(miss.join(", "))}. Their hours weren't sent. Match them in More › Books, then send that pay period's hours from there.`, { tone: "warn", icon: "alert" })}</div>` : ""}
      ${h && h.errors && h.errors.length ? `<p class="t-small" style="margin-top:10px">${esc(h.errors.join(" | "))}</p>` : ""}
      <div style="margin-top:16px">${PrimaryButton(miss.length ? "Match crew in Books" : "Done", { id: "qbDone" })}</div>`, el => el.querySelector("#qbDone").onclick = () => { closeSheet(); go(miss.length ? "integrations" : "alltickets", miss.length ? {} : { status: "invoiced" }); });
  };
} });

// ---------- receipts ----------
const CATS = ["Fuel and Vehicle", "Repair and maintenance", "Job Materials", "Supplies", "Tools", "Travel", "Travel meals", "Meals and entertainment", "Office expenses", "Utilities", "Insurance", "Rent or lease payments", "Dues and Subscriptions", "Legal and professional fees", "Taxes and Licenses", "Advertising", "Bank charges", "Subcontractors", "Uncategorized Expense"];
view("receipts", { tab: "home", sticky: true, async render(main) {
  if (!guard(main)) return;
  let file = null;
  main.innerHTML = `${TopBar({ title: "Receipts", back: "home" })}
    <p class="t-body" style="margin:4px 0 16px">${S.company.qbo_connected ? "Snap it, check it, save it. It goes into QuickBooks as an expense with the photo attached." : "Snap it, check it, save it. Connect QuickBooks in More to send these to your books."}</p>
    ${Capture("rcShot", { title: "Snap or upload a receipt", sub: "Photo or PDF" })}<input type="file" id="rcFile" accept="image/*,application/pdf" hidden>
    <div class="reading" id="rcReading" hidden><span class="spinner"></span>Reading the receipt...</div>
    <div style="margin-top:16px">${FormField({ id: "rcVendor", label: "Vendor", placeholder: "Who you paid" })}</div>
    <div class="grid-2">${FormField({ id: "rcTotal", label: "Total $", inputmode: "decimal", required: true })}${FormField({ id: "rcGst", label: "GST $", inputmode: "decimal" })}</div>
    <div class="grid-2">${FormField({ id: "rcDate", label: "Date", type: "date", value: today() })}${Select({ id: "rcCat", label: "Category", options: CATS })}</div>
    <div class="list" style="margin-bottom:16px">${Setting("Paid personally", "Came out of your own pocket", Toggle("rcMine", false))}</div>
    ${FormField({ id: "rcNote", label: "Note", placeholder: "Optional" })}<p class="form-msg" id="rcMsg"></p>
    ${Section("Recent")}<div id="rcList">${Skeleton(3)}</div>
    ${StickyBar(PrimaryButton("Save receipt", { id: "rcSave" }))}`;
  $("rcShot").onclick = () => $("rcFile").click();
  $("rcFile").onchange = async () => {
    file = $("rcFile").files[0]; $("rcFile").value = ""; if (!file) return;
    $("rcShot").innerHTML = file.type.startsWith("image/") ? `<img src="${URL.createObjectURL(file)}" alt="Receipt"><span class="cap-tag">${svg("camera")}Retake</span>` : `${svg("file")}${esc(file.name)}`;
    if (!file.type.startsWith("image/")) return;
    $("rcReading").hidden = false;
    const { readReceipt } = await import("./ai.js");
    const r = await readReceipt(file, "expense"); $("rcReading").hidden = true;
    if (!r) return msg("rcMsg", "Couldn't read it. Type it in.", "bad");
    if (r.date) $("rcDate").value = r.date; if (r.vendor) $("rcVendor").value = r.vendor; if (r.total) $("rcTotal").value = Number(r.total).toFixed(2);
    if (r.gst != null) $("rcGst").value = Number(r.gst).toFixed(2); if (r.category && CATS.includes(r.category)) $("rcCat").value = r.category;
    msg("rcMsg", "Check it, then save.", "ok");
  };
  $("rcSave").onclick = async () => {
    clearErrors(main);
    const total = num($("rcTotal").value); if (!(total > 0)) return fieldError(main, "rcTotal", "Enter the total");
    setLoading($("rcSave"), true);
    let path = null; if (file) { try { path = (await uploadFile("expenses", file)).path; } catch (er) { } }
    const { data, error } = await sb.from("expenses").insert({ company_id: S.company.id, created_by: S.user.id, exp_date: $("rcDate").value, vendor: $("rcVendor").value.trim() || null, total, gst: num($("rcGst").value),
      category: $("rcCat").value, paid_personally: $("rcMine").checked, notes: $("rcNote").value.trim() || null, receipt_path: path }).select().single();
    if (error) { setLoading($("rcSave"), false); return msg("rcMsg", error.message, "bad"); }
    if (S.company.qbo_connected) sb.functions.invoke("qbo", { body: { action: "post_expense", company_id: S.company.id, expense_id: data.id } }).then(r => { if (r.data && r.data.ok) toast("In QuickBooks"); }).catch(() => {});
    toast("Receipt saved"); go("receipts");
  };
  const { data } = await sb.from("expenses").select("*").eq("company_id", S.company.id).order("created_at", { ascending: false }).limit(40);
  const tag = r => r.qbo_status === "posted" ? StatusBadge("In QuickBooks", "ok", "check") : r.qbo_status === "error" ? StatusBadge("Needs a look", "bad") : S.company.qbo_connected ? StatusBadge("Sending", "info") : StatusBadge("Saved", "neutral");
  $("rcList").innerHTML = (data || []).length ? List(data.map(r => ListRow({ icon: "receipt", iconTone: "neutral", title: `${r.vendor || "Receipt"} · ${money(r.total)}`, sub: [dayLabel(r.exp_date), r.category, r.paid_personally && "paid personally"].filter(Boolean).join(" · "), end: tag(r) })))
    : EmptyState({ icon: "receipt", title: "No receipts yet", text: "Snap your first one above." });
} });

// ---------- team ----------
view("team", { tab: "more", async render(main) {
  if (!guard(main)) return;
  const roleBadge = r => ({ owner: StatusBadge("Owner", "info"), admin: StatusBadge("Admin", "ok"), crew: StatusBadge("Crew", "neutral") }[r]);
  main.innerHTML = `${TopBar({ title: "Team & invites", back: "more" })}
    <div class="btn-row" style="margin-top:8px">${PrimaryButton("Invite crew", { id: "tmCrew", icon: "plus" })}${SecondaryButton("Invite admin", { id: "tmAdmin" })}</div>
    ${Section(`Crew (${S.people.filter(p => p.active).length})`)}
    ${List(S.people.map(p => ListRow({ avatar: { name: p.full_name, me: p.user_id === S.user.id }, title: (p.full_name || "No name") + (p.user_id === S.user.id ? " (you)" : ""), sub: [p.phone, !p.active && "Removed"].filter(Boolean).join(" · "), end: roleBadge(p.role), data: { "data-person": p.user_id } })))}`;
  const invite = async role => {
    let data; try { data = await window.__fp.createInvite(S.company.id, role, { maxUses: role === "crew" ? null : 1, days: role === "crew" ? 365 : 14 }); } catch (e) { return toast(e.message, "alert"); }
    const link = location.origin + location.pathname + "?join=" + data.code, text = `Join ${S.company.name} on ${CONFIG.product}: ${link} (code ${data.code})`;
    sheet(`<h3>${role === "crew" ? "Crew invite" : "Admin invite"}</h3><p class="sh-sub">${role === "crew" ? "Send this to anyone on your crew. One code works for all of them." : "This one makes them an admin. It works once."}</p>
      <div class="code-display">${data.code.split("").map(c => `<span>${esc(c)}</span>`).join("")}</div>
      <div style="margin-top:20px">${PrimaryButton("Send by text", { id: "ivShare", icon: "chat" })}${SecondaryButton("Copy link", { id: "ivCopy", icon: "link" })}</div>`, el => {
      el.querySelector("#ivShare").onclick = async () => { if (navigator.share) { try { await navigator.share({ text }); } catch (e) {} } else location.href = "sms:?&body=" + encodeURIComponent(text); };
      el.querySelector("#ivCopy").onclick = async () => { try { await navigator.clipboard.writeText(text); toast("Link copied"); } catch (e) {} };
    });
  };
  $("tmCrew").onclick = () => invite("crew"); $("tmAdmin").onclick = () => invite("admin");
  main.addEventListener("click", e => {
    const b = e.target.closest("[data-person]"); if (!b) return;
    const p = S.byId[b.dataset.person]; if (!p || p.user_id === S.user.id) return;
    const acts = [
      p.role === "crew" && ListRow({ icon: "shield", title: "Make admin", sub: "Can dispatch, approve tickets, see the books", data: { "data-act": "admin" } }),
      p.role === "admin" && ListRow({ icon: "users", title: "Make crew", sub: "Remove admin access", data: { "data-act": "crew" } }),
      ListRow({ icon: "award", title: "Add a certificate for them", sub: "H2S, First Aid and the rest", data: { "data-act": "doc" } }),
      p.role !== "owner" && ListRow({ icon: p.active ? "x" : "plus", iconTone: p.active ? "danger" : "", title: p.active ? "Remove from crew" : "Bring back", sub: p.active ? "They lose access right away" : "Give their access back", data: { "data-act": p.active ? "remove" : "restore" } }),
    ].filter(Boolean);
    sheet(`<div class="row" style="margin-bottom:16px">${Avatar({ name: p.full_name, size: "lg" })}<div><h3>${esc(p.full_name)}</h3><div class="t-small">${esc(p.role)}${p.phone ? " · " + esc(p.phone) : ""}</div></div></div>${List(acts)}`, el => el.onclick = async ev => {
      const a = ev.target.closest("[data-act]"); if (!a) return;
      if (a.dataset.act === "doc") { const { docSheet } = await import("./views.js"); return docSheet(p.user_id, () => go("team")); }
      if (a.dataset.act === "remove" && !confirm(`Remove ${p.full_name} from the crew?`)) return;
      const upd = { admin: { role: "admin" }, crew: { role: "crew" }, remove: { active: false }, restore: { active: true } }[a.dataset.act];
      const { error } = await sb.from("members").update(upd).eq("company_id", S.company.id).eq("user_id", p.user_id);
      closeSheet(); if (error) return toast(error.message, "alert");
      await loadCompany(S.company.id); toast("Saved"); go("team");
    });
  });
} });

// ---------- settings ----------
view("settings", { tab: "more", async render(main) {
  if (!guard(main)) return;
  const co = S.company, ps = co.pay_schedule || {};
  main.innerHTML = `${TopBar({ title: "Company settings", back: "more" })}<div style="margin-top:8px">${List([
    ListRow({ icon: "camera", title: "Logo and look", sub: `${(co.theme || "steelcap").replace(/^./, c => c.toUpperCase())} look`, data: { "data-set": "look" }, chev: true }),
    ListRow({ icon: "dollar", title: "Pay schedule", sub: ps.type === "biweekly" ? "Every 2 weeks" : ps.type === "weekly" ? "Weekly" : "Twice a month", data: { "data-set": "pay" }, chev: true }),
    ListRow({ icon: "truck", title: "Trucks", sub: `${S.trucks.length} unit${S.trucks.length === 1 ? "" : "s"}`, data: { "data-set": "trucks" }, chev: true }),
    ListRow({ icon: "users", title: "Clients", sub: `${S.clients.length} client${S.clients.length === 1 ? "" : "s"}`, data: { "data-set": "clients" }, chev: true }),
    ListRow({ icon: "shield", title: "Safety forms", sub: `${S.templates.filter(t => t.active).length} active`, go: "formsettings" }),
    ListRow({ icon: "gear", title: "Company details", sub: co.name, data: { "data-set": "details" }, chev: true })])}</div>`;
  main.addEventListener("click", e => {
    const b = e.target.closest("[data-set]"); if (!b) return;
    const a = b.dataset.set, w = n => window.__fp.wizard(n, { single: true });
    if (a === "look") return w(2); if (a === "pay") return w(3); if (a === "trucks") return w(4); if (a === "clients") return w(5);
    if (a === "details") sheet(`<h3>Company details</h3><div style="margin-top:12px">${FormField({ id: "cdName", label: "Company name", value: co.name })}${FormField({ id: "cdGst", label: "GST number", value: co.gst_number || "" })}${FormField({ id: "cdSolo", label: "No-helper hourly rate (optional)", inputmode: "decimal", value: co.solo_rate ?? "", hint: "Used on invoice drafts when a ticket has no helper hours." })}</div>${PrimaryButton("Save", { id: "cdSave" })}`,
      el => el.querySelector("#cdSave").onclick = async () => { setLoading(el.querySelector("#cdSave"), true); const { error } = await sb.from("companies").update({ name: el.querySelector("#cdName").value.trim() || co.name, gst_number: el.querySelector("#cdGst").value.trim() || null, solo_rate: Number(el.querySelector("#cdSolo").value) || null }).eq("id", co.id); if (error) { setLoading(el.querySelector("#cdSave"), false); return toast(error.message, "alert"); } await loadCompany(co.id); closeSheet(); toast("Saved"); go("settings"); });
  });
} });

view("formsettings", { tab: "more", async render(main) {
  if (!guard(main)) return;
  main.innerHTML = `${TopBar({ title: "Safety forms", back: "settings" })}<p class="t-body" style="margin:4px 0 16px">Turn forms on or off, and choose which are due every day.</p>
    <div id="fsList"></div><div style="margin-top:16px">${SecondaryButton("Add a custom checklist", { id: "fsAdd", icon: "plus" })}</div>`;
  $("fsList").innerHTML = S.templates.map(t => Card(`<div class="row between"><div><div class="t-h3">${esc(t.name)}</div><div class="t-small">${t.kind === "custom" ? ((t.schema.fields || []).find(f => f.type === "checklist")?.items.length || 0) + " checklist items" : { pretrip: "Truck inspection", flha: "Hazard assessment", toolbox: "Crew meeting" }[t.kind]}</div></div></div>
    <div class="divider" style="margin:12px 0"></div><div class="row between"><span class="t-small" style="font-weight:700; color:var(--text-2)">On</span>${Toggle("act-" + t.id, t.active)}</div>
    <div class="row between" style="margin-top:10px"><span class="t-small" style="font-weight:700; color:var(--text-2)">Due every day</span>${Toggle("day-" + t.id, t.daily)}</div>`)).join("");
  $("fsList").onchange = async e => {
    const [k, ...rest] = e.target.id.split("-"), id = rest.join("-");
    await sb.from("form_templates").update(k === "act" ? { active: e.target.checked } : { daily: e.target.checked }).eq("id", id);
    await loadCompany(S.company.id); toast("Saved");
  };
  $("fsAdd").onclick = () => sheet(`<h3>Custom checklist</h3><p class="sh-sub">One item per line. Crew tap OK or Defect for each.</p>
    ${FormField({ id: "cfName", label: "Name", placeholder: "e.g. Skid steer walk-around" })}${TextArea({ id: "cfItems", label: "Items", placeholder: "Bucket and pins\nHydraulic hoses\nTracks" })}
    <div class="list" style="margin-bottom:16px">${Setting("Ask which truck", "", Toggle("cfTruck", true))}</div>${PrimaryButton("Add form", { id: "cfSave" })}`, el => el.querySelector("#cfSave").onclick = async () => {
    const name = el.querySelector("#cfName").value.trim(), items = el.querySelector("#cfItems").value.split("\n").map(s => s.trim()).filter(Boolean);
    if (!name) return fieldError(el, "cfName", "Give it a name"); if (!items.length) return fieldError(el, "cfItems", "Add at least one item");
    await sb.from("form_templates").insert({ company_id: S.company.id, kind: "custom", name, daily: false, sort: 10 + S.templates.length,
      schema: { truck: el.querySelector("#cfTruck").checked, fields: [{ id: "checks", label: "Checklist", type: "checklist", items }, { id: "notes", label: "Notes", type: "textarea" }] } });
    await loadCompany(S.company.id); closeSheet(); toast("Form added"); go("formsettings");
  });
} });

// ---------- Books: QuickBooks, Excel or Google Sheets ----------
const FEED = `${CONFIG.url}/functions/v1/sheets`;
const FEED_TABS = [["tickets", "Field tickets", "Every ticket with rate and amount"], ["trucks", "By truck", "Hours, billed and fuel per unit"], ["clients", "By client", "What each client owes"], ["fuel", "Fuel", "Fill-ups by truck"], ["receipts", "Receipts", "Company expenses"]];
const BOOKS = [{ value: "quickbooks", label: "QuickBooks Online" }, { value: "excel", label: "Excel" }, { value: "sheets", label: "Google Sheets" }];
export const booksLabel = b => (BOOKS.find(x => x.value === b) || BOOKS[0]).label;
const copyText = async (t, ok = "Copied") => { try { await navigator.clipboard.writeText(t); toast(ok, "check"); } catch (e) { prompt("Copy this:", t); } };

view("integrations", { tab: "more", async render(main, p) {
  if (!guard(main)) return;
  await loadCompany(S.company.id);
  const co = S.company, books = p.books || co.books || "quickbooks";
  main.innerHTML = `${TopBar({ title: "Books", back: "more" })}
    <p class="t-body" style="margin:4px 0 12px">Where approved tickets, fuel and receipts go. You can switch any time.</p>
    ${RadioList("books", BOOKS, books)}
    <div id="bkPanel" style="margin-top:20px"></div><p class="form-msg" id="qbMsg"></p>`;
  main.addEventListener("radio", async e => {
    if (e.detail === co.books) return go("integrations");
    const { error } = await sb.from("companies").update({ books: e.detail }).eq("id", co.id);
    if (error) return toast("Couldn't save. Try again.", "alert");
    toast(`Books set to ${booksLabel(e.detail)}`, "check"); go("integrations", { books: e.detail });
  });
  const panel = $("bkPanel");

  if (books === "quickbooks") {
    panel.innerHTML = `${Card(`<div class="row between"><div><div class="t-label">QuickBooks Online</div><div class="t-title" style="margin-top:6px">${co.qbo_connected ? "Connected" : "Not connected"}</div>${co.qbo_company_name ? `<div class="t-small" style="margin-top:2px">${esc(co.qbo_company_name)}</div>` : ""}</div>${co.qbo_connected ? StatusBadge("Live", "ok", "check") : ""}</div>
      ${co.qbo_connected ? "" : `<p class="t-body" style="margin-top:12px">Connect once. Approved tickets become invoice drafts and receipts become expenses with the photo attached. Nothing is ever sent to a client without you.</p>`}`, { cls: co.qbo_connected ? "accent-card" : "" })}
      ${co.qbo_connected ? `${Section("Match your clients")}<p class="t-body" style="margin:-4px 0 12px">Pick the QuickBooks customer for each client so invoices land in the right place.</p><div id="qbMap">${Skeleton(3)}</div>
        ${Section("Match your crew for payroll")}<p class="t-body" style="margin:-4px 0 12px">Pick each person's employee in QuickBooks so their hours land on the right timesheet. Names that match exactly are picked for you.</p><div id="qbEmp">${Skeleton(3)}</div>
        ${Section("Payroll hours")}<p class="t-body" style="margin:-4px 0 12px">Hours go over on their own when you send approved tickets. Use this to send a pay period's hours by themselves, like after matching someone above. Hours already sent are skipped.</p>
        <div style="margin-bottom:12px">${SegmentedControl("bkPer", [{ value: "lastperiod", label: "Last pay period" }, { value: "period", label: "This pay period" }], "lastperiod")}</div>
        ${SecondaryButton("Send hours to QuickBooks", { id: "bkHrs", icon: "clock" })}<p class="form-msg" id="bkHrsMsg"></p>
        <div style="margin-top:20px">${Button("Disconnect", { variant: "danger", id: "qbOff" })}</div>` : `<div style="margin-top:16px">${PrimaryButton("Connect QuickBooks", { id: "qbOn", icon: "link" })}</div>`}
      <div style="margin-top:12px">${SecondaryButton("Download Excel too", { id: "bkXls", icon: "upload" })}</div>`;
    const on = $("qbOn"); if (on) on.onclick = async () => {
      setLoading(on, true);
      const { data, error } = await sb.functions.invoke("qbo", { body: { action: "connect_url", company_id: co.id, return_to: location.origin + location.pathname } });
      setLoading(on, false);
      if (error || !data || !data.url) return msg("qbMsg", (data && data.error) || "QuickBooks connection isn't switched on yet.", "bad");
      location.href = data.url;
    };
    const off = $("qbOff"); if (off) off.onclick = async () => { if (!confirm("Disconnect QuickBooks?")) return; setLoading(off, true); await sb.functions.invoke("qbo", { body: { action: "disconnect", company_id: co.id } }); go("integrations"); };
    if (co.qbo_connected) {
      const { data } = await sb.functions.invoke("qbo", { body: { action: "customers", company_id: co.id } });
      const cust = (data && data.customers) || [];
      $("qbMap").innerHTML = S.clients.length ? S.clients.map(c => Select({ id: "map-" + c.id, label: c.name, options: cust.map(q => ({ value: q.id, label: q.name })), value: c.qbo_customer_id || "", placeholder: "Create new in QuickBooks" })).join("")
        : EmptyState({ icon: "users", title: "No clients yet", text: "Add clients in Company settings first." });
      $("qbMap").onchange = async e => { const id = e.target.id.replace("map-", ""); await sb.from("clients").update({ qbo_customer_id: e.target.value || null }).eq("id", id); await loadCompany(co.id); toast("Saved"); };
      const { data: ed } = await sb.functions.invoke("qbo", { body: { action: "employees", company_id: co.id } });
      const emps = (ed && ed.employees) || [], norm = v => (v || "").toLowerCase().replace(/[^a-z]/g, "");
      const crew = S.people.filter(m => m.active !== false);
      $("qbEmp").innerHTML = !emps.length ? Banner("No employees in QuickBooks yet. Add your crew there under Payroll › Employees, then come back.", { icon: "info" })
        : crew.map(m => Select({ id: "emp-" + m.user_id, label: m.full_name || "Crew member", options: emps.map(x => ({ value: x.id, label: x.name })),
          value: m.qbo_employee_id || (emps.find(x => norm(x.name) === norm(m.full_name)) || {}).id || "", placeholder: "Not on payroll" })).join("");
      $("qbEmp").onchange = async e => { await sb.functions.invoke("qbo", { body: { action: "map_employee", company_id: co.id, user_id: e.target.id.replace("emp-", ""), employee_id: e.target.value || null } }); await loadCompany(co.id); toast("Saved"); };
      let hrPer = "lastperiod"; main.addEventListener("seg", e => { if (["lastperiod", "period"].includes(e.detail)) hrPer = e.detail; });
      $("bkHrs").onclick = async () => {
        const b = $("bkHrs"), [from, to] = ranges()[hrPer].v; setLoading(b, true);
        const { data: r } = await sb.functions.invoke("qbo", { body: { action: "send_hours", company_id: co.id, from, to } });
        setLoading(b, false);
        if (!r || r.error) return msg("bkHrsMsg", (r && r.error) || "QuickBooks didn't take it. Try again.", "bad");
        msg("bkHrsMsg", `${r.sent} timesheet entr${r.sent === 1 ? "y" : "ies"} sent, ${fmtH(r.hours || 0)} hrs.${r.missing && r.missing.length ? ` Not sent (no employee picked): ${r.missing.join(", ")}.` : ""}`, r.missing && r.missing.length ? "bad" : "ok");
      };
    }
  } else {
    const sheets = books === "sheets";
    panel.innerHTML = `${sheets
      ? Card(`<div class="t-label">Google Sheets</div><div class="t-title" style="margin-top:6px">Live link</div><p class="t-body" style="margin-top:8px">Your Google Sheet pulls tickets, trucks, clients, fuel and receipts straight from ${esc(CONFIG.product)}. It updates itself about every hour. Nothing to download.</p>`, { cls: "accent-card" })
      : Card(`<div class="t-label">Excel</div><div class="t-title" style="margin-top:6px">Download any time</div><p class="t-body" style="margin-top:8px">One file with every ticket, rates and amounts, a tab for each truck, totals by truck and client, fuel and receipts.</p>
        <div style="margin-top:14px">${PrimaryButton("Download Excel", { id: "bkXls", icon: "upload" })}</div>`, { cls: "accent-card" })}
      ${Section(sheets ? "Set it up once" : "Or keep Excel live")}
      ${sheets ? `<ol class="steps"><li>Open a new Google Sheet. ${Button("Open Google Sheets", { variant: "secondary", size: "sm", id: "bkNew", icon: "link", full: false })}</li><li>Copy a formula below and paste it in cell A1. Add a tab at the bottom for each one you want.</li><li>That's it. The sheet refreshes on its own.</li></ol>`
        : `<p class="t-body" style="margin:-4px 0 12px">In Excel: Data › Get Data › From Web, paste a link below, then Load. Hit Refresh All whenever you want the latest.</p>`}
      <div id="bkFeeds">${Skeleton(3)}</div>
      ${Banner(`Anyone with these links can see your numbers. Only share them with people you'd show your books to.`, { tone: "warn", icon: "lock" })}
      <div class="btn-row" style="margin-top:14px">${sheets ? SecondaryButton("Download Excel", { id: "bkXls", icon: "upload" }) : ""}${Button("Turn off old links", { variant: "secondary", id: "bkRot", icon: "refresh" })}</div>`;
    const newBtn = $("bkNew"); if (newBtn) newBtn.onclick = () => window.open("https://sheets.new", "_blank", "noopener");
    const showFeeds = async rotate => {
      const { data: tok, error } = await sb.rpc("sheet_feed_token", { cid: co.id, rotate: !!rotate });
      if (error || !tok) { $("bkFeeds").innerHTML = Banner("Couldn't make your link. Check your signal and try again.", { tone: "warn" }); return; }
      const link = tab => `${FEED}?t=${tok}&tab=${tab}&days=365`;
      const val = tab => sheets ? `=IMPORTDATA("${link(tab)}")` : link(tab);
      $("bkFeeds").innerHTML = List(FEED_TABS.map(([k, t, s]) => ListRow({ icon: "file", title: t, sub: s, end: Button("Copy", { variant: "secondary", size: "sm", full: false, data: { "data-copy": k } }) })));
      $("bkFeeds").onclick = e => { const b = e.target.closest("[data-copy]"); if (b) copyText(val(b.dataset.copy), sheets ? "Formula copied" : "Link copied"); };
    };
    showFeeds(false);
    $("bkRot").onclick = async () => { if (!confirm("Turn off the old links? Any sheet using them stops updating until you paste the new ones.")) return; await showFeeds(true); toast("New links made", "check"); };
  }
  const xls = $("bkXls"); if (xls) xls.onclick = exportSheet;
} });

// ---------- trucks & billing: what each truck billed, burned in fuel, and kept ----------
view("billing", { tab: "more", async render(main, p) {
  if (!guard(main)) return;
  const R = ranges(), key = p.range || "period", [from, to] = R[key].v;
  main.innerHTML = `${TopBar({ title: "Trucks & billing", back: "more" })}
    <div style="margin:8px 0 6px">${SegmentedControl("blRange", [{ value: "period", label: "This period" }, { value: "lastperiod", label: "Last period" }, { value: "month", label: "Month" }], key)}</div>
    <p class="t-small" style="margin:0 0 14px">${shortDate(from)} to ${shortDate(to)} · same rates as your invoices</p>
    <div id="blBody">${Skeleton(5)}</div>`;
  main.addEventListener("seg", e => go("billing", { range: e.detail }));
  const cid = S.company.id;
  const [tk, fu] = await Promise.all([
    sb.from("tickets").select("*").eq("company_id", cid).neq("status", "rejected").gte("work_date", from).lte("work_date", to).order("work_date"),
    sb.from("fuel_logs").select("truck_id,total,fill_date").eq("company_id", cid).gte("fill_date", from).lte("fill_date", to)]);
  const tickets = tk.data || [], fuel = fu.data || [];
  const amt = t => (Number(t.hours || 0) + Number(t.standby_hours || 0)) * rateFor(t);
  const byT = {}, byC = {};
  const T = id => (byT[id || "none"] = byT[id || "none"] || { id: id || "none", hrs: 0, billed: 0, fuel: 0, n: 0, days: new Set(), list: [] });
  tickets.forEach(t => { const x = T(t.truck_id); x.hrs += Number(t.hours || 0); x.billed += amt(t); x.n++; x.days.add(t.work_date); x.list.push(t);
    const c = (byC[t.client_id || "none"] = byC[t.client_id || "none"] || { hrs: 0, billed: 0 }); c.hrs += Number(t.hours || 0); c.billed += amt(t); });
  fuel.forEach(f => { T(f.truck_id).fuel += Number(f.total || 0); });
  const tot = Object.values(byT).reduce((a, x) => ({ hrs: a.hrs + x.hrs, billed: a.billed + x.billed, fuel: a.fuel + x.fuel }), { hrs: 0, billed: 0, fuel: 0 });
  const waiting = tickets.filter(t => t.status === "submitted").length;
  const unit = id => id === "none" ? "No truck" : "Truck " + (truckName(id) || "?");
  const kind = id => (S.trucks.find(x => x.id === id) || {}).kind || "";
  const rows = Object.values(byT).sort((a, b) => b.billed - a.billed);
  const noRate = tickets.filter(t => !rateFor(t)).length;
  $("blBody").innerHTML = tickets.length || fuel.length ? `
    <div class="grid-2">${MetricCard({ label: "Billed", value: money(tot.billed), sub: "before GST", icon: "dollar" })}${MetricCard({ label: "Hours", value: fmtH(tot.hrs), sub: tickets.length + " tickets", icon: "clock" })}
      ${MetricCard({ label: "Fuel", value: money(tot.fuel), sub: fuel.length + " fill-ups", icon: "fuel" })}${MetricCard({ label: "Billed minus fuel", value: money(tot.billed - tot.fuel), tone: "accent", icon: "truck" })}</div>
    ${waiting ? `<div style="margin-top:12px">${Banner(`Includes <b>${waiting} ticket${waiting > 1 ? "s" : ""}</b> still waiting for your approval.`, { icon: "info", tone: "warn" })}</div>` : ""}
    ${noRate ? `<div style="margin-top:12px">${Banner(`<b>${noRate} ticket${noRate > 1 ? "s have" : " has"} no rate.</b> Add client or truck rates in Company settings so they count.`, { icon: "alert", tone: "warn" })}</div>` : ""}
    ${Section("By truck")}${List(rows.map(x => ListRow({ icon: "truck", title: unit(x.id) + (kind(x.id) ? " · " + kind(x.id) : ""),
      sub: `${fmtH(x.hrs)} hrs · ${x.days.size} day${x.days.size === 1 ? "" : "s"}`,
      end: `<span style="text-align:right;display:block"><b>${money(x.billed)}</b><small style="display:block;color:var(--text-3)">fuel ${money(x.fuel)}</small></span>`, data: { "data-tr": x.id } })))}
    ${Section("By client")}${List(Object.entries(byC).sort((a, b) => b[1].billed - a[1].billed).map(([c, x]) => ListRow({ icon: "building", title: c === "none" ? "No client picked" : clientName(c), sub: fmtH(x.hrs) + " hrs", end: `<b>${money(x.billed)}</b>` })))}
    <div style="margin-top:20px">${SecondaryButton("Download Excel", { id: "blXls", icon: "upload" })}</div>`
    : EmptyState({ icon: "truck", title: "Nothing in these dates", text: "Field tickets and fuel show up here as the crew sends them." });
  const x = $("blXls"); if (x) x.onclick = exportSheet;
  $("blBody").addEventListener("click", e => {
    const b = e.target.closest("[data-tr]"); if (!b) return;
    const t = byT[b.dataset.tr];
    sheet(`<h3>${esc(unit(t.id))}</h3><p class="sh-sub">${shortDate(from)} to ${shortDate(to)} · ${fmtH(t.hrs)} hrs · ${money(t.billed)} billed · ${money(t.fuel)} fuel · <b>${money(t.billed - t.fuel)} after fuel</b></p>
      ${List(t.list.map(k => ListRow({ title: `${shortDate(k.work_date)} · ${clientName(k.client_id) || "No client"}`, sub: `${nameOf(k.user_id)} · ${fmtH(k.hours)} hrs${Number(k.helper_hours) > 0 ? " + helper" : ""} · $${rateFor(k)}/hr${k.status === "submitted" ? " · waiting" : ""}`, end: `<b>${money(amt(k))}</b>` })))}
      <div style="height:12px"></div>${SecondaryButton("Close", { id: "trClose" })}`, el => { el.querySelector("#trClose").onclick = closeSheet; });
  });
} });
