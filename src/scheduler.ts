import cron from "node-cron";

export type NewsPipeline = (nextRunTime?: string) => Promise<void>;

/**
 * 简单的 cron 下次运行时间计算器
 * 支持 "M H * * *" 格式（分钟 小时）
 */
function getNextCronTime(expr: string, from = new Date()): Date {
  const parts = expr.trim().split(/\s+/);
  const minute = parseInt(parts[0], 10);
  const hour = parseInt(parts[1], 10);

  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setMinutes(minute);
  next.setHours(hour);

  // 如果今天这个时刻已经过了，移到明天
  if (next <= from) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

/** 格式化日期为 YYYY-MM-DD HH:MM */
function formatNextRun(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}`;
}

/**
 * 启动 daemon 模式：立即执行一次，之后按 cron 表达式定时运行
 * @param pipeline 执行日报生成的函数
 * @param cronExpr cron 表达式，默认 "0 9 * * *" (每天9:00)
 * @returns cron 任务对象，可用于停止
 */
export function startDaemon(
  pipeline: NewsPipeline,
  cronExpr = "0 9 * * *",
): cron.ScheduledTask {
  console.log(`🕐 定时模式已启动 (cron: "${cronExpr}"，时区: 本地)`);

  // 定时调度
  const task = cron.schedule(cronExpr, async () => {
    console.log(`\n⏰ 定时触发 [${new Date().toLocaleString()}]`);
    try {
      const nextRunStr = formatNextRun(getNextCronTime(cronExpr));
      await pipeline(nextRunStr);
    } catch (err) {
      console.error("定时抓取出错:", (err as Error)?.message ?? err);
    }
  });

  // 计算下次运行时间
  const nextRun = getNextCronTime(cronExpr);
  console.log(`📬 下次运行: ${nextRun.toLocaleString()}`);

  // 立即执行一次
  console.log("📥 立即执行第一次抓取...\n");
  pipeline(formatNextRun(nextRun)).catch((err) => {
    console.error("首次抓取出错:", (err as Error)?.message ?? err);
  });

  console.log("✅ Daemon 运行中，按 Ctrl+C 退出\n");

  return task;
}
