"use client";

// ─── 会话控制 ─────────────────────────────────────────────────
// 针对当前任务显示「开始专注」/「结束专注」按钮。
// 展示会话状态和已用时间。

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";

export default function SessionControls({ taskId }: { taskId: string }) {
  const task = useStore((s) => s.tasks.find((t) => t.taskId === taskId));
  const startSession = useStore((s) => s.startSession);
  const endSession = useStore((s) => s.endSession);
  const [isBusy, setIsBusy] = useState(false);

  const isActive = !!task?.currentSessionId;
  const currentSessionId = task?.currentSessionId ?? null;

  // 活跃会话的计时器
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setElapsed(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive]);

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h} 小时 ${m} 分钟`;
    if (m > 0) return `${m} 分钟 ${s} 秒`;
    return `${s} 秒`;
  };

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
          {/* 活跃会话指示器 */}
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="font-medium tabular-nums">
              {formatElapsed(elapsed)}
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
