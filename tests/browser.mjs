// Speltest in een echte browser: npm run test:browser
// Bouwt het spel, start een server en speelt een stukje: vracht toewijzen, leveren, truck kopen,
// depot openen, opslaan en herladen. Faalt bij elke JavaScript-fout.
// Chromium: zet CHROMIUM_PATH als hij niet op de standaardplek staat.
import { build, preview } from 'vite';
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';

const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']
  .find(p => existsSync(p));
if (!exe) { console.log('Geen Chromium gevonden: zet CHROMIUM_PATH. Test overgeslagen.'); process.exit(0); }

await build({ logLevel: 'warn' });
const server = await preview({ preview: { port: 4322, strictPort: false } });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath: exe });
const errors = [];
const ok = (cond, msg) => { if (!cond) errors.push('MISLUKT: ' + msg); console.log((cond ? '✓ ' : '✗ ') + msg); };
const shots = process.env.SCREENSHOTS;

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(url);   // nieuwe browsercontext = lege opslag = nieuw spel
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => VB.S.trucks.length === 1 && VB.S.contracts.length >= 5), 'spel start met één truck en vracht');
  ok(await page.isVisible('#modal:not([hidden])'), 'uitleg zichtbaar bij een nieuw spel');
  if (shots) await page.screenshot({ path: `${shots}/1-intro.png` });
  await page.click('#modal [data-action="close-modal"]');
  ok(await page.evaluate(() => document.querySelectorAll('#map .city').length === 14), 'kaart toont 14 steden');

  // vracht toewijzen via de knoppen
  await page.evaluate(() => { VB.S.nextEventAt = 1e9; });
  await page.click('#tab-body [data-action="assign-contract"]');
  await page.waitForSelector('#modal [data-action="pick"]');
  if (shots) await page.screenshot({ path: `${shots}/2-toewijzen.png` });
  await page.click('#modal [data-action="pick"]');
  ok(await page.evaluate(() => VB.S.trucks[0].state !== 'idle'), 'truck vertrekt na toewijzen');

  // snel vooruit tot de levering
  await page.click('#speed [data-speed="4"]');
  await page.waitForFunction(() => VB.S.stats.deliveries >= 1, null, { timeout: 30000 });
  ok(true, 'vracht geleverd');

  // truck kopen
  await page.evaluate(() => { VB.S.money = 500000; VB.S.level = 3; });
  await page.click('#tabs [data-tab="vloot"]');
  await page.waitForTimeout(300);
  await page.click('#tab-body [data-action="buy-truck"][data-id="trekker"]');
  ok(await page.evaluate(() => VB.S.trucks.some(t => t.type === 'trekker')), 'trekker gekocht');
  if (shots) await page.screenshot({ path: `${shots}/3-vloot.png` });

  // depot openen via de kaart
  await page.click('#map .city[data-id="luik"]');
  await page.click('#modal [data-action="build-depot"]');
  ok(await page.evaluate(() => VB.S.depots.includes('luik')), 'depot geopend in Luik');

  // alle tabbladen tekenen zonder fouten
  for (const tab of ['netwerk', 'upgrades', 'logboek', 'vracht']) {
    await page.click(`#tabs [data-tab="${tab}"]`);
    await page.waitForTimeout(150);
    if (shots) await page.screenshot({ path: `${shots}/tab-${tab}.png` });
  }
  ok(true, 'alle tabbladen werken');

  // fps
  const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); }));
  ok(fps > 20, `vloeiend genoeg (${fps} fps)`);

  // opslaan en herladen
  const money = await page.evaluate(() => { VB.logic.save(); return VB.S.money; });
  await page.reload();
  await page.waitForTimeout(400);
  ok(await page.evaluate(m => Math.abs(VB.S.money - m) < 5000 && VB.S.depots.includes('luik'), money), 'voortgang blijft bewaard na herladen');

  // gsm-formaat
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  phone.on('pageerror', e => errors.push(e.message));
  await phone.goto(url);
  await phone.waitForTimeout(400);
  const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok(!overflow, 'geen horizontaal scrollen op gsm');
  if (shots) { await phone.click('#modal [data-action="close-modal"]').catch(() => {}); await phone.screenshot({ path: `${shots}/gsm.png`, fullPage: false }); }
} finally {
  await browser.close();
  server.httpServer.close();
}

if (errors.length) { console.error('\n' + errors.join('\n')); process.exit(1); }
console.log('\nAlles in orde.');
process.exit(0);
