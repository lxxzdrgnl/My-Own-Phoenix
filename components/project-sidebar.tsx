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
  LogOut,
  FileText,
} from "lucide-react";
import { Sidebar, SidebarHeader } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

interface ProjectSidebarProps {
  slug: string;
  projectName: string;
}

const NAV_GROUPS = [
  {
    label: "Develop",
    items: [
      { href: "chat", label: "Chat", icon: MessageSquare },
      { href: "playground", label: "Playground", icon: FlaskConical },
    ],
  },
  {
    label: "Analytics",
    items: [
      { href: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "overview", label: "Requests", icon: List },
      { href: "evaluations", label: "Evaluations", icon: SlidersHorizontal },
      { href: "measure", label: "Measure", icon: Gauge },
    ],
  },
  {
    label: "Quality",
    items: [
      { href: "datasets", label: "Datasets", icon: Database },
      { href: "risks", label: "Risks", icon: ShieldAlert },
    ],
  },
];

export function ProjectSidebar({ slug, projectName }: ProjectSidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const segments = pathname.split("/").filter(Boolean);
  const currentPage = segments.length > 1 ? segments[1] : "chat";

  return (
    <Sidebar className="py-4 bg-card">
      {/* Back + Project name */}
      <div className="px-4 mb-5">
        <Link
          href="/projects"
          className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Projects
        </Link>
        <h2 className="text-sm font-semibold truncate">{projectName}</h2>
      </div>

      {/* Navigation */}
      <div className="flex-1 space-y-5 px-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="px-2 mb-1.5">
              <SidebarHeader>{group.label}</SidebarHeader>
            </div>
            <div className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = currentPage === href;
                return (
                  <Link
                    key={href}
                    href={`/${slug}/${href}`}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
                      active
                        ? "bg-accent font-semibold"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom */}
      <div className="mt-auto space-y-1 px-3">
        {/* Project Settings — above the line */}
        <div className="space-y-0.5 pb-2">
          <Link
            href={`/${slug}/settings`}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
              currentPage === "settings"
                ? "bg-accent font-semibold"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Settings2 className="h-4 w-4" />
            Project Settings
          </Link>
        </div>
        {/* Docs + Global Settings — below the line */}
        <div className="border-t pt-2 space-y-0.5">
          <Link
            href="/docs"
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-muted-foreground/50 transition-colors hover:bg-accent hover:text-muted-foreground"
          >
            <FileText className="h-4 w-4" />
            Docs
          </Link>
          <Link
            href="/settings"
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-muted-foreground/50 transition-colors hover:bg-accent hover:text-muted-foreground"
          >
            <Settings className="h-4 w-4" />
            Global Settings
          </Link>
        </div>

        {/* User */}
        {user && (
          <div className="border-t pt-3">
            <div className="flex items-center justify-between px-2.5 py-1">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{user.displayName || user.email}</p>
                {user.displayName && (
                  <p className="truncate text-[10px] text-muted-foreground">{user.email}</p>
                )}
              </div>
              <button
                onClick={() => signOut(auth).then(() => window.location.href = "/")}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </Sidebar>
  );
}
