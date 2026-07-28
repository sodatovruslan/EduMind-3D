"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users } from "lucide-react";
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
    <nav className="w-56 shrink-0 border-r border-gray-200 bg-white p-4">
      <ul className="space-y-1">
        {links.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                  isActive ? "bg-brand/10 text-brand font-medium" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <Icon size={18} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
