"use client";

import { useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { hex2, hex4 } from "@/vm/bits";
import type { SegmentView } from "@/vm";
import { cn } from "cn";

export function MemoryView({
  ram,
  segments,
  segment,
  onSegment,
  reads,
  writes,
  focus,
}: {
  ram: Uint8Array;
  segments: SegmentView[];
  segment: string;
  onSegment: (name: string) => void;
  reads: number[];
  writes: number[];
  focus: number;
}) {
  const current = segments.find((item) => item.name === segment) ?? segments[0];

  if (!current) {
    return <p className="px-3 py-4 text-sm text-muted-foreground">No hay segmentos cargados.</p>;
  }

  return (
    <Tabs value={current.name} onValueChange={(value) => onSegment(String(value))} className="h-full gap-0">
      <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
        <TabsList className="h-7">
          {segments.map((item) => (
            <TabsTrigger key={item.name} value={item.name} className="px-2 text-[11px]">
              {item.name}
            </TabsTrigger>
          ))}
        </TabsList>
        <p className="hidden font-mono text-[10px] text-muted-foreground sm:block">
          base {hex4(current.base)} · {current.size} B · TDS[{current.index}]
        </p>
      </div>
      {segments.map((item) => (
        <TabsContent key={item.name} value={item.name} className="min-h-0">
          <HexGrid
            ram={ram}
            base={item.base}
            size={item.size}
            reads={reads}
            writes={writes}
            focus={item.name === current.name ? focus : -1}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

const BYTES_PER_ROW = 8;

function windowStart(focus: number, base: number, size: number, rows: number) {
  if (focus < base || focus >= base + size) return 0;
  const row = Math.floor((focus - base) / BYTES_PER_ROW) * BYTES_PER_ROW;
  const max = Math.max(0, size - rows * BYTES_PER_ROW);
  return Math.max(0, Math.min(row - 2 * BYTES_PER_ROW, max));
}

function HexGrid({
  ram,
  base,
  size,
  reads,
  writes,
  focus,
}: {
  ram: Uint8Array;
  base: number;
  size: number;
  reads: number[];
  writes: number[];
  focus: number;
}) {
  const rows = 8;
  const auto = windowStart(focus, base, size, rows);
  const [override, setOverride] = useState<{ focus: number; origin: number } | null>(null);
  const origin = override?.focus === focus ? override.origin : auto;
  const readSet = new Set(reads);
  const writeSet = new Set(writes);

  const max = Math.max(0, size - BYTES_PER_ROW);
  const start = Math.min(origin, max);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="rounded bg-[var(--read)] px-1.5 py-0.5 text-foreground">leído</span>
        <span className="rounded bg-[var(--write)] px-1.5 py-0.5 text-foreground">escrito</span>
        <label className="ml-auto flex items-center gap-2">
          ventana
          <input
            type="range"
            min={0}
            max={max}
            step={BYTES_PER_ROW}
            value={start}
            onChange={(event) => setOverride({ focus, origin: Number(event.target.value) })}
            aria-label="Desplazar la ventana de memoria"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-2 pb-2 font-mono text-[11px] leading-5">
        {Array.from({ length: rows }, (_, index) => start + index * BYTES_PER_ROW)
          .filter((offset) => offset < size)
          .map((offset) => {
            const count = Math.min(BYTES_PER_ROW, size - offset);
            let ascii = "";
            const cells = [];
            for (let i = 0; i < count; i++) {
              const addr = base + offset + i;
              const byte = ram[addr] ?? 0;
              ascii += byte >= 32 && byte < 127 ? String.fromCharCode(byte) : ".";
              cells.push(
                <span
                  key={addr}
                  className={cn(
                    "inline-block w-[1.35rem] text-center",
                    writeSet.has(addr) && "rounded bg-[var(--write)]",
                    !writeSet.has(addr) && readSet.has(addr) && "rounded bg-[var(--read)]",
                  )}
                >
                  {hex2(byte)}
                </span>,
              );
            }
            return (
              <div key={offset} className="flex flex-nowrap items-baseline gap-2">
                <span className="w-10 shrink-0 text-muted-foreground">{hex4(base + offset)}</span>
                <span className="flex shrink-0 gap-x-0.5">{cells}</span>
                <span className="shrink-0 text-muted-foreground">{ascii}</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
