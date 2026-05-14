import { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ProjectSidebar } from "@/components/project-sidebar";
import { ProjectProvider } from "@/lib/project-context";
import { ProjectGuard } from "@/components/project-guard";
import { prisma } from "@/lib/prisma";

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function ProjectLayout({ children, params }: LayoutProps) {
  const { slug } = await params;

  const project = await prisma.project.findFirst({
    where: { OR: [{ slug }, { phoenixProject: slug }] },
    select: { id: true, slug: true, name: true, phoenixProject: true },
  });

  if (!project) {
    notFound();
  }

  return (
    <ProjectProvider value={{ id: project.id, slug: project.slug, name: project.name, phoenixProject: project.phoenixProject }}>
      <div className="flex h-screen">
        <ProjectSidebar slug={project.slug} projectName={project.name} />
        <main className="flex-1 overflow-y-auto bg-background">
          <ProjectGuard projectId={project.id}>
            {children}
          </ProjectGuard>
        </main>
      </div>
    </ProjectProvider>
  );
}
