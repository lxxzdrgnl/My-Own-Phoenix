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

    If `fp` is already relative or outside the project, return it unchanged.
    """
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
