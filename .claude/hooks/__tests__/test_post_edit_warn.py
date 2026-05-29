"""Tests for post-edit-warn.py"""
from conftest import run_hook


def _post(file_path: str, success: bool = True) -> dict:
    return {
        "hook_event_name": "PostToolUse",
        "tool_name": "Edit",
        "tool_input": {"file_path": file_path, "old_string": "x", "new_string": "y"},
        "tool_response": {"success": success},
    }


def test_silent_on_clean_file(tmp_path):
    f = tmp_path / "clean.ts"
    f.write_text("export const x = 1;\n")
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


def test_console_NOT_warned_at_stage_0(tmp_path):
    f = tmp_path / "x.ts"
    f.write_text("console.error('boom');")
    rc, stdout, _ = run_hook(
        "post-edit-warn.py",
        _post(str(f)),
        env_overrides={"CLAUDE_PROJECT_DIR": str(tmp_path), "PHOENIX_HARNESS_STAGE": "0"},
    )
    assert rc == 0
    assert "logger" not in stdout


def test_console_warned_at_stage_4(tmp_path):
    f = tmp_path / "x.ts"
    f.write_text("console.error('boom');")
    rc, stdout, _ = run_hook(
        "post-edit-warn.py",
        _post(str(f)),
        env_overrides={"CLAUDE_PROJECT_DIR": str(tmp_path), "PHOENIX_HARNESS_STAGE": "4"},
    )
    assert rc == 0
    assert "logger" in stdout


def test_off_disables_warnings(tmp_path):
    f = tmp_path / "big.ts"
    f.write_text("\n".join([f"// line {i}" for i in range(600)]))
    rc, stdout, _ = run_hook(
        "post-edit-warn.py",
        _post(str(f), success=True),
        env_overrides={"CLAUDE_PROJECT_DIR": str(tmp_path), "PHOENIX_HARNESS": "off"},
    )
    assert rc == 0
    assert stdout.strip() == ""


def test_warns_on_hardcoded_korean_tsx(tmp_path):
    f = tmp_path / "view.tsx"
    f.write_text('export const X = () => <span className="x">대시보드</span>;\n')
    rc, stdout, _ = run_hook(
        "post-edit-warn.py",
        _post(str(f)),
        env_overrides={"CLAUDE_PROJECT_DIR": str(tmp_path)},
    )
    assert rc == 0
    assert "i18n" in stdout


def test_no_korean_warn_on_comment_only(tmp_path):
    f = tmp_path / "view.tsx"
    f.write_text("// 한국어 주석 설명\nexport const X = () => <span>{ui.title}</span>;\n")
    rc, stdout, _ = run_hook(
        "post-edit-warn.py",
        _post(str(f)),
        env_overrides={"CLAUDE_PROJECT_DIR": str(tmp_path)},
    )
    assert rc == 0
    assert "i18n" not in stdout


def test_no_korean_warn_in_i18n_files(tmp_path):
    d = tmp_path / "lib" / "i18n"
    d.mkdir(parents=True)
    f = d / "ko.tsx"
    f.write_text('export const ko = { title: "대시보드" };\n')
    rc, stdout, _ = run_hook(
        "post-edit-warn.py",
        _post(str(f)),
        env_overrides={"CLAUDE_PROJECT_DIR": str(tmp_path)},
    )
    assert rc == 0
    assert "i18n" not in stdout


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
