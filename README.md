# 低空物流 · 无人机调度交互原型（drone-logistics-mvp）

低空物流无人机的交互式调度与经济模型原型：单机/编队接驳、索降装卸作业、时间片调度、能耗与定价机制试验。

**在线演示**：https://mannenzakura.cn/drone-logistics/ （含交互控制台、参数面板与时间序列导出）

## 目录

- `airport_mvp/` — Three.js 最小机场可视化原型。本地运行：`python server.py` 后打开 http://127.0.0.1:8770/ ；首次需 `npm install` 安装本地 Three.js。
- `cable_mvp/` — 编队/索降调度仪表盘与研究脚本：
  - `dashboard/` 交互模型文档（机场外独独立卸货区、分货运分任务经济模型、编队减阻、多目的地 FIFO 等）
  - `winch_studies.py` / `formation_studies.py` / `solve.py` 等 Python 参考实现与验证脚本

## 说明

研究原型：参数为公开资料假设值，未做实机标定，仅用于机制试验与可视化演示，不代表可执行飞行方案。

本仓库持续更新——模型迭代、看板功能与验证脚本会随研究推进陆续提交。
