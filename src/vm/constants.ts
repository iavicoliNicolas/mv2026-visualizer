export const RAM_DEFAULT = 16 * 1024;
export const REG_COUNT = 32;
export const TDS_COUNT = 8;

export const IP = 0;
export const OPC = 1;
export const OP1 = 2;
export const OP2 = 3;
export const LAR = 4;
export const MAR = 5;
export const MBR = 6;
export const SP = 7;
export const BP = 8;

export const EAX = 10;
export const EBX = 11;
export const ECX = 12;
export const EDX = 13;
export const EEX = 14;
export const EFX = 15;
export const AC = 16;
export const CC = 17;

export const CS = 26;
export const DS = 27;
export const ES = 28;
export const SS = 29;
export const KS = 30;
export const PS = 31;

export const REG_NAMES = [
  "IP",
  "OPC",
  "OP1",
  "OP2",
  "LAR",
  "MAR",
  "MBR",
  "SP",
  "BP",
  "",
  "EAX",
  "EBX",
  "ECX",
  "EDX",
  "EEX",
  "EFX",
  "AC",
  "CC",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "CS",
  "DS",
  "ES",
  "SS",
  "KS",
  "PS",
];

export const MNEMONICS = [
  "SYS",
  "JMP",
  "JP",
  "JN",
  "JZ",
  "JC",
  "JV",
  "JNP",
  "JNN",
  "JNZ",
  "NOT",
  "PUSH",
  "POP",
  "CALL",
  "RET",
  "STOP",
  "MOV",
  "ADD",
  "SUB",
  "MUL",
  "DIV",
  "CMP",
  "AND",
  "OR",
  "XOR",
  "SWAP",
  "SHL",
  "SHR",
  "SAR",
  "LDL",
  "LDH",
  "RND",
];

export const INST_INV = 1;
export const DIV_CERO = 2;
export const FALLO_SEG = 3;
export const STACK_OVER = 4;
export const STACK_UNDER = 5;

export const ERROR_TEXT: Record<number, string> = {
  [INST_INV]: "INSTRUCCION INVALIDA",
  [DIV_CERO]: "DIVISION POR CERO",
  [FALLO_SEG]: "FALLO DE SEGMENTO",
  [STACK_OVER]: "STACK OVERFLOW",
  [STACK_UNDER]: "STACK UNDERFLOW",
};

export const SEGMENT_REGS: [number, string][] = [
  [PS, "PS"],
  [KS, "KS"],
  [CS, "CS"],
  [DS, "DS"],
  [ES, "ES"],
  [SS, "SS"],
];

export function regName(cod: number, sector = 0): string {
  if (cod >= 10 && cod <= 15) {
    const letter = String.fromCharCode("A".charCodeAt(0) + (cod - 10));
    if (sector === 0) return `E${letter}X`;
    if (sector === 1) return `${letter}L`;
    if (sector === 2) return `${letter}H`;
    return `${letter}X`;
  }
  return REG_NAMES[cod] || `R${cod}`;
}
