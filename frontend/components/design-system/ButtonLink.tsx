import Link from "next/link";
import type { ComponentProps } from "react";
import { buttonClassName, type ButtonVariant } from "./Button";

/**
 * Design System V2 — navigational counterpart to Button. Renders a real
 * `next/link` (correct semantics/accessibility for "go to a page", and
 * required — an `<a>` cannot be nested inside a `<button>`), styled
 * identically via the shared `buttonClassName` helper.
 */
export interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
}

export default function ButtonLink({ variant = "primary", className = "", ...props }: ButtonLinkProps) {
  return <Link className={buttonClassName(variant, className)} {...props} />;
}
