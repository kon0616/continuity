// ─── PWA Manifest ──────────────────────────────────────────────
// Enables "Install as App" on desktop and mobile browsers.
// Next.js App Router picks this up automatically as a route.

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Continuity — 任务管理",
    short_name: "Continuity",
    description: "基于连续性的任务管理系统，在中断后保持上下文的完整性。",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1e293b",
    orientation: "any",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
