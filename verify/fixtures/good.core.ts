/**
 * FIXTURE（わざと壊した検体）— L2 Core純度: クリーンな対照群。
 * 非決定性は引数(InitData/Action)から注入され、Core内では生成しない（L3）。
 * self-test は「このファイルは違反0」であることを確認する。
 * （壊れた検体だけでなく、正しい検体を*誤検出しない*ことも検証器の正しさの一部）
 */
type InitData = { now: string; seed: number };
type State = { day: string };

export function init(data: InitData): State {
  return { day: data.now.slice(0, 10) };
}

export function update(state: State, action: { type: "TICK"; now: string }): [State, null] {
  switch (action.type) {
    case "TICK":
      return [{ day: action.now.slice(0, 10) }, null];
    default: {
      const _exhaustive: never = action.type;
      throw new Error(_exhaustive);
    }
  }
}
