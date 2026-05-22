import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";
import { broadcast } from "@/lib/sse-broadcast";
import { layoutGetCore, layoutPutCore, type LayoutDeps } from "./core";

/**
 * Per-project shared dashboard layout.
 *
 * GET /api/dashboard/layout?projectId=<id>
 *   - Any project member (viewer+) can read.
 * PUT /api/dashboard/layout    body: { projectId, layout }
 *   - Editor+ only. Upserts the row, stamps `lastUpdatedBy = uid`, and
 *     broadcasts a `layout-updated` SSE message so other open clients can
 *     re-fetch.
 *
 * Business logic lives in ./core.ts behind LayoutDeps so it can be unit-tested
 * without Prisma / Firebase. See scripts/test-dashboard-layout-api.ts.
 */
function realDeps(): LayoutDeps {
  return {
    findMember: (projectId, userId) =>
      prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
        select: { role: true },
      }),
    findLayout: (projectId) =>
      prisma.dashboardLayout.findUnique({
        where: { projectId },
        select: {
          layout: true,
          lastUpdatedBy: true,
          updatedAt: true,
          updatedByUser: { select: { name: true, email: true } },
        },
      }),
    upsertLayout: (projectId, layout, uid) =>
      prisma.dashboardLayout.upsert({
        where: { projectId },
        update: { layout, lastUpdatedBy: uid },
        create: { projectId, layout, lastUpdatedBy: uid },
        select: { layout: true, lastUpdatedBy: true, updatedAt: true },
      }),
    broadcast,
  };
}

export const GET = authedHandler(async (req: NextRequest, uid: string) => {
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  const result = await layoutGetCore({ projectId, uid, deps: realDeps() });
  if (result.status === "validation")
    return apiError(req, ErrorCode.VALIDATION_FAILED, "projectId is required", { projectId: "missing" });
  if (result.status === "forbidden") return apiError(req, ErrorCode.FORBIDDEN, "Not a project member");
  return NextResponse.json({
    layout: result.layout,
    lastUpdatedBy: result.lastUpdatedBy,
    updatedAt: result.updatedAt,
    updatedByName: result.updatedByName,
  });
});

export const PUT = authedHandler(async (req: NextRequest, uid: string) => {
  const body = await req.json().catch(() => ({}));
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  const layout = typeof body.layout === "string" ? body.layout : "";
  const result = await layoutPutCore({ projectId, uid, layout, deps: realDeps() });
  if (result.status === "validation")
    return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", {
      projectId: projectId ? undefined : "projectId is required",
      layout: layout ? undefined : "layout is required",
    });
  if (result.status === "forbidden") return apiError(req, ErrorCode.FORBIDDEN, "Editor access required");
  return NextResponse.json({ success: true, updatedAt: result.updatedAt });
});
