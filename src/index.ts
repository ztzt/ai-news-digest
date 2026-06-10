import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

import { FEEDS } from "./feeds.js";
import { parseAllFeeds } from "./parser.js";
import { filterByTime, sortByTime } from "./filter.js";
import { translateArticles } from "./translator.js";
import { aiSummarize } from "./ai-summarizer.js";
import { generateReport } from "./reporter.js";
import { startDaemon } from "./scheduler.js";

const OUTPUT_DIR = join(import.meta.dirname ?? process.cwd(), "..", "output");

/** 格式化日期用于文件名 */
function dateStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 核心流水线：抓取 → 过滤 → 排序 → 生成日报 → 写入文件 */
async function runPipeline(nextRunTime?: string): Promise<void> {
  // 1. 并行抓取所有数据源
  const feedResults = await parseAllFeeds(FEEDS);

  // 2. 报告各源抓取情况
  for (const result of feedResults) {
    if (result.error) {
      console.error(`⚠️  ${result.source} 抓取失败: ${result.error}`);
    } else {
      console.log(`✅ ${result.source}: 抓取 ${result.articles.length} 篇`);
    }
  }

  // 3. 合并所有文章
  const allArticles = feedResults.flatMap((r) => r.articles);
  console.log(`📥 合计抓取: ${allArticles.length} 篇`);

  // 4. 24小时过滤
  const filtered = filterByTime(allArticles, FEEDS);
  const removed = allArticles.length - filtered.length;
  if (removed > 0) {
    console.log(`🔍 过滤掉超过24小时的文章: ${removed} 篇`);
  }

  // 5. 按时间降序排序
  const sorted = sortByTime(filtered);

  // 5.3 AI 摘要（用 Claude 生成中文一句话总结）
  const summarized = await aiSummarize(sorted);

  // 5.5 翻译标题和摘要为中文（已 AI 摘要的自动跳过）
  console.log("🌐 正在翻译...");
  const translated = await translateArticles(summarized);
  const translatedCount = translated.filter((a) => a.titleZh).length;
  console.log(`🌐 翻译完成: ${translatedCount}/${translated.length} 篇`);

  // 6. 生成 Markdown 日报
  const report = generateReport(translated, { nextRunTime });

  // 7. 确保 output 目录存在
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 8. 写入文件
  const filename = `daily-ai-news-${dateStamp()}.md`;
  const filepath = join(OUTPUT_DIR, filename);
  writeFileSync(filepath, report, "utf-8");

  console.log(`\n📄 日报已生成: ${filepath}`);
  console.log(`📊 ${filtered.length} 篇文章已收录\n`);
}

/** 主函数 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDaemon = args.includes("--daemon");

  if (isDaemon) {
    // Daemon 模式：立即执行 + 每天9:00自动
    startDaemon(runPipeline);
  } else {
    // 单次执行（默认）
    console.log("📰 AI News Digest — 即时抓取\n");
    try {
      await runPipeline();
    } catch (err) {
      console.error("❌ 运行失败:", (err as Error)?.message ?? err);
      process.exit(1);
    }
  }
}

main();
