/**
 * Shared DOM input-focus helpers. `isTypingTarget` existed as three
 * independent, slightly-drifted copies (SandboxLocomotionController.tsx,
 * ChemistryInteractionProvider.tsx, SandboxModeOverlay.tsx) before this
 * extraction — a small, genuine primitive worth sharing once a fourth
 * caller (Electricity Lab's own locomotion/interaction) needed the exact
 * same check, per the explicit instruction to extract small shared
 * primitives rather than duplicate them again.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return true;
  return false;
}
