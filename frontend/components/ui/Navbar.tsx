"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="fixed left-64 right-0 top-0 z-40 flex h-20 items-center justify-end bg-transparent px-8">
      {user && (
        <div className="flex items-center gap-4">
          <Link
            href="/profile"
            className="rounded-md px-2 py-1 font-mono text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-slate-100"
          >
            {user.full_name} <span className="text-slate-500">· {user.role}</span>
          </Link>
          <button
            onClick={logout}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 font-mono text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
          >
            <LogOut size={16} />
            Выйти
          </button>
        </div>
      )}
    </header>
  );
}
