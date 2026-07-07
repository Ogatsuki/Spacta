/**
 * FIXTURE（わざと壊した検体）— single-owner-export。
 * LocalOnly は1ファイルだけが import するため単独所有候補として検知されるべき。
 * SubmitAction は膜語彙なので、1ファイルだけが import していても除外されるべき。
 */
export type LocalOnly = { value: string };

export type SubmitAction = { type: "SUBMIT"; value: string };
