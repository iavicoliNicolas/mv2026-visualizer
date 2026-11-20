import { bits8, hex2, hex4, hex8, s32 } from "./bits";
import { CS, INST_INV, IP, LAR, MAR, MBR, MNEMONICS, OP1, OP2, OPC } from "./constants";
import { OPERATIONS } from "./instructions";
import { VmFault, beginPhase, calculaDirFis, describeOperand, enSegmento, formatLogical, readByte, setReg } from "./memory";
import { guardaOP, valorOperado } from "./operands";
import { acceptInput } from "./sys";
import type { Machine, Phase, StepEvent } from "./types";

function finish(mv: Machine, title: string, detail: string, next: Phase | null): StepEvent {
  mv.regDiffs = mv.regDiffs.filter((diff) => diff.from !== diff.to);
  const event: StepEvent = {
    phase: mv.phase,
    title,
    detail,
    changedRegs: mv.regDiffs.map((diff) => ({ ...diff })),
    readAddrs: [...mv.readAddrs],
    writeAddrs: [...mv.writeAddrs],
    instPhys: mv.instPhys,
    mnemonic: mv.mnemonic,
  };
  if (next) mv.phase = next;
  mv.lastEvent = event;
  mv.history = [...mv.history, event].slice(-80);
  return event;
}

function fail(mv: Machine, error: VmFault): StepEvent {
  mv.status = "error";
  mv.errorCode = error.code;
  mv.errorMessage = error.message;
  mv.consoleLines.push({ kind: "error", text: error.message });
  return finish(
    mv,
    "Error",
    `${error.message}. La máquina se detiene en esta fase; lo que ya había cambiado queda visible.`,
    null,
  );
}

function halt(mv: Machine, detail: string): StepEvent {
  mv.status = "halted";
  mv.haltReason = detail;
  return finish(mv, "Fin", detail, null);
}

function doFetch(mv: Machine): StepEvent {
  const ip = mv.regs[IP];
  if (ip === 0xffffffff) {
    return halt(mv, "IP vale FFFFFFFF. STOP (o un retorno a -1) marcó el fin: no se busca otra instrucción.");
  }
  if (ip >>> 16 !== mv.regs[CS] >>> 16) {
    return halt(
      mv,
      `IP está en ${formatLogical(mv, ip)} y CS en ${formatLogical(mv, mv.regs[CS])}. No es el mismo segmento, así que la ejecución termina.`,
    );
  }
  const dir = calculaDirFis(0, ip, mv);
  if (!enSegmento(ip, dir, mv)) {
    return halt(
      mv,
      `La dirección física ${hex4(dir)} quedó fuera del segmento de código. La cátedra lo toma como fin normal, no como fallo de segmento.`,
    );
  }
  setReg(mv, OP1, 0);
  setReg(mv, OP2, 0);
  const op = readByte(mv, dir);
  mv.opByte = op;
  mv.instPhys = dir;
  mv.mnemonic = "";
  const base = mv.tds[ip >>> 16] >>> 16;
  const offset = ip & 0xffff;
  return finish(
    mv,
    "Fetch",
    `IP ${formatLogical(mv, ip)} cae en la física ${hex4(dir)}: base ${hex4(base)} + desplazamiento ${hex4(offset)}. Ahí está el byte de operación ${hex2(op)}. OP1 y OP2 se ponen en cero antes de decodificar.`,
    "decode",
  );
}

function doDecode(mv: Machine): StepEvent {
  const op = mv.opByte;
  const tamB = (op >> 6) & 3;
  const tamA = (op >> 4) & 3;
  const opc = op & 0x1f;
  if (tamA !== 0) {
    setReg(mv, OP1, (tamA << 24) >>> 0);
    setReg(mv, OP2, (tamB << 24) >>> 0);
  } else {
    setReg(mv, OP1, (tamB << 24) >>> 0);
  }
  setReg(mv, OPC, opc);
  mv.mnemonic = MNEMONICS[opc] ?? "??";
  const kind = (size: number) =>
    size === 1 ? "registro, 1 byte" : size === 2 ? "inmediato, 2 bytes" : size === 3 ? "memoria, 3 bytes" : "ausente";
  let detail: string;
  if (opc === 0x0e || opc === 0x0f) {
    detail = `${hex2(op)} (${bits8(op)}) es ${mv.mnemonic}. No lleva operandos: OP1 y OP2 siguen en cero y el opcode ${hex2(opc)} queda en OPC.`;
  } else if (tamA !== 0) {
    detail = `${hex2(op)} es ${bits8(op)}. Bits 7-6 = ${tamB} (${kind(tamB)}) van a OP2. Bits 5-4 = ${tamA} (${kind(tamA)}) van a OP1. Los 5 bits bajos son el opcode ${hex2(opc)}, ${mv.mnemonic}.`;
  } else {
    detail = `${hex2(op)} es ${bits8(op)}. Bits 5-4 valen 0, así que hay un solo operando: el tamaño ${tamB} (${kind(tamB)}) de los bits 7-6 pasa a OP1. Opcode ${hex2(opc)}, ${mv.mnemonic}.`;
  }
  return finish(mv, "Decode", detail, "operands");
}

function readOperandBytes(mv: Machine, dir: number, size: number): number {
  let buffer = 0;
  for (let i = 0; i < size; i++) {
    buffer = ((buffer << 8) | readByte(mv, (dir + i) & 0xffff)) >>> 0;
  }
  return buffer;
}

function doOperands(mv: Machine): StepEvent {
  if (mv.regs[OP1] !== 0) {
    if (mv.regs[OP2] !== 0) {
      const tamB = mv.regs[OP2] >>> 24;
      const dirB = calculaDirFis(1, mv.regs[IP], mv);
      const bufferB = readOperandBytes(mv, dirB, tamB);
      setReg(mv, OP2, ((mv.regs[OP2] & 0xff000000) | (bufferB & 0x00ffffff)) >>> 0);
      const tamA = mv.regs[OP1] >>> 24;
      const dirA = calculaDirFis(1 + tamB, mv.regs[IP], mv);
      const bufferA = readOperandBytes(mv, dirA, tamA);
      setReg(mv, OP1, ((mv.regs[OP1] & 0xff000000) | (bufferA & 0x00ffffff)) >>> 0);
    } else {
      const tamA = mv.regs[OP1] >>> 24;
      const dirA = calculaDirFis(1, mv.regs[IP], mv);
      const bufferA = readOperandBytes(mv, dirA, tamA);
      setReg(mv, OP1, ((mv.regs[OP1] & 0xff000000) | (bufferA & 0x00ffffff)) >>> 0);
    }
  }
  const tamA = mv.regs[OP1] >>> 24;
  const tamB = mv.regs[OP2] >>> 24;
  const bytes = mv.readAddrs.map((addr) => hex2(mv.ram[addr])).join(" ");
  let detail: string;
  if (tamA === 0 && tamB === 0) {
    detail = "Después del opcode no hay bytes de operando. OP1 y OP2 siguen en cero.";
  } else if (tamB !== 0) {
    detail = `En el binario el origen va primero. Se leyeron ${bytes || "0 bytes"}. OP2 es ${describeOperand(mv, OP2)}. OP1 es ${describeOperand(mv, OP1)}.`;
  } else {
    detail = `Se leyeron ${bytes || "0 bytes"} para el único operando. OP1 es ${describeOperand(mv, OP1)}.`;
  }
  return finish(mv, "Operandos", detail, "advance");
}

function doAdvance(mv: Machine): StepEvent {
  const before = mv.regs[IP];
  const tamA = mv.regs[OP1] >>> 24;
  const tamB = mv.regs[OP2] >>> 24;
  setReg(mv, IP, (before + 1 + tamA + tamB) >>> 0);
  return finish(
    mv,
    "Avanza IP",
    `IP pasa de ${formatLogical(mv, before)} a ${formatLogical(mv, mv.regs[IP])}. La cuenta es 1 + ${tamA} + ${tamB}, y se hace antes de ejecutar: por eso CALL apila la instrucción siguiente, no la actual.`,
    "read",
  );
}

function doRead(mv: Machine): StepEvent {
  const opc = mv.regs[OPC];
  mv.valor2 = valorOperado(mv, OP2);
  mv.valor1 = opc === 0x0b ? 0 : valorOperado(mv, OP1);
  if (opc === 0x0b) {
    return finish(
      mv,
      "Lectura",
      "PUSH no evalúa su operando acá. En el C de la cátedra la lectura ocurre adentro de PUSH, después de restar 4 a SP. El valor provisorio del destino queda en 0.",
      "execute",
    );
  }
  const parts: string[] = [];
  if (mv.regs[OP2] >>> 24) parts.push(`OP2 es ${describeOperand(mv, OP2)} y vale ${s32(mv.valor2)}.`);
  else parts.push("OP2 no existe y vale 0.");
  if (mv.regs[OP1] >>> 24) parts.push(`OP1 es ${describeOperand(mv, OP1)} y vale ${s32(mv.valor1)}.`);
  else parts.push("OP1 no existe y vale 0.");
  if ((mv.regs[OP1] >>> 24) === 3 || (mv.regs[OP2] >>> 24) === 3) {
    parts.push(
      `Ese acceso queda en el bus: LAR=${hex8(mv.regs[LAR])} MAR=${hex8(mv.regs[MAR])} MBR=${hex8(mv.regs[MBR])}.`,
    );
  }
  return finish(mv, "Lectura", parts.join(" "), "execute");
}

function doExecute(mv: Machine): StepEvent {
  const opc = mv.regs[OPC];
  const op = OPERATIONS[opc];
  if (!op) throw new VmFault(INST_INV);
  mv.note = "";
  op(mv);
  if (mv.status === "input") {
    return finish(mv, "Ejecución", mv.note || `${mv.mnemonic} espera un dato en la consola.`, null);
  }
  return finish(mv, "Ejecución", mv.note || `${mv.mnemonic} se ejecutó.`, "writeback");
}

function doWriteback(mv: Machine): StepEvent {
  const opc = mv.regs[OPC];
  let detail: string;
  if (opc >= 0x10 && opc <= 0x1f && opc !== 0x15) {
    const dest = guardaOP(mv, OP1, mv.valor1);
    if (opc === 0x19) {
      const other = guardaOP(mv, OP2, mv.valor2);
      detail = `SWAP guarda los dos resultados: el destino es ${dest} y el otro operando es ${other}.`;
    } else if (dest === "memoria") {
      detail = `Se escribe ${s32(mv.valor1)} en la memoria destino, en big-endian.`;
    } else if (dest === "registro") {
      detail = `Se escribe ${s32(mv.valor1)} en el registro destino. La memoria no cambia en esta fase.`;
    } else {
      detail = "El destino es un inmediato. No se puede guardar ahí, así que esta fase no modifica nada.";
    }
  } else if (opc === 0x0a || opc === 0x0c) {
    const dest = guardaOP(mv, OP1, mv.valor1);
    detail =
      dest === "memoria"
        ? `Se escribe ${s32(mv.valor1)} en la memoria destino.`
        : `Se escribe ${s32(mv.valor1)} en el destino (${dest}).`;
  } else {
    detail =
      "No hay writeback. Saltos, CALL, RET, PUSH, CMP y SYS ya dejaron su efecto en la ejecución; CMP solo tocó CC.";
  }
  if (mv.writeAddrs.length) {
    const listed = mv.writeAddrs.map((addr) => `${hex4(addr)}=${hex2(mv.ram[addr])}`).join(" ");
    detail += ` Bytes escritos: ${listed}.`;
  }
  return finish(mv, "Writeback", detail, "fetch");
}

const STEPS = {
  fetch: doFetch,
  decode: doDecode,
  operands: doOperands,
  advance: doAdvance,
  read: doRead,
  execute: doExecute,
  writeback: doWriteback,
};

export function microStep(mv: Machine): StepEvent | null {
  if (mv.status !== "running") return null;
  beginPhase(mv);
  try {
    return STEPS[mv.phase](mv);
  } catch (error) {
    if (error instanceof VmFault) return fail(mv, error);
    throw error;
  }
}

export function stepInstruction(mv: Machine): StepEvent | null {
  if (mv.status !== "running") return null;
  let last: StepEvent | null = null;
  for (let guard = 0; guard < 8; guard++) {
    last = microStep(mv);
    if (!last || mv.status !== "running" || mv.phase === "fetch") break;
  }
  return last;
}

export function runAll(mv: Machine, max = 100000): number {
  let count = 0;
  while (mv.status === "running" && count < max) {
    stepInstruction(mv);
    count++;
    if (mv.breakpointPause) break;
  }
  return count;
}

export function provideInput(mv: Machine, text: string): StepEvent | null {
  if (mv.status !== "input" || !mv.input) return null;
  beginPhase(mv);
  const outcome = acceptInput(mv, text);
  const event = finish(mv, "Entrada", mv.note, null);
  if (outcome === "done") {
    mv.status = "running";
    mv.phase = "writeback";
  }
  return event;
}
