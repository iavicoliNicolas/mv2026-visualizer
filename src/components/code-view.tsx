"use client";

import { useEffect, useRef } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { hex2, hex4 } from "@/vm/bits";
import type { DisasmLine } from "@/vm";
import { cn } from "cn";

export function CodeView({ lines, active }: { lines: DisasmLine[]; active: number }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = root.current?.querySelector<HTMLElement>(`[data-phys="${active}"]`);
    node?.scrollIntoView({ block: "center" });
  }, [active]);

  return (
    <ScrollArea className="h-full">
      <div ref={root} className="py-1 font-mono text-[12px] leading-5">
        {lines.length === 0 ? (
          <p className="px-3 py-4 text-muted-foreground">No hay segmento de código para mostrar.</p>
        ) : (
          lines.map((line) => {
            const on = line.kind === "code" && line.physical === active;
            return (
              <div
                key={`${line.kind}-${line.physical}`}
                data-phys={line.kind === "code" ? line.physical : undefined}
                className={cn(
                  "grid grid-cols-[1rem_3.2rem_minmax(0,1fr)] gap-x-2 px-2",
                  on && "bg-[var(--hot)] text-foreground",
                  !on && line.kind === "string" && "text-muted-foreground",
                )}
              >
                <span>{line.isEntry ? ">" : on ? "·" : ""}</span>
                <span className="text-muted-foreground">{hex4(line.physical)}</span>
                <span className="min-w-0">
                  <span className="block break-words">{line.text}</span>
                  <span className="block break-all text-muted-foreground">
                    {line.bytes.map((byte) => hex2(byte)).join(" ")}
                  </span>
                </span>
              </div>
            );
          })
        )}
      </div>
    </ScrollArea>
  );
}
