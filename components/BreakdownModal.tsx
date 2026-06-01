"use client";

// ─── AI 拆解工作流（BYOK）─────────────────────────────────────
//
// 流程：
//  1. 用户点击「✨ AI 拆解」
//  2. 弹窗显示可编辑的 System Prompt + 任务名
//  3. 用户点击「生成拆解」→ 请求 API（通过无状态代理）
//  4. 返回结果以可编辑 <input> 列表展示
//  5. 用户修改/新增/删除后，勾选 → 确认生成
//  6. 每个选中的子任务独立 dispatch TASK_CREATED

import { useState } from "react";
import { useStore } from "@/lib/store";

export default function BreakdownModal() {
  const breakdownOpen = useStore((s) => s.breakdownOpen);
  const breakdownTitle = useStore((s) => s.breakdownTitle);
  const breakdownPrompt = useStore((s) => s.breakdownPrompt);
  const breakdownSubtasks = useStore((s) => s.breakdownSubtasks);
  const breakdownLoading = useStore((s) => s.breakdownLoading);
  const breakdownError = useStore((s) => s.breakdownError);
  const aiSettings = useStore((s) => s.aiSettings);

  const closeBreakdown = useStore((s) => s.closeBreakdown);
  const setBreakdownPrompt = useStore((s) => s.setBreakdownPrompt);
  const setBreakdownSubtasks = useStore((s) => s.setBreakdownSubtasks);
  const requestBreakdown = useStore((s) => s.requestBreakdown);
  const confirmBreakdown = useStore((s) => s.confirmBreakdown);

  // Local UI state for editable subtask list
  const [editableSubtasks, setEditableSubtasks] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isConfirming, setIsConfirming] = useState(false);

  if (!breakdownOpen) return null;

  // Sync API results into local editable state
  const hasResults = breakdownSubtasks.length > 0;

  const toggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const updateSubtask = (index: number, value: string) => {
    setEditableSubtasks((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const addSubtask = () => {
    setEditableSubtasks((prev) => [...prev, ""]);
  };

  const removeSubtask = (index: number) => {
    setEditableSubtasks((prev) => prev.filter((_, i) => i !== index));
    setSelected((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      });
      return next;
    });
  };

  const handleGenerate = async () => {
    setEditableSubtasks([]);
    setSelected(new Set());
    await requestBreakdown();
  };

  // After results arrive, populate editable list
  const displaySubtasks =
    editableSubtasks.length > 0 ? editableSubtasks : breakdownSubtasks;

  // Sync on results arrival
  if (hasResults && editableSubtasks.length === 0 && !breakdownLoading) {
    // Use setTimeout to avoid setState during render
    setTimeout(() => setEditableSubtasks([...breakdownSubtasks]), 0);
  }

  const handleConfirm = async () => {
    if (selected.size === 0 || isConfirming) return;
    setIsConfirming(true);
    try {
      // Use the editable subtasks for final dispatch
      const currentSubtasks =
        editableSubtasks.length > 0 ? editableSubtasks : breakdownSubtasks;

      // Temporarily update store subtasks to match editable version
      setBreakdownSubtasks(currentSubtasks);

      await confirmBreakdown(Array.from(selected));
      setEditableSubtasks([]);
      setSelected(new Set());
    } finally {
      setIsConfirming(false);
    }
  };

  const handleClose = () => {
    closeBreakdown();
    setEditableSubtasks([]);
    setSelected(new Set());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="breakdown-title"
    >
      {/* 遮罩层 */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* 弹窗面板 */}
      <div className="relative w-full max-w-xl mx-0 sm:mx-4 animate-slide-up max-h-[90vh] flex flex-col">
        <div className="card p-6 sm:rounded-xl rounded-t-xl shadow-lg overflow-y-auto">
          {/* 标题区 */}
          <div className="mb-4">
            <h2
              id="breakdown-title"
              className="text-base font-semibold text-gray-900"
            >
              ✨ AI 任务拆解
            </h2>
            <p className="text-sm text-muted mt-1">
              任务：<span className="font-medium text-gray-700">{breakdownTitle}</span>
            </p>
          </div>

          {/* ── Step 1: 可编辑的 System Prompt ──────────────── */}
          <div className="mb-4">
            <label htmlFor="breakdown-prompt" className="label">
              System Prompt（可针对当前任务临时修改）
            </label>
            <textarea
              id="breakdown-prompt"
              value={breakdownPrompt}
              onChange={(e) => setBreakdownPrompt(e.target.value)}
              rows={4}
              className="textarea text-xs"
              disabled={breakdownLoading}
            />
          </div>

          {/* ── Step 2: 生成按钮 + Loading ──────────────────── */}
          {!hasResults && (
            <div className="mb-4">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={breakdownLoading || !aiSettings.apiKey}
                className="btn-primary w-full"
              >
                {breakdownLoading ? "正在生成…" : "生成拆解"}
              </button>
              {!aiSettings.apiKey && (
                <p className="text-xs text-amber-600 mt-2 text-center">
                  ⚠️ 请先在设置（⚙️）中填写 API Key
                </p>
              )}
            </div>
          )}

          {/* ── Loading 状态 ────────────────────────────────── */}
          {breakdownLoading && (
            <div className="flex items-center justify-center py-6">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-accent" />
                <p className="text-sm text-muted">AI 正在分析任务…</p>
              </div>
            </div>
          )}

          {/* ── 错误提示 ────────────────────────────────────── */}
          {!breakdownLoading && breakdownError && (
            <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200">
              <p className="text-xs font-medium text-red-700 mb-1">请求失败</p>
              <p className="text-sm text-red-800 whitespace-pre-wrap leading-relaxed">
                {breakdownError}
              </p>
            </div>
          )}

          {/* ── Step 3: 可编辑的子任务列表 ──────────────────── */}
          {hasResults && !breakdownLoading && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="label mb-0">子任务列表（可编辑、新增、删除）</span>
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="text-xs text-accent hover:text-accent-hover transition-colors"
                >
                  重新生成
                </button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {displaySubtasks.map((subtask, index) => (
                  <div key={index} className="flex items-center gap-2">
                    {/* Checkbox */}
                    <label
                      className={`flex items-center gap-2 flex-1 p-2 rounded-lg cursor-pointer transition-colors ${
                        selected.has(index)
                          ? "bg-accent-light border border-accent/30"
                          : "bg-gray-50 border border-gray-100"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(index)}
                        onChange={() => toggle(index)}
                        className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent shrink-0"
                      />
                      <input
                        type="text"
                        value={subtask}
                        onChange={(e) => updateSubtask(index, e.target.value)}
                        className="flex-1 text-sm bg-transparent border-none outline-none text-gray-800"
                        placeholder="输入子任务…"
                      />
                    </label>
                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => removeSubtask(index)}
                      className="shrink-0 text-muted-light hover:text-red-500 transition-colors text-lg leading-none px-1"
                      title="删除此子任务"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              {/* Add new subtask */}
              <button
                type="button"
                onClick={addSubtask}
                className="mt-2 text-xs text-muted hover:text-accent transition-colors"
              >
                + 新增子任务
              </button>
            </div>
          )}

          {/* ── Step 4: 确认生成 ────────────────────────────── */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={handleClose}
              className="text-sm text-muted hover:text-gray-700 transition-colors"
              disabled={isConfirming}
            >
              取消
            </button>
            {hasResults && !breakdownLoading && (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={selected.size === 0 || isConfirming}
                className="btn-primary"
              >
                {isConfirming ? "生成中…" : `确认生成 (${selected.size})`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
