export default async function ProjectSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold tracking-tight">Project Settings</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        API keys, team members, agent configuration, and eval settings.
      </p>
    </div>
  );
}
