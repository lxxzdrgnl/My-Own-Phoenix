import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";

export const GET = authedHandler(async (req: NextRequest) => {
  const userId = req.nextUrl.searchParams.get("userId");
  const project = req.nextUrl.searchParams.get("project") ?? "default";
  if (!userId) {
    return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", { userId: "userId is required" });
  }

  const record = await prisma.dashboardLayout.findUnique({
    where: { userId_projectName: { userId, projectName: project } },
  });

  return NextResponse.json({ layout: record?.layout ?? null });
});

export const PUT = authedHandler(async (req: NextRequest) => {
  const { userId, project, layout } = await req.json();

  if (!userId || !layout) {
    return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", {
      fields: "userId and layout are required",
    });
  }

  const proj = project ?? "default";

  const record = await prisma.dashboardLayout.upsert({
    where: { userId_projectName: { userId, projectName: proj } },
    update: { layout },
    create: { userId, projectName: proj, layout },
  });

  return NextResponse.json({ layout: record.layout });
});
