import { hex2, hex4, s32 } from "./bits";
import { EAX, ECX, EDX, LAR, MAR, MBR } from "./constants";
import { calculaDirFis, formatLogical, guardaMem, leeMem, setReg } from "./memory";
import type { InputRequest, Machine } from "./types";

const FORMAT_NAME: Record<number, string> = {
  0x01: "decimal",
  0x02: "carácter",
  0x04: "octal",
  0x08: "hexadecimal",
  0x10: "binario",
};

function pushLine(mv: Machine, kind: "out" | "in" | "info" | "error", text: string) {
  mv.consoleLines.push({ kind, text });
  if (mv.consoleLines.length > 400) mv.consoleLines.splice(0, mv.consoleLines.length - 400);
}

function formatWrite(dir: number, valor: number, size: number, format: number): string {
  let out = `[${hex4(dir)}]: `;
  const value = valor >>> 0;
  if (format & 0x10) {
    out += "0b";
    if (value === 0) out += "0";
    else {
      let bit = 31;
      while (((value >>> bit) & 1) === 0) bit--;
      for (; bit >= 0; bit--) out += String((value >>> bit) & 1);
    }
    out += " ";
  }
  if (format & 0x08) out += `0x${value.toString(16).toUpperCase()} `;
  if (format & 0x04) out += `0o${value.toString(8)} `;
  if (format & 0x02) {
    for (let k = size - 1; k >= 0; k--) {
      const code = (value >>> (k * 8)) & 0xff;
      out += code >= 32 && code < 127 ? String.fromCharCode(code) : ".";
    }
    out += " ";
  }
  if (format & 0x01) out += `${s32(value)} `;
  return out;
}

function promptFor(mv: Machine, pointer: number, index: number, size: number, label: string): string {
  const dir = calculaDirFis(index * size, pointer, mv);
  return `[${hex4(dir)}] ${label}`;
}

export function executeSys(mv: Machine) {
  const service = s32(mv.valor1);
  if (service === 0) {
    mv.consoleLines = [{ kind: "info", text: "SYS 0 limpió la pantalla." }];
    mv.note = "SYS 0 limpia la consola. En la máquina de la cátedra manda la secuencia ANSI que borra la terminal.";
    return;
  }
  if (service === 1) {
    startRead(mv);
    return;
  }
  if (service === 2) {
    writeValues(mv);
    return;
  }
  if (service === 3) {
    startString(mv);
    return;
  }
  if (service === 4) {
    writeString(mv);
    return;
  }
  if (service === 0x0f) {
    mv.breakpointPause = true;
    pushLine(mv, "info", "Breakpoint.");
    mv.note =
      "SYS 0x0F es un breakpoint. El modo correr se detiene para que mires el estado. En la cátedra, además, se guardaría una imagen .vmi y habría que tipear g, q o Enter.";
    return;
  }
  mv.note = `SYS ${service} no está definido en la MV1. La máquina lo ignora y sigue.`;
}

function startRead(mv: Machine) {
  const count = mv.regs[ECX] & 0xffff;
  const size = (mv.regs[ECX] >>> 16) & 0xffff;
  const format = mv.regs[EAX] >>> 0;
  const name = FORMAT_NAME[format];
  if (!name) {
    pushLine(mv, "error", "FORMATO DE READ INVALIDO");
    mv.note =
      "EAX no trae un formato de lectura conocido (1 decimal, 2 carácter, 4 octal, 8 hexadecimal o 10 binario). SYS 1 termina sin leer.";
    return;
  }
  if (count === 0) {
    mv.note = "La parte baja de ECX vale 0: SYS 1 no tiene que leer ningún valor.";
    return;
  }
  const pointer = mv.regs[EDX];
  mv.input = {
    kind: "read",
    index: 0,
    count,
    size,
    format,
    pointer,
    prompt: promptFor(mv, pointer, 0, size, name),
  };
  mv.status = "input";
  mv.note = `SYS 1 lee ${count} valor(es) de ${size} bytes, en ${name}. EDX apunta a ${formatLogical(mv, pointer)}. La máquina espera el primero.`;
}

function writeValues(mv: Machine) {
  const count = mv.regs[ECX] & 0xffff;
  const size = (mv.regs[ECX] >>> 16) & 0xffff;
  const format = mv.regs[EAX] >>> 0;
  const pointer = mv.regs[EDX];
  for (let i = 0; i < count; i++) {
    const dir = calculaDirFis(i * size, pointer, mv);
    setReg(mv, LAR, pointer);
    setReg(mv, MAR, ((size << 16) | (dir & 0xffff)) >>> 0);
    leeMem(mv);
    pushLine(mv, "out", formatWrite(dir, mv.regs[MBR], size, format));
  }
  const formats = Object.entries(FORMAT_NAME)
    .filter(([bit]) => format & Number(bit))
    .map(([, label]) => label);
  mv.note = `SYS 2 escribe ${count} valor(es) de ${size} bytes desde ${formatLogical(mv, pointer)}. EAX = ${hex2(format)} pide ${formats.length ? formats.join(", ") : "ningún formato"}. Cada celda pasa por LAR, MAR y MBR antes de llegar a la consola.`;
}

function startString(mv: Machine) {
  let limit = s32(mv.regs[ECX]);
  if (limit < 0) limit = 9999;
  const pointer = mv.regs[EDX];
  const dir = calculaDirFis(0, pointer, mv);
  mv.input = {
    kind: "string",
    pointer,
    limit,
    prompt: `[${hex4(dir)}] texto (hasta ${limit} caracteres)`,
  };
  mv.status = "input";
  mv.note = `SYS 3 lee una cadena en ${formatLogical(mv, pointer)}. ECX limita a ${limit} caracteres; si ECX era negativo, el tope pasa a 9999. Al final se escribe el byte 0.`;
}

function writeString(mv: Machine) {
  const pointer = mv.regs[EDX];
  const dir = calculaDirFis(0, pointer, mv);
  setReg(mv, LAR, pointer);
  let text = "";
  let i = 0;
  while (i < 100000) {
    setReg(mv, MAR, ((1 << 16) | ((dir + i) & 0xffff)) >>> 0);
    leeMem(mv);
    const byte = mv.regs[MBR] & 0xff;
    if (byte === 0) break;
    text += byte >= 32 && byte < 127 ? String.fromCharCode(byte) : ".";
    i++;
  }
  pushLine(mv, "out", text);
  mv.note = `SYS 4 recorre la memoria desde ${formatLogical(mv, pointer)} de a un byte hasta encontrar 0. Imprime ${i} caracteres.`;
}

function parseRead(format: number, text: string): number | null {
  const trimmed = text.trim();
  if (format === 0x02) {
    if (!trimmed) return null;
    return trimmed.charCodeAt(0) & 0xff;
  }
  const match =
    format === 0x01
      ? /^-?\d+$/
      : format === 0x04
        ? /^-?[0-7]+$/
        : format === 0x08
          ? /^-?[0-9a-fA-F]+$/
          : format === 0x10
            ? /^[01]+$/
            : null;
  if (!match || !match.test(trimmed)) return null;
  const base = format === 0x01 ? 10 : format === 0x04 ? 8 : format === 0x08 ? 16 : 2;
  const value = Number.parseInt(trimmed, base);
  if (!Number.isFinite(value)) return null;
  return value | 0;
}

function storeCell(mv: Machine, pointer: number, index: number, size: number, value: number) {
  const dir = calculaDirFis(index * size, pointer, mv);
  setReg(mv, LAR, pointer);
  setReg(mv, MAR, ((size << 16) | (dir & 0xffff)) >>> 0);
  setReg(mv, MBR, value);
  guardaMem(mv);
}

export function acceptInput(mv: Machine, text: string): "done" | "more" | "bad" {
  const request = mv.input;
  if (!request) return "done";
  if (request.kind === "read") return acceptRead(mv, request, text);
  return acceptString(mv, request, text);
}

function acceptRead(mv: Machine, request: Extract<InputRequest, { kind: "read" }>, text: string): "done" | "more" | "bad" {
  const value = parseRead(request.format, text);
  if (value === null) {
    pushLine(mv, "error", "No pude leer eso en el formato pedido.");
    mv.note = `El formato es ${FORMAT_NAME[request.format]}. Probá de nuevo: la máquina todavía espera el valor ${request.index + 1} de ${request.count}.`;
    return "bad";
  }
  storeCell(mv, request.pointer, request.index, request.size, value);
  pushLine(mv, "in", `${request.prompt} ${text.trim()}`);
  request.index += 1;
  if (request.index < request.count) {
    request.prompt = promptFor(mv, request.pointer, request.index, request.size, FORMAT_NAME[request.format]);
    mv.note = `Quedó guardado ${value}. Falta el valor ${request.index + 1} de ${request.count}.`;
    return "more";
  }
  mv.input = null;
  mv.note = `SYS 1 terminó: ${request.count} valor(es) quedaron en memoria a partir de ${formatLogical(mv, request.pointer)}.`;
  return "done";
}

function acceptString(mv: Machine, request: Extract<InputRequest, { kind: "string" }>, text: string): "done" {
  let limit = request.limit;
  if (limit < 0) limit = 9999;
  let body = text.replace(/\r/g, "");
  if (limit === 0) body = "";
  else if (!body.endsWith("\n") && body.length < limit) body += "\n";
  body = body.slice(0, Math.max(0, limit));
  const dir = calculaDirFis(0, request.pointer, mv);
  setReg(mv, LAR, request.pointer);
  for (let i = 0; i < body.length; i++) {
    setReg(mv, MAR, ((1 << 16) | ((dir + i) & 0xffff)) >>> 0);
    setReg(mv, MBR, body.charCodeAt(i) & 0xff);
    guardaMem(mv);
  }
  setReg(mv, MAR, ((1 << 16) | ((dir + body.length) & 0xffff)) >>> 0);
  setReg(mv, MBR, 0);
  guardaMem(mv);
  pushLine(mv, "in", body.replace(/\n$/, "") || "(vacío)");
  mv.input = null;
  mv.note = `SYS 3 escribió ${body.length} caracteres y el terminador 0 en ${formatLogical(mv, request.pointer)}, igual que fgets.`;
  return "done";
}
