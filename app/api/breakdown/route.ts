// ─── 无状态 AI 代理（坦克级坚固版）───────────────────────────
// 不读取环境变量。从前端接收 apiKey / baseURL / systemPrompt / taskName，
// 仅作为代理转发请求，解决浏览器 CORS 限制。

import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // ── 读取请求体 ──────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "请求体格式错误，需要 JSON" },
      { status: 400 }
    );
  }

  const apiKey = String(body?.apiKey ?? "").trim();
  const rawBaseURL = String(body?.baseURL ?? "https://api.deepseek.com/v1").trim();
  const systemPrompt = String(body?.systemPrompt ?? "").trim();
  const taskName = String(body?.taskName ?? "").trim();

  // ── 参数校验 ────────────────────────────────────────────────
  if (!apiKey) {
    return NextResponse.json(
      { error: "缺少 API Key — 请在设置（⚙️）中填写" },
      { status: 400 }
    );
  }
  if (!taskName) {
    return NextResponse.json(
      { error: "缺少任务名称" },
      { status: 400 }
    );
  }
  if (!systemPrompt) {
    return NextResponse.json(
      { error: "缺少 System Prompt" },
      { status: 400 }
    );
  }

  // ── URL 修正 ────────────────────────────────────────────────
  // 关键：无论前端传的是什么，确保最终 URL 以 /chat/completions 结尾，
  // 且不会出现重复拼接。
  const apiURL = buildChatCompletionsURL(rawBaseURL);
  console.log("[Breakdown Proxy] Target URL:", apiURL);

  // ── 构造 Payload ────────────────────────────────────────────
  const payload = {
    model: (body.model as string) ?? "deepseek-chat",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `请拆解以下任务：${taskName}` },
    ],
    temperature: (body.temperature as number) ?? 0.7,
    max_tokens: (body.maxTokens as number) ?? 800,
  };

  console.log(
    "[Breakdown Proxy] Request payload (masked):",
    JSON.stringify({ ...payload, messages: "[...]" }, null, 2)
  );

  // ── 调用大模型 API ──────────────────────────────────────────
  let response: Response;
  try {
    response = await fetch(apiURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (fetchError) {
    const msg =
      fetchError instanceof Error ? fetchError.message : String(fetchError);
    console.error("[Breakdown Proxy] Fetch error:", msg);
    return NextResponse.json(
      {
        error: `网络请求失败：${msg}。请检查 Base URL 是否正确（当前：${rawBaseURL}）。`,
      },
      { status: 502 }
    );
  }

  // ── 错误透传：读取真实错误信息并原样返回给前端 ──────────────
  if (!response.ok) {
    const status = response.status;
    const statusText = response.statusText;
    let rawBody = "";
    try {
      rawBody = await response.text();
    } catch {
      rawBody = "(无法读取响应体)";
    }

    console.error(
      `[Breakdown Proxy] API error ${status} ${statusText}:`,
      rawBody
    );

    // 尝试解析 API 返回的 JSON 错误
    let detail = rawBody;
    try {
      const errJson = JSON.parse(rawBody);
      if (errJson.error?.message) detail = errJson.error.message;
      else if (errJson.message) detail = errJson.message;
      else if (typeof errJson.error === "string") detail = errJson.error;
    } catch {
      // 不是 JSON — 用原始文本（截断过长内容）
      if (rawBody.length > 300) {
        detail = rawBody.slice(0, 300) + "…";
      }
    }

    const statusHint = STATUS_HINTS[status] ?? "";
    const fullError = `API 请求失败：${status} ${statusText}${statusHint ? "（" + statusHint + "）" : ""} — ${detail}`;

    return NextResponse.json({ error: fullError }, { status: 502 });
  }

  // ── 解析成功响应 ────────────────────────────────────────────
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    console.error("[Breakdown Proxy] Failed to parse response JSON");
    return NextResponse.json(
      { error: "AI 返回了非 JSON 格式的数据，请重试" },
      { status: 502 }
    );
  }

  console.log(
    "[Breakdown Proxy] Raw AI Response (choices omitted):",
    JSON.stringify({ model: (data as any)?.model, usage: (data as any)?.usage }, null, 2)
  );

  const rawContent: string =
    (data as any)?.choices?.[0]?.message?.content ?? "";

  console.log("[Breakdown Proxy] Raw AI Content:", rawContent);

  // ── 终极 JSON 提取 ──────────────────────────────────────────
  const subtasks = extractSubtasks(rawContent);

  if (subtasks.length === 0) {
    console.error(
      "[Breakdown Proxy] Failed to extract subtasks from content:",
      rawContent.slice(0, 500)
    );
    return NextResponse.json(
      {
        error:
          "AI 返回的内容无法解析为子任务列表。请尝试调整 System Prompt，要求 AI「严格返回 JSON 数组」。",
      },
      { status: 422 }
    );
  }

  console.log("[Breakdown Proxy] Extracted subtasks:", subtasks);
  return NextResponse.json({ subtasks });
}

// ─── URL 构造器 ───────────────────────────────────────────────

function buildChatCompletionsURL(raw: string): string {
  // 1. 去掉末尾斜杠
  let url = raw.replace(/\/+$/, "");

  // 2. 如果已经以 /chat/completions 结尾，不再拼接
  if (url.endsWith("/chat/completions")) {
    return url;
  }

  // 3. 如果以 /v1 结尾（DeepSeek 标准写法），直接拼 /chat/completions
  if (url.endsWith("/v1")) {
    return url + "/chat/completions";
  }

  // 4. 兜底：直接拼 /chat/completions
  return url + "/chat/completions";
}

// ─── 状态码友好提示 ───────────────────────────────────────────

const STATUS_HINTS: Record<number, string> = {
  401: "API Key 无效或已过期",
  403: "API Key 没有访问权限",
  404: "接口地址不存在，请检查 Base URL",
  429: "请求频率过高或余额不足",
  500: "大模型服务器内部错误",
  502: "大模型服务器网关错误",
  503: "大模型服务器暂时不可用",
};

// ─── 终极 JSON 提取器 ─────────────────────────────────────────
// 不信任大模型返回的任何格式。
// 使用 indexOf('[') / lastIndexOf(']') 截取纯数组部分。

function extractSubtasks(raw: string): string[] {
  if (!raw || raw.trim().length === 0) return [];

  const content = raw.trim();

  // ═══ 策略 1：indexOf / lastIndexOf 截取纯数组 ═══
  const startBracket = content.indexOf("[");
  const endBracket = content.lastIndexOf("]");

  if (startBracket !== -1 && endBracket !== -1 && endBracket > startBracket) {
    const arrayStr = content.slice(startBracket, endBracket + 1);
    console.log("[Extractor] Trying bracket extraction:", arrayStr.slice(0, 200));

    try {
      const parsed = JSON.parse(arrayStr);
      const result = flattenArray(parsed);
      if (result.length > 0) return result;
    } catch (e) {
      console.log("[Extractor] Bracket parse failed, trying cleaning...");
      const cleaned = arrayStr
        .replace(/\n/g, " ")
        .replace(/\r/g, "")
        .replace(/\t/g, " ")
        .replace(/\s+/g, " ");
      try {
        const parsed = JSON.parse(cleaned);
        const result = flattenArray(parsed);
        if (result.length > 0) return result;
      } catch {
        console.log("[Extractor] Cleaned parse also failed");
      }
    }
  }

  // ═══ 策略 2：去掉 markdown 代码块后再试 ═══
  const fenceRegex = /```(?:json|JSON)?\s*([\s\S]*?)```/;
  const fenceMatch = fenceRegex.exec(content);
  if (fenceMatch) {
    const inner = fenceMatch[1].trim();
    console.log("[Extractor] Trying fence extraction:", inner.slice(0, 200));
    try {
      const parsed = JSON.parse(inner);
      const result = flattenArray(parsed);
      if (result.length > 0) return result;
    } catch {
      // Try bracket extraction on the code block inner content
      return extractSubtasks(inner);
    }
  }

  // ═══ 策略 3：按行分割（最后兜底）════
  const lines = content
    .replace(/```[a-z]*\n?/gi, "")
    .split("\n")
    .map((l) =>
      l
        .replace(/^[\d]+[\.\)、]\s*/, "")
        .replace(/^[-*]\s*/, "")
        .replace(/^"|"$/g, "")
        .trim()
    )
    .filter(
      (l) =>
        l.length > 2 &&
        !l.startsWith("{") &&
        !l.startsWith("[") &&
        !l.startsWith("//") &&
        !l.startsWith("#") &&
        l !== "json"
    );

  if (lines.length > 0 && lines.length <= 10) {
    return lines;
  }

  return [];
}

// ─── 数组平坦化 ──────────────────────────────────────────────
// 处理两种 AI 返回格式：
//   ["任务1", "任务2"]           → 原样返回
//   [{"步骤": "任务1"}, {...}]   → 提取每个对象第一个属性的值

function flattenArray(parsed: unknown): string[] {
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item: unknown) => {
      // 字符串 → 直接返回
      if (typeof item === "string") return item.trim();
      // 对象 → 提取第一个属性的值
      if (typeof item === "object" && item !== null) {
        const vals = Object.values(item as Record<string, unknown>);
        const first = vals[0];
        if (typeof first === "string") return first.trim();
        if (typeof first === "number") return String(first);
      }
      return "";
    })
    .filter((s: string) => s.length > 0);
}
