// L6 fixture: a clean presentation file.
// `react` type imports and `next/link` are legitimate presentation vocabulary and must NOT be
// flagged. This is the regression guard against reusing L2's forbidden import set here:
// doing so produced 21 false positives and 0 true positives on a real codebase.
import type { ReactNode } from "react";
import Link from "next/link";

export function GoodCard({
  href,
  now,
  children,
}: {
  href: string;
  now: string; // time arrives as a value, never generated here (L3)
  children: ReactNode;
}) {
  return (
    <Link href={href} className="rounded-card">
      <span>{now}</span>
      {children}
    </Link>
  );
}
