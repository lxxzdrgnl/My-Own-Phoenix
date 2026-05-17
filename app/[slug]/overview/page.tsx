"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProject } from "@/lib/project-context";

export default function OverviewPage() {
  const { slug } = useProject();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/${slug}/requests`);
  }, [slug, router]);

  return null;
}
