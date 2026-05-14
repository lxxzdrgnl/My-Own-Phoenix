import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";
import { rateLimit } from "@/lib/rate-limit";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// POST /api/collect — OTel trace ingestion proxy
export async function POST(req: NextRequest) {
  // Extract API key from Authorization header
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
  }

  const apiKey = authHeader.slice(7);
  if (!apiKey.startsWith("pt_")) {
    return NextResponse.json({ error: "Invalid key format. Use a trace key (pt_*)" }, { status: 401 });
  }

  // Hash and look up project
  const keyHash = hashKey(apiKey);
  const project = await prisma.project.findFirst({
    where: { traceKeyHash: keyHash },
    select: { id: true, slug: true, phoenixProject: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Invalid trace key" }, { status: 401 });
  }

  // Rate limit: 1000 req/min per project
  const { allowed } = rateLimit(`collect:${project.id}`, 1000, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // Forward to Phoenix
  const phoenixUrl = process.env.PHOENIX_URL || "http://localhost:6006";
  const body = await req.arrayBuffer();
  const contentType = req.headers.get("Content-Type") || "application/json";

  try {
    const phoenixRes = await fetch(`${phoenixUrl}/v1/traces`, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
      },
      body,
    });

    if (!phoenixRes.ok) {
      const text = await phoenixRes.text();
      return NextResponse.json(
        { error: "Phoenix rejected the trace", detail: text },
        { status: phoenixRes.status },
      );
    }

    return NextResponse.json({ ok: true, project: project.phoenixProject });
  } catch (e) {
    console.error("Failed to forward trace to Phoenix:", e);
    return NextResponse.json({ error: "Failed to connect to trace backend" }, { status: 502 });
  }
}
