import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";
import { requireProjectMember } from "@/lib/api-helpers";
import { fetchPromptsScopedToProject } from "@/lib/phoenix-server";
import { ensureDefaultPromptForProject } from "@/lib/project-prompt-seed";

// GET /api/projects/[id]/prompts — list Phoenix prompts (with versions) that are
// mapped to this project via ProjectPrompt. The playground and prompts manager
// MUST use this endpoint; the raw Phoenix /v1/prompts is global and forbidden
// from the project-scoped UI.
export const GET = authedHandler(
  async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string }> }) => {
    const { id: projectId } = await params;

    if (uid !== "internal-service") {
      const check = await requireProjectMember(req, projectId, uid);
      if (check instanceof NextResponse) return check;
    }

    let mappings = await prisma.projectPrompt.findMany({
      where: { projectId },
      select: { phoenixName: true },
    });

    // Lazy seed: every project must have at least one starter prompt sourced
    // from its owner's General Settings template. Pre-existing projects (those
    // created before this feature shipped) wouldn't have a mapping yet — we
    // create it on the first read.
    if (mappings.length === 0) {
      try {
        const seeded = await ensureDefaultPromptForProject(projectId);
        if (seeded) {
          mappings = await prisma.projectPrompt.findMany({
            where: { projectId },
            select: { phoenixName: true },
          });
        }
      } catch (err) {
        console.error("[projects/prompts] lazy seed failed:", err);
      }
    }

    const names = mappings.map((m) => m.phoenixName);
    if (names.length === 0) return NextResponse.json({ prompts: [] });

    try {
      const prompts = await fetchPromptsScopedToProject(names);
      return NextResponse.json({ prompts });
    } catch (err) {
      console.error("[projects/prompts] phoenix fetch failed:", err);
      return apiError(req, ErrorCode.PHOENIX_ERROR, "Failed to load prompts from Phoenix");
    }
  },
);

// POST /api/projects/[id]/prompts — register an existing Phoenix prompt name as
// belonging to this project. The Phoenix prompt itself must already exist (the
// client creates it via the Phoenix proxy first). Phoenix's prompt-name space
// is global and our @@unique([phoenixName]) means a name can only ever live in
// one project, which is the enforcement that nothing leaks across projects.
export const POST = authedHandler(
  async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string }> }) => {
    const { id: projectId } = await params;

    if (uid !== "internal-service") {
      const check = await requireProjectMember(req, projectId, uid, "editor");
      if (check instanceof NextResponse) return check;
    }

    const { phoenixName } = (await req.json()) as { phoenixName?: string };
    if (!phoenixName) {
      return apiError(req, ErrorCode.VALIDATION_FAILED, "phoenixName required", { phoenixName: "required" });
    }

    try {
      const mapping = await prisma.projectPrompt.create({
        data: { projectId, phoenixName },
      });
      return NextResponse.json({ mapping });
    } catch (err: any) {
      if (err?.code === "P2002") {
        return apiError(
          req,
          ErrorCode.DUPLICATE_RESOURCE,
          `Prompt name "${phoenixName}" is already mapped to a project`,
        );
      }
      throw err;
    }
  },
);

// DELETE /api/projects/[id]/prompts?name=… — remove a prompt's mapping. The
// Phoenix prompt itself is deleted separately via the /v1 proxy.
export const DELETE = authedHandler(
  async (req: NextRequest, uid: string, { params }: { params: Promise<{ id: string }> }) => {
    const { id: projectId } = await params;
    const phoenixName = req.nextUrl.searchParams.get("name");
    if (!phoenixName) {
      return apiError(req, ErrorCode.VALIDATION_FAILED, "name query param required");
    }

    if (uid !== "internal-service") {
      const check = await requireProjectMember(req, projectId, uid, "editor");
      if (check instanceof NextResponse) return check;
    }

    await prisma.projectPrompt.deleteMany({
      where: { projectId, phoenixName },
    });
    return NextResponse.json({ ok: true });
  },
);
