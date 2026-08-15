// The engine, with a UI framework named inside it. This is what stops it moving to
// SwiftUI or Compose, and until v0.11 nothing rejected it: verify was Green on both
// corpora, the serialization test passed, and the sync script copied it to three places.
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EffectSource } from "./types";

export function createRuntime<E extends EffectSource>(perform: (e: E) => Promise<void>) {
  return { perform, useState, useRouter };
}
