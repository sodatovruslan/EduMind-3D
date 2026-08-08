"use client";

/**
 * Design System V2 — D1 visual proof (EDUMIND_DESIGN_SYSTEM_V2.md §27).
 * Internal, dev-only route demonstrating the foundational tokens/primitives
 * in isolation before any real page migrates onto them. Sibling to
 * (dev)/sandbox-prototype, does not replace or modify it. Not linked from
 * any authenticated navigation.
 */
import { Button, GlassPanel, Surface, ThemeToggle } from "@/components/design-system";

export default function DesignPreviewPage() {
  return (
    <div className="min-h-screen bg-background p-8 text-text-primary transition-colors duration-200 ease-ds-standard">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-ds-display">Design System V2</h1>
            <p className="text-ds-body text-text-secondary">D1 — foundational tokens &amp; primitives (visual proof)</p>
          </div>
          <ThemeToggle />
        </header>

        <section aria-labelledby="typography-heading" className="flex flex-col gap-2">
          <h2 id="typography-heading" className="text-ds-title">
            Typography
          </h2>
          <p className="text-ds-display">Display text</p>
          <p className="text-ds-title">Title text</p>
          <p className="text-ds-body">Body text — обычный текст для инструкций и контента.</p>
          <p className="text-ds-caption uppercase tracking-widest text-text-muted">Caption / eyebrow text</p>
        </section>

        <section aria-labelledby="buttons-heading" className="flex flex-col gap-3">
          <h2 id="buttons-heading" className="text-ds-title">
            Buttons &amp; focus state
          </h2>
          <p className="text-ds-caption text-text-muted">Tab to the buttons below to see the focus ring.</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
          </div>
        </section>

        <section aria-labelledby="accent-heading" className="flex flex-col gap-3">
          <h2 id="accent-heading" className="text-ds-title">
            Accent &amp; semantic colors
          </h2>
          <div className="flex flex-wrap gap-3">
            {[
              { label: "Accent", cls: "bg-accent" },
              { label: "Success", cls: "bg-success" },
              { label: "Warning", cls: "bg-warning" },
              { label: "Danger", cls: "bg-danger" },
              { label: "Physics", cls: "bg-accent-physics" },
              { label: "Chemistry", cls: "bg-accent-chemistry" },
              { label: "Geo", cls: "bg-accent-geo" },
            ].map(({ label, cls }) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <div className={`h-12 w-12 rounded-ds-control ${cls}`} />
                <span className="text-ds-caption text-text-muted">{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="surfaces-heading" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h2 id="surfaces-heading" className="text-ds-title">
              Solid Surface (§26 — dense/text content)
            </h2>
            <Surface elevated className="p-5">
              <p className="text-ds-body">
                Solid, opaque, fully readable — for tables, forms, reports. No blur, no translucency.
              </p>
            </Surface>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-ds-title">Glass Panel (§6/§26 — floating chrome)</h2>
            {/* rendered over a gradient so the blur/translucency is visible */}
            <div className="rounded-ds-panel bg-gradient-to-br from-accent/40 via-accent-chemistry/30 to-accent-geo/40 p-5">
              <GlassPanel className="p-5">
                <p className="text-ds-body">
                  Translucent, blurred, hairline border — for nav, AI Teacher, guided-step cards, HUD.
                </p>
              </GlassPanel>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
