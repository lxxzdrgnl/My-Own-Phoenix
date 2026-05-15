import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

interface UseFormSubmitOptions {
  onSuccess?: (data: any) => void;
}

export function useFormSubmit<T = Record<string, unknown>>(
  endpoint: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE" = "POST",
  options?: UseFormSubmitOptions
) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (data?: T): Promise<any | null> => {
    setSaving(true);
    setError(undefined);
    try {
      const res = await apiFetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: data ? JSON.stringify(data) : undefined,
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `Error ${res.status}`;
        try { msg = JSON.parse(text).message || msg; } catch { /* ignore */ }
        setError(msg);
        return null;
      }
      const result = await res.json().catch(() => ({}));
      options?.onSuccess?.(result);
      return result;
    } catch {
      setError("Network error");
      return null;
    } finally {
      setSaving(false);
    }
  };

  return { submit, saving, error, setError, clearError: () => setError(undefined) };
}
