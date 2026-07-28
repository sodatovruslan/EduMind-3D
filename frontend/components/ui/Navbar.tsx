"use client";

import { Box, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
      <div className="flex items-center gap-2 text-lg font-bold text-brand">
        <Box size={22} />
        EduMind 3D
      </div>

      {user && (
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            {user.full_name} · <span className="text-gray-400">{user.role}</span>
          </span>
          {/* TODO: заменить на dropdown-меню профиля, когда появятся настройки аккаунта */}
          <button
            onClick={logout}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            <LogOut size={16} />
            Выйти
          </button>
        </div>
      )}
    </header>
  );
}
