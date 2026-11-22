import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PHASES, regName } from "@/vm";
import type { Machine, Phase } from "@/vm";
import { cn } from "cn";

const SPEEDS = [
  { ms: 1100, label: "Lento" },
  { ms: 550, label: "Normal" },
  { ms: 160, label: "Rápido" },
];

export function CycleView({
  mv,
  running,
  speed,
  onMicro,
  onInstruction,
  onToggleRun,
  onReset,
  onSpeed,
}: {
  mv: Machine;
  running: boolean;
  speed: number;
  onMicro: () => void;
  onInstruction: () => void;
  onToggleRun: () => void;
  onReset: () => void;
  onSpeed: (ms: number) => void;
}) {
  const event = mv.lastEvent;
  const phase: Phase | null = event && mv.status !== "halted" ? event.phase : null;
  const blocked = mv.status === "halted" || mv.status === "error" || mv.status === "input";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <ol className="flex flex-wrap gap-1">
        {PHASES.map((item, index) => (
          <li key={item.id}>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                phase === item.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground",
              )}
            >
              <span className="font-mono">{index + 1}</span>
              {item.label}
            </span>
          </li>
        ))}
      </ol>

      {mv.status === "error" ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {mv.errorMessage}. El estado queda congelado en la fase donde se detectó.
        </div>
      ) : null}
      {mv.status === "halted" ? (
        <div className="rounded-lg border border-primary/40 bg-[var(--hot)] px-3 py-2 text-sm">
          Ejecución terminada.
        </div>
      ) : null}
      {mv.breakpointPause ? (
        <div className="rounded-lg border border-primary/40 px-3 py-2 text-sm">
          Breakpoint. El modo correr está frenado; seguí con un micro-paso o con una instrucción.
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <p className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          {event ? event.title : "Listo"}
          {event?.mnemonic ? ` · ${event.mnemonic}` : ""}
        </p>
        <p className="mt-1 font-serif text-lg leading-snug text-foreground">
          {event?.detail ??
            "El programa ya está en memoria y el IP apunta a la primera instrucción. El primer micro-paso hace el fetch: traduce el IP a una dirección física y lee el byte de operación."}
        </p>
        {event && event.changedRegs.length > 0 ? (
          <p className="mt-2 font-mono text-[12px] text-muted-foreground">
            {event.changedRegs
              .map((diff) => `${regName(diff.reg) || `R${diff.reg}`} ${diff.to.toString(16).toUpperCase().padStart(8, "0")}`)
              .join("   ")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onMicro} disabled={blocked}>
          Micro-paso
        </Button>
        <Button variant="secondary" onClick={onInstruction} disabled={blocked}>
          Instrucción
        </Button>
        <Button variant="outline" onClick={onToggleRun} disabled={mv.status !== "running" && !running}>
          {running ? "Pausa" : "Correr"}
        </Button>
        <Button variant="ghost" onClick={onReset}>
          Reiniciar
        </Button>
        <div className="ml-auto flex gap-1">
          {SPEEDS.map((item) => (
            <Badge
              key={item.ms}
              variant={speed === item.ms ? "default" : "outline"}
              className="cursor-pointer"
              render={<button type="button" onClick={() => onSpeed(item.ms)} />}
            >
              {item.label}
            </Badge>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Teclas: N micro-paso, I instrucción, R correr o pausar. La velocidad corre fase por fase.
      </p>
    </div>
  );
}
