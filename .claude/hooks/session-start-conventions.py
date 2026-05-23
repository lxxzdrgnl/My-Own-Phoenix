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
- Logging: lib/logger.ts (raw console.* 금지)

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
