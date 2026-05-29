"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  LayoutDashboard,
  List,
  MessageSquare,
  FlaskConical,
  SlidersHorizontal,
  Gauge,
  Database,
  Shield,
  Settings2,
  Settings,
  LogOut,
  FileText,
  PanelLeftClose,
  PanelLeft,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Heading, Text } from "@/components/ui/typography";

interface ProjectSidebarProps {
  slug: string;
  projectName: string;
}

const LS_KEY = "sidebar_collapsed";

export function ProjectSidebar({ slug, projectName }: ProjectSidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const t = useT();
  const segments = pathname.split("/").filter(Boolean);
  const currentPage = segments.length > 1 ? segments[1] : "chat";
  const [collapsed, setCollapsed] = useState(false);

  const NAV_GROUPS = [
    {
      label: t.projects.testing ?? "Testing",
      items: [
        { href: "chat", label: t.chat.title, icon: MessageSquare },
        { href: "playground", label: t.playground.title, icon: FlaskConical },
        { href: "datasets", label: t.datasets.title, icon: Database },
      ],
    },
    {
      label: t.projects.monitoring ?? "Monitoring",
      items: [
        { href: "dashboard", label: t.dashboard.title, icon: LayoutDashboard },
        { href: "requests", label: t.projects.requests ?? "Requests", icon: List },
        { href: "evaluations", label: t.evaluations.title, icon: SlidersHorizontal },
        { href: "human-review", label: t.projects.humanReview ?? "Human Review", icon: Users },
      ],
    },
    {
      label: t.projects.safety ?? "Safety",
      items: [
        { href: "measure", label: t.projects.measureNav ?? "Risk Management", icon: Gauge },
        { href: "rmf-report", label: t.projects.financeRmf ?? "금융 AI RMF", icon: FileText },
        { href: "pii-guard", label: t.projects.piiGuard ?? "PII Guard", icon: Shield },
      ],
    },
  ];

  useEffect(() => {
    setCollapsed(localStorage.getItem(LS_KEY) === "true");
  }, []);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(LS_KEY, String(next));
  };

  // Collapsed: icon-only sidebar
  if (collapsed) {
    return (
      <div className="flex w-14 shrink-0 flex-col items-center border-r bg-card py-4">
        <button
          onClick={toggle}
          className="mb-4 rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={t.projects.expandSidebar ?? "Expand sidebar"}
        >
          <PanelLeft className="h-4 w-4" />
        </button>

        <div className="flex-1 space-y-1">
          {NAV_GROUPS.flatMap((g) => g.items).map(({ href, label, icon: Icon }) => {
            const active = currentPage === href;
            return (
              <Link
                key={href}
                href={`/${slug}/${href}`}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
                  active
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
                title={label}
              >
                <Icon className="h-4 w-4" />
              </Link>
            );
          })}
        </div>

        <div className="space-y-1">
          <Link
            href={`/${slug}/settings`}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
              currentPage === "settings"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
            title={t.projects.projectSettings ?? "Project Settings"}
          >
            <Settings2 className="h-4 w-4" />
          </Link>

          {user && (
            <button
              onClick={() => signOut(auth).then(() => window.location.href = "/")}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title={t.nav.signOut}
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Expanded: full sidebar
  return (
    <div className="flex w-60 shrink-0 flex-col border-r bg-card py-4">
      {/* Header */}
      <div className="px-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <Link
            href="/projects"
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            {t.projects.title}
          </Link>
          <button
            onClick={toggle}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={t.projects.collapseSidebar ?? "Collapse sidebar"}
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        </div>
        <Heading level="section" as="h2" className="text-sm truncate">{projectName}</Heading>
      </div>

      {/* Navigation */}
      <div className="flex-1 space-y-5 px-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <Heading level="sub" as="h3" className="px-2 mb-1.5">
              {group.label}
            </Heading>
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
            {t.projects.projectSettings ?? "Project Settings"}
          </Link>
        </div>
        <div className="border-t pt-2 space-y-0.5">
          <Link
            href="/docs"
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-muted-foreground/50 transition-colors hover:bg-accent hover:text-muted-foreground"
          >
            <FileText className="h-4 w-4" />
            {t.nav.docs}
          </Link>
          <Link
            href="/settings"
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium text-muted-foreground/50 transition-colors hover:bg-accent hover:text-muted-foreground"
          >
            <Settings className="h-4 w-4" />
            {t.projects.globalSettings ?? "Global Settings"}
          </Link>
        </div>

        {user && (
          <div className="border-t pt-3">
            <div className="flex items-center justify-between px-2.5 py-1">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{user.displayName || user.email}</p>
                {user.displayName && (
                  <Text variant="caption" className="truncate text-[10px]">{user.email}</Text>
                )}
              </div>
              <button
                onClick={() => signOut(auth).then(() => window.location.href = "/")}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title={t.nav.signOut}
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
