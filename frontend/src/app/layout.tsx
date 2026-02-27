import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { FaGithub, FaInstagram, FaLinkedinIn } from "react-icons/fa";
import ThemeToggle from "@/app/components/ThemeToggle";
import { getBackendStatus, incrementAndGetSiteViews } from "@/lib/api";
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [backendStatus, views] = await Promise.all([
    getBackendStatus(),
    incrementAndGetSiteViews(),
  ]);
  const isConnected = backendStatus === "connected";
  const year = new Date().getFullYear();
  const formattedViews = new Intl.NumberFormat("en-US").format(views);

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="site-header" aria-label="Primary site navigation">
          <div className="site-header-inner">
            <div className="brand">
              <img className="brand-logo" src="/logo.png" alt="Soheil Rajabali logo" />
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
            <span className="footer-item">(c) {year} Soheil Rajabali</span>
            <span className={`footer-item footer-status ${isConnected ? "footer-status-online" : "footer-status-offline"}`}>
              Backend Status: {isConnected ? "Connected" : "Disconnected"}
            </span>
            <span className="footer-item">Views: {formattedViews}</span>
            <span className="footer-item">git: main</span>
            <div className="footer-socials" aria-label="Social links">
              <a href="#" aria-label="GitHub">
                <FaGithub aria-hidden="true" />
              </a>
              <a href="#" aria-label="LinkedIn">
                <FaLinkedinIn aria-hidden="true" />
              </a>
              <a href="#" aria-label="Instagram">
                <FaInstagram aria-hidden="true" />
              </a>
            </div>
            <div className="footer-theme">
              <ThemeToggle />
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
