// L6 fixture: a feature component that holds its own state.
// checkComponentStatelessness (L10) must reject every hook call below.
import { useEffect, useState } from "react";

export function BadPanel({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false); // L10: domain state outside Core
  useEffect(() => { // L10: lifecycle outside Core
    setOpen(items.length > 0);
  }, [items]);
  return <div onClick={() => setOpen(!open)}>{open ? items.length : null}</div>;
}
