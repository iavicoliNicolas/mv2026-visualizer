import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";

import { CodeView } from "@/components/code-view";
import { ConsoleView } from "@/components/console-view";
import { CycleView } from "@/components/cycle-view";
import { MemoryView } from "@/components/memory-view";
import { Panel } from "@/components/panel";
import { RegisterView } from "@/components/register-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BANDERAS_BLURB,
  IP,
  SALTO_BLURB,
  banderasProgram,
  disassemble,
  formatLogical,
  loadVmi,
  loadVmx,
  microStep,
  provideInput,
  saltoProgram,
  segmentsOf,
  stepInstruction,
} from "@/vm";
import type { Machine } from "@/vm";

function messageOf(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "No se pudo abrir el archivo";
}

const HOLA_BLURB =
  "Cada MOV [n], letra escribe un long de 4 bytes. Se pisan, y al final H, o, l y a quedan en DS+3. SYS 2 las imprime.";

type Source = {
  bytes: Uint8Array;
  name: string;
  kind: "vmx" | "vmi";
  blurb: string;
};

export function Workbench() {
  const [holaBytes, setHolaBytes] = useState<Uint8Array | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [ramKiB, setRamKiB] = useState(16);
  const [params, setParams] = useState("");
  const [seed, setSeed] = useState(1);
  const [vm, setVm] = useState<Machine | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(550);
  const [segmentChoice, setSegmentChoice] = useState<{ addr: number | undefined; name: string }>({
    addr: undefined,
    name: "DS",
  });

  function boot(next: Source, override?: { ramKiB?: number; params?: string; seed?: number }) {
    const ram = override?.ramKiB ?? ramKiB;
    const paramText = override?.params ?? params;
    const nextSeed = override?.seed ?? seed;
    setRunning(false);
    setSource(next);
    try {
      const machine =
        next.kind === "vmi"
          ? loadVmi(next.bytes, next.name)
          : loadVmx(next.bytes, {
              name: next.name,
              ramKiB: ram,
              params: paramText.split(/\s+/).filter(Boolean),
              seed: nextSeed,
              blurb: next.blurb,
            });
      setVm(machine);
      setLoadError(null);
      const views = segmentsOf(machine);
      setSegmentChoice({
        addr: undefined,
        name: views.find((item) => item.name === "DS")?.name ?? views[0]?.name ?? "CS",
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "No se pudo cargar el programa");
    }
  }

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const response = await fetch("/samples/hola.vmx");
        if (!response.ok) throw new Error("No se pudo leer el ejemplo hola.vmx");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (cancel) return;
        const next: Source = { bytes, name: "hola.vmx", kind: "vmx", blurb: HOLA_BLURB };
        setHolaBytes(bytes);
        setSource(next);
        setVm(loadVmx(bytes, { name: next.name, ramKiB: 16, seed: 1, blurb: HOLA_BLURB }));
      } catch (error) {
        if (!cancel) setLoadError(error instanceof Error ? error.message : "No se pudo cargar el ejemplo");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (!running || !vm || vm.status !== "running") return;
    const id = window.setTimeout(() => {
      microStep(vm);
      if (vm.breakpointPause || vm.status !== "running") setRunning(false);
      setVm({ ...vm });
    }, speed);
    return () => window.clearTimeout(id);
  }, [running, vm, speed]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (!vm) return;
      if (event.key === "n" || event.key === "N" || event.key === "ArrowRight") {
        event.preventDefault();
        stepMicro();
      } else if (event.key === "i" || event.key === "I") {
        event.preventDefault();
        stepWhole();
      } else if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        toggleRun();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function stepMicro() {
    if (!vm || vm.status !== "running") return;
    vm.breakpointPause = false;
    setRunning(false);
    microStep(vm);
    setVm({ ...vm });
  }

  function stepWhole() {
    if (!vm || vm.status !== "running") return;
    vm.breakpointPause = false;
    setRunning(false);
    stepInstruction(vm);
    setVm({ ...vm });
  }

  function toggleRun() {
    if (!vm) return;
    if (running) {
      setRunning(false);
      return;
    }
    if (vm.status !== "running") return;
    vm.breakpointPause = false;
    setRunning(true);
  }

  async function openNative() {
    try {
      const selected = await open({
        title: "Abrir .vmx / .vmi",
        multiple: false,
        filters: [{ name: "Binarios MV2026", extensions: ["vmx", "vmi"] }],
      });
      if (typeof selected !== "string") return;
      const bytes = new Uint8Array(await readFile(selected));
      const name = selected.split(/[/\\]/).pop() || "programa.vmx";
      const magic = new TextDecoder().decode(bytes.subarray(0, 5));
      const kind = magic === "VMI26" || name.toLowerCase().endsWith(".vmi") ? "vmi" : "vmx";
      boot({
        bytes,
        name,
        kind,
        blurb: kind === "vmi" ? "Imagen VMI26 restaurada." : "",
      });
    } catch (error) {
      setLoadError(messageOf(error));
    }
  }

  function loadSample(id: "hola" | "banderas" | "salto") {
    if (id === "hola") {
      if (!holaBytes) return;
      boot({ bytes: holaBytes, name: "hola.vmx", kind: "vmx", blurb: HOLA_BLURB });
      return;
    }
    if (id === "banderas") {
      boot({ bytes: banderasProgram(), name: "banderas.vmx", kind: "vmx", blurb: BANDERAS_BLURB });
      return;
    }
    boot({ bytes: saltoProgram(), name: "salto.vmx", kind: "vmx", blurb: SALTO_BLURB });
  }

  const writeAddr = vm?.lastEvent?.writeAddrs[0];
  const segment =
    !vm || segmentChoice.addr === writeAddr
      ? segmentChoice.name
      : (segmentsOf(vm).find(
          (item) => writeAddr !== undefined && writeAddr >= item.base && writeAddr < item.base + item.size,
        )?.name ?? segmentChoice.name);

  const image = source?.kind === "vmi";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="shrink-0 border-b px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-2xl">
            <p className="text-[11px] tracking-[0.18em] text-primary uppercase">UNMDP · MV1 2026</p>
            <h1 className="font-serif text-2xl leading-none">Paso a paso</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              {vm?.blurb ||
                "Cada fase del ciclo muestra de dónde sale el byte, cómo se parte y qué registro o celda cambia."}
            </p>
          </div>
          {vm ? (
            <p className="font-mono text-[12px] text-muted-foreground">
              v{vm.version} · {vm.programName} · IP {formatLogical(vm, vm.regs[IP])} · {vm.ram.length / 1024} KiB
            </p>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="flex gap-1">
            <Button size="sm" variant={source?.name === "hola.vmx" ? "default" : "outline"} onClick={() => loadSample("hola")} disabled={!holaBytes}>
              Hola
            </Button>
            <Button size="sm" variant={source?.name === "banderas.vmx" ? "default" : "outline"} onClick={() => loadSample("banderas")}>
              Banderas
            </Button>
            <Button size="sm" variant={source?.name === "salto.vmx" ? "default" : "outline"} onClick={() => loadSample("salto")}>
              Salto
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={() => void openNative()}>
            Abrir .vmx / .vmi
          </Button>
          <div className="grid gap-1">
            <Label htmlFor="ram" className="text-[10px] tracking-wide text-muted-foreground uppercase">
              RAM
            </Label>
            <select
              id="ram"
              disabled={image}
              value={ramKiB}
              onChange={(event) => {
                const next = Number(event.target.value);
                setRamKiB(next);
                if (source && source.kind === "vmx") boot(source, { ramKiB: next });
              }}
              className="h-7 rounded-lg border border-input bg-transparent px-2 text-sm"
            >
              <option value={8}>8 KiB</option>
              <option value={16}>16 KiB</option>
              <option value={32}>32 KiB</option>
            </select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="params" className="text-[10px] tracking-wide text-muted-foreground uppercase">
              Parámetros -p
            </Label>
            <Input
              id="params"
              disabled={image}
              value={params}
              placeholder="uno dos"
              className="h-7 w-36 font-mono"
              onChange={(event) => setParams(event.target.value)}
              onBlur={(event) => {
                if (source?.kind === "vmx") boot(source, { params: event.currentTarget.value });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && source?.kind === "vmx") {
                  boot(source, { params: event.currentTarget.value });
                }
              }}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="seed" className="text-[10px] tracking-wide text-muted-foreground uppercase">
              Semilla
            </Label>
            <Input
              id="seed"
              type="number"
              disabled={image}
              value={seed}
              className="h-7 w-20 font-mono"
              onChange={(event) => setSeed(Number(event.target.value))}
              onBlur={(event) => {
                const next = Number(event.currentTarget.value);
                if (source?.kind === "vmx") boot(source, { seed: Number.isFinite(next) ? next : 1 });
              }}
            />
          </div>
        </div>
        {loadError ? <p className="mt-2 text-sm text-destructive">{loadError}</p> : null}
      </header>

      {loading || !vm ? (
        <main className="flex flex-1 items-center justify-center px-6 text-center">
          <p className="max-w-md text-muted-foreground">
            {loading ? "Cargando hola.vmx, el programa de la cátedra…" : "Abrí un .vmx o un .vmi para ver la máquina."}
          </p>
        </main>
      ) : (
        <main className="grid min-h-0 flex-1 gap-3 p-3 lg:grid-cols-12 lg:grid-rows-[minmax(0,1fr)_17rem]">
          <Panel title="Código" className="order-3 min-h-80 lg:order-none lg:col-span-3 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:min-h-0">
            <CodeView lines={disassemble(vm)} active={vm.instPhys} />
          </Panel>
          <Panel title="Ciclo" className="order-1 min-h-[22rem] lg:order-none lg:col-span-5 lg:col-start-4 lg:row-start-1 lg:min-h-0">
            <CycleView
              mv={vm}
              running={running}
              speed={speed}
              onMicro={stepMicro}
              onInstruction={stepWhole}
              onToggleRun={toggleRun}
              onReset={() => source && boot(source)}
              onSpeed={setSpeed}
            />
          </Panel>
          <Panel title="Registros" className="order-2 min-h-80 lg:order-none lg:col-span-4 lg:col-start-9 lg:row-span-2 lg:row-start-1 lg:min-h-0">
            <RegisterView mv={vm} hot={new Set(vm.lastEvent?.changedRegs.map((diff) => diff.reg) ?? [])} />
          </Panel>
          <Panel title="Memoria" className="order-4 min-h-72 lg:order-none lg:col-span-3 lg:col-start-4 lg:row-start-2 lg:min-h-0">
            <MemoryView
              ram={vm.ram}
              segments={segmentsOf(vm)}
              segment={segment}
              onSegment={(name) => setSegmentChoice({ addr: vm.lastEvent?.writeAddrs[0], name })}
              reads={vm.lastEvent?.readAddrs ?? []}
              writes={vm.lastEvent?.writeAddrs ?? []}
              focus={vm.lastEvent?.writeAddrs[0] ?? vm.lastEvent?.readAddrs[0] ?? vm.instPhys}
            />
          </Panel>
          <Panel title="Consola" className="order-5 min-h-56 lg:order-none lg:col-span-2 lg:col-start-7 lg:row-start-2 lg:min-h-0">
            <ConsoleView
              mv={vm}
              onSubmit={(text) => {
                provideInput(vm, text);
                setVm({ ...vm });
              }}
            />
          </Panel>
        </main>
      )}
    </div>
  );
}
