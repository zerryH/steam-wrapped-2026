# Steam Wrapped 2026

A minimal, public, GitHub Pages year-in-gaming recap built with React + Vite. It detects every game returned by Steam's owned-games API and can enrich the most-played games with whatever achievements/player stats their developers expose through Steam.

## What's included

- Responsive, minimal editorial-style Wrapped page.
- Automatic full-library discovery via Steam Web API.
- Lifetime playtime and two-week playtime from Steam.
- Optional per-game achievement and player-stat scan.
- Local playtime snapshots so the site never mislabels lifetime hours as 2026 hours.
- Import/export of the public Wrapped JSON.
- GitHub Actions deployment to GitHub Pages.

## 1. Configure the collector

Requirements: Python 3.10+ and a Steam Web API key.

1. Create a personal key at <https://steamcommunity.com/dev/apikey>.
2. Set your Steam **Game details** privacy to Public: <https://steamcommunity.com/my/edit/settings>.
3. Copy `.env.example` to `.env`.
4. Fill in `STEAM_API_KEY` and `STEAM_ID`. Use your 17-digit SteamID64 or your vanity profile name.

PowerShell:

```powershell
Copy-Item .env.example .env
notepad .env
python scripts/collect.py --deep-limit 30
```

macOS / Linux:

```bash
cp .env.example .env
nano .env
python3 scripts/collect.py --deep-limit 30
```

`--deep-limit 30` scans the top 30 games for achievements and game-defined player stats. All detected games are still included in the library, even when deep scan is disabled or unsupported. Set `--deep-limit 0` to skip those extra API calls.

## 2. Publish your personal Wrapped

The collector writes `public/data/wrapped.json`. Review it before publishing: the site is public, so this JSON exposes your Steam profile name, profile URL, game library, and playtime. Your API key and local tracking history are not included.

```bash
git add public/data/wrapped.json
git commit -m "Publish my Steam Wrapped data"
git push
```

GitHub Actions builds the site and deploys it to Pages. The local `private/playtime-history.json` file is deliberately ignored by Git; keep it on your own computer and back it up if you want continuity in yearly tracking.

## 3. Run locally

```bash
npm install
npm run dev
```

Build check:

```bash
npm run build
```

## 4. How yearly playtime works

Steam's owned-games endpoint exposes **lifetime** minutes and a rolling two-week value, not an exact calendar-year playtime history. This project stores a private baseline on the first collector run and compares later lifetime readings against it. For that reason, a first run made during 2026 starts tracking from that date; it cannot reconstruct earlier months unless you already have an earlier local snapshot. The site labels the coverage start date and only claims full-year coverage if the baseline was captured on January 1.

## 5. Game-specific stats

Steam's `GetUserStatsForGame` and `GetPlayerAchievements` responses are game-defined and frequently unavailable. The collector therefore records only values Steam actually returns. It does not pretend all games have a universal kills/deaths/assists schema. Rich match-level integrations (for example, competitive CS2 trackers or War Thunder tracker data) are future adapter modules and are not part of this first Steam-only implementation.

## API references

- [Steam IPlayerService / GetOwnedGames](https://partner.steamgames.com/doc/webapi/iplayerservice)
- [Steam ISteamUser / GetPlayerSummaries](https://partner.steamgames.com/doc/webapi/ISteamUser)
- [Steam ISteamUserStats](https://partner.steamgames.com/doc/webapi/ISteamUserStats)

## Privacy and security

- Never commit `.env` or your Steam Web API key.
- Never commit `private/playtime-history.json` unless you explicitly choose to back it up in a private location.
- The repository and Pages site are public. Only publish `public/data/wrapped.json` after reviewing its contents.
- This project is a static site; it does not send your Steam key to the browser.
