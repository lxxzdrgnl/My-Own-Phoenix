"use client";

import { useState, useCallback, useEffect } from "react";
import { apiFetch } from "@/lib/api-client";
import { logger } from "@/lib/logger";

/**
 * Hook for settings-style forms with load/save/dirty tracking.
 */
export function useSettingsForm<T extends Record<string, string>>(defaults: T) {
  const [settings, setSettings] = useState<T>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/settings");
      const data = await res.json();
      const merged = { ...defaults } as T;
      for (const key of Object.keys(defaults)) {
        if (data[key] !== undefined) (merged as any)[key] = data[key];
      }
      setSettings(merged);
    } catch (e) { logger.error("useSettingsForm load failed", e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function update(key: keyof T, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      await apiFetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setDirty(false);
    } catch (e) { logger.error("useSettingsForm save failed", e); }
    setSaving(false);
  }

  return { settings, loading, saving, saved, dirty, update, save };
}

export { useFormSubmit } from "./hooks/use-form-submit";
export { useResourceList } from "./hooks/use-resource-list";
