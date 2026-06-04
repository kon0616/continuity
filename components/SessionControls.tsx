"use client";

// ─── 会话控制 ─────────────────────────────────────────────────
// 计时器基于绝对时间戳在后台静默运行。
// UI 不显示跳动的数字 — 避免时间焦虑，只展示一个温和的状态提示。

import { useState, useCallback } from "react";
import { useStore } from "@/lib/store";

export default function SessionControls({ taskId }: { taskId: string }) {
  const task = useStore((s) => s.tasks.find((t) => t.taskId === taskId));
  const startSession = useStore((s) => s.startSession);
  const endSession = useStore((s) => s.endSession);
  const [isBusy, setIsBusy] = useState(false);

  const isActive = !!task?.currentSessionId;
  const currentSessionId = task?.currentSessionId ?? null;

  const handleStart = useCallback(async () => {
    setIsBusy(true);
    try {
      await startSession(taskId);
    } finally {
      setIsBusy(false);
    }
  }, [taskId, startSession]);

  const handleEnd = useCallback(async () => {
    if (!currentSessionId) return;
    setIsBusy(true);
    try {
      await endSession(taskId, currentSessionId);
    } finally {
      setIsBusy(false);
    }
  }, [taskId, currentSessionId, endSession]);

  return (
    <div className="flex items-center gap-3">
      {isActive ? (
        <>
          {/* ── 温和状态提示，无跳动的数字 ──────────────────── */}
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-sm text-green-700/80 animate-pulse">
              ✨ 专注中...
            </span>
          </div>

          <button
            onClick={handleEnd}
            disabled={isBusy}
            className="btn-danger"
          >
            结束专注
          </button>
        </>
      ) : (
        <button
          onClick={handleStart}
          disabled={isBusy}
          className="btn-primary"
        >
          开始专注
        </button>
      )}
    </div>
  );
}
