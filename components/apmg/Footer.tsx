/** Page footer — the client-requested credit line. Year tracks the real clock.
 *  `consoleTag` gates the internal "Signal Console" build identity (ui-standards
 *  §17.8): it belongs on dashboard surfaces only, so customer-facing hosts
 *  (the public /portal page) pass `consoleTag={false}` and show just the
 *  client-requested credit. */
export function Footer({ consoleTag = true }: { consoleTag?: boolean }) {
  return (
    <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border px-1 pt-4 font-mono text-[11px] text-muted-foreground">
      <span>Developed by APMG AI Team © {new Date().getFullYear()}</span>
      {consoleTag && (
        <span className="hidden uppercase tracking-[0.16em] sm:inline">
          Signal Console · build 1.0
        </span>
      )}
    </footer>
  );
}
