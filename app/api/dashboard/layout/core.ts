import type { SseMessage } from "@/lib/sse-broadcast";

/**
 * Dependency-injected core for the per-project dashboard layout API.
 * The real implementation in route.ts wires Prisma + sse-broadcast;
 * scripts/test-dashboard-layout-api.ts wires in-memory mocks to verify
 * role gating, broadcast emission, and the GET/PUT contract.
 */
export interface LayoutDeps {
  findMember(projectId: string, userId: string): Promise<{ role: string } | null>;
  findLayout(projectId: string): Promise<{
    layout: string;
    lastUpdatedBy: string | null;
    updatedAt: Date;
    updatedByUser?: { name: string | null; email: string } | null;
  } | null>;
  upsertLayout(
    projectId: string,
    layout: string,
    uid: string,
  ): Promise<{ layout: string; lastUpdatedBy: string | null; updatedAt: Date }>;
  broadcast(projectId: string, msg: SseMessage): void;
}

export type GetResult =
  | {
      status: "ok";
      layout: string | null;
      lastUpdatedBy: string | null;
      updatedAt: string | null;
      updatedByName: string | null;
    }
  | { status: "forbidden" }
  | { status: "validation" };

export async function layoutGetCore(input: {
  projectId: string;
  uid: string;
  deps: LayoutDeps;
}): Promise<GetResult> {
  const { projectId, uid, deps } = input;
  if (!projectId) return { status: "validation" };
  const member = await deps.findMember(projectId, uid);
  if (!member) return { status: "forbidden" };
  const row = await deps.findLayout(projectId);
  return {
    status: "ok",
    layout: row?.layout ?? null,
    lastUpdatedBy: row?.lastUpdatedBy ?? null,
    updatedAt: row?.updatedAt.toISOString() ?? null,
    updatedByName: row?.updatedByUser?.name ?? row?.updatedByUser?.email ?? null,
  };
}

export type PutResult =
  | { status: "ok"; updatedAt: string }
  | { status: "forbidden" }
  | { status: "validation" };

export async function layoutPutCore(input: {
  projectId: string;
  uid: string;
  layout: string;
  deps: LayoutDeps;
}): Promise<PutResult> {
  const { projectId, uid, layout, deps } = input;
  if (!projectId || !layout) return { status: "validation" };
  const member = await deps.findMember(projectId, uid);
  if (!member) return { status: "forbidden" };
  if (!["owner", "editor"].includes(member.role)) return { status: "forbidden" };
  const saved = await deps.upsertLayout(projectId, layout, uid);
  deps.broadcast(projectId, {
    type: "layout-updated",
    projectId,
    savedBy: uid,
    savedAt: saved.updatedAt.toISOString(),
  });
  return { status: "ok", updatedAt: saved.updatedAt.toISOString() };
}
