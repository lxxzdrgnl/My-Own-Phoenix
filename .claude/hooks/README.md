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

| Stage | 활성 룰 | 활성화 시점 |
|---|---|---|
| 0 | `requireAuth` (Pre), setSaving / native confirm / magic timeout / TODO / 500줄 (Post) | 즉시 (현재 기본값) |
| 1 | `@/components/ui/modal` import 차단, 인라인 모달 위치 차단 | Phase 1 Modal 통합 완료 후 |
| 2 | raw 타이포 클래스 차단 | Phase 3 Design System 완료 후 |
| 3 | `@/lib/phoenix/<sub>` `@/lib/openapi/<sub>` 직접 import 차단 | Phase 4 파일 분할 완료 후 |
| 4 | raw `NextResponse.json({error})` 차단, raw `console.*` 경고 | Phase 5 API + Phase 6 logger 완료 후 |
| 5 | pre-new-file gate hard block | 전체 완료 후 |

특정 룰 우회:
- `PRE_NEW_FILE_GATE_BYPASS=<이유>` — pre-new-file-gate 1회 우회

## 파일

| 파일 | 역할 |
|---|---|
| `common.py` | 공통 헬퍼 (stdin 파싱, stage 게이트, 경로 정규화, 로깅) |
| `session-start-conventions.py` | 세션 시작 시 컨벤션 주입 |
| `pre-tool-convention-check.py` | Write/Edit 전 금지 패턴 차단 |
| `pre-new-file-gate.py` | 새 파일 생성 전 유사 파일 검색 |
| `post-edit-warn.py` | Write/Edit 후 soft 경고 |
| `__tests__/` | 룰별 pytest |

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

# 모든 테스트 (venv 사용)
.claude/.venv/bin/python -m pytest .claude/hooks/__tests__/ -v
```

## venv 설치

pytest 실행 환경:
```bash
uv venv .claude/.venv
uv pip install --python .claude/.venv/bin/python pytest
```
