import { hex4, s16, s32, u32 } from "./bits";
import {
  ERROR_TEXT,
  FALLO_SEG,
  LAR,
  MAR,
  MBR,
  SEGMENT_REGS,
  TDS_COUNT,
  regName,
} from "./constants";
import type { Machine, SegmentView } from "./types";

export class VmFault extends Error {
  code: number;

  constructor(code: number) {
    super(ERROR_TEXT[code] ?? "ERROR");
    this.code = code;
  }
}

export function fault(code: number): VmFault {
  return new VmFault(code);
}

export function setReg(mv: Machine, index: number, value: number) {
  const next = u32(value);
  const from = mv.regs[index];
  mv.regs[index] = next;
  if (from === next) return;
  const existing = mv.regDiffs.find((diff) => diff.reg === index);
  if (existing) existing.to = next;
  else mv.regDiffs.push({ reg: index, from, to: next });
}

export function beginPhase(mv: Machine) {
  mv.regDiffs = [];
  mv.readAddrs = [];
  mv.writeAddrs = [];
}

function ramOk(mv: Machine, addr: number) {
  if (addr < 0 || addr >= mv.ram.length) throw fault(FALLO_SEG);
}

export function readByte(mv: Machine, addr: number): number {
  ramOk(mv, addr);
  mv.readAddrs.push(addr);
  return mv.ram[addr];
}

export function writeByte(mv: Machine, addr: number, value: number) {
  ramOk(mv, addr);
  mv.writeAddrs.push(addr);
  mv.ram[addr] = value & 0xff;
}

export function calculaDirFis(offset: number, puntero: number, mv: Machine): number {
  const pos = puntero >>> 16;
  const offsetP = s16(puntero & 0xffff);
  const off = s16(offset);
  if (pos >= TDS_COUNT || mv.tds[pos] === 0xffffffff) throw fault(FALLO_SEG);
  const base = mv.tds[pos] >>> 16;
  return (base + off + offsetP) & 0xffff;
}

export function enSegmento(puntero: number, dirFis: number, mv: Machine): boolean {
  const pos = puntero >>> 16;
  if (pos >= TDS_COUNT || mv.tds[pos] === 0xffffffff) throw fault(FALLO_SEG);
  const base = mv.tds[pos] >>> 16;
  const fin = base + (mv.tds[pos] & 0xffff);
  return dirFis >= base && dirFis < fin;
}

export function dirValida(puntero: number, dirFis: number, mv: Machine) {
  if (!enSegmento(puntero, dirFis, mv)) throw fault(FALLO_SEG);
}

export function leeMem(mv: Machine) {
  const cant = mv.regs[MAR] >>> 16;
  const dirFis = mv.regs[MAR] & 0xffff;
  const puntero = mv.regs[LAR];
  let buffer = 0;
  for (let i = 0; i < cant; i++) {
    dirValida(puntero, (dirFis + i) & 0xffff, mv);
    buffer = ((buffer << 8) | readByte(mv, (dirFis + i) & 0xffff)) >>> 0;
  }
  setReg(mv, MBR, buffer);
}

export function guardaMem(mv: Machine) {
  const cant = mv.regs[MAR] >>> 16;
  const dirFis = mv.regs[MAR] & 0xffff;
  const valor = mv.regs[MBR];
  const puntero = mv.regs[LAR];
  for (let i = 0; i < cant; i++) {
    const addr = (dirFis + i) & 0xffff;
    dirValida(puntero, addr, mv);
    const shift = (cant - 1 - i) * 8;
    writeByte(mv, addr, (valor >>> shift) & 0xff);
  }
}

export function segmentNameByIndex(mv: Machine, index: number): string {
  for (const [reg, name] of SEGMENT_REGS) {
    const logical = mv.regs[reg];
    if (logical !== 0xffffffff && logical >>> 16 === index) return name;
  }
  return `S${index}`;
}

export function formatLogical(mv: Machine, logical: number): string {
  if (u32(logical) === 0xffffffff) return "FFFFFFFF";
  const idx = logical >>> 16;
  const off = logical & 0xffff;
  return `${segmentNameByIndex(mv, idx)}:${hex4(off)}`;
}

export function segmentsOf(mv: Machine): SegmentView[] {
  const views: SegmentView[] = [];
  for (const [reg, name] of SEGMENT_REGS) {
    const logical = mv.regs[reg];
    if (logical === 0xffffffff) continue;
    const index = logical >>> 16;
    if (index >= TDS_COUNT) continue;
    const desc = mv.tds[index];
    if (desc === 0xffffffff) continue;
    views.push({
      name,
      index,
      base: desc >>> 16,
      size: desc & 0xffff,
    });
  }
  return views;
}

export function describeOperand(mv: Machine, opIndex: number): string {
  const raw = mv.regs[opIndex];
  const tipo = raw >>> 24;
  if (tipo === 0) return "no hay operando";
  if (tipo === 1) {
    const sector = (raw & 0x60) >> 5;
    const cod = raw & 0x1f;
    return `el registro ${regName(cod, sector)}`;
  }
  if (tipo === 2) {
    const value = s16(raw & 0xffff);
    const ch =
      value >= 32 && value < 127 ? `, el carácter '${String.fromCharCode(value)}'` : "";
    return `el inmediato ${value}${ch}`;
  }
  if (tipo === 3) {
    const offset = s16(raw >>> 8);
    const cod = raw & 0x1f;
    const cant = (raw >>> 5) & 7;
    const pref = cant === 1 ? "b" : cant === 2 ? "w" : cant === 4 ? "l" : `${cant}b`;
    const sign = offset >= 0 ? "+" : "";
    return `la celda ${pref}[${regName(cod, 0)}${sign}${offset}] (${cant} bytes)`;
  }
  return `un operando de tipo ${tipo}`;
}

export function flagText(cc: number): string {
  const n = (cc >>> 31) & 1;
  const z = (cc >>> 30) & 1;
  const c = (cc >>> 29) & 1;
  const v = (cc >>> 28) & 1;
  return `N=${n} Z=${z} C=${c} V=${v}`;
}

export function signedLabel(value: number): string {
  const signed = s32(value);
  return `${signed}`;
}
