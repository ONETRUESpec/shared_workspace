# Shared Workspace

## Once Human Build-Planer

Statischer Build-Rechner für Once Human im Ordner [`planner/`](planner/README.md):
Waffen (Tier I bis V) und Rüstung mit 1 bis 6 Sternen, Set-Boni, Mods, Kalibrierung, Essen-Buffs (mit/ohne), Deviants, Cradle Overrides.

```bash
cd planner && python3 -m http.server 8000   # http://localhost:8000
node --test planner/tests/calc.test.mjs     # Tests des Rechenkerns
python3 tools/build_planner_data.py         # Spieldaten neu erzeugen
```
