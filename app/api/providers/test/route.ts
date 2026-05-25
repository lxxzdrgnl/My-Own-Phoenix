import { NextRequest, NextResponse } from "next/server";
import { authedHandler, apiError, ErrorCode, validateFields } from "@/lib/api-error";
import { DEFAULT_API_TIMEOUT_MS } from "@/lib/config/timeouts";

const TEST_ENDPOINTS: Record<string, { url: string; buildRequest: (key: string) => { headers: Record<string, string>; body: string } }> = {
  openai: {
    url: "https://api.openai.com/v1/models",
    buildRequest: (key) => ({
      headers: { Authorization: `Bearer ${key}` },
      body: "",
    }),
  },
  anthropic: {
    url: "https://api.anthropic.com/v1/messages",
    buildRequest: (key) => ({
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    }),
  },
  google: {
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    buildRequest: (key) => ({
      headers: { "x-goog-api-key": key },
      body: "",
    }),
  },
  xai: {
    url: "https://api.x.ai/v1/models",
    buildRequest: (key) => ({
      headers: { Authorization: `Bearer ${key}` },
      body: "",
    }),
  },
};

const VALID_PROVIDERS = ["openai", "anthropic", "google", "xai"] as const;

export const POST = authedHandler(async (req: NextRequest) => {
  const { provider, apiKey } = (await req.json()) as { provider: string; apiKey: string };

  const err = validateFields([
    { field: "provider", value: provider, required: true, oneOf: VALID_PROVIDERS },
    { field: "apiKey", value: apiKey, required: true, minLength: 1 },
  ]);
  if (err) return apiError(req, ErrorCode.VALIDATION_FAILED, "Validation failed", err);

  const config = TEST_ENDPOINTS[provider];

  try {
    const { headers, body } = config.buildRequest(apiKey);
    const method = body ? "POST" : "GET";
    const res = await fetch(config.url, {
      method,
      headers,
      ...(body ? { body } : {}),
      signal: AbortSignal.timeout(DEFAULT_API_TIMEOUT_MS),
    });

    if (res.ok || res.status === 200 || res.status === 201) {
      return NextResponse.json({ success: true });
    }

    const data = await res.json().catch(() => ({}));
    return NextResponse.json({
      success: false,
      error: data.error?.message || `HTTP ${res.status}`,
    });
  } catch (e) {
    return NextResponse.json({
      success: false,
      error: e instanceof Error ? e.message : "Connection failed",
    });
  }
});
