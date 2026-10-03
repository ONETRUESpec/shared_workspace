# Once Human — Weapon & Armor Mods research notes (facet: mods / substat system)

Generated 2026-10-03. Data file: `data/mods.json`. Summary: `research/mods.summary.json`.

## 0. How this research was done (and what blocked it)

* The session's egress proxy returned **403 (policy denial)** for every game site tried by WebFetch *and* curl:
  once-human.fandom.com, oncehuman.wiki.gg, oncehuman.wiki, game8.co, oncehumandb.com, wikily.gg, ohdex.gg,
  oncehuman.th.gl, meta-builds.net, oncehuman.game, steamcommunity.com, store.steampowered.com, reddit.com,
  primagames.com, metaforge.app, mmorpg.com, bluestacks.com, vortexgaming.io, youtube.com, wikipedia.org, docs.google.com.
  Per the proxy README these are organisation policy denials and were not worked around.
* **WebSearch** worked for 11 queries, then the session-wide budget (200/200) was exhausted. Snippets from those 11
  queries are quoted below.
* **raw.githubusercontent.com** was reachable, and the orchestrator had cached several community calculators'
  datasets in the shared scratchpad. Those (plus upstream raw files) are the backbone of the dataset:
  * **OnceHumanDB (OHDB) mod scrape** — `saitoh183/once-human-build-planner/data/mods.json` (773 rows = 105 unique
    legendary mods × suffix variants; identical md5 upstream vs cache). Each row: name, slot, variant (suffix), effect text, OHDB URL.
  * **0x91cea55/OnceHuman** — `raw.json` v1.3.0 (2026-03-01; OCR of in-game mod screens, Factor/Final bucket
    classification, suffix tier values, substat notes), `INGAME_KNOWLEDGE_BIBLE.md` (2026-03-05; in-game screenshot
    transcriptions incl. Lunar/Crescent suffix percentages), and the gh-pages bundle (substat tier table `Vue`).
  * **bramsey** dataset — Game8 "All Mods List" values with tiers I–V (legacy, pre-2.3.1).
  * **lredragol** example builds — per-build `mod_secondary_attributes` (the fixed sub-attribute names of the new system).
  * **joseph** bilingual optimizer (meta-builds.net data) — `SUFFIX_VAL` / `SUFFIX_HP` tables (explicitly *estimates*).
  * **smus-rgb/once-human-guide** `ohg_data.js` — version marker `2026-09-30-v18-372`, **Patch 3.0.7**; low-detail mod list.
  * **thachvn0296/OH-Calculator** — generic stat grid (Weapon/Weakspot/Crit/Elemental/Status/Element-Final/All-DMG); no mod data.

## 1. Sources (URLs)

Official / news
* https://www.oncehuman.game/news/devBlog/20251212/40781_1276354.html — Dev blog "mod system optimization" (12 Dec 2025) — via search snippet
* https://www.oncehuman.game/news/update/20260121/40780_1282991.html — Version 2.3.1 (21 Jan 2026) — via bramsey source registry
* https://www.mmorpg.com/news/equipment-mod-changes-are-coming-to-once-human-to-make-progression-easier-2000136844 — via snippet
* https://www.oncehuman.game/wiki/20230201/37492_1071059.html — Weapon & Equipment guide (attachment categories) — via snippet
* https://www.oncehuman.game/news/devBlog/20241123/40781_1195665.html — Bounce rework dev blog (bramsey registry)

Databases / wikis (via cached scrapes or snippets)
* https://www.oncehumandb.com/mods (scrape: https://raw.githubusercontent.com/saitoh183/once-human-build-planner/main/data/mods.json)
* https://www.oncehumandb.com/items/vulnerability-amplifier ; https://www.oncehumandb.com/mods/shrapnel-smash-shrapnel ; https://www.oncehumandb.com/mods/blaze-amplifier-burn
* https://0x91cea55.github.io/OnceHuman and https://raw.githubusercontent.com/0x91cea55/OnceHuman/gh-pages/assets/index-DXU_nBNN.js
* https://game8.co/games/Once-Human/archives/460076 ; /468371 ; /468372 (via bramsey)
* https://once-human.fandom.com/wiki/Mods ; /wiki/Shrapnel_Carnage ; /wiki/Dark_Resonance_Set (snippets)
* https://wikily.gg/once-human/mods/19201115/ (Precise Strike) ; /mods/37001002/ (Shrapnel Smash) ; /mods/19206115/ (Blaze Amplifier) (snippets)
* https://ohdex.gg/mod-list (bramsey snapshot: placement filter list)
* https://primagames.com/gaming/once-human-mods-guide-all-locations-and-tier-list ; https://metaforge.app/once-human/once-human-every-gold-mod (snippets)
* https://www.bluestacks.com/blog/game-guides/once-human/ohn-frost-vortex-build-en.html (Vortex Multiplier snippet)

Community
* https://steamcommunity.com/sharedfiles/filedetails/?id=3479129708 — Mod Conversion Guide (snippet)
* https://steamcommunity.com/app/2139460/discussions/0/4854406759567050488/ — "Mods and how to get them" (snippet)
* https://steamcommunity.com/app/2139460/discussions/0/7073555334572500765/ — "Resonance mod, what does this means" (snippet)
* https://kahzgul.substack.com/p/near-as-i-can-tell-a-quick-and-dirty (listed, unreachable)
* https://github.com/saitoh183/once-human-build-planner ; https://github.com/thachvn0296/OH-Calculator ; https://raw.githubusercontent.com/smus-rgb/once-human-guide/main/ohg_data.js ; https://meta-builds.net/api/get/allData (joseph's data source)

## 2. Exact quotes captured from search snippets

* Dev blog (Dec 2025): "Mod level is determined by the sum of a mod's sub-attribute levels, up to a maximum of level 17. A higher mod
  level means higher sub-attribute levels. For example, a legendary mod at level 10 has sub-attribute levels of 3, 3, 2, and 2."
  "for Legendary mods at level 17, the sub-attribute distribution is: Sub-Attribute 1 Level = 5, Sub-Attribute 2 Level = 5,
  Sub-Attribute 3 Level = 5, and Sub-Attribute 4 Level = 2." "the four sub-attributes are no longer randomly generated, but fixed to
  match the mod's core traits."
* Steam "Mods and how to get them": "Enhancing a mod will increase the stat of a random attribute that the mod currently has. The quality
  of the random attribute will not change, only the stat itself." "you can upgrade a mod 5 times to make it level 10 ... intermediate quality".
* Steam Mod Conversion Guide: "Mods have substats of different rarities: Common, Rare, and Epic. The upgrade rules are: 4 Common = 1 Rare,
  and 3 Rare = 1 Epic." Base pool: "Weapon/status damage, damage to normal/elite/great ones, damage reduction from weapon/status/weakspot
  damage, reload speed, mag size, and HP bonus ... the magnitude of the bonus depends on the rarity level of the bonus stat".
* Steam Resonance thread: "Resonance suffix increases sustained damage output when dealing Weakspot, Crit, and Elemental DMG, and is
  available on pants and gloves in the Prime War."
* Vortex Multiplier (Frost Vortex build guide): "increases the maximum number of Frost Vortexes by +1 and boosts Frost Vortex damage by 10%";
  "fixed attribute that adds Frost Vortex DMG +6.0%, with linked attributes including Frost Vortex Trigger Chance +6.0%, Frost Vortex
  Duration +15.0%, and Frost DMG +6.0%"; "can be enhanced up to five times"; drops Monolith of Thirst (Normal), Monolith of Greed (Hard/Pro), LEA Research Lab (Pro).
* Shrapnel Smash: older "1% for 2 seconds ... up to 20 times" vs newer (OHDB) "+2% for 2s ... up to 15 times".
* Shrapnel Carnage (Fandom): "chance of Shrapnel hitting Weakspots increases by 100%, and Shrapnel Weakspot DMG increases by 25%" (mask).
* Deadshot: "Each Crit Hit by non-melee weapons grants +5% Crit DMG, up to 45%" — "from Securement Silo PSI".
* Precise Strike (Wikily): "quality 4 Gear Mod ... hitting a weakspot grants Weakspot DMG +12% for 3s ... stack 3 times" — Silo ALPHA / Silo Taurus.
* Vulnerability Amplifier (OHDB): "The Bull's Eye's Vulnerability effect is increased" — Arachsiam (Mirage Monolith) / Forsaken Giant (Emberdust Monolith).
* Blaze Amplifier: "Every stack of Burn grants +3% Psi Intensity DMG" — Silo EX1, Chalk Peak.
* metaforge snippet (gold mods): "Crit DMG Boost provides Crit Rate +14.0%", "Crit Amplifier ... Crit DMG +30.0%", "Weakspot DMG Boost ... +30.0%",
  "First-Move Advantage ... Weapon DMG +10.0% within 2 seconds after reloading", "Slow and Steady ... +10.0% Melee, Weapon, Status DMG".
  **These conflict with OHDB (Crit Amplifier 10%/15%, Weakspot DMG Boost 25%, First-Move Advantage CR+10/CD+20) — treated as outdated/garbled; OHDB preferred.**
* Armor-mod silos (Game8/Prima snippet): Helmet → ALPHA, Mask → EX1, Top → THETA, Gloves → Sigma, Pants → PSI, Shoes → PHI.
* Attachments: "five categories of accessories ... Muzzle, Optic, Tactics, Magazine, and Ammo" (separate from mods).
* Dark Resonance Set (v2.3.1, armor set, not a mod): 1pc ult → 10% shield 10s; 2pc Deviant Power not full → weapon & Status DMG +12%; 3pc per Energy → +0.6% up to 30%; 4pc Battle Skill consumes 30 Deviant Power, CD −50%.

## 3. OHDB mod list (current) — 105 unique legendary mods

All 773 OHDB rows are rarity *legendary*; identical names across suffix variants share identical effect text (0 differences found).
Slot counts (OHDB names): Weapon 38, Mask 19, Bottoms 11, Helmet 10, Top 10, Shoes 9, Gloves 8. After merging duplicate-name pairs the data file holds 36 weapon mods (+1 legacy Vortex Multiplier entry = 37) and 64 armor mods (101 mod records), plus 23 legacy Game8 tier rows.
Duplicate-name pairs merged: Precise Rush = Precision Rush, Shrapnel Loot = Shrapnel Souvenir, Precise Charge = Precision Charge,
Precise Bounce = Precision Bounce, Steady Hand = Slow and Steady. Full effect texts are in `data/mods.json`.

Suffix (variant) families observed, by slot:
* Weapon: General, Violent, Precision, Deviant Energy, Survival + the mod's keyword (Burn, Fast Gunner, Bounce, Unstable Bomber, Frost Vortex, Fortress Warfare, Shrapnel, Power Surge, The Bull's Eye)
* Mask: General, Violent, Precision, Survival, (Deviant Energy on Psi-keyword mods) + keyword suffix
* Helmet: General, Violent, Precision, Deviant Energy, Survival, Crescent(+DE), Lunar(+DE)
* Gloves: General, Violent, Precision, Deviant Energy, Survival, Crescent(+DE), Resonance(+DE)
* Bottoms: General, Violent, Precision, Deviant Energy, Survival, Downstar(+DE), Resonance(+DE)
* Top: General, Violent, Precision, Deviant Energy, Survival, Battle, Lunar(+DE), Mirror(+DE), Wild(+DE), Phantasmal(+DE)
* Shoes: General, Violent, Precision, Deviant Energy, Survival, Battle, Downstar(+DE), Mirror(+DE), Wild(+DE), Phantasmal(+DE); Steady Hand: Fury, Resistance

## 4. Substat / suffix values — what was found and where sources disagree

| Stat | 0x91 bundle ladder (T1..T5) | 0x91 raw.json | joseph estimate (legendary) |
|---|---|---|---|
| Crit DMG | 3/6/9/12/15 | Violent suffix 3/6/9/12/15; legendary_max 15 | Violent 12 |
| Weapon DMG | 2/4/6/8/10 | legendary 6 (common 1.2) | General 2.4 |
| Weakspot DMG | (no table) | Precision suffix 1.8/3.6/5.4/7.2/9 **but** legendary_max 15 | Precision 7.2 |
| Elemental DMG | 2/4/6/8/10 | 'Talents' suffix 1.6/3.2/4.8/6.4/8; legendary_max 8 | Deviant Energy 8 (as Status) |
| Status DMG | 2/4/6/8/10 | legendary_max 6 | — |
| Attack % | 1/2/3/4/5 | — | — |
| DMG vs Normal/Elite/Boss | 1.5/3/4.5/6/8 | — | — |
| Burn Trigger Chance (Burn suffix) | — | legendary 6 (two pieces = 12) | kw 8 |
| Max HP / DMG Red. (Survival) | — | HP example 12 | 4.8 / 3.2 |

Pick: use 0x91 raw.json suffix tables (Violent 15 / Precision 9 / Deviant-Energy 8 at legendary) as the "guaranteed first
sub-attribute" values with **low confidence**; the joseph values are exactly the Epic step (×0.8) and are self-declared estimates.

Lunar / Crescent (0x91 screenshot `LunarCrescentSubstatPercents.png`, medium confidence):
* Lunar (legendary peak, low HP): Crit DMG +30%, Elemental +16%, Weapon/Status +12%; Epic = 80% of gold.
* Crescent (base + extra at ≥40% Shield): Crit DMG 10+15 = 25%; Elemental 5+8 = 13%; Weapon/Status 4+6 = 10%.

Fixed sub-attribute names (post-2.3.1) observed per slot (lredragol builds): weapon = keyword DMG / trigger chance / duration /
element DMG + Weapon DMG, Crit DMG, Weakspot DMG, Mag Capacity, Reload Efficiency; helmet = Crit Rate, Crit DMG, Weapon DMG,
Weakspot DMG, Elemental DMG; mask = keyword trigger chance / DMG / duration + Status DMG, Weapon DMG; top = Weapon DMG, Crit Rate,
Reload Efficiency, DMG vs Normal; gloves = Crit DMG, Weakspot DMG, Weapon DMG, Elemental DMG, Status DMG, element DMG, DMG vs Normal;
bottoms = Crit Rate, Crit DMG, Weapon DMG, Mag Capacity, DMG vs Normal, keyword duration/crit; shoes = Mag Capacity, Reload Efficiency, Weapon DMG, DMG vs Normal.

## 5. Disagreements between sources on mod effects (recorded in `notes` per mod)

* Shrapnel Smash: 1%×20 (older) vs 2%×15 (OHDB, 0x91 bible) → 2%×15.
* Three Strikes: +30% (0x91 raw) vs +50% (OHDB/bible) → 50%.  Light Cannon: Attack +12% vs +15% → 15%.
* Distant Strike/Unstoppable: +10% (0x91 raw) vs +20% base beyond 20 m (OHDB/bible) → 20%.
* Delayed Blast: every 5 hits (0x91 raw) vs every 4 (OHDB/bible) → 4.  Durable Territory: kill-based 5s×5 (0x91 raw) vs hit-based 1s up to 5s (OHDB) → OHDB.
* Quick Comeback ↔ Rejuvenating texts swapped in 0x91 raw.json vs OHDB/bible → OHDB.  Head Guard: "head not a weakspot >70% HP" (0x91 raw) vs Weakspot DMG Reduction 15%+15% → OHDB.
* Weakspot DMG Boost 30% (metaforge snippet) vs 25% (OHDB) → 25%.  Crit Boost gloves: IV 12% (Game8) vs 15% (OHDB) → 15% current.
* Slot disagreements in 0x91 bundle (Momentum Up → Top, Fateful Strike → Mask, Deviation Expert → Weapon) vs OHDB (all Helmet) → OHDB.
* Elemental Resonance: 0x91 bundle flat +20% "simplified" vs OHDB ramp (+1%/instance, max 24%) → ramp.

## 6. Mechanics summary (see `levelling`, `suffixes`, `damageBuckets` in the data file)

* 1 mod slot per weapon; 1 per armor piece; armor mods slot-specific; weapon mods universal to ranged weapons (keyword-gated); melee weapons use melee placement.
* New system (2.3.1): 4 fixed sub-attributes, levels 1–5 each, mod level = sum (max 17; 5/5/5/2 legendary), Shiny at 17.
* Legacy: 4 random substats (Common/Rare/Epic), conversion 4C→1R, 3R→1E, enhance ×5 → Lv10 (random substat value up).
* Factor vs Final buckets (0x91): Break Bounce, Frostwave Wither, Pinpoint Strike confirmed Final; "Ultimate DMG" = Final.
* No mod-set mechanic; "Resonance" is a suffix (Prime War gloves/pants) or a name component.

## 7. Could not find
* Per-level values of fixed sub-attributes (levels 1–5); Shiny main-stat bonus; exact Mirror/Wild/Phantasmal/Downstar/Battle/Resonance/Aero numbers;
  whether Vortex Multiplier / Vortex Overcharge / Targeted Bounce / Point Detonation / Lingering Frost / Elemental Amplifier are current; patch-by-patch
  mod changes 3.0.0–3.0.7; substat counts for non-legendary mods; whether Fire Rate / Movement Speed / Psi Intensity / Pollution Resist can be sub-attributes.
