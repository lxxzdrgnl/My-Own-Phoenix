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
