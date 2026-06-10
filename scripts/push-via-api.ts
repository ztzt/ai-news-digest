/**
 * 通过 GitHub REST API 推送本地 git 仓库内容。
 * 带重试机制应对不稳定网络。
 * 用法: npx tsx scripts/push-via-api.ts
 */
import { execSync } from "node:child_process";

const OWNER = "ztzt";
const REPO = "ai-news-digest";
const BRANCH = "main";

function syncSleep(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* spin */ }
}

function ghApi(endpoint: string, stdin?: string, retries = 5): string {
  const ep = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
  const inputOpt = stdin ? "--input -" : "";
  const fullCmd = `gh api ${ep} ${inputOpt}`.trim();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = execSync(fullCmd, {
        input: stdin || undefined,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 30000,
      });
      return result;
    } catch (e: any) {
      const stderr = e.stderr?.toString() || e.message || "";
      if (attempt === retries) {
        throw new Error(`${fullCmd}\n${stderr}`);
      }
      const wait = Math.min(1000 * Math.pow(2, attempt - 1), 15000);
      process.stdout.write(`[重试${attempt}/${retries} ${wait / 1000}s] `);
      syncSleep(wait);
    }
  }
  throw new Error("unreachable");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function listTrackedFiles(): string[] {
  return execSync("git ls-files", { encoding: "utf-8" })
    .trim()
    .split("\n")
    .filter(Boolean);
}

function getFileContent(filePath: string): string {
  return execSync(`git show HEAD:${filePath}`, { encoding: "utf-8" });
}

async function main() {
  const files = listTrackedFiles();
  console.log(`📦 共 ${files.length} 个文件待推送\n`);

  // 1. 获取当前 main 分支的最新 commit
  console.log("🔍 获取远程 main 分支状态 ...");
  const refResp = ghApi(`repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`);
  const refData = JSON.parse(refResp);
  const baseCommitSha = refData.object.sha;
  console.log(`   commit: ${baseCommitSha.slice(0, 7)}\n`);

  // 2. 逐个创建 blob（带重试 + 间隔）
  console.log(`📤 创建 ${files.length} 个 blob ...\n`);
  const treeItems: { path: string; mode: string; type: string; sha: string }[] = [];

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    process.stdout.write(`  [${i + 1}/${files.length}] ${filePath} ... `);
    const content = getFileContent(filePath);
    const blobResp = ghApi(
      `repos/${OWNER}/${REPO}/git/blobs`,
      JSON.stringify({ content, encoding: "utf-8" }),
    );
    const sha = JSON.parse(blobResp).sha;
    treeItems.push({ path: filePath, mode: "100644", type: "blob", sha });
    console.log("✅");
    // 间隔 300ms，减轻 API 压力
    await sleep(300);
  }

  // 3. 创建 tree
  console.log("\n🌲 创建 tree ...");
  const treeResp = ghApi(
    `repos/${OWNER}/${REPO}/git/trees`,
    JSON.stringify({ tree: treeItems }),
  );
  const newTreeSha = JSON.parse(treeResp).sha;
  console.log(`   tree: ${newTreeSha.slice(0, 7)}`);

  // 4. 创建 commit
  console.log("\n📝 创建 commit ...");
  const commitResp2 = ghApi(
    `repos/${OWNER}/${REPO}/git/commits`,
    JSON.stringify({
      message:
        "Initial commit: AI News Digest with bilingual support and GitHub Pages deployment\n\n- 3 RSS sources: TechCrunch AI, The Verge AI, Hacker News\n- 24h time filter + Chinese translation via MyMemory API\n- Markdown + styled HTML output\n- GitHub Actions daily deployment to GitHub Pages\n- Daemon mode with node-cron",
      tree: newTreeSha,
      parents: [baseCommitSha],
    }),
  );
  const newCommitSha = JSON.parse(commitResp2).sha;
  console.log(`   commit: ${newCommitSha.slice(0, 7)}`);

  // 5. 更新 ref
  console.log("\n🔀 更新 refs/heads/main ...");
  ghApi(
    `repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`,
    JSON.stringify({ sha: newCommitSha, force: false }),
  );
  console.log("   ✅ 推送成功！");
  console.log(`\n🌐 https://github.com/${OWNER}/${REPO}`);
}

main().catch((err) => {
  console.error("\n❌ 失败:", err.message);
  process.exit(1);
});
