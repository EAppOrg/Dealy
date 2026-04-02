import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dealy",
  description:
    "Shopping intelligence platform — find, compare, and monitor the best deals",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const isAuthenticated = !!session?.user;

  return (
    <html lang="en">
      <body>
        <SessionProvider session={session}>
          {isAuthenticated ? (
            <>
              <Sidebar />
              <div className="pl-64">
                <Header
                  userName={session.user?.name ?? session.user?.email ?? "User"}
                />
                <main className="p-6">{children}</main>
              </div>
            </>
          ) : (
            <main>{children}</main>
          )}
        </SessionProvider>
      </body>
    </html>
  );
}
