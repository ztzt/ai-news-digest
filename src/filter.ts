import type { Article, FeedConfig } from "./types.js";

/** 对需要进行时间过滤的源，只保留24小时内的文章 */
export function filterByTime(
  articles: Article[],
  configs: FeedConfig[],
): Article[] {
  const now = Date.now();
  const cutoff = now - 24 * 60 * 60 * 1000;

  // 构建需要过滤的来源集合
  const filterSources = new Set(
    configs.filter((c) => c.useTimeFilter).map((c) => c.source),
  );

  return articles.filter((article) => {
    // 不在过滤名单中的源（如 HN）全保留
    if (!filterSources.has(article.source)) return true;
    // 在过滤名单中的源，检查是否在24小时内
    return article.pubDate.getTime() >= cutoff;
  });
}

/** 按发布时间降序排序 */
export function sortByTime(articles: Article[]): Article[] {
  return [...articles].sort(
    (a, b) => b.pubDate.getTime() - a.pubDate.getTime(),
  );
}
