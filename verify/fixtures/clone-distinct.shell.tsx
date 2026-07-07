// clone(B3): clone-a とは構造も className も異なる UI。誤検出されないべき（Jaccard < 0.9）。
import { AppHeader } from "@/shared/ui/AppHeader";

export function GammaHeader({ title }: { title: string }) {
  return (
    <header className="border-b pb-4">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <nav className="mt-3 flex items-center justify-between">
        <span>home</span>
        <span>about</span>
      </nav>
    </header>
  );
}
