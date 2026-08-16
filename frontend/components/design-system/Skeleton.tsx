/**
 * Design System V2 — lightweight loading placeholder (§17: skeletons, not
 * giant spinners or blank flashes). Plain CSS pulse, respects
 * `prefers-reduced-motion` via Tailwind's `motion-reduce:` variant.
 */
export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

export default function Skeleton({ className = "", ...props }: SkeletonProps) {
  return <div className={`animate-pulse motion-reduce:animate-none rounded-ds-control bg-text-primary/10 ${className}`} {...props} />;
}
