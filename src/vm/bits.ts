export function u32(n: number): number {
  return n >>> 0;
}

export function s32(n: number): number {
  const v = n >>> 0;
  return v > 0x7fffffff ? v - 0x100000000 : v;
}

export function s16(n: number): number {
  const v = n & 0xffff;
  return v > 0x7fff ? v - 0x10000 : v;
}

export function s8(n: number): number {
  const v = n & 0xff;
  return v > 0x7f ? v - 0x100 : v;
}

export function u64(n: number): bigint {
  return BigInt(n >>> 0);
}

export function s64(n: number): bigint {
  return BigInt(s32(n));
}

export function toUint64(n: bigint): bigint {
  const mod = 1n << 64n;
  return ((n % mod) + mod) % mod;
}

export function low32(n: bigint): number {
  return s32(Number(n & 0xffffffffn));
}

export function hex2(n: number): string {
  return (n & 0xff).toString(16).toUpperCase().padStart(2, "0");
}

export function hex4(n: number): string {
  return (n & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}

export function hex8(n: number): string {
  return (n >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

export function bits8(n: number): string {
  return (n & 0xff).toString(2).padStart(8, "0");
}
