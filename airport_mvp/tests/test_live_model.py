import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from live_model import AirportSimulation
from model import DEFAULT


class LiveSimulationTests(unittest.TestCase):
    def test_each_step_commits_only_one_minute(self):
        sim = AirportSimulation(DEFAULT)
        first = sim.step()
        self.assertEqual(first["minute"], 0)
        self.assertEqual(len(first["timeline"]), 1)
        self.assertIsNone(next(f for f in first["flights"] if f["id"] == "F002")["enter"])
        second = sim.step()
        self.assertEqual(second["minute"], 1)
        self.assertEqual(len(second["timeline"]), 2)
        self.assertEqual(len(first["timeline"]), 1)

    def test_fault_changes_future_without_rewriting_past(self):
        p = {**DEFAULT, "pads": 1, "flights": [
            {"id": "A", "arrival": 0, "mode": "land", "unload_kg": 5, "load_kg": 5,
             "deadline": 20, "fee_yuan_kg": 4},
            {"id": "B", "arrival": 1, "mode": "land", "unload_kg": 5, "load_kg": 5,
             "deadline": 20, "fee_yuan_kg": 4},
        ]}
        sim = AirportSimulation(p)
        past = sim.step()["timeline"][0]
        sim.action("pad_fault")
        for _ in range(4):
            sim.step()
        mid = sim.snapshot()
        self.assertEqual(mid["timeline"][0], past)
        self.assertIsNone(next(f for f in mid["flights"] if f["id"] == "B")["enter"])
        sim.action("pad_restore")
        after = sim.step()
        self.assertEqual(next(f for f in after["flights"] if f["id"] == "B")["enter"], 5)
        self.assertEqual(after["timeline"][0], past)

    def test_staff_added_after_arrival_starts_waiting_job_next_step(self):
        p = {**DEFAULT, "cargo_teams": 1, "flights": [
            {"id": "A", "arrival": 0, "mode": "land", "unload_kg": 20, "load_kg": 0,
             "deadline": 20, "fee_yuan_kg": 4},
            {"id": "B", "arrival": 0, "mode": "outside", "unload_kg": 5, "load_kg": 0,
             "deadline": 20, "fee_yuan_kg": 4},
        ]}
        sim = AirportSimulation(p)
        sim.step()
        self.assertIsNone(next(f for f in sim.snapshot()["flights"] if f["id"] == "B")["service_start"])
        sim.action("team_add")
        next_state = sim.step()
        self.assertEqual(next(f for f in next_state["flights"] if f["id"] == "B")["service_start"], 1)

    def test_full_day_night_truck_conserves_aircraft_and_charges_trips(self):
        sim = AirportSimulation(DEFAULT)
        for _ in range(1366):
            state = sim.step(compact=True)
        self.assertEqual(state["minute"], 1365)
        self.assertEqual(state["night"]["airport_aircraft"], 1)
        self.assertEqual(state["night"]["in_transit"], 0)
        self.assertEqual(state["night"]["destination_aircraft"], 3)
        self.assertEqual(len(state["night"]["trips"]), 2)
        self.assertEqual(state["metrics"]["truck_cost_yuan"], 60)
        self.assertEqual(sum(trip["aircraft"] for trip in state["night"]["trips"]), 3)
        while not sim.done:
            state = sim.step(compact=True)
        self.assertEqual(state["minute"], 1440)
        self.assertEqual(state["night"]["destination_aircraft"], 3)
        self.assertEqual(state["metrics"]["operating_cost_yuan"], 480)
        self.assertEqual(state["metrics"]["maintenance_cost_yuan"], 144)
        self.assertEqual(state["metrics"]["repair_cost_yuan"],
                         sum(event["repair_cost_yuan"] for event in state["incidents"]))

    def test_disabled_night_truck_does_not_move_aircraft(self):
        sim = AirportSimulation({**DEFAULT, "night_truck_enabled": False})
        for _ in range(1441):
            state = sim.step(compact=True)
        self.assertEqual(state["night"]["airport_aircraft"], 4)
        self.assertEqual(state["night"]["destination_aircraft"], 0)
        self.assertEqual(state["metrics"]["truck_cost_yuan"], 0)

    def test_idle_airport_accrues_fixed_cost_without_flights(self):
        future = {"id": "LATE", "arrival": 2000, "mode": "land", "unload_kg": 5,
                  "load_kg": 5, "deadline": 2010, "fee_yuan_kg": 4}
        sim = AirportSimulation({**DEFAULT, "horizon_min": 60, "flights": [future]})
        first = sim.step()
        self.assertEqual(first["metrics"]["operating_cost_yuan"], 0)
        for _ in range(60):
            state = sim.step(compact=True)
        self.assertEqual(state["metrics"]["completed"], 0)
        self.assertEqual(state["metrics"]["operating_cost_yuan"], 12)
        self.assertEqual(state["metrics"]["maintenance_cost_yuan"], 6)
        self.assertEqual(state["metrics"]["net_yuan"], -18)

    def test_cargo_is_counted_as_processed_not_as_whole_active_load(self):
        flight = {"id": "A", "arrival": 0, "mode": "land", "unload_kg": 12,
                  "load_kg": 8, "deadline": 30, "fee_yuan_kg": 4}
        sim = AirportSimulation({**DEFAULT, "flights": [flight]})
        first = sim.step()
        self.assertEqual(first["timeline"][-1]["cargo_processed_kg"], 0)
        self.assertEqual(first["metrics"]["cargo_pending_kg"], 20)
        second = sim.step()
        self.assertEqual(second["timeline"][-1]["cargo_processed_kg"], 5)
        self.assertEqual(second["metrics"]["cargo_handled_kg"], 5)
        self.assertEqual(second["metrics"]["cargo_unloaded_kg"], 5)
        self.assertEqual(second["metrics"]["cargo_pending_kg"], 15)
        for _ in range(3):
            state = sim.step()
        self.assertEqual(state["metrics"]["cargo_handled_kg"], 20)
        self.assertEqual(state["metrics"]["cargo_unloaded_kg"], 12)
        self.assertEqual(state["metrics"]["cargo_loaded_kg"], 8)

    def test_seeded_incident_changes_capacity_and_recovers(self):
        params = {**DEFAULT, "random_seed": 20260927, "incident_probability_hour": 1}
        first = AirportSimulation(params)
        second = AirportSimulation(params)
        for _ in range(61):
            a = first.step(compact=True)
            b = second.step(compact=True)
        self.assertEqual(a["incidents"], b["incidents"])
        self.assertEqual(len(a["incidents"]), 1)
        incident = a["incidents"][0]
        self.assertEqual(incident["start_min"], 60)
        self.assertEqual(a["params"][incident["resource"]],
                         DEFAULT[incident["resource"]] - 1)
        while first.minute < incident["end_min"]:
            recovered = first.step(compact=True)
        self.assertEqual(recovered["incidents"][0]["status"], "recovered")
        self.assertEqual(recovered["params"][incident["resource"]],
                         DEFAULT[incident["resource"]])
        self.assertEqual(recovered["metrics"]["repair_cost_yuan"],
                         incident["repair_cost_yuan"])
        disabled = AirportSimulation({**params, "random_events_enabled": False})
        for _ in range(121):
            state = disabled.step(compact=True)
        self.assertEqual(state["incidents"], [])

    def test_fixed_cost_changes_at_day_boundary_and_can_be_zero(self):
        sim = AirportSimulation({**DEFAULT, "flights": [{"id": "LATE", "arrival": 2000,
            "mode": "land", "unload_kg": 0, "load_kg": 0, "deadline": 2100,
            "fee_yuan_kg": 0}]})
        for _ in range(361):
            state = sim.step(compact=True)
        self.assertEqual(state["metrics"]["operating_cost_yuan"], 72)
        state = sim.step(compact=True)
        self.assertEqual(state["metrics"]["operating_cost_yuan"], 72.4)
        zero = AirportSimulation({**DEFAULT, "day_fixed_yuan_hour": 0,
                                  "night_fixed_yuan_hour": 0})
        for _ in range(61):
            state = zero.step(compact=True)
        self.assertEqual(state["metrics"]["operating_cost_yuan"], 0)
        self.assertEqual(state["metrics"]["maintenance_cost_yuan"], 6)


if __name__ == "__main__":
    unittest.main()
