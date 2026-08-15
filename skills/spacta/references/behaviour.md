# Checking behaviour

`verify` prints *semantic correctness — never checked* on every run. This is what to do about it.

Two different tools, and neither substitutes for the other.

## 1. The cross-check — is the run reproducible?

`spacta/replay` drives your real `core.ts` through the real engine, records the Actions, writes
them to disk, reads them back, folds `update` over them, and compares **every intermediate
state**. You supply the scenarios; the loop is not yours to write.

```js
import { runCrossCheck } from "spacta/replay";
import * as cart from "../src/features/cart/core.ts";

const { failed } = await runCrossCheck({
  sessionDir: "replay-sessions",
  scenarios: [{
    id: "S1",
    title: "an optimistic add the server rejects",
    aims: "(2)",
    drivers: ["engine"],
    features: () => ({ cart: { init: cart.init, update: cart.update, initData: SEED } }),
    async script(d, io) {
      d.cart.dispatch({ type: "ADD", sku: "x", correlationId: "c1" });
      await io.settleAll({ outcome: () => ({ fail: "Request failed (500)" }) });
    },
  }],
});
process.exit(failed === 0 ? 0 : 1);
```

`io.settleAll({ outcome })` answers the Effects in flight — `{ data }` for an answer, `{ fail }`
for a rejection, nothing for a bare success. `io.settleAll({ order: "reverse" })` settles them
backwards, which is how you reproduce two overlapping writes landing out of order.

Scenarios import your `core.ts` directly, so run them under bun, Deno, or Node with type
stripping.

### Know exactly what this proves

**A cross-check compares a run against its own replay.** A feature that is wrong but
deterministic passes every scenario you can write. It proves the run is reproducible from
`(initData, actions[])` and has no hidden inputs — a real property, and not the one you probably
care about most.

## 2. Behavioural assertions — is the answer right?

This is the part nothing ships for you, because the right answer is a fact about your feature.
Drive the feature and assert the state it reaches:

```js
const runtime = createRuntime({ init: () => cart.init(SEED), update: cart.update, perform });
runtime.dispatch({ type: "ADD", sku: "x", correlationId: "c1" });
await settle();
assertEqual(runtime.getState().items, [], "a rejected add is taken back off the cart");
assertEqual(runtime.getState().pending, [], "and nothing is left claiming to be in flight");
```

For every optimistic write, assert all four:

1. the confirmed case **stands** — and is dropped from `pending`
2. the rejected case is **undone** — the exact row, not the whole list
3. an outcome naming a write you never made **changes nothing**
4. with two writes in flight, one failing **does not retire or undo the other**

Number 4 is the one that gets skipped and the one that is usually wrong.

## 3. Which gate would have noticed?

Break a round trip on purpose and see what turns red. If nothing does, the behaviour is
unchecked no matter how green everything looks:

- delete the body of your `EFFECT_SUCCEEDED` case → does any gate fail?
- delete the compensation in `EFFECT_FAILED` → does any gate fail?

A cross-check will not catch either — the run stays deterministic, so it still replays. Only an
assertion on the state catches them. That is the whole argument for doing both.

## Tiers

`spacta-measure` grades every feature. `T3` means the feature declares Effects **and** receives
their results. Anything below means the write-path round trip is not verified for it.

To raise a feature to T3: give its Effects a `correlationId`, record what was done optimistically
in `State`, and handle both outcome Actions in `update`. A feature stuck at `T2` is one that can
write and then never learn whether the write happened.
