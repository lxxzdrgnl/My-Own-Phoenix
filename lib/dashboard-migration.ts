/**
 * Pure data-transform helper for the per-user → per-project DashboardLayout
 * migration. Tested in scripts/test-dashboard-migration.ts; the migration SQL
 * (prisma/migrations/<timestamp>_shared_dashboard_layout/migration.sql)
 * mirrors this priority logic.
 *
 * Priority (lower number = winner):
 *   1. project.name === 'dexter' AND user.email === 'yihsean@gmail.com'
 *   2. member.role === 'owner'
 *   3. anything else (typically editor)
 */

export interface UserRow {
  id: string;
  email: string;
}
export interface ProjectRow {
  id: string;
  name: string;
}
export interface MemberRow {
  projectId: string;
  userId: string;
  role: string;
}
export interface LayoutRow {
  id: string;
  projectId: string;
  userId: string;
  layout: string;
}

export interface ChosenLayout {
  layoutId: string;
  projectId: string;
  layout: string;
  lastUpdatedBy: string;
}

const SEAN_EMAIL = "yihsean@gmail.com";
const DEXTER_NAME = "dexter";

function priority(
  project: ProjectRow,
  member: MemberRow | undefined,
  user: UserRow | undefined,
): number {
  if (project.name === DEXTER_NAME && user?.email === SEAN_EMAIL) return 1;
  if (member?.role === "owner") return 2;
  return 3;
}

export function chooseLayoutPerProject(input: {
  users: UserRow[];
  projects: ProjectRow[];
  members: MemberRow[];
  layouts: LayoutRow[];
}): ChosenLayout[] {
  const { users, projects, members, layouts } = input;
  const userById = new Map(users.map((u) => [u.id, u]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const memberKey = (pid: string, uid: string) => `${pid}::${uid}`;
  const memberByKey = new Map(members.map((m) => [memberKey(m.projectId, m.userId), m]));

  const groups = new Map<string, LayoutRow[]>();
  for (const l of layouts) {
    if (!groups.has(l.projectId)) groups.set(l.projectId, []);
    groups.get(l.projectId)!.push(l);
  }

  const chosen: ChosenLayout[] = [];
  for (const [projectId, rows] of groups) {
    const project = projectById.get(projectId);
    if (!project) continue; // orphan layout — skip (FK should prevent, but defensive)

    let best: { row: LayoutRow; pri: number } | null = null;
    for (const row of rows) {
      const user = userById.get(row.userId);
      const member = memberByKey.get(memberKey(row.projectId, row.userId));
      // Skip layouts owned by non-members (post-membership change)
      if (!member) continue;
      const pri = priority(project, member, user);
      if (!best || pri < best.pri) best = { row, pri };
    }

    if (best) {
      chosen.push({
        layoutId: best.row.id,
        projectId,
        layout: best.row.layout,
        lastUpdatedBy: best.row.userId,
      });
    }
  }
  return chosen;
}
