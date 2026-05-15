"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Quote } from "lucide-react";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push("/");
    }
  }, [user, loading, router]);

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      if (err?.code !== "auth/cancelled-popup-request") {
        console.error("Login failed:", err);
      }
    }
  };

  return (
    <div className="flex h-dvh items-center justify-center bg-background p-6 lg:p-12">
      <div className="flex h-full max-h-[720px] w-full max-w-5xl overflow-hidden rounded-2xl border shadow-sm">
      {/* Left: Testimonial / Branding — light gray panel */}
      <div className="hidden w-1/2 flex-col justify-between bg-muted/50 p-12 lg:flex">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-bold tracking-tight">My Own Phoenix</h1>
        </div>

        <div className="max-w-lg">
          <Quote className="mb-6 h-6 w-6 text-muted-foreground/20" />
          <p className="text-2xl font-semibold leading-snug tracking-tight">
            <span className="text-muted-foreground">An excellent observability platform!</span>{" "}
            I use it for all my AI agents now. Trace collection, evaluations, and team collaboration in one place.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10 text-sm font-bold">
              YJ
            </div>
            <div>
              <p className="text-sm font-medium">AI Developer</p>
              <p className="text-xs text-muted-foreground">LLM Application Team</p>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground/40">
          LLM Observability Platform
        </p>
      </div>

      {/* Right: Login form */}
      <div className="flex flex-1 flex-col items-center justify-center bg-card px-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-10 lg:hidden">
            <h1 className="text-lg font-bold tracking-tight">My Own Phoenix</h1>
          </div>

          <h2 className="text-2xl font-bold tracking-tight">Welcome</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to access your projects and start monitoring your AI agents.
          </p>

          <div className="mt-8">
            <Button
              className="w-full h-12 gap-3 text-sm"
              onClick={handleGoogleLogin}
              disabled={loading}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Sign in with Google
            </Button>
          </div>

          <p className="mt-10 text-center text-[10px] text-muted-foreground/40">
            By signing in, you agree to our terms of service.
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}
