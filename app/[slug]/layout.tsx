import { ReactNode } from "react";
import { ProjectSidebar } from "@/components/project-sidebar";

interface LayoutProps {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}

export default async function ProjectLayout({ children, params }: LayoutProps) {
  const { slug } = await params;

  // For now, use slug as display name.
  // TODO: fetch project name from DB via server component
  const projectName = slug;

  return (
    <div className="flex h-screen">
      <ProjectSidebar slug={slug} projectName={projectName} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
