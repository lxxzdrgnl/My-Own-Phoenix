"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useResourceList } from "@/lib/hooks/use-resource-list";
import { ProjectCard } from "@/components/project-card";
import { LoadingState, EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { FolderOpen, Plus } from "lucide-react";
import { JoinProjectModal } from "@/components/modals/join-project-modal";
import { Nav } from "@/components/nav";
import { useT } from "@/lib/i18n";
import { CreateProjectModal } from "@/components/modals/create-project-modal";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";

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
  const { items: projects, setItems: setProjects, loading, reload: loadProjects } = useResourceList<ProjectItem>("/api/projects");
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  // Not logged in → redirect to landing
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/");
    }
  }, [user, authLoading, router]);

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
  }, [setProjects]);

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

        <PageContainer size="wide" className="py-10">
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
              <PageHeader
                title={t.projects.title}
                actions={
                  <>
                    <Button size="sm" variant="outline" onClick={() => setShowJoin(true)}>{t.projects.join}</Button>
                    <Button size="sm" onClick={() => setShowCreate(true)}>
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      {t.projects.newProject}
                    </Button>
                  </>
                }
              />

              {myProjects.length > 0 && (
                <SectionCard title={t.projects.myProjects}>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {myProjects.map((p) => (
                      <ProjectCard key={p.id} {...p} onRename={(n) => handleRename(p.id, n)} />
                    ))}
                  </div>
                </SectionCard>
              )}

              {sharedProjects.length > 0 && (
                <SectionCard title={t.projects.sharedWithMe}>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {sharedProjects.map((p) => (
                      <ProjectCard key={p.id} {...p} />
                    ))}
                  </div>
                </SectionCard>
              )}
            </>
          )}
        </PageContainer>
      </div>
    </>
  );
}
