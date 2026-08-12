"use client";

import { forwardRef } from "react";

/**
 * Design System V2 (EDUMIND_DESIGN_SYSTEM_V2.md §14/§27) — shared Button
 * primitive. Uses only semantic tokens (bg-accent/bg-surface/text-*, etc.)
 * so it renders correctly in Light/Dark/System without any per-page theme
 * logic. Used across Profile, Auth, Dashboard, Teacher/Classes and more.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:brightness-110 active:brightness-95",
  secondary:
    "bg-surface-elevated text-text-primary border border-border/10 hover:bg-surface-elevated/80",
  ghost: "bg-transparent text-text-secondary hover:bg-text-primary/5 hover:text-text-primary",
};

// Shared with ButtonLink (D2 — navigational CTAs need identical styling to
// the <button> element below, but must render a real <a>/<Link> for
// semantics/accessibility, not a button wrapping a link). Single source of
// truth for the visual so the two never drift.
export function buttonClassName(variant: ButtonVariant, className = ""): string {
  return `ds-focus-ring inline-flex items-center justify-center gap-2 rounded-ds-control px-4 py-2 text-ds-body font-medium transition-all duration-200 ease-ds-standard disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANT_CLASSES[variant]} ${className}`;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", className = "", disabled, ...props },
  ref
) {
  return <button ref={ref} disabled={disabled} className={buttonClassName(variant, className)} {...props} />;
});

export default Button;
