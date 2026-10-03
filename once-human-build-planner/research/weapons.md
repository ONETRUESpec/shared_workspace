# Once Human weapon catalogue + blueprint star scaling - research notes

Facet: every notable Legendary/Epic weapon with base stats, and how blueprint stars (1-6) change them.
Generated 2026-10-03. Data file: `data/weapons.json` (67 records: 40 Legendary, 27 Epic; 37 with full effect text).

## 0. Access situation (important caveat)

The session's egress proxy blocked every primary domain: once-human.fandom.com, oncehuman.wiki.gg, oncehuman.wiki, wikily.gg, game8.co, oncehumandb.com, oncehuman.th.gl, meta-builds.net, mobalytics.gg, maxroll.gg, oncehuman.game (official news), store.steampowered.com, api.steampowered.com, steamcommunity.com, steamdb.info, reddit.com, youtube.com, web.archive.org, archive.ph, ghostarchive, breezewiki/antifandom mirrors, bing/duckduckgo/brave, en.wikipedia.org, huggingface, docs.google.com, and all gaming news sites tried (dexerto, thegamer, gamerant, pcgamesn, gamesradar, dualshockers, hardcoregamer, keengamer, ldplayer, bluestacks, theriagames, paradoxgaming, vortexgaming, gamersandgeek, playnews, eaglgame, oncehumanworld, coreprospe, gimaxo, exputer, primagames, dotesports, gamepur, gamespot, sportskeeda, ign). Only github.com / raw.githubusercontent.com were reachable. The WebSearch budget (200/session, shared) was exhausted after ~12 queries.

Consequences:
- Base stats come from GitHub-hosted datasets that mirror **Once Human DB (oncehumandb.com)** and **wikily.gg**.
- Everything else (game8 Tier-I numbers, star XP, Steam anecdotes, fandom statements) is quoted from **search-result snippets**, reproduced verbatim below, not from the pages themselves.
- Patch-note content for 2026 comes from a GitHub news-research JSON (kingxqtr/marsad) that paraphrases the official oncehuman.game posts and cites their URLs.

## 1. Sources actually read (reachable)

1. **lReDragol/OnceHuman_Tools** - datamined community calculator (commit "Expand calculator data and make portable calc standalone", 2026-03-18).
   - https://raw.githubusercontent.com/lReDragol/OnceHuman_Tools/master/portable_calc_v2/data/menu/calc/bd_json/weapon_list.json (131 weapons; per weapon: damage_per_projectile, projectiles_per_shot, fire_rate, magazine_capacity, crit_rate_percent, crit_damage_percent, weakspot_damage_percent, range, reload_time_seconds, ads_time_seconds, min_damage_range_meters, min_damage_percent, ammo_type, blueprint_fragment_type, structured mechanics, source_url -> oncehumandb.com/weapons/<slug>)
   - https://raw.githubusercontent.com/lReDragol/OnceHuman_Tools/master/portable_calc_v2/data/menu/calc/mechanics.py - line 1213: `star_multipliers = {1:1.0,2:1.1,3:1.2,4:1.3,5:1.4,6:1.5}`; line 1214: `level_multipliers = {1:1.0,2:1.05,3:1.10,4:1.15,5:1.20}`; line 1215: `calibration_bonuses = {0:0.0,1:0.02,2:0.04,3:0.06,4:0.08,5:0.10,6:0.12}`; applied as `base_value * star_multiplier * level_multiplier * (1 + calibration_bonus)` to PROGRESSION_SCALING_STATS.
   - https://raw.githubusercontent.com/lReDragol/OnceHuman_Tools/master/portable_calc_v2/data/menu/calc/player.py - `max_stars = {'legendary': 6, 'epic': 5, 'rare': 4, 'common': 3}` (armor items), same star/level tables.
   - tools/README_en.md: "`import_once_human_db.py` uses public datamined sources as a bridge until direct extraction is complete." Placeholder text in 25 of the 62 Legendary/Epic entries: "Imported base weapon data from Once Human DB. Direct local mechanic extraction from game files is still pending."
2. **saitoh183/once-human-build-planner** - https://raw.githubusercontent.com/saitoh183/once-human-build-planner/main/data/weapons.json (126 weapons, OHDB snapshot, initial commit 2026-04-30; fields: name, type, rarity, tier, damage, rpm, url). README: "using OHDB / Once Human Database as the source data". Damage & RPM agree 100% with the lReDragol list for all 62 Legendary/Epic weapons.
3. **Gledson-z/once-human-planner** - https://raw.githubusercontent.com/Gledson-z/once-human-planner/main/data/game_data.js (3 weapons with wikily.gg icon URLs; last update Dec 30 2025): SOCR-The Last Valor dano 264 / cadencia 515 / alcance 75 / carregador 30 / recarga 56 / crit 6.0 / crit dmg 27.0 / weakspot 60.0, effects "Hitting 4 time(s) triggers Shrapnel. / Critical hits count as 2 hit(s). / Critical hits grant +1 Shrapnel trigger times for 1s. / +30% Shrapnel Crit DMG."; Critical Pulse 1812 / 90 / 64 / 1 / 75 / 2.0 / 28.0 / 70.0; MPS7 - Outer Space 192 / 850 / 45 / 35 / 32 / 8.0 / 30.0 / 50.0. Shrapnel keyword text: "Upon hitting an enemy with a bullet, deal 50% Attack as Weapon DMG to a different random part ... can Crit, strike Weakspots, and will decay with distance."
4. **smus-rgb/once-human-guide** - https://raw.githubusercontent.com/smus-rgb/once-human-guide/main/weapons.json (38 named weapons, descriptive only; DATA.md: "patch_target: 3.0.7 live - Isles of Abyss prep", data 2026-09-30). Gives names of 2026 weapons: "QBJ97 - Fiery Trees and Silver Flowers ... Added July 2026 (3.0.1 anniversary). Hits can apply Unstable Bomber. Spark stacks reduce recoil; full Spark boosts Unstable Bomber chance."; "SN700 - Finale ... Added July 2026 (3.0.1). Hits chance to trigger Shrapnel; weakspot hits guarantee Shrapnel."; "FP9 - Additional Rules ... Also known as TEC9 - Additional Rules (renamed). Fortress Warfare on hit (CD). Empty reload restores Deviant Power."; "KAM - Abyss Glance ... 39 DMG, 600 RPM, 50 mag"; "M416 - Silent Anabasis ... 33 DMG, 750 RPM"; "MPS5 - Kumawink ... 37 DMG, 750 RPM"; "KV-SBR - Little Jaws ... 1000 RPM SMG, 39 mag"; "AWS.338 - Bullseye ... ~316 DMG"; "SOCR - The Last Valor ... 45 DMG, 515 RPM, 30 mag"; also AUG - Electron Cloud, KVK 3 - Bull, SOCR - Wildfire, KAM - Burning Rage, Compound Bow - The Burden of Betrayal.
5. **kingxqtr/marsad** - https://raw.githubusercontent.com/kingxqtr/marsad/main/data/research/once-human.json and daily/2026-09-2{8,9}-once-human.json (official-URL-cited patch summaries, generated 2026-09-27..30). Key quotes:
   - v3.0.1 (2026-07-09) https://www.oncehuman.game/news/update/20260709/40780_1307147.html: "new weapons QBJ97 - Fiery Trees and Silver Flowers and SN700 - Finale; the Ghost Link armor set"; "every player received 1,000 Starchrom".
   - v3.0.2 (2026-07-22) https://www.oncehuman.game/news/update/20260722/40780_1308595.html: "SN700 - Finale nerf: maximum Reverb stacks cut from 5 to 4, with each stack now worth 5% instead of 4%".
   - Sept Combat Balance dev blog (2026-09-10) https://www.oncehuman.game/news/devBlog/20260910/40781_1313572.html: "MG4 - Conflicting Memories: Shrapnel now triggers every 6 hits instead of every 12 - After a reload, or every 12 hits, the next Shrapnel becomes a 'Memory Storm' that hits all targets in range - Each Shrapnel hit grants 0.5 seconds of stackable Super Armor". Treacherous Tides: 4-piece shield 20% -> 30% max HP; after pushback "the 2-piece bonus stays at 12%, and the 3-piece bonus starts at 8% at full HP and rises to 28%".
   - Timeline: 3.0.3 2026-08-05, 3.0.4 2026-08-24, 3.0.5 2026-09-02, 3.0.6 2026-09-16, 3.0.7 2026-09-28 (https://www.oncehuman.game/news/update/20260924/40780_1315053.html), Isles of Abyss expansion 2026-10-21; Visional Wheel S4 "Gravity Abyss" ends 2026-11-18. Console launch 2026-08-25. Game launched 2024-07-09.
6. **bramsey679/Once_Human_DPS_Calculator** - data/weapons.json (21 names + keyword tags; all stats null); data/formulas.json: "bounce_base_multiplier 0.4 - Official preview states each bounce deals Weapon DMG equal to 40% of Attack" (source https://www.oncehuman.game/news/devBlog/20241123/40781_1195665.html); patch boundaries 2024-11-23 bounce rework, 2025-06-17 balance adjustments, 2026-01-21 v2.3.1 mod revamp.
7. **knkwebservices/oncehuman-cog** - confirms oncehumandb.com is scraped live (no /api); no numbers.

## 2. Search-snippet evidence (pages blocked; quotes are what the search engine returned)

- game8 All Weapons List (https://game8.co/games/Once-Human/archives/Weapons), echoed by hardcoregamer/dualshockers/bluestacks: "AWS .338 - Bullseye ... base damage of 316, fire rate of 40, and magazine capacity of 5"; "SOCR - The Last Valor ... base damage of 45, fire rate of 515, and magazine capacity of 30"; "DBSG - Doombringer ... 62x6, fire rate of 180, MAG capacity of 2"; "ACS12 - Corrosion ... 36x5, fire rate of 180, MAG 18"; "MPS7 - Outer Space ... 33, 850, 35"; "DE.50 - Jaws ... 128, 190, 8"; "MG4 - Predator ... 32, 700, 75"; "KVD - Boom! Boom! ... fire rate of 500 rounds per minute, 100-round magazine, and base damage of 44 per shot"; "HAMR - Brahminy: 218 DMG, 85 Fire Rate, 8 Magazine (Legendary)"; "R500 - Memento: 170 DMG, 145 Fire Rate, 5 Magazine"; "DE.50 - Wildfire: 115 DMG, 190 Fire Rate, 8 Magazine (Epic)"; "KV-SBR - Little Jaws: 29 DMG, 1000 Fire Rate, 39 Magazine"; "M416 - Silent Anabasis: 33 DMG, 750 Fire Rate, 36 Magazine"; "Critical Pulse ... about 310 damage per bolt".
- wikily Weapon Blueprints (https://wikily.gg/once-human/weapon-blueprints/): "ACS12 - Corrosion with Crit Rate +8.0%, Crit DMG +27.0%, and Weakspot DMG +15.0%"; "AWS.338 - Bullseye with Crit Rate +2.0%, Crit DMG +26.0%, and Weakspot DMG +95.0%"; "DB12 - Raining Cash has Crit Rate +8.0%, Crit DMG +28.0%, and Weakspot DMG +20.0%"; "FP9 - Additional Rules has Crit Rate +10.0%, Crit DMG +30.0%, and Weakspot DMG +45.0%"; "G17 - Hazardous Object has Crit Rate +8.0%, Crit DMG +28.0%". AWS.338 "does 316 damage at 58m range with a weakspot damage stacking ability (+15% per hit, up to 3 stacks) and a vulnerability mark (8% for 12s)". DE.50 Jaws "Unstable Bomber ... triggers after 0.1s with a blast radius of 1.5m, triggered every 4 shots". MG4 Predator "40% chance to boost fire rate and attack with each hit; stacking up to 5 times grants unlimited ammo for about half a second". ACS12 Corrosion "70% proc chance per shot". KVD Boom Boom "18% chance to burn enemies on every hit".
- keengamer: "Headshots deal 2.5 times base damage on human enemies"; "AWS.338 with 2% Crit Rate and 80% Weakspot DMG" (older value; datamined/wikily now 95%); "R500 - Memento has 4% Crit Rate, 65% Weakspot damage, and 25% Crit damage".
- fandom Weapons/Blueprints: "Blueprint enhancement tiers increase the damage stat of weapons across all their blueprint tiers, with the number of 'stars' a blueprint has indicating its enhancement tier"; "all blueprints have tiers I - V (1-5) ... Tier V unlocking at character level 40".
- gamersandgeek: "The higher the number of stars, the higher the HP and PSI intensity you get from gear pieces, and for weapons, their base damage receives a boost."
- Steam 6330466705287939267 ("3 star vs 4 star"): "approximately a 4% increase in damage per star"; Steam 671726025354256537 ("Blueprint upgrading"): "Weapon stars do increase damage, but the boost is relatively small-about 10-15% ... comparing a 1-star and a 3-star Tier 1 SOCR"; "calibration blueprints give a roughly 20-50% damage increase".
- paradoxgaming six-star guide: "When Once Human launched, reaching six-star weapons and armor felt nearly impossible, with leveling a legendary blueprint from one to six stars requiring 29,600 experience"; "progression for legendary weapons requires 1600 XP to go from 1 to 2 stars, then 4000, 6000, 8000, and 10000 for each subsequent star up to 6"; "In December 2024 ... Blueprint Conversion System, which let players transfer star ratings between blueprints".
- vortexgaming: "major blueprint overhaul was previewed in version 2.3.4 (March 11) and made official in version 2.3.5 (March 25), where blueprints are now activated directly using Starchrom, with no fragment collection in between."
- Official Way of Winter (2024-11-23) snippet: new blueprints "M416 - Scorched Earth, M416 - Autumn Equinox, ACS12 - Pyroclasm Starter, M416 - Silent Anabasis, and MG4 - Conflicting Memories".

## 3. Reconciling the two damage scales

| Weapon | game8 "base" | OHDB/datamined | ratio |
|---|---|---|---|
| AWS.338 - Bullseye | 316 | 1216 | 3.85 |
| SOCR - The Last Valor | 45 | 174 | 3.87 |
| DBSG - Doombringer | 62x6 | 238x6 | 3.84 |
| ACS12 - Corrosion | 36x5 | 138x5 | 3.83 |
| MPS7 - Outer Space | 33 | 126 | 3.82 |
| DE.50 - Jaws | 128 | 494 | 3.86 |
| MG4 - Predator | 32 | 124 | 3.88 |
| KVD - Boom! Boom! | 44 | 168 | 3.82 |
| HAMR - Brahminy | 218 | 840 | 3.85 |
| R500 - Memento | 170 | 654 | 3.85 |
| DE.50 - Wildfire | 115 | 444 | 3.86 |
| KV-SBR - Little Jaws | 29 | 110 | 3.79 |
| M416 - Silent Anabasis | 33 | 126 | 3.82 |

Interpretation: game8 lists Tier-I values, OHDB lists Tier-V (level-50 gear) values; both at base (1) star. The datamined file itself contains low-tier duplicates that fit the same scale (Dual Fury 56x6 vs DBSG - Dual Fury 214x6 = 3.82; SN700 common 255 vs SN700 - Gulped Lore 1104). This directly contradicts the lReDragol `level_multipliers` (Tier V = +20%), so that tier table is flagged unreliable.

wikily (via Gledson) / OHDB: Last Valor 264/174 = 1.517; Critical Pulse 1812/1192 = 1.520; Outer Space 192/126 = 1.524. Consistent with wikily showing 6-star (x1.5 under the +10%/star model) with rounding, but also consistent with ~+11%/star compounding to 5-star (1.11^4 = 1.518). Unresolved.

## 4. Disagreements recorded

- Magazine: ACS12 Corrosion 8 (datamined/OHDB) vs 18 (game8); DE.50 Jaws 9 vs 8 (game8); KV-SBR Little Jaws 30 vs 39 (game8, smus); KAM Abyss Glance 40 vs 50 (smus). Pick: datamined (newer, structured) but flagged in `magazineConflict`.
- Keywords: ACS12 Corrosion Power Surge (datamined, smus) vs Fortress Warfare (bramsey); KVD Boom Boom Burn (datamined, wikily snippet) vs Bounce (bramsey); MPS7 Outer Space Power Surge (datamined, smus) vs Frost Vortex (bramsey); DB12 Raining Cash Fortress Warfare (datamined) vs Shrapnel (bramsey) - unresolved; DBSG Doombringer Bull's Eye (datamined, OHDB guide) vs Burn (bramsey).
- AWS.338 weakspot 95% (datamined, wikily) vs 80% (keengamer, older).
- Datamined text errors: OIC-8 Last Carnival and several base frames (AKM, M416, SCAR, SOCR - Sand Dancer) carry mechanics blocks copied from other weapons; R500 entries described as "sniper rifle"; Ultra Force block looks like a melee template. Flagged per record.
- Star scaling: +10%/star additive (lReDragol) vs ~4%/star (Steam) vs 10-15% for 1->3 stars (Steam). No official number.

## 5. Not found / open

- Official per-star DMG multiplier table; whether stars are additive or compounding; whether Epic blueprints cap at 5 or 6 stars (lReDragol says 5).
- Blueprint fragment -> XP conversion and Starchrom cost per star after the v2.3.5 (Mar 2026) rework.
- Stat sheets (DMG/RPM/mag/crit) for 2026 weapons: QBJ97 - Fiery Trees and Silver Flowers, SN700 - Finale, AUG - Electron Cloud, KVK 3 - Bull, SOCR - Wildfire, KAM - Burning Rage; nothing at all found for "Recurve Crossbow - Wildfire", "Compound Bow - Flaming Fervor", "Bingo", "RD69 Spiral Ripple", "Scattershot", "Marauder" (possibly mobile/CN names or not yet released) - not added to the data file to avoid inventing entries.
- Effect text for 25 Legendary/Epic weapons whose datamined entry is a placeholder (e.g. DBSG - Format, G17 - Cash Only, Aurora Fort, Star Vortex, MPS7 - Chaos Domain, HAMR - Hannya, EBR-14, SKS - Pathfinder, PDW90, Kukri, Scourge, Masamune).
- Whether `range` in OHDB (7-60) is metres of full-damage range; wikily's range stat (45-75) is a 0-100 bar.
- Post-v3.0.x balance changes to individual weapons other than MG4 Conflicting Memories and SN700 Finale.

## 6. Weapon table (from data/weapons.json)

Columns: baseDmg = OHDB Tier-V displayed DMG per projectile; T1 = game8 Tier-I; wik = wikily displayed; crit/critDmg/ws in %; * = magazine conflict noted.

| Weapon | Rarity | Class | Keyword | baseDmg | T1 | wik | RPM | Mag | Reload s | Crit% | CritDmg% | Weakspot% | Range | Quality |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AUG - Electron Cloud | Legendary | AR | Power Surge | null |  |  |  |  |  |  |  |  |  | partial - name/keyword only (frame stats inferred where noted) |
| KAM - Abyss Glance | Legendary | AR | Frost Vortex | 150 | 39 |  | 600 | 40* | 3.1 | 6 | 30 | 55 | 27 | full |
| M416 - Silent Anabasis | Legendary | AR | Frost Vortex | 126 | 33 |  | 750 | 36 | 2.3 | 6 | 27 | 60 | 26 | full |
| QBJ97 - Fiery Trees and Silver Flowers | Legendary | AR | Unstable Bomber | null |  |  |  |  |  |  |  |  |  | partial - name/keyword only (frame stats inferred where noted) |
| SOCR - The Last Valor | Legendary | AR | Shrapnel | 174 | 45 | 264 | 515 | 30 | 2.3 | 6 | 27 | 60 | 27 | full |
| SOCR - Wildfire | Legendary | AR | Shrapnel | null |  |  | 515 | 30 |  | 6 | 27 | 60 |  | partial - name/keyword only (frame stats inferred where noted) |
| Ultra Force | Legendary | AR | Fortress Warfare | 264 |  |  | 515 | 36 | 2.1 |  |  |  | 27 | full |
| Compound Bow (aka Compound Bow - The Burden of Betrayal) | Legendary | Crossbow | Fortress Warfare | 1192 |  |  | 90 | 1 | 2.6 | 2 | 28 | 70 | 19 | full |
| Critical Pulse | Legendary | Crossbow | Power Surge | 1192 | 310 | 1812 | 90 | 1 | 2.6 | 2 | 28 | 70 | 19 | full |
| Aurora Fort | Legendary | LMG | ? | 271 |  |  | 700 | 90 | 4.5 |  |  |  | 29 | base stats only; special-effect text not extracted (placeholder in datamined file) |
| KVD - Boom! Boom! | Legendary | LMG | Burn | 168 | 44 |  | 500 | 100 | 5.1 | 10 | 30 | 40 | 27 | full |
| MG4 - Conflicting Memories | Legendary | LMG | Shrapnel | 124 |  |  | 700 | 75 | 4.1 | 8 | 30 | 35 | 31 | full |
| MG4 - Predator | Legendary | LMG | Fast Gunner | 124 | 32 |  | 700 | 75 | 4.1 | 8 | 30 | 35 | 31 | full |
| Kukri | Legendary | Melee | ? | 778 |  |  |  |  |  | 5 | 25 | 20 |  | base stats only; special-effect text not extracted (placeholder in datamined file) |
| Scourge | Legendary | Melee | ? | 922 |  |  |  |  |  | 5 | 25 | 20 |  | base stats only; special-effect text not extracted (placeholder in datamined file) |
| The Fabled Masamune | Legendary | Melee | ? | 688 |  |  |  |  |  | 5 | 25 | 20 |  | base stats only; special-effect text not extracted (placeholder in datamined file) |
| DE.50 - Jaws | Legendary | Pistol | Unstable Bomber | 494 | 128 |  | 190 | 9* | 1.8 | 6 | 25 | 60 | 20 | full |
| G17 - Cash Only | Legendary | Pistol | ? | 110 |  |  | 720 | 60 | 2.7 |  |  |  | 13 | base stats only; special-effect text not extracted (placeholder in datamined file) |
| G17 - Hazardous Object | Legendary | Pistol | ? | 230 |  |  | 410 | 13 | 2.1 | 8 | 28 | 55 | 13 | base stats only; special-effect text not extracted (placeholder in datamined file) |
| R500 - Memento | Legendary | Pistol | Fast Gunner | 654 | 170 |  | 145 | 5 | 2.3 | 4 | 25 | 65 | 23 | full |
| ACS12 - Corrosion | Legendary | Shotgun | Power Surge | 138x5 | 36 |  | 180 | 8* | 2.4 | 8 | 27 | 15 | 7 | full |
| ACS12 - Pyroclasm Starter (aka ACS12 - Pyroclasm) | Legendary | Shotgun | Burn | 138x5 |  |  | 180 | 8 | 2.4 | 8 | 27 | 15 | 7 | full |
| DB12 - Raining Cash | Legendary | Shotgun | Fortress Warfare | 212x5 |  |  | 105 | 12 | 0.5 | 8 | 28 | 20 | 7 | full |
| DBSG - Doombringer | Legendary | Shotgun | The Bull's Eye | 238x6 | 62 |  | 180 | 2 | 2.1 | 10 | 30 | 25 | 7 | full |
| DBSG - Format | Legendary | Shotgun | ? | 340x6 |  |  | 180 | 2 | 2.1 |  |  |  | 7 | base stats only; special-effect text not extracted (placeholder in datamined file) |
| KVK 3 - Bull | Legendary | Shotgun | Bounce | null |  |  |  |  |  |  |  |  |  | partial - name/keyword only (frame stats inferred where noted) |
| KV-SBR - Little Jaws | Legendary | SMG | Unstable Bomber | 110 | 29 |  | 1000 | 30* | 1.9 | 10 | 30 | 45 | 14 | full |
| MPS5 - Kumawink | Legendary | SMG | Bounce | 142 | 37 |  | 750 | 30 | 2.3 | 8 | 30 | 55 | 18 | full |
| MPS5 - Primal Rage | Legendary | SMG | ? | 142 |  |  | 750 | 30 | 2.3 | 8 | 30 | 55 | 18 | base stats only; special-effect text not extracted (placeholder in datamined file) |
| MPS7 - Chaos Domain | Legendary | SMG | ? | 184 |  |  | 850 | 35 | 3 |  |  |  | 16 | base stats only; special-effect text not extracted (placeholder in datamined file) |
| MPS7 - Outer Space | Legendary | SMG | Power Surge | 126 | 33 | 192 | 850 | 35 | 3 | 8 | 30 | 50 | 16 | full |
| PDW90 - Holographic Resonance | Legendary | SMG | ? | 90 |  |  | 900 | 50 | 2.2 | 8 | 45 | 30 | 17 | base stats only; special-effect text not extracted (placeholder in datamined file) |
| Star Vortex | Legendary | SMG | ? | 234 |  |  | 1000 | 30 | 1.9 |  |  |  | 14 | base stats only; special-effect text not extracted (placeholder in datamined file) |
| TEC9 - Additional Rules (aka FP9 - Additional Rules) | Legendary | SMG | Fortress Warfare | 236 |  |  | 450 | 30 | 2.2 | 10 | 30 | 45 | 17 | base stats only; special-effect text not extracted (placeholder in datamined file) |
| AWS.338 - Bullseye | Legendary | Sniper | The Bull's Eye | 1216 | 316 |  | 40 | 5 | 3.6 | 2 | 26 | 95 | 58 | full |
| EBR-14 - Octopus! Grilled Rings! | Legendary | Sniper | ? | 310 |  |  | 300 | 20 | 3 | 5 | 40 | 50 | 51 | base stats only; special-effect text not extracted (placeholder in datamined file) |
| HAMR - Brahminy | Legendary | Sniper | Bounce | 840 | 218 |  | 85 | 8 | 3.4 | 2 | 30 | 80 | 56 | full |
| HAMR - Hannya | Legendary | Sniper | ? | 900 |  |  | 85 | 8 | 3.4 |  |  |  | 56 | base stats only; special-effect text not extracted (placeholder in datamined file) |
| SKS - Pathfinder | Legendary | Sniper | ? | 360 |  |  | 257 | 20 | 3 | 5 | 40 | 50 | 51 | base stats only; special-effect text not extracted (placeholder in datamined file) |
| SN700 - Finale | Legendary | Sniper | Shrapnel | null |  |  | 40 | 5 |  | 2 | 24 | 90 |  | partial - name/keyword only (frame stats inferred where noted) |
| KAM - Burning Rage | Epic | AR | ? | null |  |  | 600 | 40 |  | 6 | 30 | 55 |  | partial - name/keyword only (frame stats inferred where noted) |
| KAM - Crank | Epic | AR | Burn | 134 |  |  | 600 | 40 | 2.8 | 6 | 30 | 55 | 25 | full |
| M416 - Autumn Equinox | Epic | AR | Fortress Warfare | 114 |  |  | 750 | 36 | 2.3 | 6 | 27 | 60 | 26 | full |
| OIC-8 - Last Carnival | Epic | AR | Power Surge | 120 |  |  | 750 | 40 | 2.3 |  |  |  | 25 | full |
| SOCR - Outsider | Epic | AR | Power Surge | 156 |  |  | 515 | 30 | 2.3 | 6 | 27 | 60 | 24 | full |
| Recurve Crossbow | Epic | Crossbow | The Bull's Eye | 1072 |  |  | 125 | 1 | 2.6 | 2 | 28 | 70 | 19 | full |
| Flamethrower | Epic | Launcher | ? | 252 |  |  | 300 | 100 | 2.6 | 10 | 30 | 15 | 34 | base stats only; special-effect text not extracted (placeholder in datamined file) |
| MGL | Epic | Launcher | ? | 1066 |  |  | 140 | 6 | 7 | 4 | 30 | 35 | 34 | base stats only; special-effect text not extracted (placeholder in datamined file) |
| MG4 - Mr Squid | Epic | LMG | Bounce | 110 |  |  | 700 | 75 | 3.5 | 8 | 30 | 35 | 31 | full |
| MG4 - Wrath Of Hades | Epic | LMG | Fast Gunner | 110 |  |  | 700 | 75 | 3.5 | 8 | 30 | 35 | 31 | full |
| Crowbar | Epic | Melee | ? | 630 |  |  |  |  |  | 5 | 25 | 20 |  | base stats only; special-effect text not extracted (placeholder in datamined file) |
| Frozen Northern Pike | Epic | Melee | ? | 738 |  |  |  |  |  | 5 | 25 | 20 |  | base stats only; special-effect text not extracted (placeholder in datamined file) |
| Long Axe | Epic | Melee | Fortress Warfare | 830 |  |  |  |  |  | 5 | 25 | 20 |  | full |
| Stun Baton | Epic | Melee | Power Surge | 700 |  |  |  |  |  | 5 | 25 | 20 |  | full |
| Warning Sign | Epic | Melee | ? | 747 |  |  |  |  |  | 5 | 25 | 20 |  | base stats only; special-effect text not extracted (placeholder in datamined file) |
| DE.50 - Wildfire | Epic | Pistol | The Bull's Eye | 444 | 115 |  | 190 | 8 | 1.8 | 6 | 25 | 60 | 20 | full |
| G17 - Dusty | Epic | Pistol | Shrapnel | 206 |  |  | 410 | 13 | 2.1 | 8 | 28 | 55 | 13 | full |
| R500 - Hammerhead Shark | Epic | Pistol | Power Surge | 588 |  |  | 145 | 5 | 2.3 | 4 | 25 | 65 | 23 | full |
| R500 - Interfade | Epic | Pistol | ? | 568 |  |  | 145 | 5 | 2.3 |  |  |  | 23 | base stats only; special-effect text not extracted (placeholder in datamined file) |
| ACS12 - Netherworld | Epic | Shotgun | Fast Gunner | 124x5 |  |  | 180 | 8 | 2.4 | 8 | 27 | 15 | 7 | full |
| DB12 - Backfire | Epic | Shotgun | ? | 190x5 |  |  | 105 | 12 | 0.5 | 8 | 28 | 20 | 7 | base stats only; special-effect text not extracted (placeholder in datamined file) |
| DBSG - Dual Fury | Epic | Shotgun | ? | 214x6 |  |  | 180 | 2 | 2.1 | 10 | 30 | 25 | 7 | base stats only; special-effect text not extracted (placeholder in datamined file) |
| KV-SBR - Icy Rain | Epic | SMG | Frost Vortex | 98 |  |  | 1000 | 30 | 1.9 | 10 | 30 | 45 | 14 | full |
| MPS7 - Div-Evo | Epic | SMG | Shrapnel | 112 |  |  | 850 | 35 | 2.1 | 8 | 30 | 50 | 16 | full |
| AWS.338 - Black Panther | Epic | Sniper | Shrapnel | 1094 |  |  | 40 | 5 | 3.6 | 2 | 26 | 95 | 58 | full |
| SN700 - Gulped Lore | Epic | Sniper | Unstable Bomber | 1104 |  |  | 40 | 5 | 3.6 | 2 | 24 | 90 | 60 | full |
| SR2000 - Die Another Day | Epic | Sniper | ? | 668 |  |  | 105 | 6 | 3 |  |  |  | 51 | base stats only; special-effect text not extracted (placeholder in datamined file) |
