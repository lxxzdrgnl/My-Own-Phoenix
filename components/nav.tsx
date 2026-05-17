"use client";

import Link from "next/link";
import { LogOut, Globe, ChevronDown } from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useI18n, type Locale } from "@/lib/i18n";
import { AuthModal } from "@/components/modals/auth-modal";

export function Nav({ fullWidth }: { fullWidth?: boolean } = {}) {
  const { user } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (!langOpen) return;
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [langOpen]);

  const handleModalClose = useCallback(() => {
    setShowAuthModal(false);
    dismissedRef.current = true;
  }, []);

  return (
    <>
      <AuthModal open={showAuthModal} onClose={handleModalClose} />
      <nav className="border-b bg-background/80 backdrop-blur-sm">
        <div className={`flex items-center justify-between px-6 py-3.5 ${fullWidth ? "" : "mx-auto max-w-6xl"}`}>
          <Link href="/" className="text-sm font-bold tracking-tight hover:opacity-80 transition-opacity">
            My Own Phoenix
          </Link>
          <div className="flex items-center gap-3">
            {/* Language selector (custom dropdown) */}
            <div className="relative" ref={langRef}>
              <button
                onClick={() => setLangOpen(!langOpen)}
                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Globe className="h-3.5 w-3.5" />
                {locale === "ko" ? "한국어" : "English"}
                <ChevronDown className={`h-3 w-3 transition-transform ${langOpen ? "rotate-180" : ""}`} />
              </button>
              {langOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-32 rounded-lg border bg-popover p-1 shadow-lg">
                  {([["ko", "한국어"], ["en", "English"]] as const).map(([code, label]) => (
                    <button
                      key={code}
                      onClick={() => { setLocale(code); setLangOpen(false); }}
                      className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        locale === code ? "bg-accent text-accent-foreground" : "hover:bg-accent"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Link
              href="/docs"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {t.nav.docs}
            </Link>
            {user ? (
              <button
                onClick={() => signOut(auth)}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" />
                {t.nav.signOut}
              </button>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="rounded-lg bg-foreground px-4 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-80"
              >
                {t.nav.signIn}
              </button>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
