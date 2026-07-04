// ─── Kill process on port ───────────────────────────────────
// Cross-platform: Windows (netstat + taskkill) / Unix (lsof/fuser)
const { execSync } = require("child_process");

const port = process.argv[2] || "3000";

try {
  if (process.platform === "win32") {
    // Windows: netstat + taskkill
    const output = execSync(`netstat -ano | findstr :${port}`, {
      encoding: "utf-8",
      windowsHide: true,
    });
    const lines = output.trim().split(/\r?\n/);
    const killed = new Set();
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== "0" && !killed.has(pid)) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { windowsHide: true });
          killed.add(pid);
        } catch {}
      }
    }
    if (killed.size > 0) {
      console.log(`Killed ${killed.size} process(es) on port ${port}`);
    }
  } else {
    // Unix: try fuser first, then lsof
    try {
      execSync(`fuser -k ${port}/tcp 2>/dev/null`, { stdio: "ignore" });
    } catch {
      try {
        execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, {
          stdio: "ignore",
        });
      } catch {}
    }
  }
} catch {
  // No process on this port — that's fine
}

process.exit(0);
