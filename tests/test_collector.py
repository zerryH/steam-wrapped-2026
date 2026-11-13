import importlib.util
import unittest
from datetime import datetime, timedelta
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "collect.py"
spec = importlib.util.spec_from_file_location("steam_wrapped_collector", MODULE_PATH)
collector = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(collector)


class SteamLogParsingTests(unittest.TestCase):
    def test_timestamp_parses_steam_log_format(self):
        parsed = collector.parse_timestamp("[2026-04-07 22:13:05] Starting app 730")
        self.assertEqual(parsed, datetime(2026, 4, 7, 22, 13, 5))

    def test_timestamp_parses_milliseconds(self):
        parsed = collector.parse_timestamp("[2026-04-07 22:13:05.123] Starting app 730")
        self.assertEqual(parsed, datetime(2026, 4, 7, 22, 13, 5, 123000))

    def test_pairs_start_and_exit_by_app_id(self):
        events = [
            (datetime(2026, 4, 7, 18), "start", 730),
            (datetime(2026, 4, 7, 20, 30), "end", 730),
        ]
        sessions = collector.pair_events(events, "controller_ui")
        self.assertEqual(len(sessions), 1)
        self.assertEqual(sessions[0]["seconds"], 9000)
        self.assertEqual(sessions[0]["appId"], 730)

    def test_ignores_unpaired_and_implausible_sessions(self):
        events = [
            (datetime(2026, 1, 1, 10), "start", 730),
            (datetime(2026, 1, 3, 12), "end", 730),
            (datetime(2026, 1, 4, 10), "end", 440),
        ]
        self.assertEqual(collector.pair_events(events, "controller_ui"), [])

    def test_splits_overnight_session_across_months(self):
        sessions = [{
            "appId": 730,
            "start": datetime(2026, 1, 31, 23),
            "end": datetime(2026, 2, 1, 1),
            "seconds": 7200,
            "source": "controller_ui",
        }]
        result = collector.split_sessions_by_day(sessions, 2026)
        self.assertEqual(result["totalSessions"], 1)
        self.assertAlmostEqual(result["totalHours"], 2.0)
        by_month = {item["month"]: item["hours"] for item in result["monthly"]}
        self.assertAlmostEqual(by_month[1], 1.0)
        self.assertAlmostEqual(by_month[2], 1.0)
        self.assertEqual(sum(by_month.values()), 2.0)

    def test_activity_day_totals_are_conserved(self):
        start = datetime(2026, 5, 2, 21)
        sessions = [{
            "appId": 236390,
            "start": start,
            "end": start + timedelta(hours=3, minutes=30),
            "seconds": 12600,
            "source": "controller_ui",
        }]
        result = collector.split_sessions_by_day(sessions, 2026)
        self.assertEqual(result["totalSessions"], 1)
        self.assertAlmostEqual(sum(item["minutes"] for item in result["daily"]), 210.0)
        self.assertAlmostEqual(sum(item["hours"] for item in result["monthly"]), 3.5)


if __name__ == "__main__":
    unittest.main()
