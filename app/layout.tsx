import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

import AppShell from "@/components/app-shell/app-shell";

export const metadata: Metadata = {
  title: "Personal Finance",
  description: "Personal Finance Management",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({
  children,
}: RootLayoutProps) {
  return (
    <html lang="ko">
      <body className="min-h-screen">
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
