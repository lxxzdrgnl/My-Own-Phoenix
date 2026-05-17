"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Nav } from "@/components/nav";
import { useT } from "@/lib/i18n";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const t = useT();

  useEffect(() => {
    if (!loading && user) {
      router.replace("/projects");
    }
  }, [loading, user, router]);

  if (loading || user) return null;

  const features = [
    { num: "01", title: t.landing.collectTitle, desc: t.landing.collectDesc },
    { num: "02", title: t.landing.evaluateTitle, desc: t.landing.evaluateDesc },
    { num: "03", title: t.landing.testTitle, desc: t.landing.testDesc },
  ];

  const stats = [
    { label: t.landing.totalTraces, value: "12,847", sub: "+2.4K today" },
    { label: t.landing.avgLatency, value: "1.23s", sub: "p99: 3.41s" },
    { label: t.landing.passRate, value: "94.2%", sub: "1,201 evaluated" },
    { label: t.landing.estCost, value: "$127.50", sub: "~$18/day" },
  ];

  // Not logged in → Landing page
  return (
    <>
      <div className="min-h-screen bg-background">
        <Nav />

        {/* Hero */}
        <section className="mx-auto max-w-6xl px-6 pt-16 pb-8">
          <div className="max-w-3xl animate-[fadeUp_0.6s_ease-out_both]">
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              {t.landing.badge}
            </p>
            <h1 className="text-5xl font-bold tracking-tight leading-[1.1]">
              {t.landing.heroTitle1}
              <br />
              <span className="text-muted-foreground/30">{t.landing.heroTitle2}</span>
            </h1>
            <p className="mt-6 max-w-lg text-base text-muted-foreground leading-relaxed">
              {t.landing.heroDesc}
            </p>
            <div className="mt-10 flex items-center gap-5">
              <button
                onClick={() => router.push("/login")}
                className="group rounded-lg bg-foreground px-7 py-3 text-sm font-medium text-background transition-all hover:opacity-90"
              >
                {t.landing.getStarted}
                <span className="ml-2 inline-block transition-transform group-hover:translate-x-0.5">→</span>
              </button>
              <a href="/docs" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                {t.landing.readDocs}
              </a>
            </div>
          </div>
        </section>

        {/* Dashboard preview */}
        <section className="mx-auto max-w-6xl px-6 pb-24 animate-[fadeUp_0.6s_ease-out_0.2s_both]">
          <div className="rounded-2xl border bg-card shadow-lg shadow-black/[0.03] overflow-hidden">
            <div className="flex min-h-[340px]">
              <div className="w-52 border-r p-5 hidden md:flex flex-col">
                <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/40">{t.landing.navigate}</p>
                <div className="space-y-0.5">
                  {["Chat", "Playground", "Dashboard", "Requests", "Evaluations", "Datasets"].map((item, i) => (
                    <div key={item} className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${i === 2 ? "bg-accent font-semibold" : "text-muted-foreground"}`}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex-1 p-6 bg-background">
                <div className="mb-5 flex items-center justify-between">
                  <span className="text-sm font-semibold">Dashboard</span>
                  <div className="flex rounded-lg border overflow-hidden">
                    {["24H", "7D", "1M", "3M"].map((t) => (
                      <span key={t} className={`px-3 py-1.5 text-[10px] font-medium border-r last:border-r-0 ${t === "7D" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent"}`}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  {stats.map((s) => (
                    <div key={s.label} className="rounded-xl border p-4">
                      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{s.label}</p>
                      <p className="mt-1.5 text-2xl font-bold tabular-nums">{s.value}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground/60">{s.sub}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border p-4">
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-3">{t.landing.requests7d}</p>
                  <div className="flex items-end gap-1 h-16">
                    {[35, 42, 58, 45, 67, 55, 72, 48, 63, 80, 70, 56, 45, 62, 78, 85, 60, 42, 55, 70, 65, 50, 48, 72, 88, 76, 65, 58].map((h, i) => (
                      <div key={i} className="flex-1 rounded-sm bg-foreground/10 transition-colors hover:bg-foreground/20" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">{t.landing.everythingYouNeed}</p>
            <h2 className="text-2xl font-bold tracking-tight mb-12">{t.landing.fromFirstTrace}</h2>
            <div className="grid gap-px md:grid-cols-3 rounded-2xl border overflow-hidden bg-border">
              {features.map((f) => (
                <div key={f.num} className="bg-card p-8">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">{f.num}</span>
                  <h3 className="mt-3 text-base font-semibold">{f.title}</h3>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Code snippet */}
        <section className="border-t bg-card">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">{t.landing.startIn2Min}</h2>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-sm">
                  {t.landing.startIn2MinDesc}
                </p>
                <button onClick={() => router.push("/login")} className="mt-6 text-sm font-medium transition-colors hover:text-muted-foreground">
                  {t.landing.getApiKey} →
                </button>
              </div>
              <div className="rounded-xl bg-[#0f0f17] p-6 font-mono text-[13px] text-[#c8ccd4] overflow-x-auto leading-relaxed">
                <div className="flex items-center gap-2 mb-5">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                  <span className="ml-3 text-[10px] text-[#555]">agent.py</span>
                </div>
                <code>
                  <span className="text-[#c792ea]">import</span> os{"\n"}
                  <span className="text-[#c792ea]">from</span> openinference.instrumentation.openai{" "}
                  <span className="text-[#c792ea]">import</span> OpenAIInstrumentor{"\n"}
                  {"\n"}
                  os.environ[<span className="text-[#c3e88d]">&quot;PHOENIX_API_KEY&quot;</span>] ={" "}
                  <span className="text-[#c3e88d]">&quot;pt_your_key&quot;</span>{"\n"}
                  os.environ[<span className="text-[#c3e88d]">&quot;PHOENIX_COLLECTOR_ENDPOINT&quot;</span>] ={" "}
                  <span className="text-[#c3e88d]">&quot;https://phoenix.rheon.kr/api/collect&quot;</span>{"\n"}
                  {"\n"}
                  OpenAIInstrumentor().instrument(){" "}
                  <span className="text-[#546e7a]"># traces flow automatically</span>
                </code>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t">
          <div className="mx-auto max-w-6xl px-6 py-24 text-center">
            <h2 className="text-3xl font-bold tracking-tight">{t.landing.readyToMonitor}</h2>
            <p className="mt-3 text-sm text-muted-foreground">{t.landing.freeToStart}</p>
            <button onClick={() => router.push("/login")} className="mt-8 rounded-lg bg-foreground px-8 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90">
              {t.landing.getStartedFree} →
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t">
          <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground/50">My Own Phoenix</span>
            <a href="/docs" className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors">{t.landing.documentation}</a>
          </div>
        </footer>
      </div>

      <style jsx>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
