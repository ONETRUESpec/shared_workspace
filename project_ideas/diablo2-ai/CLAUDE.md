# d2ai: notes for Claude

This folder lets Claude play Diablo II on this Windows PC. `d2ai.py` takes screenshots of the game window and sends mouse and keyboard input to it, and freezes the game between turns. README.md has the overview. GAME_GUIDE.md has the action syntax and game tips: read it before the first turn.

## Ground rules

- Offline single player only. If you see a Battle.net login, an online lobby or anything about an account, stop and tell the person. Never log in to anything.
- `act` sends real clicks and key presses to the game window. Don't use it for anything else.
- If an `act` result has `stopped_early` because the window lost focus or the mouse went to the top-left corner, the person has taken over. Stop and ask them before you continue.
- When you stop playing for any reason, run `python d2ai.py resume` so the game isn't left frozen.
- Ask before starting `autopilot`: it uses the person's Claude API key and costs money.

## First-time setup

1. `python --version` should print 3.10 or newer. If Python is missing, ask the person before installing it (`winget install Python.Python.3.12`).
2. `python -m pip install -r requirements.txt`
3. Ask the person to start Diablo II in a window (not fullscreen), load an offline or single-player character, stand in town, and keep the whole game window visible.
4. Run `python d2ai.py check`, then open the saved screenshot (`run/check.jpg`) with Read. It should show the game and nothing else.
5. Pause test: ask the person to watch the game, run `python d2ai.py check --pause 5`, and ask whether everything froze and then carried on normally. If it didn't, set `"pause_method": "esc"` in config.json and test again.
6. Optional, for automatic healing potions: run `python d2ai.py calibrate`, open `run/calibrate.png`, and set `life_globe` in config.json as the command explains. Run calibrate again at full life: the reading should be close to 100%.

## Playing

1. Start with `python d2ai.py look`. It prints JSON with the path of the screenshot.
2. Open the screenshot with Read, decide what to do, then run for example `python d2ai.py act click:640,300 wait:0.5`. Coordinates are pixels in the screenshot (GAME_GUIDE.md explains the grid).
3. The output names the next screenshot. Open it and repeat. Check the `notes` field every turn: it reports automatic potions and actions that were shortened or dropped.
4. On longer sessions, keep a few lines in `run/notes.md`: the goal, quest progress, where things are.
5. Every few turns, tell the person in one short line what you're doing. They're probably watching the game.

If a command prints `{"error": ...}`, check whether it also says nothing was sent to the game. If so, fix the command and try again.

## Tests

`python -m pip install pytest` once, then `python -m pytest tests`. The tests don't need the game.
