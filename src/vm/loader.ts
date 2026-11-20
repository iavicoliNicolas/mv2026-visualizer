import { u32 } from "./bits";
import {
  CS,
  DS,
  ES,
  IP,
  KS,
  PS,
  RAM_DEFAULT,
  REG_COUNT,
  SP,
  SS,
  TDS_COUNT,
} from "./constants";
import { calculaDirFis } from "./memory";
import type { Machine } from "./types";

export type LoadOptions = {
  ramKiB?: number;
  name?: string;
  params?: string[];
  seed?: number;
  blurb?: string;
};

type Header = {
  version: number;
  code: number;
  data: number;
  extra: number;
  stack: number;
  constants: number;
  entry: number;
  cursor: number;
};

function emptyMachine(ramBytes: number, name: string, seed: number, blurb: string): Machine {
  return {
    ram: new Uint8Array(ramBytes),
    regs: new Uint32Array(REG_COUNT),
    tds: new Uint32Array(TDS_COUNT),
    version: 1,
    imagen: null,
    bpoint: 0,
    status: "running",
    errorCode: null,
    errorMessage: null,
    haltReason: null,
    phase: "fetch",
    consoleLines: [],
    input: null,
    programName: name,
    blurb,
    params: [],
    seed,
    rngState: seed >>> 0,
    entryPhysical: 0,
    opByte: 0,
    valor1: 0,
    valor2: 0,
    instPhys: -1,
    mnemonic: "",
    note: "",
    regDiffs: [],
    readAddrs: [],
    writeAddrs: [],
    lastEvent: null,
    history: [],
    breakpointPause: false,
  };
}

function readU16(bytes: Uint8Array, offset: number, field: string): number {
  if (offset + 2 > bytes.length) {
    throw new Error(`Error al cargar el programa (cabecera): falta ${field}`);
  }
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function parseHeader(bytes: Uint8Array, ramBytes: number): Header {
  if (bytes.length < 6) {
    throw new Error("Error al cargar el programa (cabecera): archivo demasiado corto");
  }
  const id = String.fromCharCode(...bytes.subarray(0, 5));
  if (id !== "VMX26") {
    throw new Error('Error al cargar el programa (cabecera): identificador inválido (se esperaba "VMX26")');
  }
  const version = bytes[5];
  if (version === 1) {
    const code = readU16(bytes, 6, "tamaño de código");
    if (code > ramBytes) {
      throw new Error("Error al cargar el programa (cabecera): tamaño de código excede la memoria disponible");
    }
    return {
      version,
      code,
      data: ramBytes - code,
      extra: 0,
      stack: 0,
      constants: 0,
      entry: 0,
      cursor: 8,
    };
  }
  if (version === 2) {
    return {
      version,
      code: readU16(bytes, 6, "tamaño code"),
      data: readU16(bytes, 8, "tamaño data"),
      extra: readU16(bytes, 10, "tamaño extra"),
      stack: readU16(bytes, 12, "tamaño stack"),
      constants: readU16(bytes, 14, "tamaño const"),
      entry: readU16(bytes, 16, "offset entry point"),
      cursor: 18,
    };
  }
  throw new Error("Error al cargar el programa (cabecera): versión de archivo no soportada");
}

function take(bytes: Uint8Array, offset: number, length: number, what: string): Uint8Array {
  if (length && offset + length > bytes.length) {
    throw new Error(
      `Error al cargar el programa (${what}): el archivo no contiene todos los bytes declarados en la cabecera`,
    );
  }
  return bytes.subarray(offset, offset + length);
}

function writeU32be(ram: Uint8Array, offset: number, value: number) {
  const v = u32(value);
  ram[offset] = (v >>> 24) & 0xff;
  ram[offset + 1] = (v >>> 16) & 0xff;
  ram[offset + 2] = (v >>> 8) & 0xff;
  ram[offset + 3] = v & 0xff;
}

function paramSize(name: string, params: string[]): number {
  if (params.length <= 0) return 0;
  let total = name.length + 1;
  for (const param of params) total += param.length + 1;
  return total + 4 * (params.length + 1);
}

function loadParams(
  ram: Uint8Array,
  base: number,
  name: string,
  params: string[],
): number {
  const strings = [name, ...params];
  const offsets: number[] = [];
  let cursor = 0;
  for (const text of strings) {
    offsets.push(cursor);
    for (let i = 0; i < text.length; i++) ram[base + cursor + i] = text.charCodeAt(i) & 0xff;
    ram[base + cursor + text.length] = 0;
    cursor += text.length + 1;
  }
  const argv = cursor;
  for (let i = 0; i < offsets.length; i++) {
    writeU32be(ram, base + cursor + 4 * i, offsets[i]);
  }
  return argv;
}

export function loadVmx(bytes: Uint8Array, options: LoadOptions = {}): Machine {
  const ramKiB = options.ramKiB ?? RAM_DEFAULT / 1024;
  if (!Number.isFinite(ramKiB) || ramKiB < 1 || ramKiB > 64) {
    throw new Error("La memoria tiene que estar entre 1 y 64 KiB");
  }
  const ramBytes = Math.floor(ramKiB) * 1024;
  const name = options.name ?? "programa.vmx";
  const seed = options.seed ?? 1;
  const mv = emptyMachine(ramBytes, name, seed, options.blurb ?? "");
  const header = parseHeader(bytes, ramBytes);
  mv.version = header.version;
  const params = header.version >= 2 ? (options.params ?? []) : [];
  mv.params = params;

  const sizes = [
    paramSize(name, params),
    header.constants,
    header.code,
    header.data,
    header.extra,
    header.stack,
  ];
  const regs = [PS, KS, CS, DS, ES, SS];
  mv.tds.fill(0xffffffff);
  const baseOf = new Array<number>(REG_COUNT).fill(0);
  let base = 0;
  let slot = 0;
  for (let i = 0; i < regs.length; i++) {
    if (sizes[i] === 0) {
      mv.regs[regs[i]] = 0xffffffff;
      continue;
    }
    if (base + sizes[i] > ramBytes) {
      throw new Error("Error al cargar el programa (memoria): memoria insuficiente para alojar el proceso");
    }
    mv.tds[slot] = ((base & 0xffff) << 16) | (sizes[i] & 0xffff);
    mv.regs[regs[i]] = (slot << 16) >>> 0;
    baseOf[regs[i]] = base;
    base += sizes[i];
    slot++;
  }

  const code = take(bytes, header.cursor, header.code, "codigo");
  mv.ram.set(code, baseOf[CS]);
  let cursor = header.cursor + header.code;
  if (header.constants) {
    const constants = take(bytes, cursor, header.constants, "const segment");
    mv.ram.set(constants, baseOf[KS]);
    cursor += header.constants;
  }
  void cursor;

  let argvOffset = 0;
  if (sizes[0]) argvOffset = loadParams(mv.ram, baseOf[PS], name, params);

  mv.regs[IP] = (mv.regs[CS] | header.entry) >>> 0;
  if (header.version === 2 && header.stack) {
    if (header.stack < 12) {
      throw new Error("Error al cargar el programa (pila): stack overflow al preparar la pila inicial");
    }
    const argc = params.length > 0 ? params.length + 1 : 0;
    const argv = params.length > 0 ? (mv.regs[PS] + argvOffset) >>> 0 : 0xffffffff;
    const top = baseOf[SS] + header.stack;
    writeU32be(mv.ram, top - 4, argv);
    writeU32be(mv.ram, top - 8, argc);
    writeU32be(mv.ram, top - 12, 0xffffffff);
    mv.regs[SP] = (mv.regs[SS] + header.stack - 12) >>> 0;
  }

  mv.entryPhysical = calculaDirFis(0, mv.regs[IP], mv);
  return mv;
}

function readU32(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) {
    throw new Error("Imagen truncada o corrupta");
  }
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

export function loadVmi(bytes: Uint8Array, name = "imagen.vmi"): Machine {
  if (bytes.length < 8 || String.fromCharCode(...bytes.subarray(0, 5)) !== "VMI26") {
    throw new Error(`Imagen invalida: ${name}`);
  }
  if (bytes[5] !== 1) {
    throw new Error(`Version de imagen no soportada: ${bytes[5]}`);
  }
  const kib = (bytes[6] << 8) | bytes[7];
  const size = kib * 1024;
  if (kib === 0 || size > 65536) {
    throw new Error(`Tamaño de memoria invalido en la imagen: ${kib} KiB`);
  }
  const mv = emptyMachine(size, name, 1, "Imagen de memoria VMI26. El IP y los segmentos ya vienen armados.");
  mv.imagen = name;
  mv.version = 2;
  let offset = 8;
  for (let i = 0; i < REG_COUNT; i++) {
    mv.regs[i] = readU32(bytes, offset);
    offset += 4;
  }
  for (let i = 0; i < TDS_COUNT; i++) {
    mv.tds[i] = readU32(bytes, offset);
    offset += 4;
  }
  if (offset + size > bytes.length) throw new Error(`Imagen truncada o corrupta: ${name}`);
  mv.ram.set(bytes.subarray(offset, offset + size));
  try {
    mv.entryPhysical = calculaDirFis(0, mv.regs[IP], mv);
  } catch {
    mv.entryPhysical = -1;
  }
  return mv;
}
