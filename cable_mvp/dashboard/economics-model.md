# 货物类型、直飞对照与经济效益

此文件为历史版本，最新分货组公式与直飞口径见 `cargo-model.md`。以下旧统一价格公式不再用于当前页面。

每次仿真选择一个货物类型 `c`。类型给出三个可校准参数：单位收费 `r_c`（单位/kg）、单位货物时效价值 `v_c`（单位/(kg·min)）和装卸成本 `h_c`（单位/kg）。界面提供三组演示初值，用户可以直接改写。

中转方案的服务货量为 `q+d+l`，收费为

`R_transfer = r_c (q+d+l)`。

设 A→C 飞行时间为 `T_AC`，C→B 飞行时间为 `T_CB`，中转作业时间为 `T_op`。把 d 货物视为在 C 到达，把 q+l 货物视为在 B 到达，则时效损失为

`C_time_transfer = v_c [d T_AC + (q+l)(T_AC+T_op+T_CB)]`。

运行成本为

`C_op_transfer = p_e E_transfer + F z + h_c(d+l)`，

其中 `p_e` 是电价，`E_transfer` 是当前能耗模型给出的新增能量，`Fz` 是索降固定成本。中转方案净经济效益为

`Π_transfer = R_transfer − C_time_transfer − C_op_transfer`。

直飞对照固定为 A→B 单飞。其距离 `R_direct`、单位载重能耗 `e_direct` 与固定成本 `F_direct` 都可修改。直飞额外 B 货量 `x` 在 `[0, min(L, Q_direct−q)]` 内选择；若每 kg 的边际贡献 `r_c − p_e e_direct − v_c T_direct` 为正，则取上限，否则取 0。直飞净效益为

`Π_direct = r_c(q+x) − v_c T_direct(q+x) − p_e E_direct − F_direct`，

`E_direct = e_empty R_direct + e_direct(q+x)`。

页面显示 `Π_transfer − Π_direct`。这个差额不是普适结论，因为两种方案的服务网络不同：中转方案还服务 C 点的 d 货物，而直飞基准只服务 B 点。若要做严格同货量比较，应把 d 固定为 0，或另建包含 C 点需求的直飞/地面替代基准。

所有费用、价格和时效参数均是可替换假设；模型不自动读取真实运价，也不把当前结果当作盈利承诺。
