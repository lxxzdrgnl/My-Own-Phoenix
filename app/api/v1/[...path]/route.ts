import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth-server";
import { PHOENIX_FETCH_TIMEOUT_MS } from "@/lib/config/timeouts";

const PHOENIX = process.env.PHOENIX_URL ?? "http://localhost:6006";

async function proxyToPhoenix(req: NextRequest, method: string) {
  const segments = req.nextUrl.pathname.replace("/api/v1/", "/v1/");
  const search = req.nextUrl.search;
  const url = `${PHOENIX}${segments}${search}`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  // Phoenix data is dynamic (spans/annotations change on every mutation) — never
  // let Next's data cache serve a stale upstream response.
  const options: RequestInit = { method, headers, cache: "no-store", signal: AbortSignal.timeout(PHOENIX_FETCH_TIMEOUT_MS) };

  if (method !== "GET" && method !== "HEAD") {
    options.body = await req.text();
  }

  try {
    const res = await fetch(url, options);
    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      // no-store so the browser doesn't serve a cached annotation/span list after
      // a mutation (e.g. deleting an annotation reflected only after a hard refresh).
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Proxy request failed" }, { status: 502 });
  }
}

export async function GET(req: NextRequest) { return proxyToPhoenix(req, "GET"); }
export async function POST(req: NextRequest) { return proxyToPhoenix(req, "POST"); }
export async function PUT(req: NextRequest) { return proxyToPhoenix(req, "PUT"); }
export async function PATCH(req: NextRequest) { return proxyToPhoenix(req, "PATCH"); }

// DELETE requires auth — only owner/editor can delete traces/annotations
export async function DELETE(req: NextRequest) {
  const uid = await verifyAuth(req);
  if (!uid) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // For trace/annotation deletion, verify project membership
  // Extract project name from path: /v1/traces/{id} or /v1/projects/{name}/span_annotations
  const path = req.nextUrl.pathname;
  const projectMatch = path.match(/\/v1\/projects\/([^/]+)\//);

  if (projectMatch && uid !== "internal-service") {
    const { prisma } = await import("@/lib/prisma");
    const phoenixProject = decodeURIComponent(projectMatch[1]);
    const project = await prisma.project.findFirst({
      where: { phoenixProject },
      select: { id: true },
    });

    if (project) {
      const member = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId: project.id, userId: uid } },
      });
      if (!member || !["owner", "editor"].includes(member.role)) {
        return NextResponse.json({ error: "Owner or editor access required" }, { status: 403 });
      }
    }
  }

  return proxyToPhoenix(req, "DELETE");
}
