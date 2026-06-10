import type { FeedConfig } from "./types.js";

/** 三个数据源配置 */
export const FEEDS: FeedConfig[] = [
  {
    source: "TechCrunch AI",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    useTimeFilter: true,
  },
  {
    source: "The Verge AI",
    url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml",
    useTimeFilter: true,
  },
  {
    source: "Hacker News",
    url: "https://hnrss.org/newest?q=AI&count=30",
    useTimeFilter: false, // HN 30条全保留
  },
];
