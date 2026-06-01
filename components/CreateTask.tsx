"use client";

// ─── 创建任务 ─────────────────────────────────────────────────
// 简洁的行内输入，用于创建新任务。
// 包含「✨ AI 拆解」按钮（BYOK 模式）和「⚙️ 设置」入口。

import { useState, useRef, type FormEvent } from "react";
import { useStore } from "@/lib/store";
import BreakdownModal from "./BreakdownModal";
import SettingsModal from "./SettingsModal";

export default function CreateTask() {
  const [title, setTitle] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const createTask = useStore((s) => s.createTask);
  const openBreakdown = useStore((s) => s.openBreakdown);
  const openSettings = useStore((s) => s.openSettings);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createTask(trimmed);
      setTitle("");
      inputRef.current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAIBreakdown = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    openBreakdown(trimmed);
  };

  return (
    <>
      <div className="flex flex-col gap-2">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="你想推进什么任务？"
            className="input flex-1"
            disabled={isSubmitting}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={handleAIBreakdown}
            disabled={!title.trim()}
            className="btn-secondary shrink-0 text-sm"
            title="AI 辅助拆解任务"
          >
            ✨ AI 拆解
          </button>
          <button
            type="submit"
            disabled={!title.trim() || isSubmitting}
            className="btn-primary shrink-0"
          >
            + 新建任务
          </button>
        </form>

        {/* 设置入口 */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={openSettings}
            className="text-xs text-muted-light hover:text-accent transition-colors"
          >
            ⚙️ AI 设置
          </button>
        </div>
      </div>

      <BreakdownModal />
      <SettingsModal />
    </>
  );
}
