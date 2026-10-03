# Once Human — Calibration & Blueprint Star System: Research Notes

Facet: weapon calibration, armor calibration, blueprint star (1★–6★) upgrade system.
Generated: 2026-10-03. Data file: `data/calibration.json`.

## 0. Provenance warning (read first)

- The research sandbox's network egress policy blocked **every** direct page fetch (WebFetch) for all hosts tried:
  oncehuman.game, once-human.fandom.com, wikily.gg, oncehuman.wiki.gg, steamcommunity.com, store.steampowered.com,
  game8.co, gamerant.com, games.gg, nexrivium.com, paradoxgaming.net, gamersandgeek.com, fandomwire.com,
  gamingwithdaopa.ellatha.com, theriagames.com, oncehumandb.com, dustbowl.games (reddit also unreachable).
- The session's WebSearch budget (200 calls, shared across the session) ran out part-way through this facet.
- Consequently **every number below comes from search-engine result snippets / summaries of the listed pages**, not
  from reading the pages. Numbers that appeared in two or more independent snippets are marked (2+). Everything
  should be re-verified against the live pages before being treated as authoritative.

## 1. Timeline of the systems (versions / dates)

| Date | Version | What happened | Source |
|---|---|---|---|
| 2024-07-09 | 1.0 | PC launch. Calibration (weapon + armor) and blueprint stars exist from launch. | Wikipedia |
| Dec 2024 | — | Blueprint Conversion System introduced (swap star levels between same-rarity blueprints; 6 conversions/week). Described as making "six-star gear much more achievable" ⇒ 6★ already existed. | paradoxgaming, dualshockers |
| 2026-01-07 | 2.2.5 | Fandom "Armor" page states: "Armor Calibration was removed on January 7, 2026 with the Version 2.2.5 update." The 2.2.5 announcement snippet itself lists Lightforge crate, 90 FPS option, bug fixes — no calibration text. **Disagreement.** | fandom Armor; oncehuman.game 2.2.5 |
| 2026-01-13 | — | Dev Blog "Comprehensive Optimization of Calibration & Accessories" published. | oncehuman.game dev blog; Steam news mirror |
| 2026-01-21 | 2.3.1 | Season 3 "Aberrant Progeny" (Visional Wheel S3). Calibration feature removed; calibration blueprints become crafting materials; accessories standardized; Mod revamps. Several outlets (games.gg, oncehumanverse) date the calibration overhaul to **January 21, 2026**. **My pick for the removal date of both weapon and armor calibration: 2026-01-21 / v2.3.1** (the dev blog of Jan 13 announces it as upcoming; fandom's Jan 7 date is recorded as the alternative). | oncehuman.game 2.3.1; Steam |
| 2026-03-11 | 2.3.4 | Preview of blueprint/Starchrom overhaul. | eaglgame / vortexgaming |
| 2026-03-25 | 2.3.5 | Blueprint fragments removed; blueprints activated and star-upgraded directly with Starchrom; Blueprint Shop (Stellar Stairway / Asterism) removed; fragment rewards converted to Starchrom. | oncehuman.game 2.3.5; soren.com; games.gg |

## 2. Current weapon calibration (v2.3.1+, since 2026-01-21)

Quotes gathered (dev blog 2026-01-13 / v2.3.1 notes, via snippets):

- "The Calibration feature will be removed (previously calibrated weapons will retain their unaffected stats), and gear workbenches will no longer support weapon calibration or blueprint replacement." (2+)
- "When crafting weapons, adding calibration blueprints will activate their attribute effects." (2+)
- "Newly obtained Calibration Blueprints have adjusted random attributes … maintaining their style attributes and always including one attack bonus attribute, with values varying by rarity (up to 50% attack bonus)." (2+)
- "New Legendary-Rarity Calibration Blueprints feature: Attack 33%~50% and Elemental DMG sub-attribute range: Elemental DMG 15%~20%."
- "Original Legendary-Rarity Calibration Blueprints had two Elemental DMG sub-attributes with random ranges: Elemental DMG 6%~8% and Elemental DMG 9%~12%. The new system consolidated these two random attributes into a single combined attribute to make room for the guaranteed attack bonus."
- games.gg: "Previously, blueprints rolled two separate random sub-attributes from a pool that included Crit Rate, Crit DMG, Elemental DMG, and Weakspot DMG. Under the updated system, those two slots collapse into one, with the value cap equal to the combined maximum of the old two attributes."
- Sportskeeda (Season 3): "The new Calibration system makes the buffs permanent at the cost of not being able to change them later. Additionally, all Blueprints will come with a bonus attack stat."
- wikily.gg item text: "Calibration Blueprints are single-use items for modifying Calibration attributes. They can be used at the Intermediate & Advanced Gear Workbench when crafting weapons…"; Capacity Expander: "This blueprint is outdated and can be disassembled at the Disassembly Bench to obtain a new blueprint of the same name."
- Acquisition: "obtained by disassembling 'Dropped Gear' (built) weapons obtained from weapon crates and received as rewards for completing Securement Silos." (2+)
- Community reaction thread: Steam "New calibration nerfed all weapon BTW" (Jan 2026) — players claim new fixed rolls are weaker than old max-rolled level-10 calibrations. Not quantified.

Rarity ranges below Legendary (Epic/Rare/Standard attack bonus): **not found**.

## 3. Legacy weapon calibration (launch → 2026-01-21)

- game8 / gamerant: "Calibrating a weapon will increase its DMG stat per calibration level at the cost of materials and Energy Links, which is done via the Gear Workbench. Reaching calibration levels 4, 7, and 10 will activate an additional calibration attribute." (2+)
- oncehumanverse (2026): "+4: Unlocks the blueprint's unique special effect… +7: Unlocks the second stat line… +10: Unlocks the third and final stat line."
- fandom: "The primary damage stats depend on the rarity of the calibration blueprint, while secondary and tertiary stats are randomized based off a set percentage for the stat."
- Max calibration level: 10. DMG gained per level: **not found**. Energy Link / material cost per level: **not found**.
- Whether the calibration level cap depended on blueprint stars (brief asked "1★ allows up to level X"): **no source mentions any star gate**. Recorded as null.

## 4. Weapon calibration blueprint styles (fixed "style attributes")

Confirmed values (fandom Calibration_Blueprints table via snippets; some also wikily item pages):

| Blueprint | Style | Class | Effects |
|---|---|---|---|
| Precision Assault Rifle | Precision | AR | Attack +25%, Range +40%, Fire Rate −10% (2+) |
| Rapid Assault Rifle | Rapid Shot | AR | Fire Rate +20%, Reload Speed +40%, Attack −10% |
| Heavy Assault Rifle | Heavy | AR | Magazine Capacity +75%, Reload Speed −30% (2+) |
| Precision Pistol | Precision | Pistol | Attack +25%, Range +40%, Fire Rate −10% (2+) |
| "P22" (name as listed; likely the Rapid pistol) | Rapid Shot | Pistol | Fire Rate +20%, Magazine Capacity +32%, Attack −15% |
| Portable Pistol | Portable | Pistol | "Mobility +50, Movement Speed +12.5%, Speed while Holding Gun +50%" (snippet ambiguous — see JSON note) |
| Heavy SMG | Heavy | SMG | Magazine Capacity +60%, Reload Speed −30% |
| Light SMG | Lightweight | SMG | Reload Speed +150%, Magazine Capacity −30% |
| 12-Gauge | Rapid Shot | Shotgun (DBSG/DB12/ACS12/S870) | Fire Rate +25%, Magazine Capacity +45%, Attack −10% |
| 16-Gauge | Lightweight | Shotgun | Reload Speed +150%, Magazine Capacity −30% |
| 20-Gauge | Heavy | Shotgun | Magazine Capacity +60%, Reload Speed −30% |
| Assault Machine Gun | Assault | LMG | Attack +25%, Magazine Capacity −30%, Stability −50 |
| Precision Crossbow | Precision | Crossbow | Attack +12.5%, Range +20%, Reload Speed −25% |
| Portable Crossbow | Portable | Crossbow | Mobility +30, Weapon Switching Speed +35%, Movement Speed while Holding Gun +7.5% |

Known to exist but values NOT retrieved: Assault SMG; Steady Sniper, Rapid Sniper, Frugal Sniper Rifle, Handy Sniper
(SN700 / AWS.338 / HAMR); Rapid Machine Gun, Steady Machine Gun; Structural Destruction (quality 3) and Capacity
Expander (quality 2) for Heavy Artillery; "Calibration Blueprint Selectable - Sniper Rifle" (selector item).

Observed pattern (useful for filling gaps, unverified): same style ⇒ same numbers across most classes
(Precision = +25% Atk/+40% Range/−10% FR; Heavy = +60–75% Mag/−30% Reload; Lightweight = +150% Reload/−30% Mag),
with crossbow values roughly halved.

Stat pool that calibration can touch (games.gg): Weapon DMG, Fire Rate, Reload Speed, Heavy Attack DMG, Melee Attack
Speed, Melee Stamina Cost, Crit DMG, Movement Speed (holding gun), Magazine Capacity, Weakspot DMG, Mobility
(movement speed while firing), Stability, Elemental DMG, Range.

The names "Vigorous", "Hunter", "Sharpshooter" from the brief returned zero hits; they appear not to exist.

## 5. Armor calibration

Legacy (fandom "Armor"): "Armor is calibrated on the Gear Workbench and/or Advanced Gear Workbench. Materials required
… are dependent on the materials used to craft the armor piece (e.g., a tier I Rustic Hat requires Shabby Fabric…)."
Slots by blueprint tier: I = 2, II = 2, III = 4, IV = 4, V = 6. "Calibrating armor will increase its HP and Psi
Intensity." Per-calibration HP/Psi values: **not found**. No named armor calibration blueprints existed.

Current replacement (Sportskeeda Season 3): "fur added during armor crafting now provides HP and Psi Intensity bonuses
based on fur rarity, with legendary-quality fur increasing base HP and Psi Intensity by 40%." Lower-rarity fur values:
**not found**.

## 6. Blueprint star system

- Max stars by rarity (fandom Blueprints + Steam): Standard 3, Rare 4, Epic 5, Legendary 6. "Star Limit is also
  Rarity Locked, Blue Gear won't reach 5 or 6 Star."
- Legendary star-up costs (Steam thread, wikily Blueprint Calculator, fandomwire, paradoxgaming — 3+ sources agree):
  XP 1→2 1,600 · 2→3 4,000 · 3→4 6,000 · 4→5 8,000 · 5→6 10,000 = **29,600 XP total**.
  Starchrom 1→2 3,000 · 2→3 6,000 · 3→4 9,000 · 4→5 12,000 · 5→6 15,000 = **45,000 total** (2+).
  "Even with double XP from same-name blueprints, it still takes 493 of them, or 986 if they're not an exact match"
  ⇒ one fragment = 30 XP, same-weapon fragment = 60 XP (derived).
- After v2.3.5 (2026-03-25) only Starchrom is used; devs: "The expected Starchrom cost to unlock and upgrade blueprints
  will remain the same as before." Armor Starchrom schedule "varies by type" — exact values not found.
- Weapon stat scaling: DE.50 Jaws "base damage at 1-star is 128 … 6★ … 160 DMG" ⇒ ×1.25 over five star-ups ⇒
  **+5% of 1★ base per star** (my pick). Steam players: "approximately 4% for each star level" (consistent with the
  relative step 5/105…5/120). gamersandgeek: "weapon stars increase damage by about 10-15%" (**disagrees**, older/vaguer;
  rejected). One anecdote "1★→3★ 9950→10050 DPS" (~1%) is inconsistent with everything else; rejected.
- Armor stat scaling: fandom Raid Helmet enhancement tier I HP 296 / PR 16 / Psi 92 → tier IV HP 352 / PR 16 / Psi 109.
  352/296 = 1.189, 109/92 = 1.185 ⇒ ≈ +18.75% over three star-ups ⇒ **+6.25% of 1★ base per star**, Pollution Resist
  unchanged (derived from a single item; low-medium confidence). Fandom: "The higher the number of stars, the higher
  the HP and PSI intensity."
- Blueprint tiers (I–V) are a separate axis from stars: "Blueprint tiers increase the HP, Pollution Resist, and Psi
  Intensity of armor… Blueprint enhancement tiers further increase the HP and Psi Intensity of armor across all their
  blueprint tiers."
- Not found: whether stars change weapon special-effect values, set-effect values, mod slots or any unlock; any
  dated note introducing 6★ (believed launch feature).

## 7. Disagreements log

1. Armor calibration removal date: fandom 2026-01-07 (v2.2.5) vs dev blog/2.3.1 2026-01-21. Pick: 2026-01-21.
2. Weapon damage per star: +5%/star (Jaws data) vs "~4%" (Steam, relative) vs "10-15% overall" (gamersandgeek). Pick: +5% of base per star.
3. Portable Pistol attribute labels: snippet garbled; mapped by analogy with Portable Crossbow.
4. Workbench used to apply calibration at craft time: fandom/wikily say Intermediate & Advanced **Gear** Workbench; one summary said "Advanced Supplies Workbench" (likely wrong). Pick: Gear Workbench.

## 8. Could not find

- Attack-bonus ranges for Epic/Rare/Standard calibration blueprints under the 2026 system.
- Style values for 10 of the 24 known blueprint names (snipers, LMG rapid/steady, heavy artillery, Assault SMG).
- Legacy per-level DMG gain and Energy Link costs; whether calibration level cap depended on stars.
- Legacy armor calibration HP/Psi per level.
- Exact armor Starchrom star-up schedule; Epic/Rare weapon star-up schedules.
- Any star-dependent unlock other than base stats; whether special effects scale with stars.
- A dated source for the introduction of 6★ (strong inference: at launch).

## 9. All source URLs consulted (via search snippets)

- https://www.oncehuman.game/news/devBlog/20260113/40781_1281545.html
- https://store.steampowered.com/news/app/2139460/view/521987045620452181
- https://www.oncehuman.game/news/update/20260121/40780_1282991.html
- https://store.steampowered.com/news/app/2139460/view/521987045620450828
- https://www.oncehuman.game/news/update/20260107/40780_1280584.html
- https://www.oncehuman.game/news/update/20260325/40780_1292938.html
- https://once-human.fandom.com/wiki/Calibration_Blueprints
- https://once-human.fandom.com/wiki/Armor
- https://once-human.fandom.com/wiki/Blueprints
- https://once-human.fandom.com/wiki/Raid_Set_(Armor)
- https://wikily.gg/once-human/items/90000410/ (+ item pages 30399146, 30398001, 30398012, 30393013, 30393012, 30392001, 30392013, 30392022, 30395023, 30395021, 30395121, 30395012, 30396002, 37190075)
- https://wikily.gg/once-human/blueprint-calculator/
- https://wikily.gg/once-human/armor-blueprints/
- https://wikily.gg/once-human/weapon-blueprints/
- https://games.gg/once-human/guides/once-human-calibration-mods-guide/
- https://gamerant.com/once-human-how-get-farm-weapon-calibration-blueprints-gold/
- https://game8.co/games/Once-Human/archives/462834
- https://www.sportskeeda.com/mmo/once-human-calibration-changes-season-3-explained
- https://gamersandgeek.com/once-human-weapon-armor-gear-stars/
- https://paradoxgaming.net/gamearticle.php?id=sixstarblueprints
- https://fandomwire.com/how-to-unlock-6-star-weapons-quickly-in-once-human/
- https://www.dualshockers.com/once-human-blueprint-conversion/
- https://steamcommunity.com/app/2139460/discussions/0/573792101998820965/
- https://steamcommunity.com/app/2139460/discussions/0/6330466705287939267/
- https://steamcommunity.com/app/2139460/discussions/0/4515505458305613542/
- https://steamcommunity.com/app/2139460/discussions/0/819227976894927751/
- https://steamcommunity.com/app/2139460/discussions/0/807971325890105662/
- https://oncehumanverse.com/posts/the-once-human-endgame-grind-weapon-calibration-blueprints-in-2026
- https://nexrivium.com/guides/once-human-endgame-weapon-calibration-guide
- https://www.oncehumandb.com/items/calibration-blueprint-steady-sniper
- https://theriagames.com/guide/once-human-de50-jaws/
- https://vortexgaming.io/en/postdetail/713570
- https://en.wikipedia.org/wiki/Once_Human_(video_game)
