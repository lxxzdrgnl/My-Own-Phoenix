"""Universal eval worker for Phoenix.

Polls ALL Phoenix projects for new traces, runs two-level evaluations:
- Trace-level: root span (QA correctness, banned word, tool calling)
- Span-level: individual LLM spans with context (hallucination, citation)
- Span-level: RETRIEVER spans (RAG relevance)

Works with any agent type (RAG, tool-calling, simple chat, multi-step).
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from collections import deque
from datetime import datetime, timedelta, timezone

import httpx
import pandas as pd
from openai import OpenAI
from phoenix.evals import QAEvaluator, RelevanceEvaluator, run_evals
from phoenix.evals.models import OpenAIModel

import prompts as default_prompts

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
logger = logging.getLogger("eval_worker")

# ── Configuration ──────────────────────────────────────────────────────────

POLL_INTERVAL = int(os.getenv("EVAL_POLL_INTERVAL", "15"))
PHOENIX_URL = os.getenv("PHOENIX_URL", "http://localhost:6006").rstrip("/")
DASHBOARD_URL = os.getenv("DASHBOARD_URL", "http://localhost:3000").rstrip("/")
INTERNAL_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "")
DASHBOARD_HEADERS = {"X-Internal-Token": INTERNAL_TOKEN} if INTERNAL_TOKEN else {}
MAX_CACHE = 5000
MAX_LLM_EVALS_PER_TRACE = int(os.getenv("EVAL_MAX_LLM_PER_TRACE", "5"))
LOOKBACK_MINUTES = int(os.getenv("EVAL_LOOKBACK_MINUTES", "5"))

BANNED_WORDS_DEFAULT = ["fuck", "shit"]
_extra = os.getenv("BANNED_WORDS", "")
BANNED_WORDS = BANNED_WORDS_DEFAULT + [w.strip() for w in _extra.split(",") if w.strip()]
BANNED_RE = re.compile("|".join(re.escape(w) for w in BANNED_WORDS), re.IGNORECASE)

_reeval_raw = os.getenv("REEVAL_ANNOTATIONS", "")
REEVAL_ANNOTATIONS = {a.strip() for a in _reeval_raw.split(",") if a.strip()}


# ── Dashboard settings sync ──────────────────────────────────────────────

_settings_loaded_at: float = 0

def _sync_dashboard_settings() -> None:
    """Load worker settings from dashboard API every 60s and update globals."""
    global POLL_INTERVAL, MAX_LLM_EVALS_PER_TRACE, LOOKBACK_MINUTES, _settings_loaded_at
    now = time.time()
    if now - _settings_loaded_at < 60:
        return
    try:
        resp = httpx.get(f"{DASHBOARD_URL}/api/settings", headers=DASHBOARD_HEADERS, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            if "evalPollInterval" in data:
                POLL_INTERVAL = max(5, int(data["evalPollInterval"]))
            if "evalMaxLlmPerTrace" in data:
                MAX_LLM_EVALS_PER_TRACE = max(1, int(data["evalMaxLlmPerTrace"]))
            if "evalLookbackMinutes" in data:
                LOOKBACK_MINUTES = max(1, int(data["evalLookbackMinutes"]))
            _settings_loaded_at = now
    except Exception as e:
        logger.debug("Failed to sync dashboard settings: %s", e)


# ── API key helpers ───────────────────────────────────────────────────────

_phoenix_to_db_project: dict[str, str] = {}  # phoenixProject name → DB project ID
_phoenix_to_db_loaded_at: float = 0


def _resolve_project_id(phoenix_project: str) -> str:
    """Map Phoenix project name to DB project ID. Refresh cache every 60s."""
    global _phoenix_to_db_loaded_at
    now = time.time()
    if now - _phoenix_to_db_loaded_at > 60 or phoenix_project not in _phoenix_to_db_project:
        try:
            resp = httpx.get(f"{DASHBOARD_URL}/api/projects", headers=DASHBOARD_HEADERS, timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                # Handle array, {items: [...]} envelope, and legacy {projects: [...]}
                if isinstance(data, list):
                    projects = data
                else:
                    projects = data.get("items") or data.get("projects", [])
                for p in projects:
                    pp = p.get("phoenixProject", "")
                    if pp:
                        _phoenix_to_db_project[pp] = p["id"]
                _phoenix_to_db_loaded_at = now
        except Exception as e:
            logger.debug("Failed to resolve project IDs: %s", e)
    return _phoenix_to_db_project.get(phoenix_project, "")


def fetch_provider_key(provider: str, project_id: str = "") -> str:
    """Fetch decrypted API key from dashboard using project-level endpoint."""
    try:
        if project_id:
            url = f"{DASHBOARD_URL}/api/projects/{project_id}/providers?decrypt=true"
        else:
            url = f"{DASHBOARD_URL}/api/providers?decrypt=true"
        resp = httpx.get(url, headers=DASHBOARD_HEADERS, timeout=10)
        for p in resp.json().get("providers", []):
            if p["provider"] == provider and p.get("isActive", False):
                return p["apiKey"]
    except Exception as e:
        logger.warning("Failed to fetch %s key from dashboard: %s", provider, e)
    # Fallback to env var
    return os.environ.get("OPENAI_API_KEY", "")


_openai_key_cache: dict[str, str] = {}  # project_id → key (empty string = global)


def get_openai_key(project_id: str = "") -> str:
    if project_id not in _openai_key_cache:
        key = fetch_provider_key("openai", project_id)
        if not key and project_id:
            key = fetch_provider_key("openai", "")  # fallback to global
        _openai_key_cache[project_id] = key
    return _openai_key_cache[project_id]


def invalidate_key_cache() -> None:
    """Clear key cache so next eval cycle refetches keys."""
    _openai_key_cache.clear()


# ── Phoenix API helpers ───────────────────────────────────────────────────

_http = httpx.Client(base_url=PHOENIX_URL, timeout=30)


def phoenix_get_projects() -> list[str]:
    try:
        resp = _http.get("/v1/projects")
        return [p["name"] for p in resp.json().get("data", []) if p["name"] != "playground"]
    except Exception as e:
        logger.warning("Failed to get projects: %s", e)
        return []


def phoenix_get_spans(project: str, start_time: datetime, end_time: datetime) -> list[dict]:
    try:
        params = {"limit": "500"}
        if start_time:
            params["start_time"] = start_time.isoformat()
        if end_time:
            params["end_time"] = end_time.isoformat()
        resp = _http.get(f"/v1/projects/{project}/spans", params=params)
        return resp.json().get("data", [])
    except Exception as e:
        logger.warning("Failed to get spans for %s: %s", project, e)
        return []


def phoenix_get_annotations(project: str, span_ids: list[str]) -> dict[str, set[str]]:
    if not span_ids:
        return {}
    try:
        params = [("span_ids", sid) for sid in span_ids[:100]] + [("limit", "1000")]
        resp = _http.get(f"/v1/projects/{project}/span_annotations", params=params)
        result: dict[str, set[str]] = {}
        for a in resp.json().get("data", []):
            result.setdefault(a["span_id"], set()).add(a["name"])
        return result
    except Exception as e:
        logger.warning("Failed to get annotations: %s", e)
        return {}


def _notify_eval_completed(project: str, span_id: str, name: str, kind: str) -> None:
    """Notify dashboard so SSE-connected clients refresh their view."""
    if not INTERNAL_TOKEN or not project:
        return
    try:
        ui_kind = "HUMAN" if kind == "HUMAN" else "LLM"
        httpx.post(
            f"{DASHBOARD_URL}/api/internal/eval-completed",
            headers={**DASHBOARD_HEADERS, "Content-Type": "application/json"},
            json={
                "projectIdent": project,
                "spanId": span_id,
                "name": name,
                "kind": ui_kind,
            },
            timeout=2,
        )
    except Exception as e:
        logger.debug("eval-completed webhook failed: %s", e)


def phoenix_upload_annotation(span_id: str, name: str, kind: str, label: str, score: float, explanation: str = "", project: str = "") -> None:
    try:
        _http.post("/v1/span_annotations?sync=true", json={
            "data": [{
                "span_id": span_id,
                "name": name,
                "annotator_kind": kind,
                "result": {"label": label, "score": score, "explanation": explanation},
            }],
        })
    except Exception as e:
        logger.warning("Annotation upload failed (%s): %s", name, e)
        return
    _notify_eval_completed(project, span_id, name, kind)


# ── Eval config from dashboard ────────────────────────────────────────────

class EvalDef:
    """Eval definition loaded from dashboard."""
    def __init__(self, name: str, eval_type: str, template: str, rule_config: dict, output_mode: str = "score"):
        self.name = name
        self.eval_type = eval_type  # "llm_prompt" | "code_rule" | "builtin"
        self.template = template
        self.rule_config = rule_config
        self.output_mode = output_mode  # "score" | "binary"

_eval_defs: dict[str, dict[str, EvalDef]] = {}  # project → {name → EvalDef}
_eval_defs_loaded_at: dict[str, float] = {}
_project_configs: dict[str, dict[str, bool]] = {}  # project → {eval_name → enabled}
_project_configs_loaded_at: dict[str, float] = {}


def _load_eval_defs(project: str = "") -> dict[str, EvalDef]:
    """Load eval definitions for a project from dashboard API. Refresh every 60s.

    `project` is a Phoenix project name; the dashboard API keys by DB project id (cuid),
    so we resolve before calling. Cache key remains the phoenix project name.
    """
    now = time.time()
    if project in _eval_defs and now - _eval_defs_loaded_at.get(project, 0) < 60:
        return _eval_defs[project]
    try:
        url = f"{DASHBOARD_URL}/api/eval-prompts"
        if project:
            db_id = _resolve_project_id(project)
            if not db_id:
                # No mapping yet — fall back to global defs rather than mis-keying.
                return _eval_defs.get(project, {})
            url += f"?projectId={db_id}"
        resp = httpx.get(url, headers=DASHBOARD_HEADERS, timeout=5)
        if resp.status_code == 200:
            defs = {}
            body = resp.json()
            for p in body.get("items") or body.get("prompts", []):
                rc = {}
                try:
                    rc = json.loads(p.get("ruleConfig", "{}"))
                except Exception:
                    pass
                defs[p["name"]] = EvalDef(
                    name=p["name"],
                    eval_type=p.get("evalType", "llm_prompt"),
                    template=p.get("template", ""),
                    rule_config=rc,
                    output_mode=p.get("outputMode", "score"),
                )
            _eval_defs[project] = defs
            _eval_defs_loaded_at[project] = now
            logger.info("Loaded %d eval definitions for project '%s'", len(defs), project or "global")
            return defs
    except Exception:
        pass
    return _eval_defs.get(project, {})


def _load_project_config(project: str) -> dict[str, bool]:
    """Load enabled/disabled evals for a project. Refresh every 60s.

    `project` is a Phoenix project name; resolve to DB cuid before calling the
    dashboard, which keys ProjectEvalConfig by Project.id.
    """
    now = time.time()
    if project in _project_configs and now - _project_configs_loaded_at.get(project, 0) < 60:
        return _project_configs[project]
    db_id = _resolve_project_id(project)
    if not db_id:
        return _project_configs.get(project, {})
    try:
        resp = httpx.get(f"{DASHBOARD_URL}/api/eval-config?projectId={db_id}", headers=DASHBOARD_HEADERS, timeout=5)
        if resp.status_code == 200:
            body = resp.json()
            configs = body.get("items") or body.get("configs", [])
            result = {c["evalName"]: c["enabled"] for c in configs}
            _project_configs[project] = result
            _project_configs_loaded_at[project] = now
            return result
    except Exception:
        pass
    return _project_configs.get(project, {})


# Ad-hoc /run sets this to restrict enabled evals to just the requested names.
# None = no override (return all enabled).
_force_only_evals: set[str] | None = None


def get_enabled_evals(project: str) -> set[str]:
    """Returns set of eval names enabled for this project."""
    defs = _load_eval_defs(project)
    config = _load_project_config(project)

    # All known evals (built-in + custom from dashboard)
    all_evals = set(BUILT_IN_EVALS) | set(defs.keys())

    enabled = set()
    for name in all_evals:
        if name in config:
            if config[name]:
                enabled.add(name)
        else:
            # Built-in + 금융 AI RMF evals default to enabled; other custom evals default to disabled.
            # (RMF evals run via the generic llm_prompt loop since they're not in BUILT_IN_EVALS.)
            if name in BUILT_IN_EVALS or name in {"bias", "fairness", "explainability", "consumer_protection", "legal_compliance", "transparency"}:
                enabled.add(name)
    if _force_only_evals is not None:
        enabled &= _force_only_evals
    return enabled


# Current project context for get_prompt/get_eval_def
_current_project: str = ""
_current_eval_language: str = "ko"  # eval 설명 출력 언어 (프로젝트 설정 evalLanguage)

# 프로젝트별 eval 출력 언어 캐시 (phoenix name → "ko"|"en")
_project_languages: dict[str, str] = {}
_project_languages_loaded_at: dict[str, float] = {}


def _load_project_language(project: str) -> str:
    """프로젝트 설정 evalLanguage 조회 (60s 캐시). 기본 'ko'."""
    if not project:
        return "ko"
    now = time.time()
    if project in _project_languages and now - _project_languages_loaded_at.get(project, 0) < 60:
        return _project_languages[project]
    db_id = _resolve_project_id(project)
    if not db_id:
        return _project_languages.get(project, "ko")
    try:
        resp = httpx.get(f"{DASHBOARD_URL}/api/settings?scope=project&projectId={db_id}", headers=DASHBOARD_HEADERS, timeout=5)
        if resp.status_code == 200:
            lang = resp.json().get("evalLanguage", "ko") or "ko"
            _project_languages[project] = lang
            _project_languages_loaded_at[project] = now
            return lang
    except Exception as e:
        logger.debug("Failed to load eval language: %s", e)
    return _project_languages.get(project, "ko")


def set_current_project(project: str) -> None:
    global _current_project, _current_eval_language
    _current_project = project
    _current_eval_language = _load_project_language(project)


def get_prompt(name: str, default: str) -> str:
    """Get prompt template: dashboard > default."""
    defs = _load_eval_defs(_current_project)
    if name in defs and defs[name].template:
        return defs[name].template
    return default


def get_eval_def(name: str) -> EvalDef | None:
    defs = _load_eval_defs(_current_project)
    return defs.get(name)


# Built-in eval names (always available even without dashboard)
BUILT_IN_EVALS = {"hallucination", "qa_correctness", "rag_relevance", "banned_word", "citation", "tool_calling", "guardrail"}


# ── Span tree helpers ─────────────────────────────────────────────────────

def _get_span_kind(span: dict) -> str:
    """Get span kind, checking both top-level and attributes."""
    kind = span.get("span_kind", "")
    if not kind:
        kind = span.get("attributes", {}).get("openinference.span.kind", "")
    return kind.upper()


def _group_by_trace(spans: list[dict]) -> dict[str, list[dict]]:
    """Group spans by trace_id."""
    traces: dict[str, list[dict]] = {}
    for s in spans:
        tid = s.get("context", {}).get("trace_id", "")
        if tid:
            traces.setdefault(tid, []).append(s)
    return traces


def _find_root(spans: list[dict]) -> dict | None:
    """Find the root span (no parent) in a trace."""
    for s in spans:
        if s.get("parent_id") is None:
            return s
    return None


def _extract_text(raw: str) -> str:
    """Extract readable text from various JSON formats."""
    if not raw:
        return ""
    # Try JSON parsing
    try:
        data = json.loads(raw)
        # LangChain generations format
        if "generations" in data:
            return data["generations"][0][0].get("text", "")
        # Messages format
        if "messages" in data:
            msgs = data["messages"]
            if isinstance(msgs, list):
                # Nested list (LangChain)
                if msgs and isinstance(msgs[0], list):
                    for msg in msgs[0]:
                        content = msg.get("kwargs", {}).get("content", "") or msg.get("content", "")
                        if content:
                            return content[:3000]
                # Flat list
                for msg in msgs:
                    if isinstance(msg, dict):
                        content = msg.get("content", "") or msg.get("kwargs", {}).get("content", "")
                        if content:
                            return content[:3000]
        # Direct content
        if "content" in data:
            return str(data["content"])[:3000]
        if "output" in data:
            return str(data["output"])[:3000]
    except Exception:
        pass
    return raw[:3000]


def _extract_query_from_input(raw_input: str) -> str:
    """Extract user query from span input."""
    try:
        data = json.loads(raw_input)
        # LangChain messages format
        msgs = data.get("messages", [])
        if isinstance(msgs, list):
            # Nested list
            if msgs and isinstance(msgs[0], list):
                for msg in msgs[0]:
                    content = msg.get("kwargs", {}).get("content", "") or msg.get("content", "")
                    role = msg.get("id", ["", "", "", ""])
                    is_human = "HumanMessage" in str(role) or msg.get("type") == "human"
                    if is_human and content:
                        # Check for <question> tag
                        q = re.search(r"<question>(.*?)</question>", content, re.DOTALL)
                        if q:
                            return q.group(1).strip()
                        return content
            # Flat list
            for msg in msgs:
                if isinstance(msg, dict):
                    role = msg.get("role", "") or msg.get("type", "")
                    if role in ("user", "human"):
                        return msg.get("content", "") or ""
        # Direct input
        if "input" in data:
            return str(data["input"])
        if "prompt" in data:
            return str(data["prompt"])
    except Exception:
        pass
    return raw_input


def _extract_context_from_input(raw_input: str) -> str:
    """Try to extract injected context from LLM input (e.g., RAG <context> tags, tool call data)."""
    try:
        data = json.loads(raw_input)
        msgs = data.get("messages", [])
        if isinstance(msgs, list) and msgs and isinstance(msgs[0], list):
            for msg in msgs[0]:
                content = msg.get("kwargs", {}).get("content", "") or msg.get("content", "")
                # <context> tag style
                c = re.search(r"<context>(.*?)</context>", content, re.DOTALL)
                if c:
                    return c.group(1).strip()
    except Exception:
        pass

    # Plain text: "Data retrieved from tool calls:" pattern
    marker = "Data retrieved from tool calls:"
    idx = raw_input.find(marker)
    if idx >= 0:
        return raw_input[idx + len(marker):].strip()[:3000]

    # Plain text: any content after "Query:" that contains data
    if "\n" in raw_input and len(raw_input) > 500:
        # Long input likely contains context
        return raw_input[:3000]

    return ""


def _aggregate_context_from_siblings(target_span: dict, all_spans: list[dict]) -> str:
    """Collect outputs from TOOL/RETRIEVER spans that occurred before this span."""
    target_start = target_span.get("start_time", "")
    parent_id = target_span.get("parent_id")
    parts = []
    for s in all_spans:
        kind = _get_span_kind(s)
        if kind not in ("TOOL", "RETRIEVER"):
            continue
        # Same parent (sibling) or direct child of root
        s_parent = s.get("parent_id")
        if s_parent != parent_id and s_parent != target_span.get("context", {}).get("span_id"):
            continue
        # Chronologically before
        s_end = s.get("end_time", "")
        if s_end and target_start and s_end <= target_start:
            output = s.get("attributes", {}).get("output.value", "")
            if output:
                parts.append(_extract_text(output))
    return "\n---\n".join(parts) if parts else ""


def _collect_trace_context(trace_spans: list[dict], root_input: str) -> str:
    """Collect context from all available sources in a trace.

    Priority:
    1. All TOOL/RETRIEVER span outputs (no time filtering)
    2. <context> tags or injected data in LLM input
    3. System prompt content from LLM input messages
    4. Empty string if nothing found
    """
    parts: list[str] = []

    # Source 1: ALL TOOL/RETRIEVER span outputs
    for s in trace_spans:
        kind = _get_span_kind(s)
        if kind in ("TOOL", "RETRIEVER"):
            output = s.get("attributes", {}).get("output.value", "")
            if output:
                text = _extract_text(str(output))
                if text:
                    parts.append(text)

    if parts:
        return "\n---\n".join(parts)

    # Source 2: <context> tags or injected data in root input
    ctx = _extract_context_from_input(root_input)
    if ctx:
        return ctx

    # Source 3: System prompt from LLM input messages
    for s in trace_spans:
        if _get_span_kind(s) == "LLM":
            raw_input = str(s.get("attributes", {}).get("input.value", ""))
            try:
                msgs = json.loads(raw_input)
                if isinstance(msgs, list):
                    for m in msgs:
                        if isinstance(m, dict) and m.get("role") == "system":
                            content = m.get("content", "")
                            if content and len(content) > 100:
                                return content[:5000]
            except Exception:
                pass

    return ""


# ── Code Rule engine ──────────────────────────────────────────────────────

def _eval_code_rule(rule_config: dict, query: str, response: str, context: str, span: dict) -> dict:
    """Execute a code_rule eval definition."""
    rules = rule_config.get("rules", [])
    logic = rule_config.get("logic", "any")  # "any" or "all"
    match_result = rule_config.get("match", {"label": "detected", "score": 1.0})
    clean_result = rule_config.get("clean", {"label": "clean", "score": 0.0})

    # Resolve check fields
    attrs = span.get("attributes", {})
    field_values = {
        "response": response,
        "query": query,
        "context": context,
        "total_tokens": int(attrs.get("llm.token_count.total", 0)),
        "prompt_tokens": int(attrs.get("llm.token_count.prompt", 0)),
        "completion_tokens": int(attrs.get("llm.token_count.completion", 0)),
        "latency_ms": 0,
        "cost": 0.0,
        "model_name": str(attrs.get("llm.model_name", "")),
        "status": str(span.get("status_code", "OK")),
        "span_kind": str(attrs.get("openinference.span.kind", "")),
    }
    # Calculate latency
    try:
        start = span.get("start_time", "")
        end = span.get("end_time", "")
        if start and end:
            from datetime import datetime as dt
            s = dt.fromisoformat(start.replace("Z", "+00:00"))
            e = dt.fromisoformat(end.replace("Z", "+00:00"))
            field_values["latency_ms"] = int((e - s).total_seconds() * 1000)
    except Exception:
        pass

    results = []
    for rule in rules:
        check_field = rule.get("check", "response")
        op = rule.get("op", "contains_any")
        value = rule.get("value", "")
        case_sensitive = rule.get("caseSensitive", False)

        field_val = field_values.get(check_field, "")
        matched = False

        try:
            if isinstance(field_val, str):
                text = field_val if case_sensitive else field_val.lower()
                cmp_val = value if case_sensitive else value.lower()

                if op == "contains_any":
                    keywords = [k.strip() for k in cmp_val.split(",") if k.strip()]
                    matched = any(k in text for k in keywords)
                elif op == "not_contains_any":
                    keywords = [k.strip() for k in cmp_val.split(",") if k.strip()]
                    matched = not any(k in text for k in keywords)
                elif op == "matches_regex":
                    flags = 0 if case_sensitive else re.IGNORECASE
                    matched = bool(re.search(value, field_val, flags))
                elif op == "length_gt":
                    matched = len(field_val) > int(value)
                elif op == "length_lt":
                    matched = len(field_val) < int(value)
                elif op == "is_empty":
                    matched = len(field_val.strip()) == 0
                elif op == "is_not_empty":
                    matched = len(field_val.strip()) > 0
                elif op == "equals":
                    matched = text == cmp_val
                elif op == "not_equals":
                    matched = text != cmp_val
            else:
                # Numeric
                num = float(field_val)
                if op == "gt":
                    matched = num > float(value)
                elif op == "lt":
                    matched = num < float(value)
                elif op == "gte":
                    matched = num >= float(value)
                elif op == "lte":
                    matched = num <= float(value)
                elif op == "between":
                    parts = [v.strip() for v in value.split(",")]
                    if len(parts) == 2:
                        matched = float(parts[0]) <= num <= float(parts[1])
                elif op == "equals":
                    matched = num == float(value)
        except Exception:
            pass

        results.append(matched)

    # Apply logic
    if logic == "all":
        triggered = all(results) if results else False
    else:
        triggered = any(results) if results else False

    if triggered:
        return {"label": match_result.get("label", "detected"), "score": float(match_result.get("score", 1.0)), "explanation": "Rule matched"}
    return {"label": clean_result.get("label", "clean"), "score": float(clean_result.get("score", 0.0)), "explanation": ""}


# ── Lazy OpenAI client / evaluator initialization ────────────────────────

_openai_clients: dict[str, OpenAI] = {}
_openai_models: dict[str, OpenAIModel] = {}
_qa_evals: dict[str, QAEvaluator] = {}
_relevance_evals: dict[str, RelevanceEvaluator] = {}


def get_openai_client(project_id: str = "") -> OpenAI:
    if project_id not in _openai_clients:
        _openai_clients[project_id] = OpenAI(api_key=get_openai_key(project_id))
    return _openai_clients[project_id]


def get_openai_model(project_id: str = "") -> OpenAIModel:
    if project_id not in _openai_models:
        _openai_models[project_id] = OpenAIModel(model="gpt-4o-mini", api_key=get_openai_key(project_id))
    return _openai_models[project_id]


def get_qa_eval(project_id: str = "") -> QAEvaluator:
    if project_id not in _qa_evals:
        _qa_evals[project_id] = QAEvaluator(get_openai_model(project_id))
    return _qa_evals[project_id]


def get_relevance_eval(project_id: str = "") -> RelevanceEvaluator:
    if project_id not in _relevance_evals:
        _relevance_evals[project_id] = RelevanceEvaluator(get_openai_model(project_id))
    return _relevance_evals[project_id]


# ── Evaluators ────────────────────────────────────────────────────────────

PASS_LABELS = {"pass", "true", "yes", "correct", "factual", "faithful", "appropriate", "clean", "relevant"}


# eval 출력 언어 지시 (프로젝트 설정 evalLanguage). JSON 키·label 값은 영어 유지(라벨 매칭용), 자연어 설명만 해당 언어.
KOREAN_OUTPUT_INSTRUCTION = (
    "중요: 출력 JSON의 키와 'label' 값은 지정된 영어 그대로 유지하세요. "
    "다만 'explanation', 'issue' 등 모든 자연어 설명 텍스트는 반드시 한국어로 작성하세요."
)


def _openai_eval(prompt_text: str, system_msg: str | None = None, project_id: str = "") -> dict:
    try:
        client = get_openai_client(project_id)
        messages = []
        # 현재 프로젝트의 eval 출력 언어가 한국어면 설명을 한국어로 쓰도록 지시 주입.
        if _current_eval_language == "ko":
            sys_content = f"{system_msg}\n\n{KOREAN_OUTPUT_INSTRUCTION}" if system_msg else KOREAN_OUTPUT_INSTRUCTION
        else:
            sys_content = system_msg
        if sys_content:
            messages.append({"role": "system", "content": sys_content})
        messages.append({"role": "user", "content": prompt_text})
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0,
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as e:
        logger.error("OpenAI eval failed: %s", e)
        return {}


def _parse_eval_result(r: dict, output_mode: str = "score") -> dict:
    """Normalize eval result, handling binary mode (no score in response)."""
    if not r:
        return {}
    label = str(r.get("label", ""))
    explanation = str(r.get("explanation", ""))
    if output_mode == "binary" or "score" not in r:
        score = 1.0 if label.lower() in PASS_LABELS else 0.0
    else:
        score = float(r.get("score", 0.0))
    return {"label": label, "score": score, "explanation": explanation}


def _split_prompt_for_system(template: str) -> tuple[str | None, str]:
    """Split template into system message (role+task) and user message (data+format).
    Returns (system_msg, user_msg). If can't split, returns (None, full_template)."""
    lines = template.split("\n")
    # Find where data section starts (CONTEXT:/QUERY:/RESPONSE:)
    data_start = -1
    for i, line in enumerate(lines):
        if line.strip() in ("CONTEXT:", "QUERY:", "RESPONSE:"):
            data_start = i
            break
    if data_start <= 0:
        return None, template
    system = "\n".join(lines[:data_start]).strip()
    user = "\n".join(lines[data_start:]).strip()
    return system, user


def eval_banned_word(response: str, query: str = "", context: str = "", span: dict | None = None) -> dict:
    """Run banned_word eval. Uses dashboard rule config if available, else default regex."""
    edef = get_eval_def("banned_word")
    if edef and edef.eval_type == "code_rule" and edef.rule_config:
        return _eval_code_rule(edef.rule_config, query, response, context, span or {})
    m = BANNED_RE.search(response)
    return {"label": "detected" if m else "clean", "score": 1.0 if m else 0.0,
            "explanation": f"Matched: '{m.group()}'" if m else ""}


def _run_llm_eval(name: str, default_template: str, context: str, response: str, query: str, project_id: str = "") -> dict:
    """Run an LLM-based eval with system/user split and dashboard prompt override."""
    template = get_prompt(name, default_template)
    edef = get_eval_def(name)
    output_mode = edef.output_mode if edef else "score"

    filled = template.format(
        context=context or "(no context)",
        response=response or "(no response)",
        query=query or "(no query)",
    )
    sys_msg, user_msg = _split_prompt_for_system(filled)
    raw = _openai_eval(user_msg, system_msg=sys_msg, project_id=project_id)
    return _parse_eval_result(raw, output_mode)


def eval_hallucination(response: str, context: str, project_id: str = "") -> dict:
    return _run_llm_eval("hallucination", default_prompts.HALLUCINATION, context, response, "", project_id)


def eval_citation(response: str, context: str, project_id: str = "") -> dict:
    return _run_llm_eval("citation", default_prompts.CITATION, context, response, "", project_id)


def eval_tool_calling(query: str, context: str, project_id: str = "") -> dict:
    return _run_llm_eval("tool_calling", default_prompts.TOOL_CALLING, context, "", query, project_id)


# ── Eval pipeline ─────────────────────────────────────────────────────────

TRACE_EVALS = {"qa_correctness", "banned_word", "tool_calling", "guardrail", "hallucination", "citation", "rag_relevance"}
SPAN_LLM_EVALS: set[str] = set()
SPAN_RETRIEVER_EVALS: set[str] = set()
ALL_ANNOTATIONS = TRACE_EVALS | SPAN_LLM_EVALS | SPAN_RETRIEVER_EVALS


def _run_trace_evals(
    root_id: str, query: str, response: str, context: str,
    missing: set[str], project: str,
    root_span_data: dict | None = None,
    project_id: str = "",
) -> None:
    """Trace-level evals on root span."""
    if "banned_word" in missing and response:
        r = eval_banned_word(response, query, context, root_span_data)
        phoenix_upload_annotation(root_id, "banned_word", "CODE", r["label"], r["score"], r.get("explanation", ""), project)

    if "qa_correctness" in missing and query and response:
        # 대시보드 qa_correctness 템플릿 + _openai_eval 경로 사용 → 언어 설정(한국어) 적용.
        # (이전엔 phoenix.evals QAEvaluator를 써서 설명이 항상 영어로 고정됐음.)
        r = _run_llm_eval("qa_correctness", QA_CORRECTNESS_PROMPT, context or response, response, query, project_id)
        if r:
            phoenix_upload_annotation(root_id, "qa_correctness", "LLM", r["label"], r["score"], r.get("explanation", ""), project)

    if "tool_calling" in missing and query and context:
        r = eval_tool_calling(query, context, project_id)
        if r:
            phoenix_upload_annotation(root_id, "tool_calling", "LLM", r["label"], r["score"], r.get("explanation", ""), project)

    if "guardrail" in missing and response:
        r = _run_llm_eval("guardrail", default_prompts.GUARDRAIL, context, response, query, project_id)
        if r:
            phoenix_upload_annotation(root_id, "guardrail", "LLM", r["label"], r["score"], r.get("explanation", ""), project)

    if "hallucination" in missing and response:
        r = eval_hallucination(response, context or "(no context)", project_id)
        if r:
            phoenix_upload_annotation(root_id, "hallucination", "LLM", r["label"], r["score"], r.get("explanation", ""), project)

    if "citation" in missing and response:
        r = eval_citation(response, context or "(no context)", project_id)
        if r:
            phoenix_upload_annotation(root_id, "citation", "LLM", r["label"], r["score"], r.get("explanation", ""), project)

    if "rag_relevance" in missing and query:
        r = _run_llm_eval("rag_relevance", RAG_RELEVANCE_PROMPT, context or "(no context)", response, query, project_id)
        if r:
            phoenix_upload_annotation(root_id, "rag_relevance", "LLM", r["label"], r["score"], r.get("explanation", ""), project)

    # ── Custom evals (from dashboard) ──
    for eval_name in missing - BUILT_IN_EVALS:
        edef = get_eval_def(eval_name)
        if not edef:
            continue
        try:
            if edef.eval_type == "code_rule" and edef.rule_config:
                r = _eval_code_rule(edef.rule_config, query, response, context, root_span_data)
                if r:
                    phoenix_upload_annotation(root_id, eval_name, "CODE", r["label"], r["score"], r.get("explanation", ""), project)
            elif edef.eval_type == "llm_prompt" and edef.template:
                filled = edef.template.format(
                    context=context or "(no context)",
                    response=response or "(no response)",
                    query=query or "(no query)",
                )
                sys_msg, user_msg = _split_prompt_for_system(filled)
                raw = _openai_eval(user_msg, system_msg=sys_msg, project_id=project_id)
                r = _parse_eval_result(raw, edef.output_mode)
                if r:
                    phoenix_upload_annotation(root_id, eval_name, "LLM",
                        r["label"], r["score"], r["explanation"], project)
        except Exception as e:
            logger.error("[%s] custom eval '%s' failed: %s", project, eval_name, e)


def _run_llm_span_evals(
    span_id: str, response: str, context: str,
    missing: set[str], project: str,
    project_id: str = "",
) -> None:
    """Span-level evals on individual LLM spans."""
    if not context:
        return

    if "hallucination" in missing and response:
        r = eval_hallucination(response, context, project_id)
        if r:
            phoenix_upload_annotation(span_id, "hallucination", "LLM", r["label"], r["score"], r.get("explanation", ""), project)

    if "citation" in missing and response:
        r = eval_citation(response, context, project_id)
        if r:
            phoenix_upload_annotation(span_id, "citation", "LLM", r["label"], r["score"], r.get("explanation", ""), project)


RAG_RELEVANCE_PROMPT = """You are an expert at evaluating retrieval quality for RAG systems.

Given a user QUERY and a set of RETRIEVED DOCUMENTS, evaluate how well the retrieved documents support answering the query.

QUERY:
{query}

RETRIEVED DOCUMENTS:
{context}

Scoring:
- 1.0: At least one document directly answers or is highly relevant to the query
- 0.7-0.9: Documents are mostly relevant, with useful supporting information
- 0.4-0.6: Documents are partially relevant — some useful info but significant gaps
- 0.1-0.3: Documents are mostly irrelevant, only tangentially related
- 0.0: Documents are completely unrelated to the query

Important:
- Even 1 highly relevant document among several irrelevant ones should score 0.7+
- Partial relevance (related topic, adjacent legal provisions) counts as relevant
- Judge by whether the documents HELP answer the query, not exact match

Respond with JSON only: {{"label": "relevant" or "irrelevant", "score": 0.0-1.0, "explanation": "one line"}}"""


# qa_correctness 기본 템플릿(대시보드 eval 정의가 없을 때의 폴백). 대시보드 템플릿이 있으면 그쪽 우선.
QA_CORRECTNESS_PROMPT = """You are an expert at evaluating answer correctness.

Given a QUERY, a REFERENCE answer (or context), and the actual RESPONSE, determine whether the RESPONSE correctly answers the QUERY.

QUERY:
{query}

CONTEXT:
{context}

RESPONSE:
{response}

Judge whether the RESPONSE addresses the question, is consistent with the REFERENCE, and gives a substantive answer.
Respond with JSON only: {{"label": "correct" or "incorrect", "explanation": "one line"}}"""


def _run_retriever_span_evals(
    span_id: str, query: str, docs_output: str,
    missing: set[str], project: str,
    project_id: str = "",
) -> None:
    """Span-level evals on RETRIEVER spans."""
    if "rag_relevance" not in missing or not query or not docs_output:
        return
    try:
        filled = RAG_RELEVANCE_PROMPT.format(
            query=query,
            context=docs_output[:5000],
        )
        sys_msg, user_msg = _split_prompt_for_system(filled)
        raw = _openai_eval(user_msg, system_msg=sys_msg, project_id=project_id)
        r = _parse_eval_result(raw, "score")
        if r:
            phoenix_upload_annotation(span_id, "rag_relevance", "LLM",
                r["label"], r["score"], r.get("explanation", ""), project)
    except Exception as e:
        logger.error("[%s] rag_relevance failed: %s", project, e)


def process_trace(
    trace_spans: list[dict], project: str,
    project_id: str = "",
) -> int:
    """Process one trace (group of spans with same trace_id). Returns eval count."""
    root = _find_root(trace_spans)
    if not root:
        return 0

    root_id = root["context"]["span_id"]
    root_input = str(root.get("attributes", {}).get("input.value", ""))
    root_output = str(root.get("attributes", {}).get("output.value", ""))

    query = _extract_query_from_input(root_input)
    response = _extract_text(root_output)

    if not query and not response:
        return 0

    # Aggregate context from trace — try multiple sources
    trace_context = _collect_trace_context(trace_spans, root_input)

    eval_count = 0

    # ── Level 1: Trace-level evals (on root span) ──
    existing = phoenix_get_annotations(project, [root_id])
    root_existing = existing.get(root_id, set())
    enabled = get_enabled_evals(project)
    # Custom evals run at trace level (on root span)
    custom_eval_names = enabled - BUILT_IN_EVALS
    trace_eval_set = (TRACE_EVALS | custom_eval_names) & enabled
    root_missing = (trace_eval_set - root_existing) | (REEVAL_ANNOTATIONS & trace_eval_set)

    if root_missing:
        logger.info("[%s] Trace eval %s (%d missing: %s)", project, root_id[:8], len(root_missing), ", ".join(root_missing))
        _run_trace_evals(root_id, query, response, trace_context, root_missing, project, root, project_id)
        eval_count += 1

    # ── Level 2: LLM span evals ──
    llm_spans = [s for s in trace_spans if _get_span_kind(s) == "LLM" and s.get("end_time")]
    # Prioritize: last LLM span first, then by context size
    llm_spans.sort(key=lambda s: s.get("end_time", ""), reverse=True)
    llm_budget = 0

    for span in llm_spans:
        if llm_budget >= MAX_LLM_EVALS_PER_TRACE:
            break

        sid = span["context"]["span_id"]
        span_output = _extract_text(str(span.get("attributes", {}).get("output.value", "")))
        if not span_output:
            continue

        # Determine context for this LLM span
        span_input = str(span.get("attributes", {}).get("input.value", ""))
        context = _extract_context_from_input(span_input)
        if not context:
            context = _aggregate_context_from_siblings(span, trace_spans)
        if not context:
            continue  # No context → skip hallucination/citation

        existing_span = phoenix_get_annotations(project, [sid])
        span_existing = existing_span.get(sid, set())
        span_missing = ((SPAN_LLM_EVALS & enabled) - span_existing) | (REEVAL_ANNOTATIONS & SPAN_LLM_EVALS)

        if span_missing:
            logger.info("[%s]   LLM span eval %s (%s)", project, sid[:8], ", ".join(span_missing))
            _run_llm_span_evals(sid, span_output, context, span_missing, project, project_id)
            llm_budget += 1
            eval_count += 1

    # ── Level 2: RETRIEVER span evals ──
    ret_spans = [s for s in trace_spans if _get_span_kind(s) == "RETRIEVER" and s.get("end_time")]

    for span in ret_spans:
        sid = span["context"]["span_id"]
        ret_input = str(span.get("attributes", {}).get("input.value", ""))
        ret_output = str(span.get("attributes", {}).get("output.value", ""))
        ret_query = _extract_text(ret_input) or query

        existing_ret = phoenix_get_annotations(project, [sid])
        ret_existing = existing_ret.get(sid, set())
        ret_missing = ((SPAN_RETRIEVER_EVALS & enabled) - ret_existing) | (REEVAL_ANNOTATIONS & SPAN_RETRIEVER_EVALS)

        if ret_missing and ret_output:
            logger.info("[%s]   RETRIEVER eval %s", project, sid[:8])
            _run_retriever_span_evals(sid, ret_query, _extract_text(ret_output), ret_missing, project, project_id)
            eval_count += 1

    return eval_count


# ── FastAPI ad-hoc eval endpoint ──────────────────────────────────────────
#
# Use case: user clicks "−" in trace detail to run a specific eval immediately,
# or re-evaluate an older trace. Polling cycle is 15–30s — too slow for that
# interaction. We expose a small HTTP API alongside the polling loop.

from fastapi import FastAPI, HTTPException  # type: ignore
from pydantic import BaseModel  # type: ignore
import uvicorn  # type: ignore
import threading

api = FastAPI(title="eval-worker ad-hoc API")


class RunRequest(BaseModel):
    project: str  # Phoenix project name (slug)
    traceId: str
    # Optional: restrict to specific eval names. Empty = run every missing enabled eval.
    evalNames: list[str] = []


@api.post("/run")
def run_eval(req: RunRequest) -> dict:
    """Re-evaluate one trace for one (or multiple) eval names."""
    db_project_id = _resolve_project_id(req.project)
    # _current_project must be the Phoenix project NAME — get_eval_def/get_prompt
    # call _load_eval_defs(_current_project) which resolves name→id internally.
    # (Passing the cuid here made _load_eval_defs fail to resolve → empty defs →
    #  all custom evals silently skipped.)
    set_current_project(req.project)

    # Fetch only this trace's spans via Phoenix's trace_id filter.
    try:
        resp = _http.get(
            f"/v1/projects/{req.project}/spans",
            params={"trace_id": req.traceId, "limit": "500"},
        )
        trace_spans = resp.json().get("data", [])
    except Exception as e:
        logger.error("ad-hoc /run fetch error: %s", e, exc_info=True)
        raise HTTPException(500, f"failed to fetch spans: {e}")
    if not trace_spans:
        raise HTTPException(404, f"trace {req.traceId} not found in project {req.project}")

    # If specific eval names were given, force re-evaluation by temporarily
    # narrowing the enabled set. We monkey-patch get_enabled_evals scope by
    # restricting REEVAL_ANNOTATIONS for this call.
    # Ad-hoc /run always FORCES re-evaluation (overwrites existing rows) and
    # lifts the per-trace LLM cap — it's an explicit user action on one trace.
    #  - evalNames given  → re-run only those.
    #  - evalNames empty  → "전체 실행": re-run ALL enabled evals.
    global REEVAL_ANNOTATIONS, _force_only_evals, MAX_LLM_EVALS_PER_TRACE
    prev_reeval = REEVAL_ANNOTATIONS
    prev_force = _force_only_evals
    prev_cap = MAX_LLM_EVALS_PER_TRACE
    if req.evalNames:
        REEVAL_ANNOTATIONS = set(req.evalNames)
        _force_only_evals = set(req.evalNames)
    else:
        REEVAL_ANNOTATIONS = get_enabled_evals(req.project)
        _force_only_evals = None
    MAX_LLM_EVALS_PER_TRACE = 1000  # ad-hoc: 트레이스당 LLM eval 캡 해제
    try:
        count = process_trace(trace_spans, req.project, db_project_id or "")
    except Exception as e:
        logger.error("ad-hoc /run process_trace error: %s", e, exc_info=True)
        raise HTTPException(500, f"process_trace failed: {e}")
    finally:
        REEVAL_ANNOTATIONS = prev_reeval
        _force_only_evals = prev_force
        MAX_LLM_EVALS_PER_TRACE = prev_cap

    return {"ok": True, "evalsRun": count}


@api.get("/health")
def health() -> dict:
    return {"ok": True}


def start_http_server() -> None:
    port = int(os.getenv("EVAL_WORKER_HTTP_PORT", "4000"))
    logger.info("Starting eval-worker HTTP API on port %d", port)
    uvicorn.run(api, host="0.0.0.0", port=port, log_level="warning")


# ── Main loop ─────────────────────────────────────────────────────────────

def main() -> None:
    evaluated_traces: dict[str, set[str]] = {}  # project → set of trace_ids
    caches: dict[str, deque] = {}
    lookback = timedelta(days=30) if REEVAL_ANNOTATIONS else timedelta(minutes=LOOKBACK_MINUTES)
    last_checked = datetime.now(timezone.utc) - lookback

    logger.info("Eval worker started (phoenix=%s, interval=%ds, two-level eval)", PHOENIX_URL, POLL_INTERVAL)

    while True:
        time.sleep(POLL_INTERVAL)
        _sync_dashboard_settings()
        try:
            now = datetime.now(timezone.utc)
            projects = phoenix_get_projects()

            invalidate_key_cache()  # refresh API key cache each cycle

            for project in projects:
                db_project_id = _resolve_project_id(project)
                set_current_project(project)  # Phoenix name (get_eval_def resolves name→id internally)
                if project not in evaluated_traces:
                    evaluated_traces[project] = set()
                    caches[project] = deque(maxlen=MAX_CACHE)

                spans = phoenix_get_spans(project, last_checked - timedelta(seconds=30), now)
                if not spans:
                    continue

                # Filter completed spans only
                spans = [s for s in spans if s.get("end_time")]

                # Group by trace
                traces = _group_by_trace(spans)
                new_count = 0

                for trace_id, trace_spans in traces.items():
                    if trace_id in evaluated_traces[project]:
                        continue

                    # Only process if root span exists (trace is complete enough)
                    root = _find_root(trace_spans)
                    if not root or not root.get("end_time"):
                        continue

                    count = process_trace(trace_spans, project, db_project_id)
                    if count > 0:
                        new_count += count

                    evaluated_traces[project].add(trace_id)
                    caches[project].append(trace_id)

                    if len(evaluated_traces[project]) > MAX_CACHE:
                        try:
                            evaluated_traces[project].discard(caches[project][0])
                        except IndexError:
                            pass

                if new_count > 0:
                    logger.info("[%s] Evaluated %d targets across traces", project, new_count)

            last_checked = now

        except Exception as e:
            logger.error("Eval loop error: %s", e, exc_info=True)


if __name__ == "__main__":
    # FastAPI runs in a daemon thread; polling loop on main thread.
    threading.Thread(target=start_http_server, daemon=True).start()
    main()
