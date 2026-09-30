"""A small, deterministic airport resource simulation (all times in minutes)."""

from math import isfinite


def example_flights(count=116, average_unload_kg=12, average_load_kg=10):
    """Deterministic demonstration day; hourly weights are assumptions, not observations."""
    weights = [1] * 6 + [10] * 4 + [5] * 6 + [8] * 4 + [2] * 4
    base = sum(weights)
    hourly = [count * weight // base for weight in weights]
    remaining = count - sum(hourly)
    fractions = sorted(range(24), key=lambda hour: (-(count * weights[hour] % base), hour))
    for hour in fractions[:remaining]:
        hourly[hour] += 1
    flights = []
    unload_offsets = (-4, -2, 0, 2, 4, 0)
    load_offsets = (-4, -2, 0, 2, 4)
    for hour, number in enumerate(hourly):
        for within_hour in range(number):
            index = len(flights)
            arrival = hour * 60 + (within_hour + 1) * 60 // (number + 1)
            flights.append({"id": f"F{index + 1:03d}", "arrival": arrival,
                            "mode": "outside" if (index + 1) % 4 == 0 else "land",
                            "unload_kg": max(0, average_unload_kg + unload_offsets[index % 6]),
                            "load_kg": max(0, average_load_kg + load_offsets[(index * 2) % 5]),
                            "deadline": arrival + 20, "fee_yuan_kg": 4})
    return flights


DEFAULT = {
    "airspace_per_min": 1,
    "pads": 2,
    "outside_bays": 1,
    "cargo_teams": 1,
    "cargo_rate_kg_min": 5,
    "outside_uses_shared_airspace": False,
    "hold_kwh_min": 0.045,
    "outside_kwh_min": 0.045,
    "electricity_yuan_kwh": 1,
    "handling_yuan_kg": 0.4,
    "delay_yuan_min": 2,
    "day_fixed_yuan_hour": 24,
    "night_fixed_yuan_hour": 12,
    "maintenance_yuan_hour": 6,
    "pad_repair_yuan": 80,
    "horizon_min": 1440,
    "random_events_enabled": True,
    "random_seed": 20260927,
    "incident_probability_hour": 0.35,
    "night_truck_enabled": True,
    "night_depart_min": 1320,
    "night_aircraft_at_airport": 4,
    "night_target_transfer": 3,
    "night_trucks": 2,
    "night_truck_capacity": 2,
    "night_trip_min": 45,
    "night_turnaround_min": 20,
    "night_truck_cost_yuan": 30,
    "flights": example_flights(),
}


def _number(v, label, minimum=0, strict=False):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not isfinite(v):
        raise ValueError(f"{label}必须是有限数字")
    if v < minimum or (strict and v == minimum):
        raise ValueError(f"{label}必须{'大于' if strict else '不小于'}{minimum}")
    return v


def validate(raw):
    if not isinstance(raw, dict):
        raise ValueError("参数必须是对象")
    p = {**DEFAULT, **raw}
    if not isinstance(p["random_events_enabled"], bool):
        raise ValueError("随机事件开关必须为布尔值")
    seed = _number(p["random_seed"], "随机种子")
    if int(seed) != seed or seed > 4294967295:
        raise ValueError("随机种子须为0至4294967295的整数")
    p["random_seed"] = int(seed)
    probability = _number(p["incident_probability_hour"], "每小时事件概率")
    if probability > 1:
        raise ValueError("每小时事件概率须为0至1")
    for key in ("airspace_per_min", "pads", "outside_bays", "cargo_teams", "horizon_min"):
        value = _number(p[key], key, strict=True)
        if int(value) != value:
            raise ValueError(f"{key}必须是整数")
        p[key] = int(value)
    for key in ("night_depart_min", "night_aircraft_at_airport", "night_target_transfer", "night_trucks", "night_truck_capacity", "night_trip_min", "night_turnaround_min"):
        value = _number(p[key], key, strict=key in ("night_truck_capacity", "night_trip_min"))
        if int(value) != value:
            raise ValueError(f"{key}必须是整数")
        p[key] = int(value)
    _number(p["night_truck_cost_yuan"], "night_truck_cost_yuan")
    if not isinstance(p["night_truck_enabled"], bool):
        raise ValueError("night_truck_enabled必须是布尔值")
    if p["night_target_transfer"] > p["night_aircraft_at_airport"]:
        raise ValueError("夜间调拨目标不能超过机场可调拨飞机数")
    if p["night_target_transfer"] and p["night_trucks"] < 1 and p["night_truck_enabled"]:
        raise ValueError("启用夜间调拨时至少需要一辆卡车")
    for key in ("cargo_rate_kg_min",):
        _number(p[key], key, strict=True)
    for key in ("hold_kwh_min", "outside_kwh_min", "electricity_yuan_kwh", "handling_yuan_kg", "delay_yuan_min", "day_fixed_yuan_hour", "night_fixed_yuan_hour", "maintenance_yuan_hour", "pad_repair_yuan"):
        _number(p[key], key)
    if not isinstance(p["outside_uses_shared_airspace"], bool):
        raise ValueError("outside_uses_shared_airspace必须是布尔值")
    flights = p["flights"]
    if not isinstance(flights, list) or not flights or len(flights) > 200:
        raise ValueError("flights必须包含1至200架飞机")
    ids = set()
    for f in flights:
        if not isinstance(f, dict) or not isinstance(f.get("id"), str) or not f["id"].strip():
            raise ValueError("每架飞机都要有非空ID")
        if f["id"] in ids:
            raise ValueError(f"重复的飞机ID：{f['id']}")
        ids.add(f["id"])
        if f.get("mode") not in ("land", "outside"):
            raise ValueError(f"{f['id']}的模式必须是land或outside")
        for key in ("arrival", "deadline"):
            value = _number(f.get(key), f"{f['id']}.{key}")
            if int(value) != value:
                raise ValueError(f"{f['id']}.{key}必须是整数分钟")
        for key in ("unload_kg", "load_kg", "fee_yuan_kg"):
            _number(f.get(key), f"{f['id']}.{key}")
    return p


def simulate(raw):
    """Run the same 24-hour state model as the interactive API."""
    from live_model import AirportSimulation

    sim = AirportSimulation(raw)
    while not sim.done:
        sim.step(compact=True)
    return sim.snapshot()
