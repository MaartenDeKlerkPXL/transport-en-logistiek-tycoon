// Vrachtbaas — spellogica. Geen DOM hier: de UI luistert via `hooks`,
// zodat deze module ook in Node getest kan worden (npm test).
import { CITIES, ROADS, TRUCK_TYPES, CARGO, UPGRADES, GOALS, DEPOT_BASE_PRICE, DRIVER_NAMES } from './data.js';
import { rand, randInt, pick, clamp, weighted, fmtMoney, fmtWeight } from './util.js';

export const GAME_HOUR_MS = 2500;            // 1 speluur = 2,5 echte seconden (1 dag = 1 minuut)
export const SAVE_KEY = 'vrachtbaas-save-v1';
export const MAX_OFFLINE_MS = 2 * 3600 * 1000;
export const LATE_FACTOR = 0.6;              // te laat geleverd = 60% van de vergoeding
export const START_MONEY = 8000;
export const REST_HOURS = 9;
const ROAD_FACTOR = 1.2;                     // wegafstand t.o.v. vogelvlucht

export let S = null;                         // volledige spelstatus (wordt opgeslagen)
let quiet = false;                           // true tijdens offline-simulatie: geen meldingen

// De UI vult deze in. Standaard doen ze niets (handig voor tests).
export const hooks = {
  changed() {},          // paneel moet opnieuw getekend worden
  toast() {},            // (tekst, soort)
  float() {},            // (stad, tekst, soort) zwevende tekst op de kaart
  events() {},           // actieve gebeurtenissen gewijzigd
  cities() {},           // depots/netwerk gewijzigd
};
const toast = (...a) => { if (!quiet) hooks.toast(...a); };
const float = (...a) => { if (!quiet) hooks.float(...a); };

export const cityName = id => CITIES[id].name;

// ---------- geografie & routes ---------------------------------------------
export function haversine(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const ADJ = {};
for (const id in CITIES) ADJ[id] = [];
for (const [a, b, road] of ROADS) {
  const km = haversine(CITIES[a], CITIES[b]) * ROAD_FACTOR;
  ADJ[a].push({ to: b, km, road });
  ADJ[b].push({ to: a, km, road });
}

// Kortste route over het wegennet (Dijkstra). Resultaat wordt gecachet.
const routeCache = {};
export function route(a, b) {
  const key = a + '>' + b;
  if (routeCache[key]) return routeCache[key];
  const dist = {}, prev = {}, done = new Set();
  for (const id in CITIES) dist[id] = Infinity;
  dist[a] = 0;
  for (;;) {
    let u = null;
    for (const id in dist) if (!done.has(id) && (u === null || dist[id] < dist[u])) u = id;
    if (u === null || dist[u] === Infinity || u === b) break;
    done.add(u);
    for (const e of ADJ[u]) {
      const nd = dist[u] + e.km;
      if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = u; }
    }
  }
  const path = [b];
  while (path[0] !== a) path.unshift(prev[path[0]]);
  const segs = [];
  let acc = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const km = ADJ[path[i]].find(e => e.to === path[i + 1]).km;
    segs.push({ a: path[i], b: path[i + 1], from: acc, km });
    acc += km;
  }
  return (routeCache[key] = { path, km: acc, segs });
}

export function roadName(seg) {
  const e = ADJ[seg.a].find(x => x.to === seg.b);
  return e ? e.road : 'weg';
}

// ---------- status ----------------------------------------------------------
export function defaults() {
  return {
    v: 1, money: START_MONEY, xp: 0, level: 1, time: 6, diesel: 1.75, speed: 1,
    depots: ['antwerpen'], trucks: [], contracts: [], upgrades: {}, plannerOn: true,
    events: [], log: [], goalsDone: [], visited: { antwerpen: true },
    stats: { deliveries: 0, income: 0, costs: 0, km: 0, late: 0 },
    nextContractAt: 6, nextEventAt: 18, nextDieselAt: 7, nextDispatchAt: 0,
    nextId: 1, savedAt: Date.now(), introSeen: false,
  };
}

export function newGame() {
  S = defaults();
  addTruck('bestel', 'antwerpen');
  for (let i = 0; i < 5; i++) genContract();
  log('🏁 Welkom bij Vrachtbaas! Je start met één bestelwagen in Antwerpen.');
  return S;
}

export const up = id => !!S.upgrades[id];
export const driveLimit = () => (up('duo') ? 18 : 9);
export const truckSpeed = t => TRUCK_TYPES[t.type].speed * (up('telematica') ? 1.08 : 1);
export const costPerKm = t => TRUCK_TYPES[t.type].fuel / 100 * S.diesel * (up('eco') ? 0.85 : 1);
export const wearPerKm = t => TRUCK_TYPES[t.type].wear * (up('garage') ? 0.6 : 1);
export const repairCost = t => Math.round((100 - t.cond) * TRUCK_TYPES[t.type].price * 0.0012);
export const sellValue = t => Math.round(TRUCK_TYPES[t.type].price * 0.5 * (0.4 + 0.6 * t.cond / 100));
export const depotPrice = () => DEPOT_BASE_PRICE * Math.pow(2, S.depots.length - 1);
export const boardMax = () => 7 + S.depots.length * 3 + (up('beurs') ? 5 : 0);
export const xpNeeded = l => Math.round(100 * Math.pow(1.7, l - 1));
export const payoutFor = (c, late = false) => c.payout * (up('track') ? 1.1 : 1) * (late ? LATE_FACTOR : 1);

export function companyValue() {
  if (!S) return 0;
  let v = S.money;
  for (const t of S.trucks) v += sellValue(t);
  for (let i = 1; i < S.depots.length; i++) v += DEPOT_BASE_PRICE * Math.pow(2, i - 1) * 0.7;
  for (const u of UPGRADES) if (S.upgrades[u.id]) v += u.price * 0.5;
  return v;
}

function slowFactor(seg) {
  for (const e of S.events) {
    if (e.slowCity && (seg.a === e.slowCity || seg.b === e.slowCity)) return up('telematica') ? 0.75 : 0.5;
  }
  return 1;
}
function cargoBoost(cargo) {
  let m = 1;
  for (const e of S.events) if (e.boost && e.boost[cargo]) m *= e.boost[cargo];
  return m;
}

export function log(text) {
  S.log.unshift({ t: S.time, text });
  if (S.log.length > 80) S.log.length = 80;
  hooks.changed();
}

function spend(amount, truck) {
  S.money -= amount;
  S.stats.costs += amount;
  if (truck && truck.job) truck.job.cost += amount;
}

// ---------- vloot -----------------------------------------------------------
function makePlate() {
  const L = 'ABCDEFGHJKLMNPRSTVWXYZ';
  return `${randInt(1, 2)}-${pick(L)}${pick(L)}${pick(L)}-${randInt(100, 999)}`;
}

export function addTruck(type, city) {
  const used = new Set(S.trucks.map(t => t.driver));
  const free = DRIVER_NAMES.filter(n => !used.has(n));
  const t = {
    id: S.nextId++, type, plate: makePlate(), driver: pick(free.length ? free : DRIVER_NAMES),
    city, state: 'idle', route: null, job: null, timer: 0, cond: 100, driveHours: 0,
    km: 0, earned: 0, trips: 0, prev: null,
  };
  S.trucks.push(t);
  hooks.changed();
  return t;
}

export function canCarry(t, c) {
  const T = TRUCK_TYPES[t.type];
  return T.cargo.includes(c.cargo) && T.capacity >= c.weight && CARGO[c.cargo].level <= S.level;
}

// Verwachte duur, kosten en winst als truck t opdracht c aanneemt.
export function estimate(t, c) {
  const T = TRUCK_TYPES[t.type];
  const empty = t.city === c.from ? 0 : route(t.city, c.from).km;
  const loaded = c.km;
  const driveH = (empty + loaded) / truckSpeed(t);
  const rests = Math.floor((t.driveHours + driveH) / driveLimit());
  const hours = driveH + CARGO[c.cargo].loadH * 2 + rests * REST_HOURS;
  const cost = (empty + loaded) * costPerKm(t) + hours * T.wage;
  const onTime = S.time + hours <= c.deadline;
  const profit = payoutFor(c, !onTime) - cost;
  return { empty, loaded, hours, cost, profit, onTime, perHour: profit / hours };
}

function setRoute(t, from, to) {
  const r = route(from, to);
  t.route = { path: r.path, segs: r.segs, total: r.km, progress: 0 };
}

export function assign(t, c) {
  if (t.state !== 'idle' || !canCarry(t, c) || !S.contracts.some(x => x.id === c.id)) return false;
  S.contracts = S.contracts.filter(x => x.id !== c.id);
  t.job = { ...c, cost: 0, startedAt: S.time };
  if (t.city === c.from) startLoading(t);
  else { setRoute(t, t.city, c.from); t.state = 'toPickup'; }
  hooks.changed();
  return true;
}

function startLoading(t) {
  t.state = 'loading';
  t.timer = CARGO[t.job.cargo].loadH;
}

export function currentSeg(t) {
  const r = t.route;
  return r.segs.find(s => r.progress <= s.from + s.km) || r.segs[r.segs.length - 1];
}

function updateTruck(t, dt) {
  if (t.state !== 'idle') spend(TRUCK_TYPES[t.type].wage * dt, t);

  switch (t.state) {
    case 'idle':
      t.driveHours = Math.max(0, t.driveHours - dt);
      if (up('garage') && t.cond < 50 && S.money >= repairCost(t)) {
        spend(repairCost(t));
        t.cond = 100;
        log(`🔧 ${t.plate} kreeg automatisch onderhoud in de werkplaats.`);
      }
      break;
    case 'toPickup':
    case 'delivering':
      drive(t, dt);
      break;
    case 'loading':
    case 'unloading':
      t.timer -= dt;
      t.driveHours = Math.max(0, t.driveHours - dt * 0.5);
      if (t.timer <= 0) {
        if (t.state === 'loading') { setRoute(t, t.job.from, t.job.to); t.state = 'delivering'; }
        else completeJob(t);
        hooks.changed();
      }
      break;
    case 'resting':
      t.driveHours -= dt * driveLimit() / REST_HOURS;
      if (t.driveHours <= 0) { t.driveHours = 0; t.state = t.prev; t.prev = null; hooks.changed(); }
      break;
    case 'broken':
      t.timer -= dt;
      if (t.timer <= 0) { t.state = t.prev; t.prev = null; hooks.changed(); }
      break;
  }
}

function drive(t, dt) {
  if (!t.route.segs.length) { arrive(t); return; }
  if (t.driveHours >= driveLimit()) {
    t.prev = t.state; t.state = 'resting';
    hooks.changed();
    return;
  }
  const spd = truckSpeed(t) * slowFactor(currentSeg(t));
  const move = Math.min(spd * dt, t.route.total - t.route.progress);
  t.route.progress += move;
  t.km += move;
  S.stats.km += move;
  t.driveHours += move / spd;
  t.cond = Math.max(0, t.cond - wearPerKm(t) * move);
  spend(move * costPerKm(t), t);

  if (t.cond < 40 && Math.random() < (40 - t.cond) / 40 * 0.0015 * move) {
    t.prev = t.state; t.state = 'broken'; t.timer = 3;
    spend(400, t);
    log(`🛠️ Pech! ${t.plate} (${t.driver}) staat stil langs de ${roadName(currentSeg(t))}. Takelkosten € 400.`);
    toast(`🛠️ ${t.plate} heeft pech — plan onderhoud in!`, 'bad');
    hooks.changed();
    return;
  }
  if (t.route.progress >= t.route.total - 1e-6) arrive(t);
}

function arrive(t) {
  t.city = t.route.path[t.route.path.length - 1];
  t.route = null;
  if (t.state === 'toPickup') startLoading(t);
  else { t.state = 'unloading'; t.timer = CARGO[t.job.cargo].loadH; }
  hooks.changed();
}

function completeJob(t) {
  const j = t.job;
  const late = S.time > j.deadline;
  const pay = payoutFor(j, late);
  S.money += pay;
  S.stats.income += pay;
  S.stats.deliveries++;
  if (late) S.stats.late++;
  const profit = pay - j.cost;
  t.earned += profit;
  t.trips++;
  S.visited[j.to] = true;
  log(`${late ? '⏰' : '✅'} ${t.plate} leverde ${fmtWeight(j.weight)} ${CARGO[j.cargo].name.toLowerCase()} in ${cityName(j.to)}: ${fmtMoney(pay)}${late ? ' (te laat!)' : ''} · winst ${fmtMoney(profit)}`);
  float(j.to, '+' + fmtMoney(pay), late ? 'late' : 'good');
  addXp(Math.round((8 + j.km / 25) * (late ? 0.5 : 1)));
  t.job = null;
  t.state = 'idle';
}

export function addXp(n) {
  S.xp += n;
  while (S.xp >= xpNeeded(S.level)) {
    S.xp -= xpNeeded(S.level);
    S.level++;
    const unlocks = [
      ...Object.values(TRUCK_TYPES).filter(T => T.level === S.level).map(T => T.name),
      ...Object.values(CARGO).filter(C => C.level === S.level).map(C => C.name),
      ...UPGRADES.filter(u => u.level === S.level).map(u => u.name),
    ];
    const extra = unlocks.length ? ` Nieuw: ${unlocks.join(', ')}.` : '';
    log(`⭐ Niveau ${S.level} bereikt!${extra}`);
    toast(`⭐ Niveau ${S.level}!${extra}`, 'level');
  }
}

// ---------- vrachtbeurs -----------------------------------------------------
// Depotsteden (gewicht 3) en hun buursteden (gewicht 1) leveren vracht.
export function networkCities() {
  const net = new Map();
  for (const d of S.depots) net.set(d, 3);
  for (const d of S.depots) for (const e of ADJ[d]) if (!net.has(e.to)) net.set(e.to, 1);
  return net;
}

export function genContract() {
  const from = weighted([...networkCities()]);
  const strike = S.events.some(e => e.strike === from);
  // Vracht die je vloot kan rijden komt dubbel zo vaak voor, zodat ook kleine trucks werk blijven vinden.
  const fleet = new Set(S.trucks.flatMap(t => TRUCK_TYPES[t.type].cargo));
  const entries = Object.entries({ pakketten: 1, pallets: 1, ...CITIES[from].cargo })
    .filter(([k]) => !(k === 'containers' && strike))
    .map(([k, w]) => [k, fleet.has(k) ? w * 2 : w]);
  const unlocked = entries.filter(([k]) => CARGO[k].level <= S.level);
  let cargo = weighted(entries);
  // Vergrendelde vracht verschijnt soms als 'teaser', maar meestal kies je iets wat je kunt rijden.
  if (CARGO[cargo].level > S.level && Math.random() > 0.25) cargo = weighted(unlocked.length ? unlocked : [['pakketten', 1]]);

  const to = weighted(Object.keys(CITIES).filter(id => id !== from).map(id => [id, 1 / (1 + route(from, id).km / 140)]));
  const C = CARGO[cargo];
  const km = route(from, to).km;
  let weight = rand(C.min, C.max);
  weight = weight < 3 ? Math.round(weight * 10) / 10 : Math.round(weight);
  const payout = Math.round((C.base + weight * km * C.rate) * rand(0.88, 1.15) * (1 + 0.03 * (S.level - 1)) * cargoBoost(cargo) / 5) * 5;
  const driveH = km / 80;
  const deadline = S.time + (driveH + C.loadH * 2 + Math.floor(driveH / 9) * REST_HOURS) * C.urgency + 4;
  const c = { id: S.nextId++, from, to, cargo, weight, km, payout, deadline, expires: S.time + rand(8, 16) };
  S.contracts.push(c);
  hooks.changed();
  return c;
}

// ---------- gebeurtenissen --------------------------------------------------
const EVENT_DEFS = [
  { w: 3, make: () => { const c = pick(Object.keys(CITIES)); return { icon: '🚧', title: `Zware file rond ${cityName(c)}`, desc: 'Trucks rijden daar flink trager.', dur: rand(6, 12), slowCity: c }; } },
  { w: 2, make: () => { const d = rand(0.2, 0.4); S.diesel = clamp(S.diesel + d, 1.35, 2.6); return { icon: '⛽', title: 'Dieselprijs schiet omhoog', desc: `+€ ${d.toFixed(2).replace('.', ',')} per liter door onrust op de oliemarkt.` }; } },
  { w: 2, make: () => { const d = rand(0.15, 0.3); S.diesel = clamp(S.diesel - d, 1.35, 2.6); return { icon: '⛽', title: 'Dieselprijs zakt', desc: `−€ ${d.toFixed(2).replace('.', ',')} per liter. Tanken maar!` }; } },
  { w: 1.5, make: () => { const c = pick(['antwerpen', 'rotterdam', 'brugge']); return { icon: '✊', title: `Havenstaking in ${cityName(c)}`, desc: 'Geen nieuwe containervracht uit deze haven.', dur: rand(12, 24), strike: c }; } },
  { w: 1.5, make: () => ({ icon: '🌡️', title: 'Hittegolf!', desc: 'Nieuwe koelvracht betaalt 50% meer.', dur: 24, boost: { koel: 1.5 } }) },
  { w: 1.5, make: () => ({ icon: '🛍️', title: 'Black Friday-piek', desc: 'Nieuwe pakketvracht betaalt 40% meer.', dur: 24, boost: { pakketten: 1.4 } }) },
  { w: 1, make: () => ({ icon: '🏗️', title: 'Bouwboom', desc: 'Nieuwe bulkvracht betaalt 40% meer.', dur: 24, boost: { bulk: 1.4 } }) },
  { w: 1.5, make: () => {
    const driving = S.trucks.filter(t => t.state === 'delivering' || t.state === 'toPickup');
    if (!driving.length) return null;
    const t = pick(driving); const fine = randInt(15, 45) * 10;
    spend(fine, t);
    return { icon: '📸', title: `Flitsboete voor ${t.plate}`, desc: `${t.driver} reed te snel: ${fmtMoney(fine)} boete.` };
  } },
  { w: 1, make: () => { const b = Math.round(1500 * S.level / 100) * 100; S.money += b; return { icon: '🏛️', title: 'Vergroeningspremie', desc: `De overheid steunt je vloot met ${fmtMoney(b)}.` }; } },
];

function triggerEvent() {
  const ev = weighted(EVENT_DEFS.map(d => [d, d.w])).make();
  if (!ev) return;
  if (ev.dur) { ev.endsAt = S.time + ev.dur; S.events.push(ev); }
  log(`${ev.icon} ${ev.title} — ${ev.desc}`);
  toast(`${ev.icon} ${ev.title}`, 'event');
  hooks.events();
}

// ---------- planner ---------------------------------------------------------
export function autoDispatch() {
  for (const t of S.trucks) {
    if (t.state !== 'idle') continue;
    let best = null;
    for (const c of S.contracts) {
      if (!canCarry(t, c)) continue;
      const e = estimate(t, c);
      if (!e.onTime || e.profit <= 0) continue;
      if (!best || e.perHour > best.e.perHour) best = { c, e };
    }
    if (best) assign(t, best.c);
  }
}

// ---------- hoofdlus --------------------------------------------------------
export function tick(dt) {
  S.time += dt;

  while (S.time >= S.nextDieselAt) {
    S.diesel = clamp(S.diesel + (1.75 - S.diesel) * 0.05 + rand(-0.03, 0.03), 1.35, 2.6);
    S.nextDieselAt += 1;
  }

  if (S.time >= S.nextContractAt) {
    if (S.contracts.length < boardMax()) genContract();
    S.nextContractAt = S.time + rand(0.6, 1.4) / (1 + 0.45 * (S.depots.length - 1)) * (up('beurs') ? 0.75 : 1);
  }
  const before = S.contracts.length;
  S.contracts = S.contracts.filter(c => c.expires > S.time);
  if (S.contracts.length !== before) hooks.changed();

  const evBefore = S.events.length;
  S.events = S.events.filter(e => e.endsAt > S.time);
  if (S.events.length !== evBefore) hooks.events();
  if (S.time >= S.nextEventAt) { triggerEvent(); S.nextEventAt = S.time + rand(14, 30); }

  for (const t of S.trucks) updateTruck(t, dt);

  if (up('planner') && S.plannerOn && S.time >= S.nextDispatchAt) {
    autoDispatch();
    S.nextDispatchAt = S.time + 0.25;
  }
}

// Echte tijd (ms) in één keer doorrekenen: offline voortgang of een tabblad dat op de achtergrond stond.
export function simulate(ms) {
  const before = { money: S.money, deliveries: S.stats.deliveries, level: S.level };
  let h = Math.min(ms, MAX_OFFLINE_MS) / GAME_HOUR_MS;
  const hours = h;
  quiet = true;
  try {
    while (h > 0) { const step = Math.min(0.2, h); tick(step); h -= step; }
  } finally {
    quiet = false;
  }
  checkGoals();
  hooks.changed();
  hooks.events();
  return { hours, money: S.money - before.money, deliveries: S.stats.deliveries - before.deliveries, levels: S.level - before.level };
}

export function currentGoal() {
  return GOALS.find(g => !S.goalsDone.includes(g.id)) || null;
}

export function checkGoals() {
  for (const g of GOALS) {
    if (S.goalsDone.includes(g.id) || !g.check(S, { companyValue })) continue;
    S.goalsDone.push(g.id);
    S.money += g.reward;
    log(`🎯 Doel behaald: ${g.text}. Beloning ${fmtMoney(g.reward)}!`);
    toast(`🎯 Doel behaald! +${fmtMoney(g.reward)}`, 'level');
  }
}

// ---------- acties (geven true terug als het gelukt is) ---------------------
export function buyTruck(type, city) {
  const T = TRUCK_TYPES[type];
  if (!T || !S.depots.includes(city) || S.level < T.level || S.money < T.price) return null;
  S.money -= T.price;
  const t = addTruck(type, city);
  log(`🛒 Nieuwe ${T.name.toLowerCase()} ${t.plate} gekocht in ${cityName(city)}. Chauffeur: ${t.driver}.`);
  toast(`${T.icon} ${T.name} gekocht! Welkom, ${t.driver}.`, 'good');
  checkGoals();
  return t;
}

export function repairTruck(t) {
  const cost = repairCost(t);
  if (t.state !== 'idle' || S.money < cost) return false;
  spend(cost);
  t.cond = 100;
  log(`🔧 ${t.plate} is onderhouden voor ${fmtMoney(cost)}.`);
  return true;
}

export function sellTruck(t) {
  if (t.state !== 'idle' || S.trucks.length <= 1) return false;
  const v = sellValue(t);
  S.money += v;
  S.trucks = S.trucks.filter(x => x !== t);
  log(`💸 ${t.plate} verkocht voor ${fmtMoney(v)}. ${t.driver} zoekt een nieuwe uitdaging.`);
  return true;
}

export function buildDepot(city) {
  const price = depotPrice();
  if (!CITIES[city] || S.depots.includes(city) || S.money < price) return false;
  S.money -= price;
  S.depots.push(city);
  log(`🏭 Nieuw depot geopend in ${cityName(city)}! Er komt meer vracht uit de regio.`);
  toast(`🏭 Depot geopend in ${cityName(city)}`, 'good');
  hooks.cities();
  checkGoals();
  return true;
}

export function buyUpgrade(id) {
  const u = UPGRADES.find(x => x.id === id);
  if (!u || S.upgrades[id] || S.level < u.level || S.money < u.price) return false;
  S.money -= u.price;
  S.upgrades[id] = true;
  log(`${u.icon} ${u.name} aangekocht.`);
  toast(`${u.icon} ${u.name} actief!`, 'good');
  checkGoals();
  return true;
}

// ---------- opslaan ---------------------------------------------------------
const storage = () => (typeof localStorage !== 'undefined' ? localStorage : null);

export function save() {
  S.savedAt = Date.now();
  try { storage()?.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* opslag niet beschikbaar */ }
}

export function load() {
  try {
    const raw = storage()?.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s || s.v !== 1 || !Array.isArray(s.trucks)) return false;
    const d = defaults();
    S = { ...d, ...s, stats: { ...d.stats, ...s.stats } };
    return true;
  } catch (e) {
    return false;
  }
}

export function wipeSave() {
  try { storage()?.removeItem(SAVE_KEY); } catch (e) { /* */ }
}
