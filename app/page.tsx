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
import { FolderOpen, Plus, LogIn, LogOut, Settings } from "lucide-react";
import { AuthModal } from "@/components/auth-modal";
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

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

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
    else setLoading(false);
  }, [user, loadProjects]);

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

  // Not logged in
  if (!user) {
    return (
      <>
        <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">My Own Phoenix</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Monitor and test your AI agents
            </p>
            <Button className="mt-6" onClick={() => setShowAuth(true)}>
              <LogIn className="mr-2 h-4 w-4" />
              Sign in to get started
            </Button>
          </div>
        </div>
      </>
    );
  }

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
      {/* Create Project Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} className="w-[420px]">
        <ModalHeader onClose={() => setShowCreate(false)}>Create Project</ModalHeader>
        <ModalBody>
          <form
            onSubmit={(e) => { e.preventDefault(); handleCreate(); }}
            className="space-y-4"
          >
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
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!newName.trim() || creating}>
                {creating ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        </ModalBody>
      </Modal>

      <JoinProjectModal open={showJoin} onClose={() => { setShowJoin(false); loadProjects(); }} />

      {/* Main content */}
      <div className="min-h-screen bg-background">
      {/* Top bar */}
      <div className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <h1 className="text-sm font-bold tracking-tight">My Own Phoenix</h1>
          <div className="flex items-center gap-3">
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
            <Button className="mt-6" onClick={() => setShowCreate(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Project
            </Button>
            <Button variant="outline" className="mt-6 ml-2" onClick={() => setShowJoin(true)}>
              Join with Code
            </Button>
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
                <h2 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  My Projects
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {myProjects.map((p) => (
                    <ProjectCard key={p.id} {...p} />
                  ))}
                </div>
              </section>
            )}

            {sharedProjects.length > 0 && (
              <section>
                <h2 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Shared with me
                </h2>
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
