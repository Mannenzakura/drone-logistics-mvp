# -*- coding: utf-8 -*-
"""
Codex 工作目录 -> GitHub 仓库 同步脚本
用法: python sync_github.py ["commit 说明（可省略，默认自动生成）"]
排除项（永不进入公开仓库）: 论文翻译 / low_altitude_logistics(导师科研) /
GLM-Codex交接与项目状态文档 / node_modules / __pycache__ / *.log
"""
import os, sys, shutil, subprocess, filecmp

SRC = r"C:\Users\35499\Documents\Codex\2026-09-07\referenced-chatgpt-conversation-this-is-an\outputs"
DST = r"C:\Users\35499\Documents\drone-logistics-mvp"

EXCLUDE_DIRS = {"node_modules", "__pycache__", "low_altitude_logistics", ".git"}
EXCLUDE_FILES = {
    "Cable_or_Locker_中文全文翻译.md",
    "GLM-Codex交接后进展.md",
    "handoff-audit.md",
    "handoff-audit-2026-09-26.md",
    "项目状态_20260926快照.md",
}
EXCLUDE_SUFFIX = (".log", ".pyc")
# 仓库根目录里属于仓库自身、不从 SRC 同步的文件
KEEP_IN_DST = {".gitignore", "README.md", "sync_github.py"}

def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", **kw)
    return r.stdout.strip() + r.stderr.strip()

def rel_files(root):
    out = []
    for base, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for f in files:
            if f in EXCLUDE_FILES or f.endswith(EXCLUDE_SUFFIX):
                continue
            out.append(os.path.relpath(os.path.join(base, f), root))
    return set(out)

def main():
    src_files = rel_files(SRC)
    dst_files = {p for p in rel_files(DST) if os.path.basename(p) not in KEEP_IN_DST
                 and not (p in ("airport_mvp", "cable_mvp") )}  # rel paths only

    # 目标里允许的 = 源里存在的（KEEP 文件除外）
    copied, deleted = [], []
    for p in sorted(src_files):
        s, d = os.path.join(SRC, p), os.path.join(DST, p)
        os.makedirs(os.path.dirname(d), exist_ok=True)
        if not os.path.exists(d) or not filecmp.cmp(s, d, shallow=False):
            shutil.copy2(s, d)
            copied.append(p)
    for p in sorted(rel_files(DST)):
        if os.path.basename(p) in KEEP_IN_DST or p in src_files:
            continue
        os.remove(os.path.join(DST, p))
        deleted.append(p)

    print(f"复制 {len(copied)} 个文件, 删除 {len(deleted)} 个")
    for p in copied[:8]: print("  +", p)
    for p in deleted[:8]: print("  -", p)

    status = run(["git", "-C", DST, "status", "--porcelain"])
    if not status:
        print("无变更，仓库已是最新")
        return
    msg = sys.argv[1] if len(sys.argv) > 1 else f"同步更新：{len(copied)} 个文件变更"
    print(run(["git", "-C", DST, "add", "-A"]))
    print(run(["git", "-C", DST, "commit", "-m", msg]))
    print(run(["git", "-C", DST, "push"]))
    print(run(["git", "-C", DST, "log", "--oneline", "-1"]))

if __name__ == "__main__":
    main()
