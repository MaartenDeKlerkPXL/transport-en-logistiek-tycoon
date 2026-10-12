// Speltest in een echte browser: npm run test:browser
// Bouwt het spel, start een server en speelt een stukje: rit plannen, leveren, truck kopen,
// depot openen via de kaart, toetsenbordbediening, opslaan en herladen. Faalt bij elke JavaScript-fout.
// Chromium: zet CHROMIUM_PATH als hij niet op de standaardplek staat. SCREENSHOTS=map bewaart schermafbeeldingen.
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
const shot = async (page, name) => { if (shots) await page.screenshot({ path: `${shots}/${name}.png` }); };

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => { errors.push('onverwachte pop-up: ' + d.message()); d.dismiss(); });

  await page.goto(url);   // nieuwe browsercontext = lege opslag = nieuw spel
  await page.waitForTimeout(500);
  await page.evaluate(() => { VB.S.nextEventAt = 1e9; });
  ok(await page.evaluate(() => VB.S.trucks.length === 1 && VB.S.contracts.length >= 5), 'spel start met één truck en vracht');
  ok(await page.isVisible('text=Welkom, nieuwe vrachtbaas'), 'uitleg staat inline bovenaan de vrachtbeurs');
  ok(await page.evaluate(() => document.querySelectorAll('#map .city').length === 14), 'kaart toont 14 steden');
  await shot(page, '1-start');
  await page.click('[data-action="dismiss-intro"]');

  // rit plannen: kaart klapt open, truck kiezen
  await page.click('#tab-body [data-action="toggle-contract"]');
  await page.waitForSelector('#tab-body .options [data-action="pick"]');
  ok(await page.evaluate(() => document.querySelector('#route-hl').children.length > 0), 'route verschijnt op de kaart');
  await shot(page, '2-plan-rit');
  await page.click('#tab-body .options [data-action="pick"]');
  ok(await page.evaluate(() => VB.S.trucks[0].state !== 'idle'), 'truck vertrekt na kiezen');

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
  await page.click('#speed [data-speed="0"]');
  await page.waitForTimeout(300);
  await shot(page, '3-vloot');

  // verkopen vraagt een tweede klik (geen pop-up)
  const sellArm = page.locator('#tab-body [data-action="arm"]').first();
  await sellArm.click();
  ok(await page.waitForSelector('#tab-body [data-action="sell"]', { timeout: 2000 }).then(() => true, () => false), 'verkopen vraagt een bevestiging in de knop zelf');
  await page.click('#tab-body [data-action="disarm"]');

  // depot openen via de kaart
  await page.click('#map .city[data-id="luik"]');
  await page.waitForSelector('#city-luik.open');
  ok(await page.evaluate(() => document.querySelector('#tabs [data-tab="netwerk"]').classList.contains('on')), 'stad aanklikken opent Netwerk');
  await page.click('#city-luik [data-action="build-depot"]');
  ok(await page.evaluate(() => VB.S.depots.includes('luik')), 'depot geopend in Luik');
  await shot(page, '4-netwerk');

  // toetsenbord: stad op de kaart met Enter, snelheid met toetsen
  await page.focus('#map .city[data-id="gent"]');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#city-gent.open');
  ok(true, 'stad bedienbaar met het toetsenbord');
  await page.keyboard.press('2');
  ok(await page.evaluate(() => VB.S.speed === 2), 'sneltoets voor snelheid');

  // focus blijft staan na het automatisch hertekenen
  await page.click('#tabs [data-tab="bedrijf"]');
  await page.focus('#tab-body [data-action="buy-upgrade"]');
  await page.waitForTimeout(1300);
  ok(await page.evaluate(() => document.activeElement?.dataset.action === 'buy-upgrade'), 'focus blijft behouden bij hertekenen');

  for (const tab of ['bedrijf', 'logboek', 'vracht']) {
    await page.click(`#tabs [data-tab="${tab}"]`);
    await page.waitForTimeout(200);
    await shot(page, `tab-${tab}`);
  }
  ok(true, 'alle tabbladen werken');

  const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 1000) requestAnimationFrame(f); else r(n); }; requestAnimationFrame(f); }));
  ok(fps > 20, `vloeiend genoeg (${fps} fps)`);

  // opslaan en herladen
  const money = await page.evaluate(() => { VB.logic.save(); return VB.S.money; });
  await page.reload();
  await page.waitForTimeout(400);
  ok(await page.evaluate(m => Math.abs(VB.S.money - m) < 5000 && VB.S.depots.includes('luik'), money), 'voortgang blijft bewaard na herladen');

  // gsm-formaat
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  phone.on('pageerror', e => errors.push(e.message));
  await phone.goto(url);
  await phone.waitForTimeout(500);
  ok(!(await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), 'geen horizontaal scrollen op gsm');
  const small = await phone.evaluate(() => [...document.querySelectorAll('.btn, .tabs button')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 36).length);
  ok(small === 0, 'knoppen groot genoeg om aan te tikken');
  await shot(phone, 'gsm');
  await phone.evaluate(() => window.scrollTo(0, 700));
  await shot(phone, 'gsm-paneel');
} finally {
  await browser.close();
  server.httpServer.close();
}

if (errors.length) { console.error('\n' + errors.join('\n')); process.exit(1); }
console.log('\nAlles in orde.');
process.exit(0);
