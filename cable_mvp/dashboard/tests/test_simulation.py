import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from server import simulate, DEFAULTS

class SimulationTests(unittest.TestCase):
    def test_original_solution_and_timeline_conservation(self):
        r=simulate({'parameters':{'eta':0}})
        self.assertAlmostEqual(r['d'],5)
        self.assertAlmostEqual(r['l'],10/3)
        self.assertAlmostEqual(r['profit'],25)
        self.assertAlmostEqual(r['total_time'],70/108*60+6+.5)
        self.assertAlmostEqual(r['samples'][-1]['energy'],r['incremental_energy'])
        self.assertAlmostEqual(r['samples'][-1]['mass'],10+10/3)
        self.assertAlmostEqual(r['samples'][-1]['distance'],70)
        for a,b in zip(r['segments'],r['segments'][1:]):
            self.assertAlmostEqual(a['end'],b['start'])
            self.assertAlmostEqual(a['m1'],b['m0'])
            self.assertAlmostEqual(a['e1'],b['e0'])
    def test_no_permission_keeps_transport(self):
        r=simulate({'parameters':{'a':0}})
        self.assertTrue(r['valid']);self.assertEqual(r['z'],0)
        self.assertEqual([s['key'] for s in r['segments']],['ac','wait','join','cb'])
        self.assertEqual(r['incremental_energy'],0)
    def test_manual_overload_does_not_animate(self):
        r=simulate({'mode':'manual','d':6,'l':5})
        self.assertFalse(r['valid']);self.assertEqual(r['segments'],[])
    def test_range_screen(self):
        with self.assertRaises(ValueError):simulate({'parameters':{'distance_ac':80}})
        with self.assertRaises(ValueError):simulate({'parameters':{'distance_cb':80}})
    def test_valid_manual_and_wait(self):
        r=simulate({'mode':'manual','d':2,'l':1})
        self.assertTrue(r['valid']);self.assertTrue(any(s['key']=='wait' for s in r['segments']))
        self.assertAlmostEqual(r['departure']-r['arrival'],6.5)
    def test_input_validation(self):
        for params in ({'speed':0},{'W':-1},{'G':float('nan')},{'a':2}):
            with self.assertRaises(ValueError):simulate({'parameters':params})
    def test_zero_durations(self):
        r=simulate({'parameters':{'W':0,'H':0,'t0':0,'td':0,'tl':0,'join_buffer':0}})
        self.assertTrue(r['valid'])
        self.assertTrue(all(s['end']>s['start'] for s in r['segments']))
    def test_v23_roles_and_no_savings_limits(self):
        # 从 DEFAULTS 读取标定值，避免以后调整 χη 时这里悄悄失效。
        chi_eta=DEFAULTS['eta']*DEFAULTS['propulsion_share']
        follow=simulate({})
        self.assertAlmostEqual(follow['formation']['gamma'],1-chi_eta*2/3)
        rotate=simulate({'parameters':{'formation_role':2}})
        self.assertAlmostEqual(rotate['formation']['gamma'],1-chi_eta*(2/3)**2)
        for params in ({'eta':0},{'formation_size':1},{'formation_role':0},{'formation_role':3},{'propulsion_share':0}):
            r=simulate({'parameters':params})
            self.assertEqual(r['formation']['gamma'],1)
            self.assertEqual(r['formation']['saving'],0)
    def test_energy_and_profit_baselines_do_not_double_count(self):
        r=simulate({})
        f=r['formation'];p=r['parameters']
        self.assertAlmostEqual(f['cb_solo']-f['cb_form'],f['saving'])
        self.assertAlmostEqual(r['samples'][-1]['formation_saved'],f['saving'])
        self.assertAlmostEqual(r['samples'][-1]['energy_solo']-r['incremental_energy'],
                               (1-f['gamma'])*f['al_solo']*r['l'])
        self.assertAlmostEqual(r['profit'],25+p['energy_price']*(1-f['gamma'])*f['al_solo']*r['l'])
        self.assertAlmostEqual(r['total_gain_vs_solo_noop'],25+p['energy_price']*f['saving'])
        self.assertTrue(all(s['formation_saved']==0 for s in r['samples'] if s['time']<=r['departure']))
    def test_saving_changes_energy_constrained_loading(self):
        solo=simulate({'parameters':{'G':.35,'eta':0}})
        form=simulate({'parameters':{'G':.35,'eta':.2,'propulsion_share':1}})
        self.assertAlmostEqual(solo['l'],.625)
        self.assertAlmostEqual(form['l'],10/3)
        self.assertGreater(form['l'],solo['l'])
        self.assertTrue(form['valid'])
    def test_invalid_formation_inputs(self):
        for params in ({'eta':1.01},{'formation_size':2.5},{'formation_size':9},{'formation_role':4},{'propulsion_share':1.1}):
            with self.assertRaises(ValueError):simulate({'parameters':params})

    def test_independent_area_bypasses_only_airport_window(self):
        shared=simulate({'parameters':{'H':0,'a':0}})
        independent=simulate({'parameters':{'H':0,'a':0,'shared_airspace':0}})
        self.assertEqual(shared['z'],0)
        self.assertTrue(independent['valid'])
        self.assertAlmostEqual(independent['d'],5)
        self.assertAlmostEqual(independent['l'],10/3)
        self.assertEqual(independent['shared_airspace_time'],0)
        # Only the two airspace rows become inapplicable; 绞盘行在不启用绞盘约束时也不适用，
        # 因此这里按名称过滤而不是数总数，避免以后新增检查项就误报。
        airspace = [c for c in independent['checks'] if '空域' in c['name']]
        self.assertEqual(len(airspace), 2)
        self.assertTrue(all(c.get('applicable') is False for c in airspace))
        winch = [c for c in independent['checks'] if '绞盘' in c['name'] or '质量预算' in c['name']]
        self.assertEqual(len(winch), 3)
        self.assertTrue(all(c.get('applicable') is False for c in winch))
        # W and energy still bind even when H and a are inapplicable.
        self.assertEqual(simulate({'parameters':{'shared_airspace':0,'W':1}})['z'],0)
        self.assertEqual(simulate({'parameters':{'shared_airspace':0,'G':0,'eta':0}})['z'],0)

    def test_airspace_manual_and_switch_back(self):
        config={'mode':'manual','d':5,'l':3,'parameters':{'shared_airspace':0,'H':0,'a':0}}
        self.assertTrue(simulate(config)['valid'])
        config['parameters']['W']=3
        self.assertFalse(simulate(config)['valid'])
        config['parameters']['W']=6
        config['parameters']['shared_airspace']=1
        self.assertFalse(simulate(config)['valid'])
        with self.assertRaises(ValueError):simulate({'parameters':{'shared_airspace':2}})

    def test_economics_profiles_and_direct_baseline(self):
        standard=simulate({'cargo_type':'standard'})
        medical=simulate({'cargo_type':'medical'})
        self.assertEqual(standard['economics']['cargo_label'],'普通件')
        self.assertEqual(medical['economics']['cargo_label'],'医疗/高价值件')
        self.assertTrue(standard['economics']['direct']['feasible'])
        self.assertGreater(medical['economics']['transfer_revenue'],standard['economics']['transfer_revenue'])
        self.assertAlmostEqual(standard['economics']['delta_vs_direct'],
                               standard['economics']['transfer_net_benefit']-standard['economics']['direct']['net_benefit'])
        with self.assertRaises(ValueError):simulate({'cargo_type':'unknown'})

    def test_direct_route_becomes_infeasible_when_too_long(self):
        r=simulate({'parameters':{'direct_distance':111}})
        self.assertFalse(r['economics']['direct']['feasible'])
        self.assertIsNone(r['economics']['delta_vs_direct'])

    def test_editable_economic_parameters_change_auto_loading(self):
        normal=simulate({'parameters':{'cargo_fee':8}})
        no_fee=simulate({'parameters':{'cargo_fee':0}})
        self.assertGreater(normal['d']+normal['l'],0)
        self.assertEqual(no_fee['z'],0)
        self.assertEqual(no_fee['d'],0)
        self.assertEqual(no_fee['l'],0)

    def test_separate_compartment_prices_and_cargo_origins(self):
        r=simulate({'mode':'manual','d':2,'l':1,'cargo_types':{'q':'standard','d':'medical','l':'express'},
                    'parameters':{'fee_q':2,'fee_d':20,'fee_l':5}})
        rows=r['economics']['cargo_rows']
        self.assertEqual([c['fee'] for c in rows],[2,20,5])
        self.assertEqual([c['label'] for c in rows],['普通件','医疗/高价值件','时效件'])
        self.assertAlmostEqual(r['economics']['transfer_revenue'],65)
        self.assertEqual(r['economics']['direct']['mass_kg'],10)
        self.assertEqual(r['economics']['direct']['revenue'],20)
        self.assertAlmostEqual(rows[0]['time_min'],r['total_time'])
        self.assertAlmostEqual(rows[2]['time_min'],r['total_time']-r['arrival'])

    def test_group_price_changes_loading_and_matches_accounting(self):
        params={'fee_d':0,'fee_l':30}
        r=simulate({'parameters':params})
        self.assertEqual(r['d'],0)
        self.assertAlmostEqual(r['l'],5)
        no=simulate({'mode':'manual','d':0,'l':0,'parameters':params})
        self.assertAlmostEqual(r['economics']['transfer_net_benefit']-no['economics']['transfer_net_benefit'],
                               r['economic_optimal_profit'])
        for bad in ({'q':'unknown'},{'x':'standard'},{'l':[]}):
            with self.assertRaises(ValueError):simulate({'cargo_types':bad})


    def test_literature_default_gamma(self):
        # 2026-09-26 文献页码级核查后：原「χη ∈ [0.10, 0.18]」站不住（全是二次引用的军机/运输机
        # 燃油数据，没有 96 kg 级电动垂起固定翼的一手值），默认改为 η=0.10、χ=0.6 即 χη=0.06。
        r = simulate({'parameters': {}})
        self.assertAlmostEqual(r['formation']['gamma'], 1 - .10 * .6 * (2 / 3))
        # χη=0.06 时跟随巡航节能 4%，不是 6%
        self.assertAlmostEqual(1 - r['formation']['gamma'], .10 * .6 * (2 / 3))

    def test_chi_eta_sensitivity_is_monotone_and_bounded(self):
        sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
        from formation_studies import chi_eta_sensitivity
        s = chi_eta_sensitivity({'ref_payload': 10})
        self.assertEqual(len(s['rows']), 8)
        self.assertAlmostEqual(s['current_chi_eta'], .06)
        cheaper = [r['chi_eta'] for r in s['rows'] if r['formation_cheaper_at_solo_limit']]
        further = [r['chi_eta'] for r in s['rows'] if r['formation_reaches_further']]
        if cheaper:
            self.assertAlmostEqual(s['summary']['max_chi_eta_still_cheaper'], max(cheaper))
        else:
            self.assertIsNone(s['summary']['max_chi_eta_still_cheaper'])
        self.assertEqual(s['summary']['cheaper_in_sweep'], bool(cheaper))
        self.assertEqual(s['summary']['further_in_sweep'], bool(further))
        # 节能比例单调递增，γ 单调递减
        for a, b in zip(s['rows'], s['rows'][1:]):
            self.assertLess(a['follower_saving'], b['follower_saving'])
            self.assertGreater(a['gamma'], b['gamma'])
            if a['formation_distance'] is not None and b['formation_distance'] is not None:
                self.assertLessEqual(a['formation_distance'], b['formation_distance'] + 1e-9)
        # χ=0 时无法由 χη 反解 η，必须报错而不是悄悄给 0
        with self.assertRaises(ValueError):
            chi_eta_sensitivity({'propulsion_share': 0, 'ref_payload': 10})

if __name__=='__main__':unittest.main()
