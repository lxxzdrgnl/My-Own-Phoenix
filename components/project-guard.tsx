"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api-client";
import { ProjectProvider } from "@/lib/project-context";
import { LoadingState } from "@/components/ui/empty-state";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthModal } from "@/components/modals/auth-modal";
import { Heading } from "@/components/ui/typography";

interface ProjectGuardProps {
  projectId: string;
  project: { id: string; slug: string; name: string; phoenixProject: string };
  children: React.ReactNode;
}

export function ProjectGuard({ projectId, project, children }: ProjectGuardProps) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "ok" | "denied" | "unauthenticated">("loading");
  const [role, setRole] = useState<"owner" | "editor" | "viewer">("viewer");
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setStatus("unauthenticated");
      return;
    }

    apiFetch(`/api/projects`)
      .then((res) => res.json())
      .then((projects: { id: string; role: string }[]) => {
        const membership = projects.find((p) => p.id === projectId);
        if (membership) {
          setRole(membership.role as "owner" | "editor" | "viewer");
          setStatus("ok");
        } else {
          setStatus("denied");
        }
      })
      .catch(() => setStatus("denied"));
  }, [user, authLoading, projectId]);

  if (status === "loading" || authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingState />
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <>
        <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
        <div className="flex h-full flex-col items-center justify-center text-center">
          <ShieldAlert className="mb-4 h-10 w-10 text-muted-foreground/30" />
          <Heading level="section">Sign in required</Heading>
          <p className="mt-1 text-sm text-muted-foreground">
            You need to sign in to access this project.
          </p>
          <Button className="mt-4" onClick={() => setShowAuth(true)}>
            Sign in
          </Button>
        </div>
      </>
    );
  }

  if (status === "denied") {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <ShieldAlert className="mb-4 h-10 w-10 text-muted-foreground/30" />
        <Heading level="section">Access Denied</Heading>
        <p className="mt-1 text-sm text-muted-foreground">
          You don&apos;t have access to this project.<br />
          Ask the project owner for an invite code.
        </p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/")}>
          Back to Projects
        </Button>
      </div>
    );
  }

  return (
    <ProjectProvider value={{ ...project, role }}>
      {children}
    </ProjectProvider>
  );
}
