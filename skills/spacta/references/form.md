# Form — decisions `verify` does not make for you

The Laws are checked. These are not, and are yours to judge. Keep `verify` green and the details
of Form do not matter; when in doubt, follow this.

## Where a type goes

- **One consumer** → put it in that file.
- **A cluster inside one feature** → the representative file, usually `core.ts`.
- **A real contract inside one feature** → that feature's `types.ts`.
- **Membrane vocabulary** (`State` / `Action` / `Effect` / `InitData` / `Answer`) → always
  `types.ts`, even with one consumer today.
- **Data the IO edge produces and several features read** → the shared read-model file.

The test for anything shared: **does it change when you add a feature?** No → it is data and may
be shared. Yes → it is vocabulary, and it belongs to the feature. That single question is what
dissolved the shared `Effect` union; apply it before putting anything in a shared file.

## Keeping a shell thin

A `shell.tsx` is **optional**. A feature with no interaction goes `page.tsx` → `components/`.
Do not create an empty shell because the starter has one.

What may stay in a shell is JSX wiring: state into props, callbacks into `dispatch`. Everything
else moves:

| In a shell now | Where it belongs |
|---|---|
| `if (state.items.length > 3 && !state.dismissed)` | a predicate in `core.ts` |
| deciding *whether* to save | `isDirty` / `isSaving` in `core.ts` |
| `new Date()`, `crypto.randomUUID()` | the adapter mints it: `dispatch((mint) => …)` |
| `useState` for feature state | Core owns state |
| a loop over Effects | the engine. There is one |

A timer or an event listener that turns "the user paused" into an Action is a platform mechanism
and may stay — but whether that Action *causes* anything is decided in `update`, which is free to
say no.

**`verify` does not check any of this** (L10 covers components, not shells). Read the shell
yourself and ask of each line: is this wiring, or is this a decision?

## Components

Pure functions of props. No `useState`, no `useEffect`, no IO, no `new Date()`.

`shared/ui` holds presentation primitives that know no feature concept — `Button`, `Card`. They
may keep widget-local state (open/closed, focus, position); that is not domain state. They must
never import a feature type.

Duplication between features is allowed and **preferred over coupling**. A `clone` info is not an
instruction: it is never a reason to add a cross-feature import, nor to promote a component into
`shared/ui`. Promote after the same shape has actually repeated in two or more features.

Split display elements into sibling files under `components/`. Do not create grandchildren.

## Server boundaries

`page.tsx`, `route.ts` and `layout.tsx` fetch and delegate. Aggregation and formatting go in a
pure Core function that the boundary calls. Do not generate ids or time here — inject them. A
value **returned by** IO (a database-assigned id) is a read, not generation.
