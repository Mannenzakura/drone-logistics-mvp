"""Local research simulator. No hardware connection; no external dependencies."""
import json
import csv
import io
import math
import sys
from pathlib import Path
from fractions import Fraction as R
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))
from solve import BASE, solve
from formation_regions import formation_regions as compute_formation_regions, classify
from formation_timing import formation_timing as compute_formation_timing

DEFAULTS = {k: float(v) for k, v in BASE.items()}
DEFAULTS['join_buffer'] = .5
DEFAULTS['shared_airspace'] = 1
DEFAULTS['allow_extrapolation'] = 0
DEFAULTS.update(cargo_fee=8.0, time_value=0.015, handling_cost=0.25,
                direct_distance=55.0, direct_payload_energy=0.04,
                direct_fixed_cost=0.0)
# 索降作业三段计时与绞盘/质量约束（2026-09-26 接续新增；默认 0 不改变原有行为）。
DEFAULTS.update(operation_mode=0.0, enforce_winch=0.0, winch_capacity=5.0, hardware_mass=1.764,
                box_mass=0.0, mount_mass=0.0, height=20.0, approach_min=0.0, transition_min=0.0,
                exit_min=0.0, exchange_fixed_min=0.0, exchange_per_kg_min=0.0, drop_ref_height=20.0,
                drop_ref_seconds_per_kg=20.5, drop_height_slope=0.0175,
                pickup_ref_seconds_per_kg=20.5, pickup_height_slope=0.0175)
from winch_studies import winch_derived as compute_winch_derived

# 编队 vs 单飞分区面板的可调参数（机制演示，未标定）。
from formation_studies import REGION_DEFAULTS


def formation_timing_response(body):
    """Run the time-slice formation-synchronization DP for a panel request."""
    if not isinstance(body, dict):
        raise ValueError('请求必须是参数对象')
    overrides = body.get('parameters', {})
    if not isinstance(overrides, dict):
        raise ValueError('参数必须是对象')
    clean = {}
    for key, value in overrides.items():
        if key == 'demand':
            if (not isinstance(value, list) or len(value) > 48
                    or any(isinstance(v, bool) or not isinstance(v, (int, float))
                           or v != int(v) or v < 0 for v in value)):
                raise ValueError('demand 须为不超过 48 个非负整数')
            clean[key] = [int(v) for v in value]
        elif key == 'loiter' or key == 'allow_wait':
            if value not in (0, 1):
                raise ValueError(f'{key} 必须为 0 或 1')
            clean[key] = value
        elif isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f'{key} 必须是有限数值')
        elif abs(value) > 10000:
            raise ValueError('参数超出仿真范围')
        else:
            clean[key] = value
    return compute_formation_timing(clean)


def formation_region_response(body):
    """Run the formation-versus-solo region analysis for a panel request."""
    if not isinstance(body, dict):
        raise ValueError('请求必须是参数对象')
    overrides = body.get('parameters', {})
    if not isinstance(overrides, dict) or set(overrides) - set(REGION_DEFAULTS):
        raise ValueError('包含未知参数')
    p = REGION_DEFAULTS.copy()
    for key, value in overrides.items():
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f'{key} 必须是有限数值')
        if abs(value) > 10000:
            raise ValueError('参数超出仿真范围')
        p[key] = value
    if p['formation_size'] != int(p['formation_size']) or not 1 <= p['formation_size'] <= 8:
        raise ValueError('编队规模须为1–8的整数')
    if p['formation_role'] not in (0, 1, 2, 3):
        raise ValueError('编队角色不合法')
    result = compute_formation_regions(p)
    marker = body.get('marker')
    if marker is not None:
        if (not isinstance(marker, dict)
                or not isinstance(marker.get('distance'), (int, float))
                or not isinstance(marker.get('payload'), (int, float))
                or not math.isfinite(marker['distance']) or not math.isfinite(marker['payload'])):
            raise ValueError('marker 须包含有限数值 distance 与 payload')
        result['marker'] = dict(distance=marker['distance'], payload=marker['payload'],
                                region=classify(marker['distance'], marker['payload'], p, result['derived']))
    return result


CARGO_PROFILES = {
    'standard': dict(label='普通件', cargo_fee=8.0, time_value=0.015, handling_cost=0.25),
    'express': dict(label='时效件', cargo_fee=12.0, time_value=0.05, handling_cost=0.30),
    'medical': dict(label='医疗/高价值件', cargo_fee=16.0, time_value=0.12, handling_cost=0.40),
}
DEFAULTS.update(eta=.1, formation_size=3, formation_role=1,
                propulsion_share=.6, cruise_empty=.025, energy_price=1)
for group in ('q','d','l'):
    DEFAULTS.update({f'fee_{group}':8.0, f'time_{group}':.015, f'handling_{group}':.25})


def formation_parameters(p):
    m=p['formation_size'];role=p['formation_role']
    if m != int(m) or not 1<=m<=8 or role not in (0,1,2,3):
        raise ValueError('编队规模须为1–8的整数，角色不合法')
    if not 0<=p['eta']<=1 or not 0<=p['propulsion_share']<=1:
        raise ValueError('减阻参数与推进占比须在0到1之间')
    a=(m-1)/m if role==1 else ((m-1)/m)**2 if role==2 else 0
    gamma=1-p['propulsion_share']*p['eta']*a
    ad=p['ed']*p['distance_ac']/30
    al=p['el']*p['distance_cb']/40
    baseline_saving=(1-gamma)*(p['cruise_empty']*p['distance_cb']+al*p['q'])
    return dict(gamma=gamma,drag_reduction=p['eta']*a,ad=ad,al_solo=al,
                al_form=gamma*al,baseline_saving=baseline_saving,
                available_energy=p['G']+baseline_saving,
                bd=p['bd']+p['energy_price']*(p['ed']-ad),
                bl=p['bl']+p['energy_price']*(p['el']-gamma*al))


def simulate(body):
    if not isinstance(body, dict):
        raise ValueError('请求必须是参数对象')
    cargo_type = body.get('cargo_type', 'standard')
    if not isinstance(cargo_type,str) or cargo_type not in CARGO_PROFILES:
        raise ValueError('货物类型不合法')
    p = DEFAULTS.copy()
    profile = CARGO_PROFILES[cargo_type]
    for key in ('cargo_fee', 'time_value', 'handling_cost'):
        p[key] = profile[key]
    overrides = body.get('parameters', {})
    if not isinstance(overrides, dict) or set(overrides)-set(p):
        raise ValueError('包含未知参数')
    cargo_types = body.get('cargo_types', {})
    if not isinstance(cargo_types,dict) or set(cargo_types)-{'q','d','l'}:
        raise ValueError('货物组须为 q、d、l')
    group_labels={}
    for group in ('q','d','l'):
        kind=cargo_types.get(group,cargo_type)
        if not isinstance(kind,str) or kind not in CARGO_PROFILES:
            raise ValueError(f'{group} 货物类型不合法')
        group_labels[group]=CARGO_PROFILES[kind]['label']
        for dest,source in [('fee','cargo_fee'),('time','time_value'),('handling','handling_cost')]:
            p[f'{dest}_{group}']=CARGO_PROFILES[kind][source] if group in cargo_types else overrides.get(source,profile[source])
    for key, value in overrides.items():
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f'{key} 必须是有限数值')
        if abs(value) > 10000:
            raise ValueError('参数超出仿真范围')
        p[key] = value
    for key in p:
        if key not in ('bd', 'bl') and p[key] < 0:
            raise ValueError(f'{key} 不能为负数')
    if p['speed'] <= 0 or p['distance_ac'] <= 0 or p['distance_cb'] <= 0:
        raise ValueError('距离与巡航速度必须大于 0')
    if p['a'] not in (0, 1):
        raise ValueError('空域许可必须为 0 或 1')
    if p['allow_extrapolation'] not in (0, 1):
        raise ValueError('外推开关必须为 0 或 1')
    if p['shared_airspace'] not in (0, 1):
        raise ValueError('是否占用机场共享空域必须为 0 或 1')
    if p['operation_mode'] not in (0, 1):
        raise ValueError('作业计时模式必须为 0（单次悬停换货）或 1（三段计时）')
    if p['enforce_winch'] not in (0, 1):
        raise ValueError('绞盘约束开关必须为 0 或 1')
    formation=formation_parameters(p)
    distance = p['distance_ac'] + p['distance_cb']
    extrapolated = p['allow_extrapolation'] == 1 and distance > 110
    if distance > 110 and not p['allow_extrapolation']:
        raise ValueError('总航程超出原文 110 km 适用范围；如需继续探索可勾选“允许航程外推”')
    # Nominal screening only, NOT validation of retrofit endurance.
    reference = min(20, 37.5-distance/4)
    effective_q = min(p['Q'], reference-p['equipment_mass'])
    if effective_q < p['q']:
        raise ValueError(f'固定货物 {p["q"]:g} kg 已超过本情景参考净载荷 {effective_q:.2f} kg')
    # —— 索降作业三段计时与绞盘/质量预算 ——
    # 先折算成等效的 (t0, td, tl, D, L)，再交给同一个精确顶点枚举求解器。
    wl = compute_winch_derived(p)
    t0_eff = wl['t_fixed_min'] if p['operation_mode'] == 1 else p['t0']
    td_eff = wl['time_per_kg_d'] if p['operation_mode'] == 1 else p['td']
    tl_eff = wl['time_per_kg_l'] if p['operation_mode'] == 1 else p['tl']
    mass_budget = effective_q - p['hardware_mass'] - p['box_mass'] - p['mount_mass']
    if p['enforce_winch'] == 1:
        winch_cap_d = max(0.0, min(p['winch_capacity'], p['D'], mass_budget))
        winch_cap_l = max(0.0, min(p['winch_capacity'], p['L'], mass_budget))
    else:
        winch_cap_d, winch_cap_l = p['D'], p['L']
    winch = dict(operation_mode=int(p['operation_mode']), enforce_winch=int(p['enforce_winch']),
                 t_fixed_min=t0_eff, time_per_kg_d=td_eff, time_per_kg_l=tl_eff,
                 tau_drop_per_kg=wl['tau_drop_per_kg'], tau_pickup_per_kg=wl['tau_pickup_per_kg'],
                 tau_clamped=bool(wl['tau_clamped']), mass_budget=mass_budget,
                 cap_d=winch_cap_d, cap_l=winch_cap_l, reference_height=p['drop_ref_height'],
                 public_anchor='(2 kg,20 m)=41 s 与 (2 kg,30 m)=62 s 定出高度律')
    model = {k: R(str(v)) for k, v in p.items() if k in BASE}
    model['Q'] = R(str(effective_q))
    model['D'] = R(str(winch_cap_d))
    model['L'] = R(str(winch_cap_l))
    model['t0'] = R(str(t0_eff)); model['td'] = R(str(td_eff)); model['tl'] = R(str(tl_eff))
    model['shared_airspace'] = int(p['shared_airspace'])
    for key,value in dict(ed=formation['ad'],el=formation['al_form'],
                          G=formation['available_energy'],bd=formation['bd'],bl=formation['bl']).items():
        model[key]=R(str(value))
    operational_optimal = solve(model)
    # A second LP uses the editable economic coefficients so that cargo prices,
    # time sensitivity and handling cost change the automatic loading decision.
    economic_model = model.copy()
    cargo_times=dict(d=p['distance_ac']/p['speed']*60,
                     l=p['W']+p['join_buffer']+p['distance_cb']/p['speed']*60)
    cargo_times['q']=cargo_times['d']+cargo_times['l']
    economic_model['bd'] = R(str(p['fee_d']-p['handling_d']-p['time_d']*cargo_times['d']-p['energy_price']*formation['ad']))
    economic_model['bl'] = R(str(p['fee_l']-p['handling_l']-p['time_l']*cargo_times['l']-p['energy_price']*formation['al_form']))
    economic_model['F'] = R(str(p['F']+p['energy_price']*p['e0']))
    economic_optimal = solve(economic_model)
    mode = body.get('mode', 'optimal')
    if mode not in ('optimal', 'manual'):
        raise ValueError('未知方案模式')
    if mode == 'manual':
        d, l = body.get('d', 0), body.get('l', 0)
        if any(isinstance(v, bool) or not isinstance(v, (int,float)) or not math.isfinite(v) or v < 0 or v > 10000 for v in (d,l)):
            raise ValueError('手动装卸量应为非负有限数值')
        z = int(d+l > 0)
    else:
        d, l, z = float(economic_optimal['d_kg']), float(economic_optimal['l_kg']), economic_optimal['z']
    duration = t0_eff*z+td_eff*d+tl_eff*l
    energy = p['e0']*z+formation['ad']*d+formation['al_form']*l
    cb_solo=p['cruise_empty']*p['distance_cb']+formation['al_solo']*(p['q']+l)
    formation.update(cb_solo=cb_solo,cb_form=formation['gamma']*cb_solo,
                     saving=(1-formation['gamma'])*cb_solo)
    # Economic comparison: transfer service versus a solo direct A→B baseline.
    # All monetary coefficients are scenario inputs and can be calibrated in the UI.
    ac_minutes = p['distance_ac']/p['speed']*60
    cb_minutes = p['distance_cb']/p['speed']*60
    direct_distance = p['direct_distance']
    direct_reference = min(20, 37.5-direct_distance/4)
    direct_payload = min(p['Q'], direct_reference-p['equipment_mass'])
    direct_reason = None
    if direct_distance <= 0 or (direct_distance > 110 and not p['allow_extrapolation']) or direct_payload < p['q']:
        direct_reason = '直飞航程或固定货物超出当前参考范围'
        direct = dict(feasible=False, reason=direct_reason, extra_kg=0, mass_kg=0,
                      time_min=0, energy_kwh=0, revenue=0, time_cost=0,
                      operating_cost=0, net_benefit=None)
    else:
        direct_time = direct_distance/p['speed']*60
        direct_extra = 0
        direct_mass = p['q']
        direct_energy = p['cruise_empty']*direct_distance + p['direct_payload_energy']*direct_mass
        direct_revenue = p['fee_q']*direct_mass
        direct_time_cost = p['time_q']*direct_time*direct_mass
        direct_operating = p['energy_price']*direct_energy+p['direct_fixed_cost']+p['handling_q']*direct_mass
        direct = dict(feasible=True, reason='', extra_kg=direct_extra, mass_kg=direct_mass,
                      time_min=direct_time, energy_kwh=direct_energy, revenue=direct_revenue,
                      time_cost=direct_time_cost, operating_cost=direct_operating,
                      net_benefit=direct_revenue-direct_time_cost-direct_operating)
    transfer_mass = p['q']+d+l
    cargo_rows=[]
    for group,mass in [('q',p['q']),('d',d),('l',l)]:
        cargo_rows.append(dict(group=group,label=group_labels[group],mass=mass,fee=p[f'fee_{group}'],
                               revenue=mass*p[f'fee_{group}'],time_min=cargo_times[group],
                               time_cost=mass*p[f'time_{group}']*cargo_times[group],
                               handling_cost=mass*p[f'handling_{group}']))
    transfer_revenue = sum(c['revenue'] for c in cargo_rows)
    transfer_time_cost = sum(c['time_cost'] for c in cargo_rows)
    transfer_energy_total = p['cruise_empty']*p['distance_ac'] + formation['ad']*(p['q']+d) + p['e0']*z + formation['cb_form']
    transfer_operating = p['energy_price']*transfer_energy_total+p['F']*z+sum(c['handling_cost'] for c in cargo_rows)
    transfer_net = transfer_revenue-transfer_time_cost-transfer_operating
    economics = dict(cargo_type=cargo_type, cargo_label=group_labels['q'] if len(set(group_labels.values()))==1 else '分组货物',cargo_rows=cargo_rows,
                     transfer_mass=transfer_mass, transfer_revenue=transfer_revenue,
                     transfer_time_cost=transfer_time_cost, transfer_energy_kwh=transfer_energy_total,
                     transfer_operating_cost=transfer_operating,
                     transfer_net_benefit=transfer_net, direct=direct,
                     delta_vs_direct=None if direct['net_benefit'] is None else transfer_net-direct['net_benefit'])
    checks = []
    def check(name, used, limit, unit):
        checks.append(dict(name=name, used=used, limit=limit, unit=unit, ok=used<=limit+1e-9))
    check('衔接时间', duration, p['W'], 'min')
    if p['shared_airspace']:
        check('机场共享空域窗口', duration, p['H'], 'min')
    else:
        checks.append(dict(name='机场共享空域窗口', used=0, limit=None,
                           unit='min', ok=True, applicable=False))
    check('新增能量（含基准节能余量）', energy, formation['available_energy'], 'kWh')
    check('卸货仓容量', d, p['B'], 'kg')
    check('装货仓容量', l, p['B'], 'kg')
    check('A→C 总货物', p['q']+d, effective_q, 'kg')
    check('C→B 总货物', p['q']+l, effective_q, 'kg')
    check('卸货需求', d, p['D'], 'kg')
    check('装货需求', l, p['L'], 'kg')
    if p['shared_airspace']:
        check('机场共享空域作业窗口许可', z, p['a'], '')
    else:
        checks.append(dict(name='机场共享空域作业窗口许可', used=0, limit=None,
                           unit='', ok=True, applicable=False))
    if p['enforce_winch'] == 1:
        # 质量预算按较重的那个方向检查。
        check('绞盘投送上限', d, p['winch_capacity'], 'kg')
        check('绞盘收回上限', l, p['winch_capacity'], 'kg')
        check('索降改装质量预算', p['q']+max(d, l)+p['hardware_mass']+p['box_mass']+p['mount_mass'],
              effective_q, 'kg')
    else:
        for name in ('绞盘投送上限', '绞盘收回上限', '索降改装质量预算'):
            checks.append(dict(name=name, used=0, limit=None, unit='kg', ok=True, applicable=False))
    valid = all(c['ok'] for c in checks)
    result = dict(parameters=p, d=d, l=l, z=z, valid=valid, checks=checks, extrapolated=extrapolated,
                  effective_payload=effective_q, nominal_payload=reference,
                  profit=formation['bd']*d+formation['bl']*l-p['F']*z,
                  optimal_profit=float(operational_optimal['incremental_profit']),
                  economic_optimal_profit=float(economic_optimal['incremental_profit']),
                  operation_time=duration, shared_airspace_time=duration*p['shared_airspace'],
                  incremental_energy=energy,
                  formation=formation, winch=winch, economics=economics,
                  mode=mode, segments=[], samples=[])
    result['total_gain_vs_solo_noop']=result['profit']+p['energy_price']*formation['baseline_saving']
    if not valid:
        return result
    clock = 0
    segments = []
    def add(key, name, minutes, m0, m1, e0, e1, distance0, distance1):
        nonlocal clock
        if minutes <= 1e-12:
            return
        segments.append(dict(key=key,name=name,start=clock,end=clock+minutes,
                             m0=m0,m1=m1,e0=e0,e1=e1,s0=distance0,s1=distance1))
        clock += minutes
    ac = p['distance_ac']; total = ac+p['distance_cb']
    e_ac=formation['ad']*d; e_c=e_ac+p['e0']*z
    add('ac','A → C · 单机巡航', ac/p['speed']*60,p['q']+d,p['q']+d,0,e_ac,0,ac)
    arrival = clock
    if z and p['operation_mode'] == 1:
        # 三段计时：接近/转换 → 投送 → 地面换货 → 取货 → 退出。固定耗能按时间比例展示。
        legs = [('approach','C · 接近＋机型转换',p['approach_min']+p['transition_min'],p['q']+d,p['q']+d),
                ('drop','C · 投送货物（索降）',wl['tau_drop_per_kg']*d,p['q']+d,p['q']),
                ('exchange','C · 地面换货／重新挂载',p['exchange_fixed_min']+p['exchange_per_kg_min']*(d+l),p['q'],p['q']),
                ('pickup','C · 取回货物',wl['tau_pickup_per_kg']*l,p['q'],p['q']+l),
                ('exit','C · 退出作业区',p['exit_min'],p['q']+l,p['q']+l)]
        leg_total = sum(x[2] for x in legs) or 1.0
        acc = 0.0
        for key, name, minutes, m0, m1 in legs:
            e_lo = e_ac+p['e0']*z*(acc/leg_total)
            e_hi = e_ac+p['e0']*z*((acc+minutes)/leg_total)
            acc += minutes
            add(key, name, minutes, m0, m1, e_lo, e_hi, ac, ac)
    elif z:
        add('lower','C · 放下可拆卸仓',p['t0']/2,p['q']+d,p['q']+d,e_ac,e_ac+p['e0']/2,ac,ac)
        add('unload','C · 卸下目的地货物',p['td']*d,p['q']+d,p['q'],e_ac+p['e0']/2,e_ac+p['e0']/2,ac,ac)
        add('load','C · 装入中转货物',p['tl']*l,p['q'],p['q']+l,e_ac+p['e0']/2,e_ac+p['e0']/2,ac,ac)
        add('raise','C · 收回可拆卸仓',p['t0']/2,p['q']+l,p['q']+l,e_ac+p['e0']/2,e_c,ac,ac)
    add('wait','C · 等待编队',max(0,p['W']-duration),p['q']+l,p['q']+l,e_c,e_c,ac,ac)
    add('join','C · 预留入队时间',p['join_buffer'],p['q']+l,p['q']+l,e_c,e_c,ac,ac)
    departure = clock
    cb_name='C → B · 单飞巡航' if p['formation_role']==0 or p['formation_size']==1 else 'C → B · 编队巡航'
    add('cb',cb_name,p['distance_cb']/p['speed']*60,p['q']+l,p['q']+l,e_c,energy,ac,total)
    result.update(segments=segments,total_time=clock,arrival=arrival,departure=departure)
    def sample(t):
        seg=next((s for s in segments if t < s['end']-1e-10),segments[-1])
        f=max(0,min(1,(t-seg['start'])/(seg['end']-seg['start'])))
        interp=lambda k: seg[k+'0']+(seg[k+'1']-seg[k+'0'])*f
        progress=max(0,min(1,(t-departure)/(clock-departure)))
        return dict(time=t,stage=seg['name'],mass=interp('m'),energy=interp('e'),distance=interp('s'),
                    energy_solo=interp('e')+(formation['al_solo']-formation['al_form'])*l*progress,
                    formation_saved=formation['saving']*progress)
    # Include every phase boundary: zero-duration handling is an instantaneous jump.
    times=sorted(set([0,clock]+[s['start'] for s in segments]+[s['end'] for s in segments]+[clock*i/400 for i in range(401)]))
    result['samples']=[sample(t) for t in times]
    return result


class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT/'static'),**kwargs)
    def json_response(self,obj,status=200):
        payload=json.dumps(obj,ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(payload)))
        self.send_header('Cache-Control','no-store')
        self.end_headers(); self.wfile.write(payload)
    def do_GET(self):
        if self.path=='/api/health':
            return self.json_response({'app':'cable-mvp-simulator','ok':True})
        if self.path=='/api/defaults':
            return self.json_response(dict(DEFAULTS, cargo_profiles=CARGO_PROFILES,
                                           region_defaults=REGION_DEFAULTS))
        if self.path.startswith('/api/export?'):
            try:
                if len(self.path)>32000:
                    raise ValueError('导出参数过长')
                config=json.loads(parse_qs(urlparse(self.path).query)['config'][0])
                result=simulate(config)
                if not result['valid']:
                    raise ValueError('不可行方案没有可导出轨迹')
                out=io.StringIO(newline='')
                writer=csv.writer(out)
                writer.writerow(['时间_min','阶段','任务货物_kg','累计新增能耗_kWh','累计航程_km','相同装卸单飞新增能耗_kWh','CB累计编队节能_kWh'])
                for s in result['samples']:
                    writer.writerow([s['time'],s['stage'],s['mass'],s['energy'],s['distance'],s['energy_solo'],s['formation_saved']])
                payload=out.getvalue().encode('utf-8-sig')
                self.send_response(200)
                self.send_header('Content-Type','text/csv; charset=utf-8')
                self.send_header('Content-Disposition','attachment; filename="drone-simulation.csv"')
                self.send_header('Content-Length',str(len(payload)))
                self.end_headers();self.wfile.write(payload)
                return
            except (ValueError,TypeError,KeyError) as exc:
                return self.json_response({'error':str(exc)},400)
        return super().do_GET()
    def do_POST(self):
        if self.path == '/api/formation-timing':
            origin=self.headers.get('Origin')
            if origin and origin != 'http://'+self.headers.get('Host',''):
                return self.json_response({'error':'不接受跨站请求'},403)
            try:
                n=int(self.headers.get('Content-Length','0'))
                if not 0<n<=32000:
                    raise ValueError('请求大小不合法')
                self.json_response(formation_timing_response(json.loads(self.rfile.read(n))))
            except (ValueError,TypeError,KeyError) as exc:
                self.json_response({'error':str(exc)},400)
            return
        if self.path == '/api/formation-regions':
            # Same-origin loopback app. No CORS and no external API exposure.
            origin=self.headers.get('Origin')
            if origin and origin != 'http://'+self.headers.get('Host',''):
                return self.json_response({'error':'不接受跨站请求'},403)
            try:
                n=int(self.headers.get('Content-Length','0'))
                if not 0<n<=32000:
                    raise ValueError('请求大小不合法')
                self.json_response(formation_region_response(json.loads(self.rfile.read(n))))
            except (ValueError,TypeError,KeyError) as exc:
                self.json_response({'error':str(exc)},400)
            return
        if self.path != '/api/simulate':
            return self.json_response({'error':'接口不存在'},404)
        # Same-origin loopback app. No CORS and no external API exposure.
        origin=self.headers.get('Origin')
        if origin and origin != 'http://'+self.headers.get('Host',''):
            return self.json_response({'error':'不接受跨站请求'},403)
        try:
            n=int(self.headers.get('Content-Length','0'))
            if not 0<n<=32000:
                raise ValueError('请求大小不合法')
            body=json.loads(self.rfile.read(n))
            self.json_response(simulate(body))
        except (ValueError,TypeError,KeyError) as exc:
            self.json_response({'error':str(exc)},400)


if __name__=='__main__':
    port=int(sys.argv[1]) if len(sys.argv)>1 else 8765
    print(f'无人机研究仿真：http://127.0.0.1:{port}',flush=True)
    ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
