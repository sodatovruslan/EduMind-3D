/**
 * Design System V2 §6/§26 — the floating glass surface: navigation, HUD,
 * AI Teacher, guided-experiment steps, modals/overlays. Backed by the
 * `.ds-glass` utility (app/globals.css) which composes blur + translucent
 * background + hairline border from the semantic surface/border tokens, so
 * it adapts to Light/Dark/System automatically. Never nest a GlassPanel
 * inside another GlassPanel (§6).
 */
export type GlassPanelProps = React.HTMLAttributes<HTMLDivElement>;

export default function GlassPanel({ className = "", ...props }: GlassPanelProps) {
  return <div className={`ds-glass rounded-ds-panel shadow-ds-md ${className}`} {...props} />;
}
