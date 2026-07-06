async function getCommitCountFromGitHub(owner: string, repo: string, branch: string): Promise<number | null> {
  try {
    const githubToken = process.env.GITHUB_TOKEN?.trim();
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1`,
      {
        next: { revalidate: 3600 },
        headers: {
          Accept: "application/vnd.github+json",
          ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
        },
      }
    );

    if (!res.ok) return null;

    const linkHeader = res.headers.get("link");
    if (linkHeader) {
      const match = linkHeader.match(/[?&]page=(\d+)>;\s*rel="last"/);
      if (match) {
        const pages = Number.parseInt(match[1], 10);
        return Number.isFinite(pages) ? pages : null;
      }
    }

    const commits = (await res.json()) as Array<unknown>;
    return Array.isArray(commits) ? commits.length : null;
  } catch {
    return null;
  }
}

async function getGitHubBranchCode(owner: string, repo: string, branch: string): Promise<string | null> {
  try {
    const githubToken = process.env.GITHUB_TOKEN?.trim();
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
      {
        next: { revalidate: 3600 },
        headers: {
          Accept: "application/vnd.github+json",
          ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
        },
      }
    );
    if (!res.ok) return null;

    const body = (await res.json()) as { commit?: { sha?: string } };
    const sha = body.commit?.sha?.trim();
    return sha ? sha.slice(0, 7) : null;
  } catch {
    return null;
  }
}

export type GitMeta = {
  branchCode: string;
  commitCount: number | null;
};

export async function getGitMeta(): Promise<GitMeta> {
  const { execSync } = await import("node:child_process");
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  const vercelRef = process.env.VERCEL_GIT_COMMIT_REF?.trim();
  const vercelOwner = process.env.VERCEL_GIT_REPO_OWNER?.trim() || "Squeakers99";
  const vercelRepo = process.env.VERCEL_GIT_REPO_SLUG?.trim() || "resume-website";
  const targetBranch = process.env.GITHUB_MAIN_BRANCH?.trim() || "main";

  try {
    const branchCode =
      vercelSha?.slice(0, 7) || execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    const commitCountRaw = execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim();
    const commitCount = Number.parseInt(commitCountRaw, 10);

    return {
      branchCode: branchCode || "N/A",
      commitCount: Number.isFinite(commitCount) ? commitCount : null,
    };
  } catch {
    const [githubBranchCode, githubCommitCount] = await Promise.all([
      getGitHubBranchCode(vercelOwner, vercelRepo, targetBranch),
      getCommitCountFromGitHub(vercelOwner, vercelRepo, targetBranch),
    ]);

    const fallbackBranch = githubBranchCode || vercelSha?.slice(0, 7) || vercelRef || "N/A";

    return {
      branchCode: fallbackBranch,
      commitCount: githubCommitCount,
    };
  }
}
