"use client";

// ─── 聚合时间线 ───────────────────────────────────────────────
// 按「自然日 + 任务」两层聚合，参考 GitHub 贡献图 / 即刻时间线设计。
//
// 规则：
//  • 隐藏所有 SESSION_STARTED（噪音）
//  • 每天每个任务只突出展示 RESTART_NOTE_FILED 和 TASK_COMPLETED
//  • SESSION_ENDED 仅用于计算当天该任务的专注时长
//  • 左侧主线 + 右侧摘要卡片

import { useStore } from "@/lib/store";
import type { DayTimelineGroup, TaskDaySummary } from "@/lib/snapshots";

export default function Timeline() {
  const dayTimeline = useStore((s) => s.dayTimeline);

  // ═══ DEFENSIVE: empty or undefined → elegant empty state ═══
  if (!dayTimeline || dayTimeline.length === 0) {
    return (
      <div className="card p-10 text-center">
        <div className="text-4xl mb-4">📋</div>
        <p className="text-sm font-medium text-gray-700 mb-1">
          目前还没有留下任何专注线索
        </p>
        <p className="text-xs text-muted-light">
          快去开启你的第一个 Session，结束时会提示你留下恢复线索。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {dayTimeline.map((day, dayIndex) => {
        // Guard: skip malformed day entries
        if (!day || !day.date || !Array.isArray(day.tasks)) return null;
        return (
          <DayBlock
            key={day.date}
            day={day}
            isLast={dayIndex === dayTimeline.length - 1}
          />
        );
      })}
    </div>
  );
}

// ─── 单日区块 ─────────────────────────────────────────────────

function DayBlock({
  day,
  isLast,
}: {
  day: DayTimelineGroup;
  isLast: boolean;
}) {
  // ═══ DEFENSIVE: guard against missing tasks array ═══
  const tasks = Array.isArray(day.tasks) ? day.tasks : [];
  const totalFocusMs = tasks.reduce((sum, t) => sum + (t?.totalFocusMs ?? 0), 0);
  const totalSessions = tasks.reduce((sum, t) => sum + (t?.sessionCount ?? 0), 0);

  // Determine dot color from the day's content
  const dotClass = tasks.some((t) => t?.wasCompleted)
    ? "bg-green-400 border-green-400"
    : tasks.some((t) => t?.restartNote)
      ? "bg-blue-400 border-blue-400"
      : "bg-gray-300 border-gray-300";

  return (
    <div className="relative">
      {!isLast && (
        <div className="absolute left-[5px] top-8 bottom-0 w-px bg-gray-150" />
      )}

      <div className="flex gap-4 pb-6">
        {/* 左侧日期标记 */}
        <div className="relative z-10 flex flex-col items-center shrink-0 w-6 pt-1">
          <div className={`h-2.5 w-2.5 rounded-full border-2 ${dotClass}`} />
        </div>

        {/* 右侧内容 */}
        <div className="flex-1 min-w-0">
          {/* 日期标题行 */}
          <div className="flex items-baseline gap-2 mb-3">
            <h3 className="text-sm font-semibold text-gray-800">
              {formatDateLabel(day.date)}
            </h3>
            {totalSessions > 0 && (
              <span className="text-xs text-muted-light">
                {totalSessions} 次专注 · {formatDuration(totalFocusMs)}
              </span>
            )}
          </div>

          {/* 该日内的任务卡片 */}
          <div className="space-y-2">
            {tasks.map((task) => {
              if (!task || !task.taskId) return null;
              return <TaskDayCard key={task.taskId} task={task} />;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 单任务卡片（日内）────────────────────────────────────────

function TaskDayCard({ task }: { task: TaskDaySummary }) {
  // ═══ DEFENSIVE: ensure mandatory fields exist ═══
  if (!task) return null;
  const title = task.taskTitle ?? task.taskId ?? "未知任务";
  const note = task.restartNote ?? null;
  const completed = task.wasCompleted ?? false;

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        completed
          ? "bg-green-50/50 border-green-100"
          : note
            ? "bg-blue-50/50 border-blue-100"
            : "bg-gray-50 border-gray-100"
      }`}
    >
      {/* 任务标题 + 状态 */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-medium truncate ${
                completed ? "text-gray-500 line-through" : "text-gray-800"
              }`}
            >
              {title}
            </span>
          </div>

          {(task.totalFocusMs ?? 0) > 0 && (
            <span className="text-xs text-muted-light mt-0.5">
              专注 {formatDuration(task.totalFocusMs ?? 0)}
            </span>
          )}
        </div>

        {/* 状态标签 */}
        <div className="shrink-0">
          {completed ? (
            <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-100 rounded-full px-2 py-0.5">
              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
                <path
                  d="M3.5 6L5.5 8L8.5 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              已完成
            </span>
          ) : note ? (
            <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-100 rounded-full px-2 py-0.5">
              📋 有线索
            </span>
          ) : null}
        </div>
      </div>

      {/* ═══ 恢复线索摘要 — only render if content exists ═══ */}
      {note && (
        <div className="mt-2 pl-3 border-l-2 border-blue-200">
          <p className="text-xs text-blue-800 leading-relaxed whitespace-pre-wrap line-clamp-3">
            {note}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── 辅助函数 ─────────────────────────────────────────────────

function formatDateLabel(dateStr: string): string {
  // ═══ DEFENSIVE: guard against invalid date strings ═══
  if (!dateStr || dateStr === "0000-00-00") return "未知时间";

  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr || "未知时间";

  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);

  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return "未知时间";

  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return "未知时间";

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) return "今天";

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return "昨天";

  const weekDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const weekDay = weekDays[date.getDay()] ?? "";
  return `${m} 月 ${d} 日 ${weekDay}`;
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0 || Number.isNaN(ms)) return "不到 1 分钟";

  const totalMinutes = Math.round(ms / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) return `${hours} 小时 ${minutes} 分钟`;
  if (hours > 0) return `${hours} 小时`;
  if (minutes > 0) return `${minutes} 分钟`;
  return "不到 1 分钟";
}
