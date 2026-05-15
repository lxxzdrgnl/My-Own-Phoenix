interface SectionCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  headerVariant?: "default" | "destructive";
}

export function SectionCard({
  title,
  description,
  children,
  headerVariant = "default",
}: SectionCardProps) {
  return (
    <section>
      <h3
        className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${
          headerVariant === "destructive"
            ? "text-destructive"
            : "text-muted-foreground"
        }`}
      >
        {title}
      </h3>
      {description && (
        <p className="text-xs text-muted-foreground mb-3">{description}</p>
      )}
      {children}
    </section>
  );
}
