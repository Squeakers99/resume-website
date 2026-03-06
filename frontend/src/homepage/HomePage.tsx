import { FaCodeBranch, FaGithub, FaInstagram, FaLinkedinIn } from "react-icons/fa";
import { getBackendStatus } from "@/lib/api";
import { getGitMeta } from "@/lib/git";
import "./homepage.css";

export default async function HomePage() {
  const [gitMeta, backendStatus] = await Promise.all([getGitMeta(), getBackendStatus()]);
  const isConnected = backendStatus === "connected";
  const formattedCommits =
    typeof gitMeta.commitCount === "number"
      ? new Intl.NumberFormat("en-US").format(gitMeta.commitCount)
      : "--";

  return (
    <main className="landing-shell">
      <section className="homepage-panel" aria-label="Homepage section">
        <div className="homepage-grid">
          <div className="homepage-copy">
            <p className="homepage-intro">
              <span className="typewriter-name" aria-label="Hi, I'm Soheil Rajabali">
                <span className="typewriter-text">Hi, I&apos;m Soheil Rajabali</span>
              </span>
            </p>
            <h1>Mechatronics Engineer &amp; Software Developer</h1>
            <p className="homepage-summary">
              I design and build mechanical, electrical, and software systems.
            </p>
            <p className="homepage-tags">Robotics - Automation - AI Systems - Full-Stack</p>

            <div className="homepage-actions">
              <a className="btn btn-primary" href="#projects">
                View Projects
              </a>
              <a className="btn btn-secondary" href="#resume">
                Download Resume
              </a>
            </div>

            <div className="homepage-socials" aria-label="Social links">
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

          <div className="homepage-visual" role="presentation">
            <div className="portrait-frame">
              <img
                src="/profile-picture.png"
                alt="Portrait of Soheil Rajabali"
                className="portrait-image"
              />
            </div>
            <div className="repo-stats-card" aria-label="Repository and system status">
              <div className="repo-stats-top">
                <div className="repo-stats-icon-wrap">
                  <FaCodeBranch aria-hidden="true" className="repo-stats-icon" />
                </div>
                <div className="repo-stats-git">
                  <div className="repo-branch-code" aria-label="GitHub branch code">
                    {"main-" + gitMeta.branchCode}
                  </div>
                  <div className="repo-commits-count">
                    {formattedCommits} Commits
                  </div>
                </div>
              </div>
              <div className="repo-stats-divider" aria-hidden="true" />
              <div className={`repo-stats-status ${isConnected ? "repo-stats-online" : "repo-stats-offline"}`}>
                <span className="repo-stats-dot" aria-hidden="true" />
                <span>{isConnected ? "Systems Operational" : "Systems Down"}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
