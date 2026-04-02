"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: string;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: "H" },
  { label: "Alerts", href: "/alerts", icon: "!" },
  { label: "Preferences", href: "/preferences", icon: "P" },
  { label: "Sources", href: "/admin/sources", icon: "S", adminOnly: true },
  { label: "Runs", href: "/admin/runs", icon: "R", adminOnly: true },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {navItems.map((item) => {
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-brand-50 text-brand-700"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded text-xs font-bold",
                isActive
                  ? "bg-brand-600 text-white"
                  : "bg-gray-200 text-gray-600"
              )}
            >
              {item.icon}
            </span>
            {item.label}
            {item.adminOnly && (
              <span className="ml-auto text-[10px] uppercase tracking-wider text-gray-400">
                admin
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
