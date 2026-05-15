"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { ProjectCard } from "@/components/project-card";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ModalHeader, ModalBody } from "@/components/ui/modal";
import { FolderOpen, Plus, LogOut, Settings } from "lucide-react";
import { JoinProjectModal } from "@/components/join-project-modal";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

interface ProjectItem {
  id: string;
  name: string;
  slug: string;
  role: string;
  createdAt: string;
}

export default function ProjectsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Not logged in → redirect to landing
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  const loadProjects = useCallback(async () => {
    try {
      const res = await apiFetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadProjects();
  }, [user, loadProjects]);

  const handleRename = useCallback(async (projectId: string, newName: string) => {
    try {
      const res = await apiFetch("/api/projects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, name: newName }),
      });
      if (res.ok) {
        setProjects((prev) =>
          prev.map((p) => (p.id === projectId ? { ...p, name: newName } : p))
        );
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowCreate(false);
        setNewName("");
        router.push(`/${data.slug}/dashboard`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  };

  if (authLoading || !user) return null;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingState />
      </div>
    );
  }

  const myProjects = projects.filter((p) => p.role === "owner");
  const sharedProjects = projects.filter((p) => p.role !== "owner");

  return (
    <>
      <Modal open={showCreate} onClose={() => setShowCreate(false)} className="w-[420px]">
        <ModalHeader onClose={() => setShowCreate(false)}>Create Project</ModalHeader>
        <ModalBody>
          <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Project Name</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="my-legal-rag"
                autoFocus
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={!newName.trim() || creating}>
                {creating ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </ModalBody>
      </Modal>

      <JoinProjectModal open={showJoin} onClose={() => { setShowJoin(false); loadProjects(); }} />

      <div className="min-h-screen bg-background">
        {/* Top bar */}
        <div className="border-b bg-card">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
            <a href="/" className="text-sm font-bold tracking-tight hover:opacity-70 transition-opacity">
              My Own Phoenix
            </a>
            <div className="flex items-center gap-3">
              <a href="/docs" className="text-xs text-muted-foreground transition-colors hover:text-foreground">Docs</a>
              <a href="/settings" className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                <Settings className="h-3.5 w-3.5" />
                Settings
              </a>
              <span className="text-xs text-muted-foreground">{user.email}</span>
              <button
                onClick={() => signOut(auth)}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-6 py-10">
          {projects.length === 0 ? (
            <div className="flex h-[60vh] flex-col items-center justify-center text-center">
              <EmptyState
                icon={FolderOpen}
                title="Welcome to My Own Phoenix"
                description="Create a project or join an existing one to start monitoring your AI agents."
              />
              <div className="mt-6 flex gap-3">
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Project
                </Button>
                <Button variant="outline" onClick={() => setShowJoin(true)}>
                  Join with Code
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-8 flex items-center justify-between">
                <h1 className="text-xl font-semibold tracking-tight">Projects</h1>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowJoin(true)}>Join</Button>
                  <Button size="sm" onClick={() => setShowCreate(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    New Project
                  </Button>
                </div>
              </div>

              {myProjects.length > 0 && (
                <section className="mb-8">
                  <h2 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">My Projects</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {myProjects.map((p) => (
                      <ProjectCard key={p.id} {...p} onRename={(n) => handleRename(p.id, n)} />
                    ))}
                  </div>
                </section>
              )}

              {sharedProjects.length > 0 && (
                <section>
                  <h2 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Shared with me</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {sharedProjects.map((p) => (
                      <ProjectCard key={p.id} {...p} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
