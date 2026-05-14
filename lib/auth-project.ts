import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-server";
import { apiError, ErrorCode } from "@/lib/api-error";

const ROLE_HIERARCHY: Record<string, number> = {
  viewer: 0,
  editor: 1,
  owner: 2,
};

function hasMinRole(actual: string, required: string): boolean {
  return (ROLE_HIERARCHY[actual] ?? -1) >= (ROLE_HIERARCHY[required] ?? 999);
}

/**
 * Require authenticated user with project membership at or above minRole.
 * Returns { uid, projectId, role } or a NextResponse error.
 */
export async function requireProjectAccess(
  req: NextRequest,
  projectId: string,
  minRole: "viewer" | "editor" | "owner" = "viewer",
): Promise<{ uid: string; projectId: string; role: string } | NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const uid = auth;

  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: uid } },
  });

  if (!member) {
    return apiError(req, ErrorCode.FORBIDDEN, "Not a project member");
  }

  if (!hasMinRole(member.role, minRole)) {
    return apiError(req, ErrorCode.FORBIDDEN, "Insufficient role");
  }

  return { uid, projectId, role: member.role };
}

/**
 * Resolve project from slug. Returns project or null.
 */
export async function resolveProject(
  slug: string,
): Promise<{ id: string; slug: string; name: string } | null> {
  return prisma.project.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });
}
