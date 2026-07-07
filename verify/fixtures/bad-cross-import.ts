/**
 * FIXTURE（わざと壊した検体）— L1 隣 feature の内部を import。
 * このファイルは features/alpha/ に属する想定。features/beta を import している。
 */
import { betaCore } from "@/features/beta/core";
import helper from "../beta/shell";

export const x = betaCore + helper;
