import assert from "node:assert/strict";
import {
  layoutGetCore,
  layoutPutCore,
  type LayoutDeps,
} from "../app/api/dashboard/layout/core";

type LayoutStore = Map<string, { layout: string; lastUpdatedBy: string | null; updatedAt: Date }>;

function makeDeps(overrides: Partial<LayoutDeps> = {}, store?: LayoutStore): LayoutDeps {
  const layouts: LayoutStore = store ?? new Map();
  return {
    findMember: async (projectId, userId) => {
      if (projectId !== "proj-1") return null;
      if (userId === "owner") return { role: "owner" };
      if (userId === "ed") return { role: "editor" };
      if (userId === "viewer") return { role: "viewer" };
      return null;
    },
    findLayout: async (projectId) => {
      const row = layouts.get(projectId);
      return row ?? null;
    },
    upsertLayout: async (projectId, layout, uid) => {
      const now = new Date();
      const row = { layout, lastUpdatedBy: uid, updatedAt: now };
      layouts.set(projectId, row);
      return row;
    },
    broadcast: () => {},
    ...overrides,
  };
}

async function run() {
  // GET: viewer (member) can read; no row yet
  {
    const deps = makeDeps();
    const res = await layoutGetCore({ projectId: "proj-1", uid: "viewer", deps });
    assert.equal(res.status, "ok");
    if (res.status === "ok") {
      assert.equal(res.layout, null);
      assert.equal(res.updatedAt, null);
      assert.equal(res.updatedByName, null);
    }
  }

  // GET: non-member is forbidden
  {
    const deps = makeDeps();
    const res = await layoutGetCore({ projectId: "proj-1", uid: "stranger", deps });
    assert.equal(res.status, "forbidden");
  }

  // GET: missing projectId → validation
  {
    const deps = makeDeps();
    const res = await layoutGetCore({ projectId: "", uid: "viewer", deps });
    assert.equal(res.status, "validation");
  }

  // PUT: viewer is forbidden
  {
    const deps = makeDeps();
    const res = await layoutPutCore({ projectId: "proj-1", uid: "viewer", layout: "L", deps });
    assert.equal(res.status, "forbidden");
  }

  // PUT: non-member is forbidden
  {
    const deps = makeDeps();
    const res = await layoutPutCore({ projectId: "proj-1", uid: "stranger", layout: "L", deps });
    assert.equal(res.status, "forbidden");
  }

  // PUT: editor succeeds + broadcasts; GET reflects it
  {
    const store: LayoutStore = new Map();
    const broadcastCalls: Array<{ projectId: string; savedBy: string; savedAt: string }> = [];
    const deps = makeDeps(
      {
        broadcast: (projectId, msg) => {
          if (msg.type === "layout-updated") {
            broadcastCalls.push({ projectId, savedBy: msg.savedBy, savedAt: msg.savedAt });
          }
        },
      },
      store,
    );
    const put = await layoutPutCore({ projectId: "proj-1", uid: "ed", layout: "L2", deps });
    assert.equal(put.status, "ok");
    assert.equal(broadcastCalls.length, 1);
    assert.equal(broadcastCalls[0].projectId, "proj-1");
    assert.equal(broadcastCalls[0].savedBy, "ed");
    if (put.status === "ok") assert.equal(broadcastCalls[0].savedAt, put.updatedAt);

    // Same deps so the in-memory store is shared
    const get = await layoutGetCore({ projectId: "proj-1", uid: "viewer", deps });
    assert.equal(get.status, "ok");
    if (get.status === "ok") {
      assert.equal(get.layout, "L2");
      assert.equal(get.lastUpdatedBy, "ed");
    }
  }

  // PUT: owner succeeds
  {
    const deps = makeDeps();
    const res = await layoutPutCore({ projectId: "proj-1", uid: "owner", layout: "L3", deps });
    assert.equal(res.status, "ok");
  }

  // PUT: validation when layout missing
  {
    const deps = makeDeps();
    const res = await layoutPutCore({ projectId: "proj-1", uid: "ed", layout: "", deps });
    assert.equal(res.status, "validation");
  }

  // PUT: validation when projectId missing
  {
    const deps = makeDeps();
    const res = await layoutPutCore({ projectId: "", uid: "ed", layout: "L", deps });
    assert.equal(res.status, "validation");
  }

  // GET: surfaces updatedByName from joined user
  {
    const deps = makeDeps({
      findLayout: async () => ({
        layout: "L",
        lastUpdatedBy: "ed",
        updatedAt: new Date("2026-05-23T00:00:00Z"),
        updatedByUser: { name: "Ed", email: "ed@x.com" },
      }),
    });
    const res = await layoutGetCore({ projectId: "proj-1", uid: "viewer", deps });
    assert.equal(res.status, "ok");
    if (res.status === "ok") {
      assert.equal(res.updatedByName, "Ed");
      assert.equal(res.updatedAt, "2026-05-23T00:00:00.000Z");
    }
  }

  // GET: falls back to email when display name is null
  {
    const deps = makeDeps({
      findLayout: async () => ({
        layout: "L",
        lastUpdatedBy: "ed",
        updatedAt: new Date(),
        updatedByUser: { name: null, email: "ed@x.com" },
      }),
    });
    const res = await layoutGetCore({ projectId: "proj-1", uid: "viewer", deps });
    assert.equal(res.status, "ok");
    if (res.status === "ok") assert.equal(res.updatedByName, "ed@x.com");
  }

  console.log("PASS: dashboard-layout-api");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
