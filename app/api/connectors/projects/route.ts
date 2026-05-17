import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/connectors/projects?keyHash=xxx — list projects for connector key owner
export async function GET(req: NextRequest) {
  const keyHash = req.nextUrl.searchParams.get("keyHash");
  if (!keyHash) {
    return NextResponse.json({ error: "keyHash required" }, { status: 400 });
  }

  const user = await prisma.user.findFirst({
    where: { relayKeyHash: keyHash },
  });
  if (!user) {
    return NextResponse.json({ error: "Invalid key" }, { status: 401 });
  }

  const memberships = await prisma.projectMember.findMany({
    where: { userId: user.id },
    include: { project: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    projects: memberships.map((m) => ({
      name: m.project.name,
      slug: m.project.slug,
      role: m.role,
    })),
  });
}
