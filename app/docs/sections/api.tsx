import { CodeBlock, DocTable } from "../code-block";

export function ApiReference() {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        Reference
      </p>
      <h1 className="text-2xl font-bold tracking-tight mb-2">API Reference</h1>
      <p className="text-sm text-muted-foreground mb-10">
        Key API endpoints for programmatic access.
      </p>

      <div className="space-y-10">
        {/* Endpoints */}
        <div>
          <h3 className="text-sm font-semibold mb-4">Endpoints</h3>
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Method
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Endpoint
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[
                  ["POST", "/api/collect", "Ingest OTel traces (Bearer pt_*)"],
                  ["GET", "/api/projects", "List my projects"],
                  ["POST", "/api/projects", "Create a project"],
                  ["DELETE", "/api/projects", "Delete a project (owner)"],
                  ["POST", "/api/projects/join", "Join with invite code"],
                  [
                    "GET",
                    "/api/projects/:id/members",
                    "List members",
                  ],
                  [
                    "GET",
                    "/api/connectors?projectId=",
                    "List connectors",
                  ],
                  ["GET", "/api/health", "Health check (no auth)"],
                ].map(([method, path, desc]) => (
                  <tr key={`${method}-${path}`}>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          method === "GET"
                            ? "bg-muted text-muted-foreground"
                            : method === "POST"
                              ? "bg-foreground/10 text-foreground"
                              : "bg-destructive/10 text-destructive"
                        }`}
                      >
                        {method}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{path}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {desc}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Authentication */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Authentication</h3>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">
            All API calls (except{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
              /api/health
            </code>{" "}
            and{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
              /api/collect
            </code>
            ) require a Firebase ID token:
          </p>
          <CodeBlock
            code={`curl -H "Authorization: Bearer <firebase_id_token>" \\
  https://phoenix.rheon.kr/api/projects`}
          />
          <p className="mt-4 text-sm text-muted-foreground leading-relaxed mb-4">
            The{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
              /api/collect
            </code>{" "}
            endpoint uses Trace API Keys instead:
          </p>
          <CodeBlock
            code={`curl -X POST \\
  -H "Authorization: Bearer pt_your_trace_key" \\
  -H "Content-Type: application/json" \\
  -d '{"resourceSpans": [...]}' \\
  https://phoenix.rheon.kr/api/collect`}
          />
        </div>

        {/* Swagger */}
        <div>
          <p className="text-sm text-muted-foreground">
            For the full interactive API documentation, visit{" "}
            <a
              href="/api/docs"
              target="_blank"
              className="font-medium text-foreground hover:underline"
            >
              Swagger UI →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
