"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchTraceTrees, type TraceTree } from "@/lib/phoenix";
import { SpanTreeView } from "@/components/trace-tree";
import { LoadingState } from "@/components/ui/empty-state";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useProjectOptional } from "@/lib/project-context";
import { TraceDetailTabs } from "@/components/trace-detail";
import { PageContainer } from "@/components/ui/page-container";
import { Heading, Text } from "@/components/ui/typography";
import { Stack, Inline } from "@/components/ui/stack";
import { logger } from "@/lib/logger";

export function TraceDetailView({ projectName, traceId }: { projectName: string; traceId: string }) {
  const t = useT();
  const projectCtx = useProjectOptional();
  const [traces, setTraces] = useState<TraceTree[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchTraceTrees(projectName);
      setTraces(result.filter((tt) => tt.traceId === traceId));
    } catch (e) {
      logger.error("trace detail load failed", e);
    }
    setLoading(false);
  }, [projectName, traceId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageContainer>
      <Inline gap="sm" className="mb-4">
        <Link
          href={`/projects/${encodeURIComponent(projectName)}`}
          className="rounded p-1.5 transition-colors hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Stack gap="xs">
          <Heading level="page">{t.projects.traceDetail}</Heading>
          <Text variant="mono" className="text-muted-foreground">{traceId}</Text>
        </Stack>
      </Inline>
      {loading && <LoadingState />}
      {!loading && traces.length > 0 && (
        <Stack gap="md">
          <TraceDetailTabs trace={traces[0]} projectId={projectCtx?.id} onRefresh={load} />
          <SpanTreeView traces={traces} projectName={projectName} onRefresh={load} />
        </Stack>
      )}
      {!loading && traces.length === 0 && (
        <Text variant="body" className="text-muted-foreground">{t.projects.traceNotFound}</Text>
      )}
    </PageContainer>
  );
}
