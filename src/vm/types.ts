export type Phase =
  | "fetch"
  | "decode"
  | "operands"
  | "advance"
  | "read"
  | "execute"
  | "writeback";

export const PHASES: { id: Phase; label: string }[] = [
  { id: "fetch", label: "Fetch" },
  { id: "decode", label: "Decode" },
  { id: "operands", label: "Operandos" },
  { id: "advance", label: "IP" },
  { id: "read", label: "Lectura" },
  { id: "execute", label: "Ejecución" },
  { id: "writeback", label: "Writeback" },
];

export type Status = "running" | "halted" | "error" | "input";

export type RegDiff = { reg: number; from: number; to: number };

export type StepEvent = {
  phase: Phase;
  title: string;
  detail: string;
  changedRegs: RegDiff[];
  readAddrs: number[];
  writeAddrs: number[];
  instPhys: number;
  mnemonic: string;
};

export type ConsoleLine = {
  kind: "out" | "in" | "info" | "error";
  text: string;
};

export type InputRequest =
  | {
      kind: "read";
      index: number;
      count: number;
      size: number;
      format: number;
      pointer: number;
      prompt: string;
    }
  | {
      kind: "string";
      pointer: number;
      limit: number;
      prompt: string;
    };

export type Machine = {
  ram: Uint8Array;
  regs: Uint32Array;
  tds: Uint32Array;
  version: number;
  imagen: string | null;
  bpoint: number;
  status: Status;
  errorCode: number | null;
  errorMessage: string | null;
  haltReason: string | null;
  phase: Phase;
  consoleLines: ConsoleLine[];
  input: InputRequest | null;
  programName: string;
  blurb: string;
  params: string[];
  seed: number;
  rngState: number;
  entryPhysical: number;
  opByte: number;
  valor1: number;
  valor2: number;
  instPhys: number;
  mnemonic: string;
  note: string;
  regDiffs: RegDiff[];
  readAddrs: number[];
  writeAddrs: number[];
  lastEvent: StepEvent | null;
  history: StepEvent[];
  breakpointPause: boolean;
};

export type DisasmLine = {
  kind: "code" | "string";
  physical: number;
  bytes: number[];
  text: string;
  mnemonic: string;
  isEntry: boolean;
};

export type SegmentView = {
  name: string;
  index: number;
  base: number;
  size: number;
};
