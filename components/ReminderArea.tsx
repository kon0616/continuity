"use client";

// ─── 📌 待办提醒 ─────────────────────────────────────────────
// 持久提醒区域。数据来自 REMINDER_ADDED − REMINDER_CLEARED。
// 每个提醒卡片有「✅ 解决」按钮，点击后派发 REMINDER_CLEARED。

import { useStore } from "@/lib/store";

export default function ReminderArea() {
  const reminders = useStore((s) => s.reminders);
  const clearReminder = useStore((s) => s.clearReminder);

  if (!reminders || reminders.length === 0) return null;

  return (
    <section className="animate-fade-in">
      <h2 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <span>📌 待办提醒</span>
        <span className="bg-amber-100 text-amber-700 text-[10px] px-1.5 py-0.5 rounded-full font-normal">
          {reminders.length}
        </span>
      </h2>
      <div className="space-y-2">
        {reminders.map((r) => (
          <div
            key={r.id}
            className="card p-3 bg-amber-50/80 border border-amber-200/60
                       flex items-start justify-between gap-3
                       hover:bg-amber-50 transition-colors group"
          >
            <p className="text-sm text-amber-900 leading-relaxed flex-1">
              {r.content}
            </p>
            <button
              onClick={() => clearReminder(r.id)}
              className="shrink-0 text-xs text-amber-600 bg-amber-100 hover:bg-amber-200
                         rounded-lg px-2.5 py-1.5 transition-colors
                         opacity-0 group-hover:opacity-100 focus:opacity-100"
              title="标记为已解决"
            >
              ✅ 解决
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
