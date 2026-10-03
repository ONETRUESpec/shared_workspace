# Once Human Build Planner

A static web app that calculates Once Human builds: weapons from 1★ to 6★ (and Epic 5★), calibration blueprints, armor sets with set bonuses and key armor, weapon and armor mods with sub-attributes, food and drink buffs (every result is shown with and without them), combat deviations by Skill Rating, Cradle Overrides and the target type. Numbers come from decoded official game tables where available and from cross-checked community data elsewhere; `research/SPEC.md` documents every formula and its confidence.

## Run it

No build step is required for the plain version:

```bash
cd once-human-build-planner
python3 -m http.server 8080      # then open http://localhost:8080/
```

`index.html` also works when opened directly from disk because the data is bundled into `js/data.js`.

For a website, deploy either the folder as-is or the single self-contained file `dist/index.html` (CSS, data and scripts inlined; about 1.3 MB).

## Update the data

1. Edit the JSON files in `data/` (schemas are described in `research/SPEC.md` §14).
2. Rebuild the bundle and the single-file version:

```bash
npm run build        # = node scripts/bundle-data.mjs && node scripts/build-single.mjs
```

3. Run the tests:

```bash
npm test             # engine + adapter tests against data/test_vectors.json
node tests/ui.smoke.mjs   # headless Chromium smoke test with screenshots (needs playwright)
```

## Layout

| path | purpose |
|---|---|
| `index.html`, `css/style.css` | page shell and theme (light/dark) |
| `js/engine.js` | pure calculation engine (also used by the Node tests) |
| `js/data-adapter.js` | turns the research JSON into catalogues and a build into engine effects |
| `js/ui.js`, `js/ui-helpers.js` | the planner UI, build persistence (localStorage + shareable `#b=` link, JSON import/export) |
| `data/*.json` | game data (see SPEC §14) |
| `research/*.md`, `research/*.json` | research notes, per-facet summaries, verification verdicts, `SPEC.md`, `SOURCES.md` |
| `scripts/` | data bundler and single-file builder |
| `tests/` | Node test-runner tests and the Playwright smoke test |

## How accurate is it?

- Weapon card DMG per star reproduces 33 in-game screenshots exactly (official blueprint star table: ×1.00 / 1.05 / 1.10 / 1.15 / 1.20 / 1.25 for Legendary; Epic caps at 5★ with ×1.223).
- Armor HP/Psi per star and tier match the post-2.3.1 cards (Legendary helmet 925 HP / 115 Psi at Tier V 6★).
- Status procs reproduce the community "113 test" and the published Power Surge example.
- Stacking rules (crit + weakspot additive, Attack % separate from Weapon DMG %, elemental on elemental bullets) follow the calculators that cite in-game observation; each is a toggle in "Formula options" so you can switch models.
- Known gaps: six 2026 weapons without stat sheets, mod sub-attribute values per level, deviation ultimates after the Dec-2025 overhaul, Fur additives, enemy armour/level mitigation and range falloff. See SPEC §13.

Research was done with a network policy that blocked the game wikis and official site, so most non-GitHub numbers were read from search snippets; `research/SOURCES.md` lists all 800+ URLs used.
