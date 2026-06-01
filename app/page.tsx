"use client";

// ─── 专注面板 ─────────────────────────────────────────────────
// 整个系统中最重要的屏幕。
//
// 展示内容：
//  • 📌 待办提醒（持久直到手动完成）
//  • 活跃任务及其完整上下文恢复
//  • 最近一条恢复线索（自动加载）
//  • 专注会话控制
//
// 为中断恢复和零摩擦重入而优化。

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import CreateTask from "@/components/CreateTask";
import TaskCard from "@/components/TaskCard";
import RestartNoteModal from "@/components/RestartNoteModal";
import WelcomeBackModal from "@/components/WelcomeBackModal";
import ReminderArea from "@/components/ReminderArea";

export default function TaskFocusScreen() {
  const initialize = useStore((s) => s.initialize);
  const tasks = useStore((s) => s.tasks);
  const isLoading = useStore((s) => s.isLoading);
  const resetAll = useStore((s) => s.resetAll);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const activeTasks = tasks.filter((t) => t.status === "active");
  const completedTasks = tasks.filter((t) => t.status === "completed");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-accent" />
          <p className="text-sm text-muted">加载中…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── 📌 待办提醒（顶部醒目区域）─────────────────────── */}
      <ReminderArea />

      {/* 页面标题 */}
      <section>
        <h1 className="text-lg font-semibold text-gray-900 mb-1">
          专注面板
        </h1>
        <p className="text-sm text-muted">
          选择任务，开始专注，暂停时留下恢复线索。
        </p>
      </section>

      {/* 创建新任务 */}
      <section>
        <CreateTask />
      </section>

      {/* 进行中任务 */}
      <section>
        <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
          进行中
          {activeTasks.length > 0 && (
            <span className="ml-1 text-muted-light font-normal">
              ({activeTasks.length})
            </span>
          )}
        </h2>

        {activeTasks.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-muted">
              暂无进行中的任务。在上方创建一个开始吧。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {activeTasks.map((task) => (
              <TaskCard key={task.taskId} taskId={task.taskId} />
            ))}
          </div>
        )}
      </section>

      {/* 已完成任务 */}
      {completedTasks.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
            已完成
            <span className="ml-1 text-muted-light font-normal">
              ({completedTasks.length})
            </span>
          </h2>
          <div className="space-y-3">
            {completedTasks.map((task) => (
              <TaskCard key={task.taskId} taskId={task.taskId} />
            ))}
          </div>
        </section>
      )}

      {/* 弹窗 */}
      <RestartNoteModal />
      <WelcomeBackModal />

      {/* 重置按钮 */}
      <div className="pt-8 flex justify-center">
        <button
          onClick={() => {
            if (confirm("确认删除所有本地数据？此操作不可撤销。")) {
              resetAll();
            }
          }}
          className="text-xs text-muted-light hover:text-red-500 transition-colors"
        >
          重置所有数据
        </button>
      </div>
    </div>
  );
}
