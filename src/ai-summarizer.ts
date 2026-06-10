import type { Article } from "./types.js";

const OLLAMA_API = "http://localhost:11434/api/generate";
const OLLAMA_MODEL = "qwen2.5:0.5b"; // 轻量，中文友好，够快

// 默认直连 Claude，如果设置了代理则走代理
const CLAUDE_API =
  process.env.ANTHROPIC_BASE_URL?.replace(/\/$/, "") + "/v1/messages" ??
  "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

const PROMPT = `用一句简洁的中文总结以下文章的核心内容（不超过50字）。只输出这句话，不要任何前缀或引号。

标题：{title}

内容：{description}`;

type Backend = "claude" | "ollama" | "fallback";

/** 自动检测可用的摘要后端 */
async function detectBackend(): Promise<Backend> {
  // 1. 优先 Claude API（支持 ANTHROPIC_API_KEY 和 ANTHROPIC_AUTH_TOKEN）
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) {
    return "claude";
  }

  // 2. 检测本地 Ollama
  try {
    const resp = await fetch("http://localhost:11434/api/tags", {
      signal: AbortSignal.timeout(3000),
    });
    if (resp.ok) return "ollama";
  } catch {
    // Ollama 未运行
  }

  return "fallback";
}

function needsAiSummary(article: Article): boolean {
  if (!article.description || article.description.length < 20) return false;
  if (/^Article URL:/.test(article.description)) return false;
  if (/^Comments URL:/.test(article.description)) return false;
  return true;
}

function buildPrompt(title: string, description: string): string {
  return PROMPT.replace("{title}", title).replace(
    "{description}",
    description.slice(0, 800),
  );
}

async function summarizeClaude(title: string, description: string): Promise<string> {
  const resp = await fetch(CLAUDE_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 256,
      temperature: 0.3,
      messages: [{ role: "user", content: buildPrompt(title, description) }],
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Claude ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await resp.json()) as {
    content?: { type: string; text: string; thinking?: string }[];
  };
  // DeepSeek 等模型返回 thinking block 在前，需要找 text block
  const textBlock = data?.content?.find((c) => c.type === "text");
  return (textBlock?.text ?? "").trim().replace(/^["']|["']$/g, "");
}

async function summarizeOllama(title: string, description: string): Promise<string> {
  const resp = await fetch(OLLAMA_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: buildPrompt(title, description),
      stream: false,
      options: { num_predict: 100, temperature: 0.3 },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!resp.ok) {
    throw new Error(`Ollama ${resp.status}`);
  }

  const data = (await resp.json()) as { response?: string };
  return (data.response ?? "").trim().replace(/^["']|["']$/g, "");
}

async function summarizeOne(
  title: string,
  description: string,
  backend: Backend,
): Promise<string> {
  switch (backend) {
    case "claude":
      return summarizeClaude(title, description);
    case "ollama":
      return summarizeOllama(title, description);
    default:
      return ""; // fallback: 用原始截取摘要
  }
}

export async function aiSummarize(articles: Article[]): Promise<Article[]> {
  const backend = await detectBackend();

  if (backend === "fallback") {
    console.log("💡 未检测到 ANTHROPIC_API_KEY 或本地 Ollama，使用原始摘要");
    console.log("   安装 Ollama: https://ollama.com 然后运行: ollama pull qwen2.5:0.5b\n");
    return articles;
  }

  const label = backend === "claude" ? "Claude API" : "Ollama (本地)";
  const toSummarize = articles.filter(needsAiSummary);
  if (toSummarize.length === 0) return articles;

  console.log(`🤖 AI 摘要 [${label}]: ${toSummarize.length} 篇待处理...`);

  let done = 0;
  const concurrency = backend === "ollama" ? 1 : 3; // Ollama 本地用单并发

  async function worker(): Promise<void> {
    while (done < toSummarize.length) {
      const idx = done++;
      const article = toSummarize[idx];
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const zh = await summarizeOne(article.title, article.description, backend);
          if (zh) {
            article.summary = zh;
            article.summaryZh = zh;
            process.stdout.write(`  ✅ [${idx + 1}/${toSummarize.length}] ${article.title.slice(0, 40)}...\n`);
          }
          break;
        } catch (err) {
          if (attempt === 3) {
            process.stdout.write(`  ❌ [${idx + 1}/${toSummarize.length}] ${(err as Error).message.slice(0, 60)}\n`);
          } else {
            await new Promise((r) => setTimeout(r, 2000));
          }
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const succeeded = toSummarize.filter((a) => a.summaryZh).length;
  console.log(`🤖 AI 摘要完成: ${succeeded}/${toSummarize.length} 篇\n`);
  return articles;
}
