# My Own Phoenix — 작업 컨벤션 (필수 준수)

본 문서는 프로젝트의 표준 패턴을 정의합니다. Claude Code 세션마다 자동 로드됩니다.
하네스(.claude/hooks/)가 일부 규칙을 자동 차단/경고합니다. 자세한 내용은 `.claude/hooks/README.md`.

## ⚠️ 핵심 원칙: NEVER INVENT

새 모달 / 훅 / 컴포넌트 / 라우트를 만들기 전 MUST:
1. 비슷한 기존 파일이 있는지 `grep`
2. 발견 시 → 재사용 또는 확장
3. 발견 못한 경우만 → 사용자에게 새로 만들 이유 확인 후 생성

## Modals

- `ModalShell` / `ModalForm`만 사용 (`@/components/ui/modal-shell`)
- 새 모달 파일은 `components/modals/`에 두고 `index.ts`에 export
- 금지: 폐기된 `@/components/ui/modal` 직접 import, 페이지/컴포넌트 안의 인라인 모달

## Forms

- 저장 / 제출은 `useFormSubmit` (`@/lib/hooks/use-form-submit`)
- 금지: 수동 `setSaving` + try/catch 보일러플레이트

## CRUD Lists

- `useResourceList` (`@/lib/hooks/use-resource-list`)

## Typography

- `<Heading level="page|section|sub">`, `<Text variant="body|caption|mono">` 사용
- 금지: raw `text-lg/xl/2xl` + `font-semibold/bold` 직접 사용

## Layout

- `<PageContainer>`, `<PageHeader>`, `<SectionCard>`, `<Stack>`, `<Inline>` 사용

## API Routes

- 인증: `authedHandler`
- 에러: `apiError(req, ErrorCode.X, msg)` (raw `NextResponse.json({error})` 금지)
- 권한: project-scoped는 `requireProjectMember`
- 응답: 단일 리소스 raw, 리스트는 `{ items, nextCursor }` envelope
- 페이지네이션: `parsePagination(req)`

## Imports

- Phoenix lib: `@/lib/phoenix`만 import (서브모듈 직접 X)
- OpenAPI: `@/lib/openapi`만 import

## File Size

- 500줄 초과 시 분할 검토 (책임이 너무 많다는 신호)

## Colors

- monotone palette + `#10b981` (success) / `#ef4444` (destructive)만 허용
- 다른 hex / Tailwind 색 추가 금지

## Constants & Magic Numbers

- 3자리 이상 magic number는 `lib/config/*`에 명명 상수로
- 직접 `AbortSignal.timeout(<number>)` 금지 → `DEFAULT_API_TIMEOUT_MS` 등 import

## Logging

- `lib/logger.ts` 의 `logger.info/warn/error` 사용
- 금지: raw `console.log/.error/.warn` 직접 사용

## 반복 유틸 / 훅 (함수화)

반복 패턴은 추출된 유틸/훅을 사용 (raw 패턴 지양). PostToolUse hook이 raw 패턴 발견 시 경고:
- ID 생성: `generateId(prefix, sep?)` (`@/lib/utils`) — raw `Date.now()`+`Math.random()` 금지
- 날짜 버킷: `bucketByDay` / `bucketByHour` (`@/lib/dashboard-utils`) — raw `toISOString().slice(0,10|13)` 지양
- 클립보드 복사: `useCopyToClipboard` (`@/lib/hooks/use-copy-to-clipboard`)
- 모달/드롭다운 open/close: `useDisclosure` (`@/lib/hooks/use-disclosure`) — open 용 raw `useState(false)` 지양
- 폼 제출: `useFormSubmit` (`@/lib/hooks/use-form-submit`) / 리스트: `useResourceList` (`@/lib/hooks/use-resource-list`)

## 하네스 토글

작업 중 hook이 너무 짜증나면:
- `PHOENIX_HARNESS=soft` (기본) — 정보 주입 + 경고만
- `PHOENIX_HARNESS=off` — 모든 hook 비활성 (디버깅용)
- `PHOENIX_HARNESS=strict` — Stage 무관 전부 활성
