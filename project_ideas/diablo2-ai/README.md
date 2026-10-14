# Diablo II AI (d2ai)

Let Claude play Diablo II on your PC. **Offline single player only.**

## How it works

- d2ai freezes the game while the AI thinks, so the AI never has to react fast.
- Each turn, the AI looks at a screenshot and sends a few clicks or key presses. The game unfreezes, runs them for a second or two, takes a new screenshot and freezes again.
- After a one-time setup, it drinks healing potions by itself when your life gets low.

It works with the original Diablo II / Lord of Destruction and with Diablo II: Resurrected in offline mode, on Windows.

## What you need

- A Windows PC with Diablo II, played in a window (not fullscreen), with an offline or single-player character.
- Python 3.10 or newer. Claude can install it for you.
- Claude running **on that PC**: the Claude Desktop app, or `claude remote-control` started in a terminal in this folder (it then shows up in the Claude Code app). A Claude session that runs in the cloud can't reach your PC.
- For autopilot mode only: a Claude API key (see below).

## Getting started

1. Put this folder on your PC: download the repository from GitHub as a ZIP, or ask Claude on your PC to clone it.
2. Start a Claude session on your PC in this folder.
3. Start Diablo II in a window, load an offline character and stand in town.
4. Tell Claude: "Read CLAUDE.md, set up d2ai and start playing."

Claude installs what's needed, checks that it can see the game, tests the pause with you, and starts playing. You can watch the game and chat with Claude while it plays.

## Two ways to play

**With Claude in your chat (no API key).** Claude plays turn by turn in your Claude session. It's slower, but you can talk to it ("go to the Den of Evil", "pick up that sword"). It uses your normal Claude plan.

**Autopilot (API key).** The script talks to Claude directly and plays on its own:

```
python d2ai.py autopilot --goal "Complete the Den of Evil quest" --turns 100
```

It needs an API key from console.anthropic.com in the `ANTHROPIC_API_KEY` environment variable, and every turn costs money. The model is set by `model` in config.json. Rough cost per turn at October 2026 prices (it depends mostly on how long Claude thinks):

| Model | Per turn | Per 100 turns |
|---|---|---|
| `claude-opus-5-5` (default, the most capable) | about 3 cents | about $3 |
| `claude-sonnet-5-5` | about 1.5 cents | about $1.50 |
| `claude-haiku-5-5` | well under 1 cent | about $0.10 |

The script prints its running estimate while it plays and keeps a log in `run/autopilot-log.jsonl`.

## Taking over and stopping

- Move the mouse to the **top-left corner of your main screen** and leave it there. The AI stops before its next move (autopilot stops completely).
- Clicking another window while the AI is moving also stops that move. In autopilot, Ctrl+C in its window stops it too.
- `python d2ai.py resume` unfreezes the game if it was left frozen.

While the AI thinks, the game is frozen. Windows may add "(Not Responding)" to its title. That's expected: don't click the frozen game and don't close it. While the AI is playing, the game window comes to the front every turn, so don't type in other windows at the same time.

## Commands

| Command | What it does |
|---|---|
| `python d2ai.py check` | Finds the game window and saves a test screenshot to `run/check.jpg`. Add `--pause 5` to test pausing for 5 seconds. |
| `python d2ai.py look` | Takes a screenshot and pauses the game. |
| `python d2ai.py act click:640,300 wait:0.5` | Unpauses, runs the actions, takes a screenshot, pauses again. The actions are listed in GAME_GUIDE.md. |
| `python d2ai.py resume` | Unpauses the game. `--force` also unfreezes a game d2ai lost track of. |
| `python d2ai.py calibrate` | Helps set `life_globe` for automatic healing potions. |
| `python d2ai.py autopilot --goal "..." --turns 50` | Lets Claude play by itself through the Claude API. |

## Settings (config.json)

| Setting | Default | What it does |
|---|---|---|
| `window_title` | `"Diablo II"` | Text in the game window's title. |
| `process_names` | `Game.exe`, `Diablo II.exe`, `D2SE.exe`, `D2R.exe` | Programs that count as the game. |
| `pause_method` | `"suspend"` | `"suspend"` freezes the game's process. `"esc"` opens the in-game menu, which pauses single player; open panels get closed every turn. `"none"` never pauses. |
| `image_width` | `1280` | Screenshots for the AI are scaled down to this width. |
| `grid`, `grid_step` | `true`, `100` | Draws labelled grid lines on screenshots to help the AI aim. |
| `settle_seconds` | `0.3` | Game time after the last action, before the screenshot. |
| `max_actions`, `max_turn_seconds` | `10`, `4.0` | Limits for one turn. |
| `keep_screenshots` | `300` | How many screenshots to keep in `run/shots`. |
| `life_globe` | `null` | Where the life globe is, for automatic potions. Set it with `calibrate`. |
| `potion_below`, `potion_keys` | `0.45`, `["1", "2"]` | Drink when life is below 45%, using belt keys 1 and 2 in turn. |
| `model`, `effort` | `"claude-opus-5-5"`, `"medium"` | Autopilot model and how hard it thinks (`low`, `medium`, `high`). |
| `use_fallbacks` | `true` | Autopilot: if a safety check declines a turn, the API retries it on another model. |
| `history_turns` | `8` | Autopilot: how many past turns Claude sees as text. |

## Troubleshooting

- **"No Diablo II window found":** start the game in a window first. `python d2ai.py check` lists windows with "Diablo" in the title. If the game runs under another program name, add it to `process_names`.
- **The screenshot is black:** switch the game to windowed mode. Fullscreen games often can't be captured.
- **Clicks or keys do nothing:** if Diablo II runs as administrator, Windows blocks input from normal programs. Run the terminal (or Claude) as administrator too, or turn off "Run as administrator" for the game.
- **Buzzing sound while paused, or monsters jump ahead after a pause:** set `pause_method` to `"esc"`.
- **The game stays frozen:** run `python d2ai.py resume`, or `python d2ai.py resume --force`.

## Rules

Only use this offline, on your own copy of the game. Bots break Blizzard's rules for Battle.net and can get your account banned. d2ai never logs in to anything.

## Files

| File | What it is |
|---|---|
| `d2ai.py` | The main script. |
| `winio.py` | Windows details: finding the window, mouse and keyboard input. |
| `GAME_GUIDE.md` | What the AI is told: how turns work, the actions, Diablo II tips. |
| `CLAUDE.md` | Setup and play instructions for Claude. |
| `config.json` | Settings. |
| `tests/` | Tests that run without the game: `python -m pytest tests`. |
| `run/` | Screenshots, state and logs, created while playing. |
