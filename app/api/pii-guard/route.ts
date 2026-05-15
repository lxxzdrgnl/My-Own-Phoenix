import { NextRequest, NextResponse } from "next/server";
import { runGuard } from "@/lib/pii-guard";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, stage2 } = body as {
      text: string;
      stage2?: "auto" | "force" | "skip";
    };

    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const result = runGuard(text, stage2 ?? "auto");
    return NextResponse.json(result);
  } catch (e) {
    console.error("[pii-guard]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown error" },
      { status: 500 },
    );
  }
}
