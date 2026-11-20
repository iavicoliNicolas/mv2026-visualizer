export type Operand =
  | { k: "r"; reg: number; sector?: number }
  | { k: "i"; v: number }
  | { k: "m"; reg: number; off: number; n: number };

function u16(value: number): number[] {
  const bits = value & 0xffff;
  return [(bits >> 8) & 0xff, bits & 0xff];
}

function sizeOf(op: Operand): number {
  if (op.k === "r") return 1;
  if (op.k === "i") return 2;
  return 3;
}

function bytesOf(op: Operand): number[] {
  if (op.k === "r") return [(((op.sector ?? 0) & 3) << 5) | (op.reg & 31)];
  if (op.k === "i") return u16(op.v);
  return [...u16(op.off), (((op.n & 7) << 5) | (op.reg & 31)) & 0xff];
}

export function insn(opc: number, a?: Operand, b?: Operand): number[] {
  if (opc >= 0x10) {
    if (!a || !b) throw new Error("las operaciones de dos operandos necesitan origen y destino");
    return [((sizeOf(b) << 6) | (sizeOf(a) << 4) | (opc & 31)) & 0xff, ...bytesOf(b), ...bytesOf(a)];
  }
  if (!a) return [opc & 31];
  return [((sizeOf(a) << 6) | (opc & 31)) & 0xff, ...bytesOf(a)];
}

export function buildVmx(options: {
  version?: 1 | 2;
  code: number[];
  data?: number;
  extra?: number;
  stack?: number;
  constants?: number[];
  entry?: number;
}): Uint8Array {
  const version = options.version ?? 2;
  const id = [..."VMX26"].map((char) => char.charCodeAt(0));
  id.push(version);
  if (version === 1) {
    return Uint8Array.from([...id, ...u16(options.code.length), ...options.code]);
  }
  const constants = options.constants ?? [];
  return Uint8Array.from([
    ...id,
    ...u16(options.code.length),
    ...u16(options.data ?? 0),
    ...u16(options.extra ?? 0),
    ...u16(options.stack ?? 0),
    ...u16(constants.length),
    ...u16(options.entry ?? 0),
    ...options.code,
    ...constants,
  ]);
}
