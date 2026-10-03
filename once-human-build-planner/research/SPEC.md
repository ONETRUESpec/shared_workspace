# Once Human Build Planner – calculation specification

Generated 2026-10-03 from nine research facets (`research/*.md`), three adversarial verification passes (`research/verify-*.json`) and the decoded official game tables (TeeReckzi/OHMM `official-runtime-catalog.json`, reflected in `data/official_weapons.json`). Game version covered: v3.0.7 (2026-09-28). The engine that implements this spec is `js/engine.js`; the data adapter that feeds it is `js/data-adapter.js`.

## 1. Stat vocabulary

Percent stats are stored as percent points (12.5 means +12.5 %). Flat stats are raw numbers.

| id | meaning | bucket | keyed by |
|---|---|---|---|
| `attackPct`, `attackFlat` | modifies the weapon card's Attack (calibration Attack bonus, Fast Gunner stacks) | attack | |
| `weaponDmgPct` | "Weapon DMG +X%" (armor sets, mods, Cradle, food, Cradle "DMG +X%" for a weapon class) | weaponDmg | |
| `elementalDmgPct` | Blaze / Frost / Blast / Shock DMG % | elementalDmg | element (`blaze`, `frost`, `blast`, `shock`, `all`) |
| `statusDmgPct` | generic "Status DMG +X%" (also "Psi Intensity DMG") | statusDmg | |
| `keywordDmgPct` | "Burn DMG +X%", "Shrapnel DMG +X%", "DMG Factor/Coefficient" lines | statusDmg (same pool as `statusDmgPct` by default) | keyword |
| `finalDmgPct` | "<Keyword> Final DMG +X%" | finalDmg | keyword or `all` |
| `critRatePct`, `critDmgPct` | crit rate and crit damage bonus | crit | |
| `weakspotDmgPct` | weakspot damage bonus | weakspot | |
| `keywordCritDmgPct`, `keywordWeakspotDmgPct` | "Shrapnel Crit DMG +X%" etc. (bullet keywords only) | crit / weakspot | keyword |
| `dmgVsPct` | DMG vs Deviants / Humans / Monsters / Normal / Elite / Boss / Players / Shields | dmgVsType | target |
| `weaponVulnPct`, `statusVulnPct` | Vulnerability inflicted on the target (Bull's Eye, Vulnerability Amplifier, deviations); split weapon/status since Dec 2025 | vulnerability | |
| `allDmgPct` | "All DMG" / "damage boost" | allDmg | |
| `psiIntensity`, `psiIntensityPct` | flat Psi (armor base stats, mods, food) and Psi % | psiIntensity | |
| `fireRatePct`, `reloadEfficiencyPct`, `magazinePct`, `magazineFlat`, `rangePct`, `statusChancePct` | rate-of-fire inputs | rate | |
| `maxHp`, `maxHpPct`, `pollutionResist`, `dmgReductionPct`, `healingPct` | defence | defense | |
| `other` | utility effects kept as text (stamina, medicine speed, durations…) | – | |

Stat names in the data files are free text (`weapon_dmg_pct`, "Weapon DMG", "DMG against Deviants", "Shrapnel Crit DMG"…). `Adapter.toEffects` maps them onto this vocabulary; `Engine.resolveStat` is the fallback alias table.

## 2. Direct hit

```
attack      = cardAttack(star) × (1 + ΣattackPct/100) + attackFlat
cardAttack  = tierV_1★_attack × starRatio[star]         (see §3)

hit_body    = attack
            × (1 + ΣweaponDmgPct/100)
            × (1 + ΣelementalDmgPct[weapon element]/100)   only for Blaze/Frost/Blast/Shock weapons
            × (1 + ΣdmgVsPct[target faction] + ΣdmgVsPct[target tier] + ΣdmgVsPct[all])/100
            × (1 + ΣweaponVulnPct/100)
            × (1 + ΣallDmgPct/100)
            × falloff × mitigation

hit_crit          = hit_body × (1 + critDmg)
hit_weakspot      = hit_body × (1 + weakspot) × zone
hit_weakspot_crit = hit_body × (1 + critDmg + weakspot) × zone        ← default "additive" model
                  = hit_body × (1 + critDmg) × (1 + weakspot) × zone  ← optional "multiplicative" model

critDmg  = (weapon card Crit DMG % + ΣcritDmgPct) / 100
weakspot = (weapon card Weakspot DMG % + ΣweakspotDmgPct) / 100
critRate = clamp(weapon card Crit Rate % + ΣcritRatePct, 0, 100) / 100
expected_hit = hit × (1 − critRate) + hit_crit × critRate      (per pellet; shotguns multiply by pellets)
```

Decisions and evidence:

- **Attack % and Weapon DMG % are separate factors** (verify-critweak: in-game tooltip "Weapon DMG… base value is determined by Attack"; procs are "60 % of Attack"; 0x91CEA55, OHCalc and OHMM split them). Toggle: one additive bucket.
- **Crit DMG and Weakspot DMG add in one hit-amplifier** (verify-critweak: every calculator claiming in-game observation – OHCalc, meta-builds, 0x91CEA55 Hit-Amplifier, OHMM, KremaOps). Toggle: multiplicative.
- **Elemental DMG % multiplies elemental weapons' own bullets** and all status procs; physical-bullet weapons only get it on procs (verify-critweak; Neox `element_type_dam_add_rate_*` tags).
- **No hidden base crit or weakspot multiplier**: the card's Crit DMG and Weakspot DMG are the whole bonus (official 2.3.1 notes call the card stat "Weakspot Multiplier"). Enemy body-part zones may add a multiplier on top; exposed as `weakspotZoneMult` (default 1).
- **Vulnerability sources add into one pool**, Final DMG is its own factor.
- **Alternative model exposed** (`damagePoolModel: 'additive'`): a datamined Neox formula graph suggests Weapon DMG %, Elemental %, keyword %, DMG-vs-type % and debuffs may be ONE additive pool (`final_attack_additional_rate = 1 + Σ…`). Its crit/weakspot branches are not recovered, so it is an option, not the default.
- **Mitigation / falloff**: no published enemy level or armour formula; the UI exposes "Damage taken %" (default 100). Weapon falloff ranges are in `official_weapons.json` (`distanceDamageValue1/2`) but are not applied by default (full-damage range assumed).

## 3. Blueprint stars (1★–6★)

Official blueprint table (`weaponBlueprintCalibrations.presetAttackRatio`), confirmed on 33 in-game weapon-card screenshots (`data/test_vectors.json`, TV-CARD-*) and on armor tables (verify-stars):

| rarity | 1★ | 2★ | 3★ | 4★ | 5★ | 6★ |
|---|---|---|---|---|---|---|
| Legendary | 1.00 | 1.05 | 1.10 | 1.15 | 1.20 | 1.25 |
| Epic | 1.00 | 1.05575 | 1.1115 | 1.16725 | 1.223 | – |
| Rare | 1.00 | 1.0627 | 1.1253 | 1.188 | – | – |
| Standard | 1.00 | 1.0715 | 1.143 | – | – | – |

- Stars multiply only the weapon's DMG and an armor piece's Max HP and Psi Intensity. Fire rate, magazine, crit, weakspot, range, reload, Pollution Resist, special-effect values and set bonuses do not change with stars.
- Tier and star are independent: `displayed = round(tierV_1★ × starRatio)`. The in-game Tier V card equals the official `artLevel 5` attack; OHDB's listed "Tier 5" DMG is the artLevel 4 (Tier IV) value, 1.52× lower. The planner uses the official value where mapped (61 of 67 weapons) and OHDB × 1.52 otherwise.
- Legendary star-ups cost 1,600 / 4,000 / 6,000 / 8,000 / 10,000 XP (29,600 total) or 3,000 / 6,000 / 9,000 / 12,000 / 15,000 Starchrom; Starchrom only since v2.3.5 (2026-03-25).

## 4. Calibration (v2.3.1, January 2026)

Post-craft calibration is gone. A calibration blueprint is consumed when crafting and its attributes are permanent:

- **Style attributes** fixed per blueprint name (`data/calibration.json`, e.g. Precision Assault Rifle: Attack +25 %, Range +40 %, Fire Rate −10 %) – entered as `attackPct`, `rangePct`, `fireRatePct`, `reloadEfficiencyPct`, `magazinePct`.
- **Guaranteed Attack bonus**: Legendary 33–50 % → `attackPct` (UI default 50).
- **One random attribute** from Crit Rate / Crit DMG / Elemental DMG / Weakspot DMG (Legendary Elemental DMG 15–20 %) → the matching stat.
- Armor calibration was removed; "Fur" additives (+40 % base HP and Psi for Legendary fur) replace it and are not yet modelled (open item).

## 5. Armor

- Base stats per slot: Tier I 1★ Legendary HP 60/30/156/90/144/120 (Helmet/Mask/Top/Gloves/Pants/Shoes), Psi 16/20/11/12/13/8. Tier V multiplies HP ×9.8333 and Psi ×5.75; v2.3.1 re-based Tier V HP ×1.2542 (so Tier V 1★ Legendary helmet = 740, 6★ = 925); stars multiply by the table in §3. Pollution Resist is 12 (helmet/gloves/pants/shoes) or 16 (mask/top) at Tier V post-2.3.1 and does not scale with stars.
- Set-piece effects: none on set pieces; **set bonuses** at 1/2/3/4 pieces (`data/armor.json`). Unconditional bonuses are always on; conditional ones ("after 2 crit hits…", "within 5 m…") are toggles in the UI, off by default; per-stack effects take a stack count (default max).
- **Key armor** (41 unique pieces, e.g. Cage Helmet, Mayfly Goggles) carries its own effect; keyword-specific numbers enter as `keywordDmgPct`/`finalDmgPct` etc.; mechanics without a stat (extra triggers, hit parts) are kept as text.
- Set and key-armor values do not scale with stars or tier.

## 6. Mods

- One mod per weapon and per armor piece; armor mods are slot-specific; weapon mods fit any ranged weapon but keyword mods only work on weapons with that keyword (UI flags the mismatch).
- Main effect from `data/mods.json` (`effect.stat/value/condition/perStack/maxValue`), conditional ones are toggles.
- **Sub-attributes**: since v2.3.1 each mod has 4 fixed sub-attributes (levels 1–5, mod level max 17). Per-level values are unpublished, so the UI lets you pick the 4 sub-attributes and type their values, pre-filled with the Legendary (max) tier value: Weapon DMG 10 %, Crit DMG 15 %, Weakspot DMG 9 %, Elemental DMG 10 %, Status DMG 10 %, Attack 5 %, DMG vs Normal/Elite/Boss 8 % (`substats` tiers; keyword DMG, trigger chance, Psi, HP etc. have default guesses flagged in the data).

## 7. Food and drink

- One food buff + one drink buff active at a time (same slot overwrites; food and drink stack). Chef "Glutton" talent allows 2 + 2 (not modelled).
- Values from `data/food.json` (e.g. Shattered Bread Weapon DMG +25 %, Stargazy Pie Crit DMG +25 % while Energy is full, Whimsical Drink Status DMG +25 %). Conditional buffs are toggles.
- **Chefosaurus Rex**: dish values × (1 + bonus): rating 5 = +38/31/25 %, 4 = +32/26/20 %, 3 = +26/21/15 % by deviant activity ≥90 / 20–89 / <20.
- Every result is computed twice, with and without food/drink effects (`Adapter.computeBuild(build, cat, {includeFood})`), and the UI shows both columns with the delta.

## 8. Deviations

- Combat deviation effects are linear in Skill Rating: `value = step × (3 + SR)`, so SR5 = 2 × SR1 (decoded client formulas). Target debuffs enter the player formula: Butterfly's Emissary weakspot DMG taken 25.2 → 50.4 % (SR1→SR5) as `weakspotDmgPct` (conditional on the mark), Lonewolf's Whisper Weapon DMG taken 25 → 50 % as `weaponVulnPct`, Shattered Maiden Blast DMG taken 40 → 80 % as `elementalDmgPct:blast`, Mini Feaster Status DMG +10 → 20 % per tentacle (cap 40 → 80 %).
- The deviation's own skill damage is Psi-scaled Status DMG (e.g. Polar Jelly 800 % Psi, Voodoo Doll ultimate 250 % Psi/s at SR5) and is shown as text, not added to weapon DPS.
- Trait buffs (Crack Shot Weapon DMG +5 %, Psychic Kid Status DMG +5 %…) are not yet modelled per variant (open item).

## 9. Cradle Overrides and other global sources

- Up to 8 Cradle Overrides, flat perks. Live general-pool values (post-v1.4, confirmed by 2026 hover captures): weapon-class Enhancements DMG +20 % (`weaponDmgPct`), Tactical Combo Weapon DMG +15 %/4 s, Status Enhancement Status DMG +15 %/3 s, Elemental Sense +25 %/4 s, Steady Hand Weapon +10 % & Weakspot +25 %, Marked Strike Weakspot +20 %, Critical Precision Weakspot +30 % in scope, stacking keyword procs +2.5 %/+3.5 % ×10, Bounce/Unstable Bomber +5 % ×5. Conditional nodes are toggles; legacy v1.0 rows and un-scaled datamine rows are excluded from the picker.
- Memetic specializations are mostly economy perks and are listed in `data/cradle.json` but not applied.

## 10. Status effects and bullet keywords

```
proc_psi = Psi_flat × (1 + ΣpsiIntensityPct/100) × baseFactor
         × (1 + ΣstatusDmgPct/100 + ΣkeywordDmgPct[keyword]/100)      ← one "DMG factor" pool (toggle: separate)
         × (1 + ΣelementalDmgPct[keyword element]/100)
         × (1 + ΣfinalDmgPct[keyword]/100)
         × (1 + ΣstatusVulnPct/100) × (1 + ΣdmgVsPct/100) × (1 + ΣallDmgPct/100) × mitigation
         (no crit, no weakspot, no range falloff)

proc_attack (Shrapnel, Bounce, Pyroclasm charged shot)
         = hit_body × baseFactor × (1 + ΣkeywordDmgPct[keyword]/100) × (1 + ΣfinalDmgPct[keyword]/100)
           then crit (+ keyword crit DMG) and weakspot (+ keyword weakspot DMG) like a bullet
```

| keyword | base | scales with | tick / duration | notes |
|---|---|---|---|---|
| Burn | 12 % Psi | Psi | 0.5 s / 6 s (12 ticks), tick × stacks, 5 stacks | cannot crit (Gilded Gauntlets: can) |
| Frost Vortex | 50 % Psi | Psi | 0.5 s / 4 s (8 ticks), one vortex | 4.5 m radius |
| Power Surge | 50 % Psi | Psi | once per proc; status 6 s | Accuracy −40 % |
| Unstable Bomber | 120 % Psi | Psi | per blast, 1.5 m, decays to 50 % at the edge | Jaws: can crit, +25 % crit rate |
| Shrapnel | 60 % Attack | attack | per proc, random other body part | can crit and weakspot |
| Bounce | 40 % Attack | attack | per bounce, 2 bounces (15 m) | can crit and weakspot |
| The Bull's Eye | – | – | 12 s | target Vulnerability +8 % (+8 % with Vulnerability Amplifier) |
| Fast Gunner | – | – | 2 s, 5 stacks | +1 % Fire Rate and +1 % Attack per stack |
| Fortress Warfare | – | – | 5 s zone, 2 m | Heavy Armor: Super Armor + Weapon DMG +20 % |
| Pyroclasm charged shot | 95 % Attack | attack | – | Blaze Status DMG that still crits/weakspots |

Trigger chances are weapon properties (e.g. Outer Space 25 % on hit, Corrosion 70–80 %, The Last Valor every 4 hits with crits counting double, Jaws every 4 shots); "Trigger Chance +X %" sub-attributes multiply the weapon's own chance. The planner's status DPS uses the weapon's chance when known, else shows per-proc damage only.

Verified test: "the 113 test" – Psi 267, Corrosion +15 % Power Surge DMG factor, Mayfly Goggles −30 % coefficient → 267 × 0.5 × 0.85 = 113.475 → 113 observed. Sportskeeda example: Psi 800, Status 20 %, Shock 6 % → 400 × 1.2 × 1.06 = 508.8.

## 11. Rate of fire, magazine, reload, DPS

```
rpm       = card RPM × (1 + ΣfireRatePct/100)           (card RPM = 60 / official fire interval)
magazine  = floor((card mag + ΣmagazineFlat) × (1 + ΣmagazinePct/100))
reload    = card reload / (1 + ΣreloadEfficiencyPct/100)   (official 2025-05-21 reload-efficiency formula)
burst DPS = expected_hit × pellets × rpm/60 (+ status per shot × rpm/60)
sustained = (expected_hit × pellets × magazine) / (magazine / (rpm/60) + reload)
```
Legacy "Reload Speed" lines are treated as Reload Efficiency (current tooltips); the legacy conversion (+10 % → +3 %) is kept as `Engine.legacyReloadToEfficiency` but unused.

## 12. Worked examples (from the test suite)

1. **DE.50 – Jaws card**: Tier V 1★ attack 751 (official artLevel 5). 2★ = round(751 × 1.05) = 789, 6★ = 939 – both match the in-game screenshots (TV-CARD-01/02). Card attributes crit 6 %, crit DMG 25 %, weakspot 60 % match the blueprint attrs E0100/E0200/E0300.
2. **SOCR – The Last Valor 6★ with Lonewolf 6★ set, no food**: attack 264 × 1.25 = 330; calibration Attack +50 % → 495; Lonewolf 2pc Crit Rate +5 % (card 6 % → 11 %); crit DMG 27 % + Elemental 20 % random attribute does not apply (physical weapon); body hit 495 × 1.2 (Steady Hand +10 % and Enhancement +20 % … per selected Cradle nodes) etc. – see the live breakdown panel; weakspot crit = body × (1 + 0.27 + 0.60 + Σ).
3. **Power Surge proc**: Psi 800, Status DMG 20 %, Shock 6 % → 800 × 0.5 × 1.2 × 1.06 = 508.8 (test `Sportskeeda worked example`).
4. **Lonewolf 6★ helmet**: 60 × 9.8333 × 1.2542 × 1.25 = 925 HP, Psi 16 × 5.75 × 1.25 = 115 (fandom "Enhancement Tier VI HP 925, Psi 115").

## 13. Confidence and open items

| item | status | default used |
|---|---|---|
| Star ratios (weapon DMG, armor HP/Psi) | high – official tables + 33 screenshots | §3 table |
| Tier V card attack for 61 weapons | high – official tables | `official_weapons.json` |
| 6 weapons added after the 2026-05 snapshot (AUG Electron Cloud, QBJ97, SOCR Wildfire, KVK 3 Bull, SN700 Finale, KAM Burning Rage) | no base DMG | disabled in the picker |
| Crit + Weakspot additive | medium – community-observed, no raw log reachable | additive, toggle |
| Attack % vs Weapon DMG % separate | medium | separate, toggle |
| Elemental % on elemental bullets | medium | on, toggle |
| Single additive pool (datamined graph) | low – crit branches unrecovered | off, toggle |
| Status base factors, ticks, stacks | high | §10 |
| Status DMG % and keyword DMG % in one pool | medium (113 test covers keyword-only lines) | one pool, toggle |
| Mod sub-attribute values per level (post-2.3.1) | low | Legendary tier maxima, editable |
| Set-bonus values where sources disagree (Bastille 15 vs 20 %, Renegade 10 vs 15 %…) | medium | first-listed value, alternatives kept in data |
| Food values changed by 2026 patches (Canned Meat 10 vs 20 %…) | medium | 2026 community sheet value |
| Deviation Battle Skill / Ultimate texts after Dec-2025 overhaul, trait buffs per variant | low | passive debuff values only |
| Fur additives (armor), Memetics, Eclipse Cortex | not modelled | – |
| Enemy level/armour mitigation, range falloff, weakspot zone multipliers | unknown | 100 % / 1.0 inputs |

## 14. Data-file index

| file | content | records |
|---|---|---|
| `data/formula.json` | buckets, final-damage expression, status effects (verified), conversions, defence notes, corrections | 14 buckets, 13 status entries |
| `data/weapons.json` | weapon catalogue (OHDB-derived stats, effect texts, frames) | 67 weapons |
| `data/official_weapons.json` | decoded official tables: attack ladder by artLevel, star ratios, blueprint attrs, fire interval, reload, falloff | 126 mapped weapons |
| `data/calibration.json` | 2026 calibration system, 23 style blueprints, legacy system, star costs | 25 |
| `data/armor.json` | 23 sets (133 pieces), 41 key-armor pieces, slot base stats by tier/star, set bonuses with alternatives | 197 |
| `data/mods.json` | 37 weapon mods, 64 armor mods, 24 substats, 16 suffix families, levelling rules | 101 + |
| `data/food.json` | 130 dishes/drinks (41 with numeric combat buffs), stacking rules | 130 |
| `data/deviants.json` | 27 combat deviations with SR-scaled effects | 27 |
| `data/cradle.json` | 170 Cradle Override rows (113 live after filtering), 149 Memetic specializations, other systems | 328 |
| `data/test_vectors.json` | 19 calculators with their formulas, 47 test vectors (33 in-game cards, 113 test, armor cards…) | 66 |
