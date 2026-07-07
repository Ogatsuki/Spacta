/**
 * FIXTURE — single-owner-export 検体の消費者。
 */
import type { LocalOnly, SubmitAction } from "./single-owner-export.types";

export const local: LocalOnly = { value: "x" };
export const action: SubmitAction = { type: "SUBMIT", value: "x" };
