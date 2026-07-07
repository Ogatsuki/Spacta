/**
 * FIXTURE（正しい検体）— dead/single-owner を誤検知しないための対照群。
 * SharedType は2ファイルから import される真の共有契約。dead/single-owner は 0 件であるべき。
 */
export type SharedType = { value: number };
