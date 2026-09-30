"""Independent Python scenario reference; uncalibrated, bounded optimization."""
import math

REGION_DEFAULTS=dict(formation_size=3,formation_role=1,eta=.1,propulsion_share=.6,k0=.025,
    energy_price=1,time_value=.015,delay=6.5,coordination_cost=0,distance_max=140,payload_max=35,
    distance_steps=140,payload_steps=70,speed=108,loiter=1,allow_extrapolation=0,payload_limit=20)
REGION_LABELS={0:'均可达 · 单飞不贵',1:'均可达 · 编队更省',2:'仅编队可达（情景）',3:'两者不可达 / 超出范围',4:'仅单飞可达（等待耗电）'}
TIMING_DEFAULTS=dict(distance=70,payload=10,speed=108,k0=.025,slice_minutes=60,
    demand=[3,5,8,10,9,6,4],formation_cap=8,gamma=.96,delta=.5,D=3,capacity_per_slice=40,
    time_value=.015,energy_price=1,loiter=1,coordination_cost=0,allow_wait=1,
    # 逐机资源约束（2026-09-26 新增）：0 一律表示「本情景不施加该约束」。
    battery_kwh=0,max_airborne_min=0,max_wait_slices=0,service_per_slice=0)

def parameters(defaults,input,extra=()):
    if not isinstance(input,dict) or any(k not in defaults and k not in extra for k in input):
        raise ValueError('参数对象包含未知字段')
    p={**defaults,**input}
    for k in defaults:
        v=p[k]
        if k!='demand' and (isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not 0<=v<=10000):
            raise ValueError(k+' 必须为 0–10000 有限数值')
    return p

def region_parameters(input):
    p=parameters(REGION_DEFAULTS,input,('marker',))
    m=p['formation_size'];role=p['formation_role']
    if int(m)!=m or not 1<=m<=8 or role not in (0,1,2,3):raise ValueError('编队规模或角色不合法')
    if p['eta']>1 or p['propulsion_share']>1:raise ValueError('η、χ 须在 0–1')
    if p['loiter'] not in (0,1) or p['allow_extrapolation'] not in (0,1):raise ValueError('开关须为 0 或 1')
    if any(p[k]<=0 for k in ('k0','speed','distance_max','payload_max')):raise ValueError('能耗系数、速度和范围必须大于零')
    for k,limit in [('distance_steps',600),('payload_steps',300)]:
        if int(p[k])!=p[k] or not 1<=p[k]<=limit:raise ValueError('网格数量超出支持范围')
    a=(m-1)/m if role==1 else ((m-1)/m)**2 if role==2 else 0
    d=dict(gamma=1-p['propulsion_share']*p['eta']*a,drag_reduction=p['eta']*a,k1=2*p['k0']/15,
           e_max=(p['k0']+2*p['k0']/15*20)*70,solo_range_max=110,loiter_rate=p['k0']*p['speed']/60)
    d['wait_energy']=d['loiter_rate']*p['delay'] if p['loiter'] else 0
    return d

def region_point(p,d,distance,q):
    rate=p['k0']+d['k1']*q
    within=q>=0 and q<=p['payload_limit'] and distance>=0 and (p['allow_extrapolation'] or distance<=110)
    solo=bool(within and rate*distance<=d['e_max']+1e-9)
    form=bool(within and d['gamma']*rate*distance+d['wait_energy']<=d['e_max']+1e-9)
    advantage=p['energy_price']*((1-d['gamma'])*rate*distance-d['wait_energy'])-p['time_value']*q*p['delay']-p['coordination_cost']
    region=3 if not solo and not form else 2 if not solo else 4 if not form else 1 if advantage>1e-9 else 0
    cap=math.inf if p['allow_extrapolation'] else 110
    valid=0<=q<=p['payload_limit'];den=p['energy_price']*(1-d['gamma'])*rate
    return dict(distance=distance,payload=q,region=region,solo_feasible=solo,formation_feasible=form,advantage=advantage,
        solo_distance=min(cap,d['e_max']/rate) if valid else None,
        formation_distance=min(cap,(d['e_max']-d['wait_energy'])/(d['gamma']*rate)) if valid and d['e_max']>=d['wait_energy'] else None,
        break_even=(p['time_value']*q*p['delay']+p['energy_price']*d['wait_energy']+p['coordination_cost'])/den if valid and den>0 else None,
        extrapolated=distance>110)

def formation_regions(input):
    p=parameters(REGION_DEFAULTS,input,('marker',));d=region_parameters(p)
    distances=[p['distance_max']*i/p['distance_steps'] for i in range(int(p['distance_steps'])+1)]
    payloads=[p['payload_max']*i/p['payload_steps'] for i in range(int(p['payload_steps'])+1)]
    grid=[[region_point(p,d,x,q)['region'] for x in distances] for q in payloads]
    bounds=[region_point(p,d,0,q) for q in payloads]
    counts={s:0 for s in REGION_LABELS.values()};extrapolated=0
    for row in grid:
        for x,cell in zip(distances,row):
            counts[REGION_LABELS[cell]]+=1
            if p['allow_extrapolation'] and x>110 and cell in (0,1,2,4):extrapolated+=1
    total=len(distances)*len(payloads);marker=input.get('marker');point=None
    if marker and all(isinstance(marker.get(k),(int,float)) and math.isfinite(marker[k]) for k in ('distance','payload')):
        point=region_point(p,d,marker['distance'],marker['payload'])
    return dict(parameters=p,derived=d,distances=distances,payloads=payloads,grid=grid,region_labels=REGION_LABELS,marker=point,
        solo_boundary=[b['solo_distance'] for b in bounds],formation_boundary=[b['formation_distance'] for b in bounds],break_even=[b['break_even'] for b in bounds],
        summary=dict(counts=counts,total=total,shares={k:v/total for k,v in counts.items()},chi_eta=p['eta']*p['propulsion_share'],
        extrapolated_beyond_110km=extrapolated,extrapolated_share=extrapolated/total,cell_width_km=p['distance_max']/p['distance_steps'],cell_height_kg=p['payload_max']/p['payload_steps']))

# χ·η 灵敏度：2026-09-26 的文献页码级核查推翻了原先「χη ∈ [0.10, 0.18]」的标定区间
# （那些数字几乎都是二次引用的军机/运输机燃油数据，没有一条是 96 kg 级电动垂起固定翼的一手值）。
# 这里把 χη 当作可扫描的情景参数，回答「结论在哪个区间内还站得住」。
CHI_ETA_DEFAULT_SWEEP = [.02, .04, .06, .08, .10, .12, .15, .18]


def chi_eta_sensitivity(input):
    p = parameters(REGION_DEFAULTS, input, ('marker', 'chi_eta_values', 'ref_payload'))
    values = input.get('chi_eta_values', CHI_ETA_DEFAULT_SWEEP)
    if (not isinstance(values, list) or not 1 <= len(values) <= 40
            or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not 0 <= v <= 1 for v in values)):
        raise ValueError('χη 扫描值须为 0–1 的有限数值，且不超过 40 个')
    if not p['propulsion_share'] > 0:
        raise ValueError('χ 必须大于零，否则无法由 χη 反解 η')
    q = input.get('ref_payload', p['payload_limit'])
    if isinstance(q, bool) or not isinstance(q, (int, float)) or not math.isfinite(q) or not 0 <= q <= p['payload_max']:
        raise ValueError('参考载重超出绘图范围')
    m, role = p['formation_size'], p['formation_role']
    a = (m - 1) / m if role == 1 else ((m - 1) / m) ** 2 if role == 2 else 0
    rows = []
    for chi_eta in values:
        eta = chi_eta / p['propulsion_share']
        gamma = 1 - chi_eta * a
        k1 = 2 * p['k0'] / 15
        e_max = (p['k0'] + k1 * 20) * 70
        rate = p['k0'] + k1 * q
        wait = (p['k0'] * p['speed'] / 60) * p['delay'] if p['loiter'] else 0
        cap = math.inf if p['allow_extrapolation'] else 110
        solo_distance = min(cap, e_max / rate)
        formation_distance = min(cap, (e_max - wait) / (gamma * rate)) if e_max >= wait else None
        denominator = p['energy_price'] * (1 - gamma) * rate
        break_even = ((p['time_value'] * q * p['delay'] + p['energy_price'] * wait + p['coordination_cost']) / denominator
                      if denominator > 0 else None)
        advantage = (p['energy_price'] * ((1 - gamma) * rate * solo_distance - wait)
                     - p['time_value'] * q * p['delay'] - p['coordination_cost'])
        rows.append(dict(chi_eta=chi_eta, eta=eta, gamma=gamma, follower_saving=1 - gamma,
                         propulsion_share=p['propulsion_share'], solo_distance=solo_distance,
                         formation_distance=formation_distance,
                         range_gain_km=None if formation_distance is None else formation_distance - solo_distance,
                         break_even_km=break_even, advantage_at_solo_limit=advantage,
                         formation_cheaper_at_solo_limit=advantage > 1e-9,
                         formation_reaches_further=formation_distance is not None and formation_distance > solo_distance + 1e-12))
    current = p['eta'] * p['propulsion_share']
    cheaper = [r['chi_eta'] for r in rows if r['formation_cheaper_at_solo_limit']]
    further = [r['chi_eta'] for r in rows if r['formation_reaches_further']]
    return dict(parameters=p, derived=region_parameters({k: p[k] for k in REGION_DEFAULTS}), reference_payload=q, rows=rows,
                current_chi_eta=current,
                current=next((r for r in rows if abs(r['chi_eta'] - current) < 1e-12), None),
                summary=dict(sweep=values, max_chi_eta_still_cheaper=max(cheaper) if cheaper else None,
                             max_chi_eta_reaching_further=max(further) if further else None,
                             cheaper_in_sweep=bool(cheaper), further_in_sweep=bool(further),
                             default_chi_eta=current,
                             note='χη 是情景参数而不是本机标定值。核查结论：现有文献包内没有同量级同口径的一手全机节能值，'
                                  '按「诱导阻力占总阻力约 45%（二手）× 巡航占全机能量约 60%（情景）」折算，乐观上界约 8%，'
                                  '故默认取 χη=0.06。range_gain_km 与 advantage_at_solo_limit 都只在两点能量拟合与所列假设下成立。'
                                  '若 cheaper_in_sweep 为 false，说明在参考载重与给定等待时长下，整个扫描区间内编队都不比单飞便宜——'
                                  '这才是本模型的结论，不要把它当成程序错误。'))


def formation_timing(input):
    p=parameters(TIMING_DEFAULTS,input)
    if any(p[k]<=0 for k in ('speed','k0','slice_minutes','distance')):raise ValueError('速度、能耗系数、片长和航程必须大于零')
    cap=p['formation_cap']
    if int(cap)!=cap or not 1<=cap<=8:raise ValueError('编队上限须为 1–8 整数')
    if not 0<p['gamma']<=1 or not 0<p['delta']<=p['D']:raise ValueError('γ 或间距不合法')
    if p['loiter'] not in (0,1) or p['allow_wait'] not in (0,1):raise ValueError('开关须为 0 或 1')
    for k in ('max_wait_slices','service_per_slice'):
        if isinstance(p[k],bool) or int(p[k])!=p[k] or not 0<=p[k]<=10000:raise ValueError(k+' 须为 0–10000 的整数（0 表示不约束）')
    if p['max_wait_slices']>48:raise ValueError('累计等待上限不能超过 48 片（本原型的时域上限）')
    if p['battery_kwh']<0 or p['max_airborne_min']<0:raise ValueError('电池容量与空中时长上限不能为负')
    demand=p['demand']
    if not isinstance(demand,list) or not 1<=len(demand)<=48 or any(isinstance(n,bool) or not isinstance(n,(int,float)) or not math.isfinite(n) or int(n)!=n or n<0 for n in demand):raise ValueError('需求须为 1–48 个非负整数')
    demand=list(map(int,demand));N=sum(demand);T=len(demand)
    if N>240:raise ValueError('交互原型支持总计至多 240 架次')
    k1=2*p['k0']/15;eSolo=(p['k0']+k1*p['payload'])*p['distance'];eFollower=p['gamma']*eSolo
    loiterRate=p['k0']*p['speed']/60;waitEnergy=loiterRate*p['slice_minutes'] if p['loiter'] else 0
    holdCost=p['time_value']*p['payload']*p['slice_minutes']+p['energy_price']*waitEnergy
    # —— 逐机资源：电池、累计空中等待时长、机场服务率 ——
    # 「每架最多等 W 片」在 FIFO 下等价于纯聚合约束 carried_t ≤ 最近 W 片到达数之和，
    # 不需要把「机龄」放进动态规划的状态。
    flightMinutes=p['distance']/p['speed']*60
    cruiseWorstCase=eSolo                        # 领航不打折，是队内能耗上界
    if p['battery_kwh']>0 and waitEnergy>1e-15:
        batteryCap=math.floor((p['battery_kwh']-cruiseWorstCase)/waitEnergy+1e-12)
    else:
        batteryCap=math.inf
    airborneCap=(math.floor((p['max_airborne_min']-flightMinutes)/p['slice_minutes']+1e-12)
                 if p['max_airborne_min']>0 else math.inf)
    userWaitCap=p['max_wait_slices'] if p['max_wait_slices']>0 else math.inf
    waitCapSlices=min(batteryCap,airborneCap,userWaitCap)
    serviceCap=p['service_per_slice'] if p['service_per_slice']>0 else math.inf
    prefix=[];running=0
    for n in demand:
        running+=n;prefix.append(running)
    def window_arrivals(t,W):
        if W==math.inf:return math.inf
        if W<=0:return 0
        return prefix[t]-(prefix[t-W] if t-W>=0 else 0)
    blockers=[]
    if batteryCap<0:blockers.append(f"电池 {p['battery_kwh']} kWh 不足以完成一次含等待的 {p['distance']} km 架次（单机巡航需 {cruiseWorstCase:.3f} kWh）")
    if p['max_airborne_min']>0 and airborneCap<0:blockers.append(f"累计空中时长上限 {p['max_airborne_min']} min 小于单程飞行时间 {flightMinutes:.1f} min")
    if serviceCap==0 and N>0:blockers.append('每片服务能力为 0，无法起飞任何架次')
    def launches(cap):
        table=[{} for _ in range(N+1)];table[0][0]=dict(cost=0,parts=[])
        for n in range(1,N+1):
            for size in range(1,min(int(cap),n)+1):
                cost=p['energy_price']*(eSolo+(size-1)*eFollower)+(p['coordination_cost'] if size>1 else 0)
                for groups,prev in table[n-size].items():
                    g=groups+1
                    if n*p['delta']+g*(p['D']-p['delta'])>p['capacity_per_slice']+1e-9:continue
                    old=table[n].get(g);value=prev['cost']+cost
                    if old is None or value<old['cost']-1e-12:table[n][g]=dict(cost=value,parts=prev['parts']+[size])
        result=[]
        for row in table:
            best=None
            for v in row.values():
                if best is None or v['cost']<best['cost']-1e-12:best=v
            result.append(best)
        return result
    def solve(launch,priced,caps=True):
        if blockers:return dict(status='resource_infeasible',cost=None,wait_sortie_slices=None,rows=[],blockers=blockers)
        useWaitCap=waitCapSlices if caps else math.inf
        useService=serviceCap if caps else math.inf
        states={0:dict(cost=0,waitUnits=0,rows=[])}
        for t in range(T):
            nxt={}
            capCount=window_arrivals(t,useWaitCap)
            for carried,prev in states.items():
                total=carried+demand[t]
                maxFlies=total if useService==math.inf else min(total,int(useService))
                for flies in range(maxFlies,-1,-1):
                    held=total-flies
                    if held and (not p['allow_wait'] or t==T-1):continue
                    if held>capCount+1e-9:continue          # 逐机等待上限：聚合等价形式
                    choice=launch[flies]
                    if choice is None:continue
                    value=prev['cost']+choice['cost']+(held*holdCost if priced else 0);waitUnits=prev['waitUnits']+held
                    old=nxt.get(held)
                    if old is not None and value>old['cost']-1e-12 and not (abs(value-old['cost'])<=1e-12 and waitUnits<old['waitUnits']):continue
                    parts=choice['parts']
                    row=dict(slice=t+1,ready=demand[t],carried=carried,departed=flies,held=held,parts=parts,solo=parts.count(1),
                        occupancy=sum(p['D']+(m-1)*p['delta'] for m in parts),cruise_energy=sum(eSolo+(m-1)*eFollower for m in parts),
                        wait_energy=held*waitEnergy,time_cost=held*p['time_value']*p['payload']*p['slice_minutes'],
                        charged_wait_cost=held*holdCost if priced else 0,departure_cost=choice['cost'],
                        wait_cap_slices=None if useWaitCap==math.inf else useWaitCap,
                        wait_cap_count=None if capCount==math.inf else capCount,
                        service_cap=None if useService==math.inf else useService,
                        capped_by_wait=bool(useWaitCap!=math.inf and held>0 and held>=capCount-1e-9),
                        capped_by_service=bool(useService!=math.inf and flies>=useService and total>flies))
                    nxt[held]=dict(cost=value,waitUnits=waitUnits,rows=prev['rows']+[row])
            states=nxt
        r=states.get(0)
        return dict(status='optimal',cost=r['cost'],wait_sortie_slices=r['waitUnits'],rows=r['rows']) if r else dict(status='infeasible',cost=None,wait_sortie_slices=None,rows=[])
    def fifo_max_wait(rows):
        queue=[];longest=0
        for row in rows:
            queue.extend([row['slice']-1]*row['ready'])
            for _ in range(row['departed']):
                if not queue:return dict(max_wait_slices=None,error='FIFO 队列为空却仍在起飞')
                arrival=queue.pop(0)
                longest=max(longest,row['slice']-1-arrival)
        return dict(max_wait_slices=longest,remaining=len(queue))
    soloLaunch=launches(1);formLaunch=launches(cap)
    scenarios=dict(solo_only=solve(soloLaunch,True),formation_free_wait=solve(formLaunch,False),formation_with_wait=solve(formLaunch,True))
    costs={k:v['cost'] for k,v in scenarios.items()}
    def saving(a,b):return a-b if a is not None and b is not None else None
    ideal=saving(costs['solo_only'],costs['formation_free_wait']);timed=saving(costs['solo_only'],costs['formation_with_wait'])
    rows=scenarios['formation_with_wait']['rows'];formations=[[m for m in r['parts'] if m>1] for r in rows];formed=sum(map(sum,formations))
    fifo=fifo_max_wait(rows)
    active=[]
    if waitCapSlices!=math.inf:
        active.append('电池' if batteryCap==waitCapSlices else '空中时长' if airborneCap==waitCapSlices else '累计等待上限')
    if serviceCap!=math.inf:active.append('机场服务率')
    capsActive=waitCapSlices!=math.inf or serviceCap!=math.inf
    effect=None
    if capsActive and not blockers:
        free=solve(formLaunch,True,False)
        changed=(free['cost'] is None or costs['formation_with_wait'] is None
                 or abs(free['cost']-costs['formation_with_wait'])>1e-9)
        effect=dict(cost_without_resource_caps=free['cost'],cost_with_resource_caps=costs['formation_with_wait'],
            wait_sortie_slices_without=free['wait_sortie_slices'],wait_sortie_slices_with=scenarios['formation_with_wait']['wait_sortie_slices'],
            changes_optimum=bool(free['cost'] is not None and costs['formation_with_wait'] is not None and abs(free['cost']-costs['formation_with_wait'])>1e-9),
            makes_infeasible=bool(free['cost'] is not None and costs['formation_with_wait'] is None),
            binding=bool(changed))
    def opt(v):return None if v==math.inf else v
    return dict(parameters={**p,'k1':k1,'e_solo_kwh':eSolo,'e_follower_kwh':eFollower,'loiter_rate_kwh_per_min':loiterRate,'hold_cost_per_sortie':holdCost},
        solver=dict(method='bounded_dynamic_programming',status=scenarios['formation_with_wait']['status'],max_total_sorties=240,max_slices=48),
        resources=dict(flight_minutes_per_sortie=flightMinutes,cruise_energy_worst_case_kwh=cruiseWorstCase,
            wait_energy_per_slice_kwh=waitEnergy,
            battery_kwh=p['battery_kwh'] or None,battery_wait_cap_slices=opt(batteryCap),
            airborne_min_cap=p['max_airborne_min'] or None,airborne_wait_cap_slices=opt(airborneCap),
            user_wait_cap_slices=p['max_wait_slices'] or None,
            applied_wait_cap_slices=opt(waitCapSlices),
            service_per_slice=opt(serviceCap),
            active_constraints=active,blockers=blockers,resource_cap_effect=effect,
            realized_max_wait_slices=fifo['max_wait_slices'],
            wait_cap_respected=None if fifo['max_wait_slices'] is None else (waitCapSlices==math.inf or fifo['max_wait_slices']<=waitCapSlices),
            note='逐机电池用「领航不打折」的单机巡航能耗作上界，因此对跟随机偏保守。'
                 '「每架最多等 W 片」在 FIFO 下等价于聚合约束 carried_t ≤ 最近 W 片到达数之和，'
                 '程序另外用 FIFO 队列独立复核实际最长等待。三个情景共用同一套物理约束，只有等待是否计费不同。'
                 'resource_cap_effect 是与「不加任何逐机资源上限」的同题对照：binding 为 false 时说明这些约束在本情景下没有改变结果。'),
        scenarios=scenarios,scenario_cost=costs,saving_ideal=ideal,saving_timed=timed,
        saving_shrinkage=1-timed/ideal if ideal is not None and timed is not None and ideal>1e-12 else None,
        plan=dict(rows=rows,formations_by_slice=formations,formed_sorties=formed,total_sorties=N,
            formation_share=formed/N if N and rows else 0,realized_max_wait_slices=fifo['max_wait_slices']))
