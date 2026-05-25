import { NextRequest, NextResponse } from "next/server";
import { callLlm } from "@/lib/llm-providers";
import { authedHandler, apiError, ErrorCode } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const PHOENIX = process.env.PHOENIX_URL ?? "http://localhost:6006";

export const POST = authedHandler(async (req: NextRequest, uid: string) => {
  const { messages, model, temperature, promptLabel, projectId } = await req.json();
  const usedModel = model || "gpt-4o-mini";

  const startTime = new Date().toISOString();

  const result = await callLlm({
    model: usedModel,
    messages,
    temperature: temperature ?? 0.7,
    userId: uid,
    projectId,
  }).catch((e) => {
    throw apiError(req, ErrorCode.LLM_ERROR, e instanceof Error ? e.message : "LLM call failed");
  });

  const endTime = new Date().toISOString();

  const traceId = crypto.randomUUID().replace(/-/g, "");
  const spanId = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

  // Record span to Phoenix playground project
  try {

    await fetch(`${PHOENIX}/v1/projects/playground/spans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [
          {
            name: promptLabel || "playground-run",
            context: { trace_id: traceId, span_id: spanId },
            span_kind: "LLM",
            parent_id: null,
            start_time: startTime,
            end_time: endTime,
            status_code: "OK",
            status_message: "",
            attributes: {
              "input.value": JSON.stringify(messages),
              "output.value": result.content,
              "llm.model_name": usedModel,
              "llm.token_count.prompt": result.usage.promptTokens,
              "llm.token_count.completion": result.usage.completionTokens,
              "llm.token_count.total": result.usage.totalTokens,
              "metadata.source": "playground",
              "metadata.prompt_label": promptLabel || "",
            },
            events: [],
          },
        ],
      }),
    });
  } catch (e) {
    logger.error("failed to record playground span", e, { route: "POST /api/llm" });
  }

  // Return in OpenAI-compatible format for backward compat
  return NextResponse.json({
    choices: [{ message: { content: result.content } }],
    usage: {
      prompt_tokens: result.usage.promptTokens,
      completion_tokens: result.usage.completionTokens,
      total_tokens: result.usage.totalTokens,
    },
    _spanId: spanId,
    _traceId: traceId,
  });
});
