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
