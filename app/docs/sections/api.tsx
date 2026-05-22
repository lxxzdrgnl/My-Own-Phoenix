import { CodeBlock, DocTable } from "../code-block";

type RouteEntry = [string, string, string];

interface RouteSectionProps {
  title: string;
  routes: RouteEntry[];
}

function methodColor(method: string) {
  if (method === "GET") return "bg-muted text-muted-foreground";
  if (method === "POST") return "bg-foreground/10 text-foreground";
  if (method === "PUT" || method === "PATCH")
    return "bg-foreground/10 text-foreground/80";
  return "bg-destructive/10 text-destructive";
}

function RouteSection({ title, routes }: RouteSectionProps) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-4">{title}</h3>
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
            {routes.map(([method, path, desc]) => (
              <tr key={`${method}-${path}`}>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${methodColor(method)}`}
                  >
                    {method}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs">{path}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const ROUTE_SECTIONS: RouteSectionProps[] = [
  {
    title: "Projects & Collaboration",
    routes: [
      ["GET", "/api/projects", "List my projects"],
      ["POST", "/api/projects", "Create a project"],
      ["PUT", "/api/projects", "Rename a project (owner)"],
      ["DELETE", "/api/projects", "Delete a project (owner)"],
      ["POST", "/api/projects/join", "Join with invite code"],
      ["GET", "/api/projects/:id/members", "List members"],
      ["PUT", "/api/projects/:id/members", "Update member role (owner)"],
      ["DELETE", "/api/projects/:id/members", "Remove member (owner)"],
      ["PATCH", "/api/projects/:id/members", "Transfer ownership (owner)"],
      ["GET", "/api/projects/:id/invite-codes", "List invite codes (owner)"],
      [
        "POST",
        "/api/projects/:id/invite-codes",
        "Generate invite code (owner)",
      ],
      [
        "DELETE",
        "/api/projects/:id/invite-codes",
        "Delete invite code (owner)",
      ],
      [
        "GET",
        "/api/projects/:id/join-requests",
        "List join requests (owner)",
      ],
      [
        "PUT",
        "/api/projects/:id/join-requests",
        "Approve/reject request (owner)",
      ],
    ],
  },
  {
    title: "API Keys & Providers",
    routes: [
      ["GET", "/api/providers", "List user's API keys"],
      ["POST", "/api/providers", "Add API key"],
      ["PUT", "/api/providers/:id", "Update provider"],
      ["DELETE", "/api/providers/:id", "Delete provider"],
      ["POST", "/api/providers/test", "Test provider connection"],
      ["GET", "/api/projects/:id/providers", "List project API keys"],
      ["POST", "/api/projects/:id/providers", "Add project API key"],
      [
        "DELETE",
        "/api/projects/:id/providers/:providerId",
        "Remove project key",
      ],
    ],
  },
  {
    title: "Datasets & Runs",
    routes: [
      ["GET", "/api/datasets", "List datasets"],
      ["POST", "/api/datasets", "Create dataset"],
      ["PUT", "/api/datasets", "Update dataset"],
      ["DELETE", "/api/datasets", "Delete dataset"],
      ["GET", "/api/datasets/rows", "Get dataset rows (paginated)"],
      ["POST", "/api/datasets/rows", "Add rows"],
      ["PUT", "/api/datasets/rows", "Update row"],
      ["DELETE", "/api/datasets/rows", "Delete row"],
      ["GET", "/api/datasets/runs", "List runs"],
      ["POST", "/api/datasets/runs", "Create run"],
      ["GET", "/api/datasets/runs/:runId", "Get run details"],
      ["PUT", "/api/datasets/runs/:runId", "Update run"],
      ["DELETE", "/api/datasets/runs/:runId", "Delete run"],
      ["GET", "/api/datasets/runs/:runId/export", "Export run as CSV"],
    ],
  },
  {
    title: "Evaluations",
    routes: [
      ["GET", "/api/eval-prompts", "List eval prompts"],
      ["PUT", "/api/eval-prompts", "Create/update eval prompt"],
      ["DELETE", "/api/eval-prompts", "Delete eval prompt"],
      ["GET", "/api/eval-config", "Get project eval config"],
      ["PUT", "/api/eval-config", "Update project eval config"],
      ["POST", "/api/eval-backfill", "Run eval backfill on traces"],
    ],
  },
  {
    title: "LLM & Agents",
    routes: [
      ["POST", "/api/llm", "Call LLM (multi-provider)"],
      ["GET", "/api/agent-config", "Get agent config"],
      ["PUT", "/api/agent-config", "Update agent config"],
      ["DELETE", "/api/agent-config", "Delete agent config"],
      ["POST", "/api/chat-relay", "Relay chat to connected agent"],
    ],
  },
  {
    title: "Observability",
    routes: [
      ["GET", "/api/feedback", "List feedback"],
      ["POST", "/api/feedback", "Create feedback"],
      ["DELETE", "/api/feedback", "Delete feedback"],
      ["GET", "/api/feedback/stats", "Get feedback stats"],
      ["POST", "/api/annotations", "Create annotation"],
      ["GET", "/api/risks", "List risks"],
      ["POST", "/api/risks", "Create risk"],
      ["GET", "/api/incidents", "List incidents"],
      ["POST", "/api/incidents", "Create incident"],
      ["POST", "/api/pii-guard", "Run PII detection"],
    ],
  },
  {
    title: "Connectors & Traces",
    routes: [
      [
        "POST",
        "/api/collect",
        "Ingest OTel traces — accepts OTLP/JSON or OTLP/protobuf (Bearer pt_*)",
      ],
      ["GET", "/api/connectors", "List connected agents"],
      ["GET", "/api/user/connector-key", "Get connector key"],
      ["POST", "/api/user/connector-key", "Generate connector key"],
    ],
  },
  {
    title: "Infrastructure",
    routes: [
      ["GET", "/api/health", "Health check (no auth)"],
      ["GET", "/api/openapi.json", "OpenAPI spec"],
      ["*", "/api/v1/*", "Phoenix proxy (pass-through)"],
    ],
  },
];

export function ApiReference() {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        Reference
      </p>
      <h1 className="text-2xl font-bold tracking-tight mb-2">API Reference</h1>
      <p className="text-sm text-muted-foreground mb-10">
        All API endpoints for programmatic access.
      </p>

      <div className="space-y-10">
        {/* Endpoints by category */}
        {ROUTE_SECTIONS.map((section) => (
          <RouteSection
            key={section.title}
            title={section.title}
            routes={section.routes}
          />
        ))}

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
            endpoint uses Trace API Keys instead, and accepts either OTLP/HTTP
            transport encoding — pick whichever your OpenTelemetry SDK uses by
            default:
          </p>
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground mt-3 mb-2">
            OTLP/JSON
          </p>
          <CodeBlock
            code={`curl -X POST \\
  -H "Authorization: Bearer pt_your_trace_key" \\
  -H "Content-Type: application/json" \\
  -d '{"resourceSpans": [...]}' \\
  https://phoenix.rheon.kr/api/collect`}
          />
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-muted-foreground mt-4 mb-2">
            OTLP/Protobuf (OpenTelemetry SDK default)
          </p>
          <CodeBlock
            code={`curl -X POST \\
  -H "Authorization: Bearer pt_your_trace_key" \\
  -H "Content-Type: application/x-protobuf" \\
  --data-binary @trace.pb \\
  https://phoenix.rheon.kr/api/collect`}
          />
          <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
            The body is the standard OTLP{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">
              ExportTraceServiceRequest
            </code>{" "}
            message in either encoding. Most SDKs (OpenInference, OTel Python,
            Node, Go, Java) send protobuf by default and require no extra
            configuration beyond the endpoint URL and{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono">
              PHOENIX_API_KEY
            </code>
            .
          </p>
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
