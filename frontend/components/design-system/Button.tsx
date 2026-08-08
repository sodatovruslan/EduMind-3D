"use client";

import { forwardRef } from "react";

/**
 * Design System V2 (EDUMIND_DESIGN_SYSTEM_V2.md §14/§27) — shared Button
 * primitive. Uses only semantic tokens (bg-accent/bg-surface/text-*, etc.)
 * so it renders correctly in Light/Dark/System without any per-page theme
 * logic. Not wired into any existing page yet (see §15/§25 — additive-only
 * for D1); consumed today only by the (dev) visual-proof page.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:brightness-110 active:brightness-95",
  secondary:
    "bg-surface-elevated text-text-primary border border-border/10 hover:bg-surface-elevated/80",
  ghost: "bg-transparent text-text-secondary hover:bg-text-primary/5 hover:text-text-primary",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", className = "", disabled, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled}
      className={`ds-focus-ring inline-flex items-center justify-center gap-2 rounded-ds-control px-4 py-2 text-ds-body font-medium transition-all duration-200 ease-ds-standard disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
      {...props}
    />
  );
});

export default Button;
