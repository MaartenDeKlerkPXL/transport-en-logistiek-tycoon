# 🚛 Vrachtbaas: game design

> **Pitch:** Je erft een klein transportbedrijfje in Antwerpen: één bestelwagen, € 8.000 en een droom. Rij vracht door de Benelux, plan slim om lege kilometers te vermijden en groei uit tot een logistiek imperium met depots van Parijs tot Amsterdam.

Agro Tycoon gaat over **produceren** (zaaien, oogsten, verwerken). Vrachtbaas gaat over **verplaatsen**: de juiste truck, op de juiste plek, op het juiste moment.

## De kern: één beslissing die steeds moeilijker wordt
*"Welke truck neemt welke vracht?"*

Elke opdracht op de vrachtbeurs heeft een **vertrekstad, bestemming, gewicht, vrachttype, deadline en vergoeding**. Een truck staat altijd ergens. Neem je een goedbetaalde rit maar moet je er eerst 150 km **leeg** naartoe, dan betaal je diesel en loon zonder inkomsten. Eindigt je rit in Parijs, waar weinig vracht vertrekt? Dan staat je truck daar te wachten.

Dat is de puzzel: **ketens van ritten bouwen** zodat je trucks altijd geladen rijden.

```
  vrachtbeurs ──► truck kiezen ──► leeg naar ophaalpunt ──► laden ──► rijden ──► lossen ──► 💶 + XP
       ▲                                                                                  │
       └──────────── meer depots = meer aanbod ◄── nieuwe trucks/upgrades ◄────────────────┘
```

## Systemen

| Systeem | Hoe het werkt | Waarom het leuk is |
|---|---|---|
| **Kaart & wegennet** | 14 echte steden (BE, NL, FR, DE, LU), verbonden via echte snelwegen (E19, E40, E313, A1…). Trucks rijden de kortste route. | Herkenbaar: je ziet je trucks over de E19 naar Rotterdam rijden. |
| **Vrachtbeurs** | Opdrachten verschijnen in depotsteden en hun buursteden. Elke stad heeft een specialiteit: Antwerpen en Rotterdam containers en chemie, Hasselt fruit (koel), Luik staal, Brussel pakketten… | Elke stad voelt anders; je netwerk uitbreiden opent nieuwe vracht. |
| **Vrachttypes** | 📦 pakketten · 🧱 pallets · ⛏️ bulk · 🍓 koelvracht · 🚢 containers · ☣️ gevaarlijke stoffen (ADR) | Duidelijke progressie: elk type vraagt een eigen truck en niveau. |
| **Vloot** | Bestelwagen → bakwagen → trekker met huif → koeltrailer → containerchassis → ADR-tankwagen. Elk met capaciteit, snelheid, verbruik en chauffeursloon. | Grotere trucks verdienen meer, maar kosten ook meer per km. |
| **Kosten** | Diesel (prijs schommelt elk uur), chauffeursloon per uur, slijtage → onderhoud. | Lege kilometers doen pijn; slim plannen loont. |
| **Deadlines** | Te laat = maar 60% van de vergoeding en halve XP. | Spanning: neem je die verre rit nog aan? |
| **Tachograaf** | Na 9 uur rijden moet een chauffeur verplicht rusten (met dubbele bemanning: 18 uur). | Realistisch en het maakt lange ritten interessant. |
| **Pech** | Trucks met lage conditie krijgen pech: vertraging + takelkosten. | Onderhoud is geen formaliteit. |
| **Gebeurtenissen** | Files rond een stad, havenstaking, dieselpiek, hittegolf (koelvracht +50%), Black Friday (pakketten +40%), bouwboom, overheidspremies. | Elke speldag is anders; je moet reageren. |
| **Depots** | Een depot opent een stad + haar buren voor vracht en laat er nieuwe trucks leveren. Prijs verdubbelt per depot. | De grote strategische keuze: waar breid je uit? |
| **Bedrijf (upgrades)** | Planningsafdeling (automatisch dispatchen, ook offline), eco-rijtraining, eigen werkplaats, Track & Trace, premium vrachtbeurs, dubbele bemanning, telematica. | Van zelf alles klikken naar een idle-imperium dat doordraait. |
| **Doelen** | 12 mijlpalen met geldbeloning, van "lever 5 vrachten af" tot "bedrijfswaarde € 2 miljoen". | Altijd een duidelijk volgend doel. |
| **Offline voortgang** | Bij terugkeer wordt tot 2 uur gemiste tijd doorgerekend. | Terugkomen voelt als een cadeautje. |

## Progressie (gemeten met een simulatie van een slimme speler)

| Tijd | Wat er gebeurt |
|---|---|
| 0–2 min | Eén bestelwagen, pakketjes rondbrengen in Antwerpen en omgeving |
| ~2 min | Niveau 2: bakwagen en pallets, tweede bestelwagen |
| ~5–10 min | Trekker met huif (bulk), eerste extra depot |
| ~15 min | Planningsafdeling: trucks rijden vanzelf |
| ~30 min | Koeltrailers, ±7 trucks, 2 depots |
| ~60 min | Containers & ADR, ±12 trucks, 3 depots |
| ~2 uur | 25+ trucks, depots in 4 landen, € 2 miljoen bedrijfswaarde |

Terugverdientijd per truck (gemeten): bestelwagen ±8 min, bakwagen ±14 min, trekker ±17 min, koeltrailer ±20 min, container ±20 min, tankwagen ±19 min.
Alle balansgetallen staan in [`js/data.js`](../js/data.js).

## Wat zit er in versie 0.1
- [x] Kaart van de Benelux met 14 steden, 26 snelwegen, landsgrenzen en havens
- [x] Trucks rijden live over de kaart (stilstaande trucks staan rond hun stad)
- [x] Vrachtbeurs met 6 vrachttypes, deadlines, vervaltijd en een schatting van de winst per truck
- [x] Toewijzen via opdracht ("welke truck?") of via truck ("welke vracht?"), gesorteerd op winst per uur
- [x] Route-preview op de kaart (lege rit gestreept, geladen rit in oranje)
- [x] 6 trucktypes, onderhoud, verkopen, pech, tachograafrust
- [x] Dieselprijs, gebeurtenissen, depots, 7 upgrades, 12 doelen, niveaus
- [x] Automatisch opslaan, offline voortgang, snelheid ⏸/1×/2×/4× (toetsen P/1/2/3)
- [x] Rit annuleren zolang de truck nog leeg onderweg is, winst per dag in de topbalk
- [x] Geen pop-ups: alles klapt open in het paneel; toegankelijk (WCAG AA, toetsenbord)
- [x] Werkt op desktop en gsm
- [x] Unit tests + browsertest, automatisch live via GitHub Pages

## Ideeën voor later
**Diepere gameplay**
- **Chauffeurs als personen**: ervaring, specialisaties (ADR-certificaat, zuinig rijden), vermoeidheid, loonsverhoging vragen
- **Magazijnen & cross-docking**: vracht tijdelijk opslaan en bundelen, zodat kleine zendingen samen één volle rit worden
- **Intermodaal**: binnenvaart (Albertkanaal, Rijn) en spoor voor lange afstanden; jij doet het voor- en natransport
- **Concurrenten**: AI-transportbedrijven die op dezelfde vracht bieden ("Snelle Eddy Transport"), met prijsonderhandeling
- **Vaste klanten**: contracten met Colruyt, de haven of een chemiebedrijf: elke week vaste ritten, met bonus bij een goede score
- **Kilometerheffing, lage-emissiezones, elektrische trucks** met laadpalen en een kleiner bereik

**Wereld & sfeer**
- Europa uitbreiden: Hamburg, Milaan, Barcelona, Warschau (ferry naar het VK via Zeebrugge?)
- Dag/nacht en weer op de kaart (sneeuw = trager, mist op de E40)
- Geluid: claxon bij een levering, motorgeluid, radiojingle bij gebeurtenissen

**Cross-over met Agro Tycoon** 🚜➡️🚛
- Oogst uit Agro Tycoon verschijnt als vracht in Vrachtbaas (graan naar de haven, aardappelen naar de chipsfabriek): één gedeelde "Tycoon"-wereld

**Lange termijn**
- **Beursgang (prestige)**: verkoop je bedrijf, start opnieuw met een permanente bonus
- Ranglijst / weekuitdagingen
