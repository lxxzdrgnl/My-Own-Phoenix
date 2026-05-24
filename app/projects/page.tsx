"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { ProjectCard } from "@/components/project-card";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { FolderOpen, Plus } from "lucide-react";
import { JoinProjectModal } from "@/components/modals/join-project-modal";
import { Nav } from "@/components/nav";
import { useT } from "@/lib/i18n";
import { CreateProjectModal } from "@/components/modals/create-project-modal";

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
  const t = useT();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

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
      <CreateProjectModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />

      <JoinProjectModal open={showJoin} onClose={() => { setShowJoin(false); loadProjects(); }} />

      <div className="min-h-screen bg-background">
        <Nav />

        <div className="mx-auto max-w-6xl px-6 py-10">
          {projects.length === 0 ? (
            <div className="flex h-[60vh] flex-col items-center justify-center text-center">
              <EmptyState
                icon={FolderOpen}
                title={t.projects.welcome}
                description={t.projects.welcomeDesc}
              />
              <div className="mt-6 flex gap-3">
                <Button onClick={() => setShowCreate(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t.projects.createProject}
                </Button>
                <Button variant="outline" onClick={() => setShowJoin(true)}>
                  {t.projects.joinWithCode}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-8 flex items-center justify-between">
                <h1 className="text-xl font-semibold tracking-tight">{t.projects.title}</h1>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowJoin(true)}>{t.projects.join}</Button>
                  <Button size="sm" onClick={() => setShowCreate(true)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {t.projects.newProject}
                  </Button>
                </div>
              </div>

              {myProjects.length > 0 && (
                <section className="mb-8">
                  <h2 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t.projects.myProjects}</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {myProjects.map((p) => (
                      <ProjectCard key={p.id} {...p} onRename={(n) => handleRename(p.id, n)} />
                    ))}
                  </div>
                </section>
              )}

              {sharedProjects.length > 0 && (
                <section>
                  <h2 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{t.projects.sharedWithMe}</h2>
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
