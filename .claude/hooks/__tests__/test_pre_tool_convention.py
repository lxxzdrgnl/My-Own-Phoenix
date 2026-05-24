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


def test_raw_error_json_NOT_blocked_at_stage_0():
    rc, stdout, _ = run_hook(
        "pre-tool-convention-check.py",
        _payload("app/api/foo/route.ts", 'return NextResponse.json({ error: "bad" }, { status: 400 });'),
        env_overrides={"PHOENIX_HARNESS_STAGE": "0"},
    )
    assert rc == 0
    assert stdout.strip() == ""


def test_raw_error_json_blocked_at_stage_4():
    rc, stdout, _ = run_hook(
        "pre-tool-convention-check.py",
        _payload("app/api/foo/route.ts", 'return NextResponse.json({ error: "bad" }, { status: 400 });'),
        env_overrides={"PHOENIX_HARNESS_STAGE": "4"},
    )
    payload = json.loads(stdout)
    assert payload["hookSpecificOutput"]["permissionDecision"] == "deny"
    assert "apiError" in payload["hookSpecificOutput"]["permissionDecisionReason"]


def test_raw_error_json_allowlist_at_stage_4():
    for allowed_path in (
        "app/api/[..._path]/route.ts",
        "app/api/v1/[...path]/route.ts",
        "app/api/collect/route.ts",
        "app/api/connectors/projects/route.ts",
    ):
        rc, stdout, _ = run_hook(
            "pre-tool-convention-check.py",
            _payload(allowed_path, 'return NextResponse.json({ error: "bad" }, { status: 400 });'),
            env_overrides={"PHOENIX_HARNESS_STAGE": "4"},
        )
        assert rc == 0, f"{allowed_path} should be allowed: {stdout}"
        assert stdout.strip() == ""


def test_requireAuth_not_blocked_outside_api():
    rc, stdout, _ = run_hook(
        "pre-tool-convention-check.py",
        _payload("lib/auth-server.ts", "function requireAuth(req) {}"),
    )
    assert rc == 0
    assert stdout.strip() == ""


# ─── Stage-gated rules ─────────────────────────────────────────────────────

def test_modal_import_NOT_blocked_at_stage_0():
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


# ─── Off / non-Write ───────────────────────────────────────────────────────

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
