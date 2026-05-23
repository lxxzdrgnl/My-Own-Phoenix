#!/usr/bin/env python3
"""PreToolUse hook — hard block forbidden patterns in Write/Edit tool calls.

Each rule has a `min_stage`. The rule fires only when common.should_run(min_stage)
returns True. This lets us ship all rules at once but flip them on per phase.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common


# (min_stage, regex, message, path_guard) — path_guard is a callable rel_path → bool
RULES = [
    # ── Stage 0 (always-active in this phase, zero existing violations) ──
    (0, re.compile(r"\brequireAuth\s*\("),
     "❌ requireAuth 직접 사용 금지. authedHandler 래퍼 사용.",
     lambda p: p.startswith("app/api/")),

    # ── Stage 1 (activated after Phase 1 modal unification) ──
    (1, re.compile(r"""from\s+["']@/components/ui/modal["']"""),
     "❌ @/components/ui/modal 은 삭제됨. @/components/ui/modal-shell 의 ModalShell 사용.",
     lambda p: p.endswith(".ts") or p.endswith(".tsx")),

    # ── Stage 2 (activated after Phase 3 typography components) ──
    (2, re.compile(r"""className=["'][^"']*\btext-(lg|xl|2xl|3xl)\b[^"']*\bfont-(semibold|bold)\b"""),
     "❌ raw 타이포 클래스 금지. <Heading level=...>, <Text variant=...> 사용.",
     lambda p: p.endswith(".tsx")),

    # ── Stage 3 (activated after Phase 4 lib splits) ──
    (3, re.compile(r"""from\s+["']@/lib/phoenix/[a-z][^"']*["']"""),
     "❌ @/lib/phoenix 서브모듈 직접 import 금지. barrel(@/lib/phoenix)만 사용.",
     lambda p: p.endswith(".ts") or p.endswith(".tsx")),
    (3, re.compile(r"""from\s+["']@/lib/openapi/[a-z][^"']*["']"""),
     "❌ @/lib/openapi 서브모듈 직접 import 금지. barrel(@/lib/openapi)만 사용.",
     lambda p: p.endswith(".ts") or p.endswith(".tsx")),

    # ── Stage 4 (activated after Phase 5 API consistency cleanup) ──
    # Allowlist: proxy/public routes that legitimately use raw error JSON.
    (4, re.compile(r"NextResponse\.json\s*\(\s*\{\s*error\s*:"),
     "❌ raw error JSON 금지. apiError(req, ErrorCode.X, msg) 사용.",
     lambda p: (
         p.startswith("app/api/")
         and "[..._path]" not in p
         and "v1/[...path]" not in p
         and not p.startswith("app/api/collect/")
         and not p.startswith("app/api/connectors/")
     )),
]


def _extract_content(tool_name: str, tool_input: dict) -> str:
    if tool_name == "Write":
        return tool_input.get("content") or ""
    if tool_name == "Edit":
        return tool_input.get("new_string") or ""
    return ""


def main() -> int:
    data = common.read_input()
    tool = data.get("tool_name", "")
    if tool not in ("Write", "Edit"):
        return 0
    # Each rule guards itself with should_run; "off" → no rule fires.

    ti = data.get("tool_input", {}) or {}
    fp = common.normalize_path(ti.get("file_path", ""))
    content = _extract_content(tool, ti)

    violations: list[str] = []

    for min_stage, pattern, msg, guard in RULES:
        if not common.should_run(min_stage=min_stage):
            continue
        if not guard(fp):
            continue
        if pattern.search(content):
            violations.append(msg)

    # New-modal-file location rule (Stage 1+)
    if common.should_run(min_stage=1):
        if (
            tool == "Write"
            and fp.endswith(".tsx")
            and "modal" in fp.lower()
            and not fp.startswith("components/modals/")
            and not fp.endswith("modal-shell.tsx")
            and not fp.endswith("modal-form.tsx")
            and "components/ui/" not in fp
        ):
            violations.append(f"❌ 새 모달 파일은 components/modals/ 안에 만들기. 현재: {fp}")

    if violations:
        reason = "\n".join(violations) + "\n\nCLAUDE.md 컨벤션 확인 후 재시도."
        common.emit_deny("PreToolUse", reason)
        common.log_decision("PreToolUse", "deny", reason)
    return 0


if __name__ == "__main__":
    sys.exit(main())
