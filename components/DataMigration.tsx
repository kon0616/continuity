"use client";

// ─── 数据迁移 ─────────────────────────────────────────────────
// 导出/导入 IndexedDB 数据，用于跨域名迁移。
// IndexedDB 是域名隔离的，更换部署域名后旧数据无法自动迁移。

import { useState, useRef } from "react";
import { exportData, importData } from "@/lib/db";
import { useStore } from "@/lib/store";

export default function DataMigration() {
  const refresh = useStore((s) => s.refresh);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleExport = async () => {
    try {
      await exportData();
      setMessage("✅ 数据已导出，请保存好备份文件。");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(`❌ 导出失败：${msg}`);
    }
    // Auto-clear message after 5s
    setTimeout(() => setMessage(null), 5000);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (
      !confirm(
        "⚠️ 导入将覆盖当前所有数据，此操作不可撤销。\n\n确认继续？"
      )
    ) {
      // Reset file input so the same file can be re-selected
      e.target.value = "";
      return;
    }

    setImporting(true);
    try {
      await importData(file);
      await refresh();
      setMessage("✅ 数据导入成功，页面即将刷新…");
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessage(`❌ 导入失败：${msg}`);
      setImporting(false);
    }
    // Reset file input
    e.target.value = "";
  };

  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">📦 数据迁移</h3>
      <p className="text-xs text-muted mb-3">
        所有数据存储在浏览器本地（IndexedDB），更换域名或浏览器时需要手动迁移。
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={handleExport}
          className="btn-secondary text-xs py-1.5 px-3"
        >
          📤 导出备份
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="btn-secondary text-xs py-1.5 px-3"
        >
          {importing ? "⏳ 导入中…" : "📥 导入数据"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          className="hidden"
        />
      </div>
      {message && (
        <p className="text-xs text-muted mt-3 animate-fade-in">{message}</p>
      )}
    </div>
  );
}
