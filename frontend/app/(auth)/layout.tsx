export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-deep px-4">
      {/* размытые цветные "orb" на фоне — как в макете Stitch */}
      <div className="pointer-events-none absolute -left-48 -top-48 h-[600px] w-[600px] rounded-full bg-brand/20 blur-[100px]" />
      <div className="pointer-events-none absolute bottom-12 right-12 h-[400px] w-[400px] rounded-full bg-neon-cyan/10 blur-[100px]" />

      <div className="glass-panel rim-light relative z-10 w-full max-w-sm rounded-xl p-8">{children}</div>
    </div>
  );
}
