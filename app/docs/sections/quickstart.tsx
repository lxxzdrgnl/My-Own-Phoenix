"use client";

import { CodeBlock, Callout, Md } from "../code-block";
import { useT } from "@/lib/i18n";

export function QuickStart() {
  const t = useT();
  const steps = [
    {
      title: t.docs.quickstart.step1Title,
      content: (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t.docs.quickstart.step1Desc}
        </p>
      ),
    },
    {
      title: t.docs.quickstart.step2Title,
      content: (
        <>
          <p className="text-sm text-muted-foreground leading-relaxed mb-3">
            {t.docs.quickstart.step2Desc}
          </p>
          <ol className="text-sm text-muted-foreground space-y-3 leading-relaxed">
            {[
              t.docs.quickstart.step2Step1,
              t.docs.quickstart.step2Step2,
              t.docs.quickstart.step2Step3,
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                  {i + 1}
                </span>
                <span className="pt-0.5"><Md text={step} /></span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Note:</strong> {t.docs.quickstart.traceKeyNote}
          </p>
        </>
      ),
    },
    {
      title: t.docs.quickstart.step3Title,
      content: (
        <CodeBlock code="pip install arize-phoenix-otel openinference-instrumentation-openai" />
      ),
    },
    {
      title: t.docs.quickstart.step4Title,
      content: (
        <>
          <CodeBlock
            filename="agent.py"
            code={`import os
from openinference.instrumentation.openai import OpenAIInstrumentor

# Your Trace API Key — authenticates trace data to your project
os.environ["PHOENIX_API_KEY"] = "pt_your_key_here"
os.environ["PHOENIX_COLLECTOR_ENDPOINT"] = "https://phoenix.rheon.kr/api/collect"

# Auto-instrument all OpenAI calls
OpenAIInstrumentor().instrument()

# Your existing agent code works as-is
from openai import OpenAI
client = OpenAI()

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "What is quantum computing?"}]
)
print(response.choices[0].message.content)`}
          />
          <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
            {t.docs.quickstart.step4Note}
          </p>
        </>
      ),
    },
    {
      title: t.docs.quickstart.step5Title,
      content: (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t.docs.quickstart.step5Desc}
        </p>
      ),
    },
  ];

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        {t.docs.quickstart.groupLabel}
      </p>
      <h1 className="text-2xl font-bold tracking-tight mb-2">
        {t.docs.quickstart.title}
      </h1>
      <p className="text-sm text-muted-foreground mb-10">
        {t.docs.quickstart.subtitle}
      </p>

      <div className="space-y-10">
        {/* Steps */}
        <div>
          <h3 className="text-sm font-semibold mb-4">{t.docs.quickstart.setupSteps}</h3>
          <div className="space-y-6">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-5">
                <div className="flex flex-col items-center">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                    {i + 1}
                  </div>
                  {i < steps.length - 1 && (
                    <div className="mt-2 w-px flex-1 bg-border" />
                  )}
                </div>
                <div className={i < steps.length - 1 ? "pb-2 flex-1" : "flex-1"}>
                  <h3 className="text-sm font-semibold mb-4">{step.title}</h3>
                  {step.content}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* What's included */}
        <div>
          <h3 className="text-sm font-semibold mb-4">
            {t.docs.quickstart.whatYouGet}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            {t.docs.quickstart.connectorNote}
          </p>
          <div className="grid gap-px grid-cols-2 rounded-xl border overflow-hidden bg-border">
            <div className="bg-card p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-2">
                {t.docs.quickstart.included}
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {(t.docs.quickstart.includedFeatures as unknown as readonly string[]).map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/20" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-card p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-2">
                {t.docs.quickstart.requiresConnector}
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {(t.docs.quickstart.connectorFeatures as unknown as readonly string[]).map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/20" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <Callout title={t.docs.quickstart.calloutTitle}>
          {t.docs.quickstart.calloutText}
        </Callout>
      </div>
    </div>
  );
}
