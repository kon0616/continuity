"use client";

// ─── 会话控制 ─────────────────────────────────────────────────
// 计时器基于绝对时间戳 (Date.now() - sessionStartedAt)，
// 浏览器切后台/冻结后恢复时时间依然准确。

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";

export default function SessionControls({ taskId }: { taskId: string }) {
  const task = useStore((s) => s.tasks.find((t) => t.taskId === taskId));
  const sessionStartedAt = useStore((s) => s.sessionStartedAt);
  const startSession = useStore((s) => s.startSession);
  const endSession = useStore((s) => s.endSession);
  const [isBusy, setIsBusy] = useState(false);

  const isActive = !!task?.currentSessionId;
  const currentSessionId = task?.currentSessionId ?? null;

  // ═══ Absolute-time elapsed counter ═══
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!isActive || !sessionStartedAt) {
      setElapsedMs(0);
      return;
    }

    // Tick at ~1s to update the display, but compute from absolute time
    const tick = () => {
      setElapsedMs(Math.max(0, Date.now() - sessionStartedAt));
    };
    tick(); // immediate first render
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [isActive, sessionStartedAt]);

  const formatElapsed = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
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
              {formatElapsed(elapsedMs)}
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
