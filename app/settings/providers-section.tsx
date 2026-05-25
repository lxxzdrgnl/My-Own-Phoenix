"use client";
import { apiFetch } from "@/lib/api-client";

import { useState, useCallback, useEffect } from "react";
import { CheckCircle, XCircle, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/empty-state";
import { ProviderIcon } from "@/components/provider-icon";
import { useT } from "@/lib/i18n";
import { useFormSubmit } from "@/lib/hooks/use-form-submit";
import { Heading, Text } from "@/components/ui/typography";
import { Stack } from "@/components/ui/stack";
import { InlineError } from "@/components/ui/inline-error";
import { logger } from "@/lib/logger";

interface ProviderEntry {
  id: string;
  provider: string;
  apiKey: string;
  isActive: boolean;
}

const ALL_PROVIDERS = [
  { key: "openai", label: "OpenAI", placeholder: "sk-..." },
  { key: "anthropic", label: "Anthropic", placeholder: "sk-ant-..." },
  { key: "google", label: "Google", placeholder: "AIza..." },
  { key: "xai", label: "xAI", placeholder: "xai-..." },
] as const;

export function ProvidersSection() {
  const t = useT();
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/providers");
      const data = await res.json();
      setProviders(data.items ?? []);
    } catch (e) { logger.error("load providers failed", e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const providerMap = new Map<string, ProviderEntry>();
  for (const p of providers) providerMap.set(p.provider, p);

  const configuredCount = providers.length;

  return (
    <Stack gap="lg">
      <div>
        <Heading level="section">{t.settings.providers}</Heading>
        <Text variant="caption" className="mt-1.5">
          {t.settings.providersDesc}
        </Text>
      </div>

      {loading && <LoadingState />}

      {!loading && (
        <Stack gap="lg">
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Heading level="sub" as="h3">
                {t.settings.providersLabel}
              </Heading>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {configuredCount}/{ALL_PROVIDERS.length}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <Stack gap="sm">
              {ALL_PROVIDERS.map(({ key, label, placeholder }) => (
                <ProviderRow
                  key={key}
                  providerKey={key}
                  label={label}
                  placeholder={placeholder}
                  existing={providerMap.get(key) ?? null}
                  onUpdate={load}
                />
              ))}
            </Stack>
          </section>
        </Stack>
      )}
    </Stack>
  );
}

// ── Individual Provider Row ──

function ProviderRow({
  providerKey,
  label,
  placeholder,
  existing,
  onUpdate,
}: {
  providerKey: string;
  label: string;
  placeholder: string;
  existing: ProviderEntry | null;
  onUpdate: () => void;
}) {
  const t = useT();
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);

  const isConfigured = !!existing;

  // POST: 신규 추가
  const addHook = useFormSubmit<{ provider: string; apiKey: string }>(
    "/api/providers",
    "POST",
    {
      onSuccess: () => {
        setApiKey("");
        setTestResult(null);
        onUpdate();
      },
    }
  );

  // PUT: 기존 키 교체 (existing.id 기반 dynamic endpoint)
  const updateHook = useFormSubmit<{ apiKey: string }>(
    existing ? `/api/providers/${existing.id}` : "/api/providers",
    "PUT",
    {
      onSuccess: () => {
        setApiKey("");
        setTestResult(null);
        onUpdate();
      },
    }
  );

  // DELETE: 키 제거
  const deleteHook = useFormSubmit(
    existing ? `/api/providers/${existing.id}` : "/api/providers",
    "DELETE",
    {
      onSuccess: () => {
        setTestResult(null);
        onUpdate();
      },
    }
  );

  // POST: 연결 테스트
  const testHook = useFormSubmit<{ provider: string; apiKey: string }>(
    "/api/providers/test",
    "POST",
    {
      onSuccess: (data) => {
        setTestResult(data as { success: boolean; error?: string });
      },
    }
  );

  async function handleSave() {
    if (!apiKey.trim()) return;
    setTestResult(null);
    if (existing) {
      await updateHook.submit({ apiKey });
    } else {
      await addHook.submit({ provider: providerKey, apiKey });
    }
  }

  async function handleTest() {
    if (!apiKey.trim()) return;
    setTestResult(null);
    const result = await testHook.submit({ provider: providerKey, apiKey: apiKey.trim() });
    if (!result) {
      // hook이 에러를 처리했지만 testResult도 업데이트
      setTestResult({ success: false, error: testHook.error || "Network error" });
    }
  }

  async function handleDelete() {
    if (!existing) return;
    await deleteHook.submit();
  }

  const saving = existing ? updateHook.saving : addHook.saving;
  const saveError = existing ? updateHook.error : addHook.error;

  return (
    <div className="group rounded-lg border transition-colors hover:border-foreground/15">
      <div className="px-4 py-3 space-y-2.5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60">
            <ProviderIcon provider={providerKey} size={18} />
          </div>
          <p className="flex-1 text-sm font-semibold">{label}</p>
          {isConfigured ? (
            <span className="flex items-center gap-1 text-[11px] font-medium text-[#10b981]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
              {t.settings.active}
            </span>
          ) : (
            <span className="text-[11px] font-medium text-muted-foreground/40">
              {t.settings.notConfigured}
            </span>
          )}
        </div>

        {/* Configured: masked key + remove */}
        {isConfigured && (
          <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-1.5">
            <p className="flex-1 font-mono text-[11px] text-muted-foreground">{existing.apiKey}</p>
            <button
              onClick={handleDelete}
              disabled={deleteHook.saving}
              className="text-[11px] font-medium text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              {deleteHook.saving ? "..." : t.settings.remove}
            </button>
          </div>
        )}

        {/* API Key input */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Input
              type={showKey ? "text" : "password"}
              placeholder={isConfigured ? t.settings.newKeyToReplace : placeholder}
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
              className="pr-8 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground"
            >
              {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3 text-xs"
            onClick={handleTest}
            disabled={testHook.saving || !apiKey.trim()}
          >
            {testHook.saving ? <Loader2 className="h-3 w-3 animate-spin" /> : t.settings.test}
          </Button>
          <Button
            size="sm"
            className="h-9 px-3 text-xs"
            onClick={handleSave}
            disabled={saving || !apiKey.trim()}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : isConfigured ? t.settings.replace : t.common.save}
          </Button>
        </div>

        {/* Save error */}
        <InlineError>{saveError}</InlineError>

        {/* Test result */}
        {testResult && (
          <div className={`flex items-center gap-1.5 text-[11px] font-medium ${
            testResult.success ? "text-[#10b981]" : "text-[#ef4444]"
          }`}>
            {testResult.success ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {testResult.success ? t.settings.connectionVerified : testResult.error || t.settings.connectionFailed}
          </div>
        )}
      </div>
    </div>
  );
}
