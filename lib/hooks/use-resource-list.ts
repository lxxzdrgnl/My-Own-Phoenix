import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";

interface UseResourceListOptions<T> {
  dataKey?: string;
  transform?: (raw: any) => T[];
  defaultParams?: Record<string, string | number>;
}

export function useResourceList<T>(
  endpoint: string,
  optionsOrDataKey?: UseResourceListOptions<T> | string,
) {
  const opts: UseResourceListOptions<T> =
    typeof optionsOrDataKey === "string"
      ? { dataKey: optionsOrDataKey }
      : (optionsOrDataKey ?? {});
  const { dataKey = "items", transform, defaultParams } = opts;

  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      let url = endpoint;
      if (defaultParams && Object.keys(defaultParams).length > 0) {
        const qs = new URLSearchParams(
          Object.entries(defaultParams).map(([k, v]) => [k, String(v)]),
        ).toString();
        url = `${endpoint}${endpoint.includes("?") ? "&" : "?"}${qs}`;
      }
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        const arr = transform
          ? transform(data)
          : Array.isArray(data)
            ? (data as T[])
            : ((data[dataKey] ?? []) as T[]);
        setItems(arr);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [endpoint, dataKey, transform, defaultParams]);

  useEffect(() => {
    void load();
  }, [load]);

  return { items, setItems, loading, reload: load };
}
