// Unit tests voor de spellogica: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/logic.js';
import { CITIES, TRUCK_TYPES } from '../js/data.js';

// voorspelbaar toeval
let seed = 1;
Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function makeStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}

// laat de tijd lopen tot cond() waar is (of max uren)
function runUntil(cond, maxHours = 200, step = 0.1) {
  for (let h = 0; h < maxHours; h += step) {
    if (cond()) return true;
    L.tick(step);
  }
  return cond();
}

// maak een opdracht op maat en zet ze op de beurs
function contract(from, to, cargo = 'pakketten', weight = 1, extra = {}) {
  const c = { id: L.S.nextId++, from, to, cargo, weight, km: L.route(from, to).km, payout: 500, deadline: L.S.time + 100, expires: L.S.time + 100, ...extra };
  L.S.contracts.push(c);
  return c;
}

beforeEach(() => {
  seed = 1;
  L.newGame();
  L.S.nextEventAt = Infinity;      // geen toevallige gebeurtenissen tijdens tests
  L.S.nextContractAt = Infinity;
});

test('nieuw spel: startgeld, één bestelwagen en vracht uit het netwerk', () => {
  const S = L.S;
  assert.equal(S.money, L.START_MONEY);
  assert.equal(S.trucks.length, 1);
  assert.equal(S.trucks[0].type, 'bestel');
  assert.equal(S.trucks[0].city, 'antwerpen');
  assert.equal(S.contracts.length, 5);
  const net = L.networkCities();
  for (const c of S.contracts) {
    assert.ok(net.has(c.from), `${c.from} ligt in het netwerk`);
    assert.notEqual(c.from, c.to);
    assert.ok(c.payout > 0 && c.deadline > S.time);
  }
});

test('wegennet: alle steden bereikbaar en routes zijn symmetrisch', () => {
  const ids = Object.keys(CITIES);
  for (const a of ids) for (const b of ids) {
    const r = L.route(a, b);
    assert.equal(r.path[0], a);
    assert.equal(r.path.at(-1), b);
    assert.ok(Math.abs(r.km - L.route(b, a).km) < 1e-6, `${a}↔${b}`);
  }
  const ap = L.route('antwerpen', 'parijs');
  assert.ok(ap.path.includes('brussel'), 'Antwerpen → Parijs via Brussel');
  assert.ok(ap.km > 300 && ap.km < 450, `realistische afstand (${Math.round(ap.km)} km)`);
});

test('volledige rit: leeg naar ophaalpunt, laden, leveren, betaald worden', () => {
  const t = L.S.trucks[0];
  const c = contract('gent', 'brussel');
  assert.ok(L.assign(t, c));
  assert.equal(t.state, 'toPickup');
  assert.ok(!L.S.contracts.includes(c), 'opdracht verdwijnt van de beurs');
  const money0 = L.S.money;
  assert.ok(runUntil(() => t.state === 'delivering'), 'truck vertrekt geladen');
  assert.ok(runUntil(() => t.state === 'idle'), 'truck levert af');
  assert.equal(t.city, 'brussel');
  assert.equal(L.S.stats.deliveries, 1);
  assert.ok(L.S.money > money0 + 300, 'winst na aftrek van diesel en loon');
  assert.ok(L.S.money < money0 + 500, 'kosten werden aangerekend');
  assert.ok(t.cond < 100, 'slijtage');
  assert.ok(L.S.visited.brussel);
});

test('te laat leveren levert maar 60% op', () => {
  const t = L.S.trucks[0];
  const c = contract('antwerpen', 'parijs', 'pakketten', 1, { deadline: L.S.time + 1, payout: 1000 });
  L.assign(t, c);
  const income0 = L.S.stats.income;
  runUntil(() => t.state === 'idle');
  assert.equal(L.S.stats.late, 1);
  assert.ok(Math.abs(L.S.stats.income - income0 - 600) < 1e-6);
});

test('geschiktheid: bestelwagen neemt geen pallets, vergrendelde vracht kan niet', () => {
  const van = L.S.trucks[0];
  assert.equal(L.canCarry(van, { cargo: 'pallets', weight: 2 }), false);
  assert.equal(L.canCarry(van, { cargo: 'pakketten', weight: 1.4 }), true);
  assert.equal(L.canCarry(van, { cargo: 'pakketten', weight: 2 }), false, 'te zwaar');
  const c = contract('antwerpen', 'gent', 'pallets', 5);
  assert.equal(L.assign(van, c), false);
});

test('tachograaf: na 9 uur rijden volgt een verplichte rust', () => {
  const t = L.S.trucks[0];
  t.driveHours = 8.9;
  L.assign(t, contract('antwerpen', 'parijs'));
  runUntil(() => t.state === 'loading', 5);
  runUntil(() => t.state === 'resting', 5);
  assert.equal(t.state, 'resting');
  assert.ok(runUntil(() => t.state === 'delivering', 12), 'rijdt verder na de rust');
});

test('kopen: niveau, geld en depot zijn nodig', () => {
  const S = L.S;
  S.money = 1e6;
  assert.equal(L.buyTruck('bak', 'antwerpen'), null, 'bakwagen vraagt niveau 2');
  assert.equal(L.buyTruck('bestel', 'gent'), null, 'geen depot in Gent');
  assert.ok(L.buyTruck('bestel', 'antwerpen'));
  S.level = 2;
  const t = L.buyTruck('bak', 'antwerpen');
  assert.ok(t && t.type === 'bak');
  assert.equal(S.money, 1e6 - TRUCK_TYPES.bestel.price - TRUCK_TYPES.bak.price + 3000 + 5000, 'met doelbeloningen g2 en g3');
});

test('depots: prijs verdubbelt en het netwerk groeit', () => {
  const S = L.S;
  S.money = 1e6;
  const before = L.networkCities().size;
  const p1 = L.depotPrice();
  assert.ok(L.buildDepot('luik'));
  assert.equal(L.depotPrice(), p1 * 2);
  assert.ok(L.networkCities().size > before);
  assert.equal(L.buildDepot('luik'), false, 'niet twee keer');
});

test('planner wijst vrije trucks automatisch toe', () => {
  const S = L.S;
  S.level = 2; S.money = 1e6;
  assert.ok(L.buyUpgrade('planner'));
  S.contracts = [];
  const c = contract('antwerpen', 'gent');
  L.tick(0.1);
  assert.equal(S.trucks[0].job?.id, c.id);
});

test('opslaan en laden', () => {
  globalThis.localStorage = makeStorage();
  L.S.money = 12345;
  L.save();
  L.newGame();
  assert.ok(L.load());
  assert.equal(L.S.money, 12345);
  assert.equal(L.S.trucks.length, 1);
  delete globalThis.localStorage;
});

test('balans: met planner en een kleine vloot verdien je geld', () => {
  const S = L.S;
  S.level = 3; S.money = 1e6;
  L.buyUpgrade('planner');
  L.buyTruck('bestel', 'antwerpen');
  L.buyTruck('bak', 'antwerpen');
  L.buyTruck('trekker', 'antwerpen');
  S.nextContractAt = S.time;
  S.nextEventAt = S.time + 20;
  const money0 = S.money;
  const r = L.simulate(10 * 60 * 1000);   // 10 echte minuten = 10 speldagen
  assert.ok(r.deliveries > 30, `${r.deliveries} leveringen`);
  assert.ok(S.money > money0, `winst: ${Math.round(S.money - money0)}`);
});

test('doelen geven een beloning', () => {
  L.S.stats.deliveries = 5;
  const m = L.S.money;
  L.checkGoals();
  assert.ok(L.S.goalsDone.includes('g1'));
  assert.equal(L.S.money, m + 2000);
});

test('rit annuleren: opdracht terug op de beurs, truck rijdt leeg door en staat dan klaar', () => {
  const t = L.S.trucks[0];
  const c = contract('gent', 'brussel');
  L.assign(t, c);
  L.tick(0.1);
  assert.ok(L.cancelJob(t));
  assert.equal(t.job, null);
  assert.ok(L.S.contracts.some(x => x.id === c.id), 'opdracht staat terug op de beurs');
  assert.ok(runUntil(() => t.state === 'idle'));
  assert.equal(t.city, 'gent');
  assert.equal(L.cancelJob(t), false, 'niets te annuleren als de truck klaarstaat');
});

test('winst per dag verschijnt na één speldag', () => {
  assert.equal(L.profitPerDay(), null);
  for (let i = 0; i < 260; i++) L.tick(0.1);
  assert.equal(typeof L.profitPerDay(), 'number');
});

test('geen flitsboetes: je rijdt niet zelf', () => {
  L.assign(L.S.trucks[0], contract('antwerpen', 'parijs'));
  for (let i = 0; i < 300; i++) {
    L.S.nextEventAt = L.S.time;
    L.tick(0.01);
  }
  assert.ok(!L.S.log.some(e => /boete/i.test(e.text)));
});
