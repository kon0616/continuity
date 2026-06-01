"use client";

// ─── 甘特图 — 长线任务规划视图 ───────────────────────────────
// 纯 Tailwind CSS 实现，无第三方图表库依赖。
// 横向展示每个任务从首次专注到最近活动的时间跨度。
// 红色竖线标记「今天」。

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import type { GanttTaskData } from "@/lib/snapshots";

// ─── Constants ───────────────────────────────────────────────

const LEFT_COL_WIDTH = 160; // px — task name column
const ROW_HEIGHT = 36; // px — each task row
const HEADER_HEIGHT = 48; // px — month/day header
const BAR_HEIGHT = 18; // px — bar thickness

export default function GanttChart() {
  const ganttTasks = useStore((s) => s.ganttTasks);

  // Compute the time domain
  const { timeDomain, dayCount, msPerPixel } = useMemo(() => {
    if (!ganttTasks || ganttTasks.length === 0) {
      return { timeDomain: null, dayCount: 0, msPerPixel: 0 };
    }

    const today = Date.now();
    let minTs = Math.min(...ganttTasks.map((t) => t.startedAt));
    let maxTs = Math.max(
      ...ganttTasks.map((t) => t.lastActivityAt),
      today
    );

    // Ensure at least 7 days of range and pad 1 day on each side
    const padMs = 24 * 60 * 60 * 1000;
    minTs -= padMs;
    maxTs += padMs;

    const rangeMs = maxTs - minTs;
    // Available width = 100% of container minus left column
    // We'll calculate pixels client-side via container ref; for now use 0
    return {
      timeDomain: { min: minTs, max: maxTs, rangeMs },
      dayCount: Math.ceil(rangeMs / (24 * 60 * 60 * 1000)),
      msPerPixel: 0, // computed at render time with container width
    };
  }, [ganttTasks]);

  // Empty state
  if (!timeDomain || ganttTasks.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-muted">暂无活跃任务。</p>
        <p className="text-xs text-muted-light mt-1">
          创建任务并开始专注后，这里会显示任务时间跨度。
        </p>
      </div>
    );
  }

  return (
    <GanttChartInner
      tasks={ganttTasks}
      timeDomain={timeDomain}
      dayCount={dayCount}
    />
  );
}

// ─── Inner component — uses container ref for pixel math ──────

function GanttChartInner({
  tasks,
  timeDomain,
  dayCount,
}: {
  tasks: GanttTaskData[];
  timeDomain: { min: number; max: number; rangeMs: number };
  dayCount: number;
}) {
  // We use a fixed pixel-per-day ratio for simplicity.
  // Min 4px per day, max 40px per day, scaled by dayCount.
  const pxPerDay = Math.max(4, Math.min(40, 600 / dayCount));
  const totalChartWidth = dayCount * pxPerDay;

  const { min, rangeMs } = timeDomain;

  const msToX = (ts: number): number => {
    return ((ts - min) / rangeMs) * totalChartWidth;
  };

  const msToWidth = (ms: number): number => {
    return Math.max(4, (ms / rangeMs) * totalChartWidth);
  };

  // ═══ Today at local noon — aligns with day-tick grid ═══
  const now = new Date();
  const todayLocalNoon = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    12, 0, 0
  ).getTime();
  const todayX = msToX(todayLocalNoon);

  // Generate day ticks (every 1-7 days depending on density)
  const tickInterval = dayCount > 60 ? 7 : dayCount > 14 ? 3 : 1;
  const dayTicks: Array<{ label: string; x: number; isMonthStart: boolean }> = [];
  const monthLabels: Array<{ label: string; x: number; width: number }> = [];

  let currentMonth = -1;
  let monthStartX = 0;

  for (let i = 0; i <= dayCount; i += tickInterval) {
    // Each tick is at local noon of that day
    const ts = min + i * 24 * 60 * 60 * 1000;
    const d = new Date(ts);
    const x = msToX(ts);
    const month = d.getMonth();
    const day = d.getDate();

    if (month !== currentMonth) {
      if (currentMonth >= 0) {
        monthLabels.push({
          label: `${currentMonth + 1} 月`,
          x: monthStartX,
          width: x - monthStartX,
        });
      }
      currentMonth = month;
      monthStartX = x;
    }

    dayTicks.push({
      label: `${day}`,
      x,
      isMonthStart: i === 0 || day === 1,
    });
  }

  // Final month label
  if (currentMonth >= 0) {
    monthLabels.push({
      label: `${currentMonth + 1} 月`,
      x: monthStartX,
      width: totalChartWidth - monthStartX,
    });
  }

  return (
    <div className="card overflow-hidden">
      {/* ── Month scale header ─────────────────────────────── */}
      <div
        className="flex border-b border-gray-100"
        style={{ paddingLeft: LEFT_COL_WIDTH }}
      >
        <div
          className="relative"
          style={{ width: totalChartWidth, height: 24 }}
        >
          {monthLabels.map((m, i) => (
            <div
              key={i}
              className="absolute text-xs font-medium text-gray-500 border-l border-gray-200 pl-1"
              style={{ left: m.x, width: m.width, top: 4 }}
            >
              {m.label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Day ticks ──────────────────────────────────────── */}
      <div
        className="flex border-b border-gray-100"
        style={{ paddingLeft: LEFT_COL_WIDTH }}
      >
        <div
          className="relative"
          style={{ width: totalChartWidth, height: 20 }}
        >
          {dayTicks.map((tick, i) => (
            <div
              key={i}
              className="absolute text-[10px] text-muted-light"
              style={{ left: tick.x - 8, top: 2, width: 20, textAlign: "center" }}
            >
              {tick.label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Today marker ───────────────────────────────────── */}
      {todayX >= 0 && todayX <= totalChartWidth && (
        <div className="relative" style={{ paddingLeft: LEFT_COL_WIDTH }}>
          <div
            className="absolute top-0 bottom-0 w-px bg-red-400 z-10"
            style={{ left: todayX }}
          >
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-medium text-red-500 whitespace-nowrap">
              今天
            </span>
          </div>
        </div>
      )}

      {/* ── Task rows ──────────────────────────────────────── */}
      <div className="relative">
        {/* Today line through all rows */}
        {todayX >= 0 && todayX <= totalChartWidth && (
          <div
            className="absolute top-0 bottom-0 w-px bg-red-200/60 z-5 pointer-events-none"
            style={{ left: LEFT_COL_WIDTH + todayX }}
          />
        )}

        {tasks.map((task) => {
          const barX = msToX(task.startedAt);
          const barW = msToWidth(task.lastActivityAt - task.startedAt);
          const isActive = task.status === "active";
          const isManual = task.isManuallyScheduled;

          // Tooltip text
          const tooltipLines: string[] = [task.title];
          if (isManual && task.scheduledStartDate) {
            tooltipLines.push(`📅 ${task.scheduledStartDate} → ${task.scheduledEndDate ?? "至今"}`);
          }
          tooltipLines.push(`专注 ${formatMs(task.totalFocusMs)} · ${task.sessionCount} 次会话`);
          if (isManual) tooltipLines.push("（手动排期）");

          return (
            <div
              key={task.taskId}
              className="flex border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
              style={{ height: ROW_HEIGHT }}
            >
              {/* Task name + schedule indicator */}
              <div
                className="flex items-center px-3 border-r border-gray-100 shrink-0 overflow-hidden gap-1.5"
                style={{ width: LEFT_COL_WIDTH }}
              >
                {isManual && (
                  <span className="text-[10px] shrink-0" title="手动排期">
                    📅
                  </span>
                )}
                <span
                  className="text-xs text-gray-700 truncate"
                  title={task.title}
                >
                  {task.title}
                </span>
              </div>

              {/* Bar area */}
              <div className="relative flex-1" style={{ height: ROW_HEIGHT }}>
                <div
                  className={`absolute rounded-full transition-colors cursor-default ${
                    isManual
                      ? isActive
                        ? "bg-accent/80 border-2 border-accent hover:bg-accent"
                        : "bg-gray-300 border-2 border-gray-400 hover:bg-gray-400"
                      : isActive
                        ? "bg-accent/60 hover:bg-accent"
                        : "bg-gray-200 hover:bg-gray-300"
                  }`}
                  style={{
                    left: barX,
                    top: (ROW_HEIGHT - BAR_HEIGHT) / 2,
                    width: barW,
                    height: BAR_HEIGHT,
                    // Dashed-like effect for manual-only-start (no end date set)
                    borderStyle: isManual ? "solid" : undefined,
                  }}
                  title={tooltipLines.join("\n")}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Legend ──────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 text-xs text-muted-light flex-wrap">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-accent/80 border-2 border-accent inline-block" />
          进行中
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-gray-300 border-2 border-gray-400 inline-block" />
          已完成
        </span>
        <span className="flex items-center gap-1">
          <span className="w-px h-3 bg-red-400 inline-block" />
          今天
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-light">
          仅显示手动设定过日期的任务
        </span>
      </div>
    </div>
  );
}

function formatMs(ms: number): string {
  if (!ms || ms <= 0) return "不到 1 分钟";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} 分钟`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (m > 0) return `${h} 小时 ${m} 分钟`;
  return `${h} 小时`;
}
