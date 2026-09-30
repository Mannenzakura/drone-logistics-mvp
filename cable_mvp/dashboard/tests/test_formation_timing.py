import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from formation_timing import formation_timing
class TimingTests(unittest.TestCase):
 def test_default_and_energy_bookkeeping(self):
  r=formation_timing({})
  self.assertAlmostEqual(r['scenario_cost']['solo_only'],183.75)
  # 2026-09-26：χη 由 0.15 下修为 0.06（γ 0.9→0.96），编队方案成本随之上升。
  self.assertAlmostEqual(r['scenario_cost']['formation_with_wait'],177.87)
  for scenario in r['scenarios'].values():
   carry=0
   for row in scenario['rows']:
    self.assertEqual(row['carried'],carry)
    self.assertEqual(row['ready']+carry,row['departed']+row['held'])
    self.assertEqual(sum(row['parts']),row['departed'])
    self.assertLessEqual(row['occupancy'],40)
    carry=row['held']
   self.assertEqual(carry,0)
   self.assertAlmostEqual(sum(row['departure_cost']+row['charged_wait_cost'] for row in scenario['rows']),scenario['cost'])
 def test_formation_feasible_solo_infeasible(self):
  r=formation_timing({'demand':[6,6],'capacity_per_slice':16})
  self.assertIsNone(r['scenario_cost']['solo_only'])
  self.assertEqual(r['scenarios']['formation_with_wait']['status'],'optimal')
  self.assertIsNone(r['saving_timed'])
 def test_equal_waiting_rules(self):
  r=formation_timing({'demand':[4,0],'formation_cap':1,'capacity_per_slice':6})
  self.assertGreater(r['scenarios']['solo_only']['wait_sortie_slices'],0)
  self.assertAlmostEqual(r['scenario_cost']['solo_only'],r['scenario_cost']['formation_with_wait'])
 def test_wait_forbidden(self):
  r=formation_timing({'demand':[1,0,1],'allow_wait':0})
  self.assertAlmostEqual(r['scenario_cost']['formation_free_wait'],r['scenario_cost']['formation_with_wait'])
 def test_invalid_inputs(self):
  for bad in ({'demand':[241]},{'demand':[1.5]},{'demand':[]},{'gamma':0},{'payload':float('nan')},
              {'max_wait_slices':1.5},{'service_per_slice':-1},{'max_wait_slices':49},
              {'battery_kwh':-1},{'max_airborne_min':-1}):
   with self.assertRaises(ValueError):formation_timing(bad)

 # —— 逐机资源约束：电池 / 累计空中等待 / 机场服务率（2026-09-26 新增）——
 def test_default_case_is_unconstrained(self):
  r=formation_timing({})
  for k in ('battery_kwh','max_airborne_min','max_wait_slices','service_per_slice'):
   self.assertEqual(r['parameters'][k],0)
  self.assertIsNone(r['resources']['applied_wait_cap_slices'])
  self.assertIsNone(r['resources']['service_per_slice'])
  self.assertIsNone(r['resources']['resource_cap_effect'])
  self.assertAlmostEqual(r['scenario_cost']['formation_with_wait'],177.87)

 def test_battery_cap_and_blocker(self):
  tight={'demand':[10,2,2,2],'capacity_per_slice':6}
  # 单机巡航 (.025 + 2*.025/15*10)*70 = 4.0833 kWh；一片 60 min 等待耗 .045*60 = 2.7 kWh
  r=formation_timing({**tight,'battery_kwh':12})
  self.assertAlmostEqual(r['resources']['cruise_energy_worst_case_kwh'],(.025+2*.025/15*10)*70)
  self.assertAlmostEqual(r['resources']['wait_energy_per_slice_kwh'],.045*60)
  self.assertEqual(r['resources']['battery_wait_cap_slices'],2)
  self.assertFalse(r['resources']['resource_cap_effect']['binding'])
  blocked=formation_timing({**tight,'battery_kwh':4})
  self.assertEqual(blocked['solver']['status'],'resource_infeasible')
  self.assertTrue(blocked['resources']['blockers'])
  self.assertIsNone(blocked['scenario_cost']['formation_with_wait'])

 def test_airborne_and_service_caps(self):
  tight={'demand':[10,2,2,2],'capacity_per_slice':6}
  self.assertEqual(formation_timing({**tight,'max_airborne_min':400})['resources']['airborne_wait_cap_slices'],6)
  self.assertEqual(formation_timing({**tight,'max_airborne_min':30})['solver']['status'],'resource_infeasible')
  self.assertEqual(formation_timing({**tight,'service_per_slice':3})['solver']['status'],'infeasible')
  svc=formation_timing({**tight,'service_per_slice':4})
  self.assertEqual(svc['solver']['status'],'optimal')
  self.assertTrue(all(row['departed']<=4 for row in svc['plan']['rows']))

 def test_plan_respects_caps_and_fifo(self):
  for cfg in ({'demand':[10,2,2,2],'capacity_per_slice':6},
              {'demand':[10,2,2,2],'capacity_per_slice':6,'max_wait_slices':1},
              {'demand':[10,2,2,2],'capacity_per_slice':6,'service_per_slice':4},
              {'demand':[3,5,8,10,9,6,4],'max_wait_slices':2},
              {'demand':[5,5,5],'max_wait_slices':1,'capacity_per_slice':8}):
   r=formation_timing(cfg);W=r['resources']['applied_wait_cap_slices'];carry=0;dep=0
   for row in r['plan']['rows']:
    self.assertEqual(row['carried'],carry)
    self.assertEqual(row['ready']+carry,row['departed']+row['held'])
    carry=row['held'];dep+=row['departed']
    if r['resources']['service_per_slice'] is not None:
     self.assertLessEqual(row['departed'],r['resources']['service_per_slice'])
    if W is not None:
     self.assertLessEqual(row['held'],row['wait_cap_count']+1e-9)
   self.assertEqual(carry,0);self.assertEqual(dep,sum(cfg.get('demand',[3,5,8,10,9,6,4])))
   if W is not None:
    self.assertTrue(r['resources']['wait_cap_respected'])
    self.assertLessEqual(r['resources']['realized_max_wait_slices'],W)
    if r['resources']['battery_kwh'] is not None:
     self.assertLessEqual(r['resources']['realized_max_wait_slices']*r['resources']['wait_energy_per_slice_kwh']
                          +r['resources']['cruise_energy_worst_case_kwh'],r['resources']['battery_kwh']+1e-9)

 def test_relaxing_battery_never_hurts(self):
  tight={'demand':[10,2,2,2],'capacity_per_slice':6}
  prev=float('inf')
  for kwh in (4,5,6,8,12,0):
   c=formation_timing({**tight,'battery_kwh':kwh})['scenario_cost']['formation_with_wait']
   if c is not None:
    self.assertLessEqual(c,prev+1e-9)
    prev=c

if __name__=='__main__':unittest.main()
