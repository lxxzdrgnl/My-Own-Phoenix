"use client";

import * as React from "react";
import { CheckCircle } from "lucide-react";
import { Button } from "./button";
import { Text } from "./typography";
import { cn } from "@/lib/utils";

export interface ProviderItem {
  id: string;
  /** 화면에 표시할 이름 (예: "OpenAI") */
  name: string;
  /** 프로바이더 key (예: "openai") */
  type?: string;
  /** 등록된 키의 마지막 4자리 (있을 경우 표시) */
  apiKeyTail?: string;
  /** 이미 설정된 상태인지 여부 */
  configured?: boolean;
}

export interface ProviderKeyRowProps {
  provider: ProviderItem;
  /** 테스트 버튼 클릭 핸들러 */
  onTest?: () => void;
  /** 삭제 버튼 클릭 핸들러 */
  onDelete?: () => void;
  /** 추가 버튼 클릭 핸들러 (미설정 상태에서) */
  onAdd?: () => void;
  /** 테스트 진행 중 */
  testing?: boolean;
  /** 삭제 진행 중 */
  deleting?: boolean;
  /** 저장/추가 진행 중 */
  saving?: boolean;
  /** project-scoped 레이블 표시 여부 (showProject=true 이면 type 배지 표시) */
  showProject?: boolean;
  /** 행 오른쪽에 커스텀 액션 영역을 넣을 때 사용 */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * ProviderKeyRow — 공통 provider 키 행 컴포넌트.
 *
 * providers-section (사용자 설정)과 project settings ApiKeysTab 양쪽에서 사용 가능.
 * 복잡한 입력/테스트 UI는 각 상위 컴포넌트에서 `actions` prop 으로 주입.
 */
export function ProviderKeyRow({
  provider,
  onTest,
  onDelete,
  onAdd,
  testing,
  deleting,
  saving,
  showProject = false,
  actions,
  className,
}: ProviderKeyRowProps) {
  const isConfigured = provider.configured ?? false;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-4 py-3",
        className,
      )}
    >
      {/* Provider name + optional type badge */}
      <div className="w-20 shrink-0">
        <Text variant="body" className="font-medium">
          {provider.name}
        </Text>
        {showProject && provider.type && (
          <Text variant="caption">{provider.type}</Text>
        )}
      </div>

      {/* Status / key tail */}
      <div className="flex flex-1 items-center gap-2">
        {isConfigured ? (
          <>
            <CheckCircle className="h-3.5 w-3.5 text-[#10b981]" />
            <Text variant="caption">
              {provider.apiKeyTail ? `...${provider.apiKeyTail}` : "설정됨"}
            </Text>
          </>
        ) : (
          <Text variant="caption">미설정</Text>
        )}
      </div>

      {/* Action buttons (or custom actions slot) */}
      <div className="flex items-center gap-2 shrink-0">
        {actions ?? (
          <>
            {!isConfigured && onAdd && (
              <Button
                variant="outline"
                size="sm"
                onClick={onAdd}
                disabled={saving}
              >
                {saving ? "..." : "추가"}
              </Button>
            )}
            {onTest && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onTest}
                disabled={testing || !isConfigured}
              >
                {testing ? "..." : "테스트"}
              </Button>
            )}
            {onDelete && isConfigured && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                disabled={deleting}
              >
                {deleting ? "..." : "삭제"}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
