import { cn } from "@/lib/utils";

/** shimmer 자리표시자. prefers-reduced-motion 이면 애니메이션 정지. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-md bg-surface-2",
        "[background-image:linear-gradient(90deg,var(--color-surface-2)_25%,var(--color-border)_37%,var(--color-surface-2)_63%)]",
        "[background-size:400%_100%] [animation:shimmer_1.4s_ease_infinite] motion-reduce:[animation:none]",
        className,
      )}
    />
  );
}
