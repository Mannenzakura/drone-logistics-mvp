"""Illustrative, uncalibrated single-aircraft model. See model.md.
Exact enumeration of both binary branches and all 2-D LP vertices.
No external dependencies; all numerical model inputs use rational arithmetic.
"""
from fractions import Fraction as R
from itertools import combinations
from pathlib import Path
import csv
import json
import platform
import time

BASE = {k: R(str(v)) for k, v in {
    # Reference-paper data; not an energy or retrofit certificate.
    'reference_payload': 20, 'reference_range': 70, 'speed': 108,
    # ALL following values are illustrative assumptions.
    'distance_ac': 30, 'distance_cb': 40, 'equipment_mass': 2,
    'q': 10, 'Q': 18, 'B': 5, 'D': 5, 'L': 5,
    'W': 6, 'H': 6, 'a': 1,
    't0': 2, 'td': '.4', 'tl': '.6',
    'e0': '.1', 'ed': '.04', 'el': '.08', 'G': '.65',
    'bd': 4, 'bl': 3, 'F': 5,
}.items()}


def boundaries(p, z):
    """Every tuple is label, a, b, c for a*d + b*l <= c."""
    rows = [
        ('d_nonnegative', R(-1), R(0), R(0)),
        ('l_nonnegative', R(0), R(-1), R(0)),
        ('drop_demand', R(1), R(0), p['D']*z),
        ('pickup_demand', R(0), R(1), p['L']*z),
        ('drop_bay', R(1), R(0), p['B']*z),
        ('pickup_bay', R(0), R(1), p['B']*z),
        ('payload_ac', R(1), R(0), p['Q']-p['q']),
        ('payload_cb', R(0), R(1), p['Q']-p['q']),
        ('connection_time', p['td'], p['tl'], p['W']-p['t0']*z),
        ('energy', p['ed'], p['el'], p['G']-p['e0']*z),
    ]
    if p.get('shared_airspace', 1):
        rows.append(('airspace_window', p['td'], p['tl'], p['H']-p['t0']*z))
    return rows


def independent_check(p, d, l, z):
    """Business constraints written separately from boundary construction."""
    assert z in (0, 1)
    if p.get('shared_airspace', 1):
        assert z <= p['a']
    assert 0 <= d <= p['D']*z and 0 <= l <= p['L']*z
    assert d <= p['B']*z and l <= p['B']*z
    assert p['q'] + d <= p['Q'] and p['q'] + l <= p['Q']
    duration = p['t0']*z + p['td']*d + p['tl']*l
    energy = p['e0']*z + p['ed']*d + p['el']*l
    assert duration <= p['W']
    if p.get('shared_airspace', 1):
        assert duration <= p['H']
    assert energy <= p['G']
    return {'duration_min': duration, 'incremental_energy_kwh': energy,
            'payload_ac_kg': p['q']+d, 'payload_cb_kg': p['q']+l,
            'connection_slack_min': p['W']-duration,
            'airspace_slack_min': p['H']-duration if p.get('shared_airspace', 1) else None,
            'energy_slack_kwh': p['G']-energy}


def solve(p):
    nonnegative = ('q', 'Q', 'B', 'D', 'L', 'W', 'H', 't0', 'td',
                   'tl', 'e0', 'ed', 'el', 'G', 'F')
    if any(p[k] < 0 for k in nonnegative) or p['a'] not in (0, 1) or p.get('shared_airspace', 1) not in (0, 1):
        raise ValueError('Invalid parameter domain')
    if p['q'] > p['Q']:
        return {'status': 'baseline_infeasible'}
    best = None
    branch_counts = {}
    for z in (0, 1):
        if p.get('shared_airspace', 1) and z > p['a']:
            branch_counts[str(z)] = 0
            continue
        rows = boundaries(p, z)
        vertices = set()
        for (_, a, b, c), (_, u, v, w) in combinations(rows, 2):
            det = a*v-b*u
            if det == 0:
                continue
            d, l = (c*v-b*w)/det, (a*w-c*u)/det
            if all(x*d+y*l <= cap for _, x, y, cap in rows):
                vertices.add((d, l))
        branch_counts[str(z)] = len(vertices)
        for d, l in sorted(vertices):
            value = p['bd']*d+p['bl']*l-p['F']*z
            # Stable tie break: no operation, then less total added freight.
            key = (value, -z, -(d+l), -d)
            if best is None or key > best[0]:
                best = (key, d, l, z, value)
    if best is None:
        return {'status': 'infeasible'}
    _, d, l, z, value = best
    return {'status': 'globally_optimal_exact', 'd_kg': d, 'l_kg': l,
            'z': z, 'incremental_profit': value,
            'verification': independent_check(p, d, l, z),
            'feasible_vertices_by_branch': branch_counts,
            'absolute_optimality_gap': R(0)}


def altered(**kwargs):
    return dict(BASE, **{k: R(str(v)) for k, v in kwargs.items()})


def checks():
    results = []
    cases = [
        ('main_hand_proof', BASE, (R(5), R(10, 3), R(25))),
        ('no_airspace_permission', altered(a=0), (R(0), R(0), R(0))),
        ('window_too_short', altered(W=1), (R(0), R(0), R(0))),
        ('no_extra_energy', altered(G=0), (R(0), R(0), R(0))),
        ('no_demand', altered(D=0, L=0), (R(0), R(0), R(0))),
        ('no_spare_payload', altered(Q=10), (R(0), R(0), R(0))),
        ('loss_making', altered(bd=-1, bl=-2), (R(0), R(0), R(0))),
        ('fixed_cost_tie_choose_noop', altered(F=30), (R(0), R(0), R(0))),
        ('drop_only', altered(L=0), (R(5), R(0), R(15))),
        ('pickup_only', altered(D=0), (R(0), R(5), R(10))),
        ('longer_window_energy_binds', altered(W=8, H=8),
         (R(5), R(35, 8), R(225, 8))),
    ]
    for name, p, expected in cases:
        s = solve(p)
        actual = (s['d_kg'], s['l_kg'], s['incremental_profit'])
        assert actual == expected, (name, actual, expected)
        results.append({'name': name, 'passed': True})
    assert solve(altered(Q=9))['status'] == 'baseline_infeasible'
    results.append({'name': 'baseline_overweight', 'passed': True})
    return results


def serialize(obj):
    if isinstance(obj, R):
        return {'exact': str(obj), 'decimal': float(obj)}
    raise TypeError(type(obj).__name__)


def main():
    started = time.perf_counter()
    solution = solve(BASE)
    tests = checks()
    sensitivity = []
    for mode, field, values in [
        ('connection_only', 'W', [1, 2, 3, 4, 5, 6, 8]),
        ('both_windows', 'W', [1, 2, 3, 4, 5, 6, 7, 8]),
        ('energy', 'G', ['.1', '.2', '.3', '.4', '.5', '.65']),
        ('fixed_cost', 'F', [0, 5, 20, 30, 40]),
    ]:
        for value in values:
            changes = {field: value}
            if mode == 'both_windows':
                changes['H'] = value
            s = solve(altered(**changes))
            sensitivity.append({'scenario': mode, 'parameter': field,
                                'value': str(value),
                                **{k: float(s[k]) for k in
                                   ('d_kg', 'l_kg', 'z', 'incremental_profit')}})
    output = {'warning': 'ILLUSTRATIVE UNCALIBRATED MODEL, NOT FLIGHT VALIDATION',
              'method': 'Exact rational 2D vertex enumeration for both binary branches',
              'implementation_version': '1.0', 'python_version': platform.python_version(),
              'randomness': 'none', 'parameters': BASE, 'solution': solution,
              'boundary_tests': tests, 'sensitivity': sensitivity,
              'runtime_seconds': time.perf_counter()-started}
    out = Path(__file__).resolve().parent
    (out/'result.json').write_text(json.dumps(output, ensure_ascii=False, indent=2,
                                            default=serialize), encoding='utf-8')
    with (out/'sensitivity.csv').open('w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=list(sensitivity[0]))
        writer.writeheader()
        writer.writerows(sensitivity)
    print(json.dumps(solution, ensure_ascii=False, indent=2, default=serialize))
    print(f'{len(tests)} checks passed; result.json and sensitivity.csv written.')


if __name__ == '__main__':
    main()
