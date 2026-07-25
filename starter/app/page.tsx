/**
 * server page.tsx = Assembly point for Source(IO). Read values only here,
 * and pass the common frame to layout and presentation/wiring to shell.
 */
import { SampleShell } from "@/features/sample/shell";
import type { InitData } from "@/features/sample/types";
import { fetchInitialCount, readNow } from "@/shared/source";

export default async function Page() {
  // Read values from the boundary (source). page.tsx itself does not own time or business logic.
  const initData: InitData = { now: readNow(), initialCount: await fetchInitialCount() };
  return <SampleShell initData={initData} />;
}
