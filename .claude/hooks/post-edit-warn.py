#!/usr/bin/env python3
"""PostToolUse hook — soft warnings after Edit/Write completes.

Stdout text is surfaced to Claude as feedback. Never blocks.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common


# (min_stage, regex, message, path_predicate)
WARNING_RULES = [
    (0, re.compile(r"\bset[A-Z][a-zA-Z]*Saving\b|\bsetSaving\b"),
     "⚠️ setSaving 패턴 발견 — useFormSubmit (@/lib/hooks/use-form-submit) 검토.",
     lambda p: p.endswith(".tsx")),
    (0, re.compile(r"if\s*\(\s*!\s*confirm\s*\("),
     "⚠️ native confirm() 발견 — ConfirmDialog/useConfirm (@/components/ui/confirm-dialog) 사용.",
     lambda p: p.endswith(".tsx") or p.endswith(".ts")),
    (0, re.compile(r"AbortSignal\.timeout\(\s*\d{3,}\s*\)"),
     "⚠️ AbortSignal.timeout magic number — lib/config/timeouts.ts 의 명명 상수로 추출.",
     lambda p: p.endswith(".ts") or p.endswith(".tsx")),
    (0, re.compile(r"//\s*TODO|//\s*FIXME"),
     "⚠️ TODO/FIXME 추가 — 이슈로 등록하거나 즉시 해결 권장.",
     lambda p: p.endswith(".ts") or p.endswith(".tsx")),
    # Stage 4+ (Phase 6에서 lib/logger.ts 도입 후 활성)
    (4, re.compile(r"\bconsole\.(log|error|warn|info|debug)\s*\("),
     "⚠️ raw console.* 발견 — lib/logger.ts 의 logger.X(msg, ctx) 사용.",
     lambda p: (p.endswith(".ts") or p.endswith(".tsx"))
               and not p.startswith(".claude/")
               and not p.startswith("scripts/")),
    # Phase 6 follow-up — 추출된 반복 유틸/훅 사용 유도
    (0, re.compile(r"Date\.now\(\)[^;\n]*Math\.random|Math\.random\(\)[^;\n]*Date\.now\(\)"),
     "⚠️ raw ID 생성 패턴 — generateId(prefix, sep?) (@/lib/utils) 사용.",
     lambda p: (p.endswith(".ts") or p.endswith(".tsx")) and not p.endswith("lib/utils.ts")),
    (0, re.compile(r"navigator\.clipboard\.writeText"),
     "⚠️ clipboard 직접 사용 — useCopyToClipboard (@/lib/hooks/use-copy-to-clipboard) 검토.",
     lambda p: p.endswith(".tsx") and "use-copy-to-clipboard" not in p),
    (0, re.compile(r"const \[[a-zA-Z]*[Oo]pen, set[A-Z][a-zA-Z]*\]\s*=\s*useState(<boolean>)?\(false\)"),
     "⚠️ 모달/드롭다운 open useState — useDisclosure (@/lib/hooks/use-disclosure) 검토.",
     lambda p: p.endswith(".tsx")),
    (0, re.compile(r"toISOString\(\)\.slice\(0, ?1[03]\)"),
     "⚠️ date bucketing 패턴 — bucketByDay/bucketByHour (@/lib/dashboard-utils) 사용.",
     lambda p: (p.endswith(".ts") or p.endswith(".tsx")) and not p.endswith("dashboard-utils.ts")),
]


def main() -> int:
    if not common.should_run(min_stage=0):
        return 0

    data = common.read_input()
    tool = data.get("tool_name", "")
    if tool not in ("Write", "Edit"):
        return 0
    if not data.get("tool_response", {}).get("success", True):
        return 0  # tool failed — no point warning

    ti = data.get("tool_input", {}) or {}
    fp_raw = ti.get("file_path", "")
    fp_rel = common.normalize_path(fp_raw)

    # Read the file from disk (post-edit content).
    fp_abs = Path(fp_raw)
    if not fp_abs.is_absolute():
        fp_abs = common.project_root() / fp_rel
    if not fp_abs.exists():
        return 0

    try:
        content = fp_abs.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return 0

    warnings: list[str] = []

    line_count = content.count("\n") + 1
    if line_count > 500:
        warnings.append(f"⚠️ 파일이 {line_count}줄 (500 초과) — 분할 검토.")

    for min_stage, pattern, msg, guard in WARNING_RULES:
        if not common.should_run(min_stage=min_stage):
            continue
        if not guard(fp_rel):
            continue
        if pattern.search(content):
            warnings.append(msg)

    if warnings:
        sys.stdout.write("\n".join(warnings) + "\n")
        common.log_decision("PostToolUse", "warn", f"{fp_rel}: {len(warnings)} warnings")
    return 0


if __name__ == "__main__":
    sys.exit(main())
