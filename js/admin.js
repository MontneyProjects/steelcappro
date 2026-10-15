// Owner/admin screens: crew today, defects, dispatch, ticket approval + invoice drafts, receipts, team, settings, safety forms, QuickBooks.
import { sb, S, $, esc, toast, msg, svg, view, go, isAdmin, isOwner, today, iso, dayLabel, money, num, fmtH, initials, first, nameOf,
  truckName, clientName, sheet, closeSheet, uploadFile, signUrls, fileUrl, viewImage, loadCompany, CONFIG } from "./core.js";
import { TopBar, Section, StickyBar, Card, MetricCard, ListRow, List, Avatar, StatusBadge, EmptyState, Skeleton, Banner,
  PrimaryButton, SecondaryButton, Button, IconButton, FormField, TextArea, Select, SegmentedControl, Chips, PeoplePicker, Capture, Setting, Toggle,
  setLoading, fieldError, clearErrors, segValue, peopleValues } from "./ui.js";

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
  main.addEventListener("seg", e => go("alltickets", { status: e.detail }));
  const { data } = await sb.from("tickets").select("*").eq("company_id", S.company.id).eq("status", status).order("work_date", { ascending: false }).limit(300);
  const rows = data || [];
  if (status === "submitted" && rows.length) $("atTop").innerHTML = `<div style="margin-bottom:14px">${PrimaryButton(`Approve all ${rows.length}`, { id: "atAll", icon: "check" })}</div>`;
  if (status === "approved" && rows.length) $("atTop").innerHTML = `<div style="margin-bottom:14px">${S.company.qbo_connected
    ? `${Banner(`<b>${rows.length} approved ticket${rows.length > 1 ? "s" : ""}</b> ready to become invoice drafts in QuickBooks, one per client. Nothing gets sent to the client.`, { icon: "info" })}<div style="margin-top:12px">${PrimaryButton("Draft invoices in QuickBooks", { id: "atInv", icon: "file" })}</div>`
    : Banner(`<b>Connect QuickBooks</b> in More › QuickBooks to turn these into invoice drafts automatically.`, { icon: "link" })}</div>`;
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
  const inv = $("atInv"); if (inv) inv.onclick = async () => {
    setLoading(inv, true);
    const { data: res, error } = await sb.functions.invoke("qbo", { body: { action: "draft_invoices", company_id: S.company.id, ticket_ids: rows.map(r => r.id) } });
    setLoading(inv, false);
    if (error || !res || res.error) return toast((res && res.error) || "QuickBooks didn't take it. Try again.", "alert");
    toast(`${res.created} draft invoice${res.created === 1 ? "" : "s"} in QuickBooks`); go("alltickets", { status: "invoiced" });
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

// ---------- QuickBooks ----------
view("integrations", { tab: "more", async render(main) {
  if (!guard(main)) return;
  await loadCompany(S.company.id);
  const co = S.company;
  main.innerHTML = `${TopBar({ title: "QuickBooks", back: "more" })}
    ${Card(`<div class="row between"><div><div class="t-label">QuickBooks Online</div><div class="t-title" style="margin-top:6px">${co.qbo_connected ? "Connected" : "Not connected"}</div>${co.qbo_company_name ? `<div class="t-small" style="margin-top:2px">${esc(co.qbo_company_name)}</div>` : ""}</div>${co.qbo_connected ? StatusBadge("Live", "ok", "check") : ""}</div>
      ${co.qbo_connected ? "" : `<p class="t-body" style="margin-top:12px">Connect once. Approved tickets become invoice drafts and receipts become expenses with the photo attached. Nothing is ever sent to a client without you.</p>`}`, { cls: co.qbo_connected ? "accent-card" : "" })}
    ${co.qbo_connected ? `${Section("Match your clients")}<p class="t-body" style="margin:-4px 0 12px">Pick the QuickBooks customer for each client so invoices land in the right place.</p><div id="qbMap">${Skeleton(3)}</div>
      <div style="margin-top:20px">${Button("Disconnect", { variant: "danger", id: "qbOff" })}</div>` : `<div style="margin-top:16px">${PrimaryButton("Connect QuickBooks", { id: "qbOn", icon: "link" })}</div>`}<p class="form-msg" id="qbMsg"></p>`;
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
  }
} });
