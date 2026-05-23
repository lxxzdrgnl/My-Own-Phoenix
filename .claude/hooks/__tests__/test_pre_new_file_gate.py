"""Tests for pre-new-file-gate.py"""
import json
import os
from pathlib import Path
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
    """At Stage 0 the hook never denies (rc 0, stdout empty). Warnings may go to stderr."""
    rc, stdout, _ = run_hook(
        "pre-new-file-gate.py",
        _write("lib/hooks/use-form-submit-v2.ts"),
        env_overrides={"PHOENIX_HARNESS_STAGE": "0"},
    )
    assert rc == 0
    # Stage 0: never denies → stdout empty (warnings go to stderr if any)
    assert stdout.strip() == ""


def test_new_hook_blocks_at_stage_5_if_similar_exists():
    """At Stage 5 with a known existing file, the hook denies."""
    rc, stdout, _ = run_hook(
        "pre-new-file-gate.py",
        _write("lib/hooks/use-form-submit-v2.ts"),
        env_overrides={"PHOENIX_HARNESS_STAGE": "5"},
    )
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
