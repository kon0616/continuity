"use client";

// ─── 设置弹窗 ─────────────────────────────────────────────────
// 允许用户配置自己的大模型 API Key / Base URL / System Prompt。
// 数据通过 Zustand + localStorage 持久化。

import { useState, type FormEvent } from "react";
import { useStore } from "@/lib/store";

export default function SettingsModal() {
  const settingsOpen = useStore((s) => s.settingsOpen);
  const aiSettings = useStore((s) => s.aiSettings);
  const updateAISettings = useStore((s) => s.updateAISettings);
  const closeSettings = useStore((s) => s.closeSettings);

  const [apiKey, setApiKey] = useState(aiSettings.apiKey);
  const [baseURL, setBaseURL] = useState(aiSettings.baseURL);
  const [systemPrompt, setSystemPrompt] = useState(aiSettings.systemPrompt);
  const [saved, setSaved] = useState(false);

  if (!settingsOpen) return null;

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    updateAISettings({ apiKey: apiKey.trim(), baseURL: baseURL.trim(), systemPrompt });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClose = () => {
    // Revert unsaved changes
    setApiKey(aiSettings.apiKey);
    setBaseURL(aiSettings.baseURL);
    setSystemPrompt(aiSettings.systemPrompt);
    closeSettings();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      {/* 遮罩层 */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="relative w-full max-w-lg mx-0 sm:mx-4 animate-slide-up">
        <div className="card p-6 sm:rounded-xl rounded-t-xl shadow-lg">
          <h2
            id="settings-title"
            className="text-base font-semibold text-gray-900 mb-4"
          >
            ⚙️ AI 设置（自带 Key）
          </h2>

          <form onSubmit={handleSave} className="space-y-4">
            {/* API Key */}
            <div>
              <label htmlFor="ai-api-key" className="label">
                API Key
              </label>
              <input
                id="ai-api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-xxxxxxxxxxxxxxxx"
                className="input"
                autoComplete="off"
              />
              <p className="text-xs text-muted-light mt-1">
                你的 Key 仅存储在浏览器本地，不会上传到任何服务器。
              </p>
            </div>

            {/* Base URL */}
            <div>
              <label htmlFor="ai-base-url" className="label">
                Base URL
              </label>
              <input
                id="ai-base-url"
                type="text"
                value={baseURL}
                onChange={(e) => setBaseURL(e.target.value)}
                placeholder="https://api.deepseek.com/v1"
                className="input"
                autoComplete="off"
              />
              <p className="text-xs text-muted-light mt-1">
                DeepSeek、OpenAI 或其他兼容接口地址。
              </p>
            </div>

            {/* System Prompt */}
            <div>
              <label htmlFor="ai-system-prompt" className="label">
                默认 System Prompt
              </label>
              <textarea
                id="ai-system-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={3}
                className="textarea"
              />
              <p className="text-xs text-muted-light mt-1">
                每次拆解任务时，这个 Prompt 会预填在对话框中，你可以针对具体任务临时调整。
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="text-sm text-muted hover:text-gray-700 transition-colors"
              >
                关闭
              </button>
              <button type="submit" className="btn-primary">
                {saved ? "✓ 已保存" : "保存设置"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
