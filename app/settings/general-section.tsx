"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState } from "@/components/ui/empty-state";
import { CheckCircle, Copy, Check, RefreshCw, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import {
  DEFAULT_PROMPT_TEMPLATE,
  PROMPT_TEMPLATE_KEY,
  PromptTemplate,
  parsePromptTemplate,
} from "@/lib/constants";

export function GeneralSection() {
  const { user } = useAuth();
  const t = useT();
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Profile nickname state
  const [nickname, setNickname] = useState("");
  const [savedNickname, setSavedNickname] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Default prompt template state
  const [template, setTemplate] = useState<PromptTemplate>(DEFAULT_PROMPT_TEMPLATE);
  const [savedTemplate, setSavedTemplate] = useState<PromptTemplate>(DEFAULT_PROMPT_TEMPLATE);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);

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
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileSaved(false);
    try {
      const res = await apiFetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nickname }),
      });
      if (res.ok) {
        setSavedNickname(nickname.trim());
        setNickname(nickname.trim());
        setProfileSaved(true);
        setTimeout(() => setProfileSaved(false), 2000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveTemplate = async () => {
    setSavingTemplate(true);
    setTemplateSaved(false);
    try {
      const res = await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [PROMPT_TEMPLATE_KEY]: JSON.stringify(template) }),
      });
      if (res.ok) {
        setSavedTemplate(template);
        setTemplateSaved(true);
        setTimeout(() => setTemplateSaved(false), 2000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingTemplate(false);
    }
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
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-semibold tracking-tight">{t.settings.account}</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t.settings.accountDesc}
        </p>
      </div>

      {loading && <LoadingState />}

      {!loading && (
        <div className="space-y-8">
          {/* Profile */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                {t.settings.profileSection}
              </h3>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="rounded-lg border px-5 py-4 space-y-3">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{t.settings.email}</p>
                <p className="mt-0.5 text-sm">{user?.email}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1.5">{t.settings.nickname}</p>
                <div className="flex items-center gap-2">
                  <Input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder={t.settings.nicknamePlaceholder}
                    className="max-w-xs"
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveProfile}
                    disabled={savingProfile || nickname.trim() === savedNickname}
                  >
                    {savingProfile && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                    {profileSaved ? t.settings.saved : t.common.save}
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {/* Default Prompt Template */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                {t.settings.promptTemplateSection}
              </h3>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="rounded-lg border px-5 py-4 space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t.settings.promptTemplateDesc}
              </p>
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
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveTemplate}
                  disabled={savingTemplate || !templateDirty}
                >
                  {savingTemplate && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                  {templateSaved && !templateDirty ? t.settings.saved : t.common.save}
                </Button>
                {templateSaved && !templateDirty && (
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                )}
              </div>
            </div>
          </section>

          {/* Connector Key */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground/70">
                {t.settings.connectorKey}
              </h3>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="rounded-lg border px-5 py-4 space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t.settings.connectorKeyDesc}
              </p>

              {newKey ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">
                      {newKey}
                    </code>
                    <button onClick={handleCopy} className="rounded-md p-2 hover:bg-accent">
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                  </div>
                  <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <CheckCircle className="h-3 w-3 text-emerald-500" />
                    {t.settings.saveKeyWarning}
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {hasKey ? (
                    <>
                      <code className="rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
                        pc_••••••••••••••••
                      </code>
                      <Button size="sm" variant="outline" onClick={handleGenerate} disabled={generating}>
                        {generating ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1.5 h-3 w-3" />}
                        {t.settings.regenerateKey}
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={handleGenerate} disabled={generating}>
                      {generating ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
                      {t.settings.generateKey}
                    </Button>
                  )}
                </div>
              )}

              <div className="mt-3 rounded-lg bg-muted/50 p-3">
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-2">{t.settings.usage}</p>
                <code className="text-xs text-muted-foreground font-mono leading-relaxed break-all">
                  phoenix-connector --key={newKey || "pc_..."} --agent=http://localhost:2024 --project=my-project
                </code>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
