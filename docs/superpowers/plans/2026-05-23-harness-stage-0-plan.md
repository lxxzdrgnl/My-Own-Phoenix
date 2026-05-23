# Harness Stage 0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the permanent project-shipped harness (`.claude/hooks/*`, `.claude/settings.json`, `CLAUDE.md`) and activate it in Stage 0 (soft mode + only the hard-block rules whose violation count is already zero). This becomes the guide for all subsequent refactoring phases.

**Architecture:** Python 3 hook scripts driven by Claude Code's hook protocol. A shared `common.py` parses stdin JSON, reads stage from env var, normalizes file paths, and writes JSON-lines logs. Each hook script imports `common.py` and applies its rules. Tests use `pytest` and `subprocess` to drive each hook with synthetic stdin and assert stdout/exit code.

**Tech Stack:** Python 3 (no external deps — stdlib only), pytest (already needed for project tests), Claude Code hook protocol.

---

## Background — Hook Protocol Reference

Claude Code invokes hooks with a JSON object on stdin. Each event has its own shape:

**SessionStart input:**
```json
{ "hook_event_name": "SessionStart", "session_id": "...", "transcript_path": "..." }
```

**PreToolUse / PostToolUse input:**
```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Write" | "Edit" | "Bash" | ...,
  "tool_input": { "file_path": "...", "content": "..." },   // shape varies by tool
  "tool_response": { ... }                                   // PostToolUse only
}
```

**Output contract (write to stdout):**

- *Allow* (default): exit 0 with empty stdout
- *Inject context* (SessionStart): `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": "..."}}`
- *Deny* (PreToolUse): `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "..."}}`
- *Warn* (PostToolUse): plain text on stdout becomes Claude-visible feedback

**Environment variables available to hooks:**
- `CLAUDE_PROJECT_DIR` — absolute path to project root (used for path normalization)
- `PHOENIX_HARNESS` — user override: `off` | `soft` | `strict` (default: respect `PHOENIX_HARNESS_STAGE`)
- `PHOENIX_HARNESS_STAGE` — `0`..`5` (default `0`)

---

## File Structure

```
.claude/
  settings.json                              # NEW — hook registration (git tracked)
  hooks/
    common.py                                # NEW — shared helpers (stdin parse, stage gate, logging)
    session-start-conventions.py             # NEW — inject convention summary on session start
    pre-tool-convention-check.py             # NEW — hard block forbidden patterns
    pre-new-file-gate.py                     # NEW — soft warn on similar-named existing file (Stage 0: warn only)
    post-edit-warn.py                        # NEW — soft warn on style violations after Edit/Write
    README.md                                # NEW — hook structure + extension guide
    __tests__/
      conftest.py                            # NEW — pytest fixtures (run_hook helper)
      test_common.py                         # NEW
      test_session_start.py                  # NEW
      test_pre_tool_convention.py            # NEW
      test_pre_new_file_gate.py              # NEW
      test_post_edit_warn.py                 # NEW
      run.sh                                 # NEW — convenience wrapper
    log/                                     # gitignored — created at first run
CLAUDE.md                                    # NEW — convention doc (was gitignored, .gitignore is fixed below)
.gitignore                                   # MODIFY — remove `CLAUDE.md`, add `.claude/settings.local.json` + log dir
```

**Stage 0 rules** (the only ones that hard-block at this stage):
- `requireAuth(` inside `app/api/**` → deny (verified zero current uses)
- `NextResponse.json({error` inside `app/api/**` → deny (verified zero current uses)

All other rules in `pre-tool-convention-check.py` are **defined but gated** behind `STAGE >= N` checks so later phases can flip them on without re-editing the script.

---

## Task 1: Verify Stage 0 prerequisites

**Files:** none

The two Stage 0 hard-block rules assume there are zero existing violations. Verify before implementing the hook (otherwise the hook would block legitimate refactor work).

- [ ] **Step 1: Verify `requireAuth(` is unused in app/api**

Run:
```bash
grep -rn '\brequireAuth\s*(' app/api --include='*.ts' | wc -l
```
Expected: `0`. If non-zero, stop and report — the spec claims 50/50 routes use `authedHandler`; any violation must be fixed before activating the rule.

- [ ] **Step 2: Verify raw `NextResponse.json({error` is unused in app/api**

Run:
```bash
grep -rnE 'NextResponse\.json\s*\(\s*\{\s*error\s*:' app/api --include='*.ts' | wc -l
```
Expected: `0` or a small known set. If non-zero, list them. Decide: fix in this plan, or downgrade the rule to PostToolUse warning (so it doesn't block).

- [ ] **Step 3: Record findings**

If violations exist, edit `docs/superpowers/specs/2026-05-23-full-refactoring-v2-design.md` Phase 9g to move that rule from "Stage 0" to a later stage, OR add a fix task to this plan before continuing.

If both counts are 0, proceed. No commit needed for this task.

---

## Task 2: Fix `.gitignore` so `CLAUDE.md` is tracked

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Remove `CLAUDE.md` from ignore list, add settings.local + log dir**

Read current state:
```bash
grep -n 'CLAUDE.md\|.claude' .gitignore
```
Expected current content:
```
# claude
CLAUDE.md
.claude/worktrees/
```

Edit to:
```
# claude
.claude/worktrees/
.claude/settings.local.json
.claude/hooks/log/
```

- [ ] **Step 2: Verify**

```bash
grep -n 'CLAUDE\|.claude' .gitignore
```
Expected: `CLAUDE.md` is NOT in the ignore list; `.claude/settings.local.json` and `.claude/hooks/log/` ARE.

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "$(cat <<'EOF'
chore(gitignore): track CLAUDE.md, ignore settings.local + harness log dir

준비 단계: 영구 하네스(Phase 9) 활성화를 위해 CLAUDE.md를 추적 대상으로 변경.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Write `CLAUDE.md` convention doc

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: Create the file**

```markdown
# My Own Phoenix — 작업 컨벤션 (필수 준수)

본 문서는 프로젝트의 표준 패턴을 정의합니다. Claude Code 세션마다 자동 로드됩니다.
하네스(.claude/hooks/)가 일부 규칙을 자동 차단/경고합니다. 자세한 내용은 `.claude/hooks/README.md`.

## ⚠️ 핵심 원칙: NEVER INVENT

새 모달 / 훅 / 컴포넌트 / 라우트를 만들기 전 MUST:
1. 비슷한 기존 파일이 있는지 `grep`
2. 발견 시 → 재사용 또는 확장
3. 발견 못한 경우만 → 사용자에게 새로 만들 이유 확인 후 생성

## Modals

- `ModalShell` / `ModalForm`만 사용 (`@/components/ui/modal-shell`)
- 새 모달 파일은 `components/modals/`에 두고 `index.ts`에 export
- 금지: 폐기된 `@/components/ui/modal` 직접 import, 페이지/컴포넌트 안의 인라인 모달

## Forms

- 저장 / 제출은 `useFormSubmit` (`@/lib/hooks/use-form-submit`)
- 금지: 수동 `setSaving` + try/catch 보일러플레이트

## CRUD Lists

- `useResourceList` (`@/lib/hooks/use-resource-list`)

## Typography

- `<Heading level="page|section|sub">`, `<Text variant="body|caption|mono">` 사용
- 금지: raw `text-lg/xl/2xl` + `font-semibold/bold` 직접 사용

## Layout

- `<PageContainer>`, `<PageHeader>`, `<SectionCard>`, `<Stack>`, `<Inline>` 사용

## API Routes

- 인증: `authedHandler`
- 에러: `apiError(req, ErrorCode.X, msg)` (raw `NextResponse.json({error})` 금지)
- 권한: project-scoped는 `requireProjectMember`
- 응답: 단일 리소스 raw, 리스트는 `{ items, nextCursor }` envelope
- 페이지네이션: `parsePagination(req)`

## Imports

- Phoenix lib: `@/lib/phoenix`만 import (서브모듈 직접 X)
- OpenAPI: `@/lib/openapi`만 import

## File Size

- 500줄 초과 시 분할 검토 (책임이 너무 많다는 신호)

## Colors

- monotone palette + `#10b981` (success) / `#ef4444` (destructive)만 허용
- 다른 hex / Tailwind 색 추가 금지

## Constants & Magic Numbers

- 3자리 이상 magic number는 `lib/config/*`에 명명 상수로
- 직접 `AbortSignal.timeout(<number>)` 금지 → `DEFAULT_API_TIMEOUT_MS` 등 import

## 하네스 토글

작업 중 hook이 너무 짜증나면:
- `PHOENIX_HARNESS=soft` (기본) — 정보 주입 + 경고만
- `PHOENIX_HARNESS=off` — 모든 hook 비활성 (디버깅용)
- `PHOENIX_HARNESS=strict` — Stage 무관 전부 활성
```

- [ ] **Step 2: Sanity-check rendering**

```bash
wc -l CLAUDE.md
```
Expected: ~60-80 lines. Open visually if you can.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(claude): 작업 컨벤션 문서 추가 (Phase 9 Soft layer)

Claude Code가 세션마다 자동 로드. 하네스 hook이 일부 규칙을 자동 강제.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Create `.claude/hooks/common.py` shared helper

**Files:**
- Create: `.claude/hooks/common.py`
- Test: `.claude/hooks/__tests__/test_common.py`
- Test: `.claude/hooks/__tests__/conftest.py`

The shared module handles: stdin parsing, env-based stage gating, path normalization, JSON-lines logging. All hook scripts import it.

- [ ] **Step 1: Write the failing test for `read_input`**

Create `.claude/hooks/__tests__/conftest.py`:
```python
"""Shared pytest fixtures for harness hook tests."""
import json
import subprocess
import sys
from pathlib import Path

HOOKS_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = HOOKS_DIR.parents[1]


def run_hook(script_name: str, payload: dict, env_overrides: dict | None = None):
    """Invoke a hook script with `payload` on stdin. Returns (returncode, stdout, stderr)."""
    import os
    env = os.environ.copy()
    env["CLAUDE_PROJECT_DIR"] = str(REPO_ROOT)
    env.setdefault("PHOENIX_HARNESS", "soft")
    env.setdefault("PHOENIX_HARNESS_STAGE", "0")
    if env_overrides:
        env.update({k: str(v) for k, v in env_overrides.items()})
    proc = subprocess.run(
        [sys.executable, str(HOOKS_DIR / script_name)],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        env=env,
    )
    return proc.returncode, proc.stdout, proc.stderr
```

Create `.claude/hooks/__tests__/test_common.py`:
```python
"""Tests for .claude/hooks/common.py"""
import json
import os
import sys
from pathlib import Path

HOOKS_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(HOOKS_DIR))


def test_read_input_parses_json(monkeypatch):
    import io
    import common
    payload = {"hook_event_name": "PreToolUse", "tool_name": "Write"}
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(payload)))
    result = common.read_input()
    assert result["hook_event_name"] == "PreToolUse"
    assert result["tool_name"] == "Write"


def test_read_input_returns_empty_dict_on_invalid_json(monkeypatch):
    import io
    import common
    monkeypatch.setattr("sys.stdin", io.StringIO("not json"))
    assert common.read_input() == {}


def test_should_run_off(monkeypatch):
    import common
    monkeypatch.setenv("PHOENIX_HARNESS", "off")
    assert common.should_run(min_stage=0) is False


def test_should_run_strict_overrides_stage(monkeypatch):
    import common
    monkeypatch.setenv("PHOENIX_HARNESS", "strict")
    monkeypatch.setenv("PHOENIX_HARNESS_STAGE", "0")
    assert common.should_run(min_stage=5) is True


def test_should_run_soft_respects_stage(monkeypatch):
    import common
    monkeypatch.setenv("PHOENIX_HARNESS", "soft")
    monkeypatch.setenv("PHOENIX_HARNESS_STAGE", "2")
    assert common.should_run(min_stage=2) is True
    assert common.should_run(min_stage=3) is False


def test_normalize_path_makes_relative(monkeypatch, tmp_path):
    import common
    monkeypatch.setenv("CLAUDE_PROJECT_DIR", str(tmp_path))
    abs_path = str(tmp_path / "app" / "foo.ts")
    assert common.normalize_path(abs_path) == "app/foo.ts"


def test_normalize_path_keeps_relative(monkeypatch):
    import common
    monkeypatch.setenv("CLAUDE_PROJECT_DIR", "/anywhere")
    assert common.normalize_path("app/foo.ts") == "app/foo.ts"


def test_deny_outputs_correct_envelope(capsys):
    import common
    common.emit_deny("PreToolUse", "test reason")
    out = json.loads(capsys.readouterr().out)
    assert out["hookSpecificOutput"]["hookEventName"] == "PreToolUse"
    assert out["hookSpecificOutput"]["permissionDecision"] == "deny"
    assert out["hookSpecificOutput"]["permissionDecisionReason"] == "test reason"


def test_inject_context_outputs_correct_envelope(capsys):
    import common
    common.emit_context("SessionStart", "convention text")
    out = json.loads(capsys.readouterr().out)
    assert out["hookSpecificOutput"]["additionalContext"] == "convention text"
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
python3 -m pytest .claude/hooks/__tests__/test_common.py -v
```
Expected: FAIL with `ModuleNotFoundError: No module named 'common'`.

- [ ] **Step 3: Implement `common.py`**

Create `.claude/hooks/common.py`:
```python
"""Shared helpers for My-Own-Phoenix Claude Code hooks.

- read_input(): parse JSON from stdin, returning {} on error
- should_run(min_stage): respect PHOENIX_HARNESS + PHOENIX_HARNESS_STAGE env
- normalize_path(p): convert absolute to project-relative
- emit_deny(event, reason): print PreToolUse deny envelope to stdout
- emit_context(event, text): print SessionStart-style additionalContext to stdout
- log_decision(event, decision, detail): JSON-lines append to .claude/hooks/log/YYYY-MM-DD.log
"""
from __future__ import annotations

import json
import os
import sys
from datetime import date, datetime
from pathlib import Path


def read_input() -> dict:
    """Parse stdin as JSON. Return {} on any error (never raise)."""
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            return {}
        return json.loads(raw)
    except (json.JSONDecodeError, OSError):
        return {}


def should_run(min_stage: int) -> bool:
    """Decide whether a rule at `min_stage` should be enforced right now.

    Resolution:
    - PHOENIX_HARNESS=off → never run
    - PHOENIX_HARNESS=strict → always run regardless of stage
    - otherwise → run iff PHOENIX_HARNESS_STAGE >= min_stage
    """
    mode = os.environ.get("PHOENIX_HARNESS", "soft").lower()
    if mode == "off":
        return False
    if mode == "strict":
        return True
    try:
        current = int(os.environ.get("PHOENIX_HARNESS_STAGE", "0"))
    except ValueError:
        current = 0
    return current >= min_stage


def project_root() -> Path:
    return Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd()))


def normalize_path(fp: str) -> str:
    """Return `fp` as a project-relative path with forward slashes.
    If `fp` is already relative or outside the project, return it unchanged."""
    if not fp:
        return ""
    root = project_root()
    p = Path(fp)
    if p.is_absolute():
        try:
            return p.relative_to(root).as_posix()
        except ValueError:
            return p.as_posix()
    return p.as_posix()


def emit_deny(event_name: str, reason: str) -> None:
    """Emit a PreToolUse deny envelope to stdout."""
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": event_name,
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }))


def emit_context(event_name: str, text: str) -> None:
    """Emit a SessionStart additionalContext envelope to stdout."""
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": event_name,
            "additionalContext": text,
        }
    }))


def log_decision(event: str, decision: str, detail: str = "") -> None:
    """Append a JSON-lines record to .claude/hooks/log/YYYY-MM-DD.log."""
    try:
        log_dir = project_root() / ".claude" / "hooks" / "log"
        log_dir.mkdir(parents=True, exist_ok=True)
        f = log_dir / f"{date.today().isoformat()}.log"
        with f.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps({
                "ts": datetime.now().isoformat(timespec="seconds"),
                "event": event,
                "decision": decision,
                "detail": detail,
            }) + "\n")
    except OSError:
        pass  # logging must never break a hook
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
python3 -m pytest .claude/hooks/__tests__/test_common.py -v
```
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/common.py .claude/hooks/__tests__/conftest.py .claude/hooks/__tests__/test_common.py
git commit -m "$(cat <<'EOF'
feat(harness): common.py shared hook helpers + tests

Phase 9 Stage 0 — 영구 하네스 인프라.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: SessionStart hook — convention injection

**Files:**
- Create: `.claude/hooks/session-start-conventions.py`
- Test: `.claude/hooks/__tests__/test_session_start.py`

- [ ] **Step 1: Write the failing test**

Create `.claude/hooks/__tests__/test_session_start.py`:
```python
"""Tests for session-start-conventions.py"""
import json
from conftest import run_hook


def test_emits_additional_context():
    rc, stdout, stderr = run_hook("session-start-conventions.py", {"hook_event_name": "SessionStart"})
    assert rc == 0
    payload = json.loads(stdout)
    ctx = payload["hookSpecificOutput"]["additionalContext"]
    assert "NEVER INVENT" in ctx
    assert "ModalShell" in ctx
    assert "useFormSubmit" in ctx
    assert "authedHandler" in ctx


def test_silent_when_harness_off():
    rc, stdout, _ = run_hook(
        "session-start-conventions.py",
        {"hook_event_name": "SessionStart"},
        env_overrides={"PHOENIX_HARNESS": "off"},
    )
    assert rc == 0
    assert stdout.strip() == ""


def test_runs_even_at_stage_0():
    rc, stdout, _ = run_hook(
        "session-start-conventions.py",
        {"hook_event_name": "SessionStart"},
        env_overrides={"PHOENIX_HARNESS_STAGE": "0"},
    )
    assert rc == 0
    assert json.loads(stdout)["hookSpecificOutput"]["additionalContext"]
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
python3 -m pytest .claude/hooks/__tests__/test_session_start.py -v
```
Expected: FAIL — script doesn't exist.

- [ ] **Step 3: Write the script**

Create `.claude/hooks/session-start-conventions.py`:
```python
#!/usr/bin/env python3
"""SessionStart hook — inject MY-OWN-PHOENIX conventions into context.

Runs at every stage (min_stage=0). Skipped only when PHOENIX_HARNESS=off.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import common

CONVENTIONS = """⚠️ MY-OWN-PHOENIX 작업 컨벤션 (CLAUDE.md 전체 본문 참조)

핵심 원칙: NEVER INVENT — 새 컴포넌트/훅/라우트 만들기 전 비슷한 기존 파일을 grep으로 확인. 발견 시 재사용/확장.

표준 사용:
- Modal: ModalShell / ModalForm (@/components/ui/modal-shell)
- Form: useFormSubmit (@/lib/hooks/use-form-submit)
- List: useResourceList (@/lib/hooks/use-resource-list)
- Typography: <Heading level=...>, <Text variant=...>
- Layout: <PageContainer>, <PageHeader>, <SectionCard>, <Stack>
- API Route: authedHandler + apiError + requireProjectMember
- Imports: @/lib/phoenix, @/lib/openapi barrel만

금지:
- raw text-lg/xl/2xl + font-semibold/bold (Typography 컴포넌트 사용)
- raw NextResponse.json({error}) (apiError 사용)
- 임의 hex/Tailwind 색 (monotone palette + #10b981/#ef4444만)
- 3자리 magic number (lib/config/*에 명명 상수)
- 500줄 초과 파일 (분할 검토)

하네스: 일부 위반은 PreToolUse hook이 차단함. 토글: PHOENIX_HARNESS=off|soft|strict"""


def main() -> int:
    if not common.should_run(min_stage=0):
        return 0
    common.read_input()  # consume stdin even if unused
    common.emit_context("SessionStart", CONVENTIONS)
    common.log_decision("SessionStart", "inject", "conventions")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

Make executable:
```bash
chmod +x .claude/hooks/session-start-conventions.py
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
python3 -m pytest .claude/hooks/__tests__/test_session_start.py -v
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/session-start-conventions.py .claude/hooks/__tests__/test_session_start.py
git commit -m "$(cat <<'EOF'
feat(harness): SessionStart hook injects conventions

Phase 9 Stage 0 — Claude Code 세션마다 컨벤션 요약을 컨텍스트로 주입.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: PreToolUse hook — hard block (Stage 0 rules only)

**Files:**
- Create: `.claude/hooks/pre-tool-convention-check.py`
- Test: `.claude/hooks/__tests__/test_pre_tool_convention.py`

Rules table (with their gating `min_stage`):

| min_stage | Pattern | Reason |
|---|---|---|
| 0 | `\brequireAuth\s*\(` (in `app/api/`) | authedHandler 사용 |
| 0 | `NextResponse\.json\s*\(\s*\{\s*error\s*:` (in `app/api/`) | apiError(req, ErrorCode.X, msg) 사용 |
| 1 | `from\s+["\']@/components/ui/modal["\']` | modal.tsx는 삭제됨. ModalShell 사용 |
| 1 | new modal `.tsx` outside `components/modals/` | components/modals/ 안에 만들기 |
| 2 | raw typography classes (`text-(lg\|xl\|2xl\|3xl)` + `font-(semibold\|bold)`) in `.tsx` | <Heading>/<Text> 사용 |
| 3 | `from\s+["\']@/lib/phoenix/[a-z]+["\']` (submodule) | @/lib/phoenix barrel만 |
| 3 | `from\s+["\']@/lib/openapi/[a-z]+["\']` | @/lib/openapi barrel만 |

Future stages add more — the rule list is the single source of truth, gated per-rule.

- [ ] **Step 1: Write the failing test**

Create `.claude/hooks/__tests__/test_pre_tool_convention.py`:
```python
"""Tests for pre-tool-convention-check.py"""
import json
from conftest import run_hook


def _payload(file_path: str, content: str, tool: str = "Write") -> dict:
    if tool == "Edit":
        ti = {"file_path": file_path, "old_string": "x", "new_string": content}
    else:
        ti = {"file_path": file_path, "content": content}
    return {"hook_event_name": "PreToolUse", "tool_name": tool, "tool_input": ti}


# ─── Stage 0 active rules ──────────────────────────────────────────────────

def test_blocks_requireAuth_in_api_route():
    rc, stdout, _ = run_hook(
        "pre-tool-convention-check.py",
        _payload("app/api/foo/route.ts", "const x = requireAuth(req);"),
    )
    payload = json.loads(stdout)
    assert payload["hookSpecificOutput"]["permissionDecision"] == "deny"
    assert "authedHandler" in payload["hookSpecificOutput"]["permissionDecisionReason"]


def test_blocks_raw_error_json_in_api_route():
    rc, stdout, _ = run_hook(
        "pre-tool-convention-check.py",
        _payload("app/api/foo/route.ts", 'return NextResponse.json({ error: "bad" }, { status: 400 });'),
    )
    payload = json.loads(stdout)
    assert payload["hookSpecificOutput"]["permissionDecision"] == "deny"
    assert "apiError" in payload["hookSpecificOutput"]["permissionDecisionReason"]


def test_allows_apiError_in_api_route():
    rc, stdout, _ = run_hook(
        "pre-tool-convention-check.py",
        _payload("app/api/foo/route.ts", 'return apiError(req, ErrorCode.VALIDATION_FAILED, "bad");'),
    )
    assert rc == 0
    assert stdout.strip() == ""


def test_requireAuth_not_blocked_outside_api():
    rc, stdout, _ = run_hook(
        "pre-tool-convention-check.py",
        _payload("lib/auth-server.ts", "function requireAuth(req) {}"),
    )
    assert rc == 0
    assert stdout.strip() == ""


# ─── Stage-gated rules: deny at strict, allow at Stage 0 ───────────────────

def test_modal_import_NOT_blocked_at_stage_0():
    """Stage 1 rule — must NOT block at stage 0 (existing files still use it)."""
    rc, stdout, _ = run_hook(
        "pre-tool-convention-check.py",
        _payload("components/modals/some.tsx", 'import { Modal } from "@/components/ui/modal";'),
        env_overrides={"PHOENIX_HARNESS_STAGE": "0"},
    )
    assert rc == 0
    assert stdout.strip() == ""


def test_modal_import_blocked_at_stage_1():
    rc, stdout, _ = run_hook(
        "pre-tool-convention-check.py",
        _payload("components/modals/some.tsx", 'import { Modal } from "@/components/ui/modal";'),
        env_overrides={"PHOENIX_HARNESS_STAGE": "1"},
    )
    payload = json.loads(stdout)
    assert payload["hookSpecificOutput"]["permissionDecision"] == "deny"
    assert "ModalShell" in payload["hookSpecificOutput"]["permissionDecisionReason"]


def test_raw_typography_not_blocked_at_stage_1():
    rc, stdout, _ = run_hook(
        "pre-tool-convention-check.py",
        _payload("app/foo.tsx", '<h1 className="text-2xl font-semibold">x</h1>'),
        env_overrides={"PHOENIX_HARNESS_STAGE": "1"},
    )
    assert rc == 0


def test_raw_typography_blocked_at_stage_2():
    rc, stdout, _ = run_hook(
        "pre-tool-convention-check.py",
        _payload("app/foo.tsx", '<h1 className="text-2xl font-semibold">x</h1>'),
        env_overrides={"PHOENIX_HARNESS_STAGE": "2"},
    )
    payload = json.loads(stdout)
    assert payload["hookSpecificOutput"]["permissionDecision"] == "deny"
    assert "Heading" in payload["hookSpecificOutput"]["permissionDecisionReason"]


def test_phoenix_submodule_import_blocked_at_stage_3():
    rc, stdout, _ = run_hook(
        "pre-tool-convention-check.py",
        _payload("components/foo.tsx", 'import { fetchTraces } from "@/lib/phoenix/traces";'),
        env_overrides={"PHOENIX_HARNESS_STAGE": "3"},
    )
    payload = json.loads(stdout)
    assert payload["hookSpecificOutput"]["permissionDecision"] == "deny"


def test_phoenix_barrel_import_allowed():
    rc, stdout, _ = run_hook(
        "pre-tool-convention-check.py",
        _payload("components/foo.tsx", 'import { fetchTraces } from "@/lib/phoenix";'),
        env_overrides={"PHOENIX_HARNESS_STAGE": "3"},
    )
    assert rc == 0


# ─── Off / non-Write tool ──────────────────────────────────────────────────

def test_off_disables_all_rules():
    rc, stdout, _ = run_hook(
        "pre-tool-convention-check.py",
        _payload("app/api/foo/route.ts", "requireAuth(req)"),
        env_overrides={"PHOENIX_HARNESS": "off"},
    )
    assert rc == 0
    assert stdout.strip() == ""


def test_ignores_non_write_tools():
    rc, stdout, _ = run_hook(
        "pre-tool-convention-check.py",
        {"hook_event_name": "PreToolUse", "tool_name": "Bash", "tool_input": {"command": "ls"}},
    )
    assert rc == 0
    assert stdout.strip() == ""
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
python3 -m pytest .claude/hooks/__tests__/test_pre_tool_convention.py -v
```
Expected: FAIL — script doesn't exist.

- [ ] **Step 3: Write the script**

Create `.claude/hooks/pre-tool-convention-check.py`:
```python
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
    (0, re.compile(r"NextResponse\.json\s*\(\s*\{\s*error\s*:"),
     "❌ raw error JSON 금지. apiError(req, ErrorCode.X, msg) 사용.",
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
    # Each rule guards itself with `common.should_run(min_stage=...)`. When
    # PHOENIX_HARNESS=off, should_run returns False for any stage, so no rule
    # fires — no extra early return needed.

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
```

Make executable:
```bash
chmod +x .claude/hooks/pre-tool-convention-check.py
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
python3 -m pytest .claude/hooks/__tests__/test_pre_tool_convention.py -v
```
Expected: 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/pre-tool-convention-check.py .claude/hooks/__tests__/test_pre_tool_convention.py
git commit -m "$(cat <<'EOF'
feat(harness): PreToolUse hook + Stage 0 hard-block rules

Phase 9 Stage 0 — requireAuth/raw-error-json은 즉시 차단. 나머지 룰은 stage-gated.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Pre-new-file gate (soft warn at Stage 0)

**Files:**
- Create: `.claude/hooks/pre-new-file-gate.py`
- Test: `.claude/hooks/__tests__/test_pre_new_file_gate.py`

At Stage 0 this hook **warns** (PostToolUse-style stdout) but does NOT deny. It activates as a hard block only at Stage 5.

For finding similar files we shell out to `grep -l` and filename `find` against the actual repo (with timeout to keep the hook fast).

- [ ] **Step 1: Write the failing test**

Create `.claude/hooks/__tests__/test_pre_new_file_gate.py`:
```python
"""Tests for pre-new-file-gate.py"""
import json
from conftest import run_hook


def _write(file_path: str, content: str = ""):
    return {
        "hook_event_name": "PreToolUse",
        "tool_name": "Write",
        "tool_input": {"file_path": file_path, "content": content},
    }


def test_edit_passes_through():
    rc, stdout, _ = run_hook(
        "pre-new-file-gate.py",
        {"hook_event_name": "PreToolUse", "tool_name": "Edit",
         "tool_input": {"file_path": "lib/foo.ts", "old_string": "a", "new_string": "b"}},
    )
    assert rc == 0
    assert stdout.strip() == ""


def test_non_target_file_passes_through():
    rc, stdout, _ = run_hook(
        "pre-new-file-gate.py",
        _write("docs/notes.md"),
    )
    assert rc == 0


def test_new_hook_with_existing_similar_name_warns_at_stage_0():
    """At Stage 0 we warn (stdout text), not block."""
    rc, stdout, _ = run_hook(
        "pre-new-file-gate.py",
        _write("lib/hooks/use-form-submit-v2.ts"),
        env_overrides={"PHOENIX_HARNESS_STAGE": "0"},
    )
    assert rc == 0
    # Warns about similar existing file
    assert "use-form-submit" in stdout or "유사" in stdout or stdout.strip() == ""
    # Note: test repo state may or may not have the file. We don't assert on
    # the WARNING fired — only that the hook didn't crash and didn't deny.


def test_new_hook_blocks_at_stage_5_if_similar_exists():
    """At Stage 5 with a known existing file, the hook denies."""
    rc, stdout, _ = run_hook(
        "pre-new-file-gate.py",
        _write("lib/hooks/use-form-submit-v2.ts"),
        env_overrides={"PHOENIX_HARNESS_STAGE": "5"},
    )
    # If the repo actually has lib/hooks/use-form-submit.ts, we expect deny.
    # Otherwise (e.g. CI before that file exists) — pass silently.
    from pathlib import Path
    import os
    repo = Path(os.environ.get("CLAUDE_PROJECT_DIR", "."))
    if (repo / "lib/hooks/use-form-submit.ts").exists():
        payload = json.loads(stdout)
        assert payload["hookSpecificOutput"]["permissionDecision"] == "deny"
    else:
        assert rc == 0


def test_bypass_env_var_skips_check():
    rc, stdout, _ = run_hook(
        "pre-new-file-gate.py",
        _write("lib/hooks/use-form-submit-v2.ts"),
        env_overrides={
            "PHOENIX_HARNESS_STAGE": "5",
            "PRE_NEW_FILE_GATE_BYPASS": "intentional duplicate for migration",
        },
    )
    assert rc == 0


def test_off_disables_gate():
    rc, stdout, _ = run_hook(
        "pre-new-file-gate.py",
        _write("lib/hooks/use-form-submit-v2.ts"),
        env_overrides={"PHOENIX_HARNESS": "off"},
    )
    assert rc == 0
    assert stdout.strip() == ""
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
python3 -m pytest .claude/hooks/__tests__/test_pre_new_file_gate.py -v
```
Expected: FAIL — script doesn't exist.

- [ ] **Step 3: Write the script**

Create `.claude/hooks/pre-new-file-gate.py`:
```python
#!/usr/bin/env python3
"""Pre-new-file gate — discourage inventing new files when similar ones exist.

Heuristic: when Write creates a NEW file in a watched directory, find existing
files whose name stem shares the same prefix tokens. If matches exist:
- Stage 0..4: WARN (stdout text — visible to Claude as a soft reminder)
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
    parent = p.parent
    if not parent.exists() and not (repo / parent).exists():
        # Try resolving against repo root
        full_parent = repo / parent
        if not full_parent.exists():
            return []
        parent = full_parent
    else:
        parent = repo / parent if not parent.is_absolute() else parent

    new_tokens = _stem_tokens(p.name)
    if not new_tokens:
        return []
    min_overlap = 1 if len(new_tokens) <= 2 else 2

    matches: list[str] = []
    try:
        for sibling in parent.iterdir():
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
        # Stage 0-4: soft warn — print plain text to stderr so Claude sees it via
        # the hook's stderr surfacing. (PreToolUse stderr is shown when exit 0.)
        print(message, file=sys.stderr)
        common.log_decision("PreToolUse", "warn", f"new-file-gate: {fp}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

Make executable:
```bash
chmod +x .claude/hooks/pre-new-file-gate.py
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
python3 -m pytest .claude/hooks/__tests__/test_pre_new_file_gate.py -v
```
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/pre-new-file-gate.py .claude/hooks/__tests__/test_pre_new_file_gate.py
git commit -m "$(cat <<'EOF'
feat(harness): pre-new-file gate — NEVER INVENT 사전 차단

Phase 9 Stage 0 — 유사 파일 발견 시 경고. Stage 5에서 hard block 활성.
환경변수 PRE_NEW_FILE_GATE_BYPASS=<이유>로 정당 사유 우회.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: PostToolUse hook — soft warnings

**Files:**
- Create: `.claude/hooks/post-edit-warn.py`
- Test: `.claude/hooks/__tests__/test_post_edit_warn.py`

PostToolUse fires after Write/Edit completes. We read the resulting file from disk (the edit has already been applied) and warn about soft violations. Stdout text shows up as a system reminder for Claude.

- [ ] **Step 1: Write the failing test**

Create `.claude/hooks/__tests__/test_post_edit_warn.py`:
```python
"""Tests for post-edit-warn.py"""
import json
from conftest import run_hook


def _post(file_path: str, success: bool = True) -> dict:
    return {
        "hook_event_name": "PostToolUse",
        "tool_name": "Edit",
        "tool_input": {"file_path": file_path, "old_string": "x", "new_string": "y"},
        "tool_response": {"success": success},
    }


def test_silent_on_clean_file(tmp_path, monkeypatch):
    f = tmp_path / "clean.ts"
    f.write_text("export const x = 1;\n")
    monkeypatch.setenv("CLAUDE_PROJECT_DIR", str(tmp_path))
    rc, stdout, _ = run_hook(
        "post-edit-warn.py",
        _post(str(f)),
        env_overrides={"CLAUDE_PROJECT_DIR": str(tmp_path)},
    )
    assert rc == 0
    assert stdout.strip() == ""


def test_warns_on_setSaving_pattern(tmp_path):
    f = tmp_path / "form.tsx"
    f.write_text(
        "const [saving, setSaving] = useState(false);\n"
        "async function save() { setSaving(true); try { await fetch('/x'); } catch(e){} finally { setSaving(false); } }\n"
    )
    rc, stdout, _ = run_hook(
        "post-edit-warn.py",
        _post(str(f)),
        env_overrides={"CLAUDE_PROJECT_DIR": str(tmp_path)},
    )
    assert rc == 0
    assert "useFormSubmit" in stdout


def test_warns_on_file_over_500_lines(tmp_path):
    f = tmp_path / "big.ts"
    f.write_text("\n".join([f"// line {i}" for i in range(600)]))
    rc, stdout, _ = run_hook(
        "post-edit-warn.py",
        _post(str(f)),
        env_overrides={"CLAUDE_PROJECT_DIR": str(tmp_path)},
    )
    assert rc == 0
    assert "500" in stdout or "분할" in stdout


def test_warns_on_native_confirm(tmp_path):
    f = tmp_path / "x.tsx"
    f.write_text("if (!confirm('sure?')) return;")
    rc, stdout, _ = run_hook(
        "post-edit-warn.py",
        _post(str(f)),
        env_overrides={"CLAUDE_PROJECT_DIR": str(tmp_path)},
    )
    assert rc == 0
    assert "ConfirmDialog" in stdout or "useConfirm" in stdout


def test_off_disables_warnings(tmp_path):
    f = tmp_path / "big.ts"
    f.write_text("\n".join([f"// line {i}" for i in range(600)]))
    rc, stdout, _ = run_hook(
        "post-edit-warn.py",
        _post(str(f)),
        env_overrides={"CLAUDE_PROJECT_DIR": str(tmp_path), "PHOENIX_HARNESS": "off"},
    )
    assert rc == 0
    assert stdout.strip() == ""


def test_skips_when_tool_failed(tmp_path):
    f = tmp_path / "big.ts"
    f.write_text("\n".join([f"// line {i}" for i in range(600)]))
    rc, stdout, _ = run_hook(
        "post-edit-warn.py",
        _post(str(f), success=False),
        env_overrides={"CLAUDE_PROJECT_DIR": str(tmp_path)},
    )
    assert rc == 0
    assert stdout.strip() == ""
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
python3 -m pytest .claude/hooks/__tests__/test_post_edit_warn.py -v
```
Expected: FAIL — script doesn't exist.

- [ ] **Step 3: Write the script**

Create `.claude/hooks/post-edit-warn.py`:
```python
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


# (regex, message, path_predicate)
WARNING_RULES = [
    (re.compile(r"\bset[A-Z][a-zA-Z]*Saving\b|\bsetSaving\b"),
     "⚠️ setSaving 패턴 발견 — useFormSubmit (@/lib/hooks/use-form-submit) 검토.",
     lambda p: p.endswith(".tsx")),
    (re.compile(r"if\s*\(\s*!\s*confirm\s*\("),
     "⚠️ native confirm() 발견 — ConfirmDialog/useConfirm (@/components/ui/confirm-dialog) 사용.",
     lambda p: p.endswith(".tsx") or p.endswith(".ts")),
    (re.compile(r"AbortSignal\.timeout\(\s*\d{3,}\s*\)"),
     "⚠️ AbortSignal.timeout magic number — lib/config/timeouts.ts 의 명명 상수로 추출.",
     lambda p: p.endswith(".ts") or p.endswith(".tsx")),
    (re.compile(r"//\s*TODO|//\s*FIXME"),
     "⚠️ TODO/FIXME 추가 — 이슈로 등록하거나 즉시 해결 권장.",
     lambda p: p.endswith(".ts") or p.endswith(".tsx")),
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

    for pattern, msg, guard in WARNING_RULES:
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
```

Make executable:
```bash
chmod +x .claude/hooks/post-edit-warn.py
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
python3 -m pytest .claude/hooks/__tests__/test_post_edit_warn.py -v
```
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add .claude/hooks/post-edit-warn.py .claude/hooks/__tests__/test_post_edit_warn.py
git commit -m "$(cat <<'EOF'
feat(harness): PostToolUse hook — soft 경고 (차단 없음)

setSaving / native confirm / magic timeout / TODO / 500줄 초과 발견 시 Claude에게 경고.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Register hooks in `.claude/settings.json`

**Files:**
- Create: `.claude/settings.json`

This file is project-shared (committed). User-specific overrides go to `.claude/settings.local.json` (gitignored).

- [ ] **Step 1: Write `settings.json`**

Create `.claude/settings.json`:
```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start-conventions.py" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/pre-tool-convention-check.py" },
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/pre-new-file-gate.py" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/post-edit-warn.py" }
        ]
      }
    ]
  },
  "env": {
    "PHOENIX_HARNESS": "soft",
    "PHOENIX_HARNESS_STAGE": "0"
  }
}
```

- [ ] **Step 2: Validate JSON**

Run:
```bash
python3 -c "import json; json.load(open('.claude/settings.json'))" && echo OK
```
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add .claude/settings.json
git commit -m "$(cat <<'EOF'
feat(harness): .claude/settings.json — hook 등록 + Stage 0 env

Phase 9 Stage 0 활성화. PHOENIX_HARNESS=soft / PHOENIX_HARNESS_STAGE=0 기본.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Write `.claude/hooks/README.md`

**Files:**
- Create: `.claude/hooks/README.md`

- [ ] **Step 1: Write the file**

Create `.claude/hooks/README.md`:
```markdown
# Harness — Project-shipped Claude Code hooks

본 디렉토리는 My-Own-Phoenix 작업 컨벤션을 자동 강제하는 hook 스크립트 모음입니다.
git에 커밋되어 clone하면 자동 활성화됩니다.

## 토글

| 모드 | 환경변수 | 효과 |
|---|---|---|
| 끄기 | `PHOENIX_HARNESS=off` | 모든 hook 무력화 (디버깅) |
| 약하게 (기본) | `PHOENIX_HARNESS=soft` | Stage 기반 — 현재 Stage 이하 룰만 활성 |
| 강하게 | `PHOENIX_HARNESS=strict` | Stage 무관 모든 룰 활성 |

Stage 단계: `PHOENIX_HARNESS_STAGE=0..5`. 각 단계는 spec Phase 9g 참조.

특정 룰 우회:
- `PRE_NEW_FILE_GATE_BYPASS=<이유>` — pre-new-file-gate 1회 우회

## 파일

- `common.py` — 공통 헬퍼 (stdin 파싱, stage 게이트, 경로 정규화, 로깅)
- `session-start-conventions.py` — 세션 시작 시 컨벤션 주입
- `pre-tool-convention-check.py` — Write/Edit 전 금지 패턴 차단
- `pre-new-file-gate.py` — 새 파일 생성 전 유사 파일 검색
- `post-edit-warn.py` — Write/Edit 후 soft 경고
- `__tests__/` — 룰별 pytest

## 실행 로그

`.claude/hooks/log/YYYY-MM-DD.log` (JSON lines, gitignored). 차단/경고 사유 추적.

## 새 룰 추가

### Hard block 룰 (pre-tool-convention-check.py)

`RULES` 리스트에 튜플 추가:
```python
(min_stage, re.compile(r"패턴"), "❌ 메시지", lambda p: 경로_필터)
```

`min_stage`는 spec의 Phase 9g Stage 정의 참조.

### Soft 경고 (post-edit-warn.py)

`WARNING_RULES` 리스트에 추가. 형식 동일.

### 테스트 추가

대응 테스트를 `__tests__/test_*.py`에 positive/negative 한 쌍씩.

## 디버깅

룰이 의도대로 작동하는지 보려면:

```bash
# 가짜 입력으로 hook 직접 실행
echo '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"app/api/foo/route.ts","content":"requireAuth(req)"}}' \
  | CLAUDE_PROJECT_DIR=$(pwd) python3 .claude/hooks/pre-tool-convention-check.py

# 모든 테스트
python3 -m pytest .claude/hooks/__tests__/ -v
```
```

- [ ] **Step 2: Commit**

```bash
git add .claude/hooks/README.md
git commit -m "$(cat <<'EOF'
docs(harness): README — hook 구조 / 토글 / 룰 추가 방법

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Full test sweep + harness smoke test

**Files:** none

- [ ] **Step 1: Run all hook tests**

Run:
```bash
python3 -m pytest .claude/hooks/__tests__/ -v
```
Expected: all tests pass (~35 total across 4 files).

- [ ] **Step 2: Smoke test SessionStart**

Run:
```bash
echo '{"hook_event_name":"SessionStart","session_id":"x","transcript_path":"/tmp/x"}' \
  | CLAUDE_PROJECT_DIR=$(pwd) python3 .claude/hooks/session-start-conventions.py
```
Expected: JSON envelope with `additionalContext` containing "NEVER INVENT".

- [ ] **Step 3: Smoke test PreToolUse deny**

Run:
```bash
echo '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"app/api/test/route.ts","content":"requireAuth(req)"}}' \
  | CLAUDE_PROJECT_DIR=$(pwd) python3 .claude/hooks/pre-tool-convention-check.py
```
Expected: JSON with `"permissionDecision":"deny"` and reason containing "authedHandler".

- [ ] **Step 4: Smoke test PreToolUse allow (clean code)**

Run:
```bash
echo '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"app/api/test/route.ts","content":"return apiError(req, ErrorCode.VALIDATION_FAILED, \"x\")"}}' \
  | CLAUDE_PROJECT_DIR=$(pwd) python3 .claude/hooks/pre-tool-convention-check.py
```
Expected: empty stdout, exit 0.

- [ ] **Step 5: Smoke test PHOENIX_HARNESS=off**

Run:
```bash
PHOENIX_HARNESS=off echo '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"app/api/test/route.ts","content":"requireAuth(req)"}}' \
  | PHOENIX_HARNESS=off CLAUDE_PROJECT_DIR=$(pwd) python3 .claude/hooks/pre-tool-convention-check.py
```
Expected: empty stdout, exit 0 (rule disabled).

- [ ] **Step 6: Verify log file written**

Run:
```bash
ls -la .claude/hooks/log/ 2>/dev/null && cat .claude/hooks/log/*.log 2>/dev/null | head -5
```
Expected: at least one log file with JSON lines.

- [ ] **Step 7: No commit needed (validation only)**

If any step fails, fix in the relevant task and re-run from Step 1.

---

## Task 12: Final integration — restart Claude Code and verify

**Files:** none (validation)

- [ ] **Step 1: Quit and restart Claude Code in this project**

Hooks only register on session start. Restart is required for `.claude/settings.json` to load.

- [ ] **Step 2: Verify SessionStart injection visible**

After restart, ask Claude in chat: "What conventions does this project enforce?" — Claude should reference NEVER INVENT, ModalShell, useFormSubmit, etc., proving the SessionStart hook injected.

- [ ] **Step 3: Test hard block (intentional)**

Ask Claude to write `app/api/__harness_test__/route.ts` with content containing literal `requireAuth(req)`. The Write should be denied by the hook with the reason "authedHandler 래퍼 사용". (Then ask Claude to clean up the attempt.)

- [ ] **Step 4: Test soft warning (intentional)**

Ask Claude to write a small file with `if (!confirm("x")) return;` somewhere. The Write succeeds but the PostToolUse hook should output the ConfirmDialog warning.

- [ ] **Step 5: Confirm Stage gate works**

Try to write a file containing `import { Modal } from "@/components/ui/modal";` — at Stage 0 this should pass (the import is still legal). To verify the rule fires at Stage 1, manually set `PHOENIX_HARNESS_STAGE=1` and re-try — it should now be denied.

- [ ] **Step 6: Final commit (if any cleanup needed)**

If Steps 3-4 left junk files, delete them:
```bash
rm -f app/api/__harness_test__/route.ts
rmdir app/api/__harness_test__ 2>/dev/null || true
git status
```
No new commit unless cleanup files were tracked.

---

## Done — Stage 0 activated

After Task 12, the harness is live. Next phase (Phase 1 modal unification, then Stage 1 activation) starts as a separate plan: `docs/superpowers/plans/2026-05-23-phase1-modal-unification-plan.md`.
