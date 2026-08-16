import MinimalShell from "@/components/appshell/MinimalShell";

// D4 — route group only, does not change any URL (Next.js strips the
// `(immersive)` segment). Chemistry World / Electricity Lab / GeoWorld /
// SimLab moved here from app/(app)/ so a permanent nav rail never consumes
// their 3D viewport — see EDUMIND_DESIGN_SYSTEM_V2.md D4 notes.
export default function ImmersiveLayout({ children }: { children: React.ReactNode }) {
  return <MinimalShell>{children}</MinimalShell>;
}
