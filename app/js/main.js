// Boot, sign-in / create account, join with an invite code, and the 6-step company setup.
import { sb, S, CONFIG, $, esc, store, toast, msg, svg, go, loadCompany, applyTheme, logoUrl, closeSheet, sheet, uploadFile, signUrls, fileUrl } from "./core.js";
import { BrandLockup, PrimaryButton, SecondaryButton, Button, FormField, Select, SegmentedControl, RadioList, StickyBar, IconButton, EmptyState,
  setLoading, fieldError, clearErrors, segValue, radioValue, Avatar } from "./ui.js";
import "./views.js";
import { startChat } from "./chat.js";
import { refreshPush } from "./push.js";
import { flush, refreshNet } from "./outbox.js";

document.title = CONFIG.product;
const paint = root => root.querySelectorAll("[data-i]").forEach(el => { if (!el.querySelector("svg")) el.insertAdjacentHTML("afterbegin", svg(el.dataset.i)); });
paint(document);
new MutationObserver(() => paint(document)).observe(document.body, { childList: true, subtree: true });
$("scrim").addEventListener("click", closeSheet);
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));

const started = Date.now();
const hideSplash = () => setTimeout(() => $("splash").classList.add("gone"), Math.max(0, 650 - (Date.now() - started)));
const gate = $("gate");
function showGate(html, { hero = false } = {}) {
  $("app").hidden = true; gate.hidden = false; gate.classList.toggle("hero-mode", hero);
  gate.innerHTML = html; gate.scrollTop = 0; hideSplash();
}
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
export async function createInvite(companyId, role, { maxUses = null, days = 365, name = null } = {}) {
  for (let i = 0; i < 5; i++) {
    const { data, error } = await sb.from("invites").insert({ company_id: companyId, role, max_uses: maxUses, code: newCode(), name, created_by: S.user.id, expires_at: new Date(Date.now() + days * 86400000).toISOString() }).select().single();
    if (!error && data && data.code) return data;
    if (!error) throw new Error("Couldn't make an invite code. Try again.");
    if (!/duplicate|unique/i.test(error.message)) throw error;
  }
  throw new Error("Couldn't make an invite code. Try again.");
}

const urlJoin = new URLSearchParams(location.search).get("join");
if (urlJoin) store("fp_intent", { kind: "join", code: urlJoin.toUpperCase() });

// ---------- welcome ----------
function welcome() {
  applyTheme("steelcap");
  showGate(`<div class="hero" style="--hero-img:url(hero.jpg)">${BrandLockup({ mark: 58, size: 26 })}</div>
    <div class="gate-body">
      <h1>Run your whole crew<br><span class="accent">from your phone.</span></h1>
      <p class="lead">Safety, dispatch, tickets, expenses and the books. One app. You run the work.</p>
      <div style="margin-top:auto">
        ${PrimaryButton("Start my company", { id: "wStart" })}
        ${SecondaryButton("Try the demo", { id: "wDemo" })}
        ${SecondaryButton("I have an invite code", { id: "wJoin" })}
        <p class="form-msg" id="wMsg"></p>
        <p class="foot">Already set up? <button class="link" type="button" id="wSign">Sign in</button></p>
      </div>
    </div>`, { hero: true });
  $("wStart").onclick = () => { store("fp_intent", { kind: "create" }); account("create"); };
  $("wDemo").onclick = startDemo;
  $("wJoin").onclick = () => joinCode();
  $("wSign").onclick = () => account("signin");
  const qp = new URLSearchParams(location.search);
  if (qp.get("demo")) { history.replaceState(null, "", location.pathname); startDemo(); }
  else if (qp.get("start")) { history.replaceState(null, "", location.pathname); store("fp_intent", { kind: "create" }); account("create"); }
}

// ---------- demo: a private sample company, signed in as its owner ----------
async function startDemo() {
  const b = $("wDemo"); if (b) setLoading(b, true);
  msg("wMsg", "Loading a sample company. Takes a few seconds.");
  const { data, error } = await sb.functions.invoke("demo", { body: {} });
  if (error || !data || data.error) { if (b) setLoading(b, false); return msg("wMsg", (data && data.error) || "Couldn't load the demo. Check your signal and try again.", "bad"); }
  store("fp_intent", null); store("fp_company", data.company_id); store("fp_setup_done_" + data.company_id, 1);
  const { error: se } = await sb.auth.signInWithPassword({ email: data.email, password: data.password });
  if (se) { if (b) setLoading(b, false); msg("wMsg", se.message, "bad"); }
}

// ---------- sign in / create account ----------
function oauthButtons() {
  const o = CONFIG.oauth || {}; if (!o.apple && !o.google) return "";
  return `<div class="or">OR</div>${o.apple ? Button("Continue with Apple", { variant: "secondary", icon: "apple", id: "oaApple" }) : ""}${o.google ? Button("Continue with Google", { variant: "secondary", icon: "google", id: "oaGoogle" }) : ""}`;
}
function account(mode = "signin", preset = {}) {
  const create = mode === "create";
  showGate(`<div class="wiz-top">${IconButton("left", { label: "Back", id: "acBack" })}</div>
    <div style="margin:8px 0 26px">${preset.logo ? `<img src="${esc(preset.logo)}" alt="" style="height:44px; display:block; margin:0 auto">` : BrandLockup({ mark: 46, size: 22 })}</div>
    ${preset.title ? `<h1 style="margin-top:0">${esc(preset.title)}</h1><p class="lead">${esc(preset.lead || "")}</p>` : SegmentedControl("acMode", [{ value: "signin", label: "Sign in" }, { value: "create", label: "Create account" }], mode)}
    <form id="acForm" novalidate style="margin-top:20px">
      <div id="acCreateFields" ${create ? "" : "hidden"}>
        ${FormField({ id: "acName", label: "Full name", icon: "user", autocomplete: "name", value: preset.name || "" })}
        ${FormField({ id: "acPhone", label: "Phone (optional)", icon: "phone", type: "tel", autocomplete: "tel" })}
      </div>
      ${FormField({ id: "acEmail", label: "Email", icon: "mail", type: "email", autocomplete: "username", value: store("fp_email") || "" })}
      <div class="form-field" data-field="acPass"><label for="acPass">Password</label><div class="input-icon">${svg("lock")}<input class="input" id="acPass" type="password" autocomplete="${create ? "new-password" : "current-password"}"><button type="button" class="icon-btn reveal" id="acReveal" aria-label="Show password">${svg("eye")}</button></div><div class="ff-error" hidden>${svg("alert")}<span></span></div></div>
      <div style="text-align:right; margin:-6px 0 12px" id="acForgotWrap" ${create ? "hidden" : ""}><button class="link" type="button" id="acForgot">Forgot password?</button></div>
      ${PrimaryButton(create ? "Create account" : "Sign in", { id: "acBtn", type: "submit" })}
      <p class="form-msg" id="acMsg"></p>
    </form>
    ${oauthButtons()}`);
  let m = mode;
  const setMode = v => { m = v; $("acCreateFields").hidden = v !== "create"; $("acForgotWrap").hidden = v === "create"; $("acBtn").querySelector("span").textContent = v === "create" ? "Create account" : "Sign in"; $("acPass").autocomplete = v === "create" ? "new-password" : "current-password"; msg("acMsg", ""); clearErrors(gate); };
  gate.addEventListener("seg", e => setMode(e.detail));
  $("acBack").onclick = () => store("fp_intent")?.kind === "join" && preset.title ? joinCode() : welcome();
  $("acReveal").onclick = () => { const p = $("acPass"); p.type = p.type === "password" ? "text" : "password"; };
  $("acForgot").onclick = async () => {
    const email = $("acEmail").value.trim(); if (!email) return fieldError(gate, "acEmail", "Type your email first");
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    msg("acMsg", error ? error.message : "If that email has an account, a reset link is on its way.", error ? "bad" : "ok");
  };
  const oa = p => async () => { const { error } = await sb.auth.signInWithOAuth({ provider: p, options: { redirectTo: location.origin + location.pathname } }); if (error) msg("acMsg", error.message, "bad"); };
  if ($("oaApple")) $("oaApple").onclick = oa("apple");
  if ($("oaGoogle")) $("oaGoogle").onclick = oa("google");
  $("acForm").onsubmit = async e => {
    e.preventDefault(); clearErrors(gate); msg("acMsg", "");
    const email = $("acEmail").value.trim(), pass = $("acPass").value, name = $("acName").value.trim(), phone = $("acPhone").value.trim();
    if (m === "create" && !name) return fieldError(gate, "acName", "Enter your name");
    if (!/^\S+@\S+\.\S+$/.test(email)) return fieldError(gate, "acEmail", "Enter a valid email");
    if (pass.length < (m === "create" ? 8 : 1)) return fieldError(gate, "acPass", m === "create" ? "At least 8 characters" : "Enter your password");
    setLoading($("acBtn"), true);
    if (m === "create") {
      const intent = store("fp_intent") || {}; store("fp_intent", { ...intent, full_name: name, phone });
      const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { full_name: name, phone }, emailRedirectTo: location.origin + location.pathname } });
      setLoading($("acBtn"), false);
      if (error) return msg("acMsg", /registered/i.test(error.message) ? "That email already has an account. Sign in instead." : error.message, "bad");
      store("fp_email", email);
      if (!data.session) { setMode("signin"); gate.querySelector('[data-seg="acMode"] [data-v="signin"]')?.click(); msg("acMsg", "Check your email for a confirmation link, then sign in here.", "ok"); }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password: pass });
      setLoading($("acBtn"), false);
      if (error) return msg("acMsg", /confirm/i.test(error.message) ? "Confirm your email first. Check your inbox for the link." : "Wrong email or password.", "bad");
      store("fp_email", email);
    }
  };
}

// ---------- join with a code ----------
function codeBoxes(prefill = "") {
  const chars = prefill.length === 5 ? prefill.split("") : ["", "", "", "", ""];
  return `<div class="code-boxes" id="codeBoxes">${chars.map((c, i) => `<input maxlength="1" inputmode="text" autocapitalize="characters" autocomplete="off" aria-label="Character ${i + 1}" value="${esc(c)}">`).join("")}</div>`;
}
function wireBoxes(onFull) {
  const ins = [...$("codeBoxes").querySelectorAll("input")];
  ins.forEach((inp, i) => {
    inp.addEventListener("input", () => {
      const v = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (v.length > 1) { v.split("").slice(0, 5 - i).forEach((c, k) => ins[i + k].value = c); ins[Math.min(4, i + v.length - 1)].focus(); }
      else { inp.value = v; if (v && i < 4) ins[i + 1].focus(); }
      const code = ins.map(x => x.value).join(""); if (code.length === 5) onFull(code);
    });
    inp.addEventListener("keydown", e => { if (e.key === "Backspace" && !inp.value && i > 0) ins[i - 1].focus(); });
  });
  return () => ins.map(x => x.value).join("").toUpperCase();
}
async function joinCode(prefill = "") {
  const long = prefill && prefill.length !== 5;
  showGate(`<div class="wiz-top">${IconButton("left", { label: "Back", id: "jcBack" })}</div>
    <h1 style="margin-top:8px">Join your crew</h1><p class="lead">Enter the invite code from your company.</p>
    ${long ? FormField({ id: "jcLong", label: "Invite code", value: prefill }) : codeBoxes(prefill)}
    <div style="margin-top:22px">${PrimaryButton("Continue", { id: "jcBtn" })}</div>
    <p class="form-msg" id="jcMsg"></p><div id="jcCo"></div>`);
  $("jcBack").onclick = welcome;
  const getCode = long ? () => $("jcLong").value.trim().toUpperCase() : wireBoxes(() => $("jcBtn").click());
  $("jcBtn").onclick = async () => {
    const code = getCode(); if (code.length < 4) return msg("jcMsg", "Enter the whole code.", "bad");
    setLoading($("jcBtn"), true);
    const { data } = await sb.rpc("invite_preview", { p_code: code });
    setLoading($("jcBtn"), false);
    if (!data) return msg("jcMsg", "That code didn't work. It may be expired or already used.", "bad");
    store("fp_intent", { kind: "join", code });
    applyTheme(data.theme, data.accent);
    const { data: s } = await sb.auth.getSession();
    if (s.session) return route(s.session);
    account("create", { title: `Join ${data.company}`, lead: "You're joining this company. Make your account and you're in.", logo: logoUrl(data.logo_path), name: data.name || "" });
  };
  if (prefill && !long) setTimeout(() => $("jcBtn").click(), 50);
}

// ---------- routing after sign-in ----------
let routing = false;
async function route(session) {
  if (routing) return; routing = true;
  try {
    if (!session) { S.user = null; welcome(); return; }
    S.user = session.user;
    const intent = store("fp_intent") || {}, meta = S.user.user_metadata || {};
    if (intent.kind === "join" && intent.code) {
      const { data, error } = await sb.rpc("accept_invite", { p_code: intent.code, p_full_name: intent.full_name || meta.full_name || meta.name || "", p_phone: intent.phone || meta.phone || null });
      store("fp_intent", null);
      if (error) toast(error.message, "alert"); else store("fp_company", data);
    }
    const { data: cos } = await sb.rpc("my_companies");
    S.companies = cos || [];
    if (!S.companies.length) return intent.kind === "join" ? joinCode() : wizard(1);
    const want = store("fp_company"), pick = S.companies.find(c => c.company_id === want) || S.companies[0];
    await enter(pick.company_id);
  } finally { routing = false; }
}
export async function enter(cid) {
  await loadCompany(cid);
  gate.hidden = true; $("app").hidden = false; hideSplash();
  if (S.company.created_by === S.user.id && !store("fp_setup_done_" + cid) && S.trucks.length === 0 && !S.company.logo_path) return wizard(2);
  const qp = new URLSearchParams(location.search);
  if ([...qp.keys()].length) history.replaceState(null, "", location.pathname);
  if (qp.get("qbo")) go("integrations"); else if (qp.get("chat")) go("thread", { id: qp.get("chat") }); else go(qp.get("v") || "home");
  startChat(); refreshPush(); refreshNet(); flush();
}
sb.auth.onAuthStateChange((evt, session) => {
  if (evt === "PASSWORD_RECOVERY") return newPassword();
  if (evt === "SIGNED_OUT") { S.user = null; S.company = null; welcome(); return; }
  if (evt === "INITIAL_SESSION" || evt === "SIGNED_IN") setTimeout(() => { if (!S.company || !session || S.user?.id !== session.user.id) route(session); }, 0);
});
function newPassword() {
  showGate(`<div style="margin:24px 0">${BrandLockup({ mark: 46, size: 22 })}</div><h1>New password</h1>
    <form id="npForm">${FormField({ id: "npPass", label: "New password", type: "password", autocomplete: "new-password" })}${PrimaryButton("Save password", { id: "npBtn", type: "submit" })}<p class="form-msg" id="npMsg"></p></form>`);
  $("npForm").onsubmit = async e => { e.preventDefault(); if ($("npPass").value.length < 8) return fieldError(gate, "npPass", "At least 8 characters"); setLoading($("npBtn"), true); const { error } = await sb.auth.updateUser({ password: $("npPass").value }); setLoading($("npBtn"), false); if (error) msg("npMsg", error.message, "bad"); else { toast("Password saved"); history.replaceState(null, "", location.pathname); const { data } = await sb.auth.getSession(); route(data.session); } };
}

// ---------- company setup (6 steps) ----------
const STEPS = 6;
const wizHead = (n, title, lead, single) => `<div class="wiz-top">${n > 1 || single ? IconButton("left", { label: "Back", id: "wzBack" }) : "<span></span>"}<span></span></div>
  ${single ? "" : `<div class="progress">${Array.from({ length: STEPS }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</div><div class="t-eyebrow">${n} of ${STEPS}</div>`}
  <h1 style="margin:${single ? 4 : 8}px 0 6px">${esc(title)}</h1><p class="lead">${esc(lead)}</p>`;
const wizFoot = (label = "Next", skip) => `<div style="margin-top:auto; padding-top:24px">${PrimaryButton(label, { id: "wzNext" })}${skip ? `<button class="btn ghost full" type="button" id="wzSkip" style="margin-top:6px">Skip for now</button>` : ""}<p class="form-msg" id="wzMsg"></p></div>`;
export const TRUCK_KINDS = ["Picker", "Pickup", "Flatbed", "Skid steer", "Hydrovac", "Vac truck", "Water truck", "Welding rig", "Other"];

export async function wizard(n, opts = {}) {
  const single = !!opts.single;
  const next = k => single ? (store("fp_setup_done_" + S.company.id, 1), enter(S.company.id).then(() => go("settings"))) : wizard(k);
  const prev = () => single ? enter(S.company.id).then(() => go("settings")) : wizard(n - 1);
  const co = S.company, intent = store("fp_intent") || {}, meta = (S.user && S.user.user_metadata) || {};
  const bindBack = () => { const b = $("wzBack"); if (b) b.onclick = prev; };

  if (n === 1) {
    showGate(`${wizHead(1, "Let's get started", "Tell us about your company. You can change all of this later.")}
      <form id="wz" novalidate style="display:flex; flex-direction:column; flex:1">
      ${FormField({ id: "wzName", label: "Company name", autocomplete: "organization", required: true })}
      ${FormField({ id: "wzMe", label: "Your full name", value: intent.full_name || meta.full_name || "", required: true })}
      ${Select({ id: "wzProv", label: "Province", options: [{ value: "AB", label: "Alberta" }, { value: "BC", label: "British Columbia" }, { value: "SK", label: "Saskatchewan" }, { value: "MB", label: "Manitoba" }, { value: "ON", label: "Ontario" }, { value: "Other", label: "Other" }], value: "AB" })}
      ${wizFoot()}</form>`);
    $("wzNext").type = "submit";
    $("wz").onsubmit = async e => {
      e.preventDefault(); clearErrors(gate);
      if (!$("wzName").value.trim()) return fieldError(gate, "wzName", "Enter your company name");
      if (!$("wzMe").value.trim()) return fieldError(gate, "wzMe", "Enter your name");
      setLoading($("wzNext"), true);
      const prov = $("wzProv").value, tz = { BC: "America/Vancouver", SK: "America/Regina", MB: "America/Winnipeg", ON: "America/Toronto" }[prov] || "America/Edmonton";
      const { data, error } = await sb.rpc("create_company", { p_name: $("wzName").value, p_full_name: $("wzMe").value, p_phone: intent.phone || meta.phone || null, p_province: prov, p_timezone: tz });
      if (error) { setLoading($("wzNext"), false); return msg("wzMsg", error.message, "bad"); }
      store("fp_intent", null); await loadCompany(data); wizard(2);
    };
    return;
  }

  if (n === 2) {
    let theme = co.theme || "steelcap", accent = co.accent || "", logoFile = null;
    const LOOKS = [["steelcap", "Steelcap", "#0B0E10", "#00C2B2", "#E9ECEF"], ["espresso", "Espresso", "#120B07", "#E3B873", "#F3EBDF"], ["steel", "Steel", "#0E1215", "#FF8A3D", "#EEF2F4"], ["daylight", "Daylight", "#F3F4F6", "#0A7F75", "#15191D"]];
    const SW = ["", "#E3B873", "#FF8A3D", "#E04F3E", "#F2C230", "#3FB36B", "#2F9BD6", "#3B5BDB", "#9B6BD6"];
    showGate(`${wizHead(2, "Make it yours", "Upload your logo and choose a look for your app.", single)}
      <div class="form-field"><span class="ff-label">Company logo</span>
        <button type="button" class="logo-drop" id="wzLogo">${co.logo_path ? `<img src="${esc(logoUrl(co.logo_path))}" alt="Logo">` : `${svg("camera")} Add your logo`}</button><input type="file" id="wzLogoIn" accept="image/*" hidden></div>
      <div class="form-field"><span class="ff-label">App look</span><div class="look-grid">${LOOKS.map(l => `<button type="button" class="look" data-look="${l[0]}" aria-pressed="${theme === l[0]}"><span class="lk-sw" style="background:${l[2]}; border:1px solid rgba(128,128,128,.25)"><i style="background:${l[3]}; width:58%"></i><i style="background:${l[4]}; opacity:.45; width:84%"></i></span><b>${l[1]}</b>${theme === l[0] ? `<span class="lk-check">${svg("check", 3)}</span>` : ""}</button>`).join("")}</div></div>
      <div class="form-field"><span class="ff-label">Accent colour</span><div class="swatches">${SW.map(c => `<button type="button" class="swatch" data-acc="${c}" aria-pressed="${accent === c}" aria-label="${c || "Look default"}" style="background:${c || "conic-gradient(#00C2B2 0 25%, #E3B873 0 50%, #FF8A3D 0 75%, #0A7F75 0)"}"></button>`).join("")}</div><div class="ff-hint">Leave on the first one to use the look's own colour.</div></div>
      ${wizFoot(single ? "Save" : "Next")}`);
    applyTheme(theme, accent); bindBack();
    const redrawLooks = () => gate.querySelectorAll("[data-look]").forEach(b => { const on = b.dataset.look === theme; b.setAttribute("aria-pressed", on); b.querySelector(".lk-check")?.remove(); if (on) b.insertAdjacentHTML("beforeend", `<span class="lk-check">${svg("check", 3)}</span>`); });
    $("wzLogo").onclick = () => $("wzLogoIn").click();
    $("wzLogoIn").onchange = () => { logoFile = $("wzLogoIn").files[0]; if (logoFile) $("wzLogo").innerHTML = `<img src="${URL.createObjectURL(logoFile)}" alt="Logo">`; };
    gate.querySelectorAll("[data-look]").forEach(b => b.onclick = () => { theme = b.dataset.look; redrawLooks(); applyTheme(theme, accent); });
    gate.querySelectorAll("[data-acc]").forEach(b => b.onclick = () => { accent = b.dataset.acc; gate.querySelectorAll("[data-acc]").forEach(x => x.setAttribute("aria-pressed", x === b)); applyTheme(theme, accent); });
    $("wzNext").onclick = async () => {
      setLoading($("wzNext"), true);
      const upd = { theme, accent: accent || null };
      if (logoFile) {
        const ext = (logoFile.type.split("/")[1] || "png").replace("svg+xml", "svg").replace("jpeg", "jpg");
        const path = `${co.id}/logo-${Date.now()}.${ext}`;
        const { error } = await sb.storage.from("logos").upload(path, logoFile, { contentType: logoFile.type, upsert: true });
        if (!error) upd.logo_path = path; else toast("Logo didn't upload. Add it later in Settings.", "alert");
      }
      await sb.from("companies").update(upd).eq("id", co.id);
      await loadCompany(co.id); next(3);
    };
    return;
  }

  if (n === 3) {
    const ps = co.pay_schedule || { type: "semi-monthly", paydays: [1, 15] };
    const dayOpts = [...Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: ordinal(i + 1) })), { value: "0", label: "Last day of month" }];
    const pd = ps.paydays || [1, 15];
    showGate(`${wizHead(3, "Pay schedule", "Paydays and cut-offs show on your crew's calendar, so they stop asking.", single)}
      <div class="form-field">${RadioList("wzType", [{ value: "semi-monthly", label: "Twice a month" }, { value: "biweekly", label: "Every 2 weeks" }, { value: "weekly", label: "Weekly" }], ps.type || "semi-monthly")}</div>
      <div id="wzSemi">${Select({ id: "wzP1", label: "1st payday", options: dayOpts, value: String(pd[0] ?? 1) })}${Select({ id: "wzP2", label: "2nd payday", options: dayOpts, value: String(pd[1] ?? 15) })}
        <div class="ff-hint" style="margin-top:-6px">Cut-offs are the 15th and the last day of the month.</div></div>
      <div id="wzBi" hidden>${FormField({ id: "wzAnchor", label: "A recent payday", type: "date", value: ps.anchor || "" })}${FormField({ id: "wzLag", label: "Cut-off is how many days before payday?", type: "number", inputmode: "numeric", value: ps.lag_days ?? 5 })}</div>
      <div class="banner" style="margin-top:8px">${svg("info")}<div>Paydays on a weekend or stat holiday move to the business day before.</div></div>
      ${wizFoot(single ? "Save" : "Next", !single)}`);
    bindBack();
    const sync = () => { const t = radioValue(gate, "wzType"); $("wzSemi").hidden = t !== "semi-monthly"; $("wzBi").hidden = t === "semi-monthly"; };
    gate.addEventListener("radio", sync); sync();
    if ($("wzSkip")) $("wzSkip").onclick = () => next(4);
    $("wzNext").onclick = async () => {
      clearErrors(gate);
      const type = radioValue(gate, "wzType");
      const sched = type === "semi-monthly" ? { type, paydays: [Number($("wzP1").value), Number($("wzP2").value)] } : { type, anchor: $("wzAnchor").value, lag_days: Number($("wzLag").value || 5) };
      if (type !== "semi-monthly" && !sched.anchor) return fieldError(gate, "wzAnchor", "Pick a recent payday so we can line up the schedule");
      setLoading($("wzNext"), true);
      await sb.from("companies").update({ pay_schedule: sched }).eq("id", co.id);
      await loadCompany(co.id); next(4);
    };
    return;
  }

  if (n === 4 || n === 5) {
    const isT = n === 4;
    const draw = async () => {
      if (isT) await signUrls(S.trucks.map(t => t.photo_path));
      $("wzList").innerHTML = (isT ? S.trucks : S.clients).map(r => isT
        ? `<button type="button" class="truck-card" data-edit="${r.id}" style="width:100%; text-align:left; color:inherit">${r.photo_path && fileUrl(r.photo_path) ? `<img class="tc-img" src="${esc(fileUrl(r.photo_path))}" alt="">` : `<span class="tc-img">${svg("truck")}</span>`}<span class="tc-main"><b>${esc(r.unit)}${r.kind ? " · " + esc(r.kind) : ""}</b><small>${r.rate_hour ? "$" + r.rate_hour + " / hr" : "No rate set"}</small></span>${svg("chev")}</button>`
        : `<button type="button" class="truck-card" data-edit="${r.id}" style="width:100%; text-align:left; color:inherit">${Avatar({ name: r.name })}<span class="tc-main"><b>${esc(r.name)}</b><small>${r.rate_hour ? "$" + r.rate_hour + " / hr" : "No rate set"}</small></span>${svg("chev")}</button>`).join("")
        || EmptyState({ icon: isT ? "truck" : "users", title: isT ? "No trucks yet" : "No clients yet", text: isT ? "Add each unit. Pre-Trips and tickets get tied to them." : "Tickets and invoice drafts get sorted by client." });
    };
    showGate(`${wizHead(n, isT ? "Add your trucks" : "Add your clients", isT ? "Add the units your crew uses." : "Add the companies you work for.", single)}
      <div id="wzList"></div>
      <button class="btn ghost full" type="button" id="wzAdd" style="margin-top:8px">${svg("plus")}<span>${isT ? "Add truck" : "Add client"}</span></button>
      ${wizFoot(single ? "Done" : "Next", !single)}`);
    bindBack(); await draw();
    const editor = row => (isT ? truckSheet : clientSheet)(row, async () => { await loadCompany(co.id); await draw(); });
    $("wzAdd").onclick = () => editor(null);
    $("wzList").onclick = e => { const b = e.target.closest("[data-edit]"); if (b) editor((isT ? S.trucks : S.clients).find(x => x.id === b.dataset.edit)); };
    if ($("wzSkip")) $("wzSkip").onclick = () => next(n + 1);
    $("wzNext").onclick = () => next(n + 1);
    return;
  }

  if (n === 6) {
    let inv = (await sb.from("invites").select("*").eq("company_id", co.id).is("max_uses", null).eq("role", "crew").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1)).data?.[0];
    if (!inv) { try { inv = await createInvite(co.id, "crew"); } catch (e) { toast(e.message, "alert"); } }
    const code = (inv && inv.code) || "-----";
    const link = location.origin + location.pathname + "?join=" + code;
    const text = `Join ${co.name} on ${CONFIG.product}: ${link} (code ${code})`;
    showGate(`${wizHead(6, "Invite your crew", "Send this code to your crew to join your company.")}
      <div class="code-display" aria-label="Invite code ${esc(code)}">${code.split("").map(c => `<span>${esc(c)}</span>`).join("")}</div>
      <div style="margin-top:24px">${PrimaryButton("Send by text", { id: "wzShare", icon: "chat" })}${SecondaryButton("Copy link", { id: "wzCopy", icon: "link" })}</div>
      <p class="t-small" style="text-align:center; margin-top:16px">One code works for your whole crew. Make someone an admin later in More › Team.</p>
      ${wizFoot("Finish setup")}`);
    bindBack();
    $("wzShare").onclick = async () => { if (navigator.share) { try { await navigator.share({ text }); } catch (e) {} } else location.href = "sms:?&body=" + encodeURIComponent(text); };
    $("wzCopy").onclick = async () => { try { await navigator.clipboard.writeText(text); toast("Link copied"); } catch (e) { toast(link); } };
    $("wzNext").onclick = () => { store("fp_setup_done_" + co.id, 1); enter(co.id); };
  }
}
const ordinal = n => n + (["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");

// ---------- truck / client editors (used by setup and settings) ----------
export function truckSheet(row, done) {
  let photo = null;
  sheet(`<h3>${row ? "Edit truck" : "Add truck"}</h3><p class="sh-sub">Pre-Trips, tickets and fuel get tied to each unit.</p>
    <button type="button" class="logo-drop" id="tsPhoto" style="min-height:120px">${row?.photo_path && fileUrl(row.photo_path) ? `<img src="${esc(fileUrl(row.photo_path))}" alt="" style="max-height:110px; max-width:100%; border-radius:10px">` : `${svg("camera")} Add a photo`}</button><input type="file" id="tsPhotoIn" accept="image/*" hidden>
    <div style="height:14px"></div>
    ${FormField({ id: "tsUnit", label: "Unit number", value: row?.unit || "", placeholder: "e.g. 08", required: true })}
    ${Select({ id: "tsKind", label: "Type", options: TRUCK_KINDS, value: row?.kind || "", placeholder: "Pick a type" })}
    ${FormField({ id: "tsRate", label: "Hourly rate (optional)", inputmode: "decimal", value: row?.rate_hour ?? "", placeholder: "$ / hr" })}
    ${PrimaryButton("Save truck", { id: "tsSave" })}${row ? Button("Remove truck", { variant: "danger", id: "tsDel" }) : ""}<p class="form-msg" id="tsMsg"></p>`, el => {
    el.querySelector("#tsPhoto").onclick = () => el.querySelector("#tsPhotoIn").click();
    el.querySelector("#tsPhotoIn").onchange = () => { photo = el.querySelector("#tsPhotoIn").files[0]; if (photo) el.querySelector("#tsPhoto").innerHTML = `<img src="${URL.createObjectURL(photo)}" alt="" style="max-height:110px; max-width:100%; border-radius:10px">`; };
    el.querySelector("#tsSave").onclick = async () => {
      const unit = el.querySelector("#tsUnit").value.trim(); if (!unit) return fieldError(el, "tsUnit", "Enter the unit number");
      setLoading(el.querySelector("#tsSave"), true);
      const rec = { company_id: S.company.id, unit, kind: el.querySelector("#tsKind").value || null, rate_hour: Number(el.querySelector("#tsRate").value) || null };
      try { if (photo) rec.photo_path = (await uploadFile("trucks", photo)).path; } catch (e) { toast("Photo didn't upload", "alert"); }
      const { error } = row ? await sb.from("trucks").update(rec).eq("id", row.id) : await sb.from("trucks").insert(rec);
      setLoading(el.querySelector("#tsSave"), false);
      if (error) return msg(el.querySelector("#tsMsg"), error.message, "bad");
      closeSheet(); toast(row ? "Truck saved" : "Truck added"); done && done();
    };
    const d = el.querySelector("#tsDel"); if (d) d.onclick = async () => { if (!confirm(`Remove truck ${row.unit}?`)) return; const { error } = await sb.from("trucks").delete().eq("id", row.id); closeSheet(); if (error) return toast(error.message, "alert"); toast("Truck removed"); done && done(); };
  });
}
export function clientSheet(row, done) {
  sheet(`<h3>${row ? "Edit client" : "Add client"}</h3><p class="sh-sub">Tickets and invoice drafts get sorted by client.</p>
    ${FormField({ id: "csName", label: "Client name", value: row?.name || "", required: true })}
    ${FormField({ id: "csRate", label: "Hourly rate (optional)", inputmode: "decimal", value: row?.rate_hour ?? "", placeholder: "$ / hr", hint: "Used on invoice drafts. Leave blank to use the truck's rate." })}
    ${PrimaryButton("Save client", { id: "csSave" })}${row ? Button("Remove client", { variant: "danger", id: "csDel" }) : ""}<p class="form-msg" id="csMsg"></p>`, el => {
    el.querySelector("#csSave").onclick = async () => {
      const name = el.querySelector("#csName").value.trim(); if (!name) return fieldError(el, "csName", "Enter the client's name");
      setLoading(el.querySelector("#csSave"), true);
      const rec = { company_id: S.company.id, name, rate_hour: Number(el.querySelector("#csRate").value) || null };
      const { error } = row ? await sb.from("clients").update(rec).eq("id", row.id) : await sb.from("clients").insert(rec);
      setLoading(el.querySelector("#csSave"), false);
      if (error) return msg(el.querySelector("#csMsg"), error.message, "bad");
      closeSheet(); toast(row ? "Client saved" : "Client added"); done && done();
    };
    const d = el.querySelector("#csDel"); if (d) d.onclick = async () => { if (!confirm(`Remove ${row.name}?`)) return; await sb.from("clients").delete().eq("id", row.id); closeSheet(); toast("Client removed"); done && done(); };
  });
}

// people on more than one crew can switch
export function switchCompany() {
  sheet(`<h3>Switch company</h3><p class="sh-sub">You're on more than one crew.</p><div class="list">${S.companies.map(c => `<button class="list-row" type="button" data-co="${c.company_id}">${Avatar({ name: c.name })}<span class="lr-main"><div class="lr-title">${esc(c.name)}</div><div class="lr-sub">${esc(c.role)}</div></span></button>`).join("")}
    <button class="list-row" type="button" data-co="new"><span class="lr-ic">${svg("plus")}</span><span class="lr-main"><div class="lr-title">Start another company</div></span></button></div>`,
  el => el.onclick = e => { const b = e.target.closest("[data-co]"); if (!b) return; closeSheet(); if (b.dataset.co === "new") { S.company = null; wizard(1); } else enter(b.dataset.co); });
}
window.__fp = { wizard, switchCompany, enter, truckSheet, clientSheet, createInvite };
