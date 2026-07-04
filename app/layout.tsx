// ─── Root Layout ─────────────────────────────────────────────
// Minimal shell — the app is a single-page experience
// with an optional timeline view. PWA-ready.

import type { Metadata } from "next";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "Continuity — 任务管理",
  description: "基于连续性的任务管理系统，在中断后保持上下文的完整性。",
  manifest: "/manifest.webmanifest?v=2",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Continuity",
  },
};

export const viewport = {
  themeColor: "#1e293b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen">
        <ServiceWorkerRegister />

        {/* App header — minimal, low cognitive load */}
        <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between">
            <a
              href="/"
              className="text-sm font-semibold text-gray-900 hover:text-accent transition-colors"
            >
              Continuity
            </a>
            <nav className="flex items-center gap-3">
              <a
                href="/"
                className="text-xs text-muted hover:text-gray-900 transition-colors"
              >
                专注面板
              </a>
              <a
                href="/timeline"
                className="text-xs text-muted hover:text-gray-900 transition-colors"
              >
                时间线
              </a>
            </nav>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-2xl mx-auto px-4 py-8">{children}</main>

        {/* Footer — almost invisible */}
        <footer className="max-w-2xl mx-auto px-4 py-8 text-center">
          <p className="text-xs text-muted-light">
            所有数据仅存储在你的浏览器本地。
          </p>
        </footer>
      </body>
    </html>
  );
}
