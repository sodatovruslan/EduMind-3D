import StandardAppShell from "@/components/appshell/StandardAppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <StandardAppShell>{children}</StandardAppShell>;
}
