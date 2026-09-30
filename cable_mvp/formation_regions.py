"""Compatibility entry; see formation_studies.py and formation-regions-model.md."""
from formation_studies import REGION_DEFAULTS, REGION_LABELS, formation_regions, region_parameters, region_point
def classify(distance, payload, p, derived):
    return region_point({**REGION_DEFAULTS,**p},derived,distance,payload)["region"]
