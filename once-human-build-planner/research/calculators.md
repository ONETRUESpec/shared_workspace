# Once Human — existing calculators, planners, spreadsheets, and in-game test vectors

Facet research notes (generated 2026-10-03). Data file: `data/test_vectors.json`.

## 0. Access limits (read this first)

- The WebSearch budget for this session was exhausted after ~12 queries; the egress proxy returned 403 for meta-builds.net, oncehumandb.com, wikily.gg, ohdex.gg, steamcommunity.com, reddit.com (incl. old./api./np.), youtube.com, docs.google.com, once-human.fandom.com, oncehuman.wiki(.gg), game8.co, maxroll.gg, mobalytics.gg, sportskeeda.com, gamerant/thegamer, web.archive.org and archive.ph. codeload.github.com (zip) and api.github.com were blocked too.
- What worked: github.com HTML pages (via WebFetch), raw.githubusercontent.com (curl), the GitHub MCP code/repo search. All numbers below come from files mirrored in public GitHub repos, including (a) OHDB and meta-builds.net data exports, (b) decoded official game tables (script.npk) published by TeeReckzi/OHMM, (c) in-game screenshots published by 0x91CEA55/OnceHuman which I read as images and cross-checked against OCR already in that repo.

## 1. Calculators / planners found (with exact formulas where readable)

### 1.1 Sites (all egress-blocked; formulas unknown)
| Site | What search snippets / mirrors say | Last update evidence |
|---|---|---|
| https://meta-builds.net/damage-calculator and /buildPlanner | "calculate non-critical hits, average critical damage, weakspot damage, burst DPS, sustained DPS, magazine damage, and reload downtime"; fan-made; Codex of weapons/gear | export `api/get/allData` fetched 2026-09-25 by josephfmmarzin-ai; `metaPicks[].game_version = "3.0.5"`, reviewed 2026-09-04 |
| https://www.oncehumandb.com/build | "DPS calculations, armor set bonuses, cradle overrides, shareable build URLs"; "real stats pulled straight from the game files" | OHDB JSON mirrored 2026-05-15 (saitoh183) and 2026-09-25 (joseph) |
| https://wikily.gg/once-human/build-planner/ | "Build Planner & Calculator… PvE and PvP builds" | n/a |
| https://ohdex.gg/build-tool | "choose weapons, mods, armor… save and share" | n/a |
| Game8 build planner / guides | used as source by bramsey679 and lReDragol example builds (archives 466957 Unstable Bomber, 466935 Shrapnel) | n/a |

The meta-builds export contains no formula and no weapon base numbers (gear rows carry only effect text), but it does contain: 37 calibrations with legacy numeric effects (e.g. `12-Gauge: Fire Rate +25%, Magazine Capacity +45%, Attack -10%`; `Precision Assault Rifle: Attack +25%, Range +40%, Fire Rate -10%`; `Assault Machine Gun: Attack +25%, Magazine -30%, Stability -50`; post-rework families only have text: Boost/Energy/Frugal/Overflow/Vanguard), `mod_system.levels` 1-17 with sub-stat level counts (source: official dev blog 2025-12-12), `mod_system.stats` rows marked `numeric_level_values_unresolved`, 20 sets with bonus text, 58 cradles, 295 deviations.

### 1.2 Open-source calculators (formulas quoted verbatim)

1. **thachvn0296/OH-Calculator** (live oh-calculator.vercel.app, mirrored in TheDevilsKnock/OHCalc; last commit 2026-06-15)
   `totalMultiplier = product(factors.map(v => 1 + v)) * elementMult; finalDamage = base * totalMultiplier` with base = Weapon DMG or Psi; default factors Weapon DMG 1.43, Weakspot 1.59, Crit DMG 1.70. Grid of Flat/Bonus/Total per stat over Gun/Hat/Mask/Top/Glove/Pant/Shoes/3 Stars/2 Food/2 Drink. No weapon DB, no crit chance, no DPS.
2. **KremaOps/once-human-calculator** (2026-09-24)
   `adjustedBase = base*(1+weaponPct)`; `normalHit = adjustedBase*(1+weakspot)`; `critHit = adjustedBase*(1 + critDmg + weakspot)` (additive); `avg = normal*(1-cr)+crit*cr`; `burstDPS = avg*RPM/60`; `standardDPS = avg*mag/(mag/(RPM/60)+reload)`; `sustained3 = 3*mag*avg/(3*magTime+2*reload)`. Hide 4-pc sets: Rabbit +20% WS airborne, Wolf +6% WS team, Deer +15% CD, Bear +6% Frost/Shock, Wool +6% status; Shark +4.5% weapon, Starfall Cowhide mask +16%, Starfall Down +10%.
3. **getzity/dmgcalculator_oh** (2024-09-05) `base*(1+wpn)*(1+enemy)*(1+weakspot)*(1+crit)*(1-wpnRed)*(1-torsoRed)*(1-statusRed)` — crit × weakspot multiplicative.
4. **serhatalmez/oncehuman-damagecalc** (2025-10-19) base (or Psi, Kukri +30%/+20%) × Π(1+m_i) × fireRate.
5. **Abhijanbasyal/OncehUmanCalculator** (Java, 2025-07-20) inputs Psi, Elemental, Status, Weapon, Weakspot, Crit Rate, Crit DMG; formula not read.
6. **bramsey679/Once_Human_DPS_Calculator** (2026-06-04) placeholder score `1000*weaponMult*(1+star*0.08+tier*0.05+calib*0.03)*(1+armor*0.03)*(1+mods*0.02)*(1+cradle*0.015)*enemyMult*(pvp?0.88:1)`; formulas.json only lists layers + `bounce_base_multiplier 0.4` (official dev blog 2024-11-23).
7. **TheDevilsKnock/OHCalc weapon-calculation-spec** (2026-06-25) — the most complete written spec; see data file for the formulas. Confidence labels: Reload Efficiency `final = base/(1+eff)` canonical (official 2025-05-21 note); crit+weakspot additive `observed`; weapon-damage bucket order `assumption`; armor `unknown`. Examples use OHDB T5: KVD 168 dmg/500 rpm/100 mag/5.1 s, SOCR 174/515/30/2.3 s.
8. **TeeReckzi/OHMM (OHAI)** (2026-06-30 → 2026-07-14) — browser calculator with (a) community formula templates (patch context "May 2026 / Version 2.3.8", all `reported_current_patch_needs_testing`), (b) a universal bucket resolver, and (c) a *recovered official formula graph*: `final_attack = max(base_attack * final_attack_additional_rate * final_attack_ignore_dam_rate * final_special_regulate_factor, 0)` (soul_id 331) with `final_attack_additional_rate = 1 + use_final_dam_add_rate × Σ(weapon_attack_add_rate + attack_type_dam_add_rate + gun_type_dam_add_rate + element_type_dam_add_rate + keyword_proc_dam_add_rate + species/human/debuff)`; damage branch selector remote=8, melee=1, buff=2, skill=3, item=4; defaults pvp_adjust_factor 1, special_regulate_factor 1, PRD speed factors 0.8 for crit/anomaly/weakspot. Its 23 "observed cases" are explicitly synthetic. Its `official-runtime-catalog.json` (4.6 MB) is the single most valuable asset found: per-weapon `gunPresetAttack` ladders, blueprint star ratios, fire intervals, reload times, falloff points, buff definitions.
9. **0x91CEA55/OnceHuman** (2026-03-01 → 03-10; live GitHub Pages) — ECS simulator; buckets each `(1+Σ%/100)` multiplied; Crit DMG + Weakspot DMG additive in `HitAmplifier`; per-keyword Factor and Final buckets; "DMG Coefficient" = Factor, "Ultimate DMG" = Final; keyword intrinsic scalings Burn 0.12·Psi, Shrapnel 0.6·proj, Frost Vortex 0.5·Psi, Power Surge 1.0·Psi, Unstable Bomber 0.7·Psi, Bounce 0.6·proj. Contains in-game screenshots + the "113 Test".
10. **lReDragol/OnceHuman_Tools portable calc V2.8** (2026-03-19) — Python DearPyGui simulator. `damage *= 1 + (weapon% + status% [+melee%])/100` (one bucket!), `×(1+enemyType%)`, crit `×(1+critDmg%)`, weakspot `×(1+weakspot%)` (multiplicative), then vulnerability, Bull's-Eye marked-target, shocked-target, Fast Gunner, element-specific %. Status: `base×(1+status%)×(1+elemental%)×Π(1+bonus%)`. Defaults: Shrapnel 0.5×attack, Power Surge 0.5×Psi (6 s), Celestial Thunder 2.0×Psi, Explosion 1.0×Psi, Burn 0.4×Psi per stack per 1.0 s tick for 6 s, Frost Vortex 0.6×Psi single hit, Bounce 0.6×attack. Data: 131 OHDB weapons, 108 mod secondary-attribute families decoded from the client, deviations from decompiled tables, example builds at star 6 / level 5 / calibration 6.
11. **josephfmmarzin-ai/ONCE_HUMAN** (2026-09-25) — optimizer; `mult = (1+wd)(1+fr)(1+min(1,cr0+cr)·(cd0+cd))(1+whr·(ws0+ws))`, cr0=(weaponCrit+5)/100, cd0=(weaponCritDmg+50)/100; "not the game's exact formula".
12. **saitoh183/once-human-build-planner** (2026-05-15) — no math; OHDB mirror (126 weapons with T5 damage/RPM).
13. Others: Heirloom146/omni-human-db-planner (empty DB), moabdrabou/OnceHuman-Builds (build DB), knkwebservices/oncehuman-cog (Discord lookups from OHDB).

### 1.3 Spreadsheets
- "MOD SHEET LIST" Google Sheet `1bLqxzNMyZ9rQe3GbzFQ9nlqH9H_98zOCecPe7iV_0YU` (from YouTube "DAMAGE TYPES EXPLAINED… NOOB TO PRO #18") — blocked.
- CN/TW community workbook `七日世界.xlsx` (43 sheets; `武器防具星級` = Weapon & Armor Stars) — source of OHMM's locked registries; star-up costs recovered (armor 750/1500/2250/3000/3750 for 1→2…5→6).
- raw.json (0x91CEA55) cites "Community spreadsheets (Farmerzez, Mawn, OhDex)".

## 2. Test vectors — what was actually observed in game

### 2.1 Weapon card DMG (33 readings) — reproduced exactly by official tables
Screenshots `WeaponsOverview-1.png`, `-2.png`, `-FullStarsFullCalibsLvl5.png` (Tier V cards, player Lv.50, 2026-03-02). I read the star rows at 3× zoom. Official ladders from OHMM `official-runtime-catalog.json`.

| Weapon | star | card DMG | OHDB "T5" | official attack art4 / art5 | ratio(star) | art5×ratio |
|---|---|---|---|---|---|---|
| DE.50 - Jaws | 2 | 789 | 494 | 494 / 751 | 1.05 | 788.55 |
| DE.50 - Jaws | 6 | 939 | 494 | 494 / 751 | 1.25 | 938.75 |
| SOCR - The Last Valor | 2 / 6 | 277 / 330 | 174 | 174 / 264 | 1.05 / 1.25 | 277.2 / 330 |
| AWS.338 - Bullseye | 6 | 2310 | 1216 | 1216 / 1848 | 1.25 | 2310 |
| ACS12 - Corrosion | 2 / 6 | 220×5 / 262×5 | 138 | 138 / 210 | 1.05 / 1.25 | 220.5 / 262.5 |
| KVD - Boom! Boom! | 6 | 319 | 168 | 168 / 255 | 1.25 | 318.75 |
| MPS7 - Outer Space | 6 | 240 | 126 | 126 / 192 | 1.25 | 240 |
| MPS5 - Kumawink | 2 / 6 | 227 / 270 | 142 | 142 / 216 | 1.05 / 1.25 | 226.8 / 270 |
| MPS5 - Primal Rage | 1 / 6 | 216 / 270 | 142 | 142 / 216 | 1.0 / 1.25 | 216 / 270 |
| KAM - Abyss Glance | 1 / 6 | 228 / 285 | 150 | 150 / 228 | 1.0 / 1.25 | 228 / 285 |
| HAMR - Brahminy | 6 | 1596 | 840 | 840 / 1277 | 1.25 | 1596.25 |
| MG4 - Conflicting Memories | 1 / 6 | 188 / 235 | 124 | 124 / 188 | 1.0 / 1.25 | 188 / 235 |
| G17 - Hazardous Object | 1 / 6 | 350 / 438 | 230 | 230 / 350 | 1.0 / 1.25 | 350 / 437.5 |
| PDW90 - Holographic Resonance | 6 | 171 | 90 | 90 / 137 | 1.25 | 171.25 |
| TEC9 - Additional Rules | 6 | 449 | 236 | 236 / 359 | 1.25 | 448.75 |
| KV-SBR - Little Jaws | 3 / 6 | 184 / 209 | 110 | 110 / 167 | 1.10 / 1.25 | 183.7 / 208.75 |
| M416 - Silent Anabasis | 6 | 240 | 126 | 126 / 192 | 1.25 | 240 |
| Compound Bow | 1 / 6 | 1812 / 2265 | 1192 | 1192 / 1812 | 1.0 / 1.25 | 1812 / 2265 |
| Critical Pulse | 2 / 6 | 1903 / 2265 | 1192 | 1192 / 1812 | 1.05 / 1.25 | 1902.6 / 2265 |
| EBR-14 - Octopus! Grilled Rings! | 6 | 589 | 310 | 310 / 471 | 1.25 | 588.75 |
| DBSG - Doombringer | 6 | 452×6 | 238 | 238 / 362 | 1.25 | 452.5 |
| SKS - Pathfinder | 2 | 574 | 360 | 360 / 547 | 1.05 | 574.35 |

Every reading equals `round(art5 × ratio)` within ±0.5. The blueprint calibration table's base attrs (E0100/E0200/E0300) match each card's Crit Rate / Crit DMG / Weakspot DMG exactly (Jaws 6/25/60, Bullseye 2/26/95, Corrosion 8/27/15, Octopus 5/40/50, PDW90 8/45/30, Brahminy 2/30/80 …). Fire rate: DE.50 autoTimeInterval 0.315 s = 190.5 RPM (card 190).

Star ladder (official `presetAttackRatio` per strengthLv): epic/legendary 1.00/1.05/1.10/1.15/1.20/1.25 (calibration slots 2…7); uncommon DE.50 1.0/1.0625/1.125; common AA12 1.0×3. This contradicts the gamersandgeek claim (search snippet) that stars add only "10-15%".

Preset ladder (DE.50 Jaws artLevel 0…9): 99, 128, 198, 316, 494, 751, 988, 988, 988, 988; plain DE.50 0…5: 79, 102, 158, 252, 394, 599. OHDB lists artLevel 4 as "Tier 5"; the in-game endgame card uses artLevel 5 (×1.52). An `equipLevel 50 / artLevel 1` row also has 751, so artLevel most likely encodes a gear-level bracket (≈ level 40 vs level 50), not a different tier — unresolved, see §4.

### 2.2 Other in-game observations
- **113 Test** (Power Surge): Psi 267, Corrosion (+15% PS DMG Factor), Mayfly Goggles (−30% PS DMG Coefficient) → 267 × 0.5 × (1 + 0.15 − 0.30) = 113.475, observed 113. Factor and Coefficient add inside one bucket.
- **Stat sheets** (three screenshots, same Lv.50 Burn player; EBR-14 Octopus): see TV-STATS-01..03 — e.g. Weapon DMG Bonus 36 / 95.9 / 68 %, Status DMG Bonus 96 / 94.6 / 128 %, Blaze 75.4 / 73.5 / 91.3 %, Burn DMG Bonus 6 / 86 / 87 %, Crit Rate 0 / 50 / 25 %, Crit DMG 0 / 101.4 / 40 %; "Primary Weapon Attack" 1011 / 902 / 902 while the Octopus card shows 589 (relation unknown).
- **Armor cards** (TV-ARMOR-01) and **Lunar/Crescent suffix caps** (TV-SUFFIX-01).
- **Weapon feature coefficients** transcribed from the cards (TV-TEXT-01); note the meta-builds v3.0.5 export shows Corrosion already rebalanced (70% trigger, PS crit +15%, PS crit DMG +15% ×10) versus the March-2026 card (80%, +25%, +40% ×5).

### 2.3 Synthetic fixtures (NOT game truth)
0x91CEA55 tests: Burn crit trace 100×1.3×1.4×1.5 = 273; Momentum Up +30% weapon DMG in 2nd half of mag; Fateful Strike disables weakspot; Attack% scales base; complex loadout sums (e.g. Psi 125 base + armor pieces 110/70/64/132/48/121 = 670, Steel ammo +5% → 704; Weapon DMG% 93; Status% 118; Crit DMG% 160). OHMM formulaObservedCases: all 23 tagged SYNTHETIC PLACEHOLDER (Burn 4% weapon DMG/stack × 1.15 × 1.10; physical crit+weakspot 255).

## 3. Disagreements between sources
| Topic | Position A | Position B | Pick |
|---|---|---|---|
| Crit × Weakspot | additive `1+C+W` (OHCalc 'observed', KremaOps, OHMM, 0x91CEA55 ADR-002, Reddit 1ergsub per OHCalc) | multiplicative `(1+C)(1+W)` (getzity 2024, lReDragol 2026) | additive (majority + validation-plan test), unverified numerically here |
| Weapon DMG% vs Status DMG% | separate buckets (everyone else) | summed in one bucket (lReDragol) | separate (official graph sums *add rates* of different kinds inside one `additional_rate`, which suggests weapon-type bonuses may be additive with each other — open) |
| Burn tick | 0.12×Psi/stack (0x91CEA55, OHMM template) / 0.04×weaponDMG (OHMM legacy) / 0.4×Psi per 1 s (lReDragol) / in-game text "10% Psi every 0.5 s, 6 s, 5 stacks" (KAM Crank, lReDragol data) | — | use in-game text: 10% Psi per 0.5 s tick per stack; coefficient per weapon |
| Power Surge | pure DoT (OHMM hyp. A) vs hybrid hit 0.5×Psi + amplifier (lReDragol) ; Corrosion scaling 0.35 (0x91CEA55 weapons.ts) vs 0.5 (113 test) | — | unresolved |
| Frost Vortex | DoT tick vs single hit 0.6×Psi (lReDragol) ; 30% Psi/s (OHDB guide) | — | unresolved |
| OHDB T5 damage | OHDB 494 (Jaws) | in-game 1★ card 751 | in-game (official artLevel-5) |
| Weapon stars | "+10-15%" (gamersandgeek snippet) | +25% at 6★ (official ratio + 33 card readings) | official |
| Calibration levels | "Tier 5 up to +10 calibration" (gamersandgeek) | official `calibration_phase_gun [4,7,10]`, `calibration_drawing_gun_phase [3,4,6,7,9,10]`, perk slots 2..7 by star; lReDragol presets use calibration 6 | open |

## 4. Could not find / open questions
1. Any numeric hit log pairing a full build with displayed hit damage on a named enemy (Reddit/Steam/YouTube blocked). The only in-game hit number is the 113 Test.
2. Meaning of `artLevel` 4 vs 5 (level 40 vs 50? Tier V vs VI?) and whether calibration perks (e.g. Precision +25% Attack) change the card DMG — the "FullCalibs" 6★ card equals art5×1.25 exactly, suggesting calibration does not change displayed DMG (or that weapon had no attack calibration).
3. How loadout "Primary Weapon Attack" (1011/902) derives from the card DMG (589) and Weapon DMG Bonus (36%/95.9%/68%) — not a simple product.
4. Formulas inside meta-builds.net, oncehumandb.com, wikily.gg, ohdex.gg.
5. Exact per-level values of post-rework (2026-01-21) mod sub-stats (meta-builds marks them unresolved).
6. Enemy mitigation / PvP: official leaves `pvp_adjust_factor`, `special_regulate_factor`, `element_type_index_armor_type_dam_rate`, `part_dam_ignore_rate` exist (OHMM metadata) but no values recovered; bramsey target profiles are invented.
7. Rounding: cards appear to round to nearest (788.55→789, 1902.6→1903, 574.35→574, 277.2→277); hit damage rounding unknown.
