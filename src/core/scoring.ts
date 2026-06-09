import type { LogType } from "./types";

export const INITIATION_XP = 10;
export const RESCUE_XP = 30;
export const WIN_XP = 15;
export const CLARITY_XP = 15;
export const IDEA_XP = 0;

export function computeXP(type: LogType): number {
  switch (type) {
    case "pounce":
      return INITIATION_XP;
    case "mvd":
    case "salvage":
      return RESCUE_XP;
    case "win":
      return WIN_XP;
    case "clarity":
      return CLARITY_XP;
    case "idea":
    case "leak":
    case "calibration":
      return 0;
    default:
      return 0;
  }
}
