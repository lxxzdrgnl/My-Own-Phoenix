import { useCallback, useState } from "react";

// Slide-out animation duration before the delete bar/checkboxes unmount.
const SLIDE_OUT_MS = 150;

export interface TraceSelection {
  /** Whether multi-select delete mode is active (controls checkbox rendering). */
  deleteMode: boolean;
  /** Drives slide-in/out animation; lags `deleteMode` on exit by SLIDE_OUT_MS. */
  deleteModeVisible: boolean;
  /** Currently selected trace IDs. */
  selectedIds: Set<string>;
  /** Enter delete mode, or animate out of it (clearing the selection). */
  toggleDeleteMode: () => void;
  /** Add/remove a single trace ID from the selection. */
  toggleSelect: (traceId: string) => void;
  /** Select all `allIds`, or clear if all are already selected. */
  toggleSelectAll: (allIds: string[]) => void;
  /** Hard-reset selection + mode without animation (use after a bulk delete). */
  reset: () => void;
}

/**
 * Multi-select / delete-mode state for trace lists. Mirrors the playground
 * delete-mode UX so the requests (traces) view stays consistent.
 */
export function useTraceSelection(): TraceSelection {
  const [deleteMode, setDeleteMode] = useState(false);
  const [deleteModeVisible, setDeleteModeVisible] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleDeleteMode = useCallback(() => {
    if (deleteMode) {
      setDeleteModeVisible(false);
      setTimeout(() => {
        setDeleteMode(false);
        setSelectedIds(new Set());
      }, SLIDE_OUT_MS);
    } else {
      setDeleteMode(true);
      setDeleteModeVisible(true);
      setSelectedIds(new Set());
    }
  }, [deleteMode]);

  const toggleSelect = useCallback((traceId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(traceId)) next.delete(traceId);
      else next.add(traceId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((allIds: string[]) => {
    setSelectedIds((prev) => (prev.size === allIds.length ? new Set() : new Set(allIds)));
  }, []);

  const reset = useCallback(() => {
    setSelectedIds(new Set());
    setDeleteModeVisible(false);
    setDeleteMode(false);
  }, []);

  return { deleteMode, deleteModeVisible, selectedIds, toggleDeleteMode, toggleSelect, toggleSelectAll, reset };
}
