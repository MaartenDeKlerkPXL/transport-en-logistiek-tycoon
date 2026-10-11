// ---------------------------------------------------------------------------
// Vrachtbaas — speldata. Alle balans-getallen staan hier zodat je makkelijk
// kunt tunen zonder de spel-logica aan te raken.
// ---------------------------------------------------------------------------

// Steden. `cargo` = welke vracht hier vaak vertrekt (gewicht = kans).
// `lp` = positie van het label op de kaart (r, l, t, b).
export const CITIES = {
  antwerpen: { name: 'Antwerpen', country: 'BE', lat: 51.22, lon: 4.40, port: true, lp: 'r', cargo: { containers: 4, adr: 3, pallets: 3, pakketten: 1 } },
  gent:      { name: 'Gent',      country: 'BE', lat: 51.05, lon: 3.72, lp: 'b', cargo: { pallets: 3, bulk: 3, koel: 1, pakketten: 1 } },
  brugge:    { name: 'Zeebrugge', country: 'BE', lat: 51.27, lon: 3.20, port: true, lp: 't', cargo: { containers: 3, koel: 3, pallets: 1 } },
  brussel:   { name: 'Brussel',   country: 'BE', lat: 50.85, lon: 4.35, lp: 'r', cargo: { pakketten: 4, pallets: 2, koel: 1 } },
  hasselt:   { name: 'Hasselt',   country: 'BE', lat: 50.93, lon: 5.34, lp: 'r', cargo: { koel: 3, pallets: 2, pakketten: 1 } },
  luik:      { name: 'Luik',      country: 'BE', lat: 50.63, lon: 5.57, lp: 'r', cargo: { bulk: 3, pakketten: 3, pallets: 1 } },
  namen:     { name: 'Namen',     country: 'BE', lat: 50.47, lon: 4.87, lp: 'r', cargo: { bulk: 3, pallets: 2 } },
  rotterdam: { name: 'Rotterdam', country: 'NL', lat: 51.92, lon: 4.48, port: true, lp: 'l', cargo: { containers: 5, adr: 3, pallets: 1 } },
  amsterdam: { name: 'Amsterdam', country: 'NL', lat: 52.37, lon: 4.90, lp: 'r', cargo: { koel: 3, pakketten: 2, pallets: 1 } },
  eindhoven: { name: 'Eindhoven', country: 'NL', lat: 51.44, lon: 5.47, lp: 'r', cargo: { pakketten: 3, pallets: 2, adr: 1 } },
  lille:     { name: 'Rijsel',    country: 'FR', lat: 50.63, lon: 3.06, lp: 'l', cargo: { pallets: 3, pakketten: 1, koel: 1 } },
  parijs:    { name: 'Parijs',    country: 'FR', lat: 48.86, lon: 2.35, lp: 'r', cargo: { pakketten: 3, koel: 2, pallets: 2 } },
  keulen:    { name: 'Keulen',    country: 'DE', lat: 50.94, lon: 6.96, lp: 'r', cargo: { pallets: 3, adr: 2, bulk: 1 } },
  luxemburg: { name: 'Luxemburg', country: 'LU', lat: 49.61, lon: 6.13, lp: 'r', cargo: { pakketten: 3, bulk: 1, adr: 1 } },
};

// Wegennet: [stad A, stad B, wegnummer]
export const ROADS = [
  ['antwerpen', 'rotterdam', 'E19'],
  ['antwerpen', 'brussel', 'E19'],
  ['antwerpen', 'gent', 'E17'],
  ['antwerpen', 'eindhoven', 'E34'],
  ['antwerpen', 'hasselt', 'E313'],
  ['hasselt', 'luik', 'E313'],
  ['gent', 'brugge', 'E40'],
  ['gent', 'brussel', 'E40'],
  ['gent', 'lille', 'E17'],
  ['brugge', 'lille', 'E403'],
  ['brussel', 'luik', 'E40'],
  ['brussel', 'namen', 'E411'],
  ['brussel', 'lille', 'A8'],
  ['brussel', 'parijs', 'E19'],
  ['namen', 'luik', 'E42'],
  ['namen', 'luxemburg', 'E411'],
  ['lille', 'parijs', 'A1'],
  ['luik', 'keulen', 'E40'],
  ['luik', 'luxemburg', 'E25'],
  ['luik', 'eindhoven', 'A2'],
  ['eindhoven', 'rotterdam', 'A16'],
  ['eindhoven', 'keulen', 'A67'],
  ['eindhoven', 'amsterdam', 'A2'],
  ['rotterdam', 'amsterdam', 'A4'],
  ['keulen', 'luxemburg', 'A1'],
  ['luxemburg', 'parijs', 'A4'],
];

// Voertuigen. fuel = liter/100 km, wear = % slijtage per km, wage = chauffeursloon €/u.
export const TRUCK_TYPES = {
  bestel:    { name: 'Bestelwagen',      icon: '🚐', price: 9000,   capacity: 1.5, speed: 95, fuel: 9,  wear: 0.006,  wage: 20, cargo: ['pakketten'], level: 1, color: '#0b6fb0' },
  bak:       { name: 'Bakwagen',         icon: '🚚', price: 22000,  capacity: 12,  speed: 85, fuel: 18, wear: 0.005,  wage: 24, cargo: ['pakketten', 'pallets'], level: 2, color: '#2e7d32' },
  trekker:   { name: 'Trekker + huif',   icon: '🚛', price: 60000,  capacity: 24,  speed: 80, fuel: 29, wear: 0.0045, wage: 27, cargo: ['pallets', 'bulk'], level: 3, color: '#c25100' },
  koel:      { name: 'Koeltrailer',      icon: '❄️', price: 75000,  capacity: 22,  speed: 80, fuel: 33, wear: 0.0045, wage: 28, cargo: ['koel', 'pallets'], level: 4, color: '#00838f' },
  container: { name: 'Containerchassis', icon: '🚢', price: 100000, capacity: 28,  speed: 78, fuel: 31, wear: 0.0045, wage: 28, cargo: ['containers'], level: 6, color: '#6a1b9a' },
  tank:      { name: 'Tankwagen (ADR)',  icon: '🛢️', price: 140000, capacity: 26,  speed: 75, fuel: 32, wear: 0.004,  wage: 34, cargo: ['adr'], level: 8, color: '#c62828' },
};

// Vrachttypes. Vergoeding = (base + ton × km × rate). urgency = hoeveel speling op de deadline.
export const CARGO = {
  pakketten:  { name: 'Pakketten',          icon: '📦', min: 0.3, max: 1.5, rate: 2.4,  base: 90,  level: 1, loadH: 0.4, urgency: 1.5 },
  pallets:    { name: 'Pallets',            icon: '🧱', min: 2,   max: 22,  rate: 0.55, base: 200, level: 2, loadH: 1.0, urgency: 1.8 },
  bulk:       { name: 'Bulk (staal/zand)',  icon: '⛏️', min: 14,  max: 24,  rate: 0.36, base: 240, level: 3, loadH: 1.2, urgency: 2.2 },
  koel:       { name: 'Koelvracht',         icon: '🍓', min: 5,   max: 22,  rate: 0.68, base: 350, level: 4, loadH: 1.0, urgency: 1.4 },
  containers: { name: 'Containers',         icon: '🚢', min: 12,  max: 28,  rate: 0.6,  base: 400, level: 6, loadH: 0.8, urgency: 1.7 },
  adr:        { name: 'Gevaarlijke stoffen', icon: '☣️', min: 10,  max: 26,  rate: 0.85, base: 650, level: 8, loadH: 1.5, urgency: 1.8 },
};

export const UPGRADES = [
  { id: 'planner',    icon: '🧑‍💼', name: 'Planningsafdeling',  price: 30000,  level: 2, desc: 'Een planner wijst automatisch de meest winstgevende vracht toe aan stilstaande trucks — ook als je offline bent.' },
  { id: 'eco',        icon: '🌱', name: 'Eco-rijtraining',     price: 20000,  level: 2, desc: 'Je chauffeurs rijden zuiniger: 15% minder dieselverbruik.' },
  { id: 'garage',     icon: '🔧', name: 'Eigen werkplaats',    price: 45000,  level: 3, desc: '40% minder slijtage. Trucks onder 50% conditie worden automatisch onderhouden als ze stilstaan.' },
  { id: 'track',      icon: '📡', name: 'Track & Trace',       price: 60000,  level: 4, desc: 'Klanten volgen hun zending live en betalen 10% meer per levering.' },
  { id: 'beurs',      icon: '📋', name: 'Premium vrachtbeurs', price: 75000,  level: 5, desc: '+5 plaatsen op de vrachtbeurs en 25% sneller nieuw aanbod.' },
  { id: 'duo',        icon: '👥', name: 'Dubbele bemanning',   price: 120000, level: 6, desc: 'Twee chauffeurs per truck: tot 18 uur rijden voor een verplichte rust.' },
  { id: 'telematica', icon: '🛰️', name: 'Telematica',          price: 150000, level: 7, desc: '+8% snelheid door slimme routes. Files vertragen je nog maar 25%.' },
];

export const DEPOT_BASE_PRICE = 20000;

// Doelen. check(s) → true als behaald; progress(s) → [huidig, doel] (optioneel).
export const GOALS = [
  { id: 'g1',  text: 'Lever 5 vrachten af', reward: 2000, check: s => s.stats.deliveries >= 5, progress: s => [s.stats.deliveries, 5] },
  { id: 'g2',  text: 'Koop een tweede voertuig', reward: 3000, check: s => s.trucks.length >= 2, progress: s => [s.trucks.length, 2] },
  { id: 'g3',  text: 'Bereik niveau 2 en koop een bakwagen', reward: 5000, check: s => s.trucks.some(t => t.type === 'bak') },
  { id: 'g4',  text: 'Open een tweede depot', reward: 8000, check: s => s.depots.length >= 2, progress: s => [s.depots.length, 2] },
  { id: 'g5',  text: 'Neem een planner in dienst', reward: 10000, check: s => !!s.upgrades.planner },
  { id: 'g6',  text: 'Lever een vracht af in Parijs', reward: 15000, check: s => !!s.visited.parijs },
  { id: 'g7',  text: 'Bouw je vloot uit tot 10 voertuigen', reward: 25000, check: s => s.trucks.length >= 10, progress: s => [s.trucks.length, 10] },
  { id: 'g8',  text: 'Koop een koeltrailer', reward: 20000, check: s => s.trucks.some(t => t.type === 'koel') },
  { id: 'g9',  text: 'Open depots in 4 verschillende landen', reward: 60000, check: s => new Set(s.depots.map(d => CITIES[d].country)).size >= 4, progress: s => [new Set(s.depots.map(d => CITIES[d].country)).size, 4] },
  { id: 'g10', text: 'Lever 500 vrachten af', reward: 75000, check: s => s.stats.deliveries >= 500, progress: s => [s.stats.deliveries, 500] },
  { id: 'g11', text: 'Koop een ADR-tankwagen', reward: 50000, check: s => s.trucks.some(t => t.type === 'tank') },
  { id: 'g12', text: 'Bereik een bedrijfswaarde van € 2.000.000', reward: 250000, check: (s, api) => api.companyValue() >= 2e6 },
];

export const DRIVER_NAMES = [
  'Jos', 'Marc', 'Kevin', 'Sofie', 'Ilse', 'Dirk', 'Fatima', 'Mohamed', 'Lotte', 'Wim', 'Bart', 'Annelies',
  'Joris', 'Kristof', 'Yusuf', 'Nathalie', 'Rudy', 'Gert', 'Eline', 'Pieter', 'Jelle', 'Hanne', 'Sven',
  'Nadia', 'Tom', 'Ruben', 'Lieve', 'Patrick', 'Jana', 'Karim', 'Stijn', 'Ward', 'Femke', 'Bram', 'Noor',
  'Luc', 'Inge', 'Mehmet', 'Dries', 'Tine', 'Frank', 'Ayoub', 'Kaat', 'Jef', 'Greet', 'Senne', 'Mila',
];

// --- Kaartgeometrie (vereenvoudigd) [lat, lon] -----------------------------
export const COAST = [
  [49.0, -8], [49.4, 0.2], [49.9, 1.0], [50.2, 1.55], [50.73, 1.6], [50.95, 1.85], [51.04, 2.37], [51.12, 2.6], [51.23, 2.92],
  [51.35, 3.3], [51.42, 3.45], [51.45, 3.58], [51.6, 3.68], [51.75, 3.85], [51.98, 4.12], [52.1, 4.27],
  [52.45, 4.57], [52.95, 4.72], [53.5, 5.0], [56, 5.0], [56, -8],
];
export const LAKES = [
  [[52.37, 5.03], [52.45, 5.08], [52.52, 5.25], [52.48, 5.5], [52.6, 5.65], [52.8, 5.55], [52.9, 5.2], [52.8, 5.05], [52.55, 5.02]],
];
export const BORDERS = [
  // BE–FR
  [[51.09, 2.55], [50.8, 2.9], [50.7, 3.2], [50.5, 3.65], [50.3, 4.2], [49.95, 4.4], [50.1, 4.85], [49.8, 4.85], [49.55, 5.45]],
  // BE–LU
  [[49.55, 5.45], [49.8, 5.75], [50.13, 6.13]],
  // BE–DE
  [[50.13, 6.13], [50.35, 6.4], [50.75, 6.02]],
  // BE–NL
  [[50.75, 6.02], [50.75, 5.68], [51.0, 5.75], [51.2, 5.55], [51.3, 5.1], [51.45, 4.85], [51.4, 4.4], [51.27, 4.25], [51.37, 3.37]],
  // NL–DE
  [[50.75, 6.02], [51.0, 6.1], [51.2, 6.1], [51.5, 6.2], [51.85, 5.95], [51.85, 6.7], [52.2, 7.05], [52.65, 6.75], [53.3, 7.2]],
  // LU–DE / LU–FR
  [[50.13, 6.13], [49.8, 6.5], [49.47, 6.37], [49.5, 5.8], [49.55, 5.45]],
  // FR–DE
  [[49.47, 6.37], [49.2, 6.9], [49.15, 7.5]],
];
export const COUNTRY_LABELS = [
  { text: 'BELGIË', lat: 50.2, lon: 5.15 },
  { text: 'NEDERLAND', lat: 52.1, lon: 5.75 },
  { text: 'FRANKRIJK', lat: 49.35, lon: 3.7 },
  { text: 'DUITSLAND', lat: 51.55, lon: 6.95 },
  { text: 'LUX.', lat: 49.95, lon: 6.32 },
  { text: 'NOORDZEE', lat: 52.2, lon: 2.9, sea: true },
];
