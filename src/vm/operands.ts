import { s16, s8 } from "./bits";
import { LAR, MAR, MBR } from "./constants";
import { calculaDirFis, guardaMem, leeMem, setReg } from "./memory";
import type { Machine } from "./types";

export function valorOperado(mv: Machine, op: number): number {
  const raw = mv.regs[op];
  const tipo = raw >>> 24;
  if (tipo === 1) {
    const sector = (raw & 0x60) >> 5;
    const cod = raw & 0x1f;
    const value = mv.regs[cod];
    if (sector === 0) return value | 0;
    if (sector === 1) return s8(value);
    if (sector === 2) return s8(value >> 8);
    if (sector === 3) return s16(value);
    return 0;
  }
  if (tipo === 2) return s16(raw & 0xffff);
  if (tipo === 3) {
    const offset = s16(raw >>> 8);
    const cod = raw & 0x1f;
    const cant = (raw >>> 5) & 7;
    const puntero = mv.regs[cod];
    const dirFis = calculaDirFis(offset, puntero, mv);
    setReg(mv, LAR, puntero);
    setReg(mv, MAR, ((cant << 16) | (dirFis & 0xffff)) >>> 0);
    leeMem(mv);
    let value = mv.regs[MBR] | 0;
    if (cant === 1) value = s8(value);
    else if (cant === 2) value = s16(value);
    return value;
  }
  return 0;
}

export function guardaOP(mv: Machine, op: number, valor: number): string {
  const raw = mv.regs[op];
  const tipo = raw >>> 24;
  if (tipo === 1) {
    const cod = raw & 0x1f;
    const sector = (raw & 0x60) >> 5;
    const current = mv.regs[cod];
    if (sector === 0) setReg(mv, cod, valor);
    else if (sector === 1) setReg(mv, cod, (current & 0xffffff00) | (valor & 0xff));
    else if (sector === 2) setReg(mv, cod, (current & 0xffff00ff) | ((valor & 0xff) << 8));
    else if (sector === 3) setReg(mv, cod, (current & 0xffff0000) | (valor & 0xffff));
    return "registro";
  }
  if (tipo === 2) return "inmediato";
  if (tipo === 3) {
    const offset = s16(raw >>> 8);
    const cod = raw & 0x1f;
    const puntero = mv.regs[cod];
    const dirFis = calculaDirFis(offset, puntero, mv);
    const cant = (raw >>> 5) & 7;
    setReg(mv, LAR, puntero);
    setReg(mv, MAR, ((cant << 16) | (dirFis & 0xffff)) >>> 0);
    setReg(mv, MBR, valor);
    guardaMem(mv);
    return "memoria";
  }
  return "nada";
}
