import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUTPUT_DIR = join(import.meta.dirname ?? process.cwd(), "..", "output");

/** 找到 output/ 下最新的 .md 日报 */
function findLatestMd(): string | null {
  if (!existsSync(OUTPUT_DIR)) return null;
  const files = readdirSync(OUTPUT_DIR)
    .filter((f) => f.startsWith("daily-ai-news-") && f.endsWith(".md"))
    .sort()
    .reverse();
  return files.length > 0 ? join(OUTPUT_DIR, files[0]) : null;
}

/** 转义 HTML 实体 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 将单行 Markdown 内联语法转为 HTML
 * 处理: **bold**, [text](url), `code`
 * 保留已有的 HTML 标签 (<br>, <small> 等)
 */
function renderInline(md: string): string {
  let html = md;

  // 链接 [text](url)
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, text, url) =>
      `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${renderInline(text)}</a>`,
  );

  // 粗体 **text**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // 行内代码 `text`
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  return html;
}

/** 将 Markdown 日报内容转换为 HTML body */
function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const bodyParts: string[] = [];
  let inTable = false;

  for (const line of lines) {
    // 表格行
    if (line.startsWith("|")) {
      if (!inTable) {
        bodyParts.push('<div class="table-wrap"><table>');
        inTable = true;
      }

      const cells = line
        .split("|")
        .slice(1, -1) // 去掉首尾空元素
        .map((c) => c.trim());

      // 判断是否为表头分隔行 (|---|---|)
      if (/^:?-{3,}:?$/.test(cells[0] ?? "")) {
        continue;
      }

      const isHeader =
        cells.length >= 1 &&
        /^时间/.test(cells[0] ?? "") &&
        /^相对/.test(cells[1] ?? "");

      const tag = isHeader ? "th" : "td";
      const cellHtml = cells
        .map((cell) => `<${tag}>${renderInline(cell)}</${tag}>`)
        .join("");

      bodyParts.push(`<tr>${cellHtml}</tr>`);
      continue;
    }

    // 表格结束
    if (inTable) {
      bodyParts.push("</table></div>");
      inTable = false;
    }

    // 空行
    if (line.trim() === "") {
      bodyParts.push("");
      continue;
    }

    // 标题
    if (line.startsWith("# ")) {
      bodyParts.push(`<h1>${renderInline(line.slice(2))}</h1>`);
      continue;
    }

    // 分隔线
    if (line.trim() === "---") {
      bodyParts.push("<hr>");
      continue;
    }

    // 引用
    if (line.startsWith("> ")) {
      bodyParts.push(`<blockquote>${renderInline(line.slice(2))}</blockquote>`);
      continue;
    }

    // 普通段落
    bodyParts.push(`<p>${renderInline(line)}</p>`);
  }

  // 如果表格在文件末尾
  if (inTable) {
    bodyParts.push("</table></div>");
  }

  return bodyParts.join("\n");
}

/** 完整的 HTML 模板 */
function fullPage(body: string): string {
  const repo = "ztzt/ai-news-digest";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🤖 AI 新闻日报</title>
  <style>
    :root {
      --bg: #ffffff;
      --text: #1a1a2e;
      --text-secondary: #555;
      --border: #e0e0e0;
      --accent: #2563eb;
      --tag-bg: #eff6ff;
      --tag-text: #1e40af;
      --row-hover: #f8fafc;
      --blockquote-bg: #f0fdf4;
      --blockquote-border: #22c55e;
      --hr-color: #e5e7eb;
      --code-bg: #f1f5f9;
      --btn-bg: #2563eb;
      --btn-text: #fff;
      --btn-hover: #1d4ed8;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f172a;
        --text: #e2e8f0;
        --text-secondary: #94a3b8;
        --border: #334155;
        --accent: #60a5fa;
        --tag-bg: #1e3a5f;
        --tag-text: #93c5fd;
        --row-hover: #1e293b;
        --blockquote-bg: #0f2d1a;
        --blockquote-border: #4ade80;
        --hr-color: #334155;
        --code-bg: #1e293b;
        --btn-bg: #3b82f6;
        --btn-text: #fff;
        --btn-hover: #2563eb;
      }
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 1.5rem;
      max-width: 1100px;
      margin: 0 auto;
    }

    .header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-bottom: 0.25rem;
    }

    h1 { font-size: 1.8rem; }

    hr {
      border: none;
      border-top: 1px solid var(--hr-color);
      margin: 1.5rem 0;
    }

    blockquote {
      background: var(--blockquote-bg);
      border-left: 4px solid var(--blockquote-border);
      padding: 0.6rem 1rem;
      margin: 1rem 0;
      border-radius: 0 6px 6px 0;
      color: var(--text-secondary);
    }

    p {
      margin: 0.3rem 0;
      color: var(--text-secondary);
    }

    a {
      color: var(--accent);
      text-decoration: none;
    }
    a:hover { text-decoration: underline; }

    code {
      background: var(--code-bg);
      padding: 0.15em 0.4em;
      border-radius: 4px;
      font-size: 0.85em;
    }

    .table-wrap {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      margin: 1rem 0;
      border: 1px solid var(--border);
      border-radius: 8px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.92rem;
      min-width: 700px;
    }

    th {
      background: var(--code-bg);
      text-align: left;
      padding: 0.7rem 0.8rem;
      font-weight: 600;
      white-space: nowrap;
      border-bottom: 2px solid var(--border);
    }

    td {
      padding: 0.7rem 0.8rem;
      border-bottom: 1px solid var(--border);
      vertical-align: top;
    }

    tr:hover td { background: var(--row-hover); }

    td:first-child, th:first-child { white-space: nowrap; font-variant-numeric: tabular-nums; }
    td:nth-child(2), th:nth-child(2) { white-space: nowrap; color: var(--text-secondary); }
    td:nth-child(4), th:nth-child(4) { white-space: nowrap; }

    td small {
      display: block;
      color: var(--text-secondary);
      margin-top: 2px;
      line-height: 1.5;
    }

    footer {
      text-align: center;
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--hr-color);
      color: var(--text-secondary);
      font-size: 0.85rem;
    }

    /* 刷新按钮 */
    #refresh-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0.5rem 1rem;
      font-size: 0.9rem;
      font-weight: 500;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      background: var(--btn-bg);
      color: var(--btn-text);
      transition: opacity 0.2s, transform 0.2s;
      white-space: nowrap;
    }
    #refresh-btn:hover:not(:disabled) { opacity: 0.9; transform: scale(1.02); }
    #refresh-btn:disabled { opacity: 0.6; cursor: not-allowed; }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    #refresh-btn .spinner {
      display: none;
      width: 16px; height: 16px;
      border: 2px solid rgba(255,255,255,.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    #refresh-btn.loading .spinner { display: inline-block; }
    #refresh-btn.loading .btn-icon { display: none; }

    #hint-text {
      display: none;
      margin-top: 0.25rem;
      font-size: 0.8rem;
      color: var(--text-secondary);
    }
  </style>
</head>
<body>

<div class="header-row">
  <h1>🤖 AI 新闻日报</h1>
  <div style="text-align:right">
    <button id="refresh-btn" title="实时更新">
      <span class="btn-icon">🔄</span>
      <span class="spinner"></span>
      <span class="btn-text">刷新</span>
    </button>
    <div id="hint-text"></div>
  </div>
</div>

${body}

<footer>
  <p>🤖 AI News Digest — 每日自动更新 | 数据来源: TechCrunch AI · The Verge AI · Hacker News</p>
</footer>

<script>
(function() {
  const REPO = "${repo}";
  const DISPATCH_URL = "https://github.com/" + REPO + "/actions/workflows/deploy.yml";
  const POLL_INTERVAL = 10000; // 每 10 秒轮询

  const btn = document.getElementById("refresh-btn");
  const hintEl = document.getElementById("hint-text");
  const textEl = btn.querySelector(".btn-text");

  // 记录当前页面生成时间 (从页面内容解析)
  const timeMatch = document.body.innerText.match(/(\\d{2}:\\d{2})\\s+CST/);
  const pageTime = timeMatch ? timeMatch[1] : "";

  // 轮询检查是否有新的成功部署
  async function checkForUpdate() {
    try {
      const res = await fetch(
        "https://api.github.com/repos/" + REPO + "/actions/runs?event=workflow_dispatch&status=success&per_page=1"
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.workflow_runs.length) return null;
      return data.workflow_runs[0];
    } catch {
      return null;
    }
  }

  function setState(cls, text, hint) {
    btn.className = cls || "";
    textEl.textContent = text;
    if (hintEl) hintEl.textContent = hint || "";
    if (hintEl) hintEl.style.display = hint ? "block" : "none";
    btn.disabled = cls !== "";
  }

  btn.addEventListener("click", async () => {
    if (btn.disabled) return;

    // 1. 打开 dispatch 页面让用户触发
    window.open(DISPATCH_URL, "_blank", "noopener");

    // 2. 记录触发前的最近一次成功 run
    const prevRun = await checkForUpdate();
    const prevRunId = prevRun ? prevRun.id : null;

    // 3. 开始轮询
    setState("loading", "等待触发…", "请在打开的页面点击 Run workflow");
    let attempts = 0;
    const maxAttempts = 36; // 最多等 6 分钟

    const poll = setInterval(async () => {
      attempts++;
      const latest = await checkForUpdate();

      if (latest && latest.id !== prevRunId) {
        // 新的成功 run 出现了
        const runTime = new Date(latest.run_started_at);
        // 确认是本次触发的（5 分钟内启动的）
        const ageMs = Date.now() - runTime.getTime();
        if (ageMs < 10 * 60 * 1000) {
          clearInterval(poll);
          setState("", "✅ 刷新中…", "");
          setTimeout(() => location.reload(), 1000);
          return;
        }
      }

      if (attempts >= maxAttempts) {
        clearInterval(poll);
        setState("", "超时", "请手动刷新页面或重试");
        return;
      }

      // 更新状态提示
      const mins = Math.floor(attempts * POLL_INTERVAL / 60000);
      if (attempts < 3) {
        setState("loading", "等待中…", "请在打开的页面点击 Run workflow");
      } else {
        setState("loading", "抓取中…", "已等待 " + mins + " 分钟…");
      }
    }, POLL_INTERVAL);
  });
})();
</script>
</body>
</html>`;
}

/** 主函数 */
function main(): void {
  const mdPath = findLatestMd();
  if (!mdPath) {
    console.error("❌ 未找到日报 Markdown 文件，请先运行 npm start");
    process.exit(1);
  }

  console.log(`📄 读取日报: ${mdPath}`);
  let md = readFileSync(mdPath, "utf-8");
  // 去掉第一行 h1 标题，因为模板已内置
  md = md.replace(/^# .*\n/, "");
  const body = mdToHtml(md);
  const html = fullPage(body);

  const htmlPath = join(OUTPUT_DIR, "index.html");
  writeFileSync(htmlPath, html, "utf-8");
  console.log(`✅ HTML 页面已生成: ${htmlPath}`);
}

main();
