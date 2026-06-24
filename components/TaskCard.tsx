"use client";

// ─── 任务卡片 ─────────────────────────────────────────────────
// 展示单个任务及其当前上下文。
// 包含手动排期（开始/结束日期选择器）、恢复线索、会话控制。

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { useTaskTotalTime } from "@/lib/hooks";
import SessionControls from "./SessionControls";

export default function TaskCard({ taskId }: { taskId: string }) {
  const task = useStore((s) => s.tasks.find((t) => t.taskId === taskId));
  const completeTask = useStore((s) => s.completeTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const scheduleTask = useStore((s) => s.scheduleTask);
  const addRetrospectiveNote = useStore((s) => s.addRetrospectiveNote);
  const selectTask = useStore((s) => s.selectTask);
  const selectedTaskId = useStore((s) => s.selectedTaskId);
  const sessionStartedAt = useStore((s) => s.sessionStartedAt);
  const activeSessionTaskId = useStore((s) => s.activeSession?.taskId);

  // Local date state
  const [startDate, setStartDate] = useState(task?.scheduledStartDate ?? "");
  const [endDate, setEndDate] = useState(task?.scheduledEndDate ?? "");
  // Retrospective note input for completed tasks
  const [showRetroInput, setShowRetroInput] = useState(false);
  const [retroNote, setRetroNote] = useState("");

  useEffect(() => {
    setStartDate(task?.scheduledStartDate ?? "");
    setEndDate(task?.scheduledEndDate ?? "");
  }, [task?.scheduledStartDate, task?.scheduledEndDate]);

  if (!task) return null;

  // Live total focus time — ticks every 60s when a session is active on this task
  const totalTime = useTaskTotalTime(
    task.totalFocusMs,
    !!task.currentSessionId && activeSessionTaskId === taskId
      ? sessionStartedAt
      : null
  );

  const isSelected = selectedTaskId === taskId;
  const isActive = !!task.currentSessionId;
  const isCompleted = task.status === "completed";
  const hasDates = !!startDate;

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    if (val) {
      scheduleTask(taskId, val, endDate || null);
    }
  };

  const handleEndDateChange = (val: string) => {
    setEndDate(val);
    if (startDate) {
      scheduleTask(taskId, startDate, val || null);
    }
  };

  return (
    <div
      className={`card p-5 transition-all cursor-pointer ${
        isSelected
          ? "ring-2 ring-accent/20 border-accent/30"
          : "hover:border-gray-200"
      } ${isCompleted ? "opacity-60" : ""}`}
      onClick={() => selectTask(taskId)}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3
            className={`text-sm font-semibold truncate ${
              isCompleted ? "text-gray-400 line-through" : "text-gray-900"
            }`}
          >
            {task.title}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            {isCompleted ? (
              <span className="badge-completed">已完成</span>
            ) : isActive ? (
              <span className="badge-active">专注中</span>
            ) : (
              <span className="badge-muted">
                {task.sessionCount > 0
                  ? `${task.sessionCount} 次专注`
                  : "未开始"}
              </span>
            )}
            {totalTime && (
              <span className="badge-muted">{totalTime}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isCompleted && (
            <button
              onClick={(e) => { e.stopPropagation(); completeTask(taskId); }}
              className="text-xs text-muted-light hover:text-gray-700 transition-colors"
              title="标记完成"
            >
              ✓ 完成
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`确认删除任务「${task.title}」？该操作不可撤销。`)) {
                deleteTask(taskId);
              }
            }}
            className="text-xs text-muted-light hover:text-red-500 transition-colors"
            title="删除任务"
          >
            🗑
          </button>
        </div>
      </div>

      {/* ── 手动排期 ──────────────────────────────────────── */}
      {!isCompleted && (
        <div
          className="mb-3 flex items-center gap-2 flex-wrap"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-xs text-muted-light shrink-0">📅</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => handleStartDateChange(e.target.value)}
            className="text-xs border border-gray-200 rounded-md px-2 py-1 text-gray-700
                       focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/10
                       bg-white hover:border-gray-300 transition-colors"
            title="开始日期"
          />
          <span className="text-xs text-muted-light">→</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => handleEndDateChange(e.target.value)}
            min={startDate || undefined}
            className="text-xs border border-gray-200 rounded-md px-2 py-1 text-gray-700
                       focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/10
                       bg-white hover:border-gray-300 transition-colors"
            title="结束日期（可选）"
          />
          {hasDates && (
            <button
              onClick={() => {
                setStartDate("");
                setEndDate("");
                scheduleTask(taskId, "", null);
              }}
              className="text-xs text-muted-light hover:text-red-500 transition-colors"
              title="清除日期"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* 最近恢复线索 — 核心连续性载体 */}
      {task.lastRestartNote && (
        <div className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-100">
          <p className="text-xs font-medium text-amber-800 mb-1">
            📋 最近恢复线索
          </p>
          <p className="text-sm text-amber-900 whitespace-pre-wrap line-clamp-3">
            {task.lastRestartNote}
          </p>
        </div>
      )}

      {/* ── 补充线索（仅已完成任务）────────────────────────── */}
      {isCompleted && (
        <div className="mb-3" onClick={(e) => e.stopPropagation()}>
          {!showRetroInput ? (
            <button
              onClick={() => setShowRetroInput(true)}
              className="text-xs text-muted-light hover:text-amber-600 transition-colors"
            >
              + 补充线索
            </button>
          ) : (
            <div className="flex gap-2 items-start">
              <textarea
                value={retroNote}
                onChange={(e) => setRetroNote(e.target.value)}
                placeholder="补充一点上下文…"
                rows={2}
                className="textarea text-xs flex-1"
                autoFocus
              />
              <div className="flex flex-col gap-1 shrink-0">
                <button
                  onClick={async () => {
                    if (!retroNote.trim()) return;
                    await addRetrospectiveNote(taskId, retroNote);
                    setRetroNote("");
                    setShowRetroInput(false);
                  }}
                  disabled={!retroNote.trim()}
                  className="text-xs btn-primary px-2 py-1"
                >
                  保存
                </button>
                <button
                  onClick={() => {
                    setShowRetroInput(false);
                    setRetroNote("");
                  }}
                  className="text-xs text-muted-light hover:text-gray-700 transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 会话控制 — 仅对未完成任务显示 */}
      {!isCompleted && (
        <div className="pt-3 divider" onClick={(e) => e.stopPropagation()}>
          <SessionControls taskId={taskId} />
        </div>
      )}
    </div>
  );
}
