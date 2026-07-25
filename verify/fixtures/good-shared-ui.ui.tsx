// L6 fixture: an interactive primitive in shared/ui.
//
// This file is the executable record of a design decision: widget-local state and DOM event
// wiring are legitimate in shared/ui. The state here (is the disclosure open?) is not domain
// state and never crosses the membrane, so L10 does not scan this tier, and L9 deliberately
// omits `window` / `document` from its forbidden set.
//
// If someone later widens L9 over hooks or over the DOM globals, this fixture turns red and
// says why that was deliberate. Banning them would make Dialog / Tabs / Combobox
// unwritable in shared/ui, which empties the layer that keeps the UI consistent.
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div>
      <button onClick={() => setOpen(!open)}>{label}</button>
      {open ? children : null}
    </div>
  );
}
