/**
 * feature 固有の型。他 feature からは import しない（L1）。
 */
import { Effect } from "@/shared/types";

// 読み経路の入口: World → Source(IO) → InitData → Core.init
export type InitData = {
  now: string; // 非決定性(時刻)は「値」として注入される（L3）。Core は new Date() しない。
  initialCount: number;
};

export type State = {
  count: number;
  lastTouched: string;
};

// 書き経路の入口: Shell → Action → Core.update
export type Action =
  | { type: "INCREMENT"; now: string }
  | { type: "RESET"; now: string };

export type { Effect };
