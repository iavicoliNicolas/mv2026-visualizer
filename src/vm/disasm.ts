import { s16 } from "./bits";
import { CS, KS, MNEMONICS, regName } from "./constants";
import type { DisasmLine, Machine } from "./types";

function operandText(ram: Uint8Array, dir: number, tipo: number): string {
  if (tipo === 0 || dir + tipo > ram.length) return "";
  if (tipo === 1) {
    const byte = ram[dir];
    return regName(byte & 0x1f, (byte >> 5) & 0x03);
  }
  if (tipo === 2) {
    const value = s16((ram[dir] << 8) | ram[dir + 1]);
    return `${value}`;
  }
  if (tipo === 3) {
    const value = s16((ram[dir] << 8) | ram[dir + 1]);
    const byte = ram[dir + 2];
    const size = (byte >> 5) & 0x07;
    const reg = regName(byte & 0x1f, 0);
    const pref = size === 1 ? "b" : size === 2 ? "w" : size === 4 ? "l" : "";
    const sign = value >= 0 ? "+" : "";
    return `${pref}[${reg}${sign}${value}]`;
  }
  return "";
}

function sizes(opcodeByte: number): { opc: number; tamA: number; tamB: number } {
  const opc = opcodeByte & 0x1f;
  if (opc >= 0x10) {
    return {
      opc,
      tamB: (opcodeByte >> 6) & 0x03,
      tamA: (opcodeByte >> 4) & 0x03,
    };
  }
  if (opc === 0x0e || opc === 0x0f) return { opc, tamA: 0, tamB: 0 };
  return { opc, tamA: (opcodeByte >> 6) & 0x03, tamB: 0 };
}

export function disassemble(mv: Machine): DisasmLine[] {
  const lines: DisasmLine[] = [];
  const ks = mv.regs[KS];
  if (mv.version === 2 && ks !== 0xffffffff) {
    const slot = ks >>> 16;
    const desc = mv.tds[slot];
    if (desc !== undefined && desc !== 0xffffffff) {
      const base = desc >>> 16;
      const size = desc & 0xffff;
      let offset = 0;
      while (offset < size) {
        const physical = base + offset;
        let length = 1;
        while (physical + length - 1 < mv.ram.length && mv.ram[physical + length - 1] !== 0) {
          length++;
          if (length > 64) break;
        }
        const raw = Array.from(mv.ram.subarray(physical, Math.min(mv.ram.length, physical + length)));
        const shown = raw.slice(0, Math.max(0, length - 1));
        const text = shown
          .map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : "."))
          .join("");
        lines.push({
          kind: "string",
          physical,
          bytes: raw.slice(0, 7),
          text: `"${text}"`,
          mnemonic: "KS",
          isEntry: false,
        });
        offset += length;
      }
    }
  }

  const cs = mv.regs[CS];
  if (cs === 0xffffffff) return lines;
  const slot = cs >>> 16;
  const desc = mv.tds[slot];
  if (desc === undefined || desc === 0xffffffff) return lines;
  const base = desc >>> 16;
  const size = desc & 0xffff;
  let offset = 0;
  while (offset < size) {
    const physical = base + offset;
    if (physical >= mv.ram.length) break;
    const opcode = mv.ram[physical];
    const { opc, tamA, tamB } = sizes(opcode);
    const length = 1 + tamA + tamB;
    if (offset + length > size) {
      lines.push({
        kind: "code",
        physical,
        bytes: Array.from(mv.ram.subarray(physical, Math.min(mv.ram.length, base + size))),
        text: "??",
        mnemonic: "??",
        isEntry: physical === mv.entryPhysical,
      });
      break;
    }
    const bytes = Array.from(mv.ram.subarray(physical, physical + length));
    const opB = operandText(mv.ram, physical + 1, tamB);
    const opA = operandText(mv.ram, physical + 1 + tamB, tamA);
    const mnemonic = MNEMONICS[opc] ?? "??";
    let text = mnemonic;
    if (tamA) text += ` ${opA}`;
    if (tamB) text += `, ${opB}`;
    lines.push({
      kind: "code",
      physical,
      bytes,
      text,
      mnemonic,
      isEntry: mv.version === 2 && physical === mv.entryPhysical,
    });
    offset += length;
  }
  return lines;
}

export function decodeSizes(opcodeByte: number) {
  return sizes(opcodeByte);
}
