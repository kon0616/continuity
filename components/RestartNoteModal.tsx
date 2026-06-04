"use client";

// ─── 恢复线索弹窗 ─────────────────────────────────────────────
// 在结束专注后出现。恢复线索是整个系统中最关键的
// 连续性载体 —— 它精确记录了下一个接手者（未来的你）
// 需要知道什么才能无缝恢复工作。

import { useState, useRef, useEffect, type FormEvent } from "react";
import { useStore } from "@/lib/store";

export default function RestartNoteModal() {
  const isOpen = useStore((s) => s.isRestartNoteModalOpen);
  const pendingEndSession = useStore((s) => s.pendingEndSession);
  const tasks = useStore((s) => s.tasks);
  const fileRestartNote = useStore((s) => s.fileRestartNote);
  const closeRestartNoteModal = useStore((s) => s.closeRestartNoteModal);

  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const task = pendingEndSession
    ? tasks.find((t) => t.taskId === pendingEndSession.taskId)
    : null;

  // 弹窗打开时自动聚焦文本框
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      const timeout = setTimeout(() => {
        textareaRef.current?.focus();
      }, 150);
      return () => clearTimeout(timeout);
    }
  }, [isOpen]);

  if (!isOpen || !pendingEndSession) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!note.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await fileRestartNote(note.trim());
      setNote("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    closeRestartNoteModal();
    setNote("");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restart-note-title"
    >
      {/* 遮罩层 */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={handleSkip}
      />

      {/* 弹窗面板 — 移动端从底部滑入 */}
      <div className="relative w-full max-w-lg mx-0 sm:mx-4 animate-slide-up">
        <div className="card p-6 sm:rounded-xl rounded-t-xl shadow-lg">
          {/* 标题区 */}
          <div className="mb-4">
            <h2
              id="restart-note-title"
              className="text-base font-semibold text-gray-900"
            >
              留下恢复上下文的线索
            </h2>
            {task && (
              <p className="text-sm text-muted mt-0.5">
                任务：{task.title}
              </p>
            )}

            {/* ── 结算正向反馈 ──────────────────────────────── */}
            {pendingEndSession.durationMs > 0 && (
              <div className="mt-3 p-3 rounded-lg bg-green-50 border border-green-200">
                <p className="text-sm font-medium text-green-800">
                  🌟 辛苦了！本次深度专注持续了{" "}
                  {formatDuration(pendingEndSession.durationMs)}。
                </p>
              </div>
            )}

            <p className="text-sm text-muted mt-2">
              这段线索能帮助你自己（或其他人）在将来恢复这个任务时
              立刻理解上下文。下一个接手者最需要知道什么？
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <label htmlFor="restart-note-input" className="label">
              你进行到哪一步了？
            </label>
            <textarea
              ref={textareaRef}
              id="restart-note-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                "例如：\n" +
                "• 重构进行到一半：已抽取 UserService，还需更新所有调用方\n" +
                "• 登录 bug 已修复，接下来补写测试\n" +
                "• 阻塞中：等待运维给 API 密钥"
              }
              rows={5}
              className="textarea mb-4"
              disabled={isSubmitting}
            />

            {/* 快捷填入提示 */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {QUICK_NOTES.map((quick) => (
                <button
                  key={quick}
                  type="button"
                  onClick={() => setNote((prev) => prev + (prev ? " " : "") + quick)}
                  className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600
                             hover:bg-gray-200 transition-colors"
                >
                  + {quick}
                </button>
              ))}
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleSkip}
                className="text-sm text-muted hover:text-gray-700 transition-colors"
                disabled={isSubmitting}
              >
                跳过（不推荐）
              </button>
              <button
                type="submit"
                disabled={!note.trim() || isSubmitting}
                className="btn-primary"
              >
                {isSubmitting ? "保存中…" : "保存线索"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── 格式化时长 ─────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h} 小时 ${m} 分钟`;
  if (h > 0) return `${h} 小时`;
  if (m > 0) return `${m} 分钟`;
  return "不到 1 分钟";
}

// 恢复线索快捷填入提示
const QUICK_NOTES = [
  "进行中：",
  "下一步：",
  "阻塞原因：",
  "刚完成：",
  "决策备忘：",
];
