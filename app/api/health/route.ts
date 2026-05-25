import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "connected" });
  } catch (e) {
    logger.error("health check DB query failed", e, { route: "GET /api/health" });
    return NextResponse.json({ status: "error", db: "disconnected" }, { status: 500 });
  }
}
