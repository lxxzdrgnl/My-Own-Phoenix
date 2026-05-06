/** Provider brand icons (SVG). Shared across settings, model-selector, etc. */

interface ProviderIconProps {
  provider: string;
  /** Fixed pixel size (used when no className override). */
  size?: number;
  /** Tailwind size class, e.g. "h-4 w-4". Overrides size prop. */
  className?: string;
}

export function ProviderIcon({ provider, size = 24, className }: ProviderIconProps) {
  const icon = ICONS[provider];
  if (!icon) {
    const style = className
      ? undefined
      : { width: size, height: size, display: "flex" as const, alignItems: "center" as const, justifyContent: "center" as const, borderRadius: 6, background: "var(--muted)", fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", textTransform: "uppercase" as const };
    return (
      <div className={className} style={style}>
        {provider.slice(0, 2)}
      </div>
    );
  }
  return (
    <svg
      viewBox={icon.viewBox}
      {...(className ? {} : { width: size, height: size })}
      className={className}
      role="img"
      aria-label={provider}
      dangerouslySetInnerHTML={{ __html: icon.svg }}
    />
  );
}

const ICONS: Record<string, { viewBox: string; svg: string }> = {
  openai: {
    viewBox: "0 0 24 24",
    svg: `<path fill="currentColor" d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>`,
  },
  anthropic: {
    viewBox: "0 0 24 24",
    svg: `<path fill="currentColor" d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.767L16.906 20.48h-3.674l-1.343-3.461H5.017l-1.344 3.46H0L6.57 3.522zm1.21 5.175l-2.33 5.998h4.658l-2.328-5.998z"/>`,
  },
  google: {
    viewBox: "0 0 24 24",
    svg: `<defs><linearGradient id="gemini-g" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse"><stop stop-color="#4285F4"/><stop offset="0.5" stop-color="#9B72CB"/><stop offset="1" stop-color="#D96570"/></linearGradient></defs><path fill="url(#gemini-g)" d="M12 0c0 3.18-1.127 6.235-3.134 8.515C6.783 10.87 3.47 12 0 12c3.47 0 6.783 1.13 8.866 3.485C10.873 17.765 12 20.82 12 24c0-3.18 1.127-6.235 3.134-8.515C17.217 13.13 20.53 12 24 12c-3.47 0-6.783-1.13-8.866-3.485C13.127 6.235 12 3.18 12 0z"/>`,
  },
  xai: {
    viewBox: "0 0 24 24",
    svg: `<path fill="currentColor" d="M2.04 3h4.05l7.92 12.27L21.96 3H24L14.52 18.84 17.64 24h-4.08l-2.61-4.32L8.34 24H6.3l3.15-5.16z"/>`,
  },
};
