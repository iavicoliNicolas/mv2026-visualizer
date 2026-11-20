import { hex4, hex8, low32, s32, s64, toUint64, u64 } from "./bits";
import {
  AC,
  CC,
  DIV_CERO,
  IP,
  LAR,
  MAR,
  MBR,
  OP1,
  SP,
  SS,
  STACK_OVER,
  STACK_UNDER,
  TDS_COUNT,
} from "./constants";
import {
  calculaDirFis,
  fault,
  flagText,
  formatLogical,
  guardaMem,
  leeMem,
  setReg,
} from "./memory";
import { valorOperado } from "./operands";
import { executeSys } from "./sys";
import type { Machine } from "./types";

function ccNote(mv: Machine): string {
  return `CC queda ${hex8(mv.regs[CC])} (${flagText(mv.regs[CC])}).`;
}

export function modificaCC(mv: Machine, ori: number, over: bigint, carry: bigint) {
  const truncated = s32(ori);
  let cc = 0;
  if (truncated === 0) cc = 0x40000000;
  else if (truncated < 0) cc = 0x80000000;
  if (over !== BigInt(truncated)) cc = (cc | 0x10000000) >>> 0;
  if ((carry & 0xffffffff00000000n) > 0n) cc = (cc | 0x20000000) >>> 0;
  setReg(mv, CC, cc);
}

function ldlBits(a: number, b: number): number {
  return (((a >>> 0) & 0xffff0000) | ((b >>> 0) & 0xffff)) >>> 0;
}

function ldhBits(a: number, b: number): number {
  return (((a >>> 0) & 0x0000ffff) | (((b >>> 0) & 0xffff) << 16)) >>> 0;
}

function jump(mv: Machine, taken: boolean, reason: string) {
  if (!taken) {
    mv.note = `${reason} No se cumple, así que IP sigue en ${formatLogical(mv, mv.regs[IP])}.`;
    return;
  }
  setReg(mv, IP, ldlBits(mv.regs[IP], mv.valor1));
  mv.note = `${reason} Se cumple: los 16 bits bajos de IP pasan a ${hex4(mv.valor1)} y queda ${formatLogical(mv, mv.regs[IP])}. El segmento no cambia.`;
}

function flags(mv: Machine): number {
  return mv.regs[CC] >>> 28;
}

function pushValue(mv: Machine, read: () => number) {
  setReg(mv, SP, (mv.regs[SP] - 4) >>> 0);
  if ((mv.regs[SP] >>> 0) < (mv.regs[SS] >>> 0)) throw fault(STACK_OVER);
  const value = read();
  setReg(mv, LAR, mv.regs[SP]);
  const dir = calculaDirFis(0, mv.regs[SP], mv);
  setReg(mv, MAR, ((4 << 16) | dir) >>> 0);
  setReg(mv, MBR, value);
  guardaMem(mv);
  return value;
}

function popValue(mv: Machine): number {
  const slot = mv.regs[SS] >>> 16;
  if (slot >= TDS_COUNT || mv.tds[slot] === 0xffffffff) throw fault(STACK_UNDER);
  const size = mv.tds[slot] & 0xffff;
  const offset = mv.regs[SP] & 0xffff;
  if (offset + 4 > size) throw fault(STACK_UNDER);
  setReg(mv, LAR, mv.regs[SP]);
  const dir = calculaDirFis(0, mv.regs[SP], mv);
  setReg(mv, MAR, ((4 << 16) | dir) >>> 0);
  leeMem(mv);
  const value = s32(mv.regs[MBR]);
  setReg(mv, SP, (mv.regs[SP] + 4) >>> 0);
  return value;
}

function opSys(mv: Machine) {
  executeSys(mv);
}

function opJmp(mv: Machine) {
  setReg(mv, IP, ldlBits(mv.regs[IP], mv.valor1));
  mv.note = `JMP copia los 16 bits bajos del operando (${hex4(mv.valor1)}) sobre IP. El segmento se conserva: IP queda ${formatLogical(mv, mv.regs[IP])}.`;
}

function opJp(mv: Machine) {
  jump(mv, (flags(mv) & 0b1100) === 0, "JP salta si N y Z están apagados, o sea si el último resultado fue estrictamente positivo.");
}

function opJn(mv: Machine) {
  jump(mv, (flags(mv) & 0b1100) === 0b1000, "JN salta si N está prendido y Z apagado.");
}

function opJz(mv: Machine) {
  jump(mv, (flags(mv) & 0b1100) === 0b0100, "JZ salta si Z está prendido y N apagado.");
}

function opJc(mv: Machine) {
  jump(mv, (flags(mv) & 0b0010) === 0b0010, "JC salta si el bit C de acarreo está prendido.");
}

function opJv(mv: Machine) {
  jump(mv, (flags(mv) & 0b0001) === 0b0001, "JV salta si el bit V de desborde está prendido.");
}

function opJnp(mv: Machine) {
  const aux = flags(mv) & 0b1100;
  jump(mv, aux === 0b1000 || aux === 0b0100, "JNP salta si N o Z están prendidos: el resultado no fue positivo.");
}

function opJnn(mv: Machine) {
  jump(mv, (flags(mv) & 0b1000) === 0, "JNN salta si N está apagado. El cero también cuenta como no negativo.");
}

function opJnz(mv: Machine) {
  jump(mv, (flags(mv) & 0b0100) === 0, "JNZ salta si Z está apagado.");
}

function opNot(mv: Machine) {
  mv.valor1 = ~mv.valor1;
  modificaCC(mv, mv.valor1, s64(mv.valor1), 0n);
  mv.note = `NOT invierte los bits. El resultado es ${s32(mv.valor1)}. ${ccNote(mv)}`;
}

function opPush(mv: Machine) {
  const value = pushValue(mv, () => valorOperado(mv, OP1));
  mv.note = `PUSH resta 4 a SP y recién ahí lee el operando (${value}). Esos 4 bytes, en big-endian, quedan en ${formatLogical(mv, mv.regs[SP])}.`;
}

function opPop(mv: Machine) {
  mv.valor1 = popValue(mv);
  mv.note = `POP lee 4 bytes de la pila (${s32(mv.valor1)}) y después suma 4 a SP. El writeback los guarda en el destino.`;
}

function opCall(mv: Machine) {
  const ret = s32(mv.regs[IP]);
  pushValue(mv, () => ret);
  setReg(mv, IP, ldlBits(mv.regs[IP], mv.valor1));
  mv.note = `CALL apila el IP de retorno (${formatLogical(mv, ret)}) y después salta. IP queda en ${formatLogical(mv, mv.regs[IP])}.`;
}

function opRet(mv: Machine) {
  const value = popValue(mv);
  setReg(mv, IP, value);
  mv.note = `RET saca ${formatLogical(mv, value)} de la pila y lo copia entero a IP. SP queda en ${formatLogical(mv, mv.regs[SP])}.`;
}

function opStop(mv: Machine) {
  setReg(mv, IP, 0xffffffff);
  mv.note = "STOP pone IP en FFFFFFFF. En el próximo fetch el ciclo reconoce el fin y no busca otra instrucción.";
}

function opMov(mv: Machine) {
  mv.valor1 = mv.valor2;
  modificaCC(mv, mv.valor1, s64(mv.valor1), 0n);
  mv.note = `MOV copia ${s32(mv.valor2)} al valor del destino. ${ccNote(mv)} C y V no se prenden: el resultado entra justo en 32 bits.`;
}

function opAdd(mv: Machine) {
  const a = mv.valor1;
  const b = mv.valor2;
  const carry = u64(a) + u64(b);
  const full = s64(a) + s64(b);
  mv.valor1 = low32(full);
  modificaCC(mv, mv.valor1, full, carry);
  mv.note = `ADD hace ${s32(a)} + ${s32(b)} = ${s32(mv.valor1)}. ${ccNote(mv)} C sale de la suma sin signo; V, si el resultado con signo no entra en 32 bits.`;
}

function opSub(mv: Machine) {
  const a = mv.valor1;
  const b = mv.valor2;
  const full = s64(a) - s64(b);
  mv.valor1 = low32(full);
  modificaCC(mv, mv.valor1, full, toUint64(full));
  mv.note = `SUB hace ${s32(a)} - ${s32(b)} = ${s32(mv.valor1)}. ${ccNote(mv)} En esta máquina C se prende cuando la resta con signo es negativa.`;
}

function opMul(mv: Machine) {
  const a = mv.valor1;
  const b = mv.valor2;
  const carry = u64(a) * u64(b);
  const full = s64(a) * s64(b);
  mv.valor1 = low32(full);
  modificaCC(mv, mv.valor1, full, carry);
  mv.note = `MUL hace ${s32(a)} × ${s32(b)} = ${s32(mv.valor1)}. ${ccNote(mv)}`;
}

function opDiv(mv: Machine) {
  const a = mv.valor1;
  const b = mv.valor2;
  if (s32(b) === 0) throw fault(DIV_CERO);
  const full = s64(a) / s64(b);
  const carry = u64(a) / u64(b);
  const rem = s64(a) % s64(b);
  setReg(mv, AC, low32(rem));
  mv.valor1 = low32(full);
  modificaCC(mv, mv.valor1, full, carry);
  mv.note = `DIV hace ${s32(a)} ÷ ${s32(b)} = ${s32(mv.valor1)}. El resto ${s32(low32(rem))} queda en AC. ${ccNote(mv)}`;
}

function opCmp(mv: Machine) {
  const a = mv.valor1;
  const b = mv.valor2;
  const full = s64(a) - s64(b);
  const resta = low32(full);
  modificaCC(mv, resta, full, toUint64(full));
  mv.note = `CMP resta ${s32(a)} - ${s32(b)} = ${s32(resta)} solo para las banderas. El destino no se modifica. ${ccNote(mv)}`;
}

function opAnd(mv: Machine) {
  mv.valor1 = (mv.valor1 & mv.valor2) | 0;
  modificaCC(mv, mv.valor1, s64(mv.valor1), 0n);
  mv.note = `AND deja ${s32(mv.valor1)}. ${ccNote(mv)}`;
}

function opOr(mv: Machine) {
  mv.valor1 = (mv.valor1 | mv.valor2) | 0;
  modificaCC(mv, mv.valor1, s64(mv.valor1), 0n);
  mv.note = `OR deja ${s32(mv.valor1)}. ${ccNote(mv)}`;
}

function opXor(mv: Machine) {
  mv.valor1 = (mv.valor1 ^ mv.valor2) | 0;
  modificaCC(mv, mv.valor1, s64(mv.valor1), 0n);
  mv.note = `XOR deja ${s32(mv.valor1)}. ${ccNote(mv)}`;
}

function opSwap(mv: Machine) {
  let a = mv.valor1 | 0;
  let b = mv.valor2 | 0;
  a ^= b;
  b ^= a;
  a ^= b;
  mv.valor1 = a;
  mv.valor2 = b;
  modificaCC(mv, mv.valor1, s64(mv.valor1), 0n);
  mv.note = `SWAP intercambia los dos valores con tres XOR. El destino queda en ${s32(a)} y el origen en ${s32(b)}. ${ccNote(mv)}`;
}

function opShl(mv: Machine) {
  const n = mv.valor2 >>> 0;
  const a = mv.valor1;
  const carry = n >= 64 ? 0n : (u64(a) << BigInt(n)) & ((1n << 64n) - 1n);
  const bits = n >= 64 ? 0n : (toUint64(s64(a)) << BigInt(n)) & ((1n << 64n) - 1n);
  const full = bits >= 1n << 63n ? bits - (1n << 64n) : bits;
  mv.valor1 = low32(full);
  modificaCC(mv, mv.valor1, full, carry);
  mv.note = `SHL desplaza ${s32(a)} ${n} bits a la izquierda. Queda ${s32(mv.valor1)}. ${ccNote(mv)}`;
}

function opShr(mv: Machine) {
  const n = mv.valor2 >>> 0;
  const bits = mv.valor1 >>> 0;
  mv.valor1 = n >= 32 ? 0 : s32(bits >>> n);
  modificaCC(mv, mv.valor1, s64(mv.valor1), 0n);
  mv.note = `SHR desplaza a la derecha metiendo ceros. ${hex8(bits)} pasa a ${s32(mv.valor1)}. ${ccNote(mv)}`;
}

function opSar(mv: Machine) {
  const n = mv.valor2 >>> 0;
  const a = s32(mv.valor1);
  mv.valor1 = n >= 32 ? (a < 0 ? -1 : 0) : a >> n;
  modificaCC(mv, mv.valor1, s64(mv.valor1), 0n);
  mv.note = `SAR desplaza a la derecha conservando el signo. ${a} pasa a ${s32(mv.valor1)}. ${ccNote(mv)}`;
}

function opLdl(mv: Machine) {
  mv.valor1 = s32(ldlBits(mv.valor1, mv.valor2));
  mv.note = `LDL reemplaza los 16 bits bajos por ${hex4(mv.valor2)} y deja los altos como estaban. El resultado es ${hex8(mv.valor1)}. No toca CC.`;
}

function opLdh(mv: Machine) {
  mv.valor1 = s32(ldhBits(mv.valor1, mv.valor2));
  mv.note = `LDH reemplaza los 16 bits altos por ${hex4(mv.valor2)} y deja los bajos como estaban. El resultado es ${hex8(mv.valor1)}. No toca CC.`;
}

function opRnd(mv: Machine) {
  const top = s64(mv.valor2) + 1n;
  if (top <= 0n) {
    mv.valor1 = 0;
    mv.note = "RND recibe un tope negativo: el resultado es 0.";
    return;
  }
  const mix =
    (BigInt(nextRand(mv)) << 30n) ^ (BigInt(nextRand(mv)) << 15n) ^ BigInt(nextRand(mv));
  mv.valor1 = Number(mix % top);
  mv.note = `RND deja un entero entre 0 y ${s32(mv.valor2)}, con la semilla ${mv.seed}. Salió ${mv.valor1}.`;
}

function nextRand(mv: Machine): number {
  mv.rngState = (mv.rngState + 0x6d2b79f5) >>> 0;
  let t = mv.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
  t = (t ^ Math.imul(t ^ (t >>> 7), (t | 61) >>> 0)) >>> 0;
  return t & 0x7fffffff;
}

export const OPERATIONS = [
  opSys,
  opJmp,
  opJp,
  opJn,
  opJz,
  opJc,
  opJv,
  opJnp,
  opJnn,
  opJnz,
  opNot,
  opPush,
  opPop,
  opCall,
  opRet,
  opStop,
  opMov,
  opAdd,
  opSub,
  opMul,
  opDiv,
  opCmp,
  opAnd,
  opOr,
  opXor,
  opSwap,
  opShl,
  opShr,
  opSar,
  opLdl,
  opLdh,
  opRnd,
];
