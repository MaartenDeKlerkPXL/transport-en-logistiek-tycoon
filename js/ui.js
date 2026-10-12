// Vrachtbaas — alles wat je ziet: kaart (SVG), paneel, meldingen en invoer.
// Huisregel: geen pop-ups. Keuzes klappen open in hun kaart, bevestigen gebeurt met een tweestapsknop.
import { CITIES, ROADS, TRUCK_TYPES, CARGO, UPGRADES, COAST, LAKES, BORDERS, COUNTRY_LABELS } from './data.js';
import { clamp, esc, fmtMoney, fmtKm, fmtDur, fmtClock, fmtWeight } from './util.js';
import * as L from './logic.js';
import { S, hooks, cityName, route, ADJ, START_MONEY, MAX_OFFLINE_MS } from './logic.js';

const $ = (sel, el = document) => el.querySelector(sel);
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// UI-toestand (wordt niet opgeslagen)
const ui = {
  dirty: true,
  tab: 'vracht',
  open: null,            // { kind: 'contract' | 'truck', id } — opengeklapte kaart
  filter: 'all',         // vrachtbeurs: 'all' of 'fits'
  city: null,            // opengeklapte stad in Netwerk
  confirm: null,         // { key, until } — tweestapsknop die 'gewapend' is
  banner: null,          // samenvatting na terugkeer
  buyCity: null,
  pointerDown: false,
  focusAfter: null,      // selector die na het tekenen focus krijgt
  scrollTo: null,        // selector die na het tekenen in beeld moet
  animate: false,        // uitklappaneel net geopend: één keer animeren
};

// Kaartprojectie (equirectangulair, gecorrigeerd voor breedtegraad)
const BOUNDS = { lonMin: 1.9, lonMax: 7.5, latMin: 48.6, latMax: 52.75 };
const KX = Math.cos(50.7 * Math.PI / 180);
const SCALE = 170;
const MAP_W = (BOUNDS.lonMax - BOUNDS.lonMin) * KX * SCALE;
const MAP_H = (BOUNDS.latMax - BOUNDS.latMin) * SCALE;
const proj = (lat, lon) => [(lon - BOUNDS.lonMin) * KX * SCALE, (BOUNDS.latMax - lat) * SCALE];
const cityXY = id => proj(CITIES[id].lat, CITIES[id].lon);

const TRUCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#ico-truck"/></svg>';

// ---------- kleine bouwstenen ----------------------------------------------
const dataAttrs = o => Object.entries(o).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');

function button(label, data, { cls = '', disabled = false, aria, expanded, title } = {}) {
  return `<button type="button" class="btn ${cls}"${dataAttrs(data)}${disabled ? ' disabled' : ''}`
    + `${aria ? ` aria-label="${esc(aria)}"` : ''}${expanded !== undefined ? ` aria-expanded="${expanded}"` : ''}`
    + `${title ? ` title="${esc(title)}"` : ''}>${label}</button>`;
}

// Tweestapsknop: eerst 'Verkopen', daarna 5 seconden lang 'Ja, verkopen' + 'Nee'.
function confirmButton(key, label, confirmLabel, data) {
  if (ui.confirm && ui.confirm.key === key && performance.now() < ui.confirm.until) {
    return button(confirmLabel, { ...data, 'confirm-of': key }, { cls: 'danger small' })
      + button('Nee', { action: 'disarm' }, { cls: 'quiet small' });
  }
  return button(label, { action: 'arm', key }, { cls: 'quiet small' });
}

const shortBy = amount => `Nog ${fmtMoney(amount - S.money)} tekort`;
const fitsType = (T, c) => T.cargo.includes(c.cargo) && T.capacity >= c.weight;
const isOpen = (kind, id) => ui.open && ui.open.kind === kind && ui.open.id === id;

// ---------- kaart -----------------------------------------------------------
const SVGNS = 'http://www.w3.org/2000/svg';
const truckEls = new Map();

function renderMap() {
  const svg = $('#map');
  svg.setAttribute('viewBox', `0 0 ${MAP_W.toFixed(0)} ${MAP_H.toFixed(0)}`);
  const pts = arr => arr.map(([la, lo]) => proj(la, lo).map(v => v.toFixed(1)).join(',')).join(' ');
  let h = `<defs><symbol id="ico-truck" viewBox="0 0 24 24"><path d="M1.5 5.5h12v10h-12z"/><path d="M14.5 8.5h4.2l3.8 4.3v2.7h-8z"/><circle cx="6" cy="17.5" r="2.2"/><circle cx="17.5" cy="17.5" r="2.2"/></symbol></defs>`;
  // land en zee lopen ruim buiten de kaartgrenzen door: brede schermen tonen meer dan de viewBox
  h += `<rect class="land" x="${-MAP_W}" y="${-MAP_H}" width="${MAP_W * 3}" height="${MAP_H * 3}"/>`;
  h += `<polygon class="sea" points="${pts(COAST)}"/>`;
  for (const l of LAKES) h += `<polygon class="sea" points="${pts(l)}"/>`;
  for (const b of BORDERS) h += `<polyline class="border" points="${pts(b)}"/>`;
  for (const c of COUNTRY_LABELS) {
    const [x, y] = proj(c.lat, c.lon);
    h += `<text class="country${c.sea ? ' sea-label' : ''}" x="${x}" y="${y}" aria-hidden="true">${c.text}</text>`;
  }
  const lines = cls => ROADS.map(([a, b]) => {
    const [x1, y1] = cityXY(a), [x2, y2] = cityXY(b);
    return `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join('');
  h += `<g aria-hidden="true">${lines('road-casing')}${lines('road')}`;
  for (const [a, b, road] of ROADS) {
    const [x1, y1] = cityXY(a), [x2, y2] = cityXY(b);
    const w = road.length * 5.4 + 7;
    h += `<g class="shield ${road[0] === 'E' ? 'e' : 'a'}" transform="translate(${((x1 + x2) / 2).toFixed(1)},${((y1 + y2) / 2).toFixed(1)})"><rect x="${-w / 2}" y="-6.5" width="${w}" height="13" rx="3"/><text y="3">${road}</text></g>`;
  }
  h += '</g><g id="route-hl" aria-hidden="true"></g><g id="cities"></g><g id="trucks"></g><g id="fx" aria-hidden="true"></g>';
  svg.innerHTML = h;
}

function renderCities() {
  const net = L.networkCities();
  let h = '';
  for (const id in CITIES) {
    const c = CITIES[id];
    const [x, y] = cityXY(id);
    const depot = S.depots.includes(id);
    const cls = depot ? 'depot' : net.has(id) ? 'net' : 'off';
    const label = `${c.name}: ${depot ? 'depot' : net.has(id) ? 'in je netwerk' : 'buiten je netwerk'}. Toon details`;
    const off = { r: [10, 4, 'start'], l: [-10, 4, 'end'], t: [0, -11, 'middle'], b: [0, 18, 'middle'] }[c.lp || 'r'];
    h += `<g class="city ${cls}${ui.tab === 'netwerk' && ui.city === id ? ' sel' : ''}" data-action="city" data-id="${id}" role="button" tabindex="0" aria-label="${esc(label)}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})">`;
    h += '<circle class="halo" r="12"/>';
    h += depot ? '<rect class="depot" x="-7" y="-7" width="14" height="14" rx="3"/>' : '<circle r="5"/>';
    if (c.port) h += `<text class="port" x="${c.lp === 't' ? 12 : 0}" y="${c.lp === 't' ? 4 : -10}" text-anchor="middle" aria-hidden="true">⚓</text>`;
    h += `<text class="name" x="${off[0]}" y="${off[1]}" text-anchor="${off[2]}" aria-hidden="true">${c.name}</text></g>`;
  }
  $('#cities').innerHTML = h;
}

function truckXY(t, slot) {
  if (t.route && t.route.segs.length) {
    const seg = L.currentSeg(t);
    const f = seg.km ? clamp((t.route.progress - seg.from) / seg.km, 0, 1) : 1;
    const [ax, ay] = cityXY(seg.a), [bx, by] = cityXY(seg.b);
    return [ax + (bx - ax) * f, ay + (by - ay) * f];
  }
  // stilstaande trucks in een kringetje rond de stad
  const [x, y] = cityXY(t.city);
  const ang = slot * 0.9 + Math.PI, rad = 17 + Math.floor(slot / 7) * 10;
  return [x + Math.sin(ang) * rad, y - Math.cos(ang) * rad];
}

function drawTrucks() {
  const g = $('#trucks');
  const seen = new Set();
  const slots = {};
  for (const t of S.trucks) {
    seen.add(t.id);
    let el = truckEls.get(t.id);
    if (!el) {
      el = document.createElementNS(SVGNS, 'g');
      el.setAttribute('class', 'truck');
      el.dataset.action = 'truck';
      el.dataset.id = t.id;
      el.style.cursor = 'pointer';
      el.innerHTML = `<circle r="8.5" fill="${TRUCK_TYPES[t.type].color}"/><use href="#ico-truck" x="-5.5" y="-5.5" width="11" height="11"/><title></title>`;
      g.appendChild(el);
      truckEls.set(t.id, el);
    }
    let slot = 0;
    if (!t.route) { slot = slots[t.city] || 0; slots[t.city] = slot + 1; }
    const [x, y] = truckXY(t, slot);
    el.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
    el.classList.toggle('alert', t.state === 'broken' || t.state === 'resting');
    el.classList.toggle('idle', t.state === 'idle');
    el.lastChild.textContent = `${t.plate}: ${statusText(t)}`;
  }
  for (const [id, el] of truckEls) if (!seen.has(id)) { el.remove(); truckEls.delete(id); }
}

function highlightRoute(from, to, via) {
  let h = '';
  const draw = (a, b, cls) => {
    const r = route(a, b);
    if (r.segs.length) h += `<polyline class="${cls}" points="${r.path.map(id => cityXY(id).map(v => v.toFixed(1)).join(',')).join(' ')}"/>`;
  };
  if (via && via !== from) draw(via, from, 'hl-empty');
  if (from !== to) draw(from, to, 'hl-loaded');
  $('#route-hl').innerHTML = h;
}
const clearRoute = () => { $('#route-hl').innerHTML = ''; };

function floatText(city, text, cls) {
  const [x, y] = cityXY(city);
  const t = document.createElementNS(SVGNS, 'text');
  t.setAttribute('class', 'float ' + cls);
  t.setAttribute('x', x); t.setAttribute('y', y - 14);
  t.textContent = text;
  $('#fx').appendChild(t);
  setTimeout(() => t.remove(), 1800);
}

// ---------- topbalk, gebeurtenissen, meldingen ------------------------------
function toast(text, kind = '') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text;
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.classList.add('out'), 3600);
  setTimeout(() => el.remove(), 4000);
}

function updateTopbar() {
  const money = $('#st-money');
  money.textContent = fmtMoney(S.money);
  money.classList.toggle('neg', S.money < 0);
  const p = L.profitPerDay();
  const pe = $('#st-profit');
  pe.textContent = p === null ? '—' : (p >= 0 ? '+' : '') + fmtMoney(p);
  pe.className = p === null ? '' : p >= 0 ? 'pos' : 'neg';
  pe.title = p === null ? 'Zichtbaar na je eerste speldag' : 'Omzet min kosten over de laatste 24 speluren';
  $('#st-level').textContent = S.level;
  const pct = S.xp / L.xpNeeded(S.level) * 100;
  $('#st-xp').style.width = pct.toFixed(1) + '%';
  $('#st-xpbar').setAttribute('aria-valuenow', Math.round(pct));
  $('#st-clock').textContent = fmtClock(S.time);
  $('#st-diesel').textContent = '€ ' + S.diesel.toFixed(2).replace('.', ',') + '/L';
  document.querySelectorAll('#speed button').forEach(b => {
    const on = Number(b.dataset.speed) === S.speed;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
  });
}

function renderEvents() {
  $('#events').innerHTML = S.events.map(e =>
    `<div class="chip" title="${esc(e.desc)}"><span aria-hidden="true">${e.icon}</span> ${esc(e.title)} <span class="muted">nog ${fmtDur(e.endsAt - S.time)}</span></div>`).join('');
}

// ---------- tekst & berekeningen voor de weergave ---------------------------
function statusText(t) {
  const j = t.job;
  switch (t.state) {
    case 'idle': return `Klaar voor vertrek in ${cityName(t.city)}`;
    case 'toPickup': return `Rijdt leeg naar ${cityName(j.from)} om te laden`;
    case 'reposition': return `Rijdt leeg naar ${cityName(t.route.path.at(-1))}`;
    case 'loading': return `Laadt ${CARGO[j.cargo].name.toLowerCase()} in ${cityName(t.city)}`;
    case 'delivering': return `Brengt ${fmtWeight(j.weight)} ${CARGO[j.cargo].name.toLowerCase()} naar ${cityName(j.to)}`;
    case 'unloading': return `Lost in ${cityName(t.city)}`;
    case 'resting': return 'Verplichte rust na 9 uur rijden (tachograaf)';
    case 'broken': return 'Pech onderweg, wacht op de takeldienst';
  }
  return '';
}

function truckProgress(t) {
  if (t.route && t.route.total) return t.route.progress / t.route.total;
  if ((t.state === 'loading' || t.state === 'unloading') && t.job) return 1 - t.timer / CARGO[t.job.cargo].loadH;
  if (t.state === 'resting') return 1 - t.driveHours / L.driveLimit();
  if (t.state === 'broken') return 1 - t.timer / 3;
  return 0;
}

const byBest = (a, b) => (b.e.onTime - a.e.onTime) || (b.e.perHour - a.e.perHour);

// Waarom kan deze opdracht (nog) niet? null = er is een vrije truck.
function contractBlocker(c) {
  const C = CARGO[c.cargo];
  if (C.level > S.level) return { text: `Vanaf niveau ${C.level}` };
  const owned = S.trucks.filter(t => fitsType(TRUCK_TYPES[t.type], c));
  if (!owned.length) {
    const types = Object.values(TRUCK_TYPES).filter(T => fitsType(T, c)).map(T => T.name.toLowerCase());
    return { text: `Vereist een ${types.join(' of ')}`, shop: true };
  }
  if (!owned.some(t => t.state === 'idle')) return { text: 'Je geschikte trucks zijn onderweg' };
  return null;
}

// ---------- doelbalk & tabs -------------------------------------------------
function renderGoal() {
  const g = L.currentGoal();
  const box = $('#goal');
  if (!g) { box.innerHTML = '<span class="goal-flag" aria-hidden="true">🏆</span><div class="goal-text"><b>Alle doelen behaald</b><span class="sm">Jij bent de echte Vrachtbaas.</span></div>'; return; }
  let prog = '';
  if (g.progress) {
    const [cur, max] = g.progress(S);
    prog = `<span class="bar" role="progressbar" aria-label="Voortgang doel" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${Math.min(cur, max)}"><i style="width:${clamp(cur / max * 100, 0, 100)}%"></i></span><span class="sm muted num">${Math.min(cur, max)} van ${max}</span>`;
  }
  box.innerHTML = `<span class="goal-flag" aria-hidden="true">🎯</span><div class="goal-text"><span class="sm">Volgend doel</span><b>${esc(g.text)}</b></div><div class="goal-side"><span class="reward num">+${fmtMoney(g.reward)}</span>${prog}</div>`;
}

function renderTabs() {
  const idle = S.trucks.filter(t => t.state === 'idle').length;
  const counts = { vracht: S.contracts.length || '', vloot: idle || '' };
  document.querySelectorAll('#tabs button').forEach(b => {
    const on = b.dataset.tab === ui.tab;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    const badge = b.querySelector('.badge');
    if (badge) {
      badge.textContent = counts[b.dataset.tab] || '';
      badge.title = b.dataset.tab === 'vloot' ? 'Trucks die klaarstaan' : 'Opdrachten op de beurs';
    }
  });
}

const focusKey = el => {
  const d = el && el.dataset;
  return d && d.action ? [d.action, d.id, d.key, d.tab, d.truck, d.contract, d.filter].join('|') : null;
};

function renderPanel() {
  renderGoal();
  renderTabs();
  const body = $('#tab-body');
  const active = document.activeElement;
  const key = body.contains(active) ? focusKey(active) : null;
  const scroll = body.scrollTop;
  body.innerHTML = { vracht: viewContracts, vloot: viewFleet, netwerk: viewNetwork, bedrijf: viewCompany, logboek: viewLog }[ui.tab]();
  body.scrollTop = scroll;

  // focus terugzetten, anders verspringt het toetsenbord elke seconde
  let target = ui.focusAfter ? $(ui.focusAfter, body) : null;
  if (!target && key) target = [...body.querySelectorAll('[data-action]')].find(el => focusKey(el) === key);
  if (target && (ui.focusAfter || key)) target.focus({ preventScroll: true });
  ui.focusAfter = null;
  ui.animate = false;
  if (ui.scrollTo) {
    const el = $(ui.scrollTo, body);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    ui.scrollTo = null;
  }
}

// ---------- tab: vracht -----------------------------------------------------
function onboarding() {
  return `<div class="notice"><div class="notice-body">
    <h3>Welkom, nieuwe vrachtbaas</h3>
    <p>Je erft een transportbedrijfje in Antwerpen: één bestelwagen en ${fmtMoney(START_MONEY)}. Zo begin je:</p>
    <ol>
      <li>Kies hieronder een opdracht en klik op <b>Plan rit</b>.</li>
      <li>Kies de truck met de meeste winst. Lege kilometers kosten diesel en loon zonder iets op te brengen.</li>
      <li>Lever op tijd, anders krijg je maar 60%. Na 9 uur rijden moet je chauffeur verplicht rusten.</li>
    </ol>
    ${button('Begrepen', { action: 'dismiss-intro' }, { cls: 'primary small' })}
  </div></div>`;
}

function welcomeBack() {
  const r = ui.banner;
  const mins = Math.round(Math.min(r.away, MAX_OFFLINE_MS) / 60000);
  const away = mins >= 60 ? `${Math.floor(mins / 60)}u${String(mins % 60).padStart(2, '0')}` : `${mins} min`;
  return `<div class="notice success"><div class="notice-body">
    <h3>Welkom terug</h3>
    <p>Je was ${away} weg. Ondertussen: <b class="num">${r.money >= 0 ? '+' : ''}${fmtMoney(r.money)}</b> en ${r.deliveries} leveringen${r.levels ? `, en je steeg ${r.levels} niveau${r.levels > 1 ? 's' : ''}` : ''}.</p>
    ${L.up('planner') ? '' : '<p class="sm muted">Met een Planningsafdeling blijven al je trucks rijden terwijl je weg bent.</p>'}
  </div>${button('Sluiten', { action: 'dismiss-banner' }, { cls: 'quiet small' })}</div>`;
}

function contractOptions(c) {
  const rows = S.trucks.filter(t => t.state === 'idle' && L.canCarry(t, c)).map(t => ({ t, e: L.estimate(t, c) })).sort(byBest);
  let h = `<div class="options${ui.animate ? ' anim' : ''}"><div class="options-head"><h3>Kies een truck</h3>${button('Sluiten', { action: 'toggle-contract', id: c.id }, { cls: 'quiet small' })}</div>`;
  if (!rows.length) return h + '<p class="sm muted">Geen geschikte truck meer vrij.</p></div>';
  rows.forEach(({ t, e }, i) => {
    h += `<div class="option${i === 0 ? ' best' : ''}" data-route="${c.from},${c.to}" data-via="${t.city}">
      <div class="option-main">
        <b>${t.plate}</b> ${i === 0 ? '<span class="pill blue">Beste keuze</span>' : ''}<br>
        ${TRUCK_TYPES[t.type].name} in ${cityName(t.city)}<br>
        <span class="muted">${e.empty ? `${fmtKm(e.empty)} leeg en ` : 'Staat al klaar, '}${fmtKm(e.loaded)} geladen, ${fmtDur(e.hours)}</span>
      </div>
      <div class="option-side">
        <div class="option-profit"><span class="${e.profit < 0 ? 'warn' : ''}">${fmtMoney(e.profit)}</span><small>${e.onTime ? 'winst, op tijd' : 'winst, te laat'}</small></div>
        ${button('Kies', { action: 'pick', truck: t.id, contract: c.id }, { cls: 'primary small', aria: `Kies ${t.plate} voor ${cityName(c.from)} naar ${cityName(c.to)}` })}
      </div>
    </div>`;
  });
  return h + '</div>';
}

function contractCard(c) {
  const C = CARGO[c.cargo];
  const left = c.deadline - S.time;
  const blocker = contractBlocker(c);
  const open = !blocker && isOpen('contract', c.id);
  let side;
  if (blocker) {
    side = `<span class="reason">${esc(blocker.text)}</span>`
      + (blocker.shop ? button('Naar de winkel', { action: 'goto-shop' }, { cls: 'quiet small' }) : '');
  } else {
    side = button('Plan rit', { action: 'toggle-contract', id: c.id }, { cls: 'secondary small', expanded: open, aria: `Plan rit ${cityName(c.from)} naar ${cityName(c.to)}` });
  }
  return `<article class="card${open ? ' open' : ''}${C.level > S.level ? ' locked' : ''}" data-route="${c.from},${c.to}">
    <div class="card-row">
      <div class="tile-icon" aria-hidden="true">${C.icon}</div>
      <div class="card-main">
        <h3 class="card-title">${cityName(c.from)} <span aria-hidden="true">→</span><span class="visually-hidden">naar</span> <span class="to">${cityName(c.to)}</span></h3>
        <p class="card-meta">${C.name}, ${fmtWeight(c.weight)}, ${fmtKm(c.km)}</p>
        <div class="facts">
          <span class="pill ${left < 6 ? 'warn' : ''}">Leveren binnen ${fmtDur(left)}</span>
          <span class="muted">Vervalt over ${fmtDur(c.expires - S.time)}</span>
        </div>
      </div>
      <div class="card-side"><span class="pay">${fmtMoney(L.payoutFor(c))}</span>${side}</div>
    </div>
    ${open ? contractOptions(c) : ''}
  </article>`;
}

function viewContracts() {
  let h = '';
  if (!S.introSeen) h += onboarding();
  if (ui.banner) h += welcomeBack();
  const all = [...S.contracts].sort((a, b) => b.payout - a.payout);
  const fits = all.filter(c => CARGO[c.cargo].level <= S.level && S.trucks.some(t => fitsType(TRUCK_TYPES[t.type], c)));
  const list = ui.filter === 'fits' ? fits : all;
  const seg = (val, label) => `<button type="button" data-action="filter" data-filter="${val}" aria-pressed="${ui.filter === val}">${label}</button>`;
  h += `<div class="section-head"><h2>Vrachtbeurs</h2><div class="segmented" role="group" aria-label="Filter">${seg('all', `Alles (${all.length})`)}${seg('fits', `Past in mijn vloot (${fits.length})`)}</div></div>`;
  if (L.up('planner') && S.plannerOn) h += '<p class="sm muted" style="margin:-8px 0 16px">Je planner wijst vracht automatisch toe aan trucks die klaarstaan.</p>';
  if (!all.length) return h + '<div class="empty"><b>Even geen vracht</b>Er komt elk speluur nieuw aanbod binnen. Meer depots betekent meer aanbod.</div>';
  if (!list.length) return h + `<div class="empty"><b>Niets dat je vloot nu kan rijden</b>Bekijk alle opdrachten om te zien welke truck je nodig hebt.<div class="actions" style="justify-content:center">${button('Toon alles', { action: 'filter', filter: 'all' }, { cls: 'secondary small' })}</div></div>`;
  return h + `<div class="list">${list.map(contractCard).join('')}</div>`;
}

// ---------- tab: vloot ------------------------------------------------------
function truckOptions(t) {
  const rows = S.contracts.filter(c => L.canCarry(t, c)).map(c => ({ c, e: L.estimate(t, c) })).sort(byBest);
  let h = `<div class="options${ui.animate ? ' anim' : ''}"><div class="options-head"><h3>Beste ritten vanaf ${cityName(t.city)}</h3>${button('Sluiten', { action: 'toggle-truck', id: t.id }, { cls: 'quiet small' })}</div>`;
  if (!rows.length) return h + '<p class="sm muted">Geen passende vracht op de beurs. Wacht op nieuw aanbod of open een depot voor meer vracht.</p></div>';
  rows.slice(0, 6).forEach(({ c, e }, i) => {
    h += `<div class="option${i === 0 ? ' best' : ''}" data-route="${c.from},${c.to}" data-via="${t.city}">
      <div class="option-main">
        <b>${cityName(c.from)} → ${cityName(c.to)}</b> ${i === 0 ? '<span class="pill blue">Beste keuze</span>' : ''}<br>
        ${CARGO[c.cargo].icon} ${CARGO[c.cargo].name}, ${fmtWeight(c.weight)}, vergoeding ${fmtMoney(L.payoutFor(c))}<br>
        <span class="muted">${e.empty ? `${fmtKm(e.empty)} leeg en ` : ''}${fmtKm(e.loaded)} geladen, ${fmtDur(e.hours)}</span>
      </div>
      <div class="option-side">
        <div class="option-profit"><span class="${e.profit < 0 ? 'warn' : ''}">${fmtMoney(e.profit)}</span><small>${e.onTime ? 'winst, op tijd' : 'winst, te laat'}</small></div>
        ${button('Kies', { action: 'pick', truck: t.id, contract: c.id }, { cls: 'primary small', aria: `Kies rit ${cityName(c.from)} naar ${cityName(c.to)}` })}
      </div>
    </div>`;
  });
  return h + '</div>';
}

function truckCard(t) {
  const T = TRUCK_TYPES[t.type];
  const open = t.state === 'idle' && isOpen('truck', t.id);
  const condColor = t.cond < 40 ? 'var(--danger)' : t.cond < 70 ? 'var(--signal-dark)' : 'var(--success)';
  let actions = '';
  if (t.state === 'idle') {
    actions += button(open ? 'Verberg ritten' : 'Zoek vracht', { action: 'toggle-truck', id: t.id }, { cls: 'secondary small', expanded: open });
    if (t.cond < 95) {
      const cost = L.repairCost(t);
      actions += button(`Onderhoud ${fmtMoney(cost)}`, { action: 'repair', id: t.id }, { cls: 'secondary small', disabled: S.money < cost });
      if (S.money < cost) actions += `<span class="reason">${shortBy(cost)}</span>`;
    }
    if (S.trucks.length > 1) actions += confirmButton(`sell-${t.id}`, 'Verkopen', `Ja, verkopen voor ${fmtMoney(L.sellValue(t))}`, { action: 'sell', id: t.id });
  } else if (t.state === 'toPickup') {
    actions += button('Rit annuleren', { action: 'cancel', id: t.id }, { cls: 'quiet small' });
  }
  const routeAttr = t.job
    ? ` data-route="${t.job.from},${t.job.to}" data-via="${t.state === 'toPickup' && t.route ? t.route.path[0] : ''}"`
    : t.route ? ` data-route="${t.route.path[0]},${t.route.path[0]}" data-via=""` : '';
  return `<article class="card state-${t.state}${open ? ' open' : ''}" id="truck-${t.id}"${routeAttr}>
    <div class="card-row">
      <div class="tile-icon truck-icon" style="--c:${T.color}">${TRUCK_SVG}</div>
      <div class="card-main">
        <h3 class="card-title">${t.plate}</h3>
        <p class="card-meta">${T.name}, chauffeur ${esc(t.driver)}</p>
        <p class="status"><span class="status-dot" aria-hidden="true"></span>${statusText(t)}</p>
        ${t.state === 'idle' ? '' : `<span class="bar" role="progressbar" aria-label="Voortgang" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(truckProgress(t) * 100)}"><i style="width:${(truckProgress(t) * 100).toFixed(1)}%"></i></span>`}
        <div class="facts">
          <span>Conditie ${Math.round(t.cond)}%<span class="cond-bar" aria-hidden="true"><i style="width:${t.cond}%;background:${condColor}"></i></span></span>
          ${t.cond < 40 ? '<span class="pill bad">Onderhoud nodig</span>' : ''}
          <span class="num">${fmtKm(t.km)}</span><span>${t.trips} ritten</span><span class="num">winst ${fmtMoney(t.earned)}</span>
        </div>
      </div>
    </div>
    ${actions ? `<div class="actions">${actions}</div>` : ''}
    ${open ? truckOptions(t) : ''}
  </article>`;
}

function shopCard(id, T) {
  let side;
  if (S.level < T.level) side = `<span class="reason">Vanaf niveau ${T.level}</span>`;
  else if (S.money < T.price) side = button('Kopen', { action: 'buy-truck', id }, { cls: 'secondary small', disabled: true }) + `<span class="reason">${shortBy(T.price)}</span>`;
  else side = button('Kopen', { action: 'buy-truck', id }, { cls: 'secondary small', aria: `${T.name} kopen voor ${fmtMoney(T.price)}` });
  return `<article class="card${S.level < T.level ? ' locked' : ''}">
    <div class="card-row">
      <div class="tile-icon truck-icon" style="--c:${T.color}">${TRUCK_SVG}</div>
      <div class="card-main">
        <h3 class="card-title">${T.name}</h3>
        <p class="card-meta">Rijdt ${T.cargo.map(k => CARGO[k].name.toLowerCase()).join(' en ')}</p>
        <div class="facts"><span>Tot ${T.capacity} t</span><span>${T.speed} km/u</span><span>${T.fuel} L per 100 km</span><span>Loon € ${T.wage}/u</span></div>
      </div>
      <div class="card-side"><span class="pay">${fmtMoney(T.price)}</span>${side}</div>
    </div>
  </article>`;
}

function viewFleet() {
  const moving = S.trucks.filter(t => t.state !== 'idle').length;
  const ready = S.trucks.length - moving;
  const service = S.trucks.filter(t => t.cond < 40).length;
  let h = `<div class="section-head"><h2>Vloot</h2><span class="sm muted">${S.trucks.length} voertuig${S.trucks.length === 1 ? '' : 'en'}</span></div>
    <div class="summary">
      <div class="tile"><span>Onderweg</span><b>${moving}</b></div>
      <div class="tile"><span>Klaar</span><b>${ready}</b></div>
      <div class="tile"><span>Onderhoud nodig</span><b class="${service ? 'warn' : ''}">${service}</b></div>
    </div>
    <div class="list">${S.trucks.map(truckCard).join('')}</div>`;

  if (!S.depots.includes(ui.buyCity)) ui.buyCity = S.depots[0];
  h += `<div class="section-head sub" id="shop"><h2>Voertuig kopen</h2>
    <label class="select-label">Leveren in <select data-role="buy-city">${S.depots.map(d => `<option value="${d}" ${d === ui.buyCity ? 'selected' : ''}>${cityName(d)}</option>`).join('')}</select></label></div>`;
  return h + `<div class="list">${Object.entries(TRUCK_TYPES).map(([id, T]) => shopCard(id, T)).join('')}</div>`;
}

// ---------- tab: netwerk ----------------------------------------------------
function viewNetwork() {
  const net = L.networkCities();
  const price = L.depotPrice();
  let h = `<div class="section-head"><h2>Netwerk</h2><span class="sm muted">${S.depots.length} depot${S.depots.length === 1 ? '' : 's'}</span></div>
    <p class="muted" style="margin-bottom:16px;max-width:60ch">Vracht vertrekt uit je depotsteden en hun buursteden. Een nieuw depot brengt meer aanbod op de vrachtbeurs, en je kunt er trucks laten leveren. Elk volgend depot kost het dubbele.</p>
    <div class="list">`;
  const rank = id => (S.depots.includes(id) ? 2 : net.has(id) ? 1 : 0);
  const ids = Object.keys(CITIES).sort((a, b) => rank(b) - rank(a) || cityName(a).localeCompare(cityName(b)));
  for (const id of ids) {
    const c = CITIES[id];
    const depot = S.depots.includes(id);
    const open = ui.city === id;
    const pill = depot ? '<span class="pill blue">Depot</span>' : net.has(id) ? '<span class="pill ok">In je netwerk</span>' : '<span class="pill">Buiten je netwerk</span>';
    let side = '';
    if (!depot) side = S.money >= price
      ? button(`Depot ${fmtMoney(price)}`, { action: 'build-depot', id }, { cls: 'secondary small', aria: `Depot openen in ${c.name} voor ${fmtMoney(price)}` })
      : button(`Depot ${fmtMoney(price)}`, { action: 'build-depot', id }, { cls: 'secondary small', disabled: true }) + `<span class="reason">${shortBy(price)}</span>`;
    let details = '';
    if (open) {
      const here = S.trucks.filter(t => !t.route && t.city === id).length;
      const out = S.contracts.filter(x => x.from === id).length;
      details = `<div class="options${ui.animate ? ' anim' : ''}">
        <p class="sm"><b>Wegen:</b> ${ADJ[id].map(e => `${e.road} naar ${cityName(e.to)}`).join(', ')}</p>
        <p class="sm"><b>Nu:</b> ${here} truck${here === 1 ? '' : 's'} ter plaatse, ${out} opdracht${out === 1 ? '' : 'en'} vanuit ${c.name}</p>
      </div>`;
    }
    h += `<article class="card${open ? ' open' : ''}" id="city-${id}" data-route="${id},${id}">
      <div class="card-row">
        <div class="card-main">
          <h3 class="card-title">${c.port ? '<span aria-hidden="true">⚓</span> ' : ''}${c.name} <span class="sm muted">${c.country}</span></h3>
          <div class="facts">${pill}<span>${Object.keys(c.cargo).map(k => `<span title="${CARGO[k].name}" aria-label="${CARGO[k].name}">${CARGO[k].icon}</span>`).join(' ')}</span></div>
        </div>
        <div class="card-side">${side}${button(open ? 'Minder' : 'Details', { action: 'city', id }, { cls: 'quiet small', expanded: open, aria: `Details ${c.name}` })}</div>
      </div>
      ${details}
    </article>`;
  }
  return h + '</div>';
}

// ---------- tab: bedrijf ----------------------------------------------------
function viewCompany() {
  let h = '<div class="section-head"><h2>Bedrijf</h2></div><div class="list">';
  for (const u of UPGRADES) {
    const owned = L.up(u.id);
    let side;
    if (owned && u.id === 'planner') side = `<button type="button" class="switch" data-action="toggle-planner" aria-pressed="${S.plannerOn}"><span class="track" aria-hidden="true"></span>${S.plannerOn ? 'Aan' : 'Uit'}</button>`;
    else if (owned) side = '<span class="pill ok">In bezit</span>';
    else if (S.level < u.level) side = `<span class="reason">Vanaf niveau ${u.level}</span>`;
    else if (S.money < u.price) side = button('Kopen', { action: 'buy-upgrade', id: u.id }, { cls: 'secondary small', disabled: true }) + `<span class="reason">${shortBy(u.price)}</span>`;
    else side = button('Kopen', { action: 'buy-upgrade', id: u.id }, { cls: 'secondary small', aria: `${u.name} kopen` });
    h += `<article class="card${!owned && S.level < u.level ? ' locked' : ''}">
      <div class="card-row">
        <div class="tile-icon" aria-hidden="true">${u.icon}</div>
        <div class="card-main"><h3 class="card-title">${u.name}</h3><p class="card-meta" style="max-width:48ch">${u.desc}</p></div>
        <div class="card-side">${owned ? '' : `<span class="pay">${fmtMoney(u.price)}</span>`}${side}</div>
      </div>
    </article>`;
  }
  return h + '</div>';
}

// ---------- tab: logboek ----------------------------------------------------
function viewLog() {
  const st = S.stats;
  const tile = (label, value) => `<div class="tile"><span>${label}</span><b>${value}</b></div>`;
  let h = '<div class="section-head"><h2>Logboek</h2></div><div class="tiles">';
  h += tile('Bedrijfswaarde', fmtMoney(L.companyValue()));
  h += tile('Leveringen', st.deliveries.toLocaleString('nl-BE'));
  h += tile('Op tijd', st.deliveries ? Math.round((1 - st.late / st.deliveries) * 100) + '%' : '—');
  h += tile('Gereden', fmtKm(st.km));
  h += tile('Omzet', fmtMoney(st.income));
  h += tile('Kosten', fmtMoney(st.costs));
  h += '</div><ul class="log">';
  for (const e of S.log) h += `<li><time>${fmtClock(e.t)}</time><span>${esc(e.text)}</span></li>`;
  h += `</ul><div class="footer-actions">${button('Uitleg opnieuw tonen', { action: 'help' }, { cls: 'quiet small' })}${confirmButton('reset', 'Opnieuw beginnen', 'Ja, alles wissen', { action: 'reset' })}</div>`;
  return h;
}

// ---------- invoer ----------------------------------------------------------
const findTruck = id => S.trucks.find(t => t.id === Number(id));
const findContract = id => S.contracts.find(c => c.id === Number(id));

function resetGame() {
  L.wipeSave();
  L.newGame();
  truckEls.forEach(el => el.remove());
  truckEls.clear();
  Object.assign(ui, { tab: 'vracht', open: null, city: null, banner: null, confirm: null });
  renderCities();
  renderEvents();
  clearRoute();
}

function switchTab(tab) {
  if (ui.tab !== tab) { ui.tab = tab; $('#tab-body').scrollTop = 0; }
  clearRoute();
  renderCities();
}

function onAction(el) {
  const { action, id } = el.dataset;
  switch (action) {
    case 'tab': switchTab(el.dataset.tab); break;
    case 'speed': S.speed = Number(el.dataset.speed); break;
    case 'filter': ui.filter = el.dataset.filter; ui.open = null; break;
    case 'toggle-contract': ui.open = isOpen('contract', Number(id)) ? null : { kind: 'contract', id: Number(id) }; ui.animate = !!ui.open; break;
    case 'toggle-truck': ui.open = isOpen('truck', Number(id)) ? null : { kind: 'truck', id: Number(id) }; ui.animate = !!ui.open; break;
    case 'pick': {
      const t = findTruck(el.dataset.truck), c = findContract(el.dataset.contract);
      if (t && c && L.assign(t, c)) toast(`${t.plate} vertrekt naar ${cityName(c.from)}`, 'good');
      else toast('Deze rit is niet meer beschikbaar.', 'bad');
      ui.open = null;
      clearRoute();
      break;
    }
    case 'cancel': { const t = findTruck(id); if (t && L.cancelJob(t)) toast(`Rit van ${t.plate} geannuleerd, de opdracht staat terug op de beurs`); break; }
    case 'repair': { const t = findTruck(id); if (t && L.repairTruck(t)) toast(`${t.plate} is weer als nieuw`, 'good'); break; }
    case 'arm': ui.confirm = { key: el.dataset.key, until: performance.now() + 5000 }; ui.focusAfter = `[data-confirm-of="${el.dataset.key}"]`; break;
    case 'disarm': ui.confirm = null; break;
    case 'sell': { const t = findTruck(id); ui.confirm = null; if (t) L.sellTruck(t); break; }
    case 'reset': ui.confirm = null; resetGame(); break;
    case 'buy-truck': L.buyTruck(id, S.depots.includes(ui.buyCity) ? ui.buyCity : S.depots[0]); break;
    case 'build-depot': L.buildDepot(id); break;
    case 'buy-upgrade': L.buyUpgrade(id); break;
    case 'toggle-planner': S.plannerOn = !S.plannerOn; break;
    case 'goto-shop': switchTab('vloot'); ui.scrollTo = '#shop'; break;
    case 'city': {
      const fromMap = !!el.closest('#map');
      ui.city = fromMap || ui.city !== id ? id : null;
      ui.animate = !!ui.city;
      if (fromMap) { switchTab('netwerk'); ui.scrollTo = `#city-${id}`; highlightRoute(id, id); }
      renderCities();
      break;
    }
    case 'truck': switchTab('vloot'); ui.scrollTo = `#truck-${id}`; break;
    case 'dismiss-intro': S.introSeen = true; break;
    case 'dismiss-banner': ui.banner = null; break;
    case 'help': S.introSeen = false; switchTab('vracht'); break;
  }
  ui.dirty = true;
  L.save();
}

function bindInput() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (el && !el.disabled) onAction(el);
  });
  // steden op de kaart zijn SVG-elementen: Enter/spatie laten werken zoals bij een knop
  document.addEventListener('keydown', e => {
    const el = e.target;
    if ((e.key === 'Enter' || e.key === ' ') && el.getAttribute && el.getAttribute('role') === 'button' && el.dataset.action) {
      e.preventDefault();
      onAction(el);
      return;
    }
    if (e.key === 'Escape') { ui.open = null; ui.confirm = null; ui.dirty = true; return; }
    if (['SELECT', 'INPUT', 'TEXTAREA'].includes(el.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    const speeds = { p: 0, 1: 1, 2: 2, 3: 4 };
    const k = e.key.toLowerCase();
    if (k in speeds) S.speed = speeds[k];
  });
  document.addEventListener('change', e => {
    if (e.target.dataset.role === 'buy-city') ui.buyCity = e.target.value;
  });
  // niet hertekenen terwijl je klikt, anders verdwijnt de knop onder je vinger
  document.addEventListener('pointerdown', () => { ui.pointerDown = true; });
  document.addEventListener('pointerup', () => setTimeout(() => { ui.pointerDown = false; }, 80));
  document.addEventListener('pointercancel', () => { ui.pointerDown = false; });

  // route tonen bij aanwijzen of toetsenbordfocus op een kaart
  const preview = e => {
    const card = e.target.closest && e.target.closest('[data-route]');
    if (!card) return;
    const [from, to] = card.dataset.route.split(',');
    highlightRoute(from, to, card.dataset.via);
  };
  const body = $('#tab-body');
  body.addEventListener('mouseover', preview);
  body.addEventListener('focusin', preview);
  body.addEventListener('mouseleave', () => { if (!ui.open) clearRoute(); });

  document.addEventListener('visibilitychange', () => { if (document.hidden) L.save(); });
  window.addEventListener('beforeunload', L.save);
}

// ---------- start & game loop -----------------------------------------------
let lastFrame = performance.now();
let lastPanel = 0;
let lastSlow = 0;
let lastSave = Date.now();

function frame(now) {
  const dtMs = now - lastFrame;
  lastFrame = now;
  if (dtMs > 1500) {
    // tabblad stond op de achtergrond: inhalen in grotere stappen
    if (S.speed > 0) {
      const r = L.simulate(dtMs);
      if (dtMs > 60000 && (r.deliveries || Math.abs(r.money) > 1)) ui.banner = { ...r, away: dtMs };
    }
  } else if (S.speed > 0) {
    let h = dtMs / L.GAME_HOUR_MS * S.speed;
    while (h > 0) { const step = Math.min(0.1, h); L.tick(step); h -= step; }
  }

  drawTrucks();
  updateTopbar();
  if (ui.confirm && now > ui.confirm.until) { ui.confirm = null; ui.dirty = true; }
  if (now - lastSlow > 1000) { lastSlow = now; L.checkGoals(); renderEvents(); }
  if (!ui.pointerDown && ((ui.dirty && now - lastPanel > 150) || now - lastPanel > 1000)) {
    renderPanel();
    lastPanel = now;
    ui.dirty = false;
  }
  if (Date.now() - lastSave > 10000) { L.save(); lastSave = Date.now(); }
  requestAnimationFrame(frame);
}

export function start() {
  hooks.changed = () => { ui.dirty = true; };
  hooks.toast = toast;
  hooks.float = floatText;
  hooks.events = renderEvents;
  hooks.cities = () => { renderCities(); ui.dirty = true; };

  renderMap();
  if (L.load()) {
    const away = Date.now() - S.savedAt;
    if (away > 10000 && S.speed > 0) {
      const r = L.simulate(away);
      if (r.deliveries || Math.abs(r.money) > 1) ui.banner = { ...r, away };
    }
  } else {
    L.newGame();
  }
  renderCities();
  renderEvents();
  bindInput();
  L.save();
  requestAnimationFrame(frame);
}
