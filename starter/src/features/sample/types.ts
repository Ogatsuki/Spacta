/**
 * Feature-specific types. Do not import from other features (L1).
 */

// Entry point of read path: World → Source(IO) → InitData → Core.init
export type InitData = {
  now: string; // Non-determinism (time) is injected as a value (L3). Core does not call new Date().
  initialCount: number;
};

export type State = {
  count: number;
  lastTouched: string;
  // correlationIds of writes still in flight. Core owns this, not the Shell.
  // A feature with more than one kind of write needs to remember *what* was done optimistically,
  // not merely that something was: compensation has to undo the right thing. Widen this to a
  // discriminated `{ kind, correlationId, ... }[]` as soon as a second write path appears.
  pending: string[];
  notice: string | null;
};

// A value where Core declares "desired IO". It does not execute (only data crosses the boundary).
//
// This vocabulary belongs to *this* feature, and is declared beside the `perform.ts` that carries
// it out. There is no shared Effect union: adding a member here edits nothing outside this
// directory, and a second feature that needs the same Effect writes it out again rather than
// reaching for a shared declaration (SPACTA.md §2 — duplication over coupling).
//
// An Effect whose answer must reach Core carries a correlationId: pairing a request with its
// answer is non-determinism too, so the edge mints it and Core receives it as a value (L3).
// A member without one still gets an answer — the engine reports the outcome of every Effect
// it performs — but that answer names no write, so Core can only note that it arrived.
export type Effect =
  | { type: "SAVE"; correlationId: string; key: string; value: string }
  | { type: "LOG"; message: string };

// What this feature's Effects answer with. Declared here, next to the question, because the
// engine passes it through as a type parameter and never looks inside: the shape of an answer
// belongs to whoever asked. A shared answer type would have to name every feature's reply in
// one file — the coupling declaring `Effect` per feature already removed.
//
// Here it is the key the database assigned to the saved row. A read would put its rows in the
// same place; there is one channel, not one per kind of answer.
export type Answer = { id: string };

// Entry point of write path: Shell → Action → Core.update
export type Action =
  | { type: "INCREMENT"; now: string; correlationId: string }
  | { type: "RESET"; now: string }
  // Return path of the write. Core must handle both members: the never guard in update() turns
  // deleting either one into a tsc error, and that is what enforces L3's outbound half.
  //
  // correlationId is nullable because the engine answers for *every* Effect it performs, and
  // LOG never asked a question. Core reads null as "no write of mine is being spoken about"
  // and says so in a case of its own — a sentence, not a branch the loop takes on its behalf.
  //
  // `data` is where the server's answer lands, typed `Answer` by this feature. It is optional
  // because LOG answers with nothing at all — an Effect that asked no question has none.
  | { type: "EFFECT_SUCCEEDED"; correlationId: string | null; data?: Answer }
  | { type: "EFFECT_FAILED"; correlationId: string | null; message: string };
