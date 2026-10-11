# 🚛 Vrachtbaas: Transport & Logistiek Tycoon

Een transport-tycoon die je in de browser speelt. Je start in Antwerpen met één bestelwagen en bouwt een logistiek imperium uit over de Benelux: vracht plannen, lege kilometers vermijden, deadlines halen, trucks kopen en depots openen van Parijs tot Amsterdam.

Broertje van [Agro Tycoon 2.0](https://github.com/MaartenDeKlerkPXL/agro-tycoon2.0). Het volledige spelconcept staat in [`docs/GAME_DESIGN.md`](docs/GAME_DESIGN.md).

## Spelen
Lokaal spelen of eraan werken (Node 22):
```
npm install
npm run dev            # spel op http://localhost:5173 met automatisch herladen
npm run build          # bouwt de site in dist/ (zo gaat hij ook live)
npm test               # unit tests van de spellogica
npm run test:browser   # speltest in een echte browser (Chromium)
```

**Live zetten:** de workflow in `.github/workflows/pages.yml` test, bouwt en publiceert het spel bij elke push. Eenmalig nodig: *Settings → Pages → Source: "GitHub Actions"*. Wil je een eigen domein (bv. `transport.mdeklerk.online`), voeg dan een bestand `public/CNAME` toe met die domeinnaam en zet een CNAME-record bij je DNS-provider.

## Hoe het werkt
1. Open de tab **Vracht**: dat is de vrachtbeurs. Beweeg over een opdracht (of tab ernaartoe) om de route op de kaart te zien
2. Klik **Plan rit**: de kaart klapt open met je trucks. Je ziet meteen hoeveel lege kilometers, hoe lang het duurt, of je op tijd bent en wat je verdient. Klik **Kies**
3. De truck rijdt leeg naar het ophaalpunt, laadt, rijdt naar de bestemming en lost. Daarna krijg je je geld en XP. Zolang hij nog leeg onderweg is, kun je de rit **annuleren**
4. Te laat? Dan krijg je maar 60%. Na 9 uur rijden moet een chauffeur verplicht rusten (tachograaf)
5. Een truck die klaarstaat, kun je ook vanuit de tab **Vloot** laten zoeken: **Zoek vracht** toont de beste ritten vanaf waar hij staat
6. Trucks slijten. Onder 40% conditie krijgen ze pech, dus plan op tijd **onderhoud** 🔧
7. Stijg in **niveau** en speel zwaardere trucks en nieuwe vracht vrij: bakwagen (pallets), trekker (bulk), koeltrailer, containerchassis, ADR-tankwagen
8. Open **depots** (tab Netwerk of klik op een stad op de kaart): vracht vertrekt alleen uit depotsteden en hun buursteden
9. In de tab **Bedrijf** koop je upgrades. De **Planningsafdeling** wijst vracht automatisch toe, ook als je offline bent
10. Let op **gebeurtenissen** boven de kaart: files, havenstakingen, dieselpieken, hittegolven…

**Besturing**
| Toets | Actie |
|---|---|
| P | Pauze |
| 1 / 2 / 3 | Snelheid 1×, 2×, 4× (1× = 1 speldag per minuut) |
| Esc | Opengeklapte kaart sluiten |
| Tab / Enter | Alles is met het toetsenbord bedienbaar, ook de steden op de kaart |

## Code
| Bestand | Inhoud |
|---|---|
| `js/data.js` | Alle speldata en balansgetallen: steden, wegen, trucks, vracht, upgrades, doelen |
| `js/logic.js` | Spellogica zonder DOM (routes, ritten, kosten, vrachtbeurs, gebeurtenissen, opslaan), getest in Node |
| `js/ui.js` | Kaart (SVG), paneel, meldingen, invoer en de game loop |
| `js/util.js` | Kleine hulpfuncties (opmaak, toeval) |
| `tests/` | `logic.test.mjs` (unit tests) en `browser.mjs` (speltest in Chromium) |

## Ontwerp
- **Stijl:** een wegenatlas bij daglicht. Belgisch snelwegbord-blauw is de dragende kleur, signalisatie-geel is enkel voor de beslisknop (**Kies**). Groene E-schildjes en rode A-schildjes zoals langs de echte snelweg. Lettertype: [Overpass](https://fonts.google.com/specimen/Overpass), gebaseerd op het verkeersbordlettertype Highway Gothic
- **Geen pop-ups:** keuzes klappen open in hun eigen kaart, verkopen en opnieuw beginnen gebeurt met een tweestapsknop, de uitleg en het "welkom terug" staan als kaart bovenaan
- **Toegankelijk:** alle kleurcombinaties halen WCAG AA, status nooit enkel met kleur, zichtbare focus, focus blijft staan als het paneel hertekent, `prefers-reduced-motion` wordt gerespecteerd, knoppen minstens 36px (meestal 44px)
- **Mobile first:** de CSS start bij gsm, vanaf 1040px komen kaart en paneel naast elkaar
- Alle ontwerptokens (ruimte, typografie, kleur, timing) staan bovenaan `css/style.css`

In de browserconsole is `VB.S` de spelstatus en `VB.logic` de spellogica (handig om te testen, bv. `VB.S.money = 1e6`).
