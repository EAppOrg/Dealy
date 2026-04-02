"use client";

import { signOut } from "next-auth/react";

export function Header({ userName }: { userName: string }) {
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div />
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-500">{userName}</span>
        <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center text-sm font-medium text-brand-700">
          {initials}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
