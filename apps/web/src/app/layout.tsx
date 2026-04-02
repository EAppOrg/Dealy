import type { Metadata } from "next";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dealy",
  description: "Shopping intelligence platform — find, compare, and monitor the best deals",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Sidebar />
        <div className="pl-64">
          <Header />
          <main className="p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
