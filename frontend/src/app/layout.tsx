import type { Metadata } from "next";
import { execSync } from "node:child_process";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { FaCodeBranch, FaGithub, FaInstagram, FaLinkedinIn } from "react-icons/fa";
import ThemeToggle from "@/app/components/ThemeToggle";
import { getBackendStatus } from "@/lib/api";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Soheil Rajabali | Portfolio",
  description: "Portfolio website for Soheil Rajabali, mechatronics engineer and software developer.",
};

async function getCommitCountFromGitHub(owner: string, repo: string, branch: string): Promise<number | null> {
  try {
    const githubToken = process.env.GITHUB_TOKEN?.trim();
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=1`, {
      next: { revalidate: 3600 },
      headers: {
        Accept: "application/vnd.github+json",
        ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
      },
    });

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
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`, {
      next: { revalidate: 3600 },
      headers: {
        Accept: "application/vnd.github+json",
        ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
      },
    });
    if (!res.ok) return null;

    const body = (await res.json()) as { commit?: { sha?: string } };
    const sha = body.commit?.sha?.trim();
    return sha ? sha.slice(0, 7) : null;
  } catch {
    return null;
  }
}

async function getGitMeta() {
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  const vercelRef = process.env.VERCEL_GIT_COMMIT_REF?.trim();
  const vercelOwner = process.env.VERCEL_GIT_REPO_OWNER?.trim() || "Squeakers99";
  const vercelRepo = process.env.VERCEL_GIT_REPO_SLUG?.trim() || "resume-website";
  const targetBranch = process.env.GITHUB_MAIN_BRANCH?.trim() || "main";

  try {
    const branchCode = vercelSha?.slice(0, 7) || execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [backendStatus, gitMeta] = await Promise.all([
    getBackendStatus(),
    getGitMeta(),
  ]);
  const isConnected = backendStatus === "connected";
  const year = new Date().getFullYear();
  const formattedCommits =
    typeof gitMeta.commitCount === "number"
      ? new Intl.NumberFormat("en-US").format(gitMeta.commitCount)
      : "--";

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="site-header" aria-label="Primary site navigation">
          <div className="site-header-inner">
            <div className="brand">
              <span className="brand-logo-shell">
                <img className="brand-logo" src="/Logo.png" alt="Soheil Rajabali logo" />
              </span>
              <span className="brand-name">SOHEIL RAJABALI</span>
            </div>

            <nav aria-label="Main navigation">
              <ul className="nav-list">
                <li>
                  <Link href="/">Home</Link>
                </li>
                <li>
                  <Link href="/projects">Projects</Link>
                </li>
              </ul>
            </nav>
          </div>
        </header>

        <div className="site-main">{children}</div>

        <footer className="site-footer" aria-label="Site footer">
          <div className="site-footer-inner">
            <div className="footer-theme">
              <ThemeToggle />
            </div>
            <span className="footer-item" aria-label="GitHub branch code">
              <FaCodeBranch aria-hidden="true" style={{ marginRight: "0.35rem" }} />
              {gitMeta.branchCode}
            </span>
            <span className="footer-item">&#169; {year} Soheil Rajabali</span>
            <span className="footer-item">Commits: {formattedCommits}</span>
            <span className={`footer-item footer-status ${isConnected ? "footer-status-online" : "footer-status-offline"}`}>
              <span className="status-dot"/>
              {isConnected ? "Systems Operational" : "Systems Down"}
            </span>
            <div className="footer-socials" aria-label="Social links">
              <a href="https://github.com/Squeakers99" aria-label="GitHub">
                <FaGithub aria-hidden="true" />
              </a>
              <a href="https://www.linkedin.com/in/soheilrajabali/" aria-label="LinkedIn">
                <FaLinkedinIn aria-hidden="true" />
              </a>
              <a href="https://www.instagram.com/soheil.rajabali/" aria-label="Instagram">
                <FaInstagram aria-hidden="true" />
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
