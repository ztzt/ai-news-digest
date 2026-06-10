import type { Article } from "./types.js";

const MYMEMORY_API = "https://api.mymemory.translated.net/get";

/** 判断文本是否值得翻译（太短或纯 URL 的描述跳过） */
function isTranslatable(text: string): boolean {
  if (!text || text.length < 5) return false;
  // HN feed 的描述通常是 "Article URL: https://..." 格式，跳过
  if (/^Article URL:/.test(text)) return false;
  if (/^Comments URL:/.test(text)) return false;
  return true;
}

/** 调用 MyMemory API 翻译单条文本，失败返回空字符串 */
async function translateText(text: string): Promise<string> {
  if (!isTranslatable(text)) return "";

  try {
    const params = new URLSearchParams({
      q: text,
      langpair: "en|zh-CN",
    });
    const resp = await fetch(`${MYMEMORY_API}?${params}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return "";

    const data = (await resp.json()) as {
      responseData?: { translatedText?: string };
    };
    const translated = data?.responseData?.translatedText;
    return translated ? translated.trim() : "";
  } catch {
    return "";
  }
}

/**
 * 控制并发的翻译调度器。
 * 对 MyMemory 匿名 API 做并发限制，避免触发限流。
 */
async function translateWithConcurrency(
  items: { text: string; index: number }[],
  concurrency = 3,
): Promise<Map<number, string>> {
  const results = new Map<number, string>();
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++;
      const item = items[idx];
      const result = await translateText(item.text);
      results.set(item.index, result);
      // 请求间隔 200ms，避免限流
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // 启动 N 个并发 worker
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return results;
}

/** 翻译文章标题和摘要，返回扩展后的 Article 数组 */
export async function translateArticles(
  articles: Article[],
): Promise<Article[]> {
  // 构建待翻译文本列表 (标题 + 摘要)
  const titleTasks = articles.map((a, i) => ({
    text: a.title,
    index: i,
  }));
  const summaryTasks = articles
    .map((a, i) => ({ text: a.summary, index: i }))
    .filter((t) => isTranslatable(t.text));

  // 并发翻译（3个并发，间隔200ms）
  const [titleResults, summaryResults] = await Promise.all([
    translateWithConcurrency(titleTasks, 3),
    translateWithConcurrency(summaryTasks, 3),
  ]);

  // 合并结果
  return articles.map((article, i) => ({
    ...article,
    titleZh: titleResults.get(i) ?? "",
    summaryZh: summaryResults.get(i) ?? "",
  }));
}
