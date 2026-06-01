"use client";

// ─── 时间线页面 ───────────────────────────────────────────────
// 上半区：甘特图（长线任务规划视图）
// 下半区：按天聚合的历史节点流水账

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import GanttChart from "@/components/GanttChart";
import TimelineView from "@/components/Timeline";

export default function TimelinePage() {
  const initialize = useStore((s) => s.initialize);
  const isLoading = useStore((s) => s.isLoading);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <div className="space-y-8">
      {/* 页面标题 */}
      <section>
        <h1 className="text-lg font-semibold text-gray-900 mb-1">
          时间线
        </h1>
        <p className="text-sm text-muted">
          长线任务规划 + 每日专注记录。
        </p>
      </section>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-accent" />
            <p className="text-sm text-muted">加载中…</p>
          </div>
        </div>
      ) : (
        <>
          {/* ── 上半区：甘特图 ──────────────────────────────── */}
          <section>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
              任务时间跨度
            </h2>
            <GanttChart />
          </section>

          {/* ── 下半区：历史节点流水账 ──────────────────────── */}
          <section>
            <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
              每日记录
            </h2>
            <TimelineView />
          </section>
        </>
      )}
    </div>
  );
}
