import RssParser from "rss-parser";
import type { Article, FeedConfig } from "./types.js";

const rssParser = new RssParser({
  timeout: 30000, // 30秒超时
  headers: {
    "User-Agent": "AI-News-Digest/1.0 (news aggregator bot)",
    Accept: "application/rss+xml, application/xml, text/xml",
  },
});

/** 从原始文本中提取纯文本并截取前100字 */
function extractSummary(html: string): string {
  // 去掉 HTML 标签
  const plain = html
    .replace(/<[^>]*>/g, "")
    // 去掉多余空白
    .replace(/\s+/g, " ")
    .trim();
  // 截取前100字
  if (plain.length <= 100) return plain;
  // 尝试在100字内的最后一个完整单词/句子处截断
  const truncated = plain.slice(0, 100);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 60 ? truncated.slice(0, lastSpace) + "..." : truncated + "...";
}

/** 解析单个 RSS 数据源，返回 Article 数组 */
export async function parseFeed(config: FeedConfig): Promise<Article[]> {
  const feed = await rssParser.parseURL(config.url);

  const articles: Article[] = [];

  for (const item of feed.items ?? []) {
    // 跳过没有标题或链接的条目
    if (!item.title || !item.link) continue;

    // 解析发布时间，解析失败则使用当前时间
    const pubDate = item.pubDate
      ? new Date(item.pubDate)
      : new Date();

    // 提取原文描述
    const rawDescription =
      item.contentSnippet ??
      item.content ??
      item.description ??
      "";

    // 生成一句话摘要
    const summary = extractSummary(rawDescription);

    articles.push({
      title: item.title,
      link: item.link,
      pubDate,
      source: config.source,
      description: rawDescription,
      summary,
      titleZh: "",
      summaryZh: "",
    });
  }

  return articles;
}

/** 并行解析所有 RSS 数据源，容错处理 */
export async function parseAllFeeds(
  configs: FeedConfig[],
): Promise<{ source: string; articles: Article[]; error?: string }[]> {
  const results = await Promise.allSettled(
    configs.map((config) => parseFeed(config)),
  );

  return results.map((result, i) => {
    if (result.status === "fulfilled") {
      return {
        source: configs[i].source,
        articles: result.value,
      };
    }
    return {
      source: configs[i].source,
      articles: [],
      error: (result.reason as Error)?.message ?? String(result.reason),
    };
  });
}
