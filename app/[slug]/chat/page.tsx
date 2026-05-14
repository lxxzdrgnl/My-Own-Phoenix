"use client";

import { useParams } from "next/navigation";
import { Assistant } from "@/app/assistant";

export default function ChatPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  // For now, use slug as the Phoenix project name
  // TODO: resolve slug → phoenixProject from Project model
  return (
    <div className="h-full">
      <Assistant project={slug} />
    </div>
  );
}
