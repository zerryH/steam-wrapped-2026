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

## 1. Get your Steam data (Windows — no Python)

The collector runs in the Windows PowerShell already included with Windows. You do not need to install Python, pip, or any modules.

1. Set **Game details** to Public in Steam privacy settings: <https://steamcommunity.com/my/edit/settings>.
2. Create a Steam Web API key: <https://steamcommunity.com/dev/apikey>.
3. Press **Win + R**, paste the command shown in the website's **Setup** menu, and press Enter. It downloads and runs the PowerShell collector.
4. Paste your Steam API key into the PowerShell window. The collector detects the currently logged-in Steam account when possible; otherwise it asks for your SteamID64 or profile URL.

It reads Steam's local session logs and scans your Steam library, achievement timestamps, and available player counters. The API key is used only by the local script; it is not written into the JSON export.

The file is saved to:

Downloads\SteamWrapped2026\wrapped.json

The script opens that folder and the Wrapped site when complete. On the site, press **Import** and select wrapped.json.

You can also download the standalone [PowerShell collector](https://raw.githubusercontent.com/zerryH/steam-wrapped-2026/main/scripts/collect.ps1) directly.

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

The Windows PowerShell collector uses defaults and does not require a .env file. It detects the Steam installation and logged-in account automatically when possible. The legacy Python collector remains available for developers who already use Python; normal Windows setup does not need it.

## Privacy

- Never commit `.env`, API keys or local log files.
- Your local Steam logs are read on your computer and are not copied into the public dataset. The exported JSON contains daily/monthly aggregates, never raw session start/end times or full local file paths.
- The repository and Pages site are public. Review `public/data/wrapped.json` before pushing it.
- Do not publish raw Steam logs; they can contain device/account activity beyond what the Wrapped needs.

