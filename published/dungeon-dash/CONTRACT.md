# Dungeon Dash — architecture & module contract

Dungeon Dash is a browser idle / auto-battler RPG modeled on **Dungeon Rush** by Lava Labs
(fan-made, not affiliated). It is a portrait, phone-first game that also runs on desktop.

This file is the **single source of truth** for how the modules fit together. Every module
author codes against it. If you need something that is not here, add it to *your own* module in a
backwards-compatible way and note it in your final report. Do not change another module's file.

---

## 1. Game design (what the player experiences)

Source facts about Dungeon Rush we are reproducing:

* The hero runs through an **endless dungeon** and **auto-battles** waves of enemies that get harder
  every floor. Kills drop **gold** and **loot chests**.
* "You rush into the dungeon non-stop until you die, revive, and repeat." Idle alone stalls you: you
  must **open chests** and equip better gear to push deeper.
* **Chests** → a random piece of gear (medieval fantasy → sci-fi as you go deeper). The game shows
  the new item against what you wear (**compare**), you **Equip** or **Sell** it. Equipping
  something better raises **Combat Power (CP)**.
* **Auto-Loot**: rules to auto-sell gear of chosen rarities and keep/auto-equip upgrades.
* Spend **gold to upgrade the chest level**, which raises the odds of rarer (up to legendary+) loot.
* **Tap the flying winged chest** that crosses the screen for random rewards (gems, chests, keys…).
* **Gems** buy **Mastery** levels (permanent bonuses).
* **Skill Scrolls** unlock/upgrade **active skills** (AoE bombs, buffs, spinning blades…), which
  auto-cast in battle.
* **Boss Dungeons** (cost a key): unique bosses — dragons, zombie hordes… — reward premium loot
  boxes, Skill Scrolls and gems.
* **Allies** ("command powerful allies") fight beside the hero.
* **AFK rewards**: on return the player collects gold/chests earned while away.

### Core loop
1. Battle view runs continuously: Floor F has waves 1–4 (normal) and wave 5 (**boss**, 30 s timer).
2. Killing the boss → next floor (+3 chests, gold, 4 gems — 10 on every 5th floor, 25 on every 10th).
3. Hero dies in waves 1–4 → revive after 2 s, restart wave 1 of the same floor.
4. Hero dies vs boss or the timer runs out → **farming mode**: loop waves 1–4 of the floor forever,
   earning loot. "Challenge Boss" button retries; with `settings.autoBoss` on, the game retries the
   boss automatically after each full 4-wave loop.
5. Meanwhile the player opens chests, equips upgrades, upgrades the chest level, skills, allies,
   mastery, and runs Boss Dungeons. CP goes up, the wall breaks, repeat.

### Balance targets (integrator tunes numbers to hit these with a headless sim)
* Fresh save: floor 1 cleared in ~30–45 s without opening chests; floors 1–4 need no gear.
* An active player (opens all chests, equips upgrades, buys the cheapest useful upgrade) reaches
  about floor 10 after ~10 min and about floor 20 after ~40 min of simulated play; walls are felt
  around floors 6–8, 12–15, 20+.
* A purely idle player (never opens chests) stalls at about floor 5–7.
* No NaN/Infinity anywhere; numbers grow exponentially and are formatted with suffixes.

Measured with `node tests/sim.mjs` (the real core/data/state/battle in a Node vm at a fixed 1/60 s
step; policies `idle` = never opens a chest, `active` = every 10 s opens every chest, equips CP
upgrades, sells the rest, claims quests, buys skills/allies/mastery/chest levels/ally levels and runs a
dungeon with each key, taps every flying chest; `casual` = the same every 5 min), mean of seeded runs
(seeds 1–3 and 11–15):

| | 2 min | 5 min | 10 min | 20 min | 40 min | 60 min | 120 min |
|---|---|---|---|---|---|---|---|
| idle floor | 3 | 4 | 5 | 6 | 6 | 6 | 7 |
| casual floor | 4 | 6 | 8 | 10–11 | 13–14 | 16 | 21 |
| active floor | 3 | 6 | 10–11 | 13–14 | 19 | 23 | 31–32 |

Fresh save clears floor 1 in ~40 s (idle 42 s). Active reaches floor 10 at ~9 min, 20 at ~40–44 min,
30 at ~100 min (41 at 240 min); its slowest floors are 12 (~6–7 min), 16–18 (~4–7 min), 21 (~10 min)
and 26–27 (~6–16 min); no floor takes longer than ~17 min. The 6–8 wall stops an idle hero at floor 6
(it dies to the boss and farms there) and costs a casual player 2–10 min per floor; the active
player's power spike from its first chests, quests and dungeons carries it through to 11–12.
Every upgrade type matters (`--ablate`, active floor at 120 min without it: chest levels −8, mastery −9,
skills −6, allies −3 to −4, dungeons −2 to −3, flying chest −10). Knobs: `BALANCE.enemy.{hpGrowth, atkGrowth,
walls, wallAtkExp, biomeStep}`, `item.growth`, `hero.growth`, `xp`, the reward tables.

---

## 2. Files, load order, globals

```
src/index.html        page shell (owned by UI author; script order fixed below)
src/style.css         all CSS (UI author)
src/js/core.js        namespace DD, event bus, formatting, math helpers   (pre-written, read-only)
src/js/data.js        static content + pure formulas                       (ECON author)
src/js/state.js       save state, economy actions, offline, quests         (ECON author)
src/js/sprites.js     procedural pixel art + icon data URLs                (SPRITES author)
src/js/battle.js      combat simulation, no drawing                        (BATTLE author)
src/js/render.js      canvas scene drawing, VFX, tap hit-testing           (RENDER author)
src/js/audio.js       WebAudio sfx driven by bus events                    (RENDER author)
src/js/ui.js          DOM UI: HUD, panels, modals, toasts                  (UI author)
src/js/main.js        boot + game loop + hot-reload hooks                  (pre-written; integrator-owned)
build.mjs             inlines everything into dist/                        (pre-written)
```

* Plain **classic scripts** (no ES modules, no bundler, no npm deps at runtime) so the page works from
  `file://`, from a static server, and inlined into one HTML file.
* Every file is an IIFE: `(function (DD) { 'use strict'; ... })(globalThis.DD);` and attaches its API
  to `DD.<module>` (e.g. `DD.data`, `DD.state`). No other globals.
* `data.js` and `state.js` must also work in **Node** (no DOM access at load time; guard any
  `localStorage`/`document` use with `typeof` checks and try/catch). `battle.js` must also run in Node
  (no DOM) so a headless simulation can drive it.
* Load order is the order in the table above (core, data, state, sprites, battle, render, audio, ui, main).
  Modules may reference each other **lazily** (inside functions), never at load time, except
  everything may use `DD.bus`, `DD.fmt`, etc. from core at load time.

### core.js (already written — read it)
`DD.WORLD = { W: 360, H: 200, GROUND: 170, HERO_X: 84 }` battle world in logical pixels.
`DD.bus.on(evt, fn) → unsubscribe`, `DD.bus.off(evt, fn)`, `DD.bus.emit(evt, payload)`.
`DD.fmt(n)` → "999", "1.23K", "45.6M", "7.89B", "1.20T", "3.4aa"…; `DD.fmtPct(fraction, digits=1)` → "12.5%";
`DD.fmtTime(seconds)` → "1h 05m" / "4m 12s" / "38s"; `DD.fmtTimer(seconds)` → "0:23".
`DD.clamp, DD.lerp, DD.rand(min,max), DD.randInt(min,maxInclusive), DD.chance(p), DD.pick(arr),
 DD.weightedIndex(weights), DD.uid(prefix), DD.easeOutCubic(t)`.

### main.js
Boots (load → sprites → ui → render → audio → battle → AFK modal), then runs one rAF loop: battle in
fixed 1/60 s steps (× `settings.speed`), `state.tick`, `render.draw`, `ui.frame`. AFK rewards are
collected on load, when the tab comes back after ≥ 60 s hidden, and when two frames are ≥ 60 s apart
while visible (a device that slept with the tab open fires no `visibilitychange`).

---

## 3. Shared vocabulary (IDs every module must use verbatim)

### Rarities (index 0..6)
| idx | id | name | color | stat mult | substats |
|---|---|---|---|---|---|
| 0 | common | Common | `#9aa3ad` | 1.0 | 0 |
| 1 | uncommon | Uncommon | `#5fd068` | 1.35 | 1 |
| 2 | rare | Rare | `#4aa3ff` | 1.8 | 2 |
| 3 | epic | Epic | `#b46cff` | 2.45 | 3 |
| 4 | legendary | Legendary | `#ffa726` | 3.3 | 4 |
| 5 | mythic | Mythic | `#ff5252` | 4.5 | 4 (rolls ×1.5) |
| 6 | celestial | Celestial | `#5ef3ff` | 6.2 | 5 (rolls ×2) |

### Equipment slots (`DD.data.SLOTS`, in this display order)
`weapon` (atk ×1.0), `helmet` (hp ×0.6), `armor` (hp ×1.0), `gloves` (atk ×0.4),
`boots` (hp ×0.5), `belt` (hp ×0.5), `ring` (atk ×0.5), `amulet` (atk ×0.5).

### Eras (item look/name by item level) — `DD.data.ERAS`
| idx | id | name | from ilvl |
|---|---|---|---|
| 0 | medieval | Medieval | 1 |
| 1 | arcane | Arcane | 11 |
| 2 | infernal | Infernal | 21 |
| 3 | steampunk | Steampunk | 31 |
| 4 | cyber | Cyber | 41 |
| 5 | cosmic | Cosmic | 51 |

### Substats (`DD.data.SUBSTATS`, all stored as fractions)
`critChance, critDmg, atkSpeed, combo, counter, dodge, stun, lifesteal, regen, skillDmg, bossDmg, goldBonus`.

### Hero stats object (`DD.state.getHeroStats()`)
```js
{
  atk, hp,                 // final flat numbers (hp = max HP)
  atkSpeed,                // attacks per second, final (base 1.0, cap 4)
  critChance,              // 0..1   (base 0.05, cap 1)
  critDmg,                 // multiplier on crit (base 1.5, i.e. 150%)
  combo,                   // 0..0.75 chance to strike again immediately (chain max 3)
  counter,                 // 0..0.75 chance to strike back when hit
  dodge,                   // 0..0.6
  stun,                    // 0..0.5 chance per hit to stun target 1s (bosses 0.4s)
  lifesteal,               // fraction of damage dealt healed
  regen,                   // fraction of max HP regenerated per second
  skillDmg, bossDmg, goldBonus, // additive bonuses, e.g. 0.25 = +25%
  chestChance,             // per-kill chest drop chance (base 0.3, +mastery), 0..1
}
```

### Biomes (`DD.data.BIOMES`; biome index = `Math.floor((floor-1)/10) % 6`)
| id | name | normal enemy types | boss type |
|---|---|---|---|
| crypt | The Crypt | `skeleton` (melee), `bat` (fast, flying), `slime` (slow, tanky) | `lich` |
| fungal | Fungal Hollows | `mushroom` (melee), `spider` (fast), `sporeling` (ranged, proj `spit`) | `myconid_king` |
| forge | Magma Forge | `imp` (ranged, proj `fireball`), `magma_golem` (tanky), `fire_hound` (fast) | `infernal` |
| clockwork | Clockwork Depths | `cog_knight` (melee), `steam_bot` (ranged, proj `bolt`), `gear_rat` (fast) | `brass_colossus` |
| neon | Neon Grid | `drone` (ranged, flying, proj `laser`), `cyber_ninja` (fast), `mech` (tanky) | `ai_core` |
| void | Void Rift | `alien` (melee), `void_eye` (ranged, flying, proj `orb`), `tentacle` (tanky) | `void_titan` |

Boss-dungeon enemy types: `dragon` (boss), `zombie` (horde unit), `stone_golem` (boss), `overlord` (boss).

### Projectile kinds
`arrow, fireball, spit, bolt, laser, orb, rock` (enemy) — hero is melee (no projectile).

### Skills (`DD.data.SKILLS`, id → def)
| id | name | effect (level L, base at L=1) | CD | unlock (scrolls) |
|---|---|---|---|---|
| bomb | Fire Bomb | AoE all enemies 300% ATK (+30%/L) | 8s | owned at start |
| blades | Spinning Blades | 5s aura: every 0.5s hits all enemies within 70px for 60% ATK (+6%/L) | 12s | 10 |
| warcry | Battle Cry | 6s buff: +30% ATK (+3%/L), +20% atk speed | 15s | 10 |
| heal | Healing Light | heal 25% max HP (+1.5%/L) | 14s | 15 |
| lightning | Chain Lightning | hits up to 3 (+1 per 5 L) nearest enemies 220% ATK (+22%/L) | 7s | 20 |
| shield | Arcane Shield | absorb shield 30% max HP (+2%/L) for 8s | 18s | 20 |
| frost | Frost Nova | 150% ATK (+15%/L) to all, freeze 2.5s (+0.05s/L) | 16s | 30 |
| meteor | Meteor Strike | 600% ATK (+60%/L) to all + stun 1.5s | 20s | 40 |
Upgrade cost (scrolls) from L to L+1: `Math.ceil(2 + L * 1.5)`, max level 30. Skill damage is multiplied
by `(1 + stats.skillDmg)`. 4 equip slots; slots unlock at floor 1, 5, 12, 25 (`highestFloor`).

### Allies (`DD.data.ALLIES`)
| id | name | behaviour (level L) | unlock |
|---|---|---|---|
| wolf | Dire Wolf | bite nearest enemy every 1.2s for 60% hero ATK (+6%/L) | 100 gems |
| fairy | Pixie | heals hero 4% max HP (+0.4%/L) every 2s | 200 gems |
| drone_ally | Battle Drone | shoots nearest enemy every 0.6s for 35% ATK (+4%/L) | 400 gems |
| golem_ally | Ember Golem | slam all enemies within 90px every 3s for 120% ATK (+12%/L) | 600 gems |
Allies never take damage. Upgrade costs gold: `Math.floor(500 * 1.5^(L-1))`, max level 50.
2 ally slots; slot 1 unlocks at floor 4, slot 2 at floor 20.

### Mastery (`DD.data.MASTERY`, bought with gems)
| id | name | per level | max |
|---|---|---|---|
| might | Might | +6% ATK | 100 |
| vitality | Vitality | +6% HP | 100 |
| greed | Greed | +8% gold | 50 |
| fortune | Fortune | +1% chest drop chance (absolute) | 30 |
| precision | Precision | +5% crit damage | 50 |
| patience | Patience | +1h offline cap (base 8h) | 16 |
Cost (gems) of level L→L+1: `10 + 6 * L` (might/vitality), others `20 + 10 * L`.

### Boss Dungeons (`DD.data.DUNGEONS`; each run costs 1 key; each has its own level ≥1)
| id | name | unlock floor | fight | main reward |
|---|---|---|---|---|
| dragon | Dragon's Lair | 3 | one `dragon` boss, 45s | Skill Scrolls |
| horde | Zombie Horde | 6 | kill 25 `zombie`s (spawn in groups) in 45s | Gems |
| vault | Golem Vault | 10 | one `stone_golem` boss, 45s | Premium chests (min Rare, chest Lv +3) |
| mothership | Mothership | 20 | one `overlord` boss, 45s | Gold (≈ 3 min of income) + Scrolls |
Dungeon enemy strength equals campaign floor `2 + level * 3`. Winning raises that dungeon's level by 1.
Rewards at level L: dragon `10 + 4L` scrolls; horde `40 + 20L` gems; vault `2 + floor(L/2)` premium
chests; mothership 180 s of reference income (`refKillsPerSec` × kill gold) at floor `2 + 3L + 15`, plus
`3 + L` scrolls.
Keys: max 5, start with 3, +1 every 30 min real time (also while offline), flying chest may give one.

### Currencies & counters (state fields)
`gold, gems, keys, scrolls, chests, premiumChests`.

---

## 4. State module — `DD.state` (ECON author)

### Persistent shape: `DD.state.s`
```js
{
  version: 1,
  createdAt: msEpoch, lastSeen: msEpoch,
  hero: { level: 1, xp: 0 },
  gold: 0, gems: 0, keys: 3, scrolls: 0,
  chests: 10, premiumChests: 0,
  chestLevel: 1,                              // 1..20
  equipped: { weapon: Item|null, helmet: …, armor: …, gloves: …, boots: …, belt: …, ring: …, amulet: … },
  pendingItem: Item|null,                     // item shown in the chest modal awaiting Equip/Sell
  campaign: { floor: 1, wave: 1, highestFloor: 1, farming: false },
  skills: { owned: { bomb: 1 }, equipped: ['bomb', null, null, null] },
  allies: { owned: {}, equipped: [null, null] },
  mastery: { might: 0, vitality: 0, greed: 0, fortune: 0, precision: 0, patience: 0 },
  dungeons: { dragon: { level: 1 }, horde: { level: 1 }, vault: { level: 1 }, mothership: { level: 1 } },
  keyRegenAt: msEpoch,                        // when the next key arrives (only meaningful if keys < 5)
  quest: { index: 0, claimedIds: [] },
  stats: { kills, bossKills, chestsOpened, itemsSold, itemsEquipped, flyingChests, dungeonsWon,
           deaths, playTime, goldEarned, bestItemRarity },   // all numbers, start 0 (bestItemRarity -1)
  settings: { sound: true, speed: 1, autoSkill: true, autoBoss: true,
              autoLoot: { sell: [true, true, false, false, false, false, false],  // per rarity idx
                          autoEquip: true, stopRarity: 4 } },
  autoOpen: false,
}
```
### Item shape
```js
{ id: 'it_xxx', slot: 'weapon', rarity: 0..6, ilvl: int>=1, era: 0..5, name: 'Iron Longsword',
  main: { stat: 'atk'|'hp', value: number },
  subs: [ { stat: SubstatKey, value: fraction } ] }
```
Item names: `<era-specific base name for slot>` (e.g. weapon: Rusty Sword → Runed Blade → Hellfire
Cleaver → Steam Saber → Plasma Katana → Star Edge); ECON author writes ≥3 base names per slot per era.

### API (all mutations emit `'state:changed'` — coalesced, see §7)
```
load()                       // from localStorage key 'dungeon-dash-save-v1'; new game if missing/corrupt
save()                       // sets lastSeen = Date.now(); writes localStorage (try/catch)
serialize() → string          // JSON
deserialize(str) → boolean    // validates + migrates; fills missing fields with defaults
reset()                      // wipe to a fresh game (also clears storage)
exportCode() → string         // base64 of serialize()
importCode(code) → boolean
tick(dtRealSeconds)           // playTime, key regen, auto-open cadence (one chest / 0.3s), autosave every 15s

getHeroStats() → HeroStats    // memoized; recomputed after any change to gear/level/mastery/skills/allies
getPower(stats?) → number     // Combat Power of the hero (DD.data.calcPower)
xpToNext() → number

addGold(n) addGems(n) addChests(n) addXp(n) addScrolls(n) addKeys(n)
spend(currency, n) → boolean  // 'gold'|'gems'|'scrolls'|'keys'

// battle callbacks
grantKill(info) → { gold, xp, chest:boolean }   // info: { floor, isBoss, typeId, gold, xp }
onFloorCleared(floor) → rewards                   // advances campaign.floor, highestFloor; returns {chests, gold, gems}
setWave(n) ; setFarming(bool)
onHeroDied()                                      // stats.deaths++
grantFlyingChest() → { type: 'gems'|'chests'|'gold'|'key'|'scrolls', amount, label }
grantDungeonWin(id) → rewards {gems?, scrolls?, premiumChests?, gold?}  // and level++
useKey() → boolean

// chests & gear
openChest({ premium?: boolean }) → { item, decision: 'pending'|'sold'|'equipped' } | null
     // null if no chests (or no premium chests) or an item is already pending.
     // Manual open (autoOpen false) → always 'pending'.
     // Auto open: CP upgrade → 'equipped' if autoLoot.autoEquip else 'pending';
     //            not an upgrade and autoLoot.sell[rarity] → 'sold';
     //            rarity >= autoLoot.stopRarity → 'pending' (and autoOpen switches off);
     //            otherwise 'pending' (autoOpen switches off).
equipPending()    // equips pendingItem, auto-sells the previously worn item; clears pending
sellPending()     // sells pendingItem; clears pending
comparePending() / compareItem(item) → { current: Item|null, powerBefore, powerAfter, delta,
                   lines: [ { stat, label, before, after, diff, fmt:'num'|'pct' } ] }
itemSellValue(item) → gold
chestUpgradeCost() → gold ; upgradeChestLevel() → boolean ; rarityOdds(level?) → number[7] (sums to 1)
setAutoOpen(bool)

// skills / allies / mastery
skillSlotsUnlocked() → 1..4 ; unlockSkill(id) ; upgradeSkill(id) ; equipSkill(id, slot) ; unequipSkill(slot)
skillCost(id) → { unlock?: n, upgrade?: n }
allySlotsUnlocked() → 0..2 ; unlockAlly(id) ; upgradeAlly(id) ; equipAlly(id, slot) ; unequipAlly(slot) ; allyUpgradeCost(id)
upgradeMastery(id) ; masteryCost(id)
// all return boolean success; on failure emit 'toast' {text:'Not enough gems', kind:'bad'} etc.

// quests
currentQuest() → { id, text, progress, target, done, reward:{gems?,chests?,scrolls?,gold?,keys?}, rewardText } | null
claimQuest() → boolean

// offline
collectOffline(nowMs) → null | { seconds, cappedSeconds, gold, chests, xp, keys }  // applies rewards; null if < 60s away
setSetting(path, value)  // e.g. setSetting('autoLoot.stopRarity', 5)
```
Offline income estimate (`estimateIncome`): on the current floor (waves 1–4 only), with `n` = average
wave size, kills/sec = `min(1.2, n / (waveOverhead + killTime + deathOverhead))`.
`killTime = n × avgEnemyHp / (dpsMult × kitDps)`: the kit DPS is the auto-attack DPS (atk × crit ×
atkSpeed × combo) plus every equipped skill at its cooldown (× `skillUptime` 0.8; area skills hit
`aoeTargets` 2.5 enemies) and every equipped ally, so skill and ally upgrades raise AFK income too.
`deathOverhead = deathCost (8 s) / wavesPerLife`, where a wave costs the hero `threat (0.2) × the DPS of
the enemies in reach (front melee per lane + every shooter, less dodge) × killTime` HP minus what
regen, lifesteal, the Pixie and Healing Light heal over the wave; a hero that never runs out of HP pays
nothing. `waveOverhead` 5.5 s and `dpsMult` 1.1 are calibrated against live farming in
`tests/sim.mjs` (the estimate lands at ~0.7–0.9 of the live kill rate, including heroes that keep
dying). Gold and chests × 0.75, xp × 0.5 (`offlineXpEfficiency`), capped by `8h + patience`. The flying
chest's gold reward (150 s of estimated income, at least 30 kills' gold) uses the same estimate;
`goldIncomeRate` uses `refKillsPerSec` 0.5.

---

## 5. Data module — `DD.data` (ECON author)
Constants: `RARITIES, SLOTS, ERAS, SUBSTATS, BIOMES, ENEMIES, SKILLS, ALLIES, MASTERY, DUNGEONS,
QUESTS, WAVES_PER_FLOOR (5), BOSS_TIME (30), DUNGEON_TIME (45), MAX_CHEST_LEVEL (20), MAX_KEYS (5),
KEY_REGEN_MS (1800000)`.

`ENEMIES[typeId] = { name, hpMult, atkMult, speed /*px per s*/, range /*px*/, atkSpeed, flying,
ranged, projectile /*kind|null*/, w, h /*logical px for hit box & sprite*/, boss }`
Sizes: normal ≈ 16–24 px tall, bosses 40–56 px tall, dragon/overlord up to 64.

Pure functions:
```
biomeForFloor(f) → BIOMES[i]
wallMult(f) → number                                 // biomeStep per biome passed × every wall reached
enemyStats(floor, typeId, { isBoss }) → { hp, atk, atkSpeed, gold, xp }  // hp × wallMult, atk × wallMult^0.7
waveComposition(floor, wave) → typeId[]          // wave 1–4: 3–6 normals; wave 5: [boss, ...0–2 normals]
                                                 // (boss minions only from types with hp mult ≤ 1.3)
heroBaseStats(level) → { atk, hp }
xpToNext(level) → number
rollItem({ ilvl, chestLevel, premium }) → Item     // uses rarityOdds; premium: min rare, chestLevel+3
itemIlvl(highestFloor) → int                        // max(1, highestFloor + randInt(-3, 1))
rarityOdds(chestLevel) → number[7]
chestUpgradeCost(level) → gold
itemSellValue(item) → gold
calcPower(stats) → number                           // single CP number from a HeroStats object
skillParams(id, level) → { dmg?, duration?, heal?, shield?, targets?, freeze?, stun?, buffAtk?, buffSpd?, tick?, radius? }
skillDesc(id, level) → string                       // human text with numbers for that level
allyParams(id, level) → { interval, dmg?, heal?, radius? }
allyDesc(id, level) → string
masteryDesc(id, level) → string
dungeonRewards(id, level) → rewards object ; dungeonDesc(id) → string
```
Chest odds: Lv1 ≈ [80,18,2,0,0,0,0]%; Legendary first appears at Lv6 (≈0.2%), Mythic at Lv11,
Celestial at Lv16; Lv20 ≈ [4,16,30,27,15,6,2]%. Upgrade cost `Math.floor(400 * 2.15^(L-1))`.

Quests: a fixed tutorial chain of ~25 (open chests, equip, reach floors, upgrade chest, unlock a
skill, unlock an ally, run a dungeon, tap a flying chest, buy mastery…), then an endless generated
"Reach floor N" (+5 each) chain. Rewards mostly gems, some chests/scrolls/keys.

---

## 6. Battle module — `DD.battle` (BATTLE author)

World: logical px, x right, y down. `DD.WORLD.GROUND` = feet line. Hero stands at `HERO_X`.
Enemies spawn off-screen right (`x = W + 10 + i*28`) and walk left; melee enemies stop at
`hero.x + 18 + w/2`; ranged stop at `hero.x + range`. Flying enemies hover ~28 px above ground.
When a wave is cleared the hero "runs" for ~1.0 s (`moving = true`, `scroll` advances 90 px/s) then
the next wave spawns.

```
init()                      // reads DD.state.s.campaign and starts the current floor/wave
update(dt)                  // fixed step (main calls it at 1/60 s, many times when sped up)
castSkill(slot) → boolean   // manual cast if ready and enemies present
tapAt(wx, wy) → boolean     // world coords; true if it collected the flying chest
challengeBoss()             // leave farming, jump to wave 5 of current floor
spawnFlyingChest() → boolean // extra (tests / debugging): send a flying chest across now
startDungeon(id) → boolean  // spends key via DD.state.useKey(); false if locked/no key/already in dungeon
leaveDungeon()              // forfeit; back to campaign wave 1
onStatsChanged()            // re-read hero stats (keep hp ratio); state calls this via bus 'stats:changed'
```
Read-only view fields (render/UI read these every frame; keep them on `DD.battle` directly):
```
mode: 'campaign'|'dungeon'
floor, wave, isBossWave, farming
bossTimer, bossTimeLimit          // seconds remaining / total during boss waves & dungeons (else 0)
dungeon: null | { id, level, timer, timeLimit, killed, target /*horde*/ }
hero: { x, y, hp, maxHp, shield, anim:'run'|'idle'|'attack'|'hurt'|'dead', animTime,
        attackAnim /*0..1 progress of the current swing*/, buffs:{ warcry:secs, blades:secs, shield:secs } }
enemies: [ { id, type, x, y, w, h, hp, maxHp, isBoss, flying, anim:'walk'|'idle'|'attack'|'hurt'|'dead',
             animTime, stun /*secs*/, frozen /*secs*/, flash /*secs*/, dead:boolean, deadTime } ]
projectiles: [ { id, kind, x, y, vx, vy } ]
allies: [ { id /*ally id*/, x, y, anim:'idle'|'attack', animTime } ]   // positioned behind the hero
flyingChest: null | { x, y, t, life }   // flies across the top third over ~8 s
moving: boolean, scroll: number
deadTimer                          // > 0 while waiting to revive
skillSlots: [ { id|null, cd /*remaining secs*/, cdTotal } x4 ]
```
Dead enemies stay in `enemies` with `dead:true` for 0.4 s (render fades them), then are removed.

Combat rules: hero attacks the nearest living enemy within reach (melee reach 46 px from hero.x)
every `1/atkSpeed` s (×1.2 speed during warcry, ×(1+0.30+0.03L) ATK). Damage = atk × (crit ?
critDmg : 1) × (boss ? 1 + bossDmg : 1). Combo chains extra hits (max 3). Stun chance stuns 1 s
(0.4 s on bosses). Lifesteal heals. Enemies attack when in range every `1/atkSpeed` s; dodge
negates; shield absorbs first; counter chance triggers an instant hero hit back. Regen per second.
Skills auto-cast when `settings.autoSkill` is on and a living enemy is on screen (x < W).
Flying chest spawns every 45–90 s of battle time (not while one is active).

Rewards: on enemy death call `DD.state.grantKill(...)`; on boss death `DD.state.onFloorCleared`
then start the next floor; in dungeons call `DD.state.grantDungeonWin(id)` on success.

---

## 7. Events — `DD.bus`
Emitted by **battle**:
```
'hit'            { target: 'hero'|'enemy', id?, x, y, amount, crit, miss, kind:'attack'|'skill'|'ally'|'counter'|'combo'|'enemy' }
'heal'           { x, y, amount }
'enemy:killed'   { id, type, x, y, isBoss, gold, xp, chest }
'enemy:attack'   { id, type, x, y, ranged }
'hero:attack'    { x, y, crit }
'hero:died'      {}
'hero:revived'   {}
'wave:start'     { floor, wave, isBoss, mode }
'floor:cleared'  { floor, rewards }
'boss:failed'    { reason: 'timeout'|'death' }
'skill:cast'     { id, slot, x, y, targets: [{x, y}] }
'ally:attack'    { id, x, y, tx, ty }
'projectile:hit' { kind, x, y }
'flyingChest:spawn' {} ; 'flyingChest:collected' { x, y, reward } ; 'flyingChest:escaped' {}
'dungeon:start'  { id, level } ; 'dungeon:won' { id, level, rewards } ; 'dungeon:failed' { id, level, reason }
```
Emitted by **state**:
```
'state:changed'  {}      // after any mutation; may fire many times per frame — listeners coalesce
'stats:changed'  {}      // hero stats changed (gear, level, mastery, skills/allies equip)
'chest:opened'   { item, decision }
'item:equipped'  { item, old } ; 'item:sold' { item, gold }
'levelup'        { level }
'quest:ready'    { quest } ; 'quest:claimed' { quest }
'purchase'       { kind: 'skill'|'ally'|'mastery'|'chest', id }
'toast'          { text, kind: 'info'|'good'|'bad'|'rare' }   // anyone may emit
```
Emitted by **ui**: `'ui:click'` {} (audio plays a click), `'ui:open'` { panel }.

---

## 8. Sprites module — `DD.sprites` (SPRITES author)
All art is procedural pixel art generated at load (no image files). Pixel-art sprites are drawn at
1 logical px = 1 canvas px into offscreen canvases; render scales the whole scene.
```
init()                                    // builds caches; safe to call twice
anim(name, anim, t, look?) → HTMLCanvasElement   // frame chosen from t (seconds); never null (fallback sprite)
size(name) → { w, h }                     // logical size of that sprite
flashed(canvas) → HTMLCanvasElement       // white silhouette copy (cached), for hit flash
itemIcon(item) → dataURL                  // 48×48 PNG, pixelated, rarity-tinted frame-less icon by slot+era(+rarity glow)
skillIcon(id) → dataURL ; allyIcon(id) → dataURL ; dungeonIcon(id) → dataURL
currencyIcon('gold'|'gems'|'keys'|'scrolls'|'chest'|'premium'|'cp'|'xp') → dataURL   // 32×32
chestIcon(level) → dataURL                // 64×64 treasure chest, fancier as level rises
heroPortrait(look?) → dataURL             // 48×48
```
Names for `anim`: `hero` (anims `idle, run, attack, hurt, dead`; `look = { weaponEra, weaponRarity,
armorRarity }` optional — weapon drawn in hand by era, armor tinted by rarity), every enemy type in §3
(anims `walk, attack, hurt, idle, dead` — at least 2 walk frames), allies `wolf, fairy, drone_ally,
golem_ally` (`idle, attack`), `flying_chest` (`fly`, 2+ frames with flapping wings), projectiles
`proj_<kind>` (`fly`), effect sprites `fx_explosion` (`play`, ≥5 frames), `fx_slash` (`play`),
`fx_lightning` (`play`), `fx_frost` (`play`), `fx_meteor` (`fall`), `fx_blade` (`spin`), `coin`
(`spin`), `fx_heal` (`play`). Unknown name/anim → a visible magenta placeholder, never a throw.

---

## 9. Render module — `DD.render` (RENDER author) and `DD.audio`
```
render.init(canvas)  // sizes canvas to its CSS box × devicePixelRatio, integer scale of WORLD (pixel-perfect
                     // when possible), listens to resize (ResizeObserver) and pointerdown → DD.battle.tapAt
render.draw(dtReal)  // full scene each frame from DD.battle view fields + its own VFX particles
audio.init()         // lazily creates AudioContext on first user gesture; respects DD.state.s.settings.sound
audio.play(name)     // 'hit','crit','kill','coin','chest','equip','sell','rare','legendary','levelup',
                     // 'skill','boss','death','click','win','fail','flap'
```
Scene: parallax biome background (far wall, pillars/props, floor tiles with torches; 6 biomes look
distinct: crypt stone+green torches, fungal glowing mushrooms, forge lava cracks, clockwork pipes+gears,
neon grid lines, void stars). Entities via sprites; HP bars over enemies (boss bar across the top);
floating damage numbers (crits bigger/yellow, misses "MISS", heals green); hit flash; screen shake on
boss hits/meteor; skill VFX; coins arcing to the top-left on kills; flying chest with sparkle trail
and "TAP!" hint; dead overlay "Reviving…" with countdown; wave banner text ("Floor 7", "BOSS!").
Render never mutates battle/state except calling `DD.battle.tapAt`.

---

## 10. UI module — `DD.ui` (UI author)
```
ui.init(rootEl)       // builds the whole DOM inside #app, including <canvas id="battle-canvas">
ui.frame(dt)          // cheap per-frame updates (HP bar, timers, cooldown sweeps) + coalesced re-render
                      //   when a 'state:changed' arrived since last frame
ui.showOffline(sum)   // AFK rewards modal
ui.toast(text, kind)
```
Toasts drop in over the top HUD, never over the battle canvas (its top band holds the flying chest and
the boss bar). Battle moments the canvas already celebrates with a banner (level-up, floor cleared,
dungeon won/failed, boss escaped, flying-chest reward) are toasted only while a sheet or modal covers
the canvas.
Layout (portrait column, max-width 480 px, centered on desktop over a dark backdrop; height 100%):
1. **Top HUD**: hero portrait + level + XP bar, CP, currency pills (gold, gems, keys with regen timer, scrolls).
2. **Stage strip**: "Floor 12 · The Crypt", wave pips 1–5 (5 = skull), boss timer bar, "Challenge Boss" button while farming, dungeon status while in a dungeon (with "Leave").
3. **Battle canvas** (aspect 360:200, full column width) with the hero HP bar under it.
4. **Skill bar**: 4 skill buttons (icon, cooldown sweep, lock icon + unlock floor), AUTO toggle, speed ×1/×2/×3 toggle.
5. **Panel area** (scrolls internally) switched by the bottom tabs:
   * **Loot** (default): quest banner (claim button when done), big chest button with count +
     "Open" (tap anywhere on it), chest level badge → upgrade sheet (cost, odds table per rarity for current vs next level),
     Auto-open toggle and Auto-loot settings sheet (sell rarities checkboxes, auto-equip, stop at rarity),
     premium chest button when you have premium chests.
   * **Hero**: 8 equipment slots around the hero portrait (tap a slot → item detail), full stat sheet.
   * **Skills**: list of all skills (icon, rarity, level, description, unlock/upgrade cost, equip into slot).
   * **Allies**: same pattern for allies.
   * **Dungeons**: 4 dungeon cards (icon, level, reward, unlock floor, key cost, Enter button), keys + regen timer.
   * **Mastery**: 6 mastery rows with level, effect, gem cost, upgrade button. Settings button (sound,
     export/import save code, reset with in-page confirm, credits: "Fan-made tribute to Dungeon Rush by Lava Labs").
6. **Bottom tab bar** (Loot, Hero, Skills, Allies, Dungeons, Mastery) with badge dots when something is affordable/claimable.

**Chest modal** (opens when `chest:opened` has decision 'pending'): new item card (icon, rarity-colored
border/glow, name, rarity, ilvl, main stat, substats) vs currently equipped, per-stat diffs (green ▲ /
red ▼), CP delta, buttons **Sell (+gold)** and **Equip**. Legendary+ gets a celebratory reveal.

Visual identity: single dark dungeon theme (deliberately one theme; set `color-scheme: dark` and every
color explicitly). Fonts from Google Fonts: display **Pixelify Sans** (headings, numbers, buttons),
body **Chakra Petch**; fallbacks `ui-monospace, monospace` / `system-ui, sans-serif`. Colors as CSS
custom properties on `:root`. Mobile: `touch-action: manipulation` on interactive elements, no text
selection on game controls, no horizontal scroll at 360 px wide, safe-area insets respected, minimum
tap target 40 px. No `alert/confirm/prompt` (build in-page confirms). No emoji as UI icons — use
`DD.sprites.*Icon` data URLs (pixelated) or CSS shapes.
