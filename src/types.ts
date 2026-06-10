/** 一篇文章 */
export interface Article {
  /** 文章标题 */
  title: string;
  /** 文章链接 */
  link: string;
  /** 发布时间 (Date 对象) */
  pubDate: Date;
  /** 来源名称，如 "TechCrunch AI" */
  source: string;
  /** 原始描述/摘要（可能为空） */
  description: string;
  /** 截取摘要前100字 */
  summary: string;
  /** 中文标题（翻译后） */
  titleZh: string;
  /** 中文摘要（翻译后） */
  summaryZh: string;
}

/** RSS 数据源配置 */
export interface FeedConfig {
  /** 数据源显示名称 */
  source: string;
  /** RSS feed URL */
  url: string;
  /** 是否启用24小时过滤 (HN 不启用) */
  useTimeFilter: boolean;
}
