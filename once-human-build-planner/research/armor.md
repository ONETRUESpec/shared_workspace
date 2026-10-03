# Once Human - Armor research notes (facet: armor sets, pieces, set bonuses, star scaling)

Generated 2026-10-03. Data file: `data/armor.json`. Summary: `research/armor.summary.json`.

## 0. Access caveats (read first)

* The network egress proxy blocked every game-wiki / DB / news domain (once-human.fandom.com, oncehuman.wiki.gg, oncehumandb.com, meta-builds.net, game8.co, oncehuman.game, steamcommunity.com, reddit, mmorpg.com, massivelyop.com, wikily.gg, web.archive.org ...). Only `raw.githubusercontent.com` and the GitHub MCP code search were reachable.
* The session's WebSearch budget (200 calls, shared across sibling agents) ran out after ~20 queries for this facet. Search-result summaries that were obtained are quoted below with their URLs.
* Everything else comes from GitHub-hosted **mirrors / exports of the primary sites**: an oncehumandb.com scrape (saitoh183, TeeReckzi/OHMM, lReDragol), a meta-builds.net API export (`allData.json`, game v3.0.5, fetched 2026-09-25), a Korean DB dump (nohvenell2), an in-game screenshot OCR knowledge base (0x91CEA55, 2026-03-01), and a Czech companion-app dataset tagged patch 3.0.7 (smus-rgb, 2026-10-01).

## 1. Sources used

| # | URL | What it gave | Date / version |
|---|-----|--------------|----------------|
| 1 | https://raw.githubusercontent.com/lReDragol/OnceHuman_Tools/master/data/menu/calc/bd_json/all_armor_stats.json | Full base-stat table `items[slot][rarity].stars[1-6].levels[1-5]` = {hp, pollution_resist, psi_intensity} + legacy calibration bonuses | pre-2.3.1 (OHDB + Korean mirror) |
| 2 | https://raw.githubusercontent.com/lReDragol/OnceHuman_Tools/master/data/menu/calc/bd_json/items_and_sets.json | 20 sets with 1/2/3/4-piece text (scraped from oncehumandb.com set pages), 159 items with OHDB base stats, tier multipliers | OHDB scrape 2025-2026 |
| 3 | https://raw.githubusercontent.com/lReDragol/OnceHuman_Tools/master/data/menu/calc/player.py | How the calculator applies star / level / calibration; max stars per rarity | - |
| 4 | https://raw.githubusercontent.com/0x91CEA55/OnceHuman/main/research/INGAME_KNOWLEDGE_BIBLE.md | OCR of in-game "SetEffectsOverview" screenshot: exact text for 12 set bonuses; 33 key-armor effects | 2026-03-02 |
| 5 | https://raw.githubusercontent.com/0x91CEA55/OnceHuman/main/research/data/custom-datamine/raw.json | Tier V 6-star base stats post-2.3.1 (slot x rarity), 12 sets, key armor, "calibration removed" note | 2026-03-01 |
| 6 | https://raw.githubusercontent.com/0x91CEA55/OnceHuman/main/research/data/custom-datamine/all-old.json | Older set text (Bastille 2pc 20%, Vulnerability clause, Blast 3pc) | 2026-02 |
| 7 | https://raw.githubusercontent.com/saitoh183/once-human-build-planner/main/data/armor.json | OHDB armor list: 159 pieces, slot, rarity, Tier I HP | 2026 |
| 8 | https://raw.githubusercontent.com/TeeReckzi/OHMM/main/src/ohai/src/presentation/ohdb/armor.json | Same OHDB list (independent scrape) | 2026 |
| 9 | https://raw.githubusercontent.com/TeeReckzi/OHMM/main/src/ohai/data/raw/external-references/once_human_english_reference.json | OHDB item pages incl. HP / Pollution Resist / Psi lines at Tier I and Tier V 6-star | 2026-05 |
| 10 | https://raw.githubusercontent.com/TeeReckzi/OHMM/main/src/ohai/src/ui/registries/generated/armor-sets.generated.ts | 22-set roster (incl. Test Subject, Rustic (Tundra)) | 2026-06 |
| 11 | https://raw.githubusercontent.com/nohvenell2/oncehuman_module/main/src/data/armor_raw.json | Korean DB dump: per-slot Tier V stats (hp/res/psi), key-armor KR text, styles | 2025 |
| 12 | https://raw.githubusercontent.com/josephfmmarzin-ai/ONCE_HUMAN/main/data/metabuilds/allData.json | meta-builds.net API export: 20 sets with bonus_one..four, 231 gears incl. key armor descriptions (Wind Interpreter Cap, Ankh Mask, Glide Pants, Magnetic Moment Top, Ghost Link pieces) | game v3.0.5, fetched 2026-09-25 |
| 13 | https://raw.githubusercontent.com/josephfmmarzin-ai/ONCE_HUMAN/main/data/details/sets.json | OHDB-derived set text (21 sets) | 2026-09 |
| 14 | https://raw.githubusercontent.com/smus-rgb/once-human-guide/main/ohg_data.js | Patch 3.0.7 companion data: Treacherous Tides 3.0.6 rework summary, Ghost Link 3.0.4 note, 3.0.1 / May-2026 key pieces | 2026-10-01 |
| 15 | https://raw.githubusercontent.com/bramsey679/Once_Human_DPS_Calculator/main/data/armor.json | Prickly Dance Pants alt text | 2026 |
| 16 | once-human.fandom.com set pages (via search summaries only): Lonewolf, Savior, Dark_Resonance, Renegade, Treacherous_Tides, Bastille, Falcon, Shelterer, Agent, Scout, Raid_Set_(Armor), Blackstone, Ghost_Link, Gravity_Tide, Stormweaver, Armor | set text, release versions/dates, Starchrom costs | 2026 |
| 17 | https://www.oncehumandb.com/armor-sets (+ /armor-sets/heavy-duty-set, /guides/best-armor-sets) via search summaries | 22-set count, Heavy Duty, Scout, Raid text | 2026 |
| 18 | https://www.oncehuman.game/news/devBlog/20260916/40781_1314019.html (3.0.6, 2026-09-16), https://www.oncehuman.game/news/devBlog/20260910/40781_1313572.html, https://www.mmorpg.com/news/once-human-announces-some-combat-balance-reworks-coming-next-week-2000138901, https://massivelyop.com/2026/09/11/once-human-is-buffing-a-machine-gun-and-a-set-of-named-armor-next-week/ (search summaries) | Treacherous Tides rework numbers | 2026-09 |
| 19 | https://www.oncehuman.game/news/devBlog/20260116/40781_1282292.html (Dark Resonance, 2.3.1), https://www.oncehuman.game/news/devBlog/20260702/40781_1306465.html (3.0.1 anniversary armor) | new-set announcements | 2026 |
| 20 | https://paradoxgaming.net/gamearticle.php?id=sixstarblueprints, https://wikily.gg/once-human/armor-blueprints/, https://game8.co/games/Once-Human/archives/462429 (search summaries) | star upgrade costs, "stars raise HP/Psi" statement | 2025-26 |

## 2. Slot base stats (Tier I, 1-star) - three independent OHDB mirrors agree exactly

| Slot | Legendary HP/Psi | Epic | Rare | Uncommon | Pollution (OHDB now) | Pollution (legacy KR/lReDragol) |
|------|------|------|------|------|------|------|
| Helmet | 60 / 16 | 54 / 14 | 48 / 13 | 42 / 11 | 3 | 9 |
| Mask | 30 / 20 | 27 / 18 | 24 / 16 | 21 / 14 | 4 | 12 |
| Top | 156 / 11 | 140 / 10 | 125 / 9 | 109 / 8 | 4 | 12 |
| Gloves | 90 / 12 | 81 / 11 | 72 / 10 | 63 / 8 | 3 | 9 |
| Pants | 144 / 13 | 130 / 12 | 115 / 10 | 101 / 9 | 3 | 9 |
| Shoes | 120 / 8 | 108 / 7 | 96 / 6 | 84 / 6 | 3 | 9 |

Full legendary Tier I set = 600 HP (also quoted by the search summary of game8/OHDB: "60 + 30 + 156 + 144 + 90 + 120 = 600").
Base stats are identical for every piece sharing slot + rarity, regardless of set or key-armor status (0x91: "All pieces of same slot/rarity/stars share identical base stats").

## 3. Tier (I-V) scaling - from `all_armor_stats.json` (1-star column) and `items_and_sets.json` multipliers

* HP x 1 / 1.3333 / 2.6667 / 5.3333 / 9.8333 (legendary helmet 60, 80, 160, 320, 590).
* Psi x 1 / 1.5 / 2.375 / 3.75 / 5.75 (legendary 16, 24, 38, 60, 92). Other rarities differ slightly by rounding (epic T5 = 5.93x, rare 5.69x, uncommon 5.82x).
* Pollution Resist (legacy): helmet/gloves/pants/shoes 9, 12, 15, 18, 21; mask/top 12, 16, 20, 24, 28.
* Korean dump "craft 5" values (590/21/92 helmet, 295/28/115 mask, 1534/28/64 top, 1416/21/74 pants, 885/21/69 gloves, 1180/21/46 shoes) match the lReDragol Tier V 1-star row exactly -> same data lineage.

## 4. Star (1-6) scaling - `all_armor_stats.json` Tier V rows

Legendary Tier V by star (HP / Psi; pollution flat 21 or 28):
* Helmet 590/92, 620/97, 649/101, 678/106, 708/110, 738/115
* Mask 295/115, 310/121, 324/127, 339/132, 354/138, 369/144
* Top 1534/64, 1611/67, 1687/70, 1764/74, 1840/77, 1918/80
* Pants 1416/74, 1487/78, 1558/81, 1628/85, 1699/89, 1770/92
* Gloves 885/69, 929/72, 974/76, 1018/79, 1061/83, 1106/86
* Shoes 1180/46, 1239/48, 1298/51, 1357/53, 1416/55, 1475/58

=> **stat(star) = stat(1-star) x (1 + 0.05 x (star-1))**, i.e. 6-star = 1.25x; applies to HP and Psi; Pollution does not change with stars. Lower-star Tier I-IV rows that exist in the file obey the same +5%/star rule (e.g. legendary helmet T1: 60, 63, (66), 69, ...).
Max stars in the table: legendary 6, epic 5, rare 4, uncommon 3 (also hard-coded in `player.py`). Caveat: OHDB shows epic pieces at 6-star-like values (Agent Mask 333 = 266 x 1.25), so epic may actually cap at 6 in-game.

The lReDragol calculator also contains a generic `star_multipliers {1:1.0 ... 6:1.5}` / `level_multipliers {1:1.0 ... 5:1.2}` in `calculate_stats()`, but its armor path (`get_stats()`) reads the real table above; the generic multipliers are NOT used for armor.

## 5. Three "generations" of Tier V legendary values and how they reconcile

| Source | Helmet | Mask | Top | Pants | Gloves | Shoes | Pollution | Psi |
|---|---|---|---|---|---|---|---|---|
| lReDragol / Korean, T5 1-star (pre-2.3.1) | 590 | 295 | 1534 | 1416 | 885 | 1180 | 21/28 | 92/115/64/74/69/46 |
| lReDragol T5 6-star (pre-2.3.1) | 738 | 369 | 1918 | 1770 | 1106 | 1475 | 21/28 | 115/144/80/92/86/58 |
| OHDB T5 6-star pages (OHMM reference, "Durability 400" rows) | 740 | 370 | 1924 | 1776 | 1110 | 1480 | 12/16 | 92/115/64/74/69/46 (stale psi) |
| 0x91 OCR T5 6-star post-2.3.1 (2026-03-01) | 925 | 462 | 2405 | 2220 | 1388 | 1850 | 12/16 | 115/144/80/92/86/58 |

* OHDB 6-star HP = 1.2542 x T5 1-star; lReDragol = 1.25 x (rounding).
* Post-2.3.1 HP = exactly 1.25 x the pre-2.3.1 6-star HP for every slot; Psi unchanged; Pollution re-based to 12 (helmet/pants/gloves/shoes) / 16 (mask/top). 0x91: "Post-2.3.1: Calibration system removed. Stats determined by rarity and star level." Legacy calibration (removed) gave HP +18/36/48/60/70/80 % and Psi +8/16/24/30/35/40 % at calibration 1-6 (max calibration 2 at T1-2, 4 at T3-4, 6 at T5).
* Epic post-2.3.1 6-star OCR: helmet 813/12/101, mask 406/16/127, top 2113/16/71, pants 1950/12/81, gloves 1219/12/76, shoes 1625/12/50 (ratio to Tier I base ~15.05x vs legendary 15.42x - not perfectly consistent; treat as observed values).
* Recommended current-game model: HP(T5, star) = baseT1 x 9.8333 x 1.25 x (1 + 0.05(star-1)); Psi(T5, star) = baseT1 x 5.75 x (1 + 0.05(star-1)).

Search snippet (wikily.gg armor-blueprints): "Blueprint enhancement tiers further increase the HP and Psi Intensity of armor across all their blueprint tiers, with the amount of stars a blueprint has representing its enhancement tier." Search snippet (paradoxgaming): "Leveling a legendary blueprint from one to six stars requires 29,600 experience, with the cost to go from 5 -> 6 stars being 10,000 XP from Fragment XP or 15,000 Starchrom ... key armor pieces costing 8,000 Starchrom and individual pieces costing 3,000."

## 6. Set bonuses - picked text, disagreements, provenance

Roster (23 entries in data): Lonewolf, Bastille, Savior, Treacherous Tides, Renegade, Shelterer, Stormweaver (2.1.1, 2025-08-13), Gravity Tide (1.6.1, 2025-05-21), Dark Resonance (2.3.1, 2026-01-21), Ghost Link (3.0.1, 2026-07-09), Blackstone / Blackstone (Cold) / Blackstone (Heat) [legendary]; Falcon, Agent, Heavy Duty, Snow Panther [epic]; Scout, Raid, Blast [rare]; Rustic, Snowland Rustic, Test Subject [uncommon]. OHDB counts "22 armor sets" (it does not list Test Subject). No source lists any set released after Ghost Link (3.0.1) as of patch 3.0.7.

Exact OCR table (0x91 `SetEffectsOverview.png`, 2026-03) was used as the primary text for: Lonewolf, Savior, Treacherous Tides (pre-3.0.6), Renegade, Shelterer, Bastille, Stormweaver, Agent, Heavy Duty, Falcon, Snow Panther, Dark Resonance. Key disagreements:

* **Lonewolf 3pc**: OCR/meta-builds/fandom "After landing 2 critical weapon hits, gain 1 stack of Lone Shadow. Crit DMG +6% for 30s. Max 8" vs OHDB mirror "every 4 Crit shots ... 20s" (older). 4pc: OCR "+8% Crit Rate for 2s after reloading" vs OHDB "+10%" vs meta-builds "after a kill +8%". Pick: 2 crits / 30s / 8 -> 10 stacks / +8% after reload.
* **Bastille 2pc**: 15% (OCR, OHDB, fandom) vs 20% (meta-builds v3.0.5, 0x91 all-old). Pick 15%. meta-builds adds to 4pc: "If the shield drops to 0 during Bastille state, you gain a 30% Vulnerability effect."
* **Renegade 1pc**: 10% (OCR, OHDB) vs 15% (meta-builds, one fandom snippet). Pick 10%.
* **Savior**: three versions. OCR+fandom (picked): 1pc Medicine Cooldown Haste 0.2; 2pc shielded -> Weapon & Status +10%; 3pc "Consumes 8% of current HP upon hit to generate a temporary shield equal to 5% of Max HP, lasting 30s (Cooldown: 0.5s; when shield exceeds 40%, hits landed will refresh shield duration and damage boost timer without deducting HP). When HP is consumed, Weapon and Status DMG +5%, stacking up to 4 stack(s), lasting 12s"; 4pc auto-use least potent treatment <30% HP (cd 40s). OHDB: 3pc "6% HP -> 6% shield, no trigger if shield > 60%". meta-builds v3.0.5 carries the launch-era text (2pc HP>70% +10%; 3pc auto-heal; 4pc "After using an Activator, Movement Speed +20%, all DMG +20% and cloak for 2s. 20% DMG Reduction on torso and limbs for 20s").
* **Treacherous Tides**: OHDB mirror text ("Movement Speed +8% / Max Load +40 / Logging and Mining Speed +25%") is a scrape error -> discarded. Pre-3.0.6 (OCR/fandom/meta-builds): 1pc Weapon DMG Reduction 10%; 2pc HP<70% -> Weapon & Status +12%; 3pc low-Sanity HP penalty -40%, +10% rising to +28% at 30% Sanity; 4pc shield 20% Max HP when HP<40%, cd 8s. 3.0.6 (2026-09-16) per mmorpg.com / oncehuman.game / smus: "DMG bonus scales with HP instead of sanity; fixed 10% removed from 3pc; 4pc shield increased"; follow-up: "2-piece restored from 10% to 12%; 3-piece base at 100% HP increased from 0% to 8%, max remains 28%". New 4pc shield value not found.
* **Falcon 4pc**: "Max Stamina +25. Recover 30 Stamina instantly with a kill" (OCR, fandom, meta-builds) vs OHDB text that duplicates Blast 4pc. Pick OCR.
* **Gravity Tide 3/4pc**: fandom "+2% per stack up to 12; 4pc >8 stacks +15%, 30m -> no decay 30s" vs meta-builds "+1.5% up to 15, lose 1 stack/5s; 4pc >10 stacks +10%, 20s". Unresolved; fandom picked, both stored.
* **Blackstone 2pc trigger interval**: 0.5s (OHDB, meta-builds, joseph) vs 2s (fandom snippet). 3pc Warm range 10-30 C (OHDB, meta-builds) vs "10-20" (snippet). Picked 0.5s / 10-30.
* **Raid 3pc**: +20% (fandom, meta-builds) vs +15% (OHDB). Picked 20%.
* **Blast 3pc**: meta-builds/0x91-old "next melee +25% within 5s, swing speed +15%" vs OHDB "5 Prime Energy, next melee +20%". Picked meta-builds (newer fetch), low confidence.
* **Ghost Link**: fandom and meta-builds agree (1pc Crit Rate +3%; 2pc Reload Efficiency +15%; 3pc Sync +3% Weapon DMG per weapon hit, max 10, 5s; 4pc at 10 Sync -> Overload = 50% Psi Intensity Status DMG per second to target + 3m, 5s). smus: "3pc conditions adjusted in 3.0.4 balance pass" (details unknown).
* **Dark Resonance**: fandom = OCR = meta-builds (1pc Ultimate -> 10% shield 10s; 2pc Deviant Power not full -> +12%; 3pc +0.6% per Energy up to +30%; 4pc Battle Skill costs 30 Deviant Power, cooldown -50%).
* **Snow Panther**: OHDB mirror has only the 1pc; OCR + meta-builds give all four (used).
* **Test Subject**: no bonus text anywhere (null).

## 7. Key armor (unique pieces)

41 pieces recorded (helmet 7, mask 5, top 9, pants 6, gloves 5, shoes 9) with effect text from OCR (primary), meta-builds v3.0.5 and Korean dump. Numeric disagreements kept as `alternatives`: Gas-tight Helmet Shrapnel DMG +150% (OCR) vs +120% (meta-builds, KR); Gas Mask Hood 6s + PS coefficient +15% (OCR) vs 3s (meta-builds, KR); Dust Mask 70% + Attack +20% (OCR) vs 50% (meta-builds, KR); Hot Dog Shorts Bounce count +2 (OCR) vs +1 (KR); Tattoo Pants / Prickly Dance Pants texts appear swapped between sources; Frost Tactical Vest 120% (OCR) vs 100% (KR). 2026 additions: Wind Interpreter Cap and Ankh Mask (3.0.1, 2026-07-09), Glide Pants and Magnetic Moment Top (May 2026), Pivot Step Leather Boots / Gilded Gloves / Bloodstained Tracker Boots (2.3.x). Only one Key Armor piece can be equipped per loadout (0x91 note - unverified).

## 8. Not found / open

* Per-star values after 2.3.1 for stars 1-5 (only 6-star observed); whether pollution now scales with stars; Tier II-IV pollution post-2.3.1.
* Whether epic blueprints cap at 5 or 6 stars.
* Treacherous Tides 4pc shield % after 3.0.6; Ghost Link 3pc change in 3.0.4; Gravity Tide current numbers.
* Any set added between 3.0.1 and 3.0.7 (none found in the 3.0.7 dataset).
* Release dates for launch-era sets and Treacherous Tides.
* Official patch notes (oncehuman.game) and Steam news could not be fetched directly.
