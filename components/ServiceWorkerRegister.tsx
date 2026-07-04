"use client";

// ─── Service Worker Registration ──────────────────────────────
// Registers the PWA service worker on mount.
// Only runs in production to avoid caching issues in dev.

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      navigator.serviceWorker.register("/sw.js").then(
        (registration) => {
          console.log("SW registered:", registration.scope);
        },
        (err) => {
          console.log("SW registration failed:", err);
        }
      );
    }
  }, []);

  return null;
}
