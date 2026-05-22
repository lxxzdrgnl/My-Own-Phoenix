import { redirect } from "next/navigation";

// Prompts are project-scoped. There is no global prompts view — every user
// must navigate to a specific project's prompts page (/[slug]/prompts).
export default function PromptsPage() {
  redirect("/projects");
}
