import { EAX, EBX } from "./constants";
import { buildVmx, insn } from "./encode";

const reg = (reg: number, sector = 0) => ({ k: "r" as const, reg, sector });
const imm = (v: number) => ({ k: "i" as const, v });

export function banderasProgram(): Uint8Array {
  const code = [
    ...insn(0x10, reg(EAX), imm(5)),
    ...insn(0x11, reg(EAX), imm(-3)),
    ...insn(0x0d, imm(12)),
    ...insn(0x0f),
    ...insn(0x11, reg(EAX), imm(1)),
    ...insn(0x0e),
  ];
  return buildVmx({ version: 2, code, stack: 64 });
}

export const BANDERAS_BLURB =
  "Suma 5 + (−3), así que C se prende, y después CALL incrementa EAX y vuelve con RET. Seguí el IP, la pila y CC.";

export function saltoProgram(): Uint8Array {
  const head = [
    ...insn(0x10, reg(EAX), imm(4)),
    ...insn(0x10, reg(EBX), imm(4)),
    ...insn(0x15, reg(EAX), reg(EBX)),
  ];
  const skipped = [...insn(0x10, reg(EAX), imm(1)), ...insn(0x0f)];
  const target = head.length + 3 + skipped.length;
  const code = [...head, ...insn(0x04, imm(target)), ...skipped, ...insn(0x10, reg(EAX), imm(9)), ...insn(0x0f)];
  return buildVmx({ version: 2, code, stack: 32 });
}

export const SALTO_BLURB =
  "CMP deja las banderas sin tocar EAX. Como los dos valores son iguales, Z se prende y JZ se salta la asignación del medio.";
