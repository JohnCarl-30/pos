import { allocate } from "./checkout";
import { divRoundHalfEven } from "./tax";

export const TIP_PRESETS = [
  { bps: 0, label: "No tip" },
  { bps: 1000, label: "10%" },
  { bps: 1500, label: "15%" },
  { bps: 2000, label: "20%" },
];

export function tipFor(total: number, bps: number): number {
  return Number(divRoundHalfEven(BigInt(total) * BigInt(bps), 10_000n));
}

export function allocateTip(tip: number, amounts: number[]): number[] {
  return allocate(tip, amounts);
}
