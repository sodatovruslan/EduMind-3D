"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Box, LayoutDashboard, Users } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const studentLinks = [{ href: "/dashboard", label: "Мои симуляции", icon: LayoutDashboard }];

const teacherLinks = [
  { href: "/dashboard", label: "Мои симуляции", icon: LayoutDashboard },
  { href: "/teacher", label: "Ученики", icon: Users },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const links = user?.role === "teacher" || user?.role === "admin" ? teacherLinks : studentLinks;

  return (
    <aside className="fixed left-0 top-0 z-50 flex h-screen w-64 shrink-0 flex-col border-r border-glass-border bg-surface-slate/60 py-6 backdrop-blur-xl">
      <div className="mb-10 px-6">
        <div className="flex items-center gap-2 font-headline text-lg font-bold tracking-tight text-slate-100">
          <Box className="text-brand" size={22} />
          EduMind 3D
        </div>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-brand/80">3D Learning Platform</p>
      </div>

      <nav className="flex-1 space-y-1">
        {links.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-6 py-3 font-mono text-sm transition-colors ${
                isActive
                  ? "border-l-2 border-brand bg-brand/10 text-brand shadow-[0_0_10px_rgba(99,102,241,0.2)]"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
