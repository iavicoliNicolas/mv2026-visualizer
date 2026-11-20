"use client";

import type { ReactNode } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { hex8, s32, s8, s16 } from "@/vm/bits";
import {
  AC,
  BP,
  CC,
  CS,
  DS,
  EAX,
  EBX,
  ECX,
  EDX,
  EEX,
  EFX,
  ES,
  IP,
  KS,
  LAR,
  MAR,
  MBR,
  OP1,
  OP2,
  OPC,
  PS,
  SP,
  SS,
  formatLogical,
  regName,
} from "@/vm";
import type { Machine } from "@/vm";
import { cn } from "cn";

const FLAGS = [
  { bit: 31, name: "N", hint: "Negativo" },
  { bit: 30, name: "Z", hint: "Cero" },
  { bit: 29, name: "C", hint: "Acarreo" },
  { bit: 28, name: "V", hint: "Desborde" },
];

function Row({
  name,
  value,
  hot,
  extra,
}: {
  name: string;
  value: number;
  hot: boolean;
  extra?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[3.1rem_minmax(0,1fr)_auto] items-baseline gap-2 rounded px-1.5 py-0.5 font-mono text-[12px]",
        hot && "bg-[var(--hot)]",
      )}
    >
      <span className="text-muted-foreground">{name}</span>
      <span>{hex8(value)}</span>
      {extra ? <span className="text-muted-foreground">{extra}</span> : <span />}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <h3 className="mb-1 px-1.5 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">{title}</h3>
      {children}
    </div>
  );
}

export function RegisterView({ mv, hot }: { mv: Machine; hot: Set<number> }) {
  const general = [EAX, EBX, ECX, EDX, EEX, EFX];
  const cc = mv.regs[CC];

  return (
    <ScrollArea className="h-full">
      <div className="px-2 py-2">
        <Group title="Punteros">
          <Row name="IP" value={mv.regs[IP]} hot={hot.has(IP)} extra={formatLogical(mv, mv.regs[IP])} />
          <Row name="SP" value={mv.regs[SP]} hot={hot.has(SP)} extra={formatLogical(mv, mv.regs[SP])} />
          <Row name="BP" value={mv.regs[BP]} hot={hot.has(BP)} extra={formatLogical(mv, mv.regs[BP])} />
        </Group>
        <Group title="Instrucción">
          <Row name="OPC" value={mv.regs[OPC]} hot={hot.has(OPC)} extra={mv.mnemonic || "—"} />
          <Row name="OP1" value={mv.regs[OP1]} hot={hot.has(OP1)} />
          <Row name="OP2" value={mv.regs[OP2]} hot={hot.has(OP2)} />
        </Group>
        <Group title="Bus de memoria">
          <Row name="LAR" value={mv.regs[LAR]} hot={hot.has(LAR)} extra={formatLogical(mv, mv.regs[LAR])} />
          <Row name="MAR" value={mv.regs[MAR]} hot={hot.has(MAR)} extra={`${(mv.regs[MAR] >>> 16) || 0} B`} />
          <Row name="MBR" value={mv.regs[MBR]} hot={hot.has(MBR)} extra={String(s32(mv.regs[MBR]))} />
        </Group>
        <Group title="Generales">
          {general.map((reg) => {
            const value = mv.regs[reg];
            const letter = regName(reg).slice(1, 2);
            return (
              <Row
                key={reg}
                name={regName(reg)}
                value={value}
                hot={hot.has(reg)}
                extra={`${letter}X ${s16(value)} · ${letter}L ${s8(value)}`}
              />
            );
          })}
          <Row name="AC" value={mv.regs[AC]} hot={hot.has(AC)} extra={String(s32(mv.regs[AC]))} />
        </Group>
        <Group title="CC">
          <div className="mb-1 flex gap-1 px-1.5">
            {FLAGS.map((flag) => {
              const on = ((cc >>> flag.bit) & 1) === 1;
              return (
                <span
                  key={flag.name}
                  title={flag.hint}
                  className={cn(
                    "rounded px-2 py-0.5 font-mono text-[12px]",
                    on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                    hot.has(CC) && "ring-1 ring-primary",
                  )}
                >
                  {flag.name}
                  {on ? " 1" : " 0"}
                </span>
              );
            })}
          </div>
          <Row name="CC" value={cc} hot={hot.has(CC)} />
        </Group>
        <Group title="Segmentos">
          {[
            [CS, "CS"],
            [DS, "DS"],
            [ES, "ES"],
            [SS, "SS"],
            [KS, "KS"],
            [PS, "PS"],
          ].map(([reg, name]) => (
            <Row
              key={name}
              name={String(name)}
              value={mv.regs[Number(reg)]}
              hot={hot.has(Number(reg))}
              extra={mv.regs[Number(reg)] === 0xffffffff ? "vacío" : formatLogical(mv, mv.regs[Number(reg)])}
            />
          ))}
        </Group>
      </div>
    </ScrollArea>
  );
}

