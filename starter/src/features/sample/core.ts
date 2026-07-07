/**
 * core.ts = 純粋計算だけ（L2）。verify が AST で IO 混入を弾く。
 *   - new Date()/Date.now()/Math.random()/fetch/await/async/prisma 等は書けない。
 *   - 時刻・乱数・id が欲しければ、生成せず InitData/Action の引数から受け取る（L3）。
 *
 * (state, action) => [state, effect[]] のステートマシン。async はここに無い。
 * 同じ純関数を Shell からも server page(SSR) からも呼べる。
 */
import { InitData, State, Action, Effect } from "./types";

export function init(data: InitData): State {
  return { count: data.initialCount, lastTouched: data.now };
}

export function update(state: State, action: Action): [State, Effect[]] {
  switch (action.type) {
    case "INCREMENT": {
      const next: State = { count: state.count + 1, lastTouched: action.now };
      return [next, [{ type: "SAVE", key: "count", value: String(next.count) }]];
    }
    case "RESET": {
      const next: State = { count: 0, lastTouched: action.now };
      return [next, [{ type: "LOG", message: "reset" }]];
    }
    default: {
      // 網羅性の番人（Action を増やしたら、ここで tsc が落ちる）
      const _exhaustive: never = action;
      throw new Error(String(_exhaustive));
    }
  }
}

// SSR でも使える集計の純関数（L5: server page はこれを呼ぶだけにする）
export function summarize(state: State): string {
  return `count=${state.count} (at ${state.lastTouched})`;
}
