# Once Human — Combat Deviations (deviants) research notes

Generated 2026-10-03. Facet: combat deviations you can bring into combat — skills, player buffs, enemy debuffs, damage scaling, Skill Rating / Mood / Deviation Power rules.

## 0. Research-environment caveat (read first)

* The sandbox's egress proxy blocked **every** game site (oncehuman.game, once-human.fandom.com, oncehuman.wiki.gg, oncehumanwiki.com, oncehumangame.wiki, wikily.gg, game8, gamerant, thegamer, sportskeeda, reddit, steamcommunity, store.steampowered.com, oncehumandb.com, ohwikiguide.com, maxroll, mobalytics, wikipedia, archive.org …). `WebFetch` returned `EGRESS_BLOCKED` for all of them and curl got no CONNECT.
* The session-wide WebSearch quota (200) was exhausted after my first 7 successful searches (other facets used the rest). Those 7 search summaries are the only "live web" evidence here and are flagged as such.
* Only `raw.githubusercontent.com` + GitHub code search were reachable, so the bulk of this research comes from **GitHub mirrors of game data**: a game-client datamine, a Steam-news scrape, snapshots of ohwikiguide.com and oncehumandb.com, and two community damage models. Every number below carries its provenance.

## 1. Sources used (≥ 8 distinct)

| # | Source | What it gave | Date of data |
|---|--------|--------------|--------------|
| 1 | lReDragol/OnceHuman_Tools — `portable_calc_v2/data/menu/calc/bd_json/deviations.json` (3.3 MB) + `tools/extract_once_human_deviations.py` + `tools/README_en.md` — https://raw.githubusercontent.com/lReDragol/OnceHuman_Tools/master/portable_calc_v2/data/menu/calc/bd_json/deviations.json | **Game-client datamine**: 63 deviations, 40 flagged combat, 13 `combat_profile`s with Chinese skill strings and `deviation_degree` formulas, extracted from `deviation_combat_config_data.pyc`, `deviation_skills_data.pyc`, `deviation_preview_skill_data.pyc`, `deviation_base_data.pyc`, `translate_data_en.pyc` | repo last pushed 2026-03-19 → client ≤ Mar 2026 (post Dec-2025 overhaul) |
| 2 | DanII1Mg/Text_analysis_cw — `data/once_human_news.csv` (Steam news for app 2139460, 101 posts) — https://raw.githubusercontent.com/DanII1Mg/Text_analysis_cw/main/data/once_human_news.csv | **Official patch notes / dev blogs** 2025-07-02 → 2025-12-17 (bodies truncated at 5003 chars) | Jul–Dec 2025 |
| 3 | imb0n3s/ohdeviationhunt — `combat-fallback.json`, `traits-fallback.json`, `README.md`, `docs/Deviation_Hunt.wiki` — https://raw.githubusercontent.com/imb0n3s/ohdeviationhunt/main/combat-fallback.json | Snapshot of **ohwikiguide.com** Deviation Main Page (61 deviations, 23 combat; function text, drops, variations/skins) and Deviation Trait Page (verbatim trait effects) | Sep–Oct 2026 |
| 4 | saitoh183/once-human-build-planner — `data/deviations.json`, `data/cradle.json`, `data/mods.json` — https://raw.githubusercontent.com/saitoh183/once-human-build-planner/main/data/deviations.json | Scrape of **oncehumandb.com** (OHDB): 31 combat entries incl. Chaos variants and dog deviations, post-overhaul **ability names** (e.g. "Tracking Missile, Fire Boost"), cradle overrides touching deviations | 2026 |
| 5 | TeeReckzi/OHMM — `src/ohai/src/engine/mechanicRegistry.ts`, `formulaApplicator.ts`, `ui/registries/formulaSupportRegistry.ts`, `deviationRegistry.ts`, `verified/INGAME_KNOWLEDGE_BIBLE.md` — https://github.com/TeeReckzi/OHMM | Community **damage model**: deviation skill damage = Psi × baseFactor (Butterfly 1.2, Soul Summoner 6.0, ZapCam/Lonewolf 8.0 quarantined); OCR'd in-game set/armor text mentioning Deviant Power, Battle Skill, Ultimate | "Version 2.3.8 / May 2026" |
| 6 | 0x91CEA55/OnceHuman — `research/data/custom-datamine/raw.json` — https://github.com/0x91CEA55/OnceHuman | Community keyword formulas (Factor/Final buckets; Burn 12 %, Frost Vortex 50 %, Power Surge 50 %, Bull's Eye 8 %/12 s), set text (Dark Resonance) | v1.3.0, 2026-03-01 |
| 7 | ping-xiong/XingChuan-OnceHunamMap-Localization — `en.js` | CN→EN deviation name map, spawn grades "(A)/(B)" markers | 2026-09 |
| 8 | ayobad7/once-human — `Deviation-Skills.html`; deviantmarket/aegontargaryen9 — `script.js` | Arena "Skill Mutagen" lists; fan-shop one-line combat descriptions (incl. Chaos variants) | 2026 |
| 9 | WebSearch summaries (pages themselves unreachable): https://www.oncehuman.game/news/devBlog/20251218/40781_1277420.html (Combat Deviations Major Upgrade), https://www.oncehuman.game/news/update/20260924/40780_1315053.html (Version 3.0.7), https://once-human.fandom.com/wiki/Voodoo_Doll, https://once-human.fandom.com/wiki/Butterfly's_Emissary, https://once-human.fandom.com/wiki/Festering_Gel, https://theriagames.com/guide/once-human-pyro-dino/, https://allthings.how/once-human-patch-3-0-7-free-5-5-deviations-and-beastmaster-summon-buff/, https://game8.co/games/Once-Human/archives/Deviants-Butterflys-Emissary, https://oncehumanwiki.com/articles/once-human-combat-deviations-2026, https://sportskeeda.com/mmo/once-human-best-combat-deviants-ranked, https://gamerant.com/once-human-status-damage-explained/ | Overhaul mechanics, 3.0.7 Voodoo Doll correction, older per-level tables, tier-list consensus | Dec 2025 – Sep 2026 |

## 2. System rules (what a calculator must model)

### 2.1 Dec-18-2025 "Combat Deviations Major Upgrade" (search summary of the official dev blog)
* Combat deviations **synchronize** with the Meta and grant two actives: a **Battle Skill** and an **Ultimate**. Battle Skills enter cooldown after use; "exact effect, cooldown and behaviour depend on the selected Deviation and the active scenario".
* **Ultimates "can be activated when Deviation power reaches its max, consuming energy based on their effects."** Some attach to the character, some become cover, some are big AoE, some weaponize the deviation.
* Examples quoted: "Zapamander's battle skill enables characters to enter a lightning-fast sprint state", "By-the-Wind's battle skill creates a one-way wind wall that blocks bullets".
* Deviations can be equipped/switched from the gear backpack; **switching clears Deviation Power and resets the Battle Skill cooldown**.

### 2.2 Skill Rating (Deviant Power) and Activity Rating (Mood)
* ohwikiguide (via ohdeviationhunt README/wiki, Sep 2026): "Every secured deviation is its own specimen with two ratings from 1 to 5 — **Skill Rating (Deviant Power)** and **Activity Rating (Mood)**".
* In-game trait text uses "Max Deviant Power (Skill) +x%", "Max Mood (Activity) +x%", "Energy (Skill) recovery speed +x%".
* Game-client formulas are linear in `deviation_degree` (the extractor's `NUMERIC_FORMULA_RE` only allows digits/operators/`deviation_degree`). All captured formulas have **base = 3 × step**, i.e. `value(SR) = step × (3 + SR)`, so SR5 = 2 × SR1:

| Deviant (CN) | Parameter | Formula | SR1 | SR2 | SR3 | SR4 | SR5 |
|---|---|---|---|---|---|---|---|
| Butterfly's Emissary (远归之蝶) | Weakspot DMG taken % | `18.9+deviation_degree*6.3` | 25.2 | 31.5 | 37.8 | 44.1 | 50.4 |
| Butterfly's Emissary | mark duration s | `5` | 5 | 5 | 5 | 5 | 5 |
| Lonewolf's Whisper (低语孤狼) | Weapon DMG taken % | `18.75+deviation_degree*6.25` | 25 | 31.25 | 37.5 | 43.75 | 50 |
| Snowsprite (冬灵) | crystal interval s | `3` | 3 | 3 | 3 | 3 | 3 |
| Snowsprite | crystal shatter Frost DMG % | `37.5+deviation_degree*12.5` | 50 | 62.5 | 75 | 87.5 | 100 |
| Snowsprite | Frost DMG taken % | `18+deviation_degree*6` | 24 | 30 | 36 | 42 | 48 |
| Shattered Maiden (破碎少女) | Explosion/Blast DMG taken % | `30+deviation_degree*10` | 40 | 50 | 60 | 70 | 80 |
| Mini Feaster (迷你黄衣) | interval s / tentacles / stacks | `1.5` / `1` / `1` | — | — | — | — | — |
| Mini Feaster | Status DMG % per tentacle (player) | `7.5+deviation_degree*2.5` | 10 | 12.5 | 15 | 17.5 | 20 |
| Mini Feaster | Status DMG cap % (player) | `30+deviation_degree*10` | 40 | 50 | 60 | 70 | 80 |
| Whalepup (鲸狗) | Weapon DMG taken % | `16.875+deviation_degree*5.625` | 22.5 | 28.125 | 33.75 | 39.375 | 45 |
| Whalepup | extra Vulnerability % if Drowning | `15` | 15 | 15 | 15 | 15 | 15 |

* Indexing check: Theria Games quotes Pyro Dino "+19.6 % Blaze damage … at max skill level +39.2 %" — exactly `4.9×4` and `4.9×8`, matching `step×(3+SR)` for SR = 1 and 5. The lReDragol calculator UI exposes a "Deviation degree" slider with `min_value=0`, so a 0-based reading (SR1 = 18.9 % for Butterfly) cannot be fully excluded → **medium** confidence on indexing, **high** on the formulas themselves.
* Profiles whose placeholders were NOT captured ({0} left unknown): Soul Summoner (Weapon DMG taken), Zapamander (Power Surge DMG taken), Pyro Dino (Blaze DMG taken — external 19.6→39.2), Enchanting Void (melee move-speed %, HP on melee hit %), Invincible Sun (burn_bombard: interval, burn %, trigger chance, stack bonus, burn bonus), Voodoo Doll (damage share is a fixed "half"), Zeno-Purifier (blink melee).
* Mood: no captured formula links Mood to damage. OHMM: "Deviation skill damage scaling from activity rating and level not yet modeled."

### 2.3 Deviation Power / Deviant Energy modifiers (verbatim where possible)
* Traits (ohwikiguide Trait Page, Sep 2026): Cheer Up L1-3 "Max Mood (Activity) +30/40/50%, Deviant Power (Skill) recovery speed −5%"; **Covert Energy L1-5 "Max Deviant Power (Skill) +10/20/25/30/35%"**; Feeling Blue "Max Mood −5/−10%"; Growing Pains "Max Deviant Power +30/40/50%, Mood recovery −5"; Optimist "Max Mood +15/20/25/30/35%"; **Power Rewind "Deviant Power recovery speed +5/+10%"**; Rise and Shine "Mood recovery +5…25%"; Stable Energy "Max Deviant Power +30%"; Stable Vitality "Max Mood +30%"; **Upper Hand "When Deviant Power drops to 0, automatically consume All Mood to recover All Deviant Power"**; Worn-Out "Max Deviant Power −5/−10%". Infrasonic Illusion variants: "Energy Recovery Speed +10%" (Dr Teddy +20%).
* Cradle (OHDB via saitoh `cradle.json`): "Energy Surge: Every 8s at night (9:00 PM–3:00 AM), Deviations recover 1 Deviant Power." / alt. "While airborne, Deviations recover 6 Deviant Power every 1s."; "Deviant Energy Defense: Summoning or handling Deviations grants a temporary shield equal to 30% of Max HP, lasting 30s … Weapon/Status DMG Reduction +10%. Cooldown 30s"; **"Deviation Handling: Summoning Deviation grants Status DMG +30% for 20 seconds"**; **"Deviation Master: While a Deviation is present, DMG against the Great Ones (bosses) and elites +50%"** (alt. +25%).
* Sets (OHMM Bible OCR / x91): **Dark Resonance Set** — 1pc "Using ultimate grants 10% temporary Shield for 10 seconds"; 2pc "When Deviant Power is not full, weapon and Status DMG +12%"; 3pc "For every 1 Energy consumed, Gun and Status DMG +0.6%, up to +30%"; 4pc "Consumes 30 Deviant Power when using Battle Skill, reduces cooldown by 50%". Shelterer Set's "Deviant Energy" stacks are a different mechanic (weapon-hit stacks → Elemental DMG).
* Gear: "Pivot Step Leather Boots: Resets Battle Skill cooldown after using Deviation Ultimate." TEC9 – Additional Rules: "After using Deviant skill, bullets deal 120% Attack as Elemental Status DMG (type depends on the Deviation) … Reloading an empty magazine restores 25% magazine capacity as Deviant Power, up to a maximum of 20 points per reload".
* Patch evidence that skills consume Power: Version 2.2.0 Bug Fixes (Nov 2 2025): "Fixed an issue where Deviant Power was not consumed when the Soul Summoner used its skills."
* Max pool: a search summary said "Power … values typically ranging from 30 to 100" — unverified.

### 2.4 Damage scaling (what deviation damage multiplies with)
* **Official**: Aug-25-2025 "Update Preview: August Balance Adjustments" (applied Aug 28): Polar Jelly "Attacks deal 640% Psi Intensity as Frost Status DMG and inflict 36% Frost Vulnerability on the target. If a Frost Vortex is generated within range, generate additional Ice Spikes that deal 215% Psi Intensity as Frost Status DMG." → **"Attacks deal 800% Psi Intensity as Frost Status DMG and inflict 39.2% Frost Vulnerability … Ice Spikes that deal 250% Psi Intensity as Frost Status DMG."** This is the only official deviation coefficient captured; it establishes that deviation attack damage is **Psi-Intensity-scaled Status DMG** (so Status DMG % and Elemental DMG % apply).
* Same post: Frost Vortex keyword changed from "30% Psi Intensity as Status DMG every 1s for 4s, up to 2 vortexes" to "50% Psi Intensity … every 0.5s for 4s, up to 1 vortex"; Lonewolf's Whisper was also buffed (text truncated in the scrape).
* **Community model (OHMM v2.3.8)**: `applyDeviationSkillDamage: expectedDamage = psiIntensity × baseFactor`, `canCrit=false, canWeakspot=false, vulnerabilityType:"none"`; registry: Butterfly's Emissary baseFactor **1.2** ("120% × Psi Intensity per hit, direct instance"), Soul Summoner **6.0** ("600%"), ZapCam/Lone Wolf **8.0** ("800%", "QUARANTINED … no verified game-data backing"). All marked `confidence: reported_current_patch_needs_testing`.
* Voodoo Doll ultimate (fandom + 3.0.7 summary): "With Skill Rating 5 … dealing 500% Psi Intensity of PSI Damage to the nearest 5 enemies every second within 20 meters" → Version 3.0.7 (Sep 28 2026) "corrected to 250% Psi Intensity at Skill Rating 5, replacing an inaccurate description that had displayed 500%".
* Reference keyword seeds (not deviation-specific, sources disagree): Burn 10 % (search summary) vs 12 % (x91, OHMM) Psi per stack per 0.5 s for 6 s, 5 stacks; Power Surge 50 % (x91, sportskeeda) vs 100 % (OHMM); Unstable Bomber 70–100 %; Bull's Eye ≈ +8 % vulnerability, 12 s (x91 – may conflate with the Vulnerability Amplifier mod "The Bull's Eye adds Vulnerability +8%").

## 3. Per-deviant evidence (quotes)

**Butterfly's Emissary (远归之蝶, id 99000001, me01)** — datamine: `自主攻击敌对目标，攻击命中目标时，标记该目标的弱点部位，使其受到的弱点伤害+{0}%，持续{1}秒。` formulas `{"weakspot_bonus_percent_formula":"18.9+deviation_degree*6.3","duration_seconds_formula":"5"}`. OHDB: "Abilities: Tracking Missile, Fire Boost. Can participate in combat to mark enemy Weakspots". Older (fandom/Game8 via search): "Level 1: 15%, Level 2: 20%, Level 3: 25% … up to Level 5 with 40% extra Weakspot DMG for 5 seconds" — **superseded** by the datamine (pick datamine; both recorded). Traits: Glistening Blue "Hitting a Weakspot increases Secured by 1 additional point. Cooldown of 3s"; Ancient Scroll "Max Energy +40%"; Starry Night "Deal +6% Weapon & Status DMG at night. Effect is halved during daytime". Variants: Ancient Scroll, Glistening Blue, Infrasonic Illusion, Starry Night; skins Ephemeral Dream, Before the Frost.

**Lonewolf's Whisper (低语孤狼, 99000011)** — datamine: `自主攻击敌对目标，吸引周围敌对目标的仇恨，目标死亡时产生1个分身。攻击的目标受到枪械伤害+{0}%。` `18.75+deviation_degree*6.25`. OHDB abilities "Group Attraction, Plural Summon". Tier lists (sportskeeda/skycoach summaries): "locks onto enemies, applies Bull's Eye, AoE control; best-in-slot for Shrapnel" (Bull's Eye not in datamine string). Trait Lunar Oracle: "Weapon DMG +5%. x1.5 when Sanity is below 30%"; Bursting Magma / Distant Tears "Max Energy (Skill) +40%"; Radiant Variant "Max Mood +7%". Aug-2025: "buffing the Deviations: Polar Jelly and Lonewolf's Whisper" (Lonewolf numbers truncated).

**Festering Gel (活性凝胶 'Living Gel', 99000008)** — fandom via search: "B-grade Combat Deviation"; "Build Fortification … Level 1: 4.5% HP and 2.25% Sanity every second; L2 6%/3%; L3 7.5%/3.75%; L4 9%/4.5%; L5 10.5%/5.25%"; another summary: "Allies around the fortification recover 10% HP and Sanity per second" (conflict; per-level table preferred). "Flawless Fortification: throw … knocks back enemies near the hit location and transforms into a fortification". Ultimate per one summary: "Gel Shield, which encases an ally in Festering Gel, granting a shield equal to 3.3% of their Max HP, and consumes 450 Psi Energy" — numbers look garbled, recorded as null. OHDB abilities "Force Generation, Shelter Summon". Traits: Marine Star "each reload gives you either a 5% Weapon DMG bonus or 5% Status DMG at random"; Spring Rose "+20% healing during the day, halved at night"; Milk Sugar "Max Mood +35%". Monolith: Ravenous Hunter.

**Pyro Dino (红龙, 99000030)** — datamine: `自主攻击敌对目标，使目标所受炽能伤害+{0}%，同时攻击目标被添加灼烧时，额外造成一次燃爆。` (no formula captured). Theria: "increases the Blaze damage they take by +19.6%, and at max skill level … +39.2%"; "if Pyro Dino attacks enemies affected by Burn, they will explode". OHDB "Straight-line Burn, Telekinetic Effects". Nov-2-2025: "Due to gameplay issues with Pyro Dino's skills, it has been removed from the Deviation Master World Championship roster and replaced with Zapamander."

**Mr. Wish (愿望先生, 99000034)** — OHDB "Fire Boost, Battle Partner. Can participate in combat to use guns to attack and apply The Bull's Eye"; Chaos Mr. Wish "high Dex value, rapid-fire attacks and apply The Bull's Eye". No numbers anywhere reachable.

**Shattered Maiden (破碎少女, 99000049)** — datamine: `自主移动攻击，攻击时对前方范围内的非boss敌人造成减速、定身效果，同时受到的爆炸伤害增加{0}%。` `30+deviation_degree*10` → 40–80 % **Explosion/Blast DMG taken** (not Frost). OHDB "Petrifying Gaze … fearing and freezing enemies". Grade B (map marker). Trait Wandering Witch (Twitch drop) "Max Deviant Power (Skill) 10%".

**Polar Jelly (极寒水母, 99000003)** — official Aug-2025 numbers above (640→800 % Psi, 36→39.2 % Frost Vulnerability, Ice Spikes 215→250 % Psi). OHDB "AoE Slowdown, Telekinetic Effects". Trait Starfall Inversion "+5% Frost Elemental DMG. Increased to 7.5% when airborne"; Radiant "Mood Recovery +20%". SR-scaling of the official numbers is **inferred** only (39.2 = 4.9×8 fits the step×(3+SR) pattern → SR1 19.6 %).

**Dr. Teddy (熊医生, 99000018, grade A)** — OHDB "Healing Share, Support Summon … Will heal or rescue fallen Metas"; extractor behaviour keys "复活附近倒下的玩家 / 定期治疗附近受到伤害的玩家" (revive nearby fallen players / periodically heal nearby damaged players). Trait Infrasonic Illusion "Energy (Skill) recovery speed +20%". No numbers.

**Enchanting Void (凝视的黑猫 'Gazing Black Cat', 99000025)** — datamine: `黑猫形态下持续跟随玩家。跟随时玩家手持近战武器时的移动速度+{0}%，近战攻击命中时恢复最大生命值的{1}%。` (no formulas). OHDB "Super Jump, Move Marker … increase its master's Melee DMG". Trait Starfall Inversion "+5% Melee DMG. Increased to 7.5% when airborne".

**Voodoo Doll (恶咒娃娃, 99000047, grade A)** — datamine: `持续跟随玩家，玩家所受伤害的一半由异常物承担。` Fandom (search): "With Skill Rating 5, the Voodoo Doll's Vulnerability effect intensity is 60%, and the doll gains an additional 100% of the player's Max HP, dealing 500% Psi Intensity of PSI Damage to the nearest 5 enemies every second within 20 meters." 3.0.7: "corrected to 250% Psi Intensity at Skill Rating 5". OHDB "Enhance Vulnerability, Group Vulnerability". Trait Starfall Inversion "restores 1 point of Deviant Power (Skill) every 8s. Restores 1.5 points while airborne"; Fluffy Curse "+10% Energy recovery".

**Zeno-Purifier (皆斩, 99000038)** — datamine behaviour melee_blink (`瞬移至目标身边发动近战攻击`). OHDB "Melee Amplifier, Battle Partner … granting its owner a blink strike". Tier list: "katana strikes scaling to your skill rating". Variants Chaos, Dusken of Evernight, Lunar Oracle, Tiger Slash.

**Zapamander (电蝾螈, 99000059)** — datamine: `自主攻击敌对目标，造成异常伤害，攻击命中目标时使目标后续受到的电涌伤害提升{0}%。` (no formula). Dev blog Dec 2025: "lightning-fast sprint state" battle skill. OHDB "Sprint Boost, Silence Effect". 2.2.0 (Oct 29 2025) new; Oct-30 fix "effects of Corrosion and Zapamander did not function as described when used together".

**By-the-Wind (空之子, 99000032) / Radiant One (辉光·空之子, OHDB 92000032)** — OHDB "Protective Wind Wall, Aerial Platform"; dev blog: "one-way wind wall that blocks bullets". Traits Bursting Magma "+10% Energy recovery", Frigid Touch "+15%".

**Grumpy Bulb (恶臭球根, 99000035)** — OHDB "Chaos Target, AoE Chaos … disrupt enemy threat, making them attack each other". Trait Violet Robe "Max Energy (Skill) +40%".

**Mini Feaster (迷你黄衣, 99000053)** — datamine: `持续跟随玩家，每隔{0}s在某敌对单位周围生成{1}个触手拍击目标造成伤害。每生成{2}个触手，提升玩家{3}%的异常伤害，上限{4}%。` formulas `interval 1.5, tentacles 1, stacks 1, status_damage_bonus 7.5+deviation_degree*2.5, cap 30+deviation_degree*10`. → **player Status DMG +10…20 % per tentacle, cap 40…80 %**. OHDB "Battle Partner … marking enemies or summoning tentacles". Trait Starfall Inversion "+5% Status DMG, 7.5% airborne".

**Mini Wonder (迷你奇点, 99000050)** — OHDB "Bullet Immunity, Group Attraction … absorb bullets flying toward its owner"; extractor behaviour ammo_refill (`子弹吸收`). Traits Bursting Magma "Max Mood +35%", Starfall Inversion "+5% head and torso DMG reduction (7.5% airborne)".

**Snowsprite (冬灵, 99000058)** — datamine: `每隔{0}s在目标附近不断产生冰晶，冰晶被子弹命中后破碎，对周围目标造成{1}%的霜寒伤害。攻击的目标受到霜寒伤害+{2}%。` formulas `3`, `37.5+deviation_degree*12.5`, `18+deviation_degree*6`. OHDB "Ice Crystal Detonation, Battle Partner". Sep-4-2025 fix: "Snowsprite's Ice Crystals gained an extra damage bonus if they exploded while the player was wielding Raining Cash". Trait Spring's Return "Max Mood +35%".

**Invincible Sun (永恒烈阳, 99000026, grade A)** — datamine behaviour burn_bombard (parameter keys only). OHDB "Force Generation, Area Bombardment … periodically release blazing energy rays … continuous Burn DMG". Trait Starfall Inversion "+5% Blaze Elemental DMG (7.5% airborne)"; Malevolent Sun "Mood Recovery +20%".

**ZapCam (快照, 99000040, grade A)** — OHDB "Vulnerability Mark, Locked Fire … constantly photograph nearby enemies, increasing Weapon DMG received". OHMM 8.0× Psi entry quarantined. Trait Fools Memory "+10% Energy recovery".

**Soul Summoner (唤生灵, 99000066)** — datamine: `自主攻击敌对目标，造成异常伤害，攻击命中目标时，使目标后续受到的枪械伤害提升{0}%。` (no formula). Dev blog Oct 22 2025: "grants you the ability to call forth a phantom firebird that deals massive damage". OHMM baseFactor 6.0 ("600% × Psi Intensity"). 3.0.7 changed its combat effects (details unknown). OHDB "Vulnerability Mark, Fire Boost".

**Whalepup (鲸狗, 99000064)** — datamine: `…使目标后续受到的枪械伤害提升{0}%，若目标处于溺水状态，额外提升{1}%的易伤效果。` `16.875+deviation_degree*5.625`, `15`. Dev blog: "convert the battlefield into an underwater world … both Metas and Whalepup deal increased damage and immobilize enemies hit with water currents". Trait Don't Get Wet "the Player gains 10% DMG Reduction when Wet or in the Swimming Status". 3.0.7 changed its combat effects.

**Dog deviations — Brave George (epic), Behemoth (legendary on wiki / rare on OHDB), Chuckles, Watcher** — OHDB "A loyal companion for Metas"; 3.0.7 summary: "lets Beastmasters summon three pets at once", "free 5/5 dog Deviation through the Golden Autumn Harvest event". No skill numbers.

**Chaos variants** — OHDB separate ids 992xxxxx: Chaosaurus ("Straight-line Burn, Telekinetic Effects"), Chaos Mr. Wish, Chaos Snowsprite, Chaos Mini Wonder, Chaos Zeno-Purifier — "Chaos variant with high Dex value".

### Names from the brief that are NOT combat deviations
Frog the Leaper (Crafting — Spring Legs whim), Digby Boy / The Digby Boy (Territory), Hug-in-a-Bowl (Crafting; "Hug-in-a-Bug" not found), Rebecca (Territory, legendary — "summon the avatar of 'her' to comfort other Deviations"), Rebelle (not found), Wish Machine (gacha, not a deviation; Wish Box is Territory), Chef Cat (not found; Chefosaurus Rex is Territory/cooking), Snowy Snotface (not found — likely Snowsprite), Mini Avatar (not found), Nutcracker (Territory guard), Electric Eel (Territory in main game; "Damage output" only in the arena scenario), Director Fox (listed with "New Combat Deviations" in 2.2.0 notes but classified Territory/animal expert elsewhere).

## 4. Disagreements and picks
| Topic | Value A | Value B | Pick |
|---|---|---|---|
| Butterfly's Emissary weakspot bonus | 15/20/25/…/40 % (fandom/Game8, 2024-25) | 25.2–50.4 % (`18.9+6.3×deg`, client ≤ Mar 2026) | B (newer, primary) |
| Festering Gel recovery | flat 10 % HP & Sanity /s | 4.5–10.5 % HP, 2.25–5.25 % Sanity by level | B |
| Voodoo Doll ultimate | 500 % Psi/s (tooltip pre-3.0.7) | 250 % Psi/s at SR5 (3.0.7 correction) | B |
| Burn tick | 10 % Psi/stack (search) | 12 % Psi/stack (x91, OHMM) | unresolved (not this facet) |
| Power Surge proc | 50 % Psi (x91/sportskeeda) | 100 % (OHMM) | unresolved |
| Lonewolf baseFactor | 8.0× (OHMM "zapCamLoneWolf") | none | treat as unverified |
| Behemoth rarity | legendary (ohwikiguide) | rare (OHDB label) | labels differ in meaning; both kept |

## 5. What I could not find
* Full Battle Skill and Ultimate texts, costs (Power), cooldowns and durations for each deviation after the Dec-2025 overhaul (official blog and 2026 wikis blocked). Only Zapamander (sprint), By-the-Wind (wind wall), Voodoo Doll (250 % Psi/s ult), Festering Gel (Gel Shield) are partially known.
* Base max Deviation Power and its recovery rate per rating.
* Numeric coefficients for Soul Summoner, Zapamander, Pyro Dino (datamine string only), Invincible Sun, Enchanting Void, Mr. Wish, Dr. Teddy, Zeno-Purifier, ZapCam, Grumpy Bulb.
* Whether deviation damage can crit / hit weakspots / benefit from Vulnerability (community model says no, unverified).
* Version 3.0.7 details for Soul Summoner and Whalepup changes; any 3.0.x cooldown or Power changes.
* Whether `deviation_degree` is 1-based (assumed) or 0-based.
