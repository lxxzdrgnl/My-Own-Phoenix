"use client";

import { useState, useEffect, useCallback } from "react";
import { useProject } from "@/lib/project-context";
import { apiFetch } from "@/lib/api-client";
import { useResourceList } from "@/lib/hooks/use-resource-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { Users, Copy, Trash2, Check, X, Plus, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { RoleGate } from "@/components/ui/role-gate";
import { useT } from "@/lib/i18n";

interface Member {
  id: string;
  userId: string;
  role: string;
  user: { id: string; email: string; name: string | null };
}

interface JoinRequest {
  id: string;
  userId: string;
  status: string;
  createdAt: string;
  user: { id: string; email: string; name: string | null };
}

interface InviteCode {
  id: string;
  code: string;
  role: string;
  maxUses: number;
  useCount: number;
  expiresAt: string | null;
  createdAt: string;
}

export function MembersTab() {
  const { id: projectId } = useProject();
  const confirm = useConfirm();
  const t = useT();
  const [currentRole, setCurrentRole] = useState("");
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [genRole, setGenRole] = useState("editor");
  const [genMaxUses, setGenMaxUses] = useState("10");
  const [genExpiry, setGenExpiry] = useState("7");

  const membersEndpoint = `/api/projects/${projectId}/members`;

  const membersTransform = useCallback(
    (raw: { members?: Member[]; currentRole?: string }) => {
      setCurrentRole(raw.currentRole ?? "");
      return raw.members ?? [];
    },
    [],
  );

  const {
    items: members,
    setItems: setMembers,
    loading,
    reload: reloadMembers,
  } = useResourceList<Member>(membersEndpoint, { transform: membersTransform });

  const isOwner = currentRole === "owner";

  const loadOwnerData = useCallback(async () => {
    const [requestsRes, codesRes] = await Promise.all([
      apiFetch(`/api/projects/${projectId}/join-requests`).then(r => r.json()).catch(() => ({ requests: [] })),
      apiFetch(`/api/projects/${projectId}/invite-codes`).then(r => r.json()).catch(() => ({ codes: [] })),
    ]);
    setRequests(requestsRes.requests || []);
    setCodes(codesRes.codes || []);
  }, [projectId]);

  useEffect(() => {
    if (isOwner) {
      void loadOwnerData();
    }
  }, [isOwner, loadOwnerData]);

  const reload = useCallback(async () => {
    await reloadMembers();
  }, [reloadMembers]);

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleRoleChange = async (userId: string, role: string) => {
    await apiFetch(`/api/projects/${projectId}/members`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    reload();
  };

  const handleRemove = async (userId: string) => {
    const ok = await confirm({
      title: t.projectSettings.removeMember,
      description: t.projectSettings.removeMemberDesc,
      confirmText: t.common.remove,
    });
    if (!ok) return;
    await apiFetch(`/api/projects/${projectId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    reload();
  };

  const handleApprove = async (requestId: string) => {
    await apiFetch(`/api/projects/${projectId}/join-requests`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action: "approve" }),
    });
    reload();
    void loadOwnerData();
  };

  const handleReject = async (requestId: string) => {
    await apiFetch(`/api/projects/${projectId}/join-requests`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId, action: "reject" }),
    });
    reload();
    void loadOwnerData();
  };

  const handleGenerate = async () => {
    try {
      const res = await apiFetch(`/api/projects/${projectId}/invite-codes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: genRole,
          maxUses: 0,
          expiresInDays: genExpiry ? parseInt(genExpiry) : null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        copyCode(data.code.code);
        setShowGenerate(false);
        reload();
        void loadOwnerData();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Failed: ${err.message || res.status}`);
      }
    } catch (e) {
      console.error("Generate failed:", e);
      alert("Network error");
    }
  };

  const handleDeleteCode = async (codeId: string) => {
    await apiFetch(`/api/projects/${projectId}/invite-codes`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codeId }),
    });
    void loadOwnerData();
  };

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-8">
      {/* Members */}
      <section>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">{t.projectSettings.membersSection}</h3>
        <div className="space-y-1">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
              <div>
                <p className="text-sm font-medium">{m.user.name || m.user.email}</p>
                {m.user.name && <p className="text-xs text-muted-foreground">{m.user.email}</p>}
              </div>
              <div className="flex items-center gap-2">
                {isOwner && m.role !== "owner" ? (
                  <>
                    <RoleGate minRole="owner">
                      <select
                        value={m.role}
                        onChange={(e) => handleRoleChange(m.userId, e.target.value)}
                        className="rounded-md border bg-background px-2 py-1 text-xs"
                      >
                        <option value="editor">editor</option>
                        <option value="viewer">viewer</option>
                      </select>
                    </RoleGate>
                    <RoleGate minRole="owner">
                      <button onClick={() => handleRemove(m.userId)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </RoleGate>
                  </>
                ) : (
                  <span className={cn(
                    "rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                    m.role === "owner" ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                  )}>
                    {m.role}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pending Requests (owner only) */}
      {isOwner && requests.length > 0 && (
        <section>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
            {t.projectSettings.pendingRequests}
            <span className="ml-2 rounded-full bg-foreground px-1.5 py-0.5 text-[10px] text-background">{requests.length}</span>
          </h3>
          <div className="space-y-1">
            {requests.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{r.user.name || r.user.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" onClick={() => handleApprove(r.id)}>
                    <Check className="mr-1 h-3 w-3" /> {t.projectSettings.approve}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleReject(r.id)}>
                    <X className="mr-1 h-3 w-3" /> {t.projectSettings.reject}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Invite Codes (owner only) */}
      {isOwner && (
        <section>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">{t.projectSettings.inviteCodes}</h3>
          {codes.length > 0 && (
            <div className="space-y-1 mb-3">
              {codes.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                  <div>
                    <code className="text-xs font-mono">{c.code}</code>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {c.role} · {c.maxUses > 0 ? `${c.useCount}/${c.maxUses} ${t.projectSettings.used}` : `${c.useCount} ${t.projectSettings.used}`}
                      {c.expiresAt && ` · ${t.projectSettings.expires} ${new Date(c.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => copyCode(c.code)} className="rounded p-1.5 text-muted-foreground hover:bg-accent">
                      {copied === c.code ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => handleDeleteCode(c.id)} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showGenerate ? (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex gap-3">
                <div>
                  <label className="text-xs font-medium">{t.projectSettings.role}</label>
                  <select value={genRole} onChange={(e) => setGenRole(e.target.value)} className="mt-1 block w-full rounded-md border bg-background px-2 py-1.5 text-xs">
                    <option value="editor">editor</option>
                    <option value="viewer">viewer</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium">{t.projectSettings.expires}</label>
                  <select value={genExpiry} onChange={(e) => setGenExpiry(e.target.value)} className="mt-1 block w-full rounded-md border bg-background px-2 py-1.5 text-xs">
                    <option value="1">{t.projectSettings.day1}</option>
                    <option value="7">{t.projectSettings.days7}</option>
                    <option value="30">{t.projectSettings.days30}</option>
                    <option value="">{t.projectSettings.never}</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={handleGenerate}>{t.projectSettings.generateAndCopy}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setShowGenerate(false)}>{t.common.cancel}</Button>
              </div>
            </div>
          ) : (
            <RoleGate minRole="owner">
              <Button type="button" size="sm" variant="outline" onClick={() => setShowGenerate(true)}>
                <Plus className="mr-1.5 h-3 w-3" /> {t.projectSettings.generateCode}
              </Button>
            </RoleGate>
          )}
        </section>
      )}
    </div>
  );
}
