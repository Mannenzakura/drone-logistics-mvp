"""Incremental airport simulation. A step commits exactly one minute of history."""

from copy import deepcopy
from math import ceil

from model import validate


ACTIVE = ("waiting_cargo", "processing", "ready")
NOTE = "固定运营费、持续维护费与停机位故障维修费均为演示假设；夜间卡车仅调拨预置备用飞机。收益仍未计巡航、起降和设施资本成本。"


def processed_kg(flight, minute, rate):
    if flight["service_start"] is None:
        return 0
    total = flight["unload_kg"] + flight["load_kg"]
    return min(total, max(0, minute - flight["service_start"]) * rate)


class AirportSimulation:
    def __init__(self, raw):
        self.params = validate(raw)
        self.jobs = [{**deepcopy(f), "state": "future", "enter": None,
                      "service_start": None, "service_end": None, "exit": None}
                     for f in self.params["flights"]]
        self.jobs.sort(key=lambda f: (f["arrival"], f["id"]))
        self.minute = -1
        self.timeline = []
        self.pending_events = []
        self.initial_capacity = {k: self.params[k] for k in
                                 ("pads", "outside_bays", "cargo_teams", "airspace_per_min")}
        self.night = {"airport_aircraft": self.params["night_aircraft_at_airport"],
                      "in_transit": 0, "destination_aircraft": 0, "trips": [],
                      "cost_yuan": 0.0}
        self.truck_ready = [self.params["night_depart_min"]] * self.params["night_trucks"]
        self.operating_cost_yuan = 0.0
        self.maintenance_cost_yuan = 0.0
        self.repair_cost_yuan = 0.0
        self.random_state = self.params["random_seed"]
        self.incidents = []
        self.active_incident = None

    def _random(self):
        self.random_state = (1664525 * self.random_state + 1013904223) % 4294967296
        return self.random_state / 4294967296

    def _step_incidents(self, t, events):
        if self.active_incident and t >= self.active_incident["end_min"]:
            incident = self.active_incident
            key = incident["resource"]
            self.params[key] = self.initial_capacity[key]
            incident["status"] = "recovered"
            events.append({"type": "incident_recovered", "flight": None,
                           "text": f"{incident['label']}解除，{key}恢复至 {self.params[key]}"})
            self.active_incident = None
        if not self.params["random_events_enabled"] or t < 60 or t % 60 or t >= self.params["horizon_min"] - 30:
            return
        chance, kind, duration = self._random(), self._random(), self._random()
        if self.active_incident or chance >= self.params["incident_probability_hour"]:
            return
        key = "pads" if kind < 0.5 and self.params["pads"] > 1 else "airspace_per_min"
        if self.params[key] <= 0:
            return
        label = "停机位临时故障" if key == "pads" else "临时空域关闭"
        incident = {"id": len(self.incidents) + 1, "kind": "pad_fault" if key == "pads" else "airspace_closure",
                    "label": label, "resource": key, "start_min": t,
                    "end_min": t + 10 + int(duration * 21), "status": "active",
                    "repair_cost_yuan": self.params["pad_repair_yuan"] if key == "pads" else 0}
        self.params[key] -= 1
        self.repair_cost_yuan += incident["repair_cost_yuan"]
        self.incidents.append(incident)
        self.active_incident = incident
        events.append({"type": "incident_started", "flight": None,
                       "text": f"{label}，{key}降至 {self.params[key]}，预计第 {incident['end_min']} 分钟恢复"})

    @property
    def done(self):
        return self.minute >= self.params["horizon_min"]

    def action(self, kind):
        if self.done:
            raise ValueError("仿真已结束，请重新开始")
        key, delta, label = {
            "pad_fault": ("pads", -1, "停机位故障，可用停机位"),
            "pad_restore": ("pads", 1, "停机位恢复，可用停机位"),
            "team_add": ("cargo_teams", 1, "增加货运团队，总团队数"),
            "airspace_reduce": ("airspace_per_min", -1, "收紧共享空域，每分钟动作容量"),
            "airspace_restore": ("airspace_per_min", 1, "恢复共享空域，每分钟动作容量"),
        }.get(kind, (None, None, None))
        if key is None:
            raise ValueError("未知调度操作")
        old = self.params[key]
        if delta > 0 and kind in ("pad_restore", "airspace_restore"):
            new = min(self.initial_capacity[key], old + delta)
        else:
            new = max(0, old + delta)
        if new == old:
            raise ValueError("资源容量已经达到该操作的边界")
        self.params[key] = new
        if kind == "pad_fault":
            self.repair_cost_yuan += self.params["pad_repair_yuan"]
        self.pending_events.append({"type": "action", "flight": None,
                                    "text": f"{label} {old} → {new}"})
        return self.snapshot()

    def step(self, compact=False):
        if self.done:
            return self.snapshot(compact=compact)
        self.minute += 1
        t = self.minute
        p = self.params
        if t > 0:
            hour = ((t - 1) % 1440) / 60
            rate = p["day_fixed_yuan_hour"] if 6 <= hour < 22 else p["night_fixed_yuan_hour"]
            self.operating_cost_yuan += rate / 60
            self.maintenance_cost_yuan += p["maintenance_yuan_hour"] / 60
        events = self.pending_events
        self.pending_events = []
        self._step_incidents(t, events)
        self._step_night_trucks(t, events)
        finished = []
        for f in self.jobs:
            if f["state"] == "processing" and f["service_end"] <= t:
                f["state"] = "ready"
                finished.append(f["id"])
                events.append({"type": "service_end", "flight": f["id"], "text": f"{f['id']} 完成货运处理"})
        air_left = p["airspace_per_min"]
        departed = []
        for f in self.jobs:
            if f["state"] != "ready":
                continue
            uses_air = f["mode"] == "land" or p["outside_uses_shared_airspace"]
            if uses_air and air_left == 0:
                continue
            if uses_air:
                air_left -= 1
            f["exit"] = t
            f["state"] = "done"
            departed.append(f["id"])
            events.append({"type": "depart", "flight": f["id"], "text": f"{f['id']} 离开机场"})
        entered = []
        for f in self.jobs:
            if f["state"] != "future" or f["arrival"] > t:
                continue
            mode = f["mode"]
            capacity = p["pads"] if mode == "land" else p["outside_bays"]
            occupied = sum(g["mode"] == mode and g["state"] in ACTIVE for g in self.jobs)
            uses_air = mode == "land" or p["outside_uses_shared_airspace"]
            if occupied >= capacity or (uses_air and air_left == 0):
                continue
            if uses_air:
                air_left -= 1
            f["enter"] = t
            f["state"] = "waiting_cargo"
            entered.append(f["id"])
            events.append({"type": "enter", "flight": f["id"], "text": f"{f['id']} 进入作业位"})
        free_teams = max(0, p["cargo_teams"] - sum(f["state"] == "processing" for f in self.jobs))
        started = []
        for f in self.jobs:
            if f["state"] != "waiting_cargo" or free_teams == 0:
                continue
            free_teams -= 1
            f["service_start"] = t
            f["service_end"] = t + max(1, ceil((f["unload_kg"] + f["load_kg"]) / p["cargo_rate_kg_min"]))
            f["state"] = "processing"
            started.append(f["id"])
            events.append({"type": "service", "flight": f["id"], "text": f"{f['id']} 开始货运处理"})
        for f in self.jobs:
            if f["state"] == "future" and f["arrival"] <= t:
                events.append({"type": "queue", "flight": f["id"], "text": f"{f['id']} 等待空域或作业位"})
            elif f["state"] == "waiting_cargo":
                events.append({"type": "cargo_queue", "flight": f["id"], "text": f"{f['id']} 等待货运团队"})
        handled = sum(processed_kg(f, t, p["cargo_rate_kg_min"]) for f in self.jobs)
        handled_previous = sum(processed_kg(f, t - 1, p["cargo_rate_kg_min"]) for f in self.jobs)
        arrived_cargo = sum(f["unload_kg"] + f["load_kg"] for f in self.jobs if f["arrival"] <= t)
        row = {"minute": t, "airspace_used": p["airspace_per_min"] - air_left,
               "pads_used": sum(f["mode"] == "land" and f["state"] in ACTIVE for f in self.jobs),
               "outside_used": sum(f["mode"] == "outside" and f["state"] in ACTIVE for f in self.jobs),
               "cargo_teams_used": sum(f["state"] == "processing" for f in self.jobs),
               "air_queue": sum(f["state"] == "future" and f["arrival"] <= t for f in self.jobs),
               "cargo_queue": sum(f["state"] == "waiting_cargo" for f in self.jobs),
               "cargo_processed_kg": round(handled - handled_previous, 2),
               "cargo_handled_kg": round(handled, 2),
               "cargo_pending_kg": round(arrived_cargo - handled, 2),
               "entered": entered, "started": started, "finished": finished,
               "departed": departed, "events": events,
               "capacity": {k: p[k] for k in self.initial_capacity}}
        self.timeline.append(row)
        return self.snapshot(compact=compact)

    def _step_night_trucks(self, t, events):
        p = self.params
        if not p["night_truck_enabled"]:
            return
        for trip in self.night["trips"]:
            if trip["state"] == "road" and trip["arrive"] <= t:
                trip["state"] = "delivered"
                self.night["in_transit"] -= trip["aircraft"]
                self.night["destination_aircraft"] += trip["aircraft"]
                events.append({"type": "truck_arrive", "flight": None,
                               "text": f"夜间卡车 {trip['truck'] + 1} 到达外部基地，交付 {trip['aircraft']} 架飞机"})
        if t < p["night_depart_min"]:
            return
        remaining = p["night_target_transfer"] - self.night["in_transit"] - self.night["destination_aircraft"]
        for truck, ready_at in enumerate(self.truck_ready):
            if remaining <= 0 or ready_at > t:
                continue
            load = min(p["night_truck_capacity"], remaining, self.night["airport_aircraft"])
            if load <= 0:
                break
            self.night["airport_aircraft"] -= load
            self.night["in_transit"] += load
            self.night["cost_yuan"] += p["night_truck_cost_yuan"]
            self.night["trips"].append({"truck": truck, "depart": t, "arrive": t + p["night_trip_min"],
                                        "aircraft": load, "state": "road"})
            self.truck_ready[truck] = t + 2 * p["night_trip_min"] + p["night_turnaround_min"]
            remaining -= load
            events.append({"type": "truck_depart", "flight": None,
                           "text": f"夜间卡车 {truck + 1} 装载 {load} 架备用飞机，发往外部基地"})

    def snapshot(self, compact=False):
        flights = []
        for f in self.jobs:
            row = {k: v for k, v in f.items() if k != "state"}
            row["state"] = f["state"]
            row["completed"] = f["exit"] is not None
            row["air_wait_min"] = None if f["enter"] is None else f["enter"] - f["arrival"]
            row["cargo_wait_min"] = None if f["service_start"] is None else f["service_start"] - f["enter"]
            row["late_min"] = None if f["exit"] is None else max(0, f["exit"] - f["deadline"])
            if row["completed"]:
                cargo = f["unload_kg"] + f["load_kg"]
                energy = row["air_wait_min"] * self.params["hold_kwh_min"]
                if f["mode"] == "outside":
                    energy += (f["exit"] - f["enter"]) * self.params["outside_kwh_min"]
                row["energy_kwh"] = round(energy, 4)
                row["net_yuan"] = round(cargo * (f["fee_yuan_kg"] - self.params["handling_yuan_kg"])
                                        - energy * self.params["electricity_yuan_kwh"]
                                        - row["late_min"] * self.params["delay_yuan_min"], 2)
            else:
                row["energy_kwh"] = row["net_yuan"] = None
            flights.append(row)
        completed = [f for f in flights if f["completed"]]
        rate = self.params["cargo_rate_kg_min"]
        handled = sum(processed_kg(f, self.minute, rate) for f in self.jobs)
        unloaded = sum(min(f["unload_kg"], processed_kg(f, self.minute, rate)) for f in self.jobs)
        arrived_cargo = sum(f["unload_kg"] + f["load_kg"] for f in self.jobs if f["arrival"] <= self.minute)
        metrics = {"completed": len(completed), "total": len(flights),
                   "cargo_planned_kg": round(sum(f["unload_kg"] + f["load_kg"] for f in self.jobs), 2),
                   "cargo_handled_kg": round(handled, 2),
                   "cargo_unloaded_kg": round(unloaded, 2),
                   "cargo_loaded_kg": round(handled - unloaded, 2),
                   "cargo_pending_kg": round(arrived_cargo - handled, 2),
                   "on_time": sum(f["late_min"] == 0 for f in completed),
                   "mean_air_wait_min": round(sum(f["air_wait_min"] for f in completed) / len(completed), 2) if completed else None,
                   "mean_cargo_wait_min": round(sum(f["cargo_wait_min"] for f in completed) / len(completed), 2) if completed else None,
                   "net_yuan": round(sum(f["net_yuan"] for f in completed) - self.night["cost_yuan"] - self.operating_cost_yuan - self.maintenance_cost_yuan - self.repair_cost_yuan, 2),
                   "operating_cost_yuan": round(self.operating_cost_yuan, 2),
                   "maintenance_cost_yuan": round(self.maintenance_cost_yuan, 2),
                   "repair_cost_yuan": round(self.repair_cost_yuan, 2),
                   "truck_cost_yuan": round(self.night["cost_yuan"], 2),
                   "relocated_aircraft": self.night["destination_aircraft"],
                   "unfinished": len(flights) - len(completed),
                   "last_exit_min": max((f["exit"] for f in completed), default=None)}
        return {"minute": self.minute, "done": self.done, "params": deepcopy(self.params),
                "metrics": metrics, "flights": flights,
                "timeline": deepcopy(self.timeline[-1:] if compact else self.timeline),
                "timeline_start": self.minute if compact else 0,
                "night": deepcopy(self.night),
                "incidents": deepcopy(self.incidents),
                "pending_events": deepcopy(self.pending_events), "note": NOTE}
