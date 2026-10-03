# -*- coding: utf-8 -*-
"""公开原型同步：--report 只读；带真实提交说明时才复制、提交、推送。
COMMIT 为变更量建议，不能代替功能测试。小修复需阅读差异后 --approve-small。
"""
import argparse
import difflib
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys

SRC = Path(r'C:\Users\35499\Documents\Codex\2026-09-07\referenced-chatgpt-conversation-this-is-an\outputs')
DST = Path(__file__).resolve().parent
PUBLIC_ROOTS = {'airport_mvp', 'cable_mvp'}
EXCLUDE_DIRS = {'node_modules', '__pycache__', 'low_altitude_logistics', '.git', '.venv', 'venv'}
EXCLUDE_FILES = {'joint-charging-comparison.png', 'charging-comparison.png', 'event-comparison.png', 'Cable_or_Locker_中文全文翻译.md', 'GLM-Codex交接后进展.md', 'handoff-audit.md', 'handoff-audit-2026-09-26.md', '项目状态_20260926快照.md'}
ARTIFACTS = {'result.json', 'sensitivity.csv', 'package-lock.json'}
CODE_EXT = {'.py', '.js', '.mjs', '.html', '.css', '.svg', '.ps1', '.cmd', '.bat'}
DOC_EXT = {'.md', '.txt', '.rst'}
KNOWN_EXT = CODE_EXT | DOC_EXT | {'.json', '.csv', '.yml', '.yaml', '.toml'}
SENSITIVE_NAME = re.compile(r'论文|导师|组会|paper_full|meeting|handoff|项目状态|交接', re.I)
SECRET_PATTERNS = [
    re.compile(rb'-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----'),
    re.compile(rb'\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b'),
    re.compile(rb'\bsk-[A-Za-z0-9_-]{20,}\b'),
    re.compile(rb'''(?i)(?:api[_-]?key|secret|token|password)\s*["']?\s*[:=]\s*["']([^"'\r\n]{8,})["']'''),
]


def git(repo, *args):
    result = subprocess.run(['git', '-C', str(repo), *args], capture_output=True)
    if result.returncode:
        raise RuntimeError(f'git {args[0]} 失败（{result.returncode}）：' + result.stderr.decode('utf-8', 'replace').strip())
    return result.stdout


def excluded(path):
    p = PurePosixPath(path)
    return (any(x in EXCLUDE_DIRS for x in p.parts) or p.name in EXCLUDE_FILES
            or p.name.endswith(('.log', '.pyc', '.zip')) or p.name.endswith('-proof.jpg') or p.name == '.env' or p.name.startswith('.env.'))


def managed(path):
    return PurePosixPath(path).parts[0] in PUBLIC_ROOTS and not excluded(path)


def safe_path(root, relative):
    root = Path(root).resolve()
    p = root / relative
    if p.is_symlink() or p.is_junction() or not p.resolve().is_relative_to(root):
        raise RuntimeError(f'不处理链接或目录外路径：{relative}')
    return p


def source_files(source):
    source = Path(source).resolve()
    files = {}
    for root_name in sorted(PUBLIC_ROOTS):
        root = safe_path(source, root_name)
        if not root.is_dir():
            raise RuntimeError(f'源目录缺失：{root_name}；停止，避免误删')
        for base, dirs, names in os.walk(root, followlinks=False):
            for name in dirs:
                if name not in EXCLUDE_DIRS:
                    safe_path(source, (Path(base) / name).relative_to(source))
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            for name in names:
                rel = (Path(base) / name).relative_to(source).as_posix()
                if not excluded(rel): files[rel] = safe_path(source, rel).read_bytes()
        if not any(p.startswith(root_name + '/') for p in files):
            raise RuntimeError(f'源目录为空：{root_name}；停止，避免误删')
    return files


def secret_present(data):
    for pattern in SECRET_PATTERNS:
        for m in pattern.finditer(data):
            if m.lastindex:
                value = m.group(1).lower()
                if (any(x in value for x in (b'example', b'placeholder', b'your_', b'your-', b'changeme'))
                        or value.startswith((b'${', b'process.env', b'os.environ', b'<'))):
                    continue
            return True
    return False


def normalized(data):
    # Git's Windows checkout may contain CRLF while HEAD stores LF.
    return data.replace(b'\r\n', b'\n') if data is not None else None


def analyze(source=SRC, repo=DST, approve_small=False):
    source, repo = Path(source), Path(repo)
    if Path(git(repo, 'rev-parse', '--show-toplevel').decode().strip()).resolve() != repo.resolve():
        raise RuntimeError('目标必须是仓库根目录')
    paths = list(filter(None, git(repo, 'ls-tree', '-r', '--name-only', '-z', 'HEAD').decode('utf-8').split('\0')))
    baseline = {p: git(repo, 'show', f'HEAD:{p}') for p in paths if managed(p) or p == 'sync_github.py'}
    desired = source_files(source)
    utility = safe_path(repo, 'sync_github.py')
    if utility.is_file(): desired['sync_github.py'] = utility.read_bytes()
    changes, reasons = [], []
    delta = artifact_delta = 0
    new_code = test_change = False
    for path in sorted(set(baseline) | set(desired)):
        old, new = baseline.get(path), desired.get(path)
        target = safe_path(repo, path)
        if target.exists() and not target.is_file():
            raise RuntimeError(f'目标文件位置被目录占用：{path}')
        current = target.read_bytes() if target.is_file() else None
        if normalized(current) != normalized(old) and normalized(current) != normalized(new):
            reasons.append(f'{path} 有目标仓库独立修改，停止覆盖')
        if normalized(old) == normalized(new): continue
        ext = PurePosixPath(path).suffix.lower()
        artifact = PurePosixPath(path).name in ARTIFACTS or ext == '.csv'
        if SENSITIVE_NAME.search(path): reasons.append(f'{path} 文件名属于需核查资料')
        if ext not in KNOWN_EXT: reasons.append(f'{path} 文件类型需核查：{ext or "无扩展名"}')
        if new is not None and secret_present(new): reasons.append(f'{path} 疑似包含密钥或密码（未输出内容）')
        if b'\0' in (old or b'') or b'\0' in (new or b''): reasons.append(f'{path} 为二进制文件，需要核查')
        before = (old or b'').decode('utf-8', 'replace').splitlines()
        after = (new or b'').decode('utf-8', 'replace').splitlines()
        ins = dele = 0
        for tag, a, b, c, d in difflib.SequenceMatcher(None, before, after, autojunk=False).get_opcodes():
            if tag in ('replace', 'delete'): dele += b - a
            if tag in ('replace', 'insert'): ins += d - c
        substantive = [s.strip() for s in before if s.strip()] != [s.strip() for s in after if s.strip()]
        if dele > 200: reasons.append(f'{path} 删除 {dele} 行，需要核查')
        if artifact: artifact_delta += ins + dele
        elif substantive:
            delta += ins + dele
            if old is None and ext in CODE_EXT | DOC_EXT: new_code = True
            if 'tests' in PurePosixPath(path).parts or PurePosixPath(path).name.startswith('test_'): test_change = True
        changes.append(dict(path=path, old=old, new=new, current=current, insertions=ins, deletions=dele, artifact=artifact))
    candidates = {x['path'] for x in changes}
    staged = list(filter(None, git(repo, 'diff', '--cached', '--name-only', '-z').decode('utf-8').split('\0')))
    for path in staged:
        if path not in candidates: reasons.append(f'{path} 已暂存但不属于本次同步，停止提交')
    if reasons: verdict = 'REVIEW'
    elif not changes: verdict = 'CLEAN'
    elif not delta: verdict = 'HOLD'
    elif delta >= 15 or new_code or test_change or approve_small: verdict = 'COMMIT'
    else: verdict = 'REVIEW_SMALL'
    return dict(verdict=verdict, changes=changes, reasons=reasons, delta=delta, artifact_delta=artifact_delta)


def report(result):
    print(f"判定: {result['verdict']}")
    print(f"代码/文档增删: {result['delta']} 行 | 数据产物增删: {result['artifact_delta']} 行")
    for c in result['changes']:
        print(f"  {c['path']}: +{c['insertions']}/-{c['deletions']}" + ('（数据产物）' if c['artifact'] else ''))
    for reason in result['reasons']: print('  停止: ' + reason)
    if result['verdict'] == 'REVIEW_SMALL': print('小改动可能有价值；看过差异确认是完整修复后，可加 --approve-small。')
    if result['verdict'] == 'HOLD': print('只有数据产物或空白修改，留待下一次完整工作。')


def publish(result, source, repo, message, approve_small=False):
    fresh = analyze(source, repo, approve_small)
    if fresh != result or fresh['verdict'] != 'COMMIT': raise RuntimeError('分析后文件发生变化，请重新运行报告')
    paths = []
    for c in result['changes']:
        path = safe_path(repo, c['path'])
        now = path.read_bytes() if path.is_file() else None
        if now != c['current']: raise RuntimeError(f"{c['path']} 同步时被修改")
        if c['new'] is None:
            if path.exists(): path.unlink()
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(c['new'])
        paths.append(c['path'])
    git(repo, 'add', '-A', '--', *paths)
    staged = set(filter(None, git(repo, 'diff', '--cached', '--name-only', '-z').decode('utf-8').split('\0')))
    if staged != set(paths): raise RuntimeError('暂存内容与已检查文件不一致，停止提交')
    print(git(repo, 'commit', '-m', message).decode('utf-8', 'replace').strip())
    try: git(repo, 'push')
    except RuntimeError:
        print('本地提交已保存，推送失败；修复网络后运行 git push，勿重复制造提交。', file=sys.stderr)
        raise
    print('推送完成：' + git(repo, 'log', '-1', '--oneline').decode('utf-8').strip())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('message', nargs='?', help='本次真实修改的提交说明；不填时只读报告')
    parser.add_argument('--report', action='store_true')
    parser.add_argument('--approve-small', action='store_true')
    args = parser.parse_args()
    result = analyze(approve_small=args.approve_small)
    report(result)
    if args.report or not args.message: return
    if result['verdict'] == 'COMMIT': publish(result, SRC, DST, args.message, args.approve_small)
    elif result['verdict'] in ('REVIEW', 'REVIEW_SMALL'): raise RuntimeError('检查未通过，本次未复制、提交或推送')


if __name__ == '__main__':
    try: main()
    except (RuntimeError, OSError) as error:
        print(f'停止：{error}', file=sys.stderr)
        sys.exit(1)
