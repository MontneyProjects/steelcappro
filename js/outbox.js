// Offline outbox. Safety forms, field tickets and fuel logs (photos included) save on the phone when there's no signal
// and send themselves once signal comes back. Stored in IndexedDB so photos survive closing the app.
import { sb, S, $, svg, esc, toast, uploadFile } from "./core.js";

const DB = "steelcap-outbox", STORE = "items";
let dbp = null;
const open = () => dbp || (dbp = new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
}));
const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(STORE, mode); const out = fn(t.objectStore(STORE)); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); }); };
const all = () => tx("readonly", s => s.getAll());
const put = item => tx("readwrite", s => s.put(item));
const del = id => tx("readwrite", s => s.delete(id));

const isNetworkError = e => !navigator.onLine || /fetch|network|load failed|timed? ?out/i.test(String((e && (e.message || e)) || ""));

// item: { label, table, row, uploads: [{ area, blob, name, type, set }] }  set = "receipt_path" | "defects.<i>"
async function send(item) {
  const row = JSON.parse(JSON.stringify(item.row));
  for (const u of item.uploads || []) {
    if (u.done) { apply(row, u.set, u.done); continue; }
    const res = await uploadFile(u.area, new File([u.blob], u.name || "photo.jpg", { type: u.type || "image/jpeg" }));
    u.done = res.path; apply(row, u.set, res.path);
  }
  const { error } = await sb.from(item.table).insert(row);
  if (error) throw error;
}
function apply(row, set, path) {
  if (set === "receipt_path") row.receipt_path = path;
  else if (set && set.startsWith("defects.")) { const i = Number(set.split(".")[1]); if (row.defects && row.defects[i]) (row.defects[i].photos = row.defects[i].photos || []).push(path); }
}

// Try to send now; if there's no signal, keep it on the phone. Returns { sent } or { queued }.
export async function submit(item) {
  item = { id: crypto.randomUUID(), created: Date.now(), company_id: S.company?.id, ...item };
  if (navigator.onLine) {
    try { await send(item); return { sent: true }; }
    catch (e) { if (!isNetworkError(e)) throw e; }
  }
  await put(item); refresh();
  return { queued: true };
}

let flushing = false;
export async function flush() {
  if (flushing || !navigator.onLine || !S.user) return;
  flushing = true;
  let sent = 0;
  try {
    for (const item of await all()) {
      if (item.company_id && S.company && item.company_id !== S.company.id) continue;
      try { await send(item); await del(item.id); sent++; }
      catch (e) { if (isNetworkError(e)) break; item.error = String(e.message || e).slice(0, 200); item.uploads = item.uploads || []; await put(item); }
    }
  } finally { flushing = false; refresh(); }
  if (sent) toast(`${sent} saved item${sent > 1 ? "s" : ""} sent`, "upload");
}
export async function pendingCount() { try { return (await all()).filter(i => !i.company_id || !S.company || i.company_id === S.company.id).length; } catch (e) { return 0; } }

// connection pill at the top of the screen
async function refresh() {
  const pill = $("netPill"); if (!pill) return;
  const n = await pendingCount();
  if (!navigator.onLine) { pill.hidden = false; pill.innerHTML = `${svg("cloudoff", 2.2)}<span>No signal${n ? ` · ${n} waiting to send` : ""}</span>`; }
  else if (n) { pill.hidden = false; pill.innerHTML = `${svg("upload", 2.2)}<span>Sending ${n} saved item${n > 1 ? "s" : ""}…</span>`; }
  else pill.hidden = true;
}
addEventListener("online", () => { refresh(); flush(); });
addEventListener("offline", refresh);
document.addEventListener("visibilitychange", () => { if (!document.hidden) flush(); });
setInterval(flush, 60000);
export { refresh as refreshNet };
