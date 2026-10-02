# Dungeon Dash

A browser idle auto-battler RPG that recreates the gameplay loop of **Dungeon Rush** by Lava Labs.
Fan-made tribute, not affiliated with Lava Labs. All art and sound are generated in code, so the
game needs no image or audio files.

Your hero rushes through an endless dungeon and fights on their own. You open loot chests, keep
upgrades and sell the rest, spend gold to raise the chest level for better odds, and push deeper.
When you get stuck, you strengthen the hero and try the boss again.

## Play

- **Standalone:** open `dist/dungeon-dash.html` in any modern browser (double-click works, no server needed).
- **From source:** serve or open `src/index.html`; it loads the scripts one by one.

Progress saves to your browser's local storage every 15 seconds and when you leave the page.

### How it plays

| Feature | What it does |
|---|---|
| Endless dungeon | Every floor has 4 waves and a boss with a 30 s timer. Lose to the boss and you farm the floor until you're strong enough. **Challenge Boss** retries it, and auto-boss retries after every loop. |
| Loot chests | Kills drop chests. Each one holds a piece of gear in one of 8 slots and 7 rarities (Common → Celestial). Gear runs through six eras, from Medieval to Cosmic. Compare it with what you wear, then **Equip** or **Sell**. |
| Chest level | Spend gold to upgrade the chest (up to level 20) for better rarity odds. |
| Auto-open and auto-loot | Opens chests on its own, sells chosen rarities, equips upgrades, and stops on a big drop. |
| Flying chest | A winged chest crosses the screen now and then. Tap it for gems, chests, gold, scrolls or a key. |
| Skills | Skill Scrolls unlock and upgrade 8 active skills: Fire Bomb, Spinning Blades, Battle Cry, Healing Light, Chain Lightning, Arcane Shield, Frost Nova and Meteor Strike. Skills auto-cast, or you can tap them. |
| Allies | Dire Wolf, Pixie, Battle Drone and Ember Golem fight beside you. |
| Boss Dungeons | Each run costs a key. Dragon's Lair, Zombie Horde, Golem Vault and Mothership pay out Skill Scrolls, gems, premium chests and gold. |
| Mastery | Gems buy permanent bonuses to ATK, HP, gold, chest drop chance, crit damage and AFK cap. |
| AFK rewards | Come back to the gold, chests and XP your hero earned while you were away. |

Keyboard (desktop): `C` opens a chest, `1`–`4` cast skills, `Esc` closes sheets, and ←/→ move between tabs.

## Project layout

```
CONTRACT.md      architecture, module APIs, shared IDs, design and balance targets
build.mjs        inlines src/ into dist/dungeon-dash.html (standalone) and dist/artifact.html (fragment)
src/index.html   page shell; script load order
src/style.css    UI styles (single dark theme)
src/js/
  core.js        DD namespace, event bus, number formatting, helpers
  data.js        content tables + pure formulas (all tuning knobs in BALANCE)
  state.js       save state, economy actions, quests, AFK rewards, persistence
  battle.js      combat simulation (runs headless in Node too)
  sprites.js     procedural pixel art and icons
  render.js      canvas scene, parallax biomes, VFX, damage numbers
  audio.js       WebAudio sound effects
  ui.js          DOM UI: HUD, panels, chest compare modal, sheets, toasts
  main.js        boot, fixed-step game loop, AFK detection
tests/           Node + Playwright tests and the balance simulator
```

Each module is a plain script that attaches to a global `DD` object. There's no bundler and no
runtime dependency.

## Develop and test

```sh
node build.mjs                 # rebuild dist/
node tests/econ.test.mjs       # data + state unit tests
node tests/battle.sim.mjs      # headless battle simulation checks
node tests/sim.mjs             # balance simulator: idle / casual / active players over 120 min
node tests/smoke.mjs           # Playwright end-to-end playthrough at phone and desktop sizes
```

`tests/sim.mjs --set=enemy.hpGrowth=1.16` tries balance values without editing `data.js`.
