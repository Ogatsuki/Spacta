/**
 * FIXTURE（わざと壊した検体）— dead-export。
 * UsedType は consumer が import する（生存）。DeadType は誰も import しない（死蔵）。
 * self-test は「dead-export が DeadType を必ず1件以上検知し、UsedType を誤検知しない」ことを確認する。
 */
export type UsedType = { id: string };
export type DeadType = { ghost: number };
