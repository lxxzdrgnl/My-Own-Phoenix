"""Tests for .claude/hooks/common.py"""
import json
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
