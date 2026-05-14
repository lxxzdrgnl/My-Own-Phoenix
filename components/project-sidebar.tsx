"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  LayoutDashboard,
  BarChart3,
  List,
  MessageSquare,
  FlaskConical,
  SlidersHorizontal,
  Gauge,
  Database,
  ShieldAlert,
  Settings2,
  Settings,
} from "lucide-react";
import { Sidebar, SidebarHeader, SidebarItemLink } from "@/components/ui/sidebar";

interface ProjectSidebarProps {
  slug: string;
  projectName: string;
}

const NAV_GROUPS = [
  {
    label: "Analytics",
    items: [
      { href: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "overview", label: "Overview", icon: BarChart3 },
      { href: "requests", label: "Requests", icon: List },
    ],
  },
  {
    label: "Develop",
    items: [
      { href: "chat", label: "Chat", icon: MessageSquare },
      { href: "playground", label: "Playground", icon: FlaskConical },
    ],
  },
  {
    label: "Quality",
    items: [
      { href: "evaluations", label: "Evaluations", icon: SlidersHorizontal },
      { href: "measure", label: "Measure", icon: Gauge },
      { href: "datasets", label: "Datasets", icon: Database },
      { href: "risks", label: "Risks", icon: ShieldAlert },
    ],
  },
];

export function ProjectSidebar({ slug, projectName }: ProjectSidebarProps) {
  const pathname = usePathname();

  // Extract the current sub-path: /my-slug/dashboard → dashboard
  const segments = pathname.split("/").filter(Boolean);
  const currentPage = segments.length > 1 ? segments[1] : "dashboard";

  return (
    <Sidebar className="py-3">
      {/* Back button */}
      <div className="px-3 mb-1">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Projects</span>
        </Link>
      </div>

      {/* Project name */}
      <div className="px-5 mb-4 mt-1">
        <p className="text-sm font-semibold truncate">{projectName}</p>
      </div>

      {/* Navigation groups */}
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="mb-2">
          <div className="px-5 mb-1">
            <SidebarHeader>{group.label}</SidebarHeader>
          </div>
          <div className="px-3 space-y-0.5">
            {group.items.map(({ href, label, icon: Icon }) => (
              <SidebarItemLink
                key={href}
                href={`/${slug}/${href}`}
                active={currentPage === href}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
              </SidebarItemLink>
            ))}
          </div>
        </div>
      ))}

      {/* Settings */}
      <div className="mt-auto border-t pt-2 px-3">
        <SidebarItemLink
          href={`/${slug}/settings`}
          active={currentPage === "settings"}
        >
          <Settings2 className="h-4 w-4 shrink-0" />
          <span>Settings</span>
        </SidebarItemLink>
        <SidebarItemLink href="/settings" active={false}>
          <Settings className="h-4 w-4 shrink-0 text-muted-foreground/50" />
          <span className="text-muted-foreground/60">Global Settings</span>
        </SidebarItemLink>
      </div>
    </Sidebar>
  );
}
