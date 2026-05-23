#!/usr/bin/env python3
"""Pre-new-file gate — discourage inventing new files when similar ones exist.

Heuristic: when Write creates a NEW file in a watched directory, find existing
files whose name stem shares the same prefix tokens. If matches exist:
- Stage 0..4: WARN (stderr — visible to Claude as a soft reminder)
- Stage 5+: DENY (PreToolUse hard block)

Bypass: set env var PRE_NEW_FILE_GATE_BYPASS=<reason>.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common


WATCHED = [
    ("components/", (".tsx",)),
    ("lib/hooks/", (".ts", ".tsx")),
    ("lib/", (".ts",)),
    ("app/api/", ("route.ts",)),
]


def _stem_tokens(name: str) -> list[str]:
    base = re.sub(r"\.(t|j)sx?$", "", name)
    base = re.sub(r"-(v\d+|new|copy|2|old)$", "", base)
    return [t for t in re.split(r"[-_.]", base) if t]


def _find_similar(rel_path: str) -> list[str]:
    """Return existing files in the same watched directory whose stem shares
    >= 2 leading tokens with the new file's stem (or 1 token if stem has <= 2 tokens)."""
    repo = common.project_root()
    p = Path(rel_path)
    parent_rel = p.parent
    parent_abs = repo / parent_rel
    if not parent_abs.exists():
        return []

    new_tokens = _stem_tokens(p.name)
    if not new_tokens:
        return []
    min_overlap = 1 if len(new_tokens) <= 2 else 2

    matches: list[str] = []
    try:
        for sibling in parent_abs.iterdir():
            if not sibling.is_file():
                continue
            if sibling.name == p.name:
                continue
            sib_tokens = _stem_tokens(sibling.name)
            overlap = sum(1 for tok in new_tokens if tok in sib_tokens)
            if overlap >= min_overlap:
                matches.append(str(sibling.relative_to(repo)))
    except OSError:
        return []
    return sorted(matches)


def _is_watched(rel_path: str) -> bool:
    for prefix, suffixes in WATCHED:
        if rel_path.startswith(prefix) and any(rel_path.endswith(suf) for suf in suffixes):
            return True
    return False


def main() -> int:
    data = common.read_input()
    if data.get("tool_name") != "Write":
        return 0
    if os.environ.get("PRE_NEW_FILE_GATE_BYPASS"):
        common.log_decision("PreToolUse", "bypass", os.environ["PRE_NEW_FILE_GATE_BYPASS"])
        return 0
    if not common.should_run(min_stage=0):
        return 0

    ti = data.get("tool_input", {}) or {}
    fp = common.normalize_path(ti.get("file_path", ""))
    if not fp or not _is_watched(fp):
        return 0

    # If the target file already exists, Write is an overwrite — skip (Edit-like).
    if (common.project_root() / fp).exists():
        return 0

    similar = _find_similar(fp)
    if not similar:
        return 0

    message = (
        "⚠️ 비슷한 기존 파일이 있습니다 — 재사용/확장을 먼저 검토하세요:\n  "
        + "\n  ".join(similar[:5])
        + (f"\n  ... (총 {len(similar)}개)" if len(similar) > 5 else "")
        + "\n\n정말 새 파일이 필요하다면 PRE_NEW_FILE_GATE_BYPASS=<이유> 환경변수로 우회."
    )

    if common.should_run(min_stage=5):
        common.emit_deny("PreToolUse", message)
        common.log_decision("PreToolUse", "deny", f"new-file-gate: {fp}")
    else:
        print(message, file=sys.stderr)
        common.log_decision("PreToolUse", "warn", f"new-file-gate: {fp}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
