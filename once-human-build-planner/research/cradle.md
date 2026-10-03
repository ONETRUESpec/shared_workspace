# Once Human — Cradle Overrides & other global combat-stat sources (research notes)

Facet: Cradle ("Overclock"/Override) node system + account/character-wide stat sources. Generated 2026-10-03.
Data file: `data/cradle.json` (170 OHDB override rows = 120 distinct names; 149 Memetic Specializations; 9 other systems).

## 0. Research constraints (read first)

* The session's egress proxy blocked every game site (oncehuman.game, game8, fandom, wiki.gg, oncehumandb.com, Steam, Reddit, Sportskeeda, TheGamer, GameRant, Mobalytics, Maxroll, meta-builds.net, wikily.gg, archive.org …). Only `github.com` / `raw.githubusercontent.com` were reachable, and the shared WebSearch budget ran out after the first ~20 queries. Everything below therefore comes from (a) GitHub-hosted mirrors/datasets of those sites and (b) the text snippets returned by WebSearch. Where a number is snippet-only it is labelled **(snippet)**.
* The in-game feature is called **"Cradle Override"** (not "Overclock"). Overrides are flat perks slotted into Cradle **nodes**; there are no tiers/ranks.

## 1. Sources actually read

| # | Source | What it gave |
|---|--------|--------------|
| 1 | https://raw.githubusercontent.com/saitoh183/once-human-build-planner/main/data/cradle.json | **Primary dataset**: 170 Cradle Override rows scraped from https://www.oncehumandb.com/cradle-overrides (OHDB). Fields: id/slug, name, style, effect text, icon, OHDB URL. |
| 2 | …/saitoh183/once-human-build-planner/main/README.md and tools/refresh-ohdb-data.py | Confirms source = OHDB pages (`/cradle-overrides`, `/deviations`, …), 8 cradle slots in the planner UI, scrape method (`pageDescription`, `dateModified` fields). |
| 3 | https://raw.githubusercontent.com/TKronix/Memetics-For-Dummies/main/data/specializations.json | 149 Memetic Specializations with identity, branch category, levels, formula, effect text (includes Prismverse's Clash "Legendary Mayfly/Rosetta"). |
| 4 | https://raw.githubusercontent.com/TeeReckzi/OHMM/main/src/ohai/src/ui/registries/cradleRegistry.ts (+ cradleEffectResolver.ts, formulaSupportRegistry.ts) | 25 cradle perks "extracted from user-provided in-game hover footage" (2026-03). Independent confirmation of the post-rework numbers and of the 8-node cap (`cap = 8 … game enforces cap`). |
| 5 | https://raw.githubusercontent.com/TeeReckzi/OHMM/main/verified/INGAME_KNOWLEDGE_BIBLE.md (identical copy in 0x91CEA55/OnceHuman) | OCR of in-game screenshots (2026-03-02): stat definitions, 12 armor-set bonuses, key armor, mod texts, Lunar/Crescent suffix peaks. Used for stacking terminology. |
| 6 | https://raw.githubusercontent.com/0x91CEA55/OnceHuman/main/simulator/docs/designs/ADR-002-universal-bucket-topology.md | Community damage model: additive buckets, multiplicative between buckets; Crit DMG + Weakspot DMG additive ("113 Test"). |
| 7 | https://raw.githubusercontent.com/0x91CEA55/OnceHuman/main/research/data/custom-datamine/build-comparison-stats.md | Two real Lv50 character sheets (Attack 902, Psi 1052/1070, Weapon DMG Bonus 68%/95.9%, Status DMG Bonus 128%/94.6%…) – magnitude sanity check. |
| 8 | https://raw.githubusercontent.com/TheDevilsKnock/OHCalc/main/weapon-calculation-spec/03-weapon-effects.md and 05-validation-plan.md | Formula spec for keyword procs; `weakspotCrit / body = 1 + critDamage + weakspotDamage`; `finalReloadingTime = base / (1 + reloadEfficiencyBonus)`. |
| 9 | https://raw.githubusercontent.com/punyjin/once-human-wiki/main/news/news_09-26-24.html | Thai translation of the 2024-09-26 patch notes: *"Fixed Cradle perk 'Sustained Suppression' granting only 15% per stack (should be 20%)"*. |
| 10 | https://raw.githubusercontent.com/waryder/GitHubWebsite/main/once-human/2026-08-12-scenario-endgame-guide.html | 2026 scenario-persistence facts quoting official notes (v2.3.5 Starchrom/blueprint overhaul; "lost gear"; what survives a scenario). |
| 11 | https://raw.githubusercontent.com/HkFromMY/oncehuman-chatbot/main/notebooks/EDA%20-%20OnceHuman%20Wiki.ipynb | Contains a 2024-09-18 scrape of https://once-human.fandom.com/wiki/Memetics (branches, 4 random choices every 5 levels, Identities table). |
| 12 | https://raw.githubusercontent.com/Gledson-z/once-human-planner/main/data/game_data.js | Two cradle entries (Elemental Sense +25% 4s; Explosive Barrage "+0.2% … capping at +0.6%") – confirms wikily.gg carries the same unscaled text as OHDB. |
| 13 | https://raw.githubusercontent.com/moabdrabou/OnceHuman-Builds/main/README.md | "Links up to 8 Cradle Override items (by slot index) to a build." |
| 14 | Search snippets: game8 468460 & 481150 (Cradle Override guides), Sportskeeda "all new Cradle Override effects in patch 1.4", oncehuman.game Memetic & Cradle Guide, oncehuman.game v2.3.5 notes, Steam v3.0.6 notes, TheNerdStash best overrides, oncehuman.wiki deviants guide, gamepressure Eclipse Cortex, Steam guide 3479671509, fandom R500 - Memento. | Node counts/unlock rules, v1.4 texts, 2026 patch headlines, deviation numbers, Eclipse Cortex yields. |

## 2. Cradle system facts

* **8 nodes max.** game8 (snippet): "There are a total of 8 cradle nodes available to fill with powerful passives." saitoh183 README: "Cradle: 8 compact icon-only cradle override slots." OHMM resolver: `const cap = 8 … Only first 8 should apply per game rules`. moabdrabou: "up to 8 Cradle Override items". → **high confidence**.
* **Node unlock** — Manibus/Evolution's Call (snippet, game8 468460): "You start with just one node when you first unlock the Cradle, and each boss you defeat will unlock you a single node"; Cradle unlocked at Meyer's Market (Broken Delta) during "Murmurs in the Forest". Way of Winter (snippet, game8 481150): "Cradle Nodes unlock every 5 levels starting at Level 5, with all eight nodes available by Level 40." Later scenarios: **not found**.
* **Swapping**: free — "you can test out different features and switch out the ones you're not happy with by dragging a different one on top of it" (snippet).
* **Override unlock cost / currency**: **not found in any reachable source.** Mitsuko's Mark is Challenge-Shop currency (wikily snippet) and no snippet linked Starchrom to override purchases. Left `null`.
* **Scenario / Season-Tag pools**: OHDB style "Scenario" (31 rows, ids 9xxx) = overrides that only exist in a given scenario (Valor Trial 1-5, Anti-X: weapon, Streak Rewards, Medic, Engineer, Logistical Support…). The Oct-2024 official tweet (snippet) ties new overrides to "Season Tags" ("the Cradle Override of new Deviant Invasion is coming soon").

### 2.1 Interpreting the OHDB id blocks (important for the planner)

OHDB publishes several same-named rows. Their slugs end in a 4-digit game id; the leading digit clusters cleanly:

| id block | rows | reading | evidence |
|---|---|---|---|
| 5xxx (`pool: general_post_1.4`) | 21 | current general pool after the **v1.4 (Jan 2025) Cradle rework** | texts match Sportskeeda's v1.4 list (e.g. Bounty Hunter "Attack +2% … up to 5 stacks", Invincible Strike "+2.5% / +3.5% … 10 stacks") and the 2026 in-game hover captures in OHMM (Tactical Combo +15% 4s, Status Enhancement +15% 3s, Steady Hand +10%/+25%, Transient Impact +2.5%×10, Extreme Freezing +2.5%×10, Blazing Detonation +25% 10s, Heavy Strike +25% 8s, Explosives Bonus +5%×5, Bounce Rampage +5%×5, Brawl Boost 5%×5, Deviant Energy Defense +10%). |
| 4xxx (`legacy_general_1.0`) | 5 | launch-era numbers for reworked overrides | Tactical Combo **+25%** (vs 15%), Steady Hand **Weakspot +40% & +20% vs Bull's Eye** (vs +10%/+25%), Deviation Master +25% (unsuffixed row says +50%), Deadly Combo +25% bullet-effect DMG, Brawl Boost "Damage from Metas -20%". |
| 3xxx (`legacy_variant`) | 10 | older full-scale variants (Precise Shot +20%, Speedy Shot +20%, Robust +25%/-30%, Rifle Amplify +1%×20, Ice Blockade +60%, Deviation Handling +30%…) | live status unknown |
| 1xxx / 2xxx and unsuffixed rows with values < 1% (`datamine_placeholder`) | 30 | datamined text whose numbers are **unscaled by ×100** ("Precise Shot Weapon DMG +0.2%" vs the live "+20%"; "Shrapnel DMG 7#+0.2%") | do not use these numbers |
| 9xxx / style Scenario (`scenario_tag_pool`) | 31 | scenario-specific | see above |
| unsuffixed, normal values (`general_unversioned`) | 73 | first OHDB occurrence of a name; most are the live general pool (Handgun/Automatic/Long-Range/Melee Enhancement, Agility, Anti-X, Marked Strike, Critical Precision, Overload, Frost Sense, Prairie Fire Inferno, Master Tactician, Gunner's Gambit, Strategic Genius, Special Ammo…) | when a name also has a 5xxx row, prefer the 5xxx row |

Confidence in this mapping: **medium** (consistent with three independent texts but not confirmed by official notes).

### 2.2 Live general-pool numbers (best estimate; verbatim OHDB text in the JSON)

Weapon-class: Handgun Enhancement **+20% DMG** (pistols/shotguns, reload 1 ammo on kill); Automatic Weapon Enhancement **+20%** (SMG/rifle/LMG, reload 10% mag on kill); Long-Range Enhancement **+20%** (sniper/crossbow, 30% chance reload 1 bullet on kill); Melee Enhancement **+20%** (recover 20% stamina on kill, 3s CD). Anti-Coherence/Anti-Regen (pistol, LMG, melee), Anti-Phase (sniper, SMG, crossbow), Anti-Void (rifle, shotgun, heavy) **+15% DMG** and **+100% vs the matching Super Anomaly** — status after the v2.3.5 (2026-03-25) Super-Anomaly rework unknown.
Conditional: Tactical Combo **Weapon DMG +15% for 4s after swap/reload**; Status Enhancement **Status DMG +15% for 3s after weakspot hit**; Elemental Sense **matching Element DMG +25% for 4s**; Steady Hand **Weapon DMG +10% & Weakspot DMG +25% while Fortress Warfare/Fast Gunner**; Marked Strike **Weakspot +20% vs Bull's Eye**; Critical Precision **Weakspot +30% in scope**; Bounty Hunter **Attack +2%/stack (5) on first mark, Weapon DMG +3%/stack (5) on renew** (alt 5108 row: **+5% Weapon DMG/stack ×6 for 8s on hitting a marked target**); Fast Pursuit **random Attack +3% / Crit Rate +3% / Crit DMG +8% per Fast Gunner trigger, 5 stacks, 12s**; Gunner's Gambit **Reload Speed +20%, Weapon DMG +20% during Fortress Warfare/Fast Gunner**; Heavy Strike **Weapon DMG +25% 8s after Fortress Warfare**; Strategic Genius **Weapon DMG +30% 6s after tactical item**; Master Tactician **+25% vs Great Ones 15s**; Deviation Master **+25% (4xxx) / +50% (unsuffixed) vs bosses & elites while a Deviation is out**; Special Ammo **Weapon DMG +25% 3s after Bounce/Shrapnel weakspot hit**; Deadly Combo **bullet-effect DMG +25% 4s**; Invincible Strike/Tracking Bullet (5xxx) **Shrapnel DMG +2.5% & Shrapnel Crit DMG +3.5% per weakspot hit, 10 stacks, 6s** (Invincible Strike also -50% distance falloff at max); Bounce Rampage **Bounce DMG +5%×5, 15s**; Overload **Power Surge DMG +2.5%/stack ×10 until reload**; Transient Impact (5xxx) **Power Surge DMG +2.5%×10, 6s**; First Round Blast **Instant DMG (Power Surge/Unstable Bomber) +25% 4s after reload**; Explosives Bonus **Unstable Bomber DMG +5%×5, 8s**; Series Detonation **final damage +25%** on re-hit within 3s; Blazing Detonation **Burn DMG +25% 10s** (+1 Burn tick, 3s CD); Heat Agglutination (5xxx) **Burn DMG +5%/Burn stack ×6, 6s**; Prairie Fire Inferno **Blaze DMG +15%/burning unit, max +60%**; Extreme Freezing **Frost Vortex DMG +2.5%×10 + 3% slow, freeze at max**; Frost Sense **Frost DMG +3%×12, 8s**; Sustained Suppression **Continuous DMG +20%×3, 10s** (patched 2024-09-26) / 5007 row **+25% 4s**; Instant Obliteration **Status DMG +25% 3s**; Elemental Charge **Elemental DMG +15% 3s on kill**; Deviation Handling **Status DMG +30% 20s on summon**; Chaotic Thoughts **±10% vs Deviants when Whim from low Sanity**; Shield Protection **DMG to monsters +10%, Deviant DMG Reduction +10% while shield > 40% HP**.
Defensive/utility: Agility **Weapon & Status DMG Reduction +15% 4s after roll**; Dexterity **DMG Reduction +20% 4s after roll**; Deviant Energy Defense **shield 30% Max HP, +10% DMG Reduction, 30s CD**; Resilience (5022) **shield takes 30% less damage**; Lone Walker; Rapid Aid; Sprint **Movement Speed +5%, run stamina -15%**; Side by Side; Energy Surge.
Prismverse's Clash "Specialist" rows: Joint Operations **Weapon & Melee DMG +30% 30s after summoning a Rosetta drone**; Shared Energy **Status & Tactical Item DMG +30% 30s**; Ballistic Synchronization Signal / Neural Stimulation Signal **+30% after Gene Coherence Injection** (duration placeholder `{2}s`); Precise Execution **Crit Rate +25% 3s on Bull's Eye**; Scavenging **normal enemies take +15% DMG**; Dominant Demeanor **Suppression DMG +15%**; Sniper Rifle Weakspot DMG Boost **+30% weakspot in scope, Accuracy +20**.

### 2.3 Disagreements between sources (both values recorded in JSON)

| Override | Value A (newer / picked) | Value B (older) | Source for pick |
|---|---|---|---|
| Tactical Combo | Weapon DMG +15% for 4s (5017; OHMM 2026 capture; Sportskeeda 1.4) | +25% for 4s (4010) | v1.4 rework |
| Status Enhancement | +15% 3s (5018; OHMM) | +25% 3s (unsuffixed) | v1.4 |
| Steady Hand | Weapon DMG +10%, Weakspot +25% (5014; OHMM) | Weakspot +40%, +20% vs Bull's Eye (4016) | v1.4 |
| Bounty Hunter | Attack +2%×5 / Weapon DMG +3%×5 (5118; Sportskeeda 1.4; OHMM) — OHDB row has typo "+3s" | +25% Weapon / +35% Weakspot 15s on kill (unsuffixed, 9401); +5%×6 8s (5108) | v1.4; 5108 may be a later re-tune — unresolved |
| Deviation Master | +25% (4023) | +50% (unsuffixed) | OHMM did not capture; unresolved |
| Sustained Suppression | +20%×3 for 10s on kill (patch 2024-09-26 fix) | +25% 4s on inflict (5007) | 5007 may be the v1.4 text — unresolved |
| Transient Impact | +2.5%×10 6s (5117; OHMM) | +25% PS DMG & +18% Shock 15s on kill (unsuffixed, 9301) | v1.4 |
| Tracking Bullet | +2.5%/+3.5%×10 6s (5103) | +25%/+35% 15s on kill (unsuffixed, 9901) | v1.4 |
| Fast Pursuit | random +3% Atk / +3% CR / +8% CD ×5 (5119) — OHMM registry stores 0.02 for all three (their own simplification) | extra-bullet chance 1%/stack max 20% (unsuffixed); +10% CR & +15% WDMG 15s (9701 scenario) | OHDB text |
| Precise Shot / Speedy Shot / Robust / Rifle Amplify / Ice Blockade / Elemental Surge etc. | full-scale (3xxx) | ×100-unscaled (Gunplay/Element/Defense rows) | obvious scaling artefact |

### 2.4 OHMM registry entries not present in OHDB
OHMM lists "Light/Heavy/Precision Weapon Mastery: Weapon DMG +15%" (pistol+SMG / LMG+shotgun / rifle+sniper+crossbow). No such names exist in OHDB or any snippet; the groupings do not match the Enhancement (+20%) or Anti-X (+15%) overrides. Treated as **unverified/possibly mislabelled** and excluded from the JSON.

## 3. Other global stat sources

### 3.1 Memetic Specializations
Fandom (2024-09-18 scrape): "Every 5 levels, a Memetic Specialization node will be unlocked, which offers a choice among 4 randomly generated Specializations" (one per branch Building/Crafting/Gathering/Management); Identities after 2 picks in a branch (Building: Tinkerer, Artillery Marshal; Crafting: Machinist, Demolition Expert, Master Craftsman; Gathering: Prospector, Smelter; Management: Child of Earth, Sparksmith, Hydro Engineer, Star Chef). game8 snippet: max 10 specializations (Lv 5–50). Prismverse's Clash added Legendary Mayfly / Legendary Rosetta (thebasedotaku snippet; present in TKronix data).
Combat-relevant examples (TKronix verbatim): Extreme Gene — "When HP is below 30%, Weapon DMG +15%, Tactical Item DMG +15%"; Judgment Coherence Injection — "Deviant Fragment: At 10 Coherence, Status DMG +10%. Anima Fragment: At 10 Coherence, Weapon DMG +10%"; Lightning Gene — lightning strike "dealing damage equal to 4,000% Psi Intensity" every 10s; Lightning Impulse Regulator / Pulse Power Device — "Psi Intensity +30% for 60s" when struck by lightning; Frost Armor — shield "200% PSI Intensity" (500% with Ice Crystals); Claymore Mine: Warrior's Resolve — "+400% Psi Intensity damage"; Explosive Throwables: Echo Blast — "+30%" grenade/molotov DMG, extra 400% Psi explosion; Spicy Pepper — dishes "30% more effective"; Kitchen Set: Gourmand — "Based effects of all Dishes +30% … Effect Duration +50%"; Scout Drone: Invisible Hunter — Bull's Eye, +30% drone HP/DMG; Stardust Regulator — 70% HP + 30% Max-HP shield; Speedy Module (Territory Drone) — Tactical Item DMG +30% in another Meta's territory; Focus Module (Territory Drone) — Weapon & Status DMG boost to allies after 10 drone hits (value not stated).

### 3.2 Not stat sources / not found
* **Eclipse Cortex**: purification material → Starchrom (Lv1 70, Lv2 85, Lv3 100 — gamepressure snippet). No combat stats.
* **Deviation "Securement"**: Securement Unit environment affects Deviant Mood/Deviant Power recovery only (official Deviation wiki snippet). Combat-deviant buffs belong to the Deviants facet; snippet numbers kept with low confidence: Lonewolf's Whisper "increases weapon damage received by enemies by 21.6%", Mini Feaster "+17% Weapon dmg per tentacle with a max of 70%" (oncehuman.wiki).
* **Mementos**: no such system; "R500 - Memento" is a pistol.
* **Season/Journey passives, Loadout skill trees**: none found; the only season-scoped combat passives are the Scenario-tag Cradle overrides (9xxx) and scenario-specific Memetics (Way of Winter identities, Prismverse's Clash legendary paths).
* **Gear / power level**: no damage-scaling formula found; level gates tiers (Lv30 → Tier IV, Lv40 → Tier V — Steam guide snippet).

### 3.3 Stacking model (community; needed to apply cradle %)
ADR-002 (0x91CEA55, 2026-03-03): "Once Human uses *many* separate additive pools, each of which becomes its own multiplicative factor … Crit DMG and Weakspot DMG are also additive within a single 'Hit Amplifier' bucket". OHCalc validation plan: `weakspotCrit / body = 1 + critDamage + weakspotDamage`. Bible: "DMG Factor" and "DMG Coefficient" additive within one bucket ("The 113 Test"); "Final DMG"/"Ultimate DMG" a separate multiplicative bucket. Status procs: `psiIntensity × coefficient × (1+statusDMG) × (1+elementDMG)` (OHCalc). → cradle "Weapon DMG +X%" adds into the Weapon-DMG bucket with mods/sets; "Status DMG +X%" into the Status bucket; "Weakspot DMG +X%" adds to the hit-amplifier sum.

## 4. What could not be found / verified
1. Override unlock cost & currency (null).
2. Cradle node unlock rule for 2025–2026 scenarios (Prismverse's Clash, Endless Dream, Isles of Abyss…).
3. Whether Anti-Coherence/Void/Phase/Regen overrides survived the v2.3.5 (2026-03-25) Super-Anomaly rework, and what v3.0.6 (2026-09-16) "combat balance adjustments" changed.
4. Which Bounty Hunter / Sustained Suppression / Deviation Master variant is live today.
5. Durations for Ballistic Synchronization Signal / Neural Stimulation Signal (`{2}s` template in OHDB).
6. OHDB scrape date (saitoh183 repo pushed 2026; commit dates not retrievable through the gated API).
7. Any official formula for how overrides interact (all stacking rules are community-derived).
