# 공유 대시보드 + 동시 편집 동기화

**작성일:** 2026-05-23
**상태:** ✅ 브레인스토밍 완료
**관련:** `prisma/schema.prisma` `DashboardLayout`, `app/projects/[name]/project-view.tsx`, `components/dashboard/`, `lib/api-helpers.ts`, `lib/sse-broadcast.ts` (`#2+#3` spec)

## 문제

현재 `DashboardLayout`은 `@@unique([userId, projectName])` — 같은 프로젝트라도 사용자마다 다른 위젯 배치를 가짐. 프로젝트 멤버가 같은 대시보드를 봐야 한다는 사용자 의도와 불일치.

추가로 여럿이 같은 프로젝트의 대시보드를 동시에 편집할 때 한 명의 변경이 다른 사람에게 실시간으로 반영되어야 함.

## 결정된 사항 (브레인스토밍에서 확정)

| 결정 | 내용 |
|---|---|
| 저장 단위 변경 | per-user → **per-project** (`DashboardLayout.userId` 의미 변경 또는 제거) |
| 충돌 처리 | **Last-write-wins** — 동시 편집 시 늦게 저장한 쪽이 이김 |
| 실시간 동기 | **#2+#3 spec의 SSE 채널 재사용** — `'layout-updated'` 메시지 타입 추가 |
| 편집 권한 | **owner + editor** 편집, viewer는 view-only. 기존 `requireProjectMember(req, projectId, uid, "editor")` 패턴 활용 (`lib/api-helpers.ts:9`) |
| 저장 단위 | **전체 layout JSON 통째 PUT** (위젯 단위 diff 안 함) |
| 사용자 presence 표시 | **이번 spec에서 안 함** ("X가 편집 중" 같은 표시 없음) |
| 마이그레이션 기본 | 각 프로젝트의 **owner 레이아웃**을 공유 레이아웃으로 승격 |
| 마이그레이션 예외 | **Dexter 프로젝트** = Sean Lee (yihsean@gmail.com) 레이아웃 사용 |

## 비목표 (out of scope)

- CRDT/OT 기반 동시 편집 (Figma-style) — 대시보드 편집 빈도 낮아서 과한 솔루션
- 편집 잠금 (lock) 모드 — last-write-wins로 충분
- "X가 편집 중" presence indicator — 다음 spec
- 위젯 단위 diff 동기 — 전체 통째로 충분 (대시보드 layout JSON 크기 작음)
- 변경 이력/롤백 (audit log)
- 사용자별 personal view 옵션 (공유 대시보드 위에 personal 오버레이) — YAGNI

## 데이터 모델

### 변경 전
```prisma
model DashboardLayout {
  id          String   @id @default(cuid())
  userId      String          // ← 변경 대상
  projectName String   @default("default") @map("project")
  projectId   String?
  layout      String
  updatedAt   DateTime @updatedAt
  user        User     @relation(...)
  project     Project? @relation(...)

  @@unique([userId, projectName])   // ← 변경 대상
}
```

### 변경 후
```prisma
model DashboardLayout {
  id            String   @id @default(cuid())
  projectId     String   @unique          // ← 프로젝트 1:1
  layout        String                    // 전체 layout JSON
  lastUpdatedBy String?                   // 마지막 수정자 (감사 + UI 노출용)
  updatedAt     DateTime @updatedAt
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  updatedByUser User?    @relation("DashboardLastUpdate", fields: [lastUpdatedBy], references: [id], onDelete: SetNull)
}
```

- `userId` 제거, `lastUpdatedBy` 추가 (선택, 누가 마지막에 저장했는지 추적용)
- `projectName` 제거 — `projectId`로 통일 (현재 코드의 fallback projectName 패턴 정리)
- `@@unique([userId, projectName])` → `projectId @unique`

## 마이그레이션 SQL (요지)

```sql
-- 1. 새 컬럼 추가 (nullable)
ALTER TABLE "DashboardLayout" ADD COLUMN "lastUpdatedBy" TEXT;

-- 2. 프로젝트별로 owner의 레이아웃 1건만 남기기
--    Dexter 제외 모든 프로젝트: owner의 레이아웃 선택
--    Dexter: Sean Lee의 레이아웃 선택

WITH chosen_layouts AS (
  SELECT DISTINCT ON (dl."projectId")
    dl.id,
    dl."projectId",
    dl.layout,
    dl."userId" as "lastUpdatedBy"
  FROM "DashboardLayout" dl
  JOIN "ProjectMember" pm ON pm."projectId" = dl."projectId" AND pm."userId" = dl."userId"
  JOIN "Project" p ON p.id = dl."projectId"
  WHERE
    -- Dexter는 Sean Lee 우선, 나머지는 owner 우선
    CASE
      WHEN p.name = 'dexter' AND dl."userId" = (SELECT id FROM "User" WHERE email = 'yihsean@gmail.com') THEN 1
      WHEN pm.role = 'owner' THEN 2
      ELSE 3
    END = (
      SELECT MIN(CASE
        WHEN p2.name = 'dexter' AND dl2."userId" = (SELECT id FROM "User" WHERE email = 'yihsean@gmail.com') THEN 1
        WHEN pm2.role = 'owner' THEN 2
        ELSE 3
      END)
      FROM "DashboardLayout" dl2
      JOIN "ProjectMember" pm2 ON pm2."projectId" = dl2."projectId" AND pm2."userId" = dl2."userId"
      JOIN "Project" p2 ON p2.id = dl2."projectId"
      WHERE dl2."projectId" = dl."projectId"
    )
  ORDER BY dl."projectId"
)
-- 3. lastUpdatedBy 채우고 나머지 행 삭제
UPDATE "DashboardLayout" dl
SET "lastUpdatedBy" = c."lastUpdatedBy"
FROM chosen_layouts c
WHERE dl.id = c.id;

DELETE FROM "DashboardLayout"
WHERE id NOT IN (SELECT id FROM chosen_layouts);

-- 4. 스키마 변경
ALTER TABLE "DashboardLayout" DROP CONSTRAINT IF EXISTS "DashboardLayout_userId_project_key";
ALTER TABLE "DashboardLayout" DROP COLUMN "userId";
ALTER TABLE "DashboardLayout" DROP COLUMN "project";  -- projectName old map
ALTER TABLE "DashboardLayout" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_projectId_key" UNIQUE ("projectId");
```

(정확한 SQL은 prisma migrate dev로 자동 생성. 위는 의도 설명.)

**마이그레이션 전 백업 권장:** 데이터 손실 가능성 있는 마이그레이션이라 미니PC DB 백업 후 실행. 백업 → 마이그레이션 → 결과 확인 → 문제 없으면 진행.

## 실시간 동기 — SSE 메시지 타입 확장

`#2+#3 spec`의 `lib/sse-broadcast.ts` 와 `app/api/sse/project/[id]/route.ts` 재사용. 메시지 타입에 추가:

```ts
type SseMessage =
  | { type: "eval-completed", spanId: string, name: string, kind: "LLM" | "HUMAN" }
  | { type: "layout-updated", projectId: string, savedBy: string, savedAt: string };  // ← 신규
```

### 흐름

```
사용자 A: 위젯 드래그 → 저장 버튼
        ↓ PUT /api/dashboard/layout (entire JSON)
서버:
  1. ProjectMember role 체크 (editor+)
  2. DashboardLayout upsert (projectId 기준)
  3. SSE broadcast { type: 'layout-updated', projectId, savedBy: A, savedAt }
        ↓
같은 프로젝트 페이지 열고 있는 모든 클라이언트 (A 포함)
  - 본인이 보낸 거면 무시 (savedBy === currentUserId)
  - 남이 보낸 거면 layout 재fetch + 즉시 적용
```

### 자기 자신 echo 처리

SSE는 모든 connection에 broadcast하니까 본인도 자기 메시지 받음. 클라이언트에서 `savedBy === currentUserId` 면 무시 (이미 로컬에 반영됨).

### 편집 중 다른 사람 변경 들어오면?

- 사용자 A가 위젯 드래그 중 (아직 저장 안 함, 로컬 상태)
- 사용자 B가 다른 위젯 옮기고 저장 → SSE로 A에게 도착
- A의 화면: 로컬 미저장 변경 위에 B의 변경이 덮어쓰지 않게, **A가 저장 중이 아니면(idle 상태면)** 자동 적용. 저장 중이면 토스트 표시 ("Sean Lee가 방금 변경했습니다. 새로고침")
- "저장 중" 판정: 마지막 사용자 인터랙션 (드래그 시작 등) 후 30초 이내

이 단순 정책이 last-write-wins 결합 시 합리적 동작.

## API

### `GET /api/dashboard/layout?projectId=...`
- 프로젝트 멤버이면 누구나 (viewer 포함)
- 응답: `{ layout: string (JSON), lastUpdatedBy: string, updatedAt: string }`
- 레이아웃 없으면 빈 객체 반환 (404 X)

### `PUT /api/dashboard/layout`
- body: `{ projectId: string, layout: string (JSON) }`
- 권한: editor 이상 (`requireProjectMember(req, projectId, uid, "editor")`)
- 동작: upsert by projectId, `lastUpdatedBy = uid`, SSE broadcast
- 응답: `{ success: true, updatedAt }`

기존 라우트가 `/api/dashboard/layout` 형태로 이미 있으면 그대로, 다르면 마이그레이션.

## UI 변경

### `app/projects/[name]/project-view.tsx` 및 dashboard 컴포넌트

- 레이아웃 조회: projectId만 보내고 받음 (userId 안 보냄)
- 저장: 위와 동일
- SSE 메시지 수신 핸들러에 `'layout-updated'` 케이스 추가
- 사용자 role 가져와서 (`useProjectContext()` 의 role 활용) editor 미만이면 드래그/리사이즈/위젯 추가/삭제 버튼 비활성화 + "view-only" 배지

### "마지막 수정자" 표시 (선택, 가벼움)

대시보드 우상단에 작게:
```
업데이트: Sean Lee · 2분 전
```

`lastUpdatedBy` 와 `updatedAt` 으로 렌더. 호버 시 정확한 timestamp.

## 영향받는 파일

| 파일 | 변경 |
|---|---|
| `prisma/schema.prisma` | `DashboardLayout` 모델 변경 |
| 새 마이그레이션 | data + schema 변환 |
| `app/api/dashboard/layout/route.ts` (존재하는지 확인 후) | GET/PUT 로직 + SSE broadcast 호출 |
| `lib/sse-broadcast.ts` (`#2+#3` spec) | 메시지 타입 union에 `layout-updated` 추가 |
| `app/projects/[name]/project-view.tsx` | layout fetch/save 호출부 변경, SSE handler 확장, role 기반 편집 비활성화 |
| `components/dashboard/widget-grid.tsx` | drag/resize 비활성화 prop |
| `lib/project-context.tsx` | role 활용 헬퍼 |
| `lib/i18n/{ko,en}.ts` | 새 라벨 (view-only 배지, 마지막 수정자 등) |

## 테스트 전략

- `migration.spec.ts` (수동 또는 SQL 테스트) — 마이그레이션 후 각 프로젝트당 1건씩 남았고 owner/Sean Lee 레이아웃이 맞는지
- `dashboard-layout-api.test.ts` — viewer는 PUT 거부, editor/owner는 통과
- `dashboard-sync.test.tsx` — SSE 메시지 받으면 layout 재fetch, 본인 메시지면 무시
- 수동: 두 브라우저 탭에서 같은 프로젝트 대시보드 열고, 한 쪽에서 위젯 옮기면 다른 쪽 자동 반영

## 후속 작업 (다른 spec)

- "X가 편집 중" presence indicator + 활성 편집자 아바타
- 위젯 단위 diff 동기 (편집 빈도 늘어나면 검토)
- 변경 이력 / 롤백 / audit log
- 사용자별 personal overlay (개인 메모/하이라이트 위젯)
