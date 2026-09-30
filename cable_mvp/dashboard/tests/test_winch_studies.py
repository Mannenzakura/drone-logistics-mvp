# -*- coding: utf-8 -*-
"""索降作业三段计时与可行域分区的 Python 测试（与 scripts/test-drone-winch.mjs 对偶）。"""
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from winch_studies import (WINCH_DEFAULTS, WINCH_LABELS, winch_derived, winch_parameters,
                           winch_point_at, winch_study)


class WinchAnchorTests(unittest.TestCase):
    """公开数据锚点必须能被两条公开观测重新算出来。"""

    def test_height_law_reproduces_both_public_points(self):
        base = winch_derived({})
        self.assertAlmostEqual(base['tau_drop_per_kg'], 20.5 / 60, places=12)
        self.assertAlmostEqual(winch_derived({'height': 30})['tau_drop_per_kg'], 62 / 60 / 2, places=12)
        # 两点线性律的截距为负：真实关系必含正的固定项，必须显式记录而不是藏起来。
        self.assertLess(base['drop_intercept_min_per_kg'], 0)
        self.assertAlmostEqual(base['drop_slope_min_per_kg_m'], 0.0175, places=12)

    def test_low_height_extrapolation_is_clamped(self):
        self.assertEqual(winch_derived({'height': 0})['tau_drop_per_kg'], 0)
        self.assertTrue(winch_derived({'height': 0})['tau_clamped'])
        self.assertFalse(winch_derived({'height': 25})['tau_clamped'])

    def test_mass_budget_matches_published_specs(self):
        # 20 kg 参考点 − 10 kg 固定货 − (1.5 + 0.264) kg 绞盘硬件
        self.assertAlmostEqual(winch_derived({})['mass_budget'], 20 - 10 - 1.764, places=12)


class WinchCapTests(unittest.TestCase):

    def test_each_cap_can_bind(self):
        self.assertAlmostEqual(winch_derived({})['cap_d'], 5)              # 绞盘上限
        self.assertAlmostEqual(winch_derived({'winch_capacity': 1})['cap_d'], 1)
        self.assertAlmostEqual(winch_derived({'D': 2, 'L': 3})['cap_d'], 2)  # 需求上限
        self.assertAlmostEqual(winch_derived({'box_mass': 9})['cap_d'], 0)   # 质量预算耗尽
        self.assertAlmostEqual(winch_derived({'box_mass': 5})['cap_d'], 20 - 10 - 1.764 - 5)

    def test_zero_window_or_energy_blocks_any_operation(self):
        self.assertEqual(winch_point_at({'W': 0, 'H': 0})['point']['cls'], 4)
        self.assertEqual(winch_point_at({'G': 0})['point']['cls'], 4)


class WinchPartitionTests(unittest.TestCase):

    def test_grid_is_consistent_and_shares_sum_to_one(self):
        r = winch_study({})
        self.assertEqual(len(r['grid']), len(r['axes']['y']['values']))
        self.assertTrue(all(len(row) == len(r['axes']['x']['values']) for row in r['grid']))
        self.assertTrue(all(c in WINCH_LABELS for row in r['grid'] for c in row))
        self.assertAlmostEqual(sum(r['summary']['shares'].values()), 1.0, places=12)
        # 满额一定蕴含可换，可换一定蕴含可卸
        self.assertLessEqual(r['summary']['full_capability_share'], r['summary']['exchange_share'] + 1e-12)
        self.assertLessEqual(r['summary']['exchange_share'], r['summary']['unload_share'] + 1e-12)

    def test_every_cell_respects_its_own_caps(self):
        r = winch_study({'x_steps': 9, 'y_steps': 9})
        for row in r['detail']:
            for cell in row:
                if cell['cls'] == 4:
                    continue
                self.assertLessEqual(cell['d'], cell['cap_d'] + 1e-9)
                self.assertLessEqual(cell['l'], cell['cap_l'] + 1e-9)
                self.assertGreaterEqual(cell['d'], 0)
                self.assertGreaterEqual(cell['l'], 0)
                if cell['cls'] in (0, 1):
                    self.assertGreater(cell['l'], 0)
                if cell['cls'] in (2, 3):
                    self.assertLessEqual(cell['l'], 1e-12)
                if cell['cls'] in (0, 2):
                    self.assertGreater(cell['profit'], 0)

    def test_full_capability_reports_its_binding_resource(self):
        t = winch_study({})['thresholds']
        self.assertEqual(t['full_capability_limited_by'], '装卸新增电量预算 G')
        self.assertAlmostEqual(t['full_energy_kwh'], 0.6, places=12)
        self.assertAlmostEqual(t['energy_full_capability']['value'], 0.7, places=12)
        # 电量放宽后应能满额
        relaxed = winch_point_at({'G': 2})
        self.assertEqual(relaxed['point']['cls'], 0)
        self.assertAlmostEqual(relaxed['point']['optimum']['d'], 5, places=9)
        self.assertAlmostEqual(relaxed['point']['optimum']['l'], 5, places=9)
        self.assertIsNone(relaxed['thresholds']['full_capability_limited_by'])

    def test_extra_energy_only_helps_until_caps_bind(self):
        low = winch_point_at({'G': 0.2})['point']['optimum']
        high = winch_point_at({'G': 9})['point']['optimum']
        self.assertLess(low['d'] + low['l'], high['d'] + high['l'])
        self.assertLessEqual(high['d'], winch_derived({'G': 9})['cap_d'] + 1e-9)


class WinchScanTests(unittest.TestCase):

    def test_axis_scans_stay_consistent(self):
        for x, y in [('height', 'window'), ('equipment_mass', 'energy'), ('cd', 'window'), ('demand', 'height')]:
            s = winch_study({'x_axis': x, 'y_axis': y, 'x_steps': 8, 'y_steps': 8})
            self.assertEqual(s['axes']['x']['key'], x)
            self.assertEqual(s['axes']['y']['key'], y)
            self.assertEqual(len(s['grid']), 9)
            self.assertTrue(all(len(row) == 9 for row in s['grid']))

    def test_more_window_never_hurts(self):
        prev = None
        for w in [1, 2, 3, 4, 6, 8, 12]:
            v = winch_point_at({'W': w, 'H': w})['point']['optimum']['profit']
            if prev is not None:
                self.assertGreaterEqual(v, prev - 1e-9)
            prev = v

    def test_more_height_never_helps(self):
        prev = None
        for h in [0, 10, 20, 40, 80, 160]:
            v = winch_point_at({'height': h})['point']['optimum']['profit']
            if prev is not None:
                self.assertLessEqual(v, prev + 1e-9)
            prev = v


class WinchValidationTests(unittest.TestCase):

    def test_rejects_bad_input(self):
        for bad in [{'x_axis': 'nope'}, {'x_axis': 'height', 'y_axis': 'height'}, {'x_steps': 2},
                    {'q': 25}, {'shared_airspace': 2}, [], {'x_max': -1}, {'unknown_key': 1}]:
            with self.assertRaises(ValueError):
                winch_study(bad)

    def test_defaults_are_valid_and_complete(self):
        p = winch_parameters({})
        self.assertEqual(set(p), set(WINCH_DEFAULTS))
        self.assertEqual(p['winch_capacity'], 5)
        self.assertAlmostEqual(p['hardware_mass'], 1.5 + 0.264, places=12)


if __name__ == '__main__':
    unittest.main(verbosity=2)
