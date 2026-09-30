"""索降作业三段计时与「可卸 / 可换 / 盈利」可行域的 Python 参考实现。

与 public/drone-logistics/winch.mjs 逐式对应；公开数据锚点与情景假设严格分开。
公式、来源与适用边界见 winch-model.md。本模块不依赖第三方包。
"""
import math

WINCH_DEFAULTS = dict(
    # —— 公开数据锚点（不等于本机实测标定）——
    reference_payload=20, winch_capacity=5, hardware_mass=1.764,
    drop_ref_height=20, drop_ref_seconds_per_kg=20.5, drop_height_slope=.0175,
    pickup_ref_seconds_per_kg=20.5, pickup_height_slope=.0175,
    # —— 情景假设（无公开数据支撑）——
    q=10, D=5, L=5, B=5, box_mass=0, mount_mass=0, height=20,
    approach_min=0, transition_min=0, exit_min=0, exchange_fixed_min=0, exchange_per_kg_min=0,
    W=6, H=6, a=1, shared_airspace=1, cd=4, cl=3, F=5, e0=.1, ed=.04, el=.08, G=.65,
    x_axis='window', y_axis='height', x_steps=36, y_steps=36, x_max=0, y_max=0,
)
WINCH_LABELS = {0: '双向作业 · 净收益为正', 1: '双向作业 · 净收益非正',
                2: '仅卸货 · 净收益为正', 3: '仅卸货 · 净收益非正', 4: '不作业 / 不可行'}
AXIS_ORDER = ['window', 'height', 'equipment_mass', 'exchange_per_kg', 'exchange_fixed',
              'energy', 'cd', 'cl', 'q', 'demand', 'winch']


def _axis(key):
    if key == 'window':
        return dict(label='可用作业窗口 W_cap', unit='min',
                    read=lambda p: min(p['W'], p['H']) if p['shared_airspace'] else p['W'],
                    write=lambda p, v: {**p, 'W': v, 'H': v} if p['shared_airspace'] else {**p, 'W': v})
    if key == 'height':
        return dict(label='索降作业高度 h', unit='m', read=lambda p: p['height'],
                    write=lambda p, v: {**p, 'height': v})
    if key == 'equipment_mass':
        return dict(label='新增仓体与安装件质量', unit='kg',
                    read=lambda p: p['box_mass'] + p['mount_mass'],
                    write=lambda p, v: {**p, 'box_mass': v, 'mount_mass': 0})
    if key == 'exchange_per_kg':
        return dict(label='地面换货每 kg 时间', unit='min/kg', read=lambda p: p['exchange_per_kg_min'],
                    write=lambda p, v: {**p, 'exchange_per_kg_min': v})
    if key == 'exchange_fixed':
        return dict(label='地面换货固定时间', unit='min', read=lambda p: p['exchange_fixed_min'],
                    write=lambda p, v: {**p, 'exchange_fixed_min': v})
    if key == 'energy':
        return dict(label='装卸新增可用电量 G', unit='kWh', read=lambda p: p['G'],
                    write=lambda p, v: {**p, 'G': v})
    if key == 'cd':
        return dict(label='卸货每 kg 净贡献 c_d', unit='单位/kg', read=lambda p: p['cd'],
                    write=lambda p, v: {**p, 'cd': v})
    if key == 'cl':
        return dict(label='装货每 kg 净贡献 c_l', unit='单位/kg', read=lambda p: p['cl'],
                    write=lambda p, v: {**p, 'cl': v})
    if key == 'q':
        return dict(label='固定 A→B 货物 q', unit='kg', read=lambda p: p['q'],
                    write=lambda p, v: {**p, 'q': v})
    if key == 'demand':
        return dict(label='两方向需求上限 D = L', unit='kg', read=lambda p: min(p['D'], p['L']),
                    write=lambda p, v: {**p, 'D': v, 'L': v})
    if key == 'winch':
        return dict(label='绞盘投送/收回上限', unit='kg', read=lambda p: p['winch_capacity'],
                    write=lambda p, v: {**p, 'winch_capacity': v})
    raise ValueError('未知扫描轴')


def winch_parameters(input):
    if not isinstance(input, dict):
        raise ValueError('参数必须是对象')
    for k in input:
        if k not in WINCH_DEFAULTS:
            raise ValueError('未知参数：' + str(k))
    p = {**WINCH_DEFAULTS, **input}
    for k in WINCH_DEFAULTS:
        if k in ('x_axis', 'y_axis'):
            continue
        v = p[k]
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not 0 <= v <= 10000:
            raise ValueError(str(k) + ' 必须为 0–10000 的有限数值')
    for k in ('x_axis', 'y_axis'):
        if p[k] not in AXIS_ORDER:
            raise ValueError(k + ' 必须是可选扫描轴之一')
    if p['x_axis'] == p['y_axis']:
        raise ValueError('横纵轴不能是同一条扫描轴')
    for k in ('x_steps', 'y_steps'):
        if int(p[k]) != p[k] or not 4 <= p[k] <= 120:
            raise ValueError('扫描格数须为 4–120 的整数')
    for k in ('shared_airspace', 'a'):
        if p[k] not in (0, 1):
            raise ValueError(k + ' 须为 0 或 1')
    if p['reference_payload'] <= 0:
        raise ValueError('参考性能点必须大于零')
    if p['q'] > p['reference_payload']:
        raise ValueError('固定货物已超过参考性能点')
    if p['drop_ref_height'] < 0 or p['drop_height_slope'] < 0 or p['pickup_height_slope'] < 0:
        raise ValueError('高度参数不能为负')
    return p


def _height_law(slope_per_kg, ref_seconds_per_kg, ref_height):
    intercept = ref_seconds_per_kg / 60 - slope_per_kg * ref_height

    def raw(h):
        return intercept + slope_per_kg * h
    return dict(slopeByHeight=slope_per_kg, interceptMin=intercept, raw=raw,
                at=lambda h: max(0.0, raw(h)), clampedAt=lambda h: raw(h) < 0)


def winch_derived(input=None):
    p = {**WINCH_DEFAULTS, **(input or {})}
    drop = _height_law(p['drop_height_slope'], p['drop_ref_seconds_per_kg'], p['drop_ref_height'])
    pickup = _height_law(p['pickup_height_slope'], p['pickup_ref_seconds_per_kg'], p['drop_ref_height'])
    tau_d = drop['at'](p['height'])
    tau_l = pickup['at'](p['height'])
    t_fixed = p['approach_min'] + p['transition_min'] + p['exit_min'] + p['exchange_fixed_min']
    mass_budget = p['reference_payload'] - p['q'] - p['hardware_mass'] - p['box_mass'] - p['mount_mass']
    cap_mass = max(0.0, mass_budget)
    cap_d = max(0.0, min(p['winch_capacity'], p['D'], p['B'], cap_mass))
    cap_l = max(0.0, min(p['winch_capacity'], p['L'], p['B'], cap_mass))
    window_cap = min(p['W'], p['H']) if p['shared_airspace'] else p['W']
    return dict(tau_drop_per_kg=tau_d, tau_pickup_per_kg=tau_l,
                tau_clamped=bool(drop['clampedAt'](p['height']) or pickup['clampedAt'](p['height'])),
                drop_intercept_min_per_kg=drop['interceptMin'],
                drop_slope_min_per_kg_m=p['drop_height_slope'],
                pickup_intercept_min_per_kg=pickup['interceptMin'],
                pickup_slope_min_per_kg_m=p['pickup_height_slope'],
                reference_height=p['drop_ref_height'],
                t_fixed_min=t_fixed, mass_budget=mass_budget, cap_d=cap_d, cap_l=cap_l,
                window_cap=window_cap, window_free=window_cap - t_fixed, energy_free=p['G'] - p['e0'],
                time_per_kg_d=tau_d + p['exchange_per_kg_min'],
                time_per_kg_l=tau_l + p['exchange_per_kg_min'],
                height_coeff_min_per_kg=p['drop_height_slope'] + p['pickup_height_slope'])


def _best_active(p, d):
    if d['cap_d'] <= 0 and d['cap_l'] <= 0:
        return None
    rows = [(-1, 0, 0), (0, -1, 0), (1, 0, d['cap_d']), (0, 1, d['cap_l']),
            (d['time_per_kg_d'], d['time_per_kg_l'], d['window_free']),
            (p['ed'], p['el'], d['energy_free'])]
    best = None

    def consider(x, y):
        nonlocal best
        if not (x >= -1e-12 and y >= -1e-12):
            return
        for a, b, c in rows:
            if a * x + b * y > c + 1e-9:
                return
        if x + y <= 1e-12:
            return
        value = p['cd'] * x + p['cl'] * y
        if best is None or value > best['value'] + 1e-12:
            best = dict(d=x, l=y, value=value, time=0.0, energy=0.0)

    for i in range(len(rows)):
        for j in range(i + 1, len(rows)):
            a, b, c = rows[i]
            u, v, w = rows[j]
            det = a * v - b * u
            if abs(det) < 1e-15:
                continue
            consider((c * v - b * w) / det, (a * w - c * u) / det)
    consider(d['cap_d'], 0.0)
    consider(0.0, d['cap_l'])
    consider(d['cap_d'], d['cap_l'])
    if best is None:
        return None
    best['time'] = d['time_per_kg_d'] * best['d'] + d['time_per_kg_l'] * best['l']
    best['energy'] = p['ed'] * best['d'] + p['el'] * best['l']
    best['profit'] = best['value'] - p['F']
    return best


def _max_drop(p, d):
    lim = [d['cap_d']]
    if d['time_per_kg_d'] > 1e-15:
        lim.append(d['window_free'] / d['time_per_kg_d'])
    if p['ed'] > 1e-15:
        lim.append(d['energy_free'] / p['ed'])
    return max(0.0, min(lim))


def _max_load(p, d):
    lim = [d['cap_l']]
    if d['time_per_kg_l'] > 1e-15:
        lim.append(d['window_free'] / d['time_per_kg_l'])
    if p['el'] > 1e-15:
        lim.append(d['energy_free'] / p['el'])
    return max(0.0, min(lim))


def _finite(v):
    return v if isinstance(v, (int, float)) and math.isfinite(v) else None


def winch_point(p, d):
    active = _best_active(p, d)
    idle = active is None or active['profit'] <= 1e-12
    chosen = dict(d=0.0, l=0.0, value=0.0, profit=0.0, time=0.0, energy=0.0) if idle else active
    both = (not idle) and chosen['l'] > 1e-12
    cls = 4 if idle else (0 if chosen['profit'] > 0 else 1) if both else (2 if chosen['profit'] > 0 else 3)
    td, tl = d['time_per_kg_d'], d['time_per_kg_l']
    exchange_cap = min(d['cap_d'], d['cap_l'],
                       d['window_free'] / (td + tl) if td + tl > 1e-15 else math.inf,
                       d['energy_free'] / (p['ed'] + p['el']) if p['ed'] + p['el'] > 1e-15 else math.inf)
    return dict(cls=cls, label=WINCH_LABELS[cls],
                optimum=dict(d=chosen['d'], l=chosen['l'], profit=chosen['profit'],
                             time_min=chosen['time'], energy_kwh=chosen['energy'], z=0 if idle else 1),
                best_active=active,
                unload_feasible=_max_drop(p, d) > 1e-12, load_feasible=_max_load(p, d) > 1e-12,
                exchange_feasible=max(0.0, exchange_cap) > 1e-12,
                exchange_capacity=_finite(max(0.0, exchange_cap)),
                max_d=_finite(_max_drop(p, d)), max_l=_finite(_max_load(p, d)),
                window_free=d['window_free'], energy_free=d['energy_free'],
                caps=dict(d=d['cap_d'], l=d['cap_l']), mass_budget=d['mass_budget'],
                tau_clamped=d['tau_clamped'])


def _scan_down(f, lo, hi, steps=80):
    if not f(lo):
        return dict(value=None, status='lower_already_false')
    if f(hi):
        return dict(value=hi, status='beyond_upper')
    a, b = lo, hi
    for _ in range(steps):
        m = (a + b) / 2
        if f(m):
            a = m
        else:
            b = m
    return dict(value=a, status='found')


def _scan_up(f, lo, hi, steps=80):
    if f(lo):
        return dict(value=lo, status='lower_already_true')
    if not f(hi):
        return dict(value=None, status='beyond_upper')
    a, b = lo, hi
    for _ in range(steps):
        m = (a + b) / 2
        if f(m):
            b = m
        else:
            a = m
    return dict(value=b, status='found')


def _axis_upper(key, p, d):
    full = d['time_per_kg_d'] * d['cap_d'] + d['time_per_kg_l'] * d['cap_l']
    if key == 'window':
        return max(2 * (d['t_fixed_min'] + full), 2 * d['window_cap'], 1)
    if key == 'height':
        return 60
    if key == 'equipment_mass':
        return max(1, d['mass_budget'] + max(p['box_mass'] + p['mount_mass'], 0) + 2)
    if key == 'exchange_per_kg':
        return max(.4, 2 * p['exchange_per_kg_min'])
    if key == 'exchange_fixed':
        return max(4, 2 * d['t_fixed_min'] + full)
    if key == 'energy':
        return max(1, 3 * p['G'])
    if key == 'cd':
        return max(6, 3 * p['cd'])
    if key == 'cl':
        return max(6, 3 * p['cl'])
    if key == 'q':
        return max(1, p['reference_payload'])
    if key == 'demand':
        return max(4, 2 * max(p['D'], p['L']))
    if key == 'winch':
        return max(4, 2 * p['winch_capacity'])
    raise ValueError('未知扫描轴')


def winch_thresholds(p, d):
    full_energy = p['ed'] * d['cap_d'] + p['el'] * d['cap_l']
    up = lambda key: _axis_upper(key, p, d)
    write = lambda key, v: _axis(key)['write'](p, v)

    def feasible(params):
        return _best_active(params, winch_derived(params)) is not None

    def profitable(params):
        a = _best_active(params, winch_derived(params))
        return bool(a) and a['profit'] > 0

    def full_at(params):
        dd = winch_derived(params)
        if not (dd['cap_d'] > 0 and dd['cap_l'] > 0):
            return False
        return (dd['time_per_kg_d'] * dd['cap_d'] + dd['time_per_kg_l'] * dd['cap_l'] <= dd['window_free'] + 1e-9
                and params['ed'] * dd['cap_d'] + params['el'] * dd['cap_l'] <= dd['energy_free'] + 1e-9)

    runnable = lambda key: (lambda v: feasible(write(key, v)))
    prof = lambda key: (lambda v: profitable(write(key, v)))
    full = lambda key: (lambda v: full_at(write(key, v)))
    if d['cap_d'] <= 0 or d['cap_l'] <= 0:
        limited = '绞盘 / 货仓 / 质量预算'
    elif p['ed'] * d['cap_d'] + p['el'] * d['cap_l'] > d['energy_free'] + 1e-9:
        limited = '装卸新增电量预算 G'
    elif d['time_per_kg_d'] * d['cap_d'] + d['time_per_kg_l'] * d['cap_l'] > d['window_free'] + 1e-9:
        limited = '可用作业窗口'
    else:
        limited = None
    return dict(
        fixed_stage_total_min=d['t_fixed_min'],
        window_min_active=dict(value=d['t_fixed_min'], status='found'),
        window_full_capability=_scan_up(full('window'), 0, up('window')),
        window_break_even=_scan_up(prof('window'), 0, up('window')),
        height_full_capability=_scan_down(full('height'), 0, 400),
        height_break_even=_scan_down(prof('height'), 0, 400),
        equipment_mass_max=_scan_down(lambda v: winch_derived(write('equipment_mass', v))['cap_d'] > 0,
                                      0, up('equipment_mass')),
        exchange_per_kg_max=_scan_down(runnable('exchange_per_kg'), 0, 4),
        exchange_fixed_max=_scan_down(runnable('exchange_fixed'), 0, up('exchange_fixed')),
        height_max_runnable=_scan_down(runnable('height'), 0, 400),
        energy_min_active=dict(value=p['e0'], status='found'),
        energy_full_capability=dict(value=p['e0'] + full_energy, status='found'),
        energy_break_even=_scan_up(prof('energy'), 0, up('energy')),
        demand_max_runnable=_scan_down(runnable('demand'), 0, up('demand')),
        q_max_runnable=_scan_down(runnable('q'), 0, up('q')),
        exchange_per_kg_full_capability=_scan_down(full('exchange_per_kg'), 0, 4),
        exchange_fixed_full_capability=_scan_down(full('exchange_fixed'), 0, up('exchange_fixed')),
        equipment_mass_full_capability=_scan_down(full('equipment_mass'), 0, up('equipment_mass')),
        demand_full_capability=_scan_down(full('demand'), 0, up('demand')),
        q_full_capability=_scan_down(full('q'), 0, up('q')),
        caps=dict(d=d['cap_d'], l=d['cap_l']),
        full_time_min=d['time_per_kg_d'] * d['cap_d'] + d['time_per_kg_l'] * d['cap_l'],
        full_energy_kwh=full_energy, full_capability_limited_by=limited,
        harness_note='窗口阈值只说明所列离散模型可行，不证明空域、电量与机械接口在实际任务中可用。status 为 beyond_upper 表示真实阈值在搜索区间之外。',
        cap_positive=d['cap_d'] > 0 and d['cap_l'] > 0)


def winch_study(input=None):
    p = winch_parameters({} if input is None else input)
    d = winch_derived(p)
    x_key, y_key = p['x_axis'], p['y_axis']
    x_max = p['x_max'] if p['x_max'] > 0 else _axis_upper(x_key, p, d)
    y_max = p['y_max'] if p['y_max'] > 0 else _axis_upper(y_key, p, d)
    values = lambda key, mx, steps: [mx * i / steps for i in range(int(steps) + 1)]
    xs = values(x_key, x_max, p['x_steps'])
    ys = values(y_key, y_max, p['y_steps'])
    grid, detail = [], []
    for y in ys:
        row_base = _axis(y_key)['write'](p, y)
        row, row_detail = [], []
        for x in xs:
            params = _axis(x_key)['write'](row_base, x)
            dd = winch_derived(params)
            point = winch_point(params, dd)
            row.append(point['cls'])
            row_detail.append(dict(cls=point['cls'], d=point['optimum']['d'], l=point['optimum']['l'],
                                   profit=point['optimum']['profit'], exchange=point['exchange_feasible'],
                                   unload=point['unload_feasible'], cap_d=dd['cap_d'], cap_l=dd['cap_l'],
                                   full=bool(dd['cap_d'] > 0 and dd['cap_l'] > 0
                                             and dd['time_per_kg_d'] * dd['cap_d'] + dd['time_per_kg_l'] * dd['cap_l'] <= dd['window_free'] + 1e-9
                                             and params['ed'] * dd['cap_d'] + params['el'] * dd['cap_l'] <= dd['energy_free'] + 1e-9)))
        grid.append(row)
        detail.append(row_detail)
    counts = {s: 0 for s in WINCH_LABELS.values()}
    unload_count = exchange_count = profitable_count = full_count = 0
    for row in detail:
        for cell in row:
            counts[WINCH_LABELS[cell['cls']]] += 1
            if cell['unload']:
                unload_count += 1
            if cell['exchange']:
                exchange_count += 1
            if cell['full']:
                full_count += 1
            if cell['profit'] > 1e-12:
                profitable_count += 1
    total = len(xs) * len(ys)
    return dict(
        parameters=p, derived=d,
        labels=WINCH_LABELS,
        axes=dict(x=dict(key=x_key, label=_axis(x_key)['label'], unit=_axis(x_key)['unit'], values=xs, max=x_max),
                  y=dict(key=y_key, label=_axis(y_key)['label'], unit=_axis(y_key)['unit'], values=ys, max=y_max)),
        grid=grid, detail=detail, point=winch_point(p, d), thresholds=winch_thresholds(p, d),
        summary=dict(counts=counts, total=total, shares={k: v / total for k, v in counts.items()},
                     unload_share=unload_count / total, exchange_share=exchange_count / total,
                     profitable_share=profitable_count / total, full_capability_share=full_count / total,
                     cell_x=x_max / p['x_steps'], cell_y=y_max / p['y_steps'],
                     t_fixed_min=d['t_fixed_min'], cap_d=d['cap_d'], cap_l=d['cap_l'], mass_budget=d['mass_budget'],
                     tau_drop_per_kg_min=d['tau_drop_per_kg'], tau_pickup_per_kg_min=d['tau_pickup_per_kg'],
                     height_intercept_min_per_kg=d['drop_intercept_min_per_kg'],
                     note='分区按所列离散模型逐格判定；比例是绘图范围内的采样占比，不是实际需求概率。任意小量的 d>0 几乎总是可行，所以「可卸/可换」占比会远大于「满额作业」占比；请以满额阈值与 cap_d/cap_l 为准。'))


def winch_point_at(input=None):
    p = winch_parameters({} if input is None else input)
    d = winch_derived(p)
    return dict(parameters=p, derived=d, point=winch_point(p, d), thresholds=winch_thresholds(p, d))
