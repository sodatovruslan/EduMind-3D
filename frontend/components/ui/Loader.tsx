// D9 — full-screen fallback for the initial auth check (ProtectedRoute) and
// any route-level "still fetching" gate. Individual sections that already
// have real content around them (Dashboard/Teacher cards, etc.) use
// `Skeleton` instead — this stays a spinner only for the "nothing is on
// screen yet" case, retuned off the legacy `border-brand` token onto
// `border-accent` so it's theme-correct in Light Mode too.
export default function Loader() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
    </div>
  );
}
