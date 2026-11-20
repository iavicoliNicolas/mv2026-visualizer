import type { ReactNode } from "react";

import { cn } from "cn";

export function Panel({
  title,
  extra,
  children,
  className,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card", className)}>
      <header className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-[11px] font-medium tracking-[0.16em] text-muted-foreground uppercase">{title}</h2>
        {extra}
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </section>
  );
}
