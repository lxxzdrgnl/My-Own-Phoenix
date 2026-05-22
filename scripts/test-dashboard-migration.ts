import assert from "node:assert/strict";
import {
  chooseLayoutPerProject,
  type LayoutRow,
  type MemberRow,
  type ProjectRow,
  type UserRow,
} from "../lib/dashboard-migration";

const users: UserRow[] = [
  { id: "u-owner-a", email: "owner-a@x.com" },
  { id: "u-editor-a", email: "editor-a@x.com" },
  { id: "u-sean", email: "yihsean@gmail.com" },
  { id: "u-owner-dexter", email: "owner-dexter@x.com" },
];
const projects: ProjectRow[] = [
  { id: "p-alpha", name: "alpha" },
  { id: "p-dexter", name: "dexter" },
  { id: "p-empty", name: "empty" },
];
const members: MemberRow[] = [
  { projectId: "p-alpha", userId: "u-owner-a", role: "owner" },
  { projectId: "p-alpha", userId: "u-editor-a", role: "editor" },
  { projectId: "p-dexter", userId: "u-owner-dexter", role: "owner" },
  { projectId: "p-dexter", userId: "u-sean", role: "editor" },
  { projectId: "p-empty", userId: "u-owner-dexter", role: "owner" },
];
const layouts: LayoutRow[] = [
  { id: "l1", projectId: "p-alpha", userId: "u-owner-a", layout: "OWNER_ALPHA" },
  { id: "l2", projectId: "p-alpha", userId: "u-editor-a", layout: "EDITOR_ALPHA" },
  { id: "l3", projectId: "p-dexter", userId: "u-owner-dexter", layout: "OWNER_DEXTER" },
  { id: "l4", projectId: "p-dexter", userId: "u-sean", layout: "SEAN_DEXTER" },
  // p-empty: nobody has a layout yet
];

const chosen = chooseLayoutPerProject({ users, projects, members, layouts });

// Alpha: owner wins
const alpha = chosen.find((c) => c.projectId === "p-alpha");
assert.ok(alpha, "alpha layout should exist");
assert.equal(alpha!.layout, "OWNER_ALPHA");
assert.equal(alpha!.lastUpdatedBy, "u-owner-a");

// Dexter: Sean wins despite being editor
const dexter = chosen.find((c) => c.projectId === "p-dexter");
assert.ok(dexter, "dexter layout should exist");
assert.equal(dexter!.layout, "SEAN_DEXTER");
assert.equal(dexter!.lastUpdatedBy, "u-sean");

// Empty: no layout chosen (nobody saved one)
assert.equal(chosen.find((c) => c.projectId === "p-empty"), undefined);

// One layout per project
const projectIds = chosen.map((c) => c.projectId);
assert.equal(new Set(projectIds).size, projectIds.length, "no duplicate projects");

// Defensive: layout from a non-member is dropped
const withStranger: LayoutRow[] = [
  ...layouts,
  { id: "l-orphan", projectId: "p-alpha", userId: "u-stranger", layout: "STRANGER" },
];
const chosen2 = chooseLayoutPerProject({ users, projects, members, layouts: withStranger });
const alpha2 = chosen2.find((c) => c.projectId === "p-alpha");
assert.equal(alpha2!.layout, "OWNER_ALPHA", "stranger layout should not win");

// Defensive: only an editor exists → editor wins
const onlyEditor = chooseLayoutPerProject({
  users,
  projects,
  members,
  layouts: [{ id: "l5", projectId: "p-alpha", userId: "u-editor-a", layout: "EDITOR_ONLY" }],
});
assert.equal(onlyEditor[0].layout, "EDITOR_ONLY");
assert.equal(onlyEditor[0].lastUpdatedBy, "u-editor-a");

console.log("PASS: dashboard-migration");
