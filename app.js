import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { STRINGS } from "./i18n.js";

/* ============================================================
   Setup
   ============================================================ */
const CFG = window.APP_CONFIG || {};
const DEMO = !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY;
const sb = DEMO ? null : createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

const TZ = "Asia/Bangkok";
const STYLES = ["Salsa", "Bachata", "Swing", "Tango", "Kizomba", "Zouk", "West Coast Swing", "Other"];
const STYLE_VAR = { Salsa: "--salsa", Bachata: "--bachata", Swing: "--swing", Tango: "--tango", Kizomba: "--kizomba", Zouk: "--zouk", "West Coast Swing": "--wcs", Other: "--other" };
const STATIONS = [
  ["Siam", 13.7456, 100.5341], ["Asok / Sukhumvit", 13.7370, 100.5603], ["Phrom Phong", 13.7305, 100.5697],
  ["Thong Lo", 13.7243, 100.5784], ["Ekkamai", 13.7196, 100.5851], ["Sala Daeng / Silom", 13.7286, 100.5343],
  ["Chong Nonsi / Sathorn", 13.7236, 100.5294], ["Ari", 13.7797, 100.5446], ["Victory Monument", 13.7627, 100.5372],
  ["Ratchathewi", 13.7516, 100.5316], ["Saphan Taksin", 13.7187, 100.5142], ["Lumphini", 13.7255, 100.5454],
  ["Khao San / Old Town", 13.7590, 100.4970]
];

const S = {
  lang: "en", events: [], mine: new Set(), session: null, profile: null,
  style: "All", near: "", here: null, selected: null, mode: "view", confirmDel: false,
  loaded: false, busy: false, guests: [], guestsFor: null
};
const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem("floor." + k); localStorage.setItem("floor." + k, v); } catch (_) { return null; } };
S.lang = pref("lang") || ((navigator.language || "").toLowerCase().startsWith("th") ? "th" : "en");
S.style = pref("style") || "All";
S.near = pref("near") || "";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const col = st => "var(" + (STYLE_VAR[st] || "--other") + ")";
const t = (k, ...a) => { const v = STRINGS[S.lang][k] ?? STRINGS.en[k]; return typeof v === "function" ? v(...a) : v; };
const isOrganiser = () => !!S.profile && ["organiser", "admin"].includes(S.profile.role);
const uid = () => S.session?.user?.id || null;

/* ============================================================
   Time helpers (everything shown in Bangkok time)
   ============================================================ */
const locale = () => (S.lang === "th" ? "th-TH-u-ca-gregory" : "en-GB");
const ms = iso => new Date(iso).getTime();
const bkkDate = d => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(d));
const bkkTime = d => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d));
const weekday = d => new Intl.DateTimeFormat(locale(), { timeZone: TZ, weekday: "long" }).format(new Date(d));
const dayShort = d => new Intl.DateTimeFormat(locale(), { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date(d));
function dur(x) { const m = Math.max(1, Math.round(x / 60000)), h = Math.floor(m / 60), r = m % 60; return h ? `${h}h${r ? " " + r + "m" : ""}` : `${r}m`; }
function toIso(date, time) { return new Date(`${date}T${time}:00+07:00`).toISOString(); }

/* ============================================================
   Distance
   ============================================================ */
function km(a1, o1, a2, o2) { const R = 6371, r = x => x * Math.PI / 180; const h = Math.sin(r(a2 - a1) / 2) ** 2 + Math.cos(r(a1)) * Math.cos(r(a2)) * Math.sin(r(o2 - o1) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
function origin() {
  if (S.here) return { lat: S.here.lat, lng: S.here.lng, label: t("you") };
  const st = STATIONS.find(s => s[0] === S.near);
  return st ? { lat: st[1], lng: st[2], label: st[0] } : null;
}
function distText(e) {
  const o = origin(); if (!o || e.lat == null || e.lng == null) return "";
  return t("kmFrom", km(o.lat, o.lng, e.lat, e.lng).toFixed(1), o.label);
}
// Only allow normal web links (blocks javascript: and other tricks).
function safeUrl(u) {
  if (!u) return "";
  let s = String(u).trim();
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try { const x = new URL(s); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (_) { return ""; }
}
const mapsUrl = e => "https://www.google.com/maps/search/?api=1&query=" + (e.lat != null && e.lng != null ? `${e.lat},${e.lng}` : encodeURIComponent(`${e.venue || ""} Bangkok`));

/* ============================================================
   Status pills
   ============================================================ */
function status(e, now) {
  const out = [];
  if (e.is_sample) out.push(["sample", t("sample")]);
  if (e.status === "cancelled") { out.push(["cancel", t("cancelled")]); return out; }
  const s = ms(e.starts_at), en = ms(e.ends_at);
  if (now >= s && now < en) out.push(["live", t("liveNow", bkkTime(e.ends_at))]);
  else if (s > now && s - now < 4 * 3600e3) out.push(["soon", t("startsIn", dur(s - now))]);
  if (e.prev_starts_at && e.changed_at && now - ms(e.changed_at) < 5 * 86400e3) {
    const was = (bkkDate(e.prev_starts_at) !== bkkDate(e.starts_at) ? dayShort(e.prev_starts_at) + " " : "") + bkkTime(e.prev_starts_at);
    out.push(["moved", t("moved", was)]);
  }
  return out;
}

/* ============================================================
   Rendering
   ============================================================ */
function visible(now) {
  return S.events.filter(e => ms(e.ends_at) > now)
    .filter(e => S.style === "All" || e.style === S.style)
    .sort((a, b) => ms(a.starts_at) - ms(b.starts_at));
}

function renderStatic() {
  document.documentElement.lang = S.lang;
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  $("langBtn").textContent = t("lang");
  $("demoBanner").hidden = !DEMO; $("demoBanner").textContent = t("demo");
  $("locateBtn").textContent = S.here ? "✓ " + t("nearMe") : t("nearMe");
  $("near").innerHTML = `<option value="">${esc(t("anywhere"))}</option>` + STATIONS.map(s => `<option ${s[0] === S.near && !S.here ? "selected" : ""}>${esc(s[0])}</option>`).join("");
  $("lineBtn").hidden = !CFG.LINE_PROVIDER;
  $("googleBtn").hidden = CFG.GOOGLE_ENABLED === false;
}

function renderAccount() {
  const signedIn = !!uid();
  $("signInBtn").hidden = signedIn;
  $("meBox").hidden = !signedIn;
  if (signedIn) {
    const md = S.session.user.user_metadata || {};
    $("meName").textContent = S.profile?.display_name || md.full_name || md.name || "Dancer";
    const av = S.profile?.avatar_url || md.avatar_url || md.picture;
    $("meAvatar").hidden = !av; if (av) $("meAvatar").src = av;
    $("meRole").hidden = !isOrganiser();
  }
  $("addBtn").hidden = !isOrganiser();
}

function renderClock() { $("clock").textContent = bkkTime(Date.now()); }

function renderStyles() {
  const used = new Set(S.events.map(e => e.style));
  const list = ["All", ...STYLES.filter(s => used.has(s))];
  if (!list.includes(S.style)) S.style = "All";
  $("styles").innerHTML = list.map(s => `<button class="chip" data-style="${esc(s)}" aria-pressed="${s === S.style}">${s === "All" ? "" : `<span class="dot" style="--c:${col(s)}"></span>`}${esc(s === "All" ? t("allStyles") : s)}</button>`).join("");
}

function renderNow(now) {
  const hot = S.events.filter(e => e.status !== "cancelled" && ms(e.ends_at) > now && ms(e.starts_at) - now < 4 * 3600e3)
    .sort((a, b) => ms(a.starts_at) - ms(b.starts_at));
  $("now").innerHTML = hot.map(e => {
    const live = now >= ms(e.starts_at);
    return `<button class="now-card" data-id="${esc(e.id)}"><span class="k" style="color:${live ? "var(--live)" : "var(--accent)"}">${esc(live ? t("onFloor") : t("startsIn", dur(ms(e.starts_at) - now)))}</span><span class="t">${esc(e.title)}</span><span class="s">${esc(e.venue)} · ${bkkTime(e.starts_at)}–${bkkTime(e.ends_at)}</span></button>`;
  }).join("");
}

function rsvpButton(e) {
  if (e.status === "cancelled") return "";
  if (e.tickets_enabled && e.ticket_price_thb != null) return `<button class="rsvp" data-ticket="${esc(e.id)}">${esc(t("tickets", e.ticket_price_thb))}</button>`;
  const on = S.mine.has(e.id);
  return `<button class="rsvp" data-rsvp="${esc(e.id)}" aria-pressed="${on}">${esc(on ? t("goingYes") : t("goingBtn"))}</button>`;
}

function renderList(now) {
  if (!S.loaded) return;
  const evs = visible(now);
  if (!evs.length) { $("list").innerHTML = `<p class="empty">${esc(S.events.length ? t("noStyle") : t("noEvents"))}</p>`; return; }
  const today = bkkDate(now), byDay = new Map();
  for (const e of evs) { const d = bkkDate(e.starts_at); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(e); }
  let html = "";
  for (const [d, items] of byDay) {
    html += `<section class="day"><div class="day-h"><h2>${esc(weekday(items[0].starts_at))}</h2><span>${esc(dayShort(items[0].starts_at))}</span>${d === today ? `<span class="today">${esc(t("tonight"))}</span>` : ""}</div>`;
    for (const e of items) {
      const pills = status(e, now).map(([k, x]) => `<span class="pill ${k}">${esc(x)}</span>`).join("");
      const dist = distText(e);
      html += `<article class="ev ${e.status === "cancelled" ? "cancelled" : ""} ${S.selected === e.id ? "sel" : ""}" data-id="${esc(e.id)}" tabindex="0">
        <div class="time"><b>${bkkTime(e.starts_at)}</b><span>${esc(t("to"))} ${bkkTime(e.ends_at)}</span></div>
        <div class="meta">
          <span class="style-tag" style="--c:${col(e.style)}"><span class="dot"></span>${esc(e.style)}</span>
          <span class="title">${esc(e.title)}</span>
          ${e.host ? `<span class="host">${esc(t("by"))} ${esc(e.host)}</span>` : ""}
          <span class="sub"><span>${esc(e.venue)}${e.area ? ", " + esc(e.area) : ""}</span>${dist ? `<span>${esc(dist)}</span>` : ""}${e.lesson ? `<span>${esc(t("classAt"))} ${esc(e.lesson)}</span>` : ""}${e.price_text ? `<span>${esc(e.price_text)}</span>` : ""}</span>
          ${pills ? `<div class="pills">${pills}</div>` : ""}
        </div>
        <div class="right">${rsvpButton(e)}<span class="going">${esc(t("going", e.going_count || 0))}</span></div>
      </article>`;
    }
    html += `</section>`;
  }
  $("list").innerHTML = html;
}

/* ---------- map (Leaflet + OpenStreetMap) ---------- */
let map, markerLayer, hereLayer;
function initMap() {
  if (!window.L) { $("map").textContent = "Map unavailable"; return; }
  map = L.map("map", { zoomControl: true, attributionControl: true }).setView([13.742, 100.548], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  hereLayer = L.layerGroup().addTo(map);
}
let fitted = false;
function renderMap(now) {
  if (!map) return;
  markerLayer.clearLayers(); hereLayer.clearLayers();
  const css = getComputedStyle(document.documentElement);
  const pts = [];
  for (const e of visible(now)) {
    if (e.lat == null || e.lng == null) continue;
    const sel = S.selected === e.id, live = e.status !== "cancelled" && now >= ms(e.starts_at) && now < ms(e.ends_at);
    const color = e.status === "cancelled" ? css.getPropertyValue("--bad").trim() : css.getPropertyValue(STYLE_VAR[e.style] || "--other").trim();
    if (live) L.circleMarker([e.lat, e.lng], { radius: 16, stroke: false, fillColor: css.getPropertyValue("--live").trim(), fillOpacity: .25, interactive: false }).addTo(markerLayer);
    const m = L.circleMarker([e.lat, e.lng], { radius: sel ? 10 : 7, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 }).addTo(markerLayer);
    m.bindTooltip(`${esc(e.title)} · ${bkkTime(e.starts_at)}`, { direction: "top", offset: [0, -8], permanent: sel });
    m.on("click", () => select(e.id, false));
    pts.push([e.lat, e.lng]);
  }
  const o = origin();
  if (o) {
    L.circleMarker([o.lat, o.lng], { radius: 6, color: css.getPropertyValue("--ink").trim(), weight: 3, fillColor: css.getPropertyValue("--surface").trim(), fillOpacity: 1 })
      .bindTooltip(esc(o.label), { direction: "bottom", offset: [0, 8] }).addTo(hereLayer);
  }
  if (!fitted && pts.length) { map.fitBounds(pts, { padding: [24, 24], maxZoom: 14 }); fitted = true; }
}

/* ---------- detail panel ---------- */
function renderDetail(now) {
  const box = $("detail");
  if (S.mode === "edit" || S.mode === "new") { box.innerHTML = editorHtml(); return; }
  const e = S.events.find(x => x.id === S.selected);
  if (!e) { box.innerHTML = `<h3>${esc(t("details"))}</h3><p class="map-note">${esc(t("pickOne"))}</p>`; return; }
  const pills = status(e, now).map(([k, x]) => `<span class="pill ${k}">${esc(x)}</span>`).join("");
  const dist = distText(e);
  const mine = S.mine.has(e.id);
  let action = "";
  if (e.status !== "cancelled") {
    if (e.tickets_enabled && e.ticket_price_thb != null) action = `<button class="btn primary" data-ticket="${esc(e.id)}">${esc(t("tickets", e.ticket_price_thb))}</button>`;
    else action = `<button class="btn ${mine ? "" : "primary"}" data-rsvp="${esc(e.id)}">${esc(mine ? t("cancelRsvp") : t("goingBtn"))}</button>`;
  }
  let guests = "";
  if (isOrganiser()) {
    if (S.guestsFor !== e.id) loadGuests(e.id);
    guests = `<h3>${esc(t("guestList"))} (${S.guestsFor === e.id ? S.guests.length : "…"})</h3>` +
      (S.guestsFor === e.id ? (S.guests.length ? `<div class="guests">${S.guests.map(g => `
        <div class="guest">${g.avatar ? `<img alt="" src="${esc(g.avatar)}">` : `<img alt="">`}<span>${esc(g.name)}${g.payment_status === "paid" ? " · paid" : ""}</span>
          <label><input type="checkbox" data-checkin="${esc(g.id)}" ${g.checked_in ? "checked" : ""}> ${esc(t("checkedIn"))}</label></div>`).join("")}</div>` : `<p class="map-note">${esc(t("noGuests"))}</p>`) : "");
  }
  box.innerHTML = `<h3>${esc(t("details"))}</h3>
    <div class="dt">${esc(e.title)}</div>
    ${pills ? `<div class="pills">${pills}</div>` : ""}
    <dl class="kv">
      <dt>${esc(t("when"))}</dt><dd>${esc(dayShort(e.starts_at))}, ${bkkTime(e.starts_at)}–${bkkTime(e.ends_at)}</dd>
      ${e.lesson ? `<dt>${esc(t("klass"))}</dt><dd>${esc(e.lesson)}</dd>` : ""}
      <dt>${esc(t("venue"))}</dt><dd>${esc(e.venue)}${e.area ? ", " + esc(e.area) : ""}${dist ? " · " + esc(dist) : ""}</dd>
      ${e.price_text ? `<dt>${esc(t("entry"))}</dt><dd>${esc(e.price_text)}</dd>` : ""}
      ${e.host ? `<dt>${esc(t("host"))}</dt><dd>${safeUrl(e.host_link) ? `<a href="${esc(safeUrl(e.host_link))}" target="_blank" rel="noopener">${esc(e.host)} ↗</a>` : esc(e.host)}</dd>` : ""}
      ${e.note ? `<dt>${esc(t("note"))}</dt><dd>${esc(e.note)}</dd>` : ""}
      <dt>${esc(t("goingLabel"))}</dt><dd>${esc(t("dancers", e.going_count || 0))}</dd>
    </dl>
    <div class="row">
      ${action}
      <a class="btn" href="${esc(mapsUrl(e))}" target="_blank" rel="noopener">${esc(t("directions"))}</a>
      <button class="btn ghost" id="shareBtn">${esc(t("share"))}</button>
      ${isOrganiser() ? `<button class="btn ghost" id="editBtn">${esc(t("edit"))}</button>` : ""}
    </div>
    ${guests}`;
}

let draft = null;
function editorHtml() {
  const d = draft;
  const opt = (v, list) => list.map(o => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("");
  return `<h3>${esc(S.mode === "new" ? t("newEvent") : t("editEvent"))}</h3>
  <form class="edit" id="editForm">
    <label class="full" for="f-title">${esc(t("fTitle"))}<input id="f-title" required maxlength="80" value="${esc(d.title)}"></label>
    <label for="f-style">${esc(t("fStyle"))}<select id="f-style">${opt(d.style, STYLES)}</select></label>
    <label for="f-status">${esc(t("fStatus"))}<select id="f-status"><option value="on" ${d.status !== "cancelled" ? "selected" : ""}>${esc(t("fOn"))}</option><option value="cancelled" ${d.status === "cancelled" ? "selected" : ""}>${esc(t("fCancelled"))}</option></select></label>
    <label for="f-date">${esc(t("fDate"))}<input id="f-date" type="date" required value="${esc(d.date)}"></label>
    <label for="f-lesson">${esc(t("fLesson"))}<input id="f-lesson" placeholder="Beginner 19:15" value="${esc(d.lesson)}"></label>
    <label for="f-start">${esc(t("fStart"))}<input id="f-start" type="time" required value="${esc(d.start)}"></label>
    <label for="f-end">${esc(t("fEnd"))}<input id="f-end" type="time" required value="${esc(d.end)}"></label>
    <label for="f-venue">${esc(t("fVenue"))}<input id="f-venue" required value="${esc(d.venue)}"></label>
    <label for="f-area">${esc(t("fArea"))}<input id="f-area" placeholder="Thong Lo" value="${esc(d.area)}"></label>
    <label class="full" for="f-coords">${esc(t("fCoords"))} <span class="hint">${esc(t("fCoordsHint"))}</span><input id="f-coords" inputmode="decimal" placeholder="13.7262, 100.5801" value="${d.lat != null && d.lng != null ? esc(d.lat + ", " + d.lng) : ""}"></label>
    <label for="f-price">${esc(t("fPrice"))}<input id="f-price" placeholder="300 THB incl. drink" value="${esc(d.price_text)}"></label>
    <label for="f-host">${esc(t("fHost"))}<input id="f-host" required placeholder="Salsa BKK" value="${esc(d.host)}"></label>
    <label class="full" for="f-hostlink">${esc(t("fHostLink"))} <span class="hint">${esc(t("fHostLinkHint"))}</span><input id="f-hostlink" type="text" inputmode="url" autocapitalize="off" placeholder="https://line.me/ti/p/… or https://instagram.com/…" value="${esc(d.host_link)}"></label>
    <label class="full" for="f-note">${esc(t("fNote"))}<textarea id="f-note" rows="2" placeholder="${esc(t("fNotePh"))}">${esc(d.note)}</textarea></label>
    <div class="full row">
      <button class="btn primary" type="submit" id="saveBtn">${esc(S.mode === "new" ? t("post") : t("save"))}</button>
      <button class="btn" type="button" id="cancelEdit">${esc(t("cancel"))}</button>
      ${S.mode === "edit" && !S.confirmDel ? `<button class="btn ghost" type="button" id="delBtn">${esc(t("del"))}</button>` : ""}
    </div>
    ${S.confirmDel ? `<div class="full confirm row">${esc(t("confirmDel"))} <button class="btn" type="button" id="delYes">${esc(t("del"))}</button><button class="btn" type="button" id="delNo">${esc(t("keep"))}</button></div>` : ""}
  </form>`;
}

function render() {
  const now = Date.now();
  renderClock(); renderAccount(); renderStyles(); renderNow(now); renderList(now); renderMap(now);
  if (S.mode === "view") renderDetail(now);
}

let toastT;
function toast(msg) { const el = $("toast"); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), 3200); }

/* ============================================================
   Data
   ============================================================ */
async function loadEvents() {
  if (DEMO) { S.events = demoEvents(); S.loaded = true; return; }
  const since = new Date(Date.now() - 6 * 3600e3).toISOString();
  const { data, error } = await sb.from("events").select("*").gte("ends_at", since).order("starts_at").limit(500);
  if (!error) S.events = data;
  S.loaded = true;
}

async function loadMe() {
  S.profile = null; S.mine = new Set();
  if (!uid() || DEMO) return;
  const [{ data: p }, { data: r }] = await Promise.all([
    sb.from("profiles").select("*").eq("id", uid()).maybeSingle(),
    sb.from("rsvps").select("event_id").eq("user_id", uid())
  ]);
  S.profile = p || null;
  S.mine = new Set((r || []).map(x => x.event_id));
}

async function loadGuests(eventId) {
  S.guestsFor = eventId; S.guests = [];
  if (DEMO) { S.guests = [{ id: "g1", name: "Demo Dancer", checked_in: false, payment_status: "free" }].slice(0, S.mine.has(eventId) ? 1 : 0); renderDetail(Date.now()); return; }
  const { data } = await sb.from("rsvps").select("id, checked_in, payment_status, profiles(display_name, avatar_url)").eq("event_id", eventId).order("created_at");
  if (S.guestsFor !== eventId) return;
  S.guests = (data || []).map(g => ({ id: g.id, checked_in: g.checked_in, payment_status: g.payment_status, name: g.profiles?.display_name || "Dancer", avatar: g.profiles?.avatar_url }));
  if (S.mode === "view" && S.selected === eventId) renderDetail(Date.now());
}

function subscribeLive() {
  if (DEMO) return;
  sb.channel("events-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "events" }, ({ eventType, new: n, old: o }) => {
      if (eventType === "DELETE") {
        S.events = S.events.filter(e => e.id !== o.id);
        if (S.selected === o.id) S.selected = null;
      } else {
        const prev = S.events.find(e => e.id === n.id);
        S.events = prev ? S.events.map(e => (e.id === n.id ? n : e)) : [...S.events, n];
        if (prev && !S.busy) {
          if (prev.starts_at !== n.starts_at) toast(t("eventMoved", n.title, `${dayShort(n.starts_at)} ${bkkTime(n.starts_at)}`));
          else if (prev.status !== "cancelled" && n.status === "cancelled") toast(t("eventCancelled", n.title));
        }
      }
      if (S.mode === "view") render(); else { const now = Date.now(); renderStyles(); renderNow(now); renderList(now); renderMap(now); }
    })
    .subscribe();
}

/* ============================================================
   Actions
   ============================================================ */
function select(id, scroll = true) {
  S.selected = id; S.mode = "view"; S.confirmDel = false;
  try { history.replaceState(null, "", "#" + id); } catch (_) {}
  render();
  if (scroll && window.matchMedia("(max-width:860px)").matches) $("detail").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function toggleRsvp(id) {
  if (!uid()) { $("signInDialog").showModal(); return; }
  if (S.busy) return; S.busy = true;
  const going = S.mine.has(id);
  const ev = S.events.find(e => e.id === id);
  try {
    if (DEMO) {
      going ? S.mine.delete(id) : S.mine.add(id);
      if (ev) ev.going_count = (ev.going_count || 0) + (going ? -1 : 1);
    } else if (going) {
      const { error } = await sb.from("rsvps").delete().eq("event_id", id).eq("user_id", uid());
      if (error) throw error; S.mine.delete(id);
    } else {
      const { error } = await sb.from("rsvps").insert({ event_id: id });
      if (error && error.code !== "23505") throw error; S.mine.add(id);
    }
    toast(going ? t("rsvpOff") : t("rsvpOn"));
  } catch (_) { toast(t("errRsvp")); }
  S.busy = false; S.guestsFor = null; render();
}

function buyTicket() {
  // Payments come later: this will send the dancer to Stripe / Opn checkout
  // through a small server function (see SETUP.md, "Adding ticket sales").
  toast(t("ticketsSoon"));
}

function startEdit(isNew) {
  if (isNew) {
    draft = { title: "", style: "Salsa", status: "on", date: bkkDate(Date.now()), start: "20:00", end: "23:30", venue: "", area: "", lesson: "", price_text: "", host: S.profile?.display_name || "", host_link: "", note: "", lat: null, lng: null };
  } else {
    const e = S.events.find(x => x.id === S.selected); if (!e) return;
    draft = { ...e, date: bkkDate(e.starts_at), start: bkkTime(e.starts_at), end: bkkTime(e.ends_at) };
  }
  S.mode = isNew ? "new" : "edit"; S.confirmDel = false; renderDetail(Date.now());
  $("detail").scrollIntoView({ behavior: "smooth", block: "start" });
  $("f-title").focus({ preventScroll: true });
}

async function save(evt) {
  evt.preventDefault();
  if (S.busy) return;
  const v = id => $(id).value.trim();
  const nums = v("f-coords").split(/[,\s]+/).map(Number).filter(n => Number.isFinite(n) && n !== 0);
  const starts = toIso(v("f-date"), v("f-start"));
  let ends = toIso(v("f-date"), v("f-end"));
  if (ms(ends) <= ms(starts)) ends = new Date(ms(ends) + 86400e3).toISOString();   // runs past midnight
  const body = {
    title: v("f-title"), style: v("f-style"), status: v("f-status"), starts_at: starts, ends_at: ends,
    venue: v("f-venue"), area: v("f-area") || null, lesson: v("f-lesson") || null, price_text: v("f-price") || null,
    host: v("f-host") || null, host_link: safeUrl(v("f-hostlink")) || null, note: v("f-note") || null,
    lat: nums.length === 2 ? nums[0] : null, lng: nums.length === 2 ? nums[1] : null
  };
  S.busy = true; $("saveBtn").disabled = true;
  try {
    if (S.mode === "new") {
      if (DEMO) { const id = "demo-" + Math.random().toString(36).slice(2); S.events.push({ ...body, id, going_count: 0 }); S.selected = id; }
      else { const { data, error } = await sb.from("events").insert(body).select().single(); if (error) throw error; if (!S.events.some(e => e.id === data.id)) S.events.push(data); S.selected = data.id; }
      toast(t("posted"));
    } else {
      const old = S.events.find(x => x.id === S.selected);
      const moved = old && old.starts_at !== starts && ms(old.starts_at) !== ms(starts);
      if (DEMO) { Object.assign(old, body, moved ? { prev_starts_at: old.starts_at, changed_at: new Date().toISOString() } : {}); }
      else { const { data, error } = await sb.from("events").update(body).eq("id", S.selected).select().single(); if (error) throw error; S.events = S.events.map(e => (e.id === data.id ? data : e)); }
      toast(moved ? t("movedLive") : t("saved"));
    }
    S.mode = "view";
  } catch (err) {
    toast(err && (err.code === "42501" || /row-level security/i.test(err.message || "")) ? t("errPerm") : t("errSave"));
  }
  S.busy = false; render();
}

async function del() {
  if (S.busy) return; S.busy = true;
  try {
    if (DEMO) S.events = S.events.filter(e => e.id !== S.selected);
    else { const { error } = await sb.from("events").delete().eq("id", S.selected); if (error) throw error; S.events = S.events.filter(e => e.id !== S.selected); }
    toast(t("deleted")); S.selected = null; S.mode = "view";
  } catch (_) { toast(t("errSave")); }
  S.busy = false; render();
}

async function checkIn(rsvpId, on) {
  const g = S.guests.find(x => x.id === rsvpId); if (g) g.checked_in = on;
  if (DEMO) return;
  const { error } = await sb.from("rsvps").update({ checked_in: on }).eq("id", rsvpId);
  if (error) { toast(t("errSave")); if (g) g.checked_in = !on; renderDetail(Date.now()); }
}

async function share() {
  const e = S.events.find(x => x.id === S.selected); if (!e) return;
  const url = location.origin + location.pathname + "#" + e.id;
  const text = `${e.title} · ${dayShort(e.starts_at)} ${bkkTime(e.starts_at)} · ${e.venue}`;
  try { if (navigator.share) { await navigator.share({ title: e.title, text, url }); return; } } catch (_) { return; }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); toast(t("linkCopied")); } catch (_) { prompt("Copy link", url); }
}

async function signIn(provider) {
  if (DEMO) {
    S.session = { user: { id: "demo-user", user_metadata: { full_name: "Demo Organiser" } } };
    S.profile = { display_name: "Demo Organiser", role: "organiser" };
    $("signInDialog").close(); render(); return;
  }
  await sb.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + location.pathname + location.hash } });
}

function locate() {
  if (S.here) { S.here = null; render(); renderStatic(); return; }
  if (!navigator.geolocation) { toast(t("locationOff")); return; }
  $("locateBtn").textContent = t("locating");
  navigator.geolocation.getCurrentPosition(
    p => { S.here = { lat: p.coords.latitude, lng: p.coords.longitude }; renderStatic(); render(); if (map) map.setView([S.here.lat, S.here.lng], 13); },
    () => { toast(t("locationOff")); renderStatic(); },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
  );
}

/* ============================================================
   Wiring
   ============================================================ */
document.addEventListener("click", e => {
  const el = e.target;
  const r = el.closest("[data-rsvp]"); if (r) { e.stopPropagation(); toggleRsvp(r.dataset.rsvp); return; }
  const tk = el.closest("[data-ticket]"); if (tk) { e.stopPropagation(); buyTicket(tk.dataset.ticket); return; }
  const chip = el.closest("[data-style]"); if (chip) { S.style = chip.dataset.style; pref("style", S.style); fitted = false; render(); return; }
  if (el.closest("#addBtn")) return startEdit(true);
  if (el.closest("#editBtn")) return startEdit(false);
  if (el.closest("#shareBtn")) return share();
  if (el.closest("#cancelEdit")) { S.mode = "view"; render(); return; }
  if (el.closest("#delBtn")) { S.confirmDel = true; renderDetail(Date.now()); return; }
  if (el.closest("#delNo")) { S.confirmDel = false; renderDetail(Date.now()); return; }
  if (el.closest("#delYes")) return del();
  if (el.closest("#signInBtn")) return $("signInDialog").showModal();
  if (el.closest("#googleBtn")) return signIn("google");
  if (el.closest("#lineBtn")) return signIn(CFG.LINE_PROVIDER);
  if (el.closest("#signOutBtn")) { if (DEMO) { S.session = null; S.profile = null; render(); } else sb.auth.signOut(); return; }
  if (el.closest("#langBtn")) { S.lang = S.lang === "en" ? "th" : "en"; pref("lang", S.lang); renderStatic(); render(); return; }
  if (el.closest("#locateBtn")) return locate();
  const item = el.closest("[data-id]"); if (item && !el.closest("a,input,label")) select(item.dataset.id);
});
document.addEventListener("change", e => {
  if (e.target.id === "near") { S.near = e.target.value; S.here = null; pref("near", S.near); renderStatic(); render(); }
  if (e.target.dataset.checkin) checkIn(e.target.dataset.checkin, e.target.checked);
});
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches?.(".ev")) { e.preventDefault(); select(e.target.dataset.id); }
});
document.addEventListener("submit", e => { if (e.target.id === "editForm") save(e); });
window.addEventListener("hashchange", () => { const id = location.hash.slice(1); if (id && S.events.some(x => x.id === id)) select(id); });

/* ============================================================
   Start
   ============================================================ */
async function boot() {
  if (CFG.SITE_NAME) document.title = CFG.SITE_NAME;
  renderStatic(); initMap(); render();
  if (!DEMO) {
    const { data } = await sb.auth.getSession();
    S.session = data.session;
    sb.auth.onAuthStateChange(async (_evt, session) => {
      const changed = (session?.user?.id || null) !== uid();
      S.session = session;
      if (changed) { await loadMe(); S.guestsFor = null; render(); }
    });
  }
  await Promise.all([loadEvents(), loadMe()]);
  const hash = location.hash.slice(1);
  if (hash && S.events.some(e => e.id === hash)) S.selected = hash;
  else { const up = S.events.filter(e => ms(e.ends_at) > Date.now()).sort((a, b) => ms(a.starts_at) - ms(b.starts_at))[0]; if (up) S.selected = up.id; }
  render();
  subscribeLive();
  // Refresh countdowns and "live now" every 30 s; reload fully when the phone wakes up.
  setInterval(() => { if (S.mode === "view") render(); else { const n = Date.now(); renderClock(); renderNow(n); renderList(n); } }, 30000);
  document.addEventListener("visibilitychange", async () => { if (!document.hidden && !DEMO) { await loadEvents(); await loadMe(); if (S.mode === "view") render(); } });
}

/* ---------- demo data (only used when config.js is empty) ---------- */
function demoEvents() {
  const today = bkkDate(Date.now());
  const day = n => { const d = new Date(`${today}T12:00:00+07:00`); d.setUTCDate(d.getUTCDate() + n); return bkkDate(d); };
  const mk = (i, title, style, d, s, e, lesson, venue, area, lat, lng, price, extra = {}) => {
    const starts = toIso(day(d), s); let ends = toIso(day(d), e); if (ms(ends) <= ms(starts)) ends = new Date(ms(ends) + 86400e3).toISOString();
    return { id: "demo-" + i, title, style, status: "on", starts_at: starts, ends_at: ends, lesson, venue, area, lat, lng, price_text: price, host: ["Clave Crew","Sala Bachata","Hop Hall Swing","Tango Abrazo BKK","Ginga Kiz","Rooftop Latin","Slot WCS","Onda Zouk"][i], note: null, going_count: [12, 8, 15, 6, 9, 21, 7, 5][i] || 0, is_sample: true, tickets_enabled: false, ...extra };
  };
  return [
    mk(0, "Salsa Social", "Salsa", 0, "20:00", "00:30", "Beginner 19:15", "Casa Clave", "Thong Lo", 13.7262, 100.5801, "300 THB incl. drink"),
    mk(1, "Bachata Night", "Bachata", 1, "20:30", "00:00", "Sensual basics 19:45", "Studio Sala", "Silom", 13.7290, 100.5320, "250 THB"),
    mk(2, "Ari Swing Night", "Swing", 2, "20:00", "23:00", "Lindy Hop taster 19:00", "Hop Hall", "Ari", 13.7790, 100.5430, "200 THB"),
    mk(3, "Milonga", "Tango", 3, "20:00", "00:00", null, "Salón Abrazo", "Phrom Phong", 13.7310, 100.5690, "350 THB"),
    mk(4, "Kizomba & Urban Kiz", "Kizomba", 4, "21:00", "01:00", "Improvers 20:00", "The Ginga Room", "Ekkamai", 13.7200, 100.5870, "300 THB"),
    mk(5, "Latin Night", "Salsa", 4, "21:30", "02:00", null, "Rooftop 11", "Sukhumvit 11", 13.7440, 100.5550, "400 THB incl. drink",
      { note: "Salsa and bachata, 2:1", prev_starts_at: toIso(day(5), "21:00"), changed_at: new Date().toISOString() }),
    mk(6, "West Coast Social", "West Coast Swing", 5, "19:00", "22:30", "Open level 18:00", "Slot Studio", "Sathorn", 13.7230, 100.5290, "250 THB"),
    mk(7, "Zouk Afternoon", "Zouk", 6, "15:00", "19:00", null, "Onda Studio", "Ratchathewi", 13.7520, 100.5330, "250 THB", { tickets_enabled: true, ticket_price_thb: 250 })
  ];
}

boot();
