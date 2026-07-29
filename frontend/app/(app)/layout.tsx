import ProtectedRoute from "@/components/ProtectedRoute";
import Navbar from "@/components/ui/Navbar";
import Sidebar from "@/components/ui/Sidebar";
import { QualityProvider } from "@/lib/quality-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <QualityProvider>
        <div className="min-h-screen bg-surface-deep">
          <Sidebar />
          <Navbar />
          <main className="ml-64 min-h-screen p-8 pt-24">{children}</main>
        </div>
      </QualityProvider>
    </ProtectedRoute>
  );
}
