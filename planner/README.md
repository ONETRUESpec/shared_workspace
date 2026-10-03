# Once Human Build-Planer

Statische Web-App (HTML + CSS + Vanilla-JS, kein Build-Schritt), die einen Once-Human-Build durchrechnet:

* Waffe mit Tier I bis V und 1 bis 6 Sternen, Kalibrierung, Waffen-Mod (inkl. Suffix), Keyword und Element
* sechs Rüstungsteile mit je 1 bis 6 Sternen, Rüstungs-Mods, Set-Boni (werden automatisch gezählt)
* Essen und Getränke, global ein-/ausschaltbar; das Ergebnis zeigt immer „ohne → mit Essen“
* Kampf-Deviants mit Stufe, Cradle Overrides, manuelle Boni für alles, was nicht in den Daten steht
* Ergebnis: Attack, Körper-/Crit-/Weakspot-Treffer, Ø Treffer, DPS (Dauerfeuer und inkl. Nachladen),
  Schaden pro Magazin, Keyword-/Status-Schaden (Psi-basiert), Max HP, Psi Intensity, Pollution Resist,
  Sterntabellen 1★ bis 6★ für Waffe und Rüstung, kompletter Rechenweg und die Herkunft jedes Bonus
* Build wird im Link (`#b=…`) und im Browser gespeichert; JSON-Export

## Starten

Die Seite lädt ihre Daten per `fetch`, deshalb über einen Webserver öffnen, nicht per Doppelklick:

```bash
cd planner
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Auf GitHub Pages reicht es, den Ordner `planner/` zu veröffentlichen.

## Tests

```bash
node --test planner/tests/calc.test.mjs
```

## Formeln

Alle Formeln stehen in `js/calc.js`, die Konstanten in `data/formulas.json` und `data/stars.json`.

```
Attack        = Basis-Attack (Tier IV, 1★) × Tierfaktor × Sternfaktor × (1 + Attack %)
Körpertreffer = Attack × (1 + Weapon DMG %) × (1 + Element %) × (1 + DMG vs Zieltyp %) × (1 + DMG vs markiert %) × (1 + Verwundbarkeit %)
Crit          = Körper × (1 + Crit DMG %)
Weakspot      = Körper × (1 + Weakspot DMG %)
Crit+Weakspot = Körper × (1 + Crit DMG % + Weakspot DMG %)      ← Standard „additiv“
              = Körper × (1 + Crit DMG %) × (1 + Weakspot DMG %) ← umschaltbar „multiplikativ“
Ø Treffer     = gewichtet mit Crit Rate und eingestellter Weakspot-Trefferquote
DPS           = Magazin × Ø Schuss / (Magazin / Schuss pro Sekunde + Nachladezeit)
Status-DMG    = Psi Intensity × Keyword-Faktor × (1 + Status DMG %) × (1 + Element %) × (1 + Keyword DMG %) × Crit-Faktor
```

Der Crit-Faktor des Keyword-Schadens ist der Mittelwert über die Keyword-Crit-Rate: Shrapnel crittet mit der
Waffen-Crit-Rate, alle anderen Keywords nur, wenn ein Bonus ihnen eine eigene Crit Rate gibt („Bounce Crit Rate +10 %“,
„Power Surge Crit Rate +15 %“). Solche keyword-gebundenen Werte wirken nie auf die normalen Waffentreffer.

Keyword-Faktoren: Power Surge 50 % Psi, Burn 10 % Psi je 0,5 s (12 Ticks je Stack), Frost Vortex 50 % Psi je 0,5 s
(8 Ticks), Unstable Bomber 120 % Psi (Fandom; andere Quellen 100 % oder 50 %), Bounce 40 % Attack, Shrapnel 60 % Attack.

### Tierkurve (Blueprint Tier I bis V)

OHDB und meta-builds listen den Attack von **Tier IV** (SOCR Last Valor 174, KVD Boom! Boom! 168, DE.50 Jaws 494).
Die Fandom-Wiki-Tabellen nennen SOCR 45 / 70 / 111 / 174 / 264, KVD 44 / 67 / 108 / 168 / 255 und Jaws Tier V 751.
Daraus ergeben sich die Faktoren ×0,26 / ×0,40 / ×0,64 / ×1,00 / ×1,52 relativ zu Tier IV; Tier V ist damit auf
±1 Attack genau, Tier I bis III sind gerundet. Standard im Planer ist Tier V.

### Sternkurven (Blueprint Enhancement)

| Seltenheit | 1★ | 2★ | 3★ | 4★ | 5★ | 6★ | Quelle |
|---|---|---|---|---|---|---|---|
| Legendär | ×1,00 | ×1,05 | ×1,10 | ×1,15 | ×1,20 | ×1,25 | Fandom-Wiki (Lonewolf Jacket 1924 → 2405), wikily (Ultra Force 264 → 330) |
| Episch | ×1,00 | ×1,06 | ×1,11 | ×1,17 | ×1,22 | – | Fandom-Wiki (Heavy Duty Helmet 666 → 813) |
| Selten | ×1,00 | ×1,06 | ×1,13 | ×1,19 | – | – | Fandom-Wiki (Raid Helmet 592 → 704) |
| Standard | ×1,00 | ×1,07 | ×1,13 | – | – | – | geschätzt |

Die Kurve gilt für Waffen-Attack sowie Rüstungs-HP und Psi Intensity; Pollution Resist skaliert nicht mit Sternen.

## Daten

`data/*.json` wird von `tools/build_planner_data.py` erzeugt (Quellen siehe Kopf des Skripts):

| Datei | Inhalt | Quelle |
|---|---|---|
| `weapons.json` | 123 Waffen: Attack (Tier IV, 1★, siehe Tierkurve), Feuerrate, Magazin, Pellets, Crit Rate/DMG, Weakspot, Nachladen, Effekttext, Keyword | OHDB (Attack, rpm), meta-builds (Statprofil). `profileSource` sagt, ob das Profil gemessen, von der Waffenfamilie oder vom Typ-Durchschnitt stammt |
| `armor.json` | 159 Rüstungsteile: Slot, Seltenheit, Set, HP/Psi/Pollution (Tier V, 1★), Effekttext | OHDB + meta-builds; HP/Psi je Slot und Seltenheit, Fandom-Wiki-Werte liegen ~2 HP darüber |
| `sets.json` | 22 Sets mit 1-/2-/3-/4-Teile-Boni, geparste Werte, Stack-Maximum | OHDB / meta-builds |
| `mods.json` | 105 Mods (Waffe + 6 Rüstungs-Slots) mit Effekttext, geparsten Werten, Bedingung ja/nein, Suffix-Varianten | OHDB |
| `calibrations.json` | 36 Kalibrierungen mit Attack/Feuerrate/Magazin/Nachladen | meta-builds |
| `cradle.json` | 120 Cradle Overrides | OHDB |
| `deviations.json` | 31 Kampf-Deviants, 9 davon mit Zahlenwert je Stufe | OHDB, theriagames, Community |
| `food.json` | 20 Gerichte/Getränke mit Kampfwirkung, Status `verified` / `community` / `estimated` | Steam-Guide „All about Food“, Fandom „Buffs and Effects“ |
| `stars.json`, `formulas.json` | Sternkurven, Keyword-Formeln, Mod-Suffix-Werte | siehe oben |

Der Parser zählt jede Schadensart genau einmal („Melee, Weapon, Status DMG +10 %“ ergibt je +10 %), legt
keyword-gebundene Crit-/Weakspot-Werte („Shrapnel Crit DMG +35 %“) unter `keywordStats` ab und lässt Melee-Boni nur
auf Nahkampfwaffen wirken. Werte, die er nicht automatisch lesen kann (Texte wie „Shrapnel trigger chance +1“), werden als „nur Text“
angezeigt und können unter „Manuelle Boni“ eingetragen werden. Bedingte Boni („when the magazine is empty …“)
haben einen Schalter „Bedingung erfüllt“ und ein Stack-Feld.

### Bekannte Unsicherheiten

* Ob Crit DMG und Weakspot DMG additiv oder multiplikativ verrechnet werden, ist in der Community umstritten;
  Standard ist additiv, umschaltbar unter „Ziel & Formel“.
* Tier I bis III sind aus den Faktoren gerundet; Rüstungswerte gelten immer für Tier V.
* Mod-Suffix-Werte (Violent, Precision, …) sind Community-Werte und in `data/formulas.json` änderbar.
* Schrotflinten: Attack wird pro Pellet gerechnet (Schuss = Attack × Pellets), abschaltbar.
* Deviant-Werte ohne Stufen-Tabelle gelten für die höchste bekannte Stufe.

* Pollution Resist je Teil: meta-builds-Werte (21 / 28). Die Fandom-Tabellen nennen 12 / 16 (älterer Spielstand).

### Verwandte Daten

Die Recherche des Threads „Spielwerte für Once Human sammeln“ liegt unter
[`data/once-human/stats.json`](../data/once-human/stats.json) und
[`data/once-human/SOURCES.md`](../data/once-human/SOURCES.md) (Pull Request #2) mit Quellen-URLs und
Konfidenz je Block. Sternkurve, Tierkurve (Tier IV = Datenbasis, Tier V = ×1,52), Schadensformel, Essen und
Deviant-Werte sind zwischen beiden abgeglichen.

Aktualisieren der Daten:

```bash
python3 tools/build_planner_data.py          # lädt die Quell-JSONs von GitHub
```
