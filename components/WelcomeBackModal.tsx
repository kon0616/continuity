"use client";

// ─── 昨日重现弹窗 ─────────────────────────────────────────────
// 每日首次打开时触发。用户记录遗留问题，每个问题生成
// 一个 REMINDER_ADDED 事件，持久显示在首页直到手动清除。

import { useState, useRef, useEffect, type FormEvent } from "react";
import { useStore } from "@/lib/store";

export default function WelcomeBackModal() {
  const welcomeBackOpen = useStore((s) => s.welcomeBackOpen);
  const welcomeBackNote = useStore((s) => s.welcomeBackNote);
  const setWelcomeBackNote = useStore((s) => s.setWelcomeBackNote);
  const submitWelcomeBackNotes = useStore((s) => s.submitWelcomeBackNotes);
  const closeWelcomeBack = useStore((s) => s.closeWelcomeBack);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (welcomeBackOpen && textareaRef.current) {
      const timeout = setTimeout(() => textareaRef.current?.focus(), 150);
      return () => clearTimeout(timeout);
    }
  }, [welcomeBackOpen]);

  if (!welcomeBackOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await submitWelcomeBackNotes();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-back-title"
    >
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={() => closeWelcomeBack()}
      />
      <div className="relative w-full max-w-lg mx-0 sm:mx-4 animate-slide-up">
        <div className="card p-6 sm:rounded-xl rounded-t-xl shadow-lg">
          <h2 id="welcome-back-title" className="text-base font-semibold text-gray-900 mb-1">
            👋 欢迎回来
          </h2>
          <p className="text-sm text-muted mb-4">
            有什么需要今天继续跟进的遗留问题吗？
          </p>

          <form onSubmit={handleSubmit}>
            <textarea
              ref={textareaRef}
              value={welcomeBackNote}
              onChange={(e) => setWelcomeBackNote(e.target.value)}
              placeholder={
                "例如：\n" +
                "• 昨天推导的公式忘了记下来，今天需要重新核对计算结果\n" +
                "• 等待运维回复 API 密钥申请\n" +
                "• 代码评审的反馈还没处理"
              }
              rows={4}
              className="textarea mb-3"
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-light mb-4">
              每行内容会生成一条 📌 待办提醒，显示在首页直到你手动标记完成。
            </p>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => closeWelcomeBack()}
                className="text-sm text-muted hover:text-gray-700 transition-colors"
                disabled={isSubmitting}
              >
                跳过
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary"
              >
                {welcomeBackNote.trim()
                  ? isSubmitting
                    ? "保存中…"
                    : "记录并开始今天的工作"
                  : "开始今天的工作"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
