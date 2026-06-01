"use client";

// ─── 新增长线规划弹窗 ─────────────────────────────────────────
// 在时间线页面触发。创建任务 + 手动排期，与专注面板分流。

import { useState, type FormEvent } from "react";
import { useStore } from "@/lib/store";

export default function PlanModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const createTask = useStore((s) => s.createTask);
  const scheduleTask = useStore((s) => s.scheduleTask);

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !startDate || isSubmitting) return;

    setIsSubmitting(true);
    try {
      // 1. 创建任务
      const taskId = await createTask(name.trim());
      // 2. 设定排期
      await scheduleTask(taskId, startDate, endDate || null);
      // 3. 清理关闭
      setName("");
      setEndDate("");
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="plan-title"
    >
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md mx-0 sm:mx-4 animate-slide-up">
        <div className="card p-6 sm:rounded-xl rounded-t-xl shadow-lg">
          <h2
            id="plan-title"
            className="text-base font-semibold text-gray-900 mb-4"
          >
            + 新增长线规划
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 项目名称 */}
            <div>
              <label htmlFor="plan-name" className="label">
                项目名称
              </label>
              <input
                id="plan-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：Q3 产品重构"
                className="input"
                autoFocus
                disabled={isSubmitting}
              />
            </div>

            {/* 日期 */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label htmlFor="plan-start" className="label">
                  开始日期
                </label>
                <input
                  id="plan-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input"
                  disabled={isSubmitting}
                />
              </div>
              <div className="flex-1">
                <label htmlFor="plan-end" className="label">
                  结束日期（可选）
                </label>
                <input
                  id="plan-end"
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <p className="text-xs text-muted-light">
              创建后任务会出现在专注面板中，你可以随时为它开启专注记录。
            </p>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-muted hover:text-gray-700 transition-colors"
                disabled={isSubmitting}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={!name.trim() || !startDate || isSubmitting}
                className="btn-primary"
              >
                {isSubmitting ? "创建中…" : "创建规划"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
