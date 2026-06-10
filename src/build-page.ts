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

    h1 {
      font-size: 1.8rem;
      margin-bottom: 0.5rem;
    }

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
  </style>
</head>
<body>
${body}
<footer>
  <p>🤖 AI News Digest — 每日自动更新 | 数据来源: TechCrunch AI · The Verge AI · Hacker News</p>
</footer>
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
  const md = readFileSync(mdPath, "utf-8");
  const body = mdToHtml(md);
  const html = fullPage(body);

  const htmlPath = join(OUTPUT_DIR, "index.html");
  writeFileSync(htmlPath, html, "utf-8");
  console.log(`✅ HTML 页面已生成: ${htmlPath}`);
}

main();
