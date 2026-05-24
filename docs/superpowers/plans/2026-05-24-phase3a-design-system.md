# Phase 3 (Sub-PR 0 + A) — Design System Components + Settings Adoption

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Typography / Layout / Form 표준 컴포넌트 7개를 신규 생성하고 `app/settings/*` 영역에 채택. spec 3g 의 Sub-PR 0 + A 범위.

**Architecture:** `components/ui/` 에 컴포넌트 추가, 기존 `section-card.tsx` 확장, `providers-section.tsx` 에서 ProviderKeyRow 추출. settings 영역에서 raw 타이포 클래스 + ad-hoc div+text 조합 → 컴포넌트 채택.

**Spec:** `docs/superpowers/specs/2026-05-23-full-refactoring-v2-design.md` Phase 3 (lines 154–269)

**Sub-PR 분할:**
- **본 PR (refactor/phase3-design-system)**: Sub-PR 0 (컴포넌트 작성) + Sub-PR A (settings 채택)
- 후속 PR: Sub-PR B (`app/[slug]/*`), Sub-PR C (datasets/playground/evaluations), Sub-PR D (나머지 + Harness Stage 2 활성)

**현황:**
- text-lg/xl/2xl 사용: 67건
- font-semibold/bold 사용: 402건
- `<h1-h3>` elements: 147건
- SectionCard 사용처: 0건 (만들어졌지만 채택 안 됨)
- Typography/PageHeader/PageContainer/Stack/LoadingButton/InlineError: 모두 미존재

---

## Sub-PR 0: 컴포넌트 생성

### Task 0a: `components/ui/typography.tsx` 신규

`Heading`, `Text`, `Label` 컴포넌트:

```tsx
"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

type HeadingLevel = "page" | "section" | "sub";

const HEADING_CLASS: Record<HeadingLevel, string> = {
  page: "text-2xl font-semibold tracking-tight",
  section: "text-lg font-semibold",
  sub: "text-[10px] font-semibold uppercase tracking-widest text-muted-foreground",
};

const HEADING_DEFAULT_TAG: Record<HeadingLevel, "h1" | "h2" | "h3"> = {
  page: "h1",
  section: "h2",
  sub: "h3",
};

export function Heading({
  level,
  children,
  className,
  as,
}: {
  level: HeadingLevel;
  children: React.ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
}) {
  const Tag = as ?? HEADING_DEFAULT_TAG[level];
  return <Tag className={cn(HEADING_CLASS[level], className)}>{children}</Tag>;
}

type TextVariant = "body" | "caption" | "mono" | "lead";

const TEXT_CLASS: Record<TextVariant, string> = {
  body: "text-sm",
  caption: "text-xs text-muted-foreground",
  mono: "font-mono text-xs",
  lead: "text-base text-muted-foreground",
};

export function Text({
  variant = "body",
  children,
  className,
  as,
}: {
  variant?: TextVariant;
  children: React.ReactNode;
  className?: string;
  as?: "p" | "span" | "div";
}) {
  const Tag = as ?? "p";
  return <Tag className={cn(TEXT_CLASS[variant], className)}>{children}</Tag>;
}

export function Label({
  children,
  required,
  htmlFor,
  className,
}: {
  children: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("text-xs font-medium block", className)}>
      {children}
      {required && <span className="text-[#ef4444] ml-0.5">*</span>}
    </label>
  );
}
```

### Task 0b: `components/ui/page-container.tsx` 신규

```tsx
"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

type Size = "narrow" | "default" | "wide";

const SIZE_CLASS: Record<Size, string> = {
  narrow: "max-w-3xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
};

export function PageContainer({
  size = "default",
  children,
  className,
}: {
  size?: Size;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto px-6 py-6 space-y-6", SIZE_CLASS[size], className)}>
      {children}
    </div>
  );
}
```

### Task 0c: `components/ui/page-header.tsx` 신규

```tsx
"use client";
import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Heading, Text } from "./typography";

interface Crumb { label: string; href?: string; }

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumb?: Crumb[];
  className?: string;
}) {
  return (
    <header className={cn("space-y-2", className)}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="text-xs text-muted-foreground flex items-center gap-1">
          {breadcrumb.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span>/</span>}
              {c.href ? (
                <Link href={c.href} className="hover:text-foreground">{c.label}</Link>
              ) : (
                <span>{c.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Heading level="page">{title}</Heading>
          {description && <Text variant="lead">{description}</Text>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </header>
  );
}
```

### Task 0d: `components/ui/stack.tsx` 신규

```tsx
"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

type Gap = "xs" | "sm" | "md" | "lg" | "xl";

const GAP_CLASS: Record<Gap, string> = {
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
};

export function Stack({
  gap = "md",
  children,
  className,
  as = "div",
}: {
  gap?: Gap;
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section";
}) {
  const Tag = as;
  return <Tag className={cn("flex flex-col", GAP_CLASS[gap], className)}>{children}</Tag>;
}

export function Inline({
  gap = "sm",
  align = "center",
  children,
  className,
}: {
  gap?: Gap;
  align?: "start" | "center" | "end" | "baseline";
  children: React.ReactNode;
  className?: string;
}) {
  const alignClass = { start: "items-start", center: "items-center", end: "items-end", baseline: "items-baseline" }[align];
  return <div className={cn("flex flex-row", GAP_CLASS[gap], alignClass, className)}>{children}</div>;
}
```

### Task 0e: `components/ui/loading-button.tsx` 신규

```tsx
"use client";
import * as React from "react";
import { Button } from "./button";

type ButtonProps = React.ComponentProps<typeof Button>;

export function LoadingButton({
  loading,
  loadingText = "처리 중...",
  disabled,
  children,
  ...rest
}: ButtonProps & {
  loading?: boolean;
  loadingText?: string;
}) {
  return (
    <Button {...rest} disabled={disabled || loading}>
      {loading ? loadingText : children}
    </Button>
  );
}
```

### Task 0f: `components/ui/inline-error.tsx` 신규

```tsx
"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export function InlineError({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return (
    <p role="alert" className={cn("text-sm text-[#ef4444]", className)}>
      {children}
    </p>
  );
}
```

### Task 0g: `components/ui/section-card.tsx` 확장

기존 (`{title, description, headerVariant}`) 에 추가:
- `actions?: React.ReactNode` — 우측 액션 슬롯
- `divider?: boolean` — 헤더와 본문 사이 구분선
- `variant?: "default" | "destructive" | "bordered"`

기존 `headerVariant` 는 `variant` 로 통합 (backwards-compat 위해 둘 다 받기).

```tsx
"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

interface SectionCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  variant?: "default" | "destructive" | "bordered";
  divider?: boolean;
  /** @deprecated use `variant` */
  headerVariant?: "default" | "destructive";
  className?: string;
}

export function SectionCard({
  title,
  description,
  children,
  actions,
  variant,
  divider,
  headerVariant,
  className,
}: SectionCardProps) {
  const effectiveVariant = variant ?? headerVariant ?? "default";
  const titleColor =
    effectiveVariant === "destructive" ? "text-[#ef4444]" : "text-muted-foreground";

  return (
    <section
      className={cn(
        effectiveVariant === "bordered" && "border rounded-lg p-4",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="space-y-1">
          <h3
            className={cn(
              "text-[10px] font-semibold uppercase tracking-widest",
              titleColor,
            )}
          >
            {title}
          </h3>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
      {divider && <hr className="mb-3 border-border" />}
      {children}
    </section>
  );
}
```

### Task 0h: `components/ui/provider-key-row.tsx` 신규 (Sub-PR A 에서 사용)

Read `app/settings/providers-section.tsx` 의 provider row JSX 영역 + project settings (`app/[slug]/settings/page.tsx`) 의 ApiKeysTab provider row 영역 비교, 공통 패턴 추출. 자세한 시그니처는 implementer 가 결정.

```tsx
"use client";
import * as React from "react";
import { Button } from "./button";
import { Text } from "./typography";

export interface ProviderItem {
  id: string;
  name: string;
  // ... provider-specific fields
}

export function ProviderKeyRow({
  provider,
  onTest,
  onDelete,
  showProject = false,
}: {
  provider: ProviderItem;
  onTest?: (id: string) => void | Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
  showProject?: boolean;
}) {
  // 공통 row JSX
  // 자세한 구조는 두 source 의 공통점 추출
}
```

---

## Sub-PR A: app/settings/* 채택

### Task A1–A4: 각 settings 파일 채택 (병렬 가능)

**Files:**
- `app/settings/agents-section.tsx`
- `app/settings/general-section.tsx`
- `app/settings/providers-section.tsx` (+ ProviderKeyRow 사용)
- `app/settings/chat-section.tsx` (Phase 4 분할 대기지만 raw 타이포 부분만 가벼운 치환)

**공통 변환 패턴:**

```diff
-<div>
-  <h2 className="text-lg font-semibold">제목</h2>
-  <p className="text-xs text-muted-foreground">설명</p>
-</div>
+<SectionCard title="제목" description="설명" actions={<Button>...</Button>}>
+  {/* 본문 */}
+</SectionCard>
```

```diff
-<h1 className="text-2xl font-semibold tracking-tight">페이지 제목</h1>
+<Heading level="page">페이지 제목</Heading>
```

```diff
-<p className="text-sm text-muted-foreground">캡션</p>
+<Text variant="caption">캡션</Text>
```

```diff
-<div className="flex flex-col gap-4">{children}</div>
+<Stack gap="md">{children}</Stack>
```

```diff
-<Button onClick={...} disabled={saving}>{saving ? "..." : "저장"}</Button>
+<LoadingButton loading={saving} loadingText="저장 중..." onClick={...}>저장</LoadingButton>
```

```diff
-{error && <p className="text-sm text-red-500">{error}</p>}
+<InlineError>{error}</InlineError>
```

**중요:**
- 외부 컴포넌트 시그니처 변경 금지
- 의미적 변환 (raw `text-lg font-semibold` → `<Heading level="section">`)
- 본문 텍스트 (text-sm 단독) 는 그대로 둠 — 변환 대상은 *제목 스타일링*
- monotone palette 유지

각 sub-task:
- [ ] Read 파일 → ad-hoc 타이포 / div+text / footer 패턴 식별
- [ ] 각 패턴 변환 (위 표 참조)
- [ ] tsc PASS
- [ ] Commit (`refactor(ui): <file> → typography/layout components`)

---

## Build + PR

- [ ] `npm run build` PASS
- [ ] `npx tsc --noEmit` PASS
- [ ] PR 생성 — title: `feat: Phase 3 (0+A) — Design System Components + Settings Adoption`

## Out of Scope (별도 PR)

- Sub-PR B: `app/[slug]/*`
- Sub-PR C: `app/datasets`, `app/playground`, `app/evaluations`
- Sub-PR D: 나머지 + Harness Stage 2 활성 (raw 타이포 클래스 차단)
- chat-section.tsx 전체 분할 (Phase 4)
- API 응답 envelope 통일 (Phase 5)
- 하드코딩 추출 (Phase 6)
