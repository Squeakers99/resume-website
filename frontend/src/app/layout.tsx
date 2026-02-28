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

function getGitMeta() {
  try {
    const branchCode = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    const commitCountRaw = execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim();
    const commitCount = Number.parseInt(commitCountRaw, 10);

    return {
      branchCode: branchCode || "N/A",
      commitCount: Number.isFinite(commitCount) ? commitCount : 0,
    };
  } catch {
    return {
      branchCode: "N/A",
      commitCount: 0,
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
    Promise.resolve(getGitMeta()),
  ]);
  const isConnected = backendStatus === "connected";
  const year = new Date().getFullYear();
  const formattedCommits = new Intl.NumberFormat("en-US").format(gitMeta.commitCount);

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="site-header" aria-label="Primary site navigation">
          <div className="site-header-inner">
            <div className="brand">
              <span className="brand-logo-shell">
                <img className="brand-logo" src="/logo.png" alt="Soheil Rajabali logo" />
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
