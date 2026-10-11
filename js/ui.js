// Vrachtbaas — alles wat je ziet: kaart (SVG), panelen, modals en invoer.
import { CITIES, ROADS, TRUCK_TYPES, CARGO, UPGRADES, COAST, LAKES, BORDERS, COUNTRY_LABELS } from './data.js';
import { clamp, esc, fmtMoney, fmtKm, fmtDur, fmtClock, fmtWeight } from './util.js';
import * as L from './logic.js';
import { S, hooks, cityName, route, ADJ, START_MONEY, MAX_OFFLINE_MS } from './logic.js';

let dirty = true;
let activeTab = 'vracht';
let buyCity = null;
let pointerDown = false;
const $ = (sel, el = document) => el.querySelector(sel);

// Kaartprojectie (equirectangulair, gecorrigeerd voor breedtegraad)
const BOUNDS = { lonMin: 1.9, lonMax: 7.5, latMin: 48.6, latMax: 52.75 };
const KX = Math.cos(50.7 * Math.PI / 180);
const SCALE = 170;
const MAP_W = (BOUNDS.lonMax - BOUNDS.lonMin) * KX * SCALE;
const MAP_H = (BOUNDS.latMax - BOUNDS.latMin) * SCALE;
const proj = (lat, lon) => [(lon - BOUNDS.lonMin) * KX * SCALE, (BOUNDS.latMax - lat) * SCALE];
const cityXY = id => proj(CITIES[id].lat, CITIES[id].lon);

// ---------- kaart -----------------------------------------------------------
const SVGNS = 'http://www.w3.org/2000/svg';
const truckEls = new Map();

function renderMap() {
  const svg = $('#map');
  svg.setAttribute('viewBox', `0 0 ${MAP_W.toFixed(0)} ${MAP_H.toFixed(0)}`);
  const pts = arr => arr.map(([la, lo]) => proj(la, lo).map(v => v.toFixed(1)).join(',')).join(' ');
  let h = `<rect class="land" x="${-MAP_W}" y="${-MAP_H}" width="${MAP_W * 3}" height="${MAP_H * 3}"/>`;
  h += `<polygon class="sea" points="${pts(COAST)}"/>`;
  for (const l of LAKES) h += `<polygon class="sea" points="${pts(l)}"/>`;
  for (const b of BORDERS) h += `<polyline class="border" points="${pts(b)}"/>`;
  for (const c of COUNTRY_LABELS) {
    const [x, y] = proj(c.lat, c.lon);
    h += `<text class="country${c.sea ? ' sea-label' : ''}" x="${x}" y="${y}">${c.text}</text>`;
  }
  h += '<g id="roads">';
  for (const [a, b] of ROADS) {
    const [x1, y1] = cityXY(a), [x2, y2] = cityXY(b);
    h += `<line class="road" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }
  for (const [a, b, road] of ROADS) {
    const [x1, y1] = cityXY(a), [x2, y2] = cityXY(b);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, w = road.length * 5 + 6;
    h += `<g class="road-label" transform="translate(${mx.toFixed(1)},${my.toFixed(1)})"><rect x="${-w / 2}" y="-6" width="${w}" height="12" rx="3"/><text y="3">${road}</text></g>`;
  }
  h += '</g><g id="route-hl"></g><g id="cities"></g><g id="trucks"></g><g id="fx"></g>';
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
    const off = { r: [9, 4, 'start'], l: [-9, 4, 'end'], t: [0, -10, 'middle'], b: [0, 16, 'middle'] }[c.lp || 'r'];
    h += `<g class="city ${cls}" data-action="city" data-id="${id}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})">`;
    h += depot ? '<rect x="-7" y="-7" width="14" height="14" rx="3"/>' : '<circle r="5"/>';
    if (c.port) h += `<text class="port" x="${c.lp === 't' ? 10 : 0}" y="${c.lp === 't' ? 4 : -9}" text-anchor="middle">⚓</text>`;
    h += `<text class="name" x="${off[0]}" y="${off[1]}" text-anchor="${off[2]}">${c.name}</text></g>`;
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
  const ang = slot * 0.9 + Math.PI, rad = 15 + Math.floor(slot / 7) * 9;
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
      el.innerHTML = `<circle r="7" fill="${TRUCK_TYPES[t.type].color}"/><text y="3.5">${TRUCK_TYPES[t.type].icon}</text><title></title>`;
      g.appendChild(el);
      truckEls.set(t.id, el);
    }
    let slot = 0;
    if (!t.route) { slot = slots[t.city] || 0; slots[t.city] = slot + 1; }
    const [x, y] = truckXY(t, slot);
    el.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
    el.classList.toggle('alert', t.state === 'broken' || t.state === 'resting');
    el.classList.toggle('idle', t.state === 'idle');
    el.lastChild.textContent = `${t.plate} — ${statusText(t)}`;
  }
  for (const [id, el] of truckEls) if (!seen.has(id)) { el.remove(); truckEls.delete(id); }
}

function highlightRoute(from, to, via) {
  let h = '';
  const draw = (a, b, cls) => {
    const r = route(a, b);
    if (!r.segs.length) return;
    h += `<polyline class="${cls}" points="${r.path.map(id => cityXY(id).map(v => v.toFixed(1)).join(',')).join(' ')}"/>`;
  };
  if (via && via !== from) draw(via, from, 'hl-empty');
  draw(from, to, 'hl-loaded');
  const [x, y] = cityXY(from);
  if (from === to) h += `<circle class="hl-city" cx="${x}" cy="${y}" r="13"/>`;
  $('#route-hl').innerHTML = h;
}
const clearRoute = () => { $('#route-hl').innerHTML = ''; };

function floatText(city, text, cls) {
  const [x, y] = cityXY(city);
  const t = document.createElementNS(SVGNS, 'text');
  t.setAttribute('class', 'float ' + cls);
  t.setAttribute('x', x); t.setAttribute('y', y - 12);
  t.textContent = text;
  $('#fx').appendChild(t);
  setTimeout(() => t.remove(), 1800);
}

// ---------- algemene UI -----------------------------------------------------
function toast(text, kind = '') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text;
  box.appendChild(el);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => el.classList.add('out'), 3800);
  setTimeout(() => el.remove(), 4300);
}

function updateTopbar() {
  $('#st-money').textContent = fmtMoney(S.money);
  $('#st-money').classList.toggle('neg', S.money < 0);
  $('#st-level').textContent = S.level;
  $('#st-xp').style.width = (S.xp / L.xpNeeded(S.level) * 100).toFixed(1) + '%';
  $('#st-clock').textContent = fmtClock(S.time);
  $('#st-diesel').textContent = '€ ' + S.diesel.toFixed(2).replace('.', ',') + '/L';
  document.querySelectorAll('#speed button').forEach(b => b.classList.toggle('on', Number(b.dataset.speed) === S.speed));
}

function renderEvents() {
  $('#events').innerHTML = S.events.map(e =>
    `<div class="chip" title="${esc(e.desc)}">${e.icon} ${esc(e.title)} <span class="muted">· nog ${fmtDur(e.endsAt - S.time)}</span></div>`).join('');
}

function statusText(t) {
  const j = t.job;
  switch (t.state) {
    case 'idle': return `Staat klaar in ${cityName(t.city)}`;
    case 'toPickup': return `Rijdt leeg naar ${cityName(j.from)}`;
    case 'loading': return `Laadt ${CARGO[j.cargo].name.toLowerCase()} in ${cityName(t.city)}`;
    case 'delivering': return `${CARGO[j.cargo].icon} ${fmtWeight(j.weight)} naar ${cityName(j.to)}`;
    case 'unloading': return `Lost in ${cityName(t.city)}`;
    case 'resting': return '😴 Verplichte rust (tachograaf)';
    case 'broken': return '🛠️ Pech — wacht op takeldienst';
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

function renderGoal() {
  const g = L.currentGoal();
  const box = $('#goal');
  if (!g) { box.innerHTML = '<span>🏆 Alle doelen behaald — jij bent de echte Vrachtbaas!</span>'; return; }
  let prog = '';
  if (g.progress) {
    const [cur, max] = g.progress(S);
    prog = `<div class="bar"><i style="width:${clamp(cur / max * 100, 0, 100)}%"></i></div><span class="muted small">${Math.min(cur, max)}/${max}</span>`;
  }
  box.innerHTML = `<div class="goal-text"><span class="muted small">🎯 Doel</span><b>${esc(g.text)}</b></div><div class="goal-side"><span class="reward">+${fmtMoney(g.reward)}</span>${prog}</div>`;
}

function renderTabs() {
  const idle = S.trucks.filter(t => t.state === 'idle').length;
  const counts = { vracht: S.contracts.length, vloot: idle ? idle + ' vrij' : '' };
  document.querySelectorAll('#tabs button').forEach(b => {
    b.classList.toggle('on', b.dataset.tab === activeTab);
    const badge = b.querySelector('.badge');
    if (badge) badge.textContent = counts[b.dataset.tab] || '';
  });
}

function renderPanel() {
  renderGoal();
  renderTabs();
  const body = $('#tab-body');
  const scroll = body.scrollTop;
  body.innerHTML = { vracht: viewContracts, vloot: viewFleet, netwerk: viewNetwork, upgrades: viewUpgrades, logboek: viewLog }[activeTab]();
  body.scrollTop = scroll;
}

// ---------- tabbladen -------------------------------------------------------
function bestFor(c) {
  let best = null;
  for (const t of S.trucks) {
    if (t.state !== 'idle' || !L.canCarry(t, c)) continue;
    const e = L.estimate(t, c);
    const score = e.perHour + (e.onTime ? 1e6 : 0);
    if (!best || score > best.score) best = { t, e, score };
  }
  return best;
}

function viewContracts() {
  const list = [...S.contracts].sort((a, b) => b.payout - a.payout);
  let h = `<div class="tab-head"><h2>Vrachtbeurs</h2><span class="muted small">${list.length}/${L.boardMax()} opdrachten · aanbod uit ${L.networkCities().size} steden</span></div>`;
  if (L.up('planner') && S.plannerOn) h += '<p class="hint">🧑‍💼 Je planner wijst vracht automatisch toe aan stilstaande trucks.</p>';
  if (!list.length) return h + '<div class="empty">Even geen vracht. Er komt elk uur nieuw aanbod binnen…</div>';
  for (const c of list) {
    const C = CARGO[c.cargo];
    const locked = C.level > S.level;
    const left = c.deadline - S.time;
    const best = locked ? null : bestFor(c);
    const fits = T => T.cargo.includes(c.cargo) && T.capacity >= c.weight;
    const owns = S.trucks.some(t => fits(TRUCK_TYPES[t.type]));
    let action;
    if (locked) action = `<span class="lock">🔒 Niveau ${C.level}</span>`;
    else if (best) action = `<button class="btn primary" data-action="assign-contract" data-id="${c.id}">Toewijzen</button>`;
    else if (!owns) action = `<span class="muted small">Vereist: ${esc(Object.values(TRUCK_TYPES).filter(fits).map(T => T.name).join(' of '))}</span>`;
    else action = '<span class="muted small">Geen geschikte truck vrij</span>';
    h += `<article class="card contract${locked ? ' locked' : ''}" data-route="${c.from},${c.to}">
      <div class="c-icon">${C.icon}</div>
      <div class="c-main">
        <div class="c-title">${C.name} <span class="muted">· ${fmtWeight(c.weight)}</span></div>
        <div class="c-route">${cityName(c.from)} <span class="arrow">→</span> ${cityName(c.to)} <span class="muted">· ${fmtKm(c.km)}</span></div>
        <div class="c-meta"><span class="${left < 6 ? 'warn' : ''}">⏱ leveren binnen ${fmtDur(left)}</span> · <span>vervalt over ${fmtDur(c.expires - S.time)}</span></div>
        ${best ? `<div class="c-est">Beste keuze: <b>${best.t.plate}</b> in ${cityName(best.t.city)} · winst ±${fmtMoney(best.e.profit)}${best.e.onTime ? '' : ' <span class="warn">⚠ te laat</span>'}</div>` : ''}
      </div>
      <div class="c-side"><div class="c-pay">${fmtMoney(L.payoutFor(c))}</div>${action}</div>
    </article>`;
  }
  return h;
}

function viewFleet() {
  let h = `<div class="tab-head"><h2>Vloot</h2><span class="muted small">${S.trucks.length} voertuigen</span></div>`;
  for (const t of S.trucks) {
    const T = TRUCK_TYPES[t.type];
    const condCls = t.cond < 40 ? 'bad' : t.cond < 70 ? 'mid' : 'ok';
    let btns = '';
    if (t.state === 'idle') {
      btns += `<button class="btn primary" data-action="find-load" data-id="${t.id}">Zoek vracht</button>`;
      if (t.cond < 95) btns += `<button class="btn" data-action="repair" data-id="${t.id}" ${S.money < L.repairCost(t) ? 'disabled' : ''}>🔧 ${fmtMoney(L.repairCost(t))}</button>`;
      if (S.trucks.length > 1) btns += `<button class="btn ghost" data-action="sell" data-id="${t.id}" title="Verkopen voor ${fmtMoney(L.sellValue(t))}">💸</button>`;
    }
    const routeAttr = t.job
      ? ` data-route="${t.job.from},${t.job.to}" data-via="${t.state === 'toPickup' && t.route ? t.route.path[0] : ''}"`
      : ` data-route="${t.city},${t.city}"`;
    h += `<article class="card truck-card state-${t.state}"${routeAttr}>
      <div class="t-icon" style="--c:${T.color}">${T.icon}</div>
      <div class="t-main">
        <div class="t-title"><b>${t.plate}</b> <span class="muted">· ${T.name} · ${esc(t.driver)}</span></div>
        <div class="t-status">${statusText(t)}</div>
        <div class="bar ${t.state === 'idle' ? 'dim' : ''}"><i style="width:${(truckProgress(t) * 100).toFixed(1)}%"></i></div>
        <div class="t-meta"><span class="cond ${condCls}">Conditie ${Math.round(t.cond)}%</span> · ${fmtKm(t.km)} · ${t.trips} ritten · winst ${fmtMoney(t.earned)}</div>
      </div>
      <div class="t-actions">${btns}</div>
    </article>`;
  }

  if (!S.depots.includes(buyCity)) buyCity = S.depots[0];
  h += `<div class="tab-head sub"><h3>Voertuig kopen</h3>
    <label class="small muted">Leveren in <select data-role="buy-city">${S.depots.map(d => `<option value="${d}" ${d === buyCity ? 'selected' : ''}>${cityName(d)}</option>`).join('')}</select></label></div>`;
  h += '<div class="shop">';
  for (const [id, T] of Object.entries(TRUCK_TYPES)) {
    const locked = S.level < T.level;
    h += `<article class="card shop-item${locked ? ' locked' : ''}">
      <div class="t-icon" style="--c:${T.color}">${T.icon}</div>
      <div class="s-main">
        <b>${T.name}</b>
        <div class="specs"><span>🏋️ ${T.capacity} t</span><span>💨 ${T.speed} km/u</span><span>⛽ ${T.fuel} L/100</span><span>👷 € ${T.wage}/u</span></div>
        <div class="small muted">Vracht: ${T.cargo.map(k => CARGO[k].icon + ' ' + CARGO[k].name).join(', ')}</div>
      </div>
      <div>${locked ? `<span class="lock">🔒 Niveau ${T.level}</span>` : `<button class="btn primary" data-action="buy-truck" data-id="${id}" ${S.money < T.price ? 'disabled' : ''}>${fmtMoney(T.price)}</button>`}</div>
    </article>`;
  }
  return h + '</div>';
}

function viewNetwork() {
  const net = L.networkCities();
  const price = L.depotPrice();
  let h = `<div class="tab-head"><h2>Netwerk</h2><span class="muted small">${S.depots.length} depots</span></div>
    <p class="hint">Vracht vertrekt uit je depotsteden en hun buursteden. Elk depot zorgt voor meer aanbod op de vrachtbeurs en je kunt er nieuwe trucks laten leveren.</p>`;
  const ids = Object.keys(CITIES).sort((a, b) => (S.depots.includes(b) - S.depots.includes(a)) || (net.has(b) - net.has(a)) || cityName(a).localeCompare(cityName(b)));
  for (const id of ids) {
    const c = CITIES[id];
    const depot = S.depots.includes(id);
    const status = depot ? '<span class="tag depot">🏭 Depot</span>' : net.has(id) ? '<span class="tag net">In netwerk</span>' : '<span class="tag off">Buiten netwerk</span>';
    const specs = Object.keys(c.cargo).map(k => `<span title="${CARGO[k].name}">${CARGO[k].icon}</span>`).join('');
    h += `<article class="card city-card" data-route="${id},${id}">
      <div class="c-main"><div class="c-title">${c.port ? '⚓ ' : ''}${c.name} <span class="muted small">${c.country}</span> ${status}</div>
      <div class="small muted">Specialiteit: ${specs}</div></div>
      <div>${depot ? '' : `<button class="btn" data-action="build-depot" data-id="${id}" ${S.money < price ? 'disabled' : ''}>Depot ${fmtMoney(price)}</button>`}</div>
    </article>`;
  }
  return h;
}

function viewUpgrades() {
  let h = '<div class="tab-head"><h2>Bedrijf</h2></div>';
  for (const u of UPGRADES) {
    const owned = L.up(u.id);
    const locked = S.level < u.level;
    let side;
    if (owned && u.id === 'planner') side = `<button class="btn ${S.plannerOn ? 'primary' : ''}" data-action="toggle-planner">${S.plannerOn ? 'Actief' : 'Gepauzeerd'}</button>`;
    else if (owned) side = '<span class="tag depot">✔ In bezit</span>';
    else if (locked) side = `<span class="lock">🔒 Niveau ${u.level}</span>`;
    else side = `<button class="btn primary" data-action="buy-upgrade" data-id="${u.id}" ${S.money < u.price ? 'disabled' : ''}>${fmtMoney(u.price)}</button>`;
    h += `<article class="card upgrade${owned ? ' owned' : ''}${locked ? ' locked' : ''}">
      <div class="c-icon">${u.icon}</div>
      <div class="c-main"><div class="c-title">${u.name}</div><div class="small muted">${u.desc}</div></div>
      <div>${side}</div>
    </article>`;
  }
  return h;
}

function viewLog() {
  const st = S.stats;
  const tile = (label, value) => `<div class="tile"><span class="muted small">${label}</span><b>${value}</b></div>`;
  let h = '<div class="tab-head"><h2>Logboek</h2></div><div class="tiles">';
  h += tile('Bedrijfswaarde', fmtMoney(L.companyValue()));
  h += tile('Leveringen', st.deliveries.toLocaleString('nl-BE'));
  h += tile('Op tijd', st.deliveries ? Math.round((1 - st.late / st.deliveries) * 100) + '%' : '—');
  h += tile('Gereden', fmtKm(st.km));
  h += tile('Omzet', fmtMoney(st.income));
  h += tile('Kosten', fmtMoney(st.costs));
  h += '</div><ul class="log">';
  for (const e of S.log) h += `<li><span class="muted small">${fmtClock(e.t)}</span> ${esc(e.text)}</li>`;
  h += '</ul><div class="danger-zone"><button class="btn ghost" data-action="help">❓ Uitleg</button><button class="btn ghost" data-action="reset">↺ Opnieuw beginnen</button></div>';
  return h;
}

// ---------- modals ----------------------------------------------------------
function openModal(html) {
  $('#modal-content').innerHTML = html;
  $('#modal').hidden = false;
}
function closeModal() {
  $('#modal').hidden = true;
  clearRoute();
}

function estRow(t, c, e) {
  const C = CARGO[c.cargo];
  return `<div class="pick-row" data-route="${c.from},${c.to}" data-via="${t.city}">
    <div class="pick-main">
      <b>${TRUCK_TYPES[t.type].icon} ${t.plate}</b> <span class="muted small">in ${cityName(t.city)}</span><br>
      <span class="small">${C.icon} ${cityName(c.from)} → ${cityName(c.to)} · ${fmtWeight(c.weight)} · ${fmtMoney(L.payoutFor(c))}</span><br>
      <span class="small muted">${e.empty ? `${fmtKm(e.empty)} leeg + ` : ''}${fmtKm(e.loaded)} geladen · ${fmtDur(e.hours)}</span>
      ${e.onTime ? '<span class="small ok"> · op tijd</span>' : '<span class="small warn"> · ⚠ te laat (−40%)</span>'}
    </div>
    <div class="pick-side"><span class="${e.profit >= 0 ? 'ok' : 'warn'}">${fmtMoney(e.profit)}</span><span class="muted small">winst</span>
      <button class="btn primary" data-action="pick" data-truck="${t.id}" data-contract="${c.id}">Kies</button></div>
  </div>`;
}

const byBest = (a, b) => (b.e.onTime - a.e.onTime) || (b.e.perHour - a.e.perHour);

function openAssignForContract(c) {
  const rows = S.trucks.filter(t => t.state === 'idle' && L.canCarry(t, c)).map(t => ({ t, e: L.estimate(t, c) })).sort(byBest);
  openModal(`<h2>${CARGO[c.cargo].icon} ${cityName(c.from)} → ${cityName(c.to)}</h2>
    <p class="muted small">${CARGO[c.cargo].name} · ${fmtWeight(c.weight)} · vergoeding ${fmtMoney(L.payoutFor(c))} · kies een truck</p>
    <div class="pick-list">${rows.map(r => estRow(r.t, c, r.e)).join('') || '<div class="empty">Geen geschikte truck vrij.</div>'}</div>
    <div class="modal-foot"><button class="btn ghost" data-action="close-modal">Annuleren</button></div>`);
  if (rows[0]) highlightRoute(c.from, c.to, rows[0].t.city);
}

function openAssignForTruck(t) {
  const rows = S.contracts.filter(c => L.canCarry(t, c)).map(c => ({ c, e: L.estimate(t, c) })).sort(byBest);
  openModal(`<h2>${TRUCK_TYPES[t.type].icon} Vracht voor ${t.plate}</h2>
    <p class="muted small">${TRUCK_TYPES[t.type].name} · staat in ${cityName(t.city)} · beste winst per uur bovenaan</p>
    <div class="pick-list">${rows.map(r => estRow(t, r.c, r.e)).join('') || '<div class="empty">Geen passende vracht op de beurs. Wacht op nieuw aanbod of breid je netwerk uit.</div>'}</div>
    <div class="modal-foot"><button class="btn ghost" data-action="close-modal">Sluiten</button></div>`);
  if (rows[0]) highlightRoute(rows[0].c.from, rows[0].c.to, t.city);
}

function openCity(id) {
  const c = CITIES[id];
  const depot = S.depots.includes(id);
  const net = L.networkCities().has(id);
  const here = S.trucks.filter(t => !t.route && t.city === id);
  const out = S.contracts.filter(x => x.from === id);
  const price = L.depotPrice();
  openModal(`<h2>${c.port ? '⚓ ' : ''}${c.name} <span class="muted small">${c.country}</span></h2>
    <p class="small">${depot ? '🏭 Je hebt hier een depot.' : net ? 'Deze stad ligt in je netwerk: er vertrekt vracht vanuit hier.' : 'Deze stad ligt buiten je netwerk. Open hier of in een buurstad een depot.'}</p>
    <p class="small muted">Specialiteit: ${Object.keys(c.cargo).map(k => CARGO[k].icon + ' ' + CARGO[k].name).join(', ')}</p>
    <p class="small muted">Wegen: ${ADJ[id].map(e => `${e.road} → ${cityName(e.to)}`).join(' · ')}</p>
    <p class="small">${here.length} voertuig(en) hier · ${out.length} opdracht(en) vanuit deze stad</p>
    <div class="modal-foot">
      ${depot ? '' : `<button class="btn primary" data-action="build-depot" data-id="${id}" ${S.money < price ? 'disabled' : ''}>Depot openen · ${fmtMoney(price)}</button>`}
      <button class="btn ghost" data-action="close-modal">Sluiten</button></div>`);
  highlightRoute(id, id);
}

function showIntro() {
  openModal(`<h2>🚛 Welkom bij Vrachtbaas</h2>
    <p>Je erft een klein transportbedrijfje in Antwerpen: één bestelwagen, € ${START_MONEY.toLocaleString('nl-BE')} en een droom. Bouw het uit tot dé logistieke speler van de Benelux.</p>
    <ol class="intro">
      <li><b>Vrachtbeurs</b>: kies een opdracht en wijs ze toe aan een vrije truck.</li>
      <li><b>Lege kilometers</b> kosten diesel en loon. Plan slim zodat je trucks eindigen waar de volgende vracht klaarstaat.</li>
      <li><b>Deadlines</b>: te laat = maar 60% van de vergoeding. Chauffeurs moeten na 9 uur rijden verplicht rusten.</li>
      <li><b>Groei</b>: stijg in niveau, koop zwaardere trucks, open depots in nieuwe steden en neem een planner aan die alles automatisch regelt.</li>
    </ol>
    <p class="small muted">Tip: beweeg over een opdracht om de route op de kaart te zien. Het spel bewaart automatisch.</p>
    <div class="modal-foot"><button class="btn primary" data-action="close-modal">Start de motor!</button></div>`);
}

function showWelcomeBack(r, away) {
  const mins = Math.round(Math.min(away, MAX_OFFLINE_MS) / 60000);
  openModal(`<h2>👋 Welkom terug!</h2>
    <p>Je was ${mins >= 60 ? Math.floor(mins / 60) + 'u' + String(mins % 60).padStart(2, '0') : mins + ' min'} weg (${Math.round(r.hours / 24)} speldagen).</p>
    <div class="tiles">
      <div class="tile"><span class="muted small">Resultaat</span><b class="${r.money >= 0 ? 'ok' : 'warn'}">${r.money >= 0 ? '+' : ''}${fmtMoney(r.money)}</b></div>
      <div class="tile"><span class="muted small">Leveringen</span><b>${r.deliveries}</b></div>
      ${r.levels ? `<div class="tile"><span class="muted small">Niveaus</span><b>+${r.levels}</b></div>` : ''}
    </div>
    ${L.up('planner') ? '' : '<p class="small muted">Tip: met een Planningsafdeling blijven je trucks ook rijden als je weg bent.</p>'}
    <div class="modal-foot"><button class="btn primary" data-action="close-modal">Verder spelen</button></div>`);
}

// ---------- invoer ----------------------------------------------------------
const findTruck = id => S.trucks.find(t => t.id === Number(id));
const findContract = id => S.contracts.find(c => c.id === Number(id));

function resetGame() {
  if (!confirm('Weet je zeker dat je opnieuw wilt beginnen? Je voortgang gaat verloren.')) return;
  L.wipeSave();
  L.newGame();
  S.introSeen = true;
  truckEls.forEach(el => el.remove());
  truckEls.clear();
  renderCities();
  renderEvents();
  closeModal();
}

function onAction(btn) {
  const { action, id } = btn.dataset;
  switch (action) {
    case 'tab': activeTab = btn.dataset.tab; clearRoute(); $('#tab-body').scrollTop = 0; break;
    case 'speed': S.speed = Number(btn.dataset.speed); break;
    case 'assign-contract': { const c = findContract(id); if (c) openAssignForContract(c); break; }
    case 'find-load': { const t = findTruck(id); if (t) openAssignForTruck(t); break; }
    case 'pick': {
      const t = findTruck(btn.dataset.truck), c = findContract(btn.dataset.contract);
      if (t && c && L.assign(t, c)) toast(`${TRUCK_TYPES[t.type].icon} ${t.plate} vertrekt naar ${cityName(c.from)}`, 'good');
      else toast('Deze combinatie is niet meer beschikbaar.', 'bad');
      closeModal();
      break;
    }
    case 'repair': { const t = findTruck(id); if (t) L.repairTruck(t); break; }
    case 'sell': {
      const t = findTruck(id);
      if (t && confirm(`${t.plate} verkopen voor ${fmtMoney(L.sellValue(t))}?`)) L.sellTruck(t);
      break;
    }
    case 'buy-truck': L.buyTruck(id, S.depots.includes(buyCity) ? buyCity : S.depots[0]); break;
    case 'build-depot': L.buildDepot(id); closeModal(); break;
    case 'buy-upgrade': L.buyUpgrade(id); break;
    case 'toggle-planner': S.plannerOn = !S.plannerOn; break;
    case 'city': openCity(id); break;
    case 'close-modal': closeModal(); break;
    case 'help': showIntro(); break;
    case 'reset': resetGame(); break;
  }
  dirty = true;
  L.save();
}

function bindInput() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (btn && !btn.disabled) onAction(btn);
    else if (e.target.id === 'modal') closeModal();
  });
  document.addEventListener('change', e => {
    if (e.target.dataset.role === 'buy-city') buyCity = e.target.value;
  });
  // Niet hertekenen terwijl je klikt, anders verdwijnt de knop onder je muis.
  document.addEventListener('pointerdown', () => { pointerDown = true; });
  document.addEventListener('pointerup', () => setTimeout(() => { pointerDown = false; }, 80));
  document.addEventListener('pointercancel', () => { pointerDown = false; });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
    if (e.target.tagName === 'SELECT') return;
    const speeds = { p: 0, 1: 1, 2: 2, 3: 4 };
    const k = e.key.toLowerCase();
    if (k in speeds) S.speed = speeds[k];
  });

  const hover = e => {
    const card = e.target.closest('[data-route]');
    if (!card) return;
    const [from, to] = card.dataset.route.split(',');
    highlightRoute(from, to, card.dataset.via);
  };
  $('#tab-body').addEventListener('mouseover', hover);
  $('#tab-body').addEventListener('mouseleave', () => { if ($('#modal').hidden) clearRoute(); });
  $('#modal-content').addEventListener('mouseover', hover);

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
      if (dtMs > 60000 && (r.deliveries || Math.abs(r.money) > 1)) toast(`Bijgewerkt: ${r.deliveries} leveringen, ${r.money >= 0 ? '+' : ''}${fmtMoney(r.money)}`);
    }
  } else if (S.speed > 0) {
    let h = dtMs / L.GAME_HOUR_MS * S.speed;
    while (h > 0) { const step = Math.min(0.1, h); L.tick(step); h -= step; }
  }

  drawTrucks();
  updateTopbar();
  if (now - lastSlow > 1000) { lastSlow = now; L.checkGoals(); renderEvents(); }
  if (!pointerDown && ((dirty && now - lastPanel > 200) || now - lastPanel > 1000)) {
    renderPanel();
    lastPanel = now;
    dirty = false;
  }
  if (Date.now() - lastSave > 10000) { L.save(); lastSave = Date.now(); }
  requestAnimationFrame(frame);
}

export function start() {
  hooks.changed = () => { dirty = true; };
  hooks.toast = toast;
  hooks.float = floatText;
  hooks.events = renderEvents;
  hooks.cities = () => { renderCities(); dirty = true; };

  renderMap();
  let welcome = null;
  if (L.load()) {
    const away = Date.now() - S.savedAt;
    if (away > 10000 && S.speed > 0) {
      const r = L.simulate(away);
      if (r.deliveries || Math.abs(r.money) > 1) welcome = () => showWelcomeBack(r, away);
    }
  } else {
    L.newGame();
  }
  renderCities();
  renderEvents();
  if (!S.introSeen) { S.introSeen = true; showIntro(); } else if (welcome) welcome();
  bindInput();
  L.save();
  requestAnimationFrame(frame);
}
