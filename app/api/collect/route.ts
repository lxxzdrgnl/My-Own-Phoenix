import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";
import { rateLimit } from "@/lib/rate-limit";
import { RATE_LIMIT_COLLECT } from "@/lib/config/rate-limits";
import {
  decodeOtlpProtobufTraces,
  encodeOtlpTraceResponse,
} from "@/lib/otlp-proto";
import { logger } from "@/lib/logger";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Convert OTLP JSON resourceSpans → Phoenix span format.
 * Extracts spans from OTLP structure and flattens attributes.
 */
function otlpToPhoenixSpans(otlp: any): any[] {
  const spans: any[] = [];

  for (const rs of otlp.resourceSpans ?? []) {
    // Collect resource attributes
    const resourceAttrs: Record<string, any> = {};
    for (const attr of rs.resource?.attributes ?? []) {
      resourceAttrs[attr.key] = extractValue(attr.value);
    }

    for (const ss of rs.scopeSpans ?? []) {
      for (const span of ss.spans ?? []) {
        // Flatten span attributes
        const attrs: Record<string, any> = { ...resourceAttrs };
        for (const attr of span.attributes ?? []) {
          attrs[attr.key] = extractValue(attr.value);
        }

        // Map OTLP span kind number to string
        const kindMap: Record<number, string> = {
          0: "UNSPECIFIED", 1: "INTERNAL", 2: "SERVER", 3: "CLIENT", 4: "PRODUCER", 5: "CONSUMER",
        };

        // Map openinference span kind from attributes
        const oiKind = attrs["openinference.span.kind"] ?? kindMap[span.kind] ?? "CHAIN";

        // Convert events
        const events = (span.events ?? []).map((e: any) => ({
          name: e.name,
          timestamp: convertTimestamp(e.timeUnixNano),
          attributes: Object.fromEntries(
            (e.attributes ?? []).map((a: any) => [a.key, extractValue(a.value)])
          ),
        }));

        spans.push({
          name: span.name,
          context: {
            trace_id: span.traceId,
            span_id: span.spanId,
          },
          span_kind: oiKind,
          parent_id: span.parentSpanId || null,
          start_time: convertTimestamp(span.startTimeUnixNano),
          end_time: convertTimestamp(span.endTimeUnixNano),
          status_code: span.status?.code === 2 ? "ERROR" : "OK",
          status_message: span.status?.message ?? "",
          attributes: attrs,
          events,
        });
      }
    }
  }

  return spans;
}

function extractValue(v: any): any {
  if (!v) return "";
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.intValue !== undefined) return Number(v.intValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.boolValue !== undefined) return v.boolValue;
  if (v.arrayValue) return (v.arrayValue.values ?? []).map(extractValue);
  if (v.kvlistValue) {
    const obj: Record<string, any> = {};
    for (const kv of v.kvlistValue.values ?? []) obj[kv.key] = extractValue(kv.value);
    return obj;
  }
  return "";
}

function convertTimestamp(nanos: string | number): string {
  // nanoseconds to milliseconds
  const ms = Number(nanos) / 1_000_000;
  return new Date(ms).toISOString();
}

// POST /api/collect — OTel trace ingestion proxy
export async function POST(req: NextRequest) {
  // Extract API key
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing Authorization header. Use: Authorization: Bearer pt_xxx" }, { status: 401 });
  }

  const apiKey = authHeader.slice(7);
  if (!apiKey.startsWith("pt_")) {
    return NextResponse.json({ error: "Invalid key format. Use a trace key (pt_*)" }, { status: 401 });
  }

  // Look up project by key hash
  const keyHash = hashKey(apiKey);
  const project = await prisma.project.findFirst({
    where: { traceKeyHash: keyHash },
    select: { id: true, phoenixProject: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Invalid trace key" }, { status: 401 });
  }

  if (!project.phoenixProject) {
    return NextResponse.json({ error: "Project has no Phoenix project configured" }, { status: 400 });
  }

  // Rate limit
  const { allowed } = rateLimit(`collect:${project.id}`, RATE_LIMIT_COLLECT.max, RATE_LIMIT_COLLECT.windowMs);
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // Parse OTLP body. Accept both OTLP/HTTP transport encodings:
  //   - application/x-protobuf  → ExportTraceServiceRequest (binary, OTel default)
  //   - application/json        → OTLP/JSON
  // Anything else is treated as JSON for backward compatibility with clients
  // that omit the header.
  const contentType = req.headers.get("Content-Type") ?? "";
  const wantsProtobuf = contentType.includes("application/x-protobuf");
  let otlp: any;
  if (wantsProtobuf) {
    try {
      const buf = new Uint8Array(await req.arrayBuffer());
      otlp = decodeOtlpProtobufTraces(buf);
    } catch (e) {
      logger.error("collect protobuf decode failed", e, { route: "POST /api/collect" });
      return NextResponse.json(
        { error: "Invalid OTLP protobuf body" },
        { status: 400 },
      );
    }
  } else {
    try {
      otlp = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }
  }

  // OTLP/HTTP success responses must use the same encoding as the request,
  // shaped as an ExportTraceServiceResponse (empty on full success). Error
  // bodies are left as human-readable JSON since OTel clients only inspect
  // the status code on 4xx/5xx.
  const successResponse = (spansCount: number) => {
    if (wantsProtobuf) {
      return new Response(Buffer.from(encodeOtlpTraceResponse()), {
        status: 200,
        headers: { "Content-Type": "application/x-protobuf" },
      });
    }
    return NextResponse.json({
      ok: true,
      spans: spansCount,
      project: project.phoenixProject,
    });
  };

  const spans = otlpToPhoenixSpans(otlp);
  if (spans.length === 0) {
    return successResponse(0);
  }

  // Send to Phoenix under the correct project
  const phoenixUrl = process.env.PHOENIX_URL || "http://localhost:6006";
  try {
    const phoenixRes = await fetch(
      `${phoenixUrl}/v1/projects/${encodeURIComponent(project.phoenixProject)}/spans`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: spans }),
      },
    );

    if (!phoenixRes.ok) {
      const text = await phoenixRes.text();
      logger.error("collect Phoenix rejected spans", undefined, { route: "POST /api/collect", status: phoenixRes.status, body: text });
      return NextResponse.json({ error: "Trace backend error" }, { status: 502 });
    }

    return successResponse(spans.length);
  } catch (e) {
    logger.error("collect failed to forward to Phoenix", e, { route: "POST /api/collect" });
    return NextResponse.json({ error: "Failed to connect to trace backend" }, { status: 502 });
  }
}
