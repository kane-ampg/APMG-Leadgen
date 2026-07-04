/** Page footer — the client-requested credit line. Year tracks the real clock. */
export function Footer() {
  return (
    <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border px-1 pt-4 font-mono text-[11px] text-muted-foreground">
      <span>Developed by APMG AI Team © {new Date().getFullYear()}</span>
      <span className="hidden uppercase tracking-[0.16em] sm:inline">
        Signal Console · build 1.0
      </span>
    </footer>
  );
}
