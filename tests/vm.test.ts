import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CC,
  CS,
  DS,
  EAX,
  EBX,
  ECX,
  EDX,
  IP,
  SP,
  SS,
  banderasProgram,
  buildVmx,
  disassemble,
  insn,
  loadVmi,
  loadVmx,
  microStep,
  provideInput,
  runAll,
  saltoProgram,
  stepInstruction,
  type Machine,
} from "@/vm";

const hola = new Uint8Array(readFileSync("public/samples/hola.vmx"));
const reg = (id: number) => ({ k: "r" as const, reg: id });
const imm = (v: number) => ({ k: "i" as const, v });

function untilQuiet(bytes: Uint8Array, opts?: { params?: string[]; ramKiB?: number }) {
  const mv = loadVmx(bytes, opts);
  runAll(mv);
  return mv;
}

function spin(mv: Machine) {
  let guard = 0;
  while (mv.status === "running" && guard < 10000) {
    stepInstruction(mv);
    guard++;
  }
}

describe("loader y desensamblado", () => {
  it("carga hola.vmx versión 1 y muestra el primer MOV", () => {
    const mv = loadVmx(hola, { name: "hola.vmx" });
    expect(mv.version).toBe(1);
    expect(mv.regs[IP]).toBe(mv.regs[CS]);
    const code = disassemble(mv).filter((line) => line.kind === "code");
    expect(code[0]?.text).toBe("MOV l[DS+3], 97");
    expect(code.at(-1)?.text).toBe("SYS 2");
    expect(mv.tds[0] & 0xffff).toBe(46);
  });

  it("rechaza un archivo que no es VMX26", () => {
    const fake = new Uint8Array(8);
    fake.set(new TextEncoder().encode("NOPE!"));
    expect(() => loadVmx(fake)).toThrow(/VMX26/);
  });

  it("arma la pila inicial de un v2 con parámetros", () => {
    const mv = loadVmx(banderasProgram(), { name: "banderas.vmx", params: ["uno"] });
    expect(mv.version).toBe(2);
    expect(mv.regs[SS]).not.toBe(0xffffffff);
    const slot = mv.regs[SS] >>> 16;
    const base = mv.tds[slot] >>> 16;
    const size = mv.tds[slot] & 0xffff;
    const top = base + size;
    const ret = (mv.ram[top - 12] << 24) | (mv.ram[top - 11] << 16) | (mv.ram[top - 10] << 8) | mv.ram[top - 9];
    const argc = (mv.ram[top - 8] << 24) | (mv.ram[top - 7] << 16) | (mv.ram[top - 6] << 8) | mv.ram[top - 5];
    expect(ret >>> 0).toBe(0xffffffff);
    expect(argc).toBe(2);
    expect(mv.regs[SP] & 0xffff).toBe(size - 12);
  });
});

describe("ciclo de hola", () => {
  it("el primer MOV tiene las siete fases y escribe un long", () => {
    const mv = loadVmx(hola);
    const phases = [];
    for (let i = 0; i < 7; i++) phases.push(microStep(mv)?.phase);
    expect(phases).toEqual(["fetch", "decode", "operands", "advance", "read", "execute", "writeback"]);
    expect(mv.phase).toBe("fetch");
    expect(mv.mnemonic).toBe("MOV");
    const base = mv.tds[mv.regs[DS] >>> 16] >>> 16;
    expect(Array.from(mv.ram.subarray(base + 3, base + 7))).toEqual([0x00, 0x00, 0x00, 0x61]);
    expect(mv.lastEvent?.detail.length).toBeGreaterThan(20);
  });

  it("deja Hola en DS+3 y la consola la imprime", () => {
    const mv = untilQuiet(hola);
    expect(mv.status).toBe("halted");
    const base = mv.tds[mv.regs[DS] >>> 16] >>> 16;
    const letters = Array.from(mv.ram.subarray(base + 3, base + 7)).map((byte) => String.fromCharCode(byte));
    expect(letters).toEqual(["H", "o", "l", "a"]);
    const text = mv.consoleLines.map((line) => line.text).join("\n");
    expect(text).toBe(
      ["[0031]: 0b1001000 H ", "[0032]: 0b1101111 o ", "[0033]: 0b1101100 l ", "[0034]: 0b1100001 a "].join("\n"),
    );
  });
});

describe("banderas, saltos y pila", () => {
  it("ADD 5 + (−3) prende C y CALL/RET deja EAX en 3", () => {
    const mv = loadVmx(banderasProgram());
    stepInstruction(mv);
    stepInstruction(mv);
    expect(mv.regs[EAX] | 0).toBe(2);
    expect((mv.regs[CC] >>> 29) & 1).toBe(1);
    expect((mv.regs[CC] >>> 28) & 1).toBe(0);

    stepInstruction(mv);
    const sp = mv.regs[SP];
    const phys = (mv.tds[sp >>> 16] >>> 16) + (sp & 0xffff);
    const word =
      ((mv.ram[phys] << 24) | (mv.ram[phys + 1] << 16) | (mv.ram[phys + 2] << 8) | mv.ram[phys + 3]) >>> 0;
    expect(word).toBe((mv.regs[CS] & 0xffff0000) | 11);

    runAll(mv);
    expect(mv.status).toBe("halted");
    expect(mv.regs[EAX] | 0).toBe(3);
    expect(mv.regs[IP] >>> 0).toBe(0xffffffff);
  });

  it("CMP igual prende Z y JZ se salta la asignación", () => {
    const mv = untilQuiet(saltoProgram());
    expect(mv.status).toBe("halted");
    expect(mv.regs[EAX] | 0).toBe(9);
    expect((mv.regs[CC] >>> 30) & 1).toBe(0);
  });

  it("el desborde con signo prende V y N", () => {
    const code = [
      ...insn(0x1e, reg(EAX), imm(0x7fff)),
      ...insn(0x1d, reg(EAX), imm(0xffff)),
      ...insn(0x11, reg(EAX), imm(1)),
      ...insn(0x0f),
    ];
    const mv = untilQuiet(buildVmx({ code, stack: 16 }));
    expect(mv.regs[EAX] | 0).toBe(-2147483648);
    expect((mv.regs[CC] >>> 31) & 1).toBe(1);
    expect((mv.regs[CC] >>> 28) & 1).toBe(1);
    expect(mv.regs[CC] >>> 0).toBe(0x90000000);
  });
});

describe("errores y entrada", () => {
  it("divide por cero y no sigue", () => {
    const code = [
      ...insn(0x10, reg(EAX), imm(1)),
      ...insn(0x10, reg(EBX), imm(0)),
      ...insn(0x14, reg(EAX), reg(EBX)),
      ...insn(0x0f),
    ];
    const mv = untilQuiet(buildVmx({ code, stack: 16 }));
    expect(mv.status).toBe("error");
    expect(mv.errorMessage).toBe("DIVISION POR CERO");
  });

  it("un acceso fuera del segmento es fallo de segmento", () => {
    const code = [...insn(0x10, reg(EAX), { k: "m", reg: DS, off: 8, n: 4 }), ...insn(0x0f)];
    const mv = untilQuiet(buildVmx({ code, data: 8 }));
    expect(mv.status).toBe("error");
    expect(mv.errorMessage).toBe("FALLO DE SEGMENTO");
  });

  it("PUSH con la pila justa desborda", () => {
    const code = [...insn(0x0b, reg(EAX))];
    const mv = untilQuiet(buildVmx({ code, stack: 12 }));
    expect(mv.status).toBe("error");
    expect(mv.errorMessage).toBe("STACK OVERFLOW");
  });

  it("SYS 1 escribe en memoria el decimal que se tipea", () => {
    const code = [
      ...insn(0x10, reg(EDX), reg(DS)),
      ...insn(0x1e, reg(ECX), imm(1)),
      ...insn(0x1d, reg(ECX), imm(1)),
      ...insn(0x10, reg(EAX), imm(1)),
      ...insn(0x00, imm(1)),
      ...insn(0x0f),
    ];
    const mv = loadVmx(buildVmx({ code, data: 16 }));
    spin(mv);
    expect(mv.status).toBe("input");
    expect(mv.input?.kind).toBe("read");
    provideInput(mv, "65");
    spin(mv);
    expect(mv.status).toBe("halted");
    const base = mv.tds[mv.regs[DS] >>> 16] >>> 16;
    expect(mv.ram[base]).toBe(65);
  });
});

describe("imagen vmi", () => {
  it("restaura registros, TDS y RAM", () => {
    const source = loadVmx(hola);
    runAll(source);
    const kib = source.ram.length / 1024;
    const bytes = new Uint8Array(8 + 32 * 4 + 8 * 4 + source.ram.length);
    bytes.set(new TextEncoder().encode("VMI26"), 0);
    bytes[5] = 1;
    bytes[6] = (kib >> 8) & 0xff;
    bytes[7] = kib & 0xff;
    let offset = 8;
    const put = (value: number) => {
      bytes[offset++] = (value >>> 24) & 0xff;
      bytes[offset++] = (value >>> 16) & 0xff;
      bytes[offset++] = (value >>> 8) & 0xff;
      bytes[offset++] = value & 0xff;
    };
    for (const value of source.regs) put(value);
    for (const value of source.tds) put(value);
    bytes.set(source.ram, offset);
    const restored = loadVmi(bytes, "hola.vmi");
    expect(restored.version).toBe(2);
    expect(restored.regs[IP]).toBe(source.regs[IP]);
    expect(restored.regs[EAX]).toBe(source.regs[EAX]);
    expect(Array.from(restored.ram.subarray(0, 8))).toEqual(Array.from(source.ram.subarray(0, 8)));
    expect(restored.tds[1]).toBe(source.tds[1]);
  });
});
