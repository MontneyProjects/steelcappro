// Shared UI components. Each returns an HTML string; behaviour is wired once with delegated listeners at the bottom.
import { esc, svg, initials, S, logoUrl, CONFIG } from "./core.js";

const attrs = o => Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null && v !== false)
  .map(([k, v]) => v === true ? k : `${k}="${esc(typeof v === "object" ? JSON.stringify(v) : v)}"`).join(" ");
const nav = (go, p) => go ? attrs({ "data-go": go, "data-p": p && Object.keys(p).length ? p : undefined }) : "";

// ---------- shell pieces ----------
export const TopBar = ({ title = "", back, action = "", left = false } = {}) => `<header class="topbar">
  ${back ? `<button class="icon-btn" type="button" ${nav(back.go || back, back.p)} aria-label="Back">${svg("left")}</button>` : `<span class="tb-side"></span>`}
  <div class="tb-title${left ? " left" : ""}">${esc(title)}</div><span class="tb-side">${action}</span></header>`;
export const PageHead = ({ eyebrow = "", title, sub = "", action = "" }) => `<div class="page-head"><div>${eyebrow ? `<div class="t-eyebrow">${esc(eyebrow)}</div>` : ""}<h1 class="t-display" style="margin-top:${eyebrow ? 6 : 0}px">${esc(title)}</h1>${sub ? `<p class="t-body sub">${esc(sub)}</p>` : ""}</div>${action}</div>`;
export const Section = (title, action = "") => `<div class="section"><h2>${esc(title)}</h2>${action}</div>`;
export const StickyBar = inner => `<div class="sticky-bar">${inner}</div>`;

// ---------- brand ----------
export const Wordmark = (size = 22) => `<div class="wordmark" style="font-size:${size}px">STEELCAP <b>PRO</b></div>`;
export const BrandLockup = ({ mark = 54, size = 24, tagline = true } = {}) => `<div class="brand-lockup"><img class="sc-mark" src="mark.png" alt="" style="width:${mark}px">${Wordmark(size)}${tagline ? `<div class="tagline">${esc(CONFIG.tagline)}</div>` : ""}</div>`;
export const CompanyBrand = (co = S.company) => co ? `<div class="co-brand">${co.logo_path ? `<img src="${esc(logoUrl(co.logo_path))}" alt="${esc(co.name)}">` : `<span class="co-mono">${esc(initials(co.name))}</span><b>${esc(co.name)}</b>`}</div>` : "";

// ---------- surfaces ----------
export const Card = (inner, { cls = "", tag = "div", ...rest } = {}) => `<${tag} class="card ${cls}" ${attrs(rest)}>${inner}</${tag}>`;
export const MetricCard = ({ label, value, unit = "", sub = "", icon = "", go, p, tone = "" }) => {
  const tag = go ? "button" : "div";
  return `<${tag} class="metric${tone ? " tone-" + tone : ""}" ${go ? `type="button" ${nav(go, p)}` : ""}><span class="m-top">${esc(label)}${icon ? svg(icon) : ""}</span><span class="m-val">${esc(value)}${unit ? `<small>${esc(unit)}</small>` : ""}</span>${sub ? `<span class="m-sub">${esc(sub)}</span>` : ""}</${tag}>`;
};
export const Tile = ({ label, done, go, p, icon }) => `<button class="tile${done ? " done" : ""}" type="button" ${nav(go, p)}>${svg(done ? "check" : (icon || "plus"), done ? 2.6 : 1.9)}<span><b>${esc(label)}</b><small>${done ? "Done" : "To do"}</small></span></button>`;
export const ListRow = ({ icon, iconTone = "", avatar, thumb, title, sub = "", subWrap = false, end = "", go, p, chev, data = {}, tag }) => {
  const clickable = go || Object.keys(data).length || tag === "button";
  const t = clickable ? "button" : "div";
  const lead = avatar ? Avatar(avatar) : thumb ? `<img class="thumb" src="${esc(thumb)}" alt="">` : icon ? `<span class="lr-ic ${iconTone}">${svg(icon)}</span>` : "";
  return `<${t} class="list-row" ${clickable ? `type="button"` : ""} ${nav(go, p)} ${attrs(data)}>${lead}<span class="lr-main"><div class="lr-title">${esc(title)}</div>${sub ? `<div class="lr-sub${subWrap ? " wrap" : ""}">${esc(sub)}</div>` : ""}</span>${end || chev || go ? `<span class="lr-end">${end}${chev || go ? svg("chev") .replace("<svg", '<svg class="chev"') : ""}</span>` : ""}</${t}>`;
};
export const List = rows => `<div class="list">${rows.join("")}</div>`;
export const Avatar = (a) => { const o = typeof a === "string" ? { name: a } : a; return `<span class="avatar${o.size ? " " + o.size : ""}${o.me ? " me" : ""}${o.group ? " grp" : ""}">${o.group ? svg("users") : esc(initials(o.name))}</span>`; };
export const StatusBadge = (text, tone = "neutral", icon) => `<span class="badge ${tone}">${icon ? svg(icon, 2.4) : ""}${esc(text)}</span>`;
export const EmptyState = ({ icon = "file", title, text = "", action = "" }) => `<div class="empty"><div class="e-ic">${svg(icon)}</div><b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ""}${action}</div>`;
export const Skeleton = (n = 3, h = 64) => Array.from({ length: n }, () => `<div class="skel" style="height:${h}px; margin-bottom:10px"></div>`).join("");
export const Banner = (html, { tone = "", icon = "alert" } = {}) => `<div class="banner ${tone}">${svg(icon)}<div>${html}</div></div>`;
export const SuccessState = ({ title, text = "", actions = "" }) => `<div class="success-state"><div class="ss-ic">${svg("check", 2.6)}</div><h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ""}<div style="width:100%; margin-top:32px">${actions}</div></div>`;

// ---------- buttons ----------
export const Button = (label, { variant = "primary", icon, id, type = "button", go, p, full = true, disabled, size, data = {} } = {}) =>
  `<button class="btn ${variant}${full ? " full" : ""}${size ? " " + size : ""}" ${attrs({ id, type, disabled, ...data })} ${nav(go, p)}>${icon ? svg(icon) : ""}<span>${esc(label)}</span></button>`;
export const PrimaryButton = (label, o = {}) => Button(label, { ...o, variant: "primary" });
export const SecondaryButton = (label, o = {}) => Button(label, { ...o, variant: "secondary" });
export const IconButton = (icon, { label, go, p, id, boxed } = {}) => `<button class="icon-btn${boxed ? " boxed" : ""}" type="button" ${attrs({ id, "aria-label": label })} ${nav(go, p)}>${svg(icon)}</button>`;
export function setLoading(btn, on) { if (!btn) return; btn.classList.toggle("loading", !!on); btn.disabled = !!on; }

// ---------- form controls ----------
const fieldWrap = (id, label, required, inner, { hint, error } = {}) => `<div class="form-field${error ? " has-error" : ""}" data-field="${esc(id)}">${label ? `<label for="${esc(id)}">${esc(label)}${required ? '<span class="req">*</span>' : ""}</label>` : ""}${inner}${hint ? `<div class="ff-hint">${esc(hint)}</div>` : ""}<div class="ff-error" ${error ? "" : "hidden"}>${svg("alert")}<span>${esc(error || "")}</span></div></div>`;
export const FormField = ({ id, label, type = "text", value = "", placeholder = "", required, hint, error, inputmode, autocomplete, icon, max, min, step }) =>
  fieldWrap(id, label, required, `${icon ? `<div class="input-icon">${svg(icon)}` : ""}<input class="input" ${attrs({ id, name: id, type, placeholder, required, inputmode, autocomplete, max, min, step })} value="${esc(value)}">${icon ? "</div>" : ""}`, { hint, error });
export const TextArea = ({ id, label, value = "", placeholder = "", required, hint }) => fieldWrap(id, label, required, `<textarea class="textarea" ${attrs({ id, name: id, placeholder, required })}>${esc(value)}</textarea>`, { hint });
export const Select = ({ id, label, options, value = "", required, placeholder, hint }) => fieldWrap(id, label, required,
  `<select class="select" ${attrs({ id, name: id, required })}>${placeholder ? `<option value="">${esc(placeholder)}</option>` : ""}${options.map(o => { const v = typeof o === "object" ? o.value : o, l = typeof o === "object" ? o.label : o; return `<option value="${esc(v)}"${String(v) === String(value) ? " selected" : ""}>${esc(l)}</option>`; }).join("")}</select>`, { hint });
export const SegmentedControl = (id, options, value) => `<div class="segmented" data-seg="${esc(id)}" role="group">${options.map(o => `<button type="button" data-v="${esc(o.value)}" aria-pressed="${o.value === value}">${esc(o.label)}</button>`).join("")}</div>`;
export const LineTabs = (id, options, value) => `<div class="tabs-line" data-tabs="${esc(id)}" role="tablist">${options.map(o => `<button type="button" role="tab" data-v="${esc(o.value)}" aria-selected="${o.value === value}">${esc(o.label)}</button>`).join("")}</div>`;
export const RadioList = (id, options, value) => `<div class="radio-list" data-radio="${esc(id)}" role="radiogroup">${options.map(o => `<button type="button" class="radio-card" role="radio" data-v="${esc(o.value)}" aria-checked="${o.value === value}"><span class="rc-dot">${svg("check", 3)}</span>${esc(o.label)}</button>`).join("")}</div>`;
export const Stepper = ({ id, label, value = 0, step = 0.5, min = 0 }) => `<div class="stepper"><div class="t-label">${esc(label)}</div><div class="st-row">
  <button type="button" data-step="${esc(id)}" data-d="${-step}" data-min="${min}" aria-label="Less">${svg("minus", 2.4)}</button>
  <input id="${esc(id)}" inputmode="decimal" value="${esc(value)}" aria-label="${esc(label)}">
  <button type="button" data-step="${esc(id)}" data-d="${step}" data-min="${min}" aria-label="More">${svg("plus", 2.4)}</button></div></div>`;
export const Chips = (name, options, selected = [], { icon } = {}) => `<div class="chips" data-chips="${esc(name)}">${options.map(o => `<button type="button" class="chip" data-v="${esc(o)}" aria-pressed="${selected.includes(o)}">${icon ? svg(icon, 2.4) : ""}${esc(o)}</button>`).join("")}</div>`;
export const TruckPicker = (id, trucks, value) => trucks.length ? `<div class="picker-grid" data-pick="${esc(id)}">${trucks.map(t => `<button type="button" class="pick" data-v="${t.id}" aria-pressed="${t.id === value}">${esc(t.unit)}${t.kind ? `<small>${esc(t.kind)}</small>` : ""}</button>`).join("")}</div>`
  : EmptyState({ icon: "truck", title: "No trucks yet", text: "Your admin can add trucks in Company settings." });
export const PeoplePicker = (id, people, selected = []) => `<div class="people-pick" data-people="${esc(id)}">${people.map(p => `<button type="button" class="person-chip" data-v="${esc(p.user_id)}" aria-pressed="${selected.includes(p.user_id)}">${Avatar({ name: p.full_name })}${esc(p.full_name.split(" ")[0] || "?")}${p.user_id === S.user?.id ? " (you)" : ""}</button>`).join("")}</div>`;
export const ChecklistRow = (i, label) => `<div class="check-row" data-check="${i}"><div class="cr-top"><span class="cr-label">${esc(label)}</span><span class="okdef"><button type="button" class="ok" data-ck="${i}" data-v="ok" aria-pressed="false">OK</button><button type="button" class="def" data-ck="${i}" data-v="bad" aria-pressed="false">Defect</button></span></div>
  <div class="cr-defect" hidden><input class="input" data-note="${i}" placeholder="What's wrong with it?"><div class="photo-row"><button type="button" class="photo-add" data-photo="${i}">${svg("camera")}Add photo</button><span data-previews="${i}" class="photo-row"></span></div></div></div>`;
export const Toggle = (id, checked) => `<span class="switch"><input type="checkbox" id="${esc(id)}"${checked ? " checked" : ""}><i></i></span>`;
export const Setting = (title, sub, control) => `<div class="setting"><span class="s-main"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>${control}</div>`;
export const Capture = (id, { title = "Snap a photo", sub = "" } = {}) => `<button type="button" class="capture" id="${esc(id)}">${svg("camera")}${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ""}</button>`;

// ---------- reading control values ----------
export const segValue = (root, id) => root.querySelector(`[data-seg="${id}"] [aria-pressed="true"]`)?.dataset.v ?? null;
export const radioValue = (root, id) => root.querySelector(`[data-radio="${id}"] [aria-checked="true"]`)?.dataset.v ?? null;
export const pickValue = (root, id) => root.querySelector(`[data-pick="${id}"] [aria-pressed="true"]`)?.dataset.v ?? null;
export const chipValues = (root, name) => [...root.querySelectorAll(`[data-chips="${name}"] [aria-pressed="true"]`)].map(b => b.dataset.v);
export const peopleValues = (root, id) => [...root.querySelectorAll(`[data-people="${id}"] [aria-pressed="true"]`)].map(b => b.dataset.v);
export function fieldError(root, id, message) {
  const f = root.querySelector(`[data-field="${id}"]`); if (!f) return;
  f.classList.toggle("has-error", !!message);
  const e = f.querySelector(".ff-error"); if (e) { e.hidden = !message; e.querySelector("span").textContent = message || ""; }
  if (message) f.scrollIntoView({ block: "center", behavior: "smooth" });
}
export const clearErrors = root => root.querySelectorAll(".form-field.has-error").forEach(f => { f.classList.remove("has-error"); const e = f.querySelector(".ff-error"); if (e) e.hidden = true; });

// ---------- behaviour (delegated once) ----------
document.addEventListener("click", e => {
  const st = e.target.closest("[data-step]");
  if (st) { const i = document.getElementById(st.dataset.step); const v = Math.max(Number(st.dataset.min || 0), (parseFloat(i.value) || 0) + Number(st.dataset.d)); i.value = Math.round(v * 100) / 100; i.dispatchEvent(new Event("change", { bubbles: true })); return; }
  const sg = e.target.closest("[data-seg] > button");
  if (sg) { sg.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b === sg)); sg.parentElement.dispatchEvent(new CustomEvent("seg", { bubbles: true, detail: sg.dataset.v })); return; }
  const tb = e.target.closest("[data-tabs] > button");
  if (tb) { tb.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-selected", b === tb)); tb.parentElement.dispatchEvent(new CustomEvent("tab", { bubbles: true, detail: tb.dataset.v })); return; }
  const rd = e.target.closest("[data-radio] > button");
  if (rd) { rd.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-checked", b === rd)); rd.parentElement.dispatchEvent(new CustomEvent("radio", { bubbles: true, detail: rd.dataset.v })); return; }
  const pk = e.target.closest("[data-pick] > button");
  if (pk) { pk.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b === pk)); pk.parentElement.dispatchEvent(new CustomEvent("pick", { bubbles: true, detail: pk.dataset.v })); return; }
  const ch = e.target.closest("[data-chips] > button, [data-people] > button");
  if (ch) { ch.setAttribute("aria-pressed", ch.getAttribute("aria-pressed") !== "true"); return; }
});
// show a border under sticky top bars once the page scrolls
document.addEventListener("scroll", e => { const v = e.target; if (!(v instanceof HTMLElement) || !v.classList.contains("view")) return; const tb = v.querySelector(".topbar"); if (tb) tb.classList.toggle("scrolled", v.scrollTop > 4); }, true);
