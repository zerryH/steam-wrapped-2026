#!/usr/bin/env python3
"""Build an honest 2026 Steam Wrapped from Steam API data and local client logs.

Exact session time is reconstructed from paired Steam start/exit events where
available. Achievement unlocks form a separate, timestamped activity timeline.
Steam's lifetime playtime is never mislabelled as 2026 playtime.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from collections import defaultdict, deque
from datetime import date, datetime, time as dt_time, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "data" / "wrapped.json"
API = "https://api.steampowered.com"
MONTHS = ["January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"]
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def api_get(path: str, params: dict[str, Any], timeout: int = 30) -> dict[str, Any]:
    url = f"{API}/{path}?{urlencode(params)}"
    request = Request(url, headers={"User-Agent": "SteamWrapped2026/2.0"})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=timeout) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if not isinstance(payload, dict):
                raise RuntimeError("Steam API returned an unexpected response.")
            return payload
        except HTTPError as exc:
            if exc.code in (429, 500, 502, 503, 504) and attempt < 2:
                time.sleep(2 ** attempt)
                continue
            detail = exc.read().decode("utf-8", errors="replace")[:240]
            raise RuntimeError(f"Steam API returned HTTP {exc.code}: {detail}") from exc
        except (URLError, TimeoutError) as exc:
            if attempt < 2:
                time.sleep(2 ** attempt)
                continue
            raise RuntimeError(f"Could not reach Steam API: {exc}") from exc
    raise RuntimeError("Steam API request failed after retries.")


def resolve_steam_id(value: str, key: str) -> str:
    value = value.strip()
    if re.fullmatch(r"\d{17}", value):
        return value
    vanity = value.rstrip("/").split("/")[-1]
    result = api_get("ISteamUser/ResolveVanityURL/v1/", {"key": key, "vanityurl": vanity})
    response = result.get("response", {})
    if response.get("success") != 1 or not response.get("steamid"):
        raise RuntimeError(f"Could not resolve '{value}' as a SteamID64. Use your 17-digit SteamID64 or profile vanity URL.")
    return str(response["steamid"])


def discover_log_dirs() -> list[Path]:
    explicit = os.getenv("STEAM_LOG_DIR", "").strip()
    candidates: list[Path] = []
    if explicit:
        candidates.append(Path(explicit).expanduser())

    steam_path = os.getenv("STEAM_PATH", "").strip()
    if steam_path:
        root = Path(steam_path).expanduser()
        candidates.extend([root / "logs", root / "Logs"])

    home = Path.home()
    candidates.extend([
        Path("C:/Program Files (x86)/Steam/logs"),
        Path("C:/Program Files/Steam/logs"),
        Path("C:/Steam/logs"),
        home / "AppData/Local/Steam/logs",
        home / ".steam/steam/logs",
        home / ".steam/root/logs",
        home / ".local/share/Steam/logs",
        home / "Library/Application Support/Steam/logs",
    ])

    # SteamPath is stored in the Windows registry; use it when available.
    if os.name == "nt":
        try:
            import winreg  # type: ignore
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam")
            value, _ = winreg.QueryValueEx(key, "SteamPath")
            candidates.insert(0, Path(value) / "logs")
        except Exception:
            pass

    unique: list[Path] = []
    seen: set[str] = set()
    for candidate in candidates:
        try:
            resolved = candidate.resolve()
            marker = str(resolved).casefold()
            if marker not in seen and resolved.is_dir():
                seen.add(marker)
                unique.append(resolved)
        except OSError:
            continue
    return unique


TIMESTAMP = re.compile(r"^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?)\]")
PATTERNS = {
    "controller_ui": (
        re.compile(r"\bStarting app\s+(\d+)\b", re.I),
        re.compile(r"\bExiting app\s+(\d+)\b", re.I),
    ),
    "compat_log": (
        re.compile(r"\bStartSession:\s*appID\s+(\d+)\b", re.I),
        re.compile(r"\brelease session\(s\) for appID\s+(\d+)\b", re.I),
    ),
    "gameprocess_log": (
        re.compile(r"\bGame\s+(\d+)\s+created process\b", re.I),
        re.compile(r"\bGame\s+(\d+)\s+exited\b", re.I),
    ),
}


def parse_timestamp(line: str) -> datetime | None:
    match = TIMESTAMP.search(line)
    if not match:
        return None
    raw = match.group(1)
    try:
        if "." in raw:
            return datetime.strptime(raw, "%Y-%m-%d %H:%M:%S.%f")
        return datetime.strptime(raw, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return None


def pair_events(events: list[tuple[datetime, str, int]], source: str) -> list[dict[str, Any]]:
    """Pair matching start/stop rows by AppID; discard unclosed and implausible sessions."""
    events.sort(key=lambda item: item[0])
    starts: dict[int, deque[datetime]] = defaultdict(deque)
    sessions: list[dict[str, Any]] = []
    for stamp, action, app_id in events:
        if action == "start":
            starts[app_id].append(stamp)
            continue
        if not starts[app_id]:
            continue
        start = starts[app_id].popleft()
        seconds = (stamp - start).total_seconds()
        if seconds <= 0 or seconds > 24 * 60 * 60:
            continue
        sessions.append({
            "appId": app_id,
            "start": start,
            "end": stamp,
            "seconds": int(round(seconds)),
            "source": source,
        })
    return sessions


def collect_local_sessions(year: int) -> tuple[list[dict[str, Any]], list[str]]:
    dirs = discover_log_dirs()
    files: list[Path] = []
    for folder in dirs:
        for prefix in ("controller_ui", "compat_log", "gameprocess_log"):
            # Steam rotates some client logs to *.previous.txt. Read every matching text log.
            files.extend(sorted(folder.glob(f"{prefix}*.txt")))
            files.extend(sorted(folder.glob(f"{prefix}*.log")))

    unique_files: list[Path] = []
    seen: set[str] = set()
    for path in files:
        marker = str(path.resolve()).casefold()
        if marker not in seen and path.is_file():
            seen.add(marker)
            unique_files.append(path)

    events_by_source: dict[str, list[tuple[datetime, str, int]]] = defaultdict(list)
    for path in unique_files:
        lower = path.name.casefold()
        source = next((name for name in PATTERNS if lower.startswith(name)), None)
        if not source:
            continue
        start_pattern, end_pattern = PATTERNS[source]
        try:
            for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
                stamp = parse_timestamp(line)
                if stamp is None:
                    continue
                start_match = start_pattern.search(line)
                end_match = end_pattern.search(line)
                if start_match:
                    events_by_source[source].append((stamp, "start", int(start_match.group(1))))
                elif end_match:
                    events_by_source[source].append((stamp, "end", int(end_match.group(1))))
        except OSError:
            continue

    # Prefer Steam's top-level app lifecycle log. Fall back to compatibility
    # sessions, then child-process records only when no better source has that app.
    paired: list[dict[str, Any]] = []
    by_priority = ["controller_ui", "compat_log", "gameprocess_log"]
    covered_app_ids: set[int] = set()
    year_start = datetime(year, 1, 1)
    today = date.today()
    year_end = datetime.combine(today + timedelta(days=1), dt_time.min) if today.year == year else datetime(year + 1, 1, 1)

    for source in by_priority:
        candidates = pair_events(events_by_source.get(source, []), source)
        candidates = [s for s in candidates if s["end"] > year_start and s["start"] < year_end]
        selected = [s for s in candidates if s["appId"] not in covered_app_ids]
        paired.extend(selected)
        covered_app_ids.update(s["appId"] for s in selected)

    file_names = [str(path) for path in unique_files]
    return paired, file_names


def split_sessions_by_day(sessions: list[dict[str, Any]], year: int) -> dict[str, Any]:
    today = date.today()
    range_start = datetime(year, 1, 1)
    range_end = datetime.combine(today + timedelta(days=1), dt_time.min) if today.year == year else datetime(year + 1, 1, 1)

    monthly = [{
        "month": index + 1,
        "name": MONTHS[index],
        "hours": 0.0,
        "sessions": 0,
        "achievements": 0,
        "activeDays": 0,
    } for index in range(12)]

    game_totals: dict[int, dict[str, Any]] = defaultdict(lambda: {
        "hours": 0.0, "sessions": 0, "longestSessionSeconds": 0, "activeDays": set(),
    })
    daily_seconds: dict[date, int] = defaultdict(int)
    weekday_seconds = [0] * 7
    counted_sessions: list[dict[str, Any]] = []
    for session in sessions:
        start = max(session["start"], range_start)
        end = min(session["end"], range_end)
        if end <= start:
            continue
        seconds = int((end - start).total_seconds())
        if seconds <= 0:
            continue
        app_id = int(session["appId"])
        month_idx = start.month - 1
        # Count a session in its start month and its whole duration across month bars.
        monthly[month_idx]["sessions"] += 1
        game_totals[app_id]["sessions"] += 1
        game_totals[app_id]["longestSessionSeconds"] = max(game_totals[app_id]["longestSessionSeconds"], seconds)
        counted_sessions.append({
            "appId": app_id,
            "start": start.astimezone().isoformat(timespec="seconds"),
            "end": end.astimezone().isoformat(timespec="seconds"),
            "seconds": seconds,
            "source": session["source"],
        })

        cursor = start
        while cursor < end:
            midnight = datetime.combine(cursor.date() + timedelta(days=1), dt_time.min)
            piece_end = min(end, midnight)
            piece_seconds = int((piece_end - cursor).total_seconds())
            if piece_seconds > 0:
                daily_seconds[cursor.date()] += piece_seconds
                weekday_seconds[cursor.weekday()] += piece_seconds
                game_totals[app_id]["activeDays"].add(cursor.date().isoformat())
                game_totals[app_id]["hours"] += piece_seconds / 3600
                monthly[cursor.month - 1]["hours"] += piece_seconds / 3600
            cursor = piece_end

    for item in monthly:
        item["hours"] = round(item["hours"], 2)
        item["activeDays"] = sum(1 for day, sec in daily_seconds.items() if day.month == item["month"] and sec > 0)

    day_list = [{"date": day.isoformat(), "minutes": round(seconds / 60, 1)} for day, seconds in sorted(daily_seconds.items())]
    total_seconds = sum(daily_seconds.values())
    ordered_weekdays = [{
        "day": WEEKDAYS[index],
        "hours": round(seconds / 3600, 2),
    } for index, seconds in enumerate(weekday_seconds)]
    best_weekday = max(ordered_weekdays, key=lambda item: item["hours"], default=None)
    longest = max((s["seconds"] for s in counted_sessions), default=0)
    earliest = min((s["start"] for s in counted_sessions), default=None)
    latest = max((s["end"] for s in counted_sessions), default=None)

    return {
        "monthly": monthly[:today.month] if today.year == year else monthly,
        "daily": day_list,
        "totalHours": round(total_seconds / 3600, 2),
        "totalSessions": len(counted_sessions),
        "activeDays": len(daily_seconds),
        "averageSessionMinutes": round((total_seconds / len(counted_sessions) / 60), 1) if counted_sessions else None,
        "longestSessionSeconds": longest,
        "weekdayHours": ordered_weekdays,
        "mostPlayedWeekday": best_weekday["day"] if best_weekday and best_weekday["hours"] > 0 else None,
        "firstSession": earliest,
        "lastSession": latest,
        "gameTotals": {
            str(app_id): {
                "hours": round(info["hours"], 2),
                "sessions": info["sessions"],
                "longestSessionSeconds": info["longestSessionSeconds"],
                "activeDays": len(info["activeDays"]),
            } for app_id, info in game_totals.items()
        },
        "sessions": counted_sessions,
    }


def fetch_achievements(game: dict[str, Any], steam_id: str, key: str, year: int) -> dict[str, Any]:
    app_id = int(game["appid"])
    try:
        payload = api_get("ISteamUserStats/GetPlayerAchievements/v1/", {
            "key": key, "steamid": steam_id, "appid": app_id, "l": "english",
        })
    except RuntimeError as exc:
        return {"available": False, "unlocked": 0, "total": 0, "percent": 0, "events": [], "error": str(exc)[:100]}

    player = payload.get("playerstats", {})
    items = player.get("achievements", []) if isinstance(player, dict) else []
    if not isinstance(items, list):
        items = []
    unlocked = [item for item in items if isinstance(item, dict) and int(item.get("achieved", 0) or 0) == 1]
    events = []
    for item in unlocked:
        unlocktime = int(item.get("unlocktime", 0) or 0)
        if unlocktime <= 0:
            continue
        try:
            unlocked_at = datetime.fromtimestamp(unlocktime).astimezone()
        except (OverflowError, OSError, ValueError):
            continue
        if unlocked_at.year == year:
            events.append({
                "appId": app_id,
                "gameName": str(game.get("name") or f"Steam app {app_id}"),
                "apiName": str(item.get("apiname") or "Achievement"),
                "displayName": str(item.get("apiname") or "Achievement").replace("_", " ").title(),
                "unlockTime": unlocktime,
                "date": unlocked_at.isoformat(timespec="seconds"),
            })
    total = len(items)
    return {
        "available": bool(items),
        "unlocked": len(unlocked),
        "total": total,
        "percent": round(len(unlocked) / total * 100) if total else 0,
        "events": events,
        "error": None,
    }


def achievement_display_names(app_id: int, key: str) -> dict[str, str]:
    try:
        payload = api_get("ISteamUserStats/GetSchemaForGame/v2/", {
            "key": key, "appid": app_id, "l": "english",
        })
        stats = payload.get("game", {}).get("availableGameStats", {})
        achievements = stats.get("achievements", []) if isinstance(stats, dict) else []
        return {
            str(item.get("name")): str(item.get("displayName") or item.get("name") or "")
            for item in achievements if isinstance(item, dict) and item.get("name")
        }
    except RuntimeError:
        return {}


def fetch_player_stats(app_id: int, steam_id: str, key: str) -> tuple[list[dict[str, Any]], bool]:
    try:
        payload = api_get("ISteamUserStats/GetUserStatsForGame/v2/", {
            "key": key, "steamid": steam_id, "appid": app_id,
        })
        player = payload.get("playerstats", {})
        stats = player.get("stats", []) if isinstance(player, dict) else []
        clean = []
        if isinstance(stats, list):
            for stat in stats:
                if not isinstance(stat, dict) or "name" not in stat:
                    continue
                value = stat.get("value")
                if isinstance(value, (int, float, str)):
                    name = str(stat["name"])
                    clean.append({
                        "name": name,
                        "displayName": name.replace("_", " ").title(),
                        "value": value,
                    })
        return clean[:120], bool(clean)
    except RuntimeError:
        return [], False


def main() -> int:
    load_dotenv(ROOT / ".env")
    parser = argparse.ArgumentParser(description="Generate a historical, year-to-date Steam Wrapped.")
    parser.add_argument("--year", type=int, default=int(os.getenv("WRAPPED_YEAR", "2026")))
    parser.add_argument("--deep-limit", type=int, default=int(os.getenv("DEEP_STATS_LIMIT", "40")),
                        help="Fetch Steam player stats for the top N lifetime games; 0 disables it.")
    parser.add_argument("--achievement-limit", type=int, default=int(os.getenv("ACHIEVEMENT_SCAN_LIMIT", "200")),
                        help="Scan unlock-time history for the top N lifetime games; -1 scans all games.")
    parser.add_argument("--log-dir", default=os.getenv("STEAM_LOG_DIR", ""),
                        help="Optional Steam logs directory; normally auto-detected.")
    parser.add_argument("--thunderskill", default=os.getenv("THUNDERSKILL_NICKNAME", ""),
                        help="Optional public ThunderSkill nickname, used to add a tracker link.")
    args = parser.parse_args()

    key = os.getenv("STEAM_API_KEY", "").strip()
    steam_input = os.getenv("STEAM_ID", "").strip()
    if not key or not steam_input or "put_your_" in key:
        print("Setup required: copy .env.example to .env and add STEAM_API_KEY and STEAM_ID.", file=sys.stderr)
        return 2
    if args.log_dir:
        os.environ["STEAM_LOG_DIR"] = args.log_dir

    if args.year != date.today().year:
        print("Note: your Wrapped year differs from the current calendar year; logs and achievements are filtered to the requested year.")

    try:
        steam_id = resolve_steam_id(steam_input, key)
        now = datetime.now().astimezone()
        year = args.year
        print(f"Reading Steam profile {steam_id}…")

        summary_payload = api_get("ISteamUser/GetPlayerSummaries/v2/", {"key": key, "steamids": steam_id})
        players = summary_payload.get("response", {}).get("players", [])
        if not players:
            raise RuntimeError("Steam could not return this profile. Check the SteamID and profile visibility.")
        player = players[0]

        owned_payload = api_get("IPlayerService/GetOwnedGames/v1/", {
            "key": key, "steamid": steam_id, "include_appinfo": 1,
            "include_played_free_games": 1, "include_free_sub": 1,
        })
        raw_games = owned_payload.get("response", {}).get("games", [])
        if not isinstance(raw_games, list):
            raise RuntimeError("Steam did not return a game list. Set Steam Game Details to Public.")
        raw_games = sorted(raw_games, key=lambda g: int(g.get("playtime_forever", 0) or 0), reverse=True)

        local_sessions, log_files = collect_local_sessions(year)
        activity = split_sessions_by_day(local_sessions, year)
        current_month = now.month if now.year == year else 12
        for item in activity["monthly"]:
            item["achievements"] = 0

        games: list[dict[str, Any]] = []
        all_achievement_events: list[dict[str, Any]] = []
        scanned_achievements = 0
        for index, raw in enumerate(raw_games):
            app_id = int(raw.get("appid", 0) or 0)
            name = str(raw.get("name") or f"Steam app {app_id}")
            icon_hash = str(raw.get("img_icon_url") or "")
            icon_url = f"https://media.steampowered.com/steamcommunity/public/images/apps/{app_id}/{icon_hash}.jpg" if icon_hash else ""
            totals = activity["gameTotals"].get(str(app_id), {})
            game: dict[str, Any] = {
                "appId": app_id,
                "name": name,
                "playtimeForeverHours": round(int(raw.get("playtime_forever", 0) or 0) / 60, 2),
                "playtime2WeeksHours": round(int(raw.get("playtime_2weeks", 0) or 0) / 60, 2),
                "yearHoursExact": totals.get("hours"),
                "yearSessions": totals.get("sessions", 0),
                "yearActiveDays": totals.get("activeDays", 0),
                "longestSessionSeconds": totals.get("longestSessionSeconds", 0),
                "iconUrl": icon_url,
                "achievements": None,
                "achievements2026": 0,
                "stats": [],
                "statsAvailable": False,
            }

            scan_achievements = args.achievement_limit == -1 or (
                args.achievement_limit > 0 and index < args.achievement_limit
            )
            if scan_achievements:
                print(f"Achievement history {index + 1}/{min(args.achievement_limit if args.achievement_limit > 0 else len(raw_games), len(raw_games))}: {name}")
                achievement_data = fetch_achievements(raw, steam_id, key, year)
                game["achievements"] = {
                    "unlocked": achievement_data["unlocked"],
                    "total": achievement_data["total"],
                    "percent": achievement_data["percent"],
                } if achievement_data["available"] else None
                events = achievement_data["events"]
                if events:
                    names = achievement_display_names(app_id, key)
                    for event in events:
                        event["displayName"] = names.get(event["apiName"], event["displayName"])
                    all_achievement_events.extend(events)
                    game["achievements2026"] = len(events)
                    for event in events:
                        month = datetime.fromtimestamp(event["unlockTime"]).month
                        if 1 <= month <= len(activity["monthly"]):
                            activity["monthly"][month - 1]["achievements"] += 1
                scanned_achievements += 1
                time.sleep(0.15)

            if args.deep_limit > 0 and index < args.deep_limit:
                stats, available = fetch_player_stats(app_id, steam_id, key)
                game["stats"] = stats
                game["statsAvailable"] = available
                time.sleep(0.15)

            games.append(game)

        all_achievement_events.sort(key=lambda item: item["unlockTime"])
        achievement_days = {
            datetime.fromtimestamp(event["unlockTime"]).date().isoformat()
            for event in all_achievement_events
        }
        session_days = {item["date"] for item in activity["daily"]}
        combined_active_days = session_days | achievement_days
        active_game_ids = {
            int(s["appId"]) for s in activity["sessions"]
        } | {int(event["appId"]) for event in all_achievement_events}

        # Determine a year leader only from timestamped local sessions.
        top_session_game = max(
            (game for game in games if game["yearHoursExact"] is not None),
            key=lambda g: g["yearHoursExact"],
            default=None,
        )
        busiest_month = max(activity["monthly"], key=lambda item: item["hours"], default=None)
        busiest_month = busiest_month["name"] if busiest_month and busiest_month["hours"] > 0 else None
        total_lifetime_minutes = sum(int(g.get("playtime_forever", 0) or 0) for g in raw_games)
        achievement_unlocked_total = sum((g.get("achievements") or {}).get("unlocked", 0) for g in games)
        achievement_total = sum((g.get("achievements") or {}).get("total", 0) for g in games)

        thunderskill_nickname = args.thunderskill.strip()
        thunderskill = None
        if thunderskill_nickname:
            thunderskill = {
                "nickname": thunderskill_nickname,
                "profileUrl": f"https://thunderskill.com/en/stat/{quote(thunderskill_nickname, safe='')}",
                "yearCompareUrl": f"https://thunderskill.com/en/stat/{quote(thunderskill_nickname, safe='')}?from={year}-01-01&to={now.date().isoformat()}",
            }

        output = {
            "schemaVersion": 2,
            "generatedAt": now.isoformat(timespec="seconds"),
            "year": year,
            "yearToDate": {
                "start": f"{year}-01-01",
                "end": now.date().isoformat() if now.year == year else f"{year}-12-31",
                "startMonth": 1,
                "endMonth": current_month,
                "label": f"January – {MONTHS[current_month - 1]}",
            },
            "source": "steam-api",
            "profile": {
                "steamId": steam_id,
                "name": str(player.get("personaname") or "Steam player"),
                "avatar": str(player.get("avatarfull") or player.get("avatarmedium") or ""),
                "url": str(player.get("profileurl") or f"https://steamcommunity.com/profiles/{steam_id}/"),
            },
            "summary": {
                "totalGames": len(games),
                "lifetimeHours": round(total_lifetime_minutes / 60, 2),
                "yearHoursExact": activity["totalHours"] if activity["totalSessions"] else None,
                "yearSessions": activity["totalSessions"],
                "yearActiveDays": len(combined_active_days),
                "sessionActiveDays": activity["activeDays"],
                "achievementActiveDays": len(achievement_days),
                "activeGames2026": len(active_game_ids),
                "achievementUnlocked2026": len(all_achievement_events),
                "achievementsScanned": achievement_unlocked_total,
                "achievementsAvailable": achievement_total,
                "averageSessionMinutes": activity["averageSessionMinutes"],
                "longestSessionSeconds": activity["longestSessionSeconds"] or None,
                "mostPlayedWeekday": activity["mostPlayedWeekday"],
                "busiestMonth": busiest_month,
                "topSessionGame": top_session_game["name"] if top_session_game else None,
            },
            "history": {
                "sessionLogsFound": bool(log_files),
                "sessionLogFiles": log_files,
                "sessionCount": activity["totalSessions"],
                "firstSession": activity["firstSession"],
                "lastSession": activity["lastSession"],
                "achievementGamesScanned": scanned_achievements,
                "achievementGamesTotal": len(games),
                "note": (
                    "Exact playtime is summed from paired local Steam app start/exit log entries. "
                    "A missing or rotated log can leave gaps; no annual hours are fabricated from lifetime counters."
                ),
            },
            "activity": {
                "monthly": activity["monthly"],
                "daily": activity["daily"],
                "weekdayHours": activity["weekdayHours"],
                "achievements": all_achievement_events,
                "sessions": activity["sessions"],
            },
            "topSessionGameAppId": top_session_game["appId"] if top_session_game else None,
            "thunderSkill": thunderskill,
            "games": games,
        }

        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"\\nFound {len(games)} Steam games.")
        print(f"Paired local Steam sessions in {year}: {activity['totalSessions']}")
        print(f"Measured session time: {activity['totalHours']:.2f} hours" if activity["totalSessions"] else "No complete local Steam sessions found; 2026 hours will be shown as unavailable.")
        print(f"2026 achievement unlocks found: {len(all_achievement_events)} across {scanned_achievements} scanned games.")
        if log_files:
            print(f"Read {len(log_files)} local Steam log files.")
        else:
            print("No Steam log files were found. Set STEAM_LOG_DIR or pass --log-dir.")
        print(f"Wrapped data written to: {OUTPUT}")
        print("Review public/data/wrapped.json before pushing it to the public repository.")
        return 0
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        print("Tip: Steam Game Details must be Public for owned games and player stats.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
