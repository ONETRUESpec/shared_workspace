# Once Human – Damage / Stat Formula Research Notes

Facet: **formula** (damage composition, bucket stacking, status-effect math, DPS inputs, defense)
Generated: 2026-10-03. Game version covered: **Version 3.0.7 (2026-09-28)**; status-effect base factors as of the 2025-06-19 balance patch; Reload Efficiency per the 2025-05-21 Combat Balance Adjustments (v1.6.1).

## 0. How this research was done (read first)

* The session's web-search budget (200 calls, shared with sibling facets) ran out midway, and the egress proxy **blocked direct fetches of every game site**: oncehuman.game, once-human.fandom.com, oncehuman.wiki.gg, oncehuman.wiki, steamcommunity.com, store.steampowered.com, game8.co, gamerant.com, sportskeeda.com, thegamer.com, gameleap.com, meta-builds.net, wikily.gg, oncehumandb.com, ohdex.gg, mobalytics.gg, maxroll.gg, reddit.com, web.archive.org, en.wikipedia.org and ~15 smaller guide sites.
* Consequently the numbers from those sites below were captured from **search-engine result snippets that quote the pages verbatim** (each snippet lists the URL it came from). Where two or more independent snippets agreed the value is treated as cross-checked. Only GitHub-hosted community calculators could be read in full.
* **Nothing below is invented.** Where a value could not be found it is `null` in `data/formula.json`.

## 1. Sources

### Read in full (GitHub)
| # | Source | What it gave |
|---|--------|--------------|
| G1 | https://github.com/thachvn0296/OH-Calculator (`src/lib/data.ts`, `src/components/Sidebar.tsx`, `Grid.tsx`) – updated 2026-06-15 | Community bucket model: 8 categories **Weapon Damage (%), Weakspot Damage (%), Crit Damage (%), Elemental Damage (%), Status Damage (%), Element Final Damage (%), All Damage Bonus (%), Debuff (%)**; values are summed inside a category (`Grid.tsx` "minTotal/maxTotal sums"); final damage `baseValue × Π(1 + factor_i) × elementMult` (`Sidebar.tsx`); base is either `baseWeaponDmg` or `psi`; default factors `Weapon DMG 1.43, Weakspot DMG 1.59, Crit DMG 1.70`. |
| G2 | https://github.com/KremaOps/once-human-calculator (`index.html`) – updated 2026-09-24 | `adjustedBase = baseDmg*(1+totalWeaponPct)`; `normalHit = adjustedBase*(1+weakspot)`; **`critHit = adjustedBase*(1 + effectiveCritDmg + totalWeakspotMult)`** (crit and weakspot ADDED); `avgHit = normal*(1-cr)+crit*cr`; `burstDPS = avgHit*fireRate/60`; `standardDPS = avgHit*mag/(mag/(RPM/60)+reload)`; crit rate clamped 0–100. Set examples: Rabbit Fur 4pc +20% airborne weakspot, Wolf Skin 4pc +6% weakspot, Deer Hide 4pc +15% crit DMG. No Psi/status model. |
| G3 | https://github.com/getzity/dmgcalculator_oh (`damagecalculator2.html`) – 2024-09 | `finalDamage = base*(1+weaponDmgBonus)*(1+enemyDamageBonus)*(1+vulnerability)*(1+critDamage)`; `reduced = final*(1-weaponDR)*(1-torsoDR)*(1-statusDR)`. Defaults: base 300, Weapon DMG 20%, vs-enemy 8%, weakspot 8%, crit 30%, DRs 10/10/5%. |
| G4 | https://github.com/Abhijanbasyal/OncehUmanCalculator (`src/OnceHumanCalculator.java`) – 2025-07 | Burn-style tick: `base = psi*0.12; damage = base*elemental*status*weaponBonus*weakspot*(1+critRate*critDamage)*5` (author's own model – note it wrongly lets Burn crit/weakspot). |
| G5 | https://github.com/serhatalmez/oncehuman-damagecalc (`script.js`) – 2025-12 | Generic: `damage = base (weapon DMG or PSI); damage *= (1+mult/100)` for every multiplier; Kukri buff ×1.3 (weapon) / ×1.2 (PSI); `dps = damage*fireRate`. |
| G6 | https://github.com/bramsey679/Once_Human_DPS_Calculator (`data/formulas.json`, `sources.json`, `mods.json`, `weapons.json`, `targets.json`, `RESEARCH_AND_MODEL.md`) – 2026-06 | `bounce_base_multiplier 0.4` citing official dev blog 2024-11-23; layer list `base → flat → percent → crit → weakspot → target mitigation → mode reduction → keyword overrides`; mod texts (Crit DMG Enhancement I/II/III = CR +2% / CD +4/8/12%; Crit Amplifier IV/V = CR +5/10%, CD +15%; Crit Boost I–IV = CR +3/6/9/12%; Blaze Amplifier IV/V "+2.5%/+3% Psi Intensity DMG per Burn stack"; Blitzkrieg IV/V "Fast Gunner stacks +4/+5, Fire Rate +0.8%/+1% per stack"; Bullet Siphon V "Weapon DMG +5%, +4% per 5 bullets, cap 20%"; Covered Advance V "+20% Melee, Weapon, and Status DMG for 30s"; Burning Wrath V "25% chance +1 Burn stack"; Bounce Rampage "+15%/target up to +45%"). Weapon stats all `null`; target profiles are unsourced placeholders. |
| G7 | https://github.com/smus-rgb/once-human-guide (`weapons.json`, `mods.json`, `armor.json`, `deviations.json`, `DATA.md`) – data version 2026-09-30 "targeting patch 3.0.7 live with Isles of Abyss preparation" | Weapon snippets: SOCR Last Valor "45 DMG, 515 RPM, 30 mag"; KAM Abyss Glance "39 DMG, 600 RPM, 50 mag"; M416 Silent Anabasis "33 DMG, 750 RPM"; AWS.338 "~316 DMG". Treacherous Tides "2pc: HP<70% Weapon+Status DMG +12%; 3pc: +8% at 100% HP rising to max 28%". Ghost Link "1pc Crit rate up, 2pc Reload efficiency up". Dr. Teddy "continuous heal 8% max HP/s". Mods only descriptive. |

### Read via search snippets (direct fetch blocked)
| # | URL | Quoted content |
|---|-----|----------------|
| S1 | https://steamcommunity.com/sharedfiles/filedetails/?id=3479671509 (Steam guide) | "Burn deals 12% PSI Intensity as Status DMG every 0.5s for 6s"; formula "12% x PSI Intensity x (1 + Burn DMG Factor Bonus) x (1 + Burn Final DMG Bonus)"; "Power Surge Triggers AoE Shock damage equal to 50% of Psi Intensity"; "Power Surge ignores critical hits, weak spots, and distance reduction"; "Actual Factor = 50% x (1+Power Surge DMG Factor Bonus) x (1+Power Surge Final DMG Bonsu)". |
| S2 | https://once-human.fandom.com/wiki/Burn_(Status_Effect) | Same Burn text/formula as S1; "PSI Intensity indicates the degree to which Players have mastered their Status abilities, primarily provided by Armor"; Psi "serves as the base value for various types of damage, including Status DMG, Tactical Item DMG, and Deviation DMG". |
| S3 | https://once-human.fandom.com/wiki/Frost_Vortex_(Status_Effect) | "traps enemies within a 4.5m radius and inflicts 50% PSI intensity status damage every 0.5s for 4s"; "50% x (1 + Frost Vortex DMG Factor Bonus) x (1 + Frost Vortex Final DMG Bonus)"; "Only 1 Frost Vortex may exist at any time". |
| S4 | https://once-human.fandom.com/wiki/Unstable_Bomber_(Status_Effect) | "triggers 1 Status DMG blast of 120% PSI Intensity after 0.1s with a blast radius of 1.5m. The damage decays over the explosion distance, down to a minimum of 50%"; "120% x (1 + Explosive DMG Factor Bonus) x (1+ Explosive Final DMG Bonus)"; "it cannot cause crit damage, cannot strike enemy weakspots, and will not decay with distance". |
| S5 | https://once-human.fandom.com/wiki/Shrapnel_(Status_Effect) | "Upon hitting an enemy with a bullet, Shrapnel deals +60% Attack as Weapon DMG to a different random part. The element type is the same as the weapon's element"; "60% x (1 + Shrapnel DMG Factor Bonus) x (1 + Shrapnel Final DMG Bonus)"; "The additional damage can cause crit damage, hit weakspots, and will decay with distance". |
| S6 | https://once-human.fandom.com/wiki/Fast_Gunner_(Status_Effect) | "passive weapon status ... each stack grants Fire Rate +1% and Attack +1% for 2s ... stack up to 5 times". |
| S7 | https://once-human.fandom.com/wiki/The_Bull's_Eye_(Status_Effect) ; https://once-human.fandom.com/wiki/AWS.338_-_Bingo | "marks and highlights a target, increasing their Vulnerability by 8%, lasting 12 seconds"; AWS.338: "When hitting a Weakspot ... 70% chance to apply The Bull's Eye"; card "DMG 1216.0, Crit Rate +2.0%, Crit DMG +26.0%, Weakspot DMG +95.0%". |
| S8 | https://once-human.fandom.com/wiki/Crit_DMG_Enhancement ; .../Weakspot_DMG_Boost ; .../Vulnerability_Amplifier | Crit DMG Enhancement Standard "Crit Rate +2.0%, Crit DMG +8.0%", Rare "+2.0%/+12.0%"; Weakspot DMG Boost "+25%"; Vulnerability Amplifier "The Bull's Eye adds Vulnerability +8%". |
| S9 | https://www.oncehuman.game/news/devBlog/20241123/40781_1195665.html (official, Bounce rework) | "Each bounce deals Weapon DMG equal to 40% of your Attack"; bounces to 1 enemy within 15 m then once more; Brahminy "60% chance ... Bounces +2; deals 50% Bounce DMG to players ... environment ... damage decreases by 30% (95% against players). Bounce Weakspot Priority +50%"; Squidward "70% chance on Crit Hits ... Weapon DMG +2%, stacking up to 25 times; 1 stack lost every 5s"; mods Super Bullet "Bounce Crit Rate +10%, Bounce Crit DMG +25%", Chain Bounce "up to +45% (7.5% per Bounce)", Bounce Rampage "up to +45% (15% per target)". |
| S10 | https://www.oncehuman.game/news/update/20250521/40780_1235763.html (official, Combat Balance Adjustments, v1.6.1 live 2025-05-22) | "Final Reloading Time = Base Reloading Time / (1 + Reload Efficiency Bonus)"; "Reload Speed +10 → Reload Efficiency +8%; Reload Speed +10% → Reload Efficiency +3%" (maximum ratios, vary by weapon type); example "base reload 3.634 s + Tactical SR Mag (Reload Efficiency +15%) → 3.16 s" (check: 3.634/1.15 = 3.160 ✓). |
| S11 | https://www.oncehuman.game/news/update/20250617/40780_1241054.html (official, June 2025 balance, live 2025-06-19) | "Unstable Bomber: Damage increased from 100% to 120%"; Doombringer "after hitting a non-Meta-Human unit with all pellets from a single shot, Attack +12% for 15s (up to 3 stacks)"; Predator "Fast Gunner on hit (40% chance) ... Unlimited Ammo when stacks reach multiples of 5 for 0.5s ... Weapon DMG +2% per consecutive hit (up to +80%)". |
| S12 | https://www.oncehuman.game/news/devBlog/20260212/40781_1287008.html (official dev blog) | "In the December 23, 2025 combat Deviation upgrade, vulnerability types of combat Deviations were standardized into Weapon Vulnerability and Status Vulnerability ... Weapon Vulnerability Deviations pair with weapons dealing Weapon DMG, while Status Vulnerability Deviations pair with weapons dealing Status DMG"; "Pathfinder, Pyroclasm Starter, and Additional Rules deal both Weapon DMG and Status DMG, and most combat Deviations cannot simultaneously enhance both"; Feb-25 update: "damage type of Pyroclasm Starter was changed from Weapon DMG to Status DMG when charged, while still allowing it to benefit from Crit Hit/Crit DMG and Weakspot/Weakspot DMG bonuses". |
| S13 | https://www.oncehuman.game/news/update/20260924/40780_1315053.html (official, v3.0.7, 2026-09-28) | "actual Status DMG Multiplier for Voodoo Doll's ultimate was increased from 200% Psi Intensity + 10 to 250% Psi Intensity"; "Psychic Kid Deviation was adjusted from granting Psi Intensity +5% to granting Status DMG +5%"; "two-piece Treacherous Tides bonus ... return to 12% Weapon DMG and Status DMG". |
| S14 | https://sportskeeda.com/mmo/once-human-status-damage-vs-elemental-damage-explained | "Status and Elemental Damage ... are two separate multipliers that scale based on your Psi Intensity rather than Weapon Damage"; example "Psi Intensity 800 → Power Surge 400 (50%) ... Status Damage 20% and Shock Elemental Damage 6%: 400 x (1 + 20/100) x (1 + 6/100) = 508.8". |
| S15 | https://gamerant.com/once-human-status-damage-explained/ | "Status and Elemental DMG does not affect bullet effects like Bounce, Shrapnel, and Fast Gunner, as they scale off Weapon DMG"; "anything that increases your Blaze, Frost, Shock, and Blast DMG stats will also improve your outgoing DPS"; status effects "Burn and Power Surge are not affected by your range stat"; "effects like Bounce, Shrapnel, and Unstable Bomber are affected by damage fall-off". |
| S16 | https://www.gameleap.com/articles/once-human-status-damage-explained | "both Status and Elemental Damage multipliers in Once Human are multiplicative and function identically with minimal difference"; "Elemental Damage is immediate damage dealt through specific elemental types: Blaze, Frost, Shock, and Blast ... boosted by Elemental Damage modifiers and Psi Intensity". |
| S17 | https://gamerant.com/once-human-all-weapon-stats-explained-accuracy-stability-mobility/ ; https://www.oncehumandb.com/weapons/awm | Range = "how far you can hit an enemy and still do full damage"; AWM "full damage range of 59m and a minimum damage range of 107m with 10% minimum damage". |
| S18 | https://game8.co/games/Once-Human/archives/464007 ; https://steamcommunity.com/app/2139460/discussions/0/4514380788156617173/ | "Power Surge can't crit or hit weak spots"; "the gun itself can crit like any other weapon, but the elemental effect cannot crit nor do improved damage on weakpoints"; "Gilded Gauntlets unlock the Crit Hit ability for Burn"; Retribution Explosion "+40% crit damage vs enemies suffering from burn". |
| S19 | https://game8.co/games/Once-Human/archives/Builds-Sniper ; https://www.oncehumandb.com/builds/sniper-weakspot-build | Renegade "2pc Weakspot DMG +10%", "Archer's Focus +4% per stack, up to 10 stacks (+40%)"; AWS.338 "+15% weakspot damage for 10 seconds with each hit, stacking up to three times"; Seasoned Hunter boots "next shot after triggering bull eye will be considered a weakspot hit ... even to mobs that do not have a weakspot". |
| S20 | https://www.thegamer.com/once-human-frost-vortex-build-guide-how-to/ | OLDER: "Frost Vortex deals 30% PSI Intensity as Status DMG per second in a 4.5m radius". |
| S21 | https://theriagames.com/guide/once-human-kam-pioneer-bp/ | "KAM Pioneer BP has a weakspot damage of 55%". |
| S22 | https://gamersandgeek.com/once-human-best-highest-damage-dps-build/ | Character-sheet example "Crit Rate of 25% and Crit Damage of 84%" (a build's totals). |
| S23 | https://www.noobfeed.com/articles/once-human-guide-bingo-sniper-build ; https://www.bluestacks.com/blog/game-guides/once-human/ohn-shrapnel-build-en.html | "Bullseye effect applies an 8% vulnerability debuff for 12 seconds"; "Vulnerability Amplifier mod adds +8% vulnerability"; "Whalepup applies 40% Status Vulnerability to the target for 5 seconds from each hit"; "Stardust Energy Drink grants 20% damage against deviants and 10% against their shields"; "Defeating a non-meta human with a weak spot hit grants a 15% attack bonus for 20 seconds". |
| S24 | https://steamcommunity.com/app/2139460/discussions/0/7073555334572500765 | Resonance mod: "hitting a weakspot once grants one stack of crit damage (1.6% per stack, up to 10 stacks = 16%, 8 seconds)". |
| S25 | https://steamcommunity.com/app/2139460/discussions/0/4631484923305267653 | "level controls health and damage modifiers, with higher level enemies having buffs to health and defense". |
| S26 | https://www.escapistmagazine.com/how-to-increase-pollution-resistance-in-once-human/ ; https://gamessphere.net/games/once-human/news/878_fresh_updates_revamp_of_the_pollution_zone_gameplay_tuning.html ; https://www.oncehuman.game/news/devBlog/20260115/40781_1282049.html | "sanity loss is now calculated precisely with a new formula, depending on the player's contamination resistance" (Mar 2025); "Reduced Pollution Resistance provided by gears and adjusted ... dishes ... from percentage-based to fixed values"; "Resistance is not immunity". |
| S27 | https://meta-builds.net/damage-calculator ; https://wikily.gg/once-human/build-planner/ | Calculator inputs are "the stats shown on your weapon" → outputs non-crit, average crit, weakspot, burst/sustained DPS, magazine damage, effective fire rate, reload downtime (content not readable; confirms the community models weakspot/crit from displayed weapon stats). |
| S28 | https://www.oncehuman.game/news/update/20250716/40780_1247675.html (v2.0.1) | "Jaws was included in adjustments implemented in the July 16 (PT) update" – details not retrieved. |

## 2. Findings

### 2.1 Two damage families
1. **Weapon DMG family** – bullets/melee, **Shrapnel (60 % of Attack)**, **Bounce (40 % of Attack)**, Fast-Gunner-buffed shots. Scales with Attack, Weapon DMG %, Crit, Weakspot, Weapon Vulnerability, range falloff. Not scaled by Status DMG or Psi (S15).
2. **Status DMG family** – **Burn, Frost Vortex, Power Surge, Unstable Bomber**, Tactical items, Deviation attacks (S2, S13). Base = Psi Intensity × keyword factor. Scales with Status DMG %, matching Elemental DMG %, Final DMG %, Status Vulnerability. Does **not** crit, weakspot or fall off (S1, S4, S18) – exceptions: Burn + Gilded Gauntlets; Pyroclasm Starter / Pathfinder / Additional Rules charged shots (Status DMG that still takes Crit and Weakspot, S12).

### 2.2 Bucket stacking
* Fandom/Steam-guide formulas are written as a product of separate `(1 + X)` layers: `Factor × (1 + <Keyword> DMG Factor Bonus) × (1 + <Keyword> Final DMG Bonus)` (S1–S5).
* Status DMG and Elemental DMG are **separate multiplicative factors** (worked example 400 × 1.20 × 1.06 = 508.8, S14; S16 agrees).
* Every community calculator (G1, G2, G3, G5) sums like-named percentages into one bucket and multiplies buckets. G1's eight buckets are the most complete community model.
* **Disputed:** crit × weakspot – G1 multiplies, G2 adds. Pick: multiplicative (flag in UI).

### 2.3 Final formula (as encoded in `data/formula.json`)
```
hit    = Attack × (1+ΣAttack%) × (1+ΣWeaponDMG%) × [1+ΣElemDMG% if weapon element, UNVERIFIED]
         × (crit ? 1+ΣCritDMG% : 1) × (weakspot ? 1+ΣWeakspotDMG% : 1)
         × (1+ΣDmgVsType%) × (1+ΣWeaponVuln%) × (1+ΣAllDMG%) × Falloff × Mitigation
E[hit] = hit_nocrit × (1−CR) + hit_crit × CR
proc   = Psi_flat × (1+ΣPsi%) × BaseFactor × (1+ΣStatusDMG%+ΣKeywordDMG%) × (1+ΣElemDMG%)
         × (1+ΣFinalDMG%) × (1+ΣStatusVuln%) × (1+ΣDmgVsType%) × (1+ΣAllDMG%) × Mitigation
```
Base factors: Burn 12 %/0.5 s × 6 s (144 % total); Frost Vortex 50 %/0.5 s × 4 s (400 %), one vortex at a time; Power Surge 50 %; Unstable Bomber 120 % (radius decay to ≥50 %); Shrapnel 60 % Attack; Bounce 40 % Attack; Voodoo Doll ult 250 % Psi.

### 2.4 DPS inputs
* shots/s = RPM/60; burst DPS = E[hit]×RPM/60; sustained = E[hit]×mag/(mag/(RPM/60)+reload) (G2).
* Reload: `T = T_base / (1 + ReloadEfficiency)` (official, S10). Legacy conversions +10 flat → +8 %, +10 % → +3 % (max, weapon-type dependent).
* Fire Rate % → assumed `RPM × (1+ΣFireRate%)`; no official statement.

### 2.5 Defense / enemy
* DR stats exist per type (generic, Head, Weapon, Status); community multiplies `(1−DR_i)`; no official formula or cap found.
* Pollution: resistance reduces Sanity loss by a (2025-03) formula; dishes now flat values; not immunity.
* Level gap / armor / PvP global modifier: not found; per-effect PvP modifiers exist (Brahminy 50 % to players).

## 3. Disagreements
| Topic | Value A (source) | Value B (source) | Pick |
|---|---|---|---|
| Frost Vortex tick | 50 % Psi / 0.5 s for 4 s (S3, current fandom) | 30 % Psi / s (S20, older guide) | A |
| Unstable Bomber factor | 120 % (S4, S11 post-2025-06-19) | 100 % (pre-patch) | A |
| Unstable Bomber range falloff | "will not decay with distance" (S4) | "affected by damage fall-off" (S15, older) | A |
| Crit × Weakspot | multiplicative (G1, G3) | additive `1+crit+ws` (G2) | multiplicative, low confidence |
| Elemental DMG on bullets | implied by "weapon's element" (S5) / "improves outgoing DPS" (S15) | "does not affect bullet effects" (S15) | procs only (conservative) |

## 4. Not found
Base (naked) Crit DMG; per-weapon-class crit/weakspot bases; per-body-part weakspot multiplier; Fortress Warfare / Blazing Bolts / Jaws numeric effects; Psi flat-vs-% order; Fire Rate % conversion; Vulnerability source stacking; enemy level scaling formula; armor/DR formula and cap; PvP global modifier; shotgun pellet counts; burst-fire RPM convention; Max HP formula; healing formula; the "Impact Damage" definition (Steam thread blocked).
