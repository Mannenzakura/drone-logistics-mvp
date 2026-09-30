import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
from formation_studies import formation_regions,region_point
class RegionTests(unittest.TestCase):
 def test_two_points_and_zero_payload(self):
  r=formation_regions({})
  self.assertAlmostEqual(r['solo_boundary'][40],70)
  self.assertAlmostEqual(r['solo_boundary'][20],110)
  self.assertIsNotNone(r['formation_boundary'][0])
 def test_symmetric_extrapolation(self):
  for ext in (0,1):
   r=formation_regions({'eta':0,'loiter':0,'allow_extrapolation':ext})
   self.assertEqual(r['solo_boundary'],r['formation_boundary'])
   self.assertTrue(all(2 not in row for row in r['grid']))
 def test_waiting_spends_energy(self):
  r=formation_regions({'delay':200})
  self.assertEqual(region_point(r['parameters'],r['derived'],10,10)['region'],4)
  self.assertIsNone(r['formation_boundary'][20])
 def test_structure_and_reference_limits(self):
  r=formation_regions({})
  self.assertEqual(region_point(r['parameters'],r['derived'],1,21)['region'],3)
  self.assertEqual(region_point(r['parameters'],r['derived'],120,5)['region'],3)
 def test_invalid(self):
  for bad in ({'eta':float('nan')},{'delay':float('inf')},{'formation_size':2.5}):
   with self.assertRaises(ValueError):formation_regions(bad)

if __name__=='__main__':unittest.main()
