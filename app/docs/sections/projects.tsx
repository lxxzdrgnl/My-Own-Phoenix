import { DocTable } from "../code-block";

export function Projects() {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        Reference
      </p>
      <h1 className="text-2xl font-bold tracking-tight mb-2">
        Projects & Teams
      </h1>
      <p className="text-sm text-muted-foreground mb-10">
        How project-based access control works.
      </p>

      <div className="space-y-10">
        {/* Project model */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Project model</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Every piece of data — traces, evaluations, datasets, chat threads —
            belongs to a project. Access is controlled per-project, so you can
            be in different teams with different roles for different projects.
          </p>
        </div>

        {/* Roles */}
        <div>
          <h3 className="text-sm font-semibold mb-4">Roles</h3>
          <DocTable
            headers={["Role", "Permissions"]}
            rows={[
              [
                "Owner",
                "Everything + manage members + delete project + transfer ownership",
              ],
              [
                "Editor",
                "Create/edit/delete data (evals, datasets, agents, chat)",
              ],
              [
                "Viewer",
                "Read-only access to dashboard, traces, evaluations",
              ],
            ]}
          />
        </div>

        {/* Inviting */}
        <div>
          <h3 className="text-sm font-semibold mb-4">
            Inviting team members
          </h3>
          <ol className="text-sm text-muted-foreground space-y-3 leading-relaxed">
            {[
              <>
                Go to{" "}
                <strong className="text-foreground">
                  Project Settings → Members
                </strong>
              </>,
              <>
                Click{" "}
                <strong className="text-foreground">Generate Code</strong> —
                choose role and expiry
              </>,
              "Share the code with your teammate",
              <>
                They enter it via{" "}
                <strong className="text-foreground">Join Project</strong> on the
                homepage
              </>,
              <>
                You approve their request in the{" "}
                <strong className="text-foreground">Pending Requests</strong>{" "}
                section
              </>,
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
                  {i + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
