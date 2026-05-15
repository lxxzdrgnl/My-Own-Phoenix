"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Play } from "lucide-react";
import { PASS_LABELS } from "@/lib/constants";
import { apiFetch } from "@/lib/api-client";
import { parsePromptToConfig, generatePromptMessages } from "@/components/prompt-builder";

interface TestResult {
  label: string;
  score: number;
  explanation: string;
}

interface EvalTestPanelProps {
  editTemplate: string;
  projectId?: string;
}

export function EvalTestPanel({ editTemplate, projectId }: EvalTestPanelProps) {
  const [testContext, setTestContext] = useState(
    "The Eiffel Tower is located in Paris, France. It was constructed in 1889 and stands 330 meters tall. It was designed by Gustave Eiffel's engineering company."
  );
  const [testQuery, setTestQuery] = useState(
    "How tall is the Eiffel Tower and where is it located?"
  );
  const [testResponse, setTestResponse] = useState(
    "The Eiffel Tower is 330 meters tall and is located in Paris, France. It was built in 1889 by Gustave Eiffel."
  );
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  async function handleTest() {
    if (!editTemplate) return;
    setTesting(true);
    setTestResult(null);
    try {
      const replacePlaceholders = (text: string) =>
        text
          .replace(/\{context\}/g, testContext || "(no context)")
          .replace(/\{response\}/g, testResponse || "(no response)")
          .replace(/\{query\}/g, testQuery || "(no query)");

      const evalConfig = parsePromptToConfig(editTemplate);
      let messages;
      if (evalConfig) {
        const { system, user } = generatePromptMessages(evalConfig);
        messages = [
          { role: "system", content: replacePlaceholders(system) },
          { role: "user", content: replacePlaceholders(user) },
        ];
      } else {
        messages = [{ role: "user", content: replacePlaceholders(editTemplate) }];
      }

      const res = await apiFetch("/api/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", messages, temperature: 0, projectId }),
      });
      const data = await res.json();
      const result = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
      const isBinary = result.score === undefined;
      const score = isBinary
        ? PASS_LABELS.has(String(result.label).toLowerCase())
          ? 1.0
          : 0.0
        : (result.score ?? 0);
      setTestResult({ label: result.label ?? "", score, explanation: result.explanation ?? "" });
    } catch (e) {
      setTestResult({ label: "error", score: 0, explanation: String(e) });
    }
    setTesting(false);
  }

  // Reset test result when template changes externally
  // (parent can call this by re-mounting or we can expose a ref — keeping it simple)

  const isBinary = !/"score":\s*0\.0-1\.0/.test(editTemplate);

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <Play className="size-3" /> Test
        </h3>
        <Button
          size="sm"
          variant="outline"
          onClick={handleTest}
          disabled={testing || !editTemplate}
          className="gap-1.5 text-xs"
        >
          {testing ? "Running..." : "Run"}
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Context
          </label>
          <Textarea
            value={testContext}
            onChange={(e) => setTestContext(e.target.value)}
            rows={3}
            placeholder="..."
            className="text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Query
          </label>
          <Textarea
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            rows={3}
            placeholder="..."
            className="text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Response
          </label>
          <Textarea
            value={testResponse}
            onChange={(e) => setTestResponse(e.target.value)}
            rows={3}
            placeholder="..."
            className="text-xs"
          />
        </div>
      </div>
      {testResult && (() => {
        const isPass =
          PASS_LABELS.has(String(testResult.label).toLowerCase()) ||
          testResult.score >= 0.5;
        return (
          <div className="rounded-md border bg-muted/20 p-3 flex items-center gap-3 text-sm">
            <span
              className={cn(
                "rounded px-2 py-0.5 text-xs font-bold",
                testResult.label === "error"
                  ? "bg-muted text-destructive"
                  : isPass
                    ? "bg-muted text-foreground"
                    : "bg-muted text-destructive"
              )}
            >
              {testResult.label}
            </span>
            {!isBinary && (
              <span className="tabular-nums font-mono text-xs">
                {testResult.score.toFixed(2)}
              </span>
            )}
            <span className="text-xs text-muted-foreground flex-1">
              {testResult.explanation}
            </span>
          </div>
        );
      })()}
    </div>
  );
}
