"use client";

// ─── 时间统计看板 ───────────────────────────────────────────────
// 饼图（Donut）+ 自定义垂直列表，对标滴答清单 / Forest 统计页。
//
// 顶部：时间段选择 + 总览数据
// 中部：圆环饼图（无 Legend，保留 Tooltip）
// 底部：自定义滚动列表，颜色块 + 任务名 + 精确耗时

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useStore } from "@/lib/store";
import { getAllEvents } from "@/lib/db";
import {
  eventsToSessions,
  aggregateForPieChart,
  formatFocusDuration,
  type PeriodMode,
  type PieSliceData,
  type PieAggregation,
} from "@/lib/timeAggregation";

// ─── Period selector config ────────────────────────────────────

const PERIOD_OPTIONS: { key: PeriodMode; label: string }[] = [
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
  { key: "year", label: "本年" },
];

// ─── Custom Tooltip ────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: PieSliceData }>;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-100 px-3 py-2">
      <p className="text-xs font-medium text-gray-900 mb-0.5">
        {data.taskTitle}
      </p>
      <p className="text-xs text-gray-500">
        {formatFocusDuration(data.totalMs)}{" "}
        <span className="text-gray-400">
          ({data.percentage.toFixed(1)}%)
        </span>
      </p>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────

export default function TimeStatsChart() {
  const tasks = useStore((s) => s.tasks);
  const deleteRangeSessions = useStore((s) => s.deleteRangeSessions);
  const [mode, setMode] = useState<PeriodMode>("week");
  const [data, setData] = useState<PieAggregation | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const handleDeleteTask = useCallback(
    async (taskId: string) => {
      if (confirmingId !== taskId) {
        setConfirmingId(taskId);
        return;
      }
      setDeletingId(taskId);
      setConfirmingId(null);
      // Compute current period range
      const now = new Date();
      let startMs: number;
      let endMs: number;
      if (mode === "year") {
        startMs = new Date(now.getFullYear(), 0, 1).getTime();
        endMs = new Date(now.getFullYear() + 1, 0, 1).getTime();
      } else if (mode === "month") {
        startMs = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        endMs = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
      } else {
        // week
        const day = now.getDay();
        const mondayOffset = day === 0 ? -6 : 1 - day;
        const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
        monday.setHours(0, 0, 0, 0);
        startMs = monday.getTime();
        endMs = startMs + 7 * 24 * 60 * 60 * 1000;
      }
      try {
        await deleteRangeSessions(taskId, startMs, endMs);
      } catch {
        // fall through
      } finally {
        setDeletingId(null);
      }
    },
    [confirmingId, mode, deleteRangeSessions]
  );

  // Load events and compute aggregation
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const events = await getAllEvents();
        if (cancelled) return;
        const sessions = eventsToSessions(events, tasks);
        const result = aggregateForPieChart(sessions, mode);
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [mode, tasks]);

  // Pie chart data (recharts needs a `name` field for tooltip)
  const pieData = useMemo(
    () =>
      (data?.slices ?? []).map((s) => ({
        ...s,
        name: s.taskTitle,
        value: s.totalMs,
      })),
    [data]
  );

  // ── Loading state ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-muted">加载统计数据…</p>
      </div>
    );
  }

  // ── Empty state ──────────────────────────────────────────────
  if (!data || data.slices.length === 0) {
    return (
      <div className="space-y-4">
        {/* Period tabs */}
        <PeriodTabs mode={mode} onChange={setMode} />
        <div className="card p-10 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-sm font-medium text-gray-700 mb-1">
            暂无专注数据
          </p>
          <p className="text-xs text-muted-light">
            开始专注后，这里会展示你的时间统计。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Period selector tabs ──────────────────────────────── */}
      <PeriodTabs mode={mode} onChange={setMode} />

      <div className="card p-5 space-y-5">
        {/* ── Header summary ─────────────────────────────────── */}
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            {data.periodLabel}
          </h3>
          <p className="text-sm text-gray-500">
            专注{" "}
            <span className="font-semibold text-gray-900">
              {formatFocusDuration(data.totalMs)}
            </span>
          </p>
        </div>

        {/* ── Donut chart ────────────────────────────────────── */}
        <div className="flex justify-center">
          <div style={{ width: 220, height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={62}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                  onMouseEnter={(_, index) => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                  animationBegin={0}
                  animationDuration={500}
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={entry.taskId}
                      fill={entry.color}
                      opacity={
                        activeIndex === null || activeIndex === index ? 1 : 0.4
                      }
                    />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Center label (total under donut hole) ──────────── */}
        <div className="flex justify-center -mt-4">
          <p className="text-xs text-gray-400">
            {data.slices.length} 个任务
          </p>
        </div>

        {/* ── Custom list legend ─────────────────────────────── */}
        <div className="space-y-0 divide-y divide-gray-50">
          {data.slices.map((slice, index) => {
            const isConfirming = confirmingId === slice.taskId;
            const isDeleting = deletingId === slice.taskId;
            return (
              <div
                key={slice.taskId}
                className={`flex items-center gap-3.5 py-3 first:pt-0 last:pb-0 cursor-default group ${
                  isDeleting ? "opacity-30 pointer-events-none" : ""
                }`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseLeave={() => setActiveIndex(null)}
              >
                {/* Color block */}
                <div
                  className="w-10 h-10 rounded-lg shrink-0 transition-transform duration-150"
                  style={{
                    backgroundColor: slice.color,
                    transform:
                      activeIndex === index ? "scale(1.08)" : "scale(1)",
                  }}
                />

                {/* Text content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">
                    {slice.taskTitle}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatFocusDuration(slice.totalMs)}
                  </p>
                </div>

                {/* Percentage + Delete */}
                <div className="text-right shrink-0 flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-gray-700">
                    {slice.percentage.toFixed(1)}%
                  </p>

                  {/* Delete button — hidden for "Others" */}
                  {slice.taskId !== "__others__" &&
                    (isConfirming ? (
                      <span className="inline-flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTask(slice.taskId);
                          }}
                          className="text-xs rounded-full px-2 py-0.5 bg-red-500 text-white hover:bg-red-600 transition-all"
                        >
                          确认删除？
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmingId(null);
                          }}
                          className="text-xs text-gray-400 hover:text-gray-600 rounded-full px-1.5 py-0.5 transition-all"
                        >
                          取消
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTask(slice.taskId);
                        }}
                        title="删除此任务的时间记录"
                        className="text-xs rounded-full px-2 py-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        ✕
                      </button>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Period Tabs Sub-component ──────────────────────────────────

function PeriodTabs({
  mode,
  onChange,
}: {
  mode: PeriodMode;
  onChange: (m: PeriodMode) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
            mode === opt.key
              ? "bg-gray-900 text-white"
              : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
