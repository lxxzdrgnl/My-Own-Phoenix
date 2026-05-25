"use client";

import { useState, useEffect, useCallback } from "react";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState } from "@/components/ui/empty-state";
import { CheckCircle, Copy, Check, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { useFormSubmit } from "@/lib/hooks/use-form-submit";
import {
  DEFAULT_PROMPT_TEMPLATE,
  PROMPT_TEMPLATE_KEY,
  PromptTemplate,
  parsePromptTemplate,
} from "@/lib/constants";
import { Heading, Text } from "@/components/ui/typography";
import { Stack, Inline } from "@/components/ui/stack";
import { SectionCard } from "@/components/ui/section-card";
import { LoadingButton } from "@/components/ui/loading-button";
import { InlineError } from "@/components/ui/inline-error";
import { logger } from "@/lib/logger";
import { UI_FEEDBACK_RESET_MS } from "@/lib/config/timeouts";

export function GeneralSection() {
  const { user } = useAuth();
  const t = useT();
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState<string | null>(null);
  const { copied, copy } = useCopyToClipboard();
  const [generating, setGenerating] = useState(false);

  // Profile nickname state
  const [nickname, setNickname] = useState("");
  const [savedNickname, setSavedNickname] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);

  // Default prompt template state
  const [template, setTemplate] = useState<PromptTemplate>(DEFAULT_PROMPT_TEMPLATE);
  const [savedTemplate, setSavedTemplate] = useState<PromptTemplate>(DEFAULT_PROMPT_TEMPLATE);
  const [templateSaved, setTemplateSaved] = useState(false);

  const profileHook = useFormSubmit<{ name: string }>(
    "/api/user/profile",
    "PUT",
    {
      onSuccess: (_data) => {
        setSavedNickname(nickname.trim());
        setNickname(nickname.trim());
        setProfileSaved(true);
        setTimeout(() => setProfileSaved(false), UI_FEEDBACK_RESET_MS);
      },
    }
  );

  const templateHook = useFormSubmit<Record<string, string>>(
    "/api/settings",
    "PUT",
    {
      onSuccess: (_data) => {
        setSavedTemplate(template);
        setTemplateSaved(true);
        setTimeout(() => setTemplateSaved(false), UI_FEEDBACK_RESET_MS);
      },
    }
  );

  const loadStatus = useCallback(async () => {
    try {
      const [keyRes, profileRes, settingsRes] = await Promise.all([
        apiFetch("/api/user/connector-key"),
        apiFetch("/api/user/profile"),
        apiFetch("/api/settings"),
      ]);
      if (keyRes.ok) {
        const data = await keyRes.json();
        setHasKey(data.hasKey);
      }
      if (profileRes.ok) {
        const data = await profileRes.json();
        setNickname(data.name || "");
        setSavedNickname(data.name || "");
      }
      if (settingsRes.ok) {
        const data = await settingsRes.json();
        const t = parsePromptTemplate(data[PROMPT_TEMPLATE_KEY]);
        setTemplate(t);
        setSavedTemplate(t);
      }
    } catch (e) {
      logger.error("settings load status failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleSaveProfile = () => {
    setProfileSaved(false);
    profileHook.submit({ name: nickname });
  };

  const handleSaveTemplate = () => {
    setTemplateSaved(false);
    templateHook.submit({ [PROMPT_TEMPLATE_KEY]: JSON.stringify(template) });
  };

  const templateDirty =
    template.system !== savedTemplate.system || template.context !== savedTemplate.context;

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await apiFetch("/api/user/connector-key", {
        method: hasKey ? "PUT" : "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setNewKey(data.key);
        setHasKey(true);
      }
    } catch (e) {
      logger.error("settings generate key failed", e);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (newKey) {
      void copy(newKey);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <Heading level="section">{t.settings.account}</Heading>
        <Text variant="caption" className="mt-1.5">
          {t.settings.accountDesc}
        </Text>
      </div>

      {loading && <LoadingState />}

      {!loading && (
        <Stack gap="xl">
          {/* Profile */}
          <SectionCard title={t.settings.profileSection}>
            <div className="rounded-lg border px-5 py-4">
              <Stack gap="sm">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{t.settings.email}</p>
                  <p className="mt-0.5 text-sm">{user?.email}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">{t.settings.nickname}</p>
                  <Inline gap="sm">
                    <Input
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder={t.settings.nicknamePlaceholder}
                      className="max-w-xs"
                    />
                    <LoadingButton
                      size="sm"
                      onClick={handleSaveProfile}
                      loading={profileHook.saving}
                      disabled={profileHook.saving || nickname.trim() === savedNickname}
                    >
                      {profileSaved ? t.settings.saved : t.common.save}
                    </LoadingButton>
                  </Inline>
                  <InlineError>{profileHook.error}</InlineError>
                </div>
              </Stack>
            </div>
          </SectionCard>

          {/* Default Prompt Template */}
          <SectionCard title={t.settings.promptTemplateSection}>
            <div className="rounded-lg border px-5 py-4">
              <Stack gap="sm">
                <Text variant="caption" className="leading-relaxed">
                  {t.settings.promptTemplateDesc}
                </Text>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">
                    {t.settings.promptSystemLabel}
                  </p>
                  <Textarea
                    value={template.system}
                    onChange={(e) => setTemplate((p) => ({ ...p, system: e.target.value }))}
                    placeholder={t.settings.promptSystemPlaceholder}
                    rows={4}
                    className="text-xs"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">
                    {t.settings.promptContextLabel}
                  </p>
                  <Textarea
                    value={template.context}
                    onChange={(e) => setTemplate((p) => ({ ...p, context: e.target.value }))}
                    placeholder={t.settings.promptContextPlaceholder}
                    rows={4}
                    className="text-xs"
                  />
                </div>
                <Inline gap="sm">
                  <LoadingButton
                    size="sm"
                    onClick={handleSaveTemplate}
                    loading={templateHook.saving}
                    disabled={templateHook.saving || !templateDirty}
                  >
                    {templateSaved && !templateDirty ? t.settings.saved : t.common.save}
                  </LoadingButton>
                  {templateSaved && !templateDirty && (
                    <CheckCircle className="h-3.5 w-3.5 text-[#10b981]" />
                  )}
                  <InlineError>{templateHook.error}</InlineError>
                </Inline>
              </Stack>
            </div>
          </SectionCard>

          {/* Connector Key */}
          <SectionCard title={t.settings.connectorKey}>
            <div className="rounded-lg border px-5 py-4">
              <Stack gap="sm">
                <Text variant="caption" className="leading-relaxed">
                  {t.settings.connectorKeyDesc}
                </Text>

                {newKey ? (
                  <Stack gap="xs">
                    <Inline gap="sm">
                      <code className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">
                        {newKey}
                      </code>
                      <button onClick={handleCopy} className="rounded-md p-2 hover:bg-accent">
                        {copied ? <Check className="h-3.5 w-3.5 text-[#10b981]" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                      </button>
                    </Inline>
                    <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <CheckCircle className="h-3 w-3 text-[#10b981]" />
                      {t.settings.saveKeyWarning}
                    </p>
                  </Stack>
                ) : (
                  <Inline gap="md">
                    {hasKey ? (
                      <>
                        <code className="rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
                          pc_••••••••••••••••
                        </code>
                        <LoadingButton
                          size="sm"
                          variant="outline"
                          onClick={handleGenerate}
                          loading={generating}
                          disabled={generating}
                        >
                          {!generating && <RefreshCw className="mr-1.5 h-3 w-3" />}
                          {t.settings.regenerateKey}
                        </LoadingButton>
                      </>
                    ) : (
                      <LoadingButton
                        size="sm"
                        onClick={handleGenerate}
                        loading={generating}
                        disabled={generating}
                      >
                        {t.settings.generateKey}
                      </LoadingButton>
                    )}
                  </Inline>
                )}

                <div className="mt-3 rounded-lg bg-muted/50 p-3">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-2">{t.settings.usage}</p>
                  <code className="text-xs text-muted-foreground font-mono leading-relaxed break-all">
                    phoenix-connector --key={newKey || "pc_..."} --agent=http://localhost:2024 --project=my-project
                  </code>
                </div>
              </Stack>
            </div>
          </SectionCard>
        </Stack>
      )}
    </div>
  );
}
