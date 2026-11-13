# Steam Wrapped 2026

A minimal, public GitHub Pages gaming-year recap. It combines Steam library/achievement data with locally reconstructed Steam sessions to build an actual **January–current-month 2026** timeline.

## What is different in the final version

- **Historical session reconstruction:** reads the local Steam `controller_ui`, `compat_log`, and `gameprocess_log` files, including rotated/previous files, and pairs app start/exit timestamps.
- **Achievement chronology:** reads each achievement's Steam `unlocktime` timestamp and plots unlocks in the month they happened.
- **Honest precision:** exact session hours are reported only from paired local log entries. Achievement events show activity, but are not converted into fake playtime.
- **Whole Steam library:** lists every game Steam returns, with lifetime hours, recent two-week hours, 2026 log-derived hours, sessions, achievements and whatever current player stats Steam exposes.
- **2026 story:** monthly activity, active days, session count, average and longest session, busiest month, busiest weekday, first/last tracked session, most active games.
- **Optional ThunderSkill link:** set your public nickname to open a 2026 date-comparison page. ThunderSkill only has historical snapshots where its tracker captured them.
- Public JSON import/export, responsive design, and automatic GitHub Pages deployment.

## 1. Set up the Steam collector (Windows)

Requirements: Python 3.10+ and a Steam Web API key.

1. Create your API key at <https://steamcommunity.com/dev/apikey>.
2. Set Steam **Game details** privacy to Public: <https://steamcommunity.com/my/edit/settings>.
3. Clone this repository and open its folder:

```powershell
git clone https://github.com/zerryH/steam-wrapped-2026.git
cd steam-wrapped-2026
```

4. Create `.env`:

```powershell
Copy-Item .env.example .env
notepad .env
```

5. Fill in `STEAM_API_KEY`, `STEAM_ID` (17-digit SteamID64 or vanity name), and optionally `THUNDERSKILL_NICKNAME`.
6. Run:

```powershell
python scripts/collect.py
```

The script auto-detects common Steam log locations. To point it at a custom installation:

```powershell
python scripts/collect.py --log-dir "D:\Steam\logs"
```

The script reads all available matching files:
- `controller_ui*.txt` / `controller_ui*.log`
- `compat_log*.txt` / `compat_log*.log`
- `gameprocess_log*.txt` / `gameprocess_log*.log`

The highest-priority app lifecycle log is preferred; compatibility/process logs are fallbacks to avoid counting the same play session more than once.

## 2. Publish your personal 2026 data

The collector writes `public/data/wrapped.json`. Inspect it before publication: the public page includes your Steam display name/profile URL, library, lifetime playtime and 2026 statistics.

```powershell
git add public/data/wrapped.json
git commit -m "Publish my 2026 Steam Wrapped"
git push
```

GitHub Actions builds and deploys the site automatically.

## 3. Run locally

```powershell
npm install
npm run dev
```

Build check:

```powershell
npm run build
```

## 4. What can and cannot be reconstructed

Steam's `GetOwnedGames` exposes cumulative lifetime playtime and a rolling two-week number; it does not provide a retroactive calendar-year timeline. That is why the project reads local client session logs for timestamped playtime and uses Steam achievement unlock timestamps for a separate event timeline.

- A paired local start/exit event gives measured session duration.
- An achievement unlock timestamp is an exact dated event, not evidence of a specific number of hours.
- Steam logs can rotate, be deleted on reinstall, or cover only one device. Missing data creates gaps; the dashboard does not extrapolate or fill gaps with invented hours.
- If there are no usable session logs, the 2026 playtime tile says it is unavailable while the achievement timeline still shows verifiable progress.
- Steam player stats are game-defined. Kills/deaths or other values appear only if a game actually exposes those counters.
- ThunderSkill comparisons depend on its archived profile snapshots. The website links to the exact 2026 date range but cannot manufacture tracker snapshots that do not exist.

## 5. Configuration

`.env.example` supports:
- `STEAM_API_KEY`
- `STEAM_ID`
- `WRAPPED_YEAR` (defaults to 2026)
- `DEEP_STATS_LIMIT` (default -1; scan all games for Steam-native player counters. Set 0 to disable or a positive number to limit to the top N.)
- `ACHIEVEMENT_SCAN_LIMIT` (default -1; scans every detected game. Set a positive number to limit the scan.)
- `STEAM_LOG_DIR` (optional custom Steam logs folder)
- `THUNDERSKILL_NICKNAME` (optional public tracker profile)

## Privacy

- Never commit `.env`, API keys or local log files.
- Your local Steam logs are read on your computer and are not copied into the public dataset. The exported JSON contains daily/monthly aggregates, never raw session start/end times or full local file paths.
- The repository and Pages site are public. Review `public/data/wrapped.json` before pushing it.
- Do not publish raw Steam logs; they can contain device/account activity beyond what the Wrapped needs.
