/**
 * Design System V2 §26 — the solid, opaque, highly-readable counterpart to
 * GlassPanel. Use for dense/text-heavy/data content (tables, forms, reports,
 * long-form text) where translucency would hurt readability, per the
 * glassmorphism rules in EDUMIND_DESIGN_SYSTEM_V2.md §26.
 */
export interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
}

export default function Surface({ elevated = false, className = "", ...props }: SurfaceProps) {
  return (
    <div
      className={`rounded-ds-panel border border-border/[0.08] ${
        elevated ? "bg-surface-elevated shadow-ds-sm" : "bg-surface"
      } ${className}`}
      {...props}
    />
  );
}
