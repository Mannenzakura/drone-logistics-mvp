import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from model import DEFAULT, simulate


class AirportTests(unittest.TestCase):
    def test_default_respects_resource_limits(self):
        result = simulate(DEFAULT)
        self.assertEqual(result["metrics"]["completed"], len(DEFAULT["flights"]))
        for row in result["timeline"]:
            self.assertLessEqual(row["airspace_used"], DEFAULT["airspace_per_min"])
            self.assertLessEqual(row["pads_used"], DEFAULT["pads"])
            self.assertLessEqual(row["outside_used"], DEFAULT["outside_bays"])
            self.assertLessEqual(row["cargo_teams_used"], DEFAULT["cargo_teams"])

    def test_one_flight_baseline(self):
        p = {**DEFAULT, "flights": [{"id": "X", "arrival": 0, "mode": "land", "unload_kg": 5,
                                    "load_kg": 5, "deadline": 10, "fee_yuan_kg": 4}]}
        f = simulate(p)["flights"][0]
        self.assertEqual((f["enter"], f["service_start"], f["service_end"], f["exit"]), (0, 0, 2, 2))
        self.assertEqual(f["air_wait_min"], 0)
        self.assertEqual(f["late_min"], 0)

    def test_outside_airspace_switch(self):
        flights = [{"id": "A", "arrival": 0, "mode": "land", "unload_kg": 0, "load_kg": 0,
                    "deadline": 10, "fee_yuan_kg": 0},
                   {"id": "B", "arrival": 0, "mode": "outside", "unload_kg": 0, "load_kg": 0,
                    "deadline": 10, "fee_yuan_kg": 0}]
        p = {**DEFAULT, "flights": flights, "cargo_teams": 2}
        independent = simulate(p)["flights"]
        shared = simulate({**p, "outside_uses_shared_airspace": True})["flights"]
        self.assertEqual(independent[1]["enter"], 0)
        self.assertGreater(shared[1]["enter"], 0)

    def test_timeline_contains_discrete_events(self):
        result = simulate(DEFAULT)
        self.assertTrue(result["timeline"])
        self.assertTrue(all("events" in row for row in result["timeline"]))
        texts = [e["text"] for row in result["timeline"] for e in row["events"]]
        self.assertTrue(any("开始货运处理" in text for text in texts))

    def test_invalid_input(self):
        with self.assertRaises(ValueError):
            simulate({**DEFAULT, "cargo_rate_kg_min": 0})


if __name__ == "__main__":
    unittest.main()


