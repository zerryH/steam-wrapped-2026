#!/usr/bin/env python3
"""Collect public Steam profile/library data and build the Wrapped JSON.

The Steam API key stays in a local .env file. Only the generated wrapped.json
is intended for publication. The private history file stores playtime baselines
and must never be committed.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "data" / "wrapped.json"
HISTORY = ROOT / "private" / "playtime-history.json"
API = "https://api.steampowered.com"


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def api_get(path: str, params: dict[str, Any], timeout: int = 25) -> dict[str, Any]:
    url = f"{API}/{path}?{urlencode(params)}"
    request = Request(url, headers={"User-Agent": "SteamWrapped2026/1.0"})
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"Steam API returned HTTP {exc.code}: {detail}") from exc
    except (URLError, TimeoutError) as exc:
        raise RuntimeError(f"Could not reach Steam API: {exc}") from exc
    if not isinstance(payload, dict):
        raise RuntimeError("Steam API returned an unexpected response.")
    return payload


def resolve_steam_id(value: str, key: str) -> str:
    value = value.strip()
    if re.fullmatch(r"\d{17}", value):
        return value
    vanity = value.rstrip("/").split("/")[-1]
    result = api_get("ISteamUser/ResolveVanityURL/v1/", {"key": key, "vanityurl": vanity})
    response = result.get("response", {})
    if response.get("success") != 1 or not response.get("steamid"):
        raise RuntimeError(f"Could not resolve '{value}' as a SteamID64. Use your 17-digit SteamID64 instead.")
    return str(response["steamid"])


def load_history() -> dict[str, Any]:
    if not HISTORY.exists():
        return {"schemaVersion": 1, "years": {}}
    try:
        payload = json.loads(HISTORY.read_text(encoding="utf-8"))
        if isinstance(payload, dict) and isinstance(payload.get("years"), dict):
            return payload
    except (json.JSONDecodeError, OSError):
        pass
    return {"schemaVersion": 1, "years": {}}


def tracked_hours(games: list[dict[str, Any]], year: int, timestamp: str) -> tuple[float, str, bool]:
    history = load_history()
    years = history.setdefault("years", {})
    year_key = str(year)
    year_data = years.setdefault(year_key, {"firstObservedAt": timestamp, "baselineMinutes": {}, "lastSeenMinutes": {}})
    baseline = year_data.setdefault("baselineMinutes", {})
    last_seen = year_data.setdefault("lastSeenMinutes", {})
    total_minutes = 0
    for game in games:
        app_id = str(game["appid"])
        current = int(game.get("playtime_forever", 0) or 0)
        if app_id not in baseline:
            baseline[app_id] = current
        # Steam only gives cumulative minutes. The local baseline lets us
        # measure the increase from the first collection in this calendar year.
        delta = max(0, current - int(baseline[app_id]))
        game["_tracked_minutes"] = delta
        last_seen[app_id] = current
        total_minutes += delta
    year_data["lastCollectedAt"] = timestamp
    HISTORY.parent.mkdir(parents=True, exist_ok=True)
    HISTORY.write_text(json.dumps(history, indent=2), encoding="utf-8")
    start = str(year_data.get("firstObservedAt", timestamp))
    try:
        parsed = datetime.fromisoformat(start.replace("Z", "+00:00"))
        full_year = parsed.month == 1 and parsed.day == 1
    except ValueError:
        full_year = False
    return round(total_minutes / 60, 2), start, full_year


def fetch_game_details(game: dict[str, Any], steam_id: str, key: str) -> dict[str, Any]:
    app_id = int(game["appid"])
    result: dict[str, Any] = {"stats": [], "statsAvailable": False, "achievements": None}
    try:
        stats_payload = api_get("ISteamUserStats/GetUserStatsForGame/v2/", {"key": key, "steamid": steam_id, "appid": app_id})
        player_stats = stats_payload.get("playerstats", {})
        stats = player_stats.get("stats", []) if isinstance(player_stats, dict) else []
        if isinstance(stats, list):
            cleaned = []
            for stat in stats:
                if not isinstance(stat, dict) or "name" not in stat:
                    continue
                value = stat.get("value")
                if isinstance(value, (int, float, str)):
                    cleaned.append({"name": str(stat["name"]), "displayName": str(stat.get("name", "")).replace("_", " ").title(), "value": value})
            result["stats"] = cleaned[:100]
            result["statsAvailable"] = bool(cleaned)
        time.sleep(0.15)
    except RuntimeError as exc:
        # Many Steam games do not publish user-stat endpoints. This is normal.
        print(f"  - No player stats for {game.get('name', app_id)}: {str(exc)[:100]}")

    try:
        achievement_payload = api_get("ISteamUserStats/GetPlayerAchievements/v1/", {"key": key, "steamid": steam_id, "appid": app_id, "l": "english"})
        player = achievement_payload.get("playerstats", {})
        achievements = player.get("achievements", []) if isinstance(player, dict) else []
        if isinstance(achievements, list) and achievements:
            total = len(achievements)
            unlocked = sum(1 for item in achievements if isinstance(item, dict) and int(item.get("achieved", 0) or 0) == 1)
            result["achievements"] = {"unlocked": unlocked, "total": total, "percent": round((unlocked / total) * 100) if total else 0}
        time.sleep(0.15)
    except (RuntimeError, ValueError, TypeError) as exc:
        print(f"  - No achievement data for {game.get('name', app_id)}: {str(exc)[:100]}")
    return result


def main() -> int:
    load_dotenv(ROOT / ".env")
    parser = argparse.ArgumentParser(description="Collect your Steam library for Steam Wrapped 2026.")
    parser.add_argument("--year", type=int, default=int(os.getenv("WRAPPED_YEAR", "2026")))
    parser.add_argument("--deep-limit", type=int, default=int(os.getenv("DEEP_STATS_LIMIT", "30")), help="Fetch achievements and player stats for the top N games by lifetime playtime; 0 disables deep scan.")
    args = parser.parse_args()

    key = os.getenv("STEAM_API_KEY", "").strip()
    steam_input = os.getenv("STEAM_ID", "").strip()
    if not key or not steam_input or "put_your_" in key:
        print("Setup required: copy .env.example to .env and add STEAM_API_KEY and STEAM_ID.", file=sys.stderr)
        return 2

    try:
        steam_id = resolve_steam_id(steam_input, key)
        timestamp = datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")
        print(f"Resolving Steam profile {steam_id}…")
        summary_payload = api_get("ISteamUser/GetPlayerSummaries/v2/", {"key": key, "steamids": steam_id})
        players = summary_payload.get("response", {}).get("players", [])
        if not players:
            raise RuntimeError("Steam could not return this profile. Check the SteamID and profile visibility.")
        player = players[0]
        owned_payload = api_get("IPlayerService/GetOwnedGames/v1/", {"key": key, "steamid": steam_id, "include_appinfo": 1, "include_played_free_games": 1, "include_free_sub": 1})
        response = owned_payload.get("response", {})
        raw_games = response.get("games", [])
        if not isinstance(raw_games, list):
            raise RuntimeError("Steam did not return a game list. Set your Steam Game details to Public and try again.")
        raw_games = sorted(raw_games, key=lambda game: int(game.get("playtime_forever", 0) or 0), reverse=True)
        _, coverage_start, full_year = tracked_hours(raw_games, args.year, timestamp)
        games: list[dict[str, Any]] = []
        for index, raw in enumerate(raw_games):
            app_id = int(raw.get("appid", 0) or 0)
            name = str(raw.get("name") or f"Steam app {app_id}")
            icon_hash = str(raw.get("img_icon_url") or "")
            icon_url = f"https://media.steampowered.com/steamcommunity/public/images/apps/{app_id}/{icon_hash}.jpg" if icon_hash else ""
            game = {
                "appId": app_id,
                "name": name,
                "playtimeForeverHours": round(int(raw.get("playtime_forever", 0) or 0) / 60, 2),
                "playtime2WeeksHours": round(int(raw.get("playtime_2weeks", 0) or 0) / 60, 2),
                "trackedYearHours": round(int(raw.get("_tracked_minutes", 0) or 0) / 60, 2),
                "iconUrl": icon_url,
                "achievements": None,
                "stats": [],
                "statsAvailable": False,
            }
            if args.deep_limit > 0 and index < args.deep_limit:
                print(f"Scanning {index + 1}/{min(args.deep_limit, len(raw_games))}: {name}")
                game.update(fetch_game_details(raw, steam_id, key))
            games.append(game)

        lifetime_hours = round(sum(int(game.get("playtime_forever", 0) or 0) for game in raw_games) / 60, 2)
        achievement_unlocked = sum((game.get("achievements") or {}).get("unlocked", 0) for game in games)
        achievement_total = sum((game.get("achievements") or {}).get("total", 0) for game in games)
        tracked_total = round(sum(game["trackedYearHours"] for game in games), 2)
        output = {
            "schemaVersion": 1,
            "generatedAt": timestamp,
            "year": args.year,
            "source": "steam-api",
            "profile": {
                "steamId": steam_id,
                "name": str(player.get("personaname") or "Steam player"),
                "avatar": str(player.get("avatarfull") or player.get("avatarmedium") or ""),
                "url": str(player.get("profileurl") or f"https://steamcommunity.com/profiles/{steam_id}/"),
            },
            "summary": {
                "totalGames": len(games),
                "lifetimeHours": lifetime_hours,
                "trackedYearHours": tracked_total,
                "achievementUnlocked": achievement_unlocked,
                "achievementTotal": achievement_total,
            },
            "tracking": {
                "coverageStart": coverage_start,
                "coverageEnd": timestamp,
                "isFullYear": full_year,
                "note": "Yearly playtime is the difference in Steam lifetime minutes since the first local snapshot in this year.",
            },
            "games": games,
        }
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\nDone. Found {len(games)} games and {lifetime_hours:.1f} lifetime hours.")
        print(f"{args.year} tracked hours since {coverage_start}: {tracked_total:.1f} h")
        print(f"Public data written to: {OUTPUT}")
        print(f"Private playtime history stored at: {HISTORY}")
        print("Next: review public/data/wrapped.json, then commit it to GitHub to publish your stats.")
        return 0
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        print("Tip: Steam Game details must be Public for owned games and player stats.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
