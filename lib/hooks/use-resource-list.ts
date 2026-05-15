import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api-client";

export function useResourceList<T>(endpoint: string, dataKey: string = "items") {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        setItems(Array.isArray(data) ? data : (data[dataKey] || []));
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [endpoint, dataKey]);

  useEffect(() => { load(); }, [load]);

  return { items, setItems, loading, reload: load };
}
